/**
 * Ship tracking route handlers.
 *
 * GET /api/ship-tracking/vessels        — all vessels in Portsmouth Harbour (60s TTL)
 * GET /api/ship-tracking/vessel/:mmsi   — single vessel extended detail (5min TTL)
 *
 * Primary provider:  VesselFinder  (VESSELFINDER_API_KEY)
 * Backup provider:   MyShipTracking (MYSHIPTRACKING_API_KEY) — used only when primary
 *                    key is configured AND primary fetch fails or returns no data.
 */

import { Router, Request, Response } from 'express';
import * as ais from '../services/aisstream';
import * as vf  from '../services/vesselfinder';
import * as mst from '../services/myshiptracking';
import { type NormalisedVessel, type NormalisedVesselDetail } from '../services/shipTypes';
import { DiskCache, DiskCacheEntry, trackRequest, isRateLimited, requestCount } from '../services/diskCache';

const router = Router();

// ---------------------------------------------------------------------------
// Cache instances
// ---------------------------------------------------------------------------

const VESSELS_TTL_MS      = 60 * 1000;       // 60 seconds
const VESSEL_DETAIL_TTL_MS = 5 * 60 * 1000;  // 5 minutes

const vesselsCache      = new DiskCache<NormalisedVessel[]>('ship-vessels');
const vesselDetailCache = new DiskCache<NormalisedVesselDetail>('ship-vessel-detail');

const VESSELS_CACHE_KEY = 'vessels-list';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface VesselsResponse {
  vessels: NormalisedVessel[];
  fetchedAt: string;
  count: number;
  provider?: string;
  isStale?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Provider helpers
// ---------------------------------------------------------------------------

/** Try AISStream → VesselFinder → MyShipTracking. */
async function fetchVesselsWithFallback(): Promise<{ vessels: NormalisedVessel[]; provider: string }> {
  const aisKey = process.env['AISSTREAM_API_KEY']      ?? '';
  const vfKey  = process.env['VESSELFINDER_API_KEY']   ?? '';
  const mstKey = process.env['MYSHIPTRACKING_API_KEY'] ?? '';

  // Primary: AISStream (in-memory — no HTTP call)
  if (aisKey && aisKey !== 'your_key_here') {
    const vessels = ais.getVessels();
    if (vessels.length > 0) return { vessels, provider: 'aisstream' };

    // AISStream is configured — fall through to HTTP providers only if one exists.
    // If no HTTP provider is available, return empty rather than throwing: the stream
    // is either warming up (cold start) or the area is genuinely quiet right now.
    const hasHttpFallback =
      (vfKey && vfKey !== 'your_key_here') ||
      (mstKey && mstKey !== 'your_key_here');

    if (!hasHttpFallback) {
      const reason = ais.isConnected() ? 'warming up — no vessels received yet' : 'connecting…';
      console.warn(`[shipTracking] AISStream ${reason}`);
      return { vessels: [], provider: 'aisstream' };
    }

    console.warn(`[shipTracking] AISStream has 0 vessels — trying HTTP fallback`);
  }

  // Secondary: VesselFinder (HTTP, paid)
  if (vfKey && vfKey !== 'your_key_here') {
    try {
      const vessels = await vf.fetchVesselsInZone(vfKey);
      if (vessels.length > 0) return { vessels, provider: 'vesselfinder' };
      console.warn('[shipTracking] VesselFinder returned 0 vessels — trying next fallback');
    } catch (err) {
      console.warn('[shipTracking] VesselFinder fetch failed:', (err as Error).message);
    }
  }

  // Backup: MyShipTracking (HTTP, paid)
  if (mstKey && mstKey !== 'your_key_here') {
    const vessels = await mst.fetchVesselsInZone(mstKey);
    return { vessels, provider: 'myshiptracking' };
  }

  throw new Error('No ship-tracking API key configured (set AISSTREAM_API_KEY, VESSELFINDER_API_KEY, or MYSHIPTRACKING_API_KEY)');
}

/** Try AISStream → VesselFinder → MyShipTracking. */
async function fetchDetailWithFallback(mmsi: string): Promise<{ detail: NormalisedVesselDetail; provider: string }> {
  const aisKey = process.env['AISSTREAM_API_KEY']      ?? '';
  const vfKey  = process.env['VESSELFINDER_API_KEY']   ?? '';
  const mstKey = process.env['MYSHIPTRACKING_API_KEY'] ?? '';

  // Primary: AISStream (in-memory)
  if (aisKey && aisKey !== 'your_key_here') {
    const detail = ais.getVesselDetail(mmsi);
    if (detail) return { detail, provider: 'aisstream' };
  }

  // Secondary: VesselFinder
  if (vfKey && vfKey !== 'your_key_here') {
    try {
      const detail = await vf.fetchVesselDetail(mmsi, vfKey);
      return { detail, provider: 'vesselfinder' };
    } catch (err) {
      console.warn(`[shipTracking] VesselFinder detail failed for ${mmsi}:`, (err as Error).message);
    }
  }

  // Backup: MyShipTracking
  if (mstKey && mstKey !== 'your_key_here') {
    const detail = await mst.fetchVesselDetail(mmsi, mstKey);
    return { detail, provider: 'myshiptracking' };
  }

  throw new Error('No ship-tracking API key configured');
}

// ---------------------------------------------------------------------------
// Route: GET /api/ship-tracking/vessels
// ---------------------------------------------------------------------------

router.get('/vessels', async (_req: Request, res: Response): Promise<void> => {
  trackRequest('ship:vessels');

  const aisKey = process.env['AISSTREAM_API_KEY']      ?? '';
  const vfKey  = process.env['VESSELFINDER_API_KEY']   ?? '';
  const mstKey = process.env['MYSHIPTRACKING_API_KEY'] ?? '';
  const hasAnyKey =
    (aisKey && aisKey !== 'your_key_here') ||
    (vfKey  && vfKey  !== 'your_key_here') ||
    (mstKey && mstKey !== 'your_key_here');

  if (!hasAnyKey) {
    console.warn('[shipTracking] No ship-tracking API key configured');
    res.status(503).json({
      vessels: [], fetchedAt: new Date().toISOString(), count: 0,
      error: 'No ship-tracking API key configured (set AISSTREAM_API_KEY, VESSELFINDER_API_KEY, or MYSHIPTRACKING_API_KEY)',
    } satisfies VesselsResponse);
    return;
  }

  // 1. Fresh cache hit
  const fresh = vesselsCache.getFresh(VESSELS_CACHE_KEY);
  if (fresh) {
    console.log(`[shipTracking] /vessels — cache HIT (${fresh.length} vessel(s))`);
    res.json({ vessels: fresh, fetchedAt: new Date().toISOString(), count: fresh.length } satisfies VesselsResponse);
    return;
  }

  // Helper: serve stale disk cache; returns true if served
  const serveStale = (reason: string): boolean => {
    const staleEntry: DiskCacheEntry<NormalisedVessel[]> | undefined = vesselsCache.get(VESSELS_CACHE_KEY);
    if (!staleEntry) return false;
    const ageS = Math.round((Date.now() - staleEntry.storedAt) / 1000);
    console.warn(`[shipTracking] /vessels — ${reason}, returning disk cache (${ageS}s old)`);
    const stale = staleEntry.value.map(v => ({ ...v, isStale: true }));
    res.json({ vessels: stale, fetchedAt: new Date().toISOString(), count: stale.length, isStale: true, error: `${reason}; returning cached data` } satisfies VesselsResponse);
    return true;
  };

  // 2. Rate-limited: skip live fetch
  if (isRateLimited('ship:vessels')) {
    console.warn(`[shipTracking] /vessels — rate limited (${requestCount('ship:vessels')} req/min)`);
    if (serveStale('rate limited')) return;
    res.status(503).json({ vessels: [], fetchedAt: new Date().toISOString(), count: 0, error: 'Rate limited and no cached data available' } satisfies VesselsResponse);
    return;
  }

  console.log('[shipTracking] /vessels — cache MISS, fetching live…');

  // 3. Live fetch (primary → backup)
  try {
    const { vessels, provider } = await fetchVesselsWithFallback();
    if (vessels.length > 0) {
      vesselsCache.set(VESSELS_CACHE_KEY, vessels, VESSELS_TTL_MS);
    }
    console.log(`[shipTracking] /vessels — ${vessels.length} vessel(s) via ${provider}${vessels.length > 0 ? `, cached for ${VESSELS_TTL_MS / 1000}s` : ' (not cached — empty)'}`);
    vessels.forEach(v => {
      console.log(`  → MMSI ${v.mmsi}  "${v.name}"  [${v.vesselType}]  lat ${v.lat.toFixed(4)} lon ${v.lon.toFixed(4)}  ${v.speed ?? '—'} kn  hdg ${v.course ?? '—'}°`);
    });
    res.json({ vessels, fetchedAt: new Date().toISOString(), count: vessels.length, provider } satisfies VesselsResponse);
  } catch (err) {
    console.error('[shipTracking] Live fetch error:', err);
    if (serveStale('live fetch failed')) return;
    res.status(503).json({ vessels: [], fetchedAt: new Date().toISOString(), count: 0, error: 'Failed to fetch vessel data' } satisfies VesselsResponse);
  }
});

// ---------------------------------------------------------------------------
// Route: GET /api/ship-tracking/vessel/:mmsi
// ---------------------------------------------------------------------------

router.get('/vessel/:mmsi', async (req: Request, res: Response): Promise<void> => {
  const { mmsi } = req.params;
  if (!mmsi || !/^\d{9}$/.test(mmsi)) {
    res.status(400).json({ error: 'Invalid MMSI — must be a 9-digit number' });
    return;
  }

  const aisKey = process.env['AISSTREAM_API_KEY']      ?? '';
  const vfKey  = process.env['VESSELFINDER_API_KEY']   ?? '';
  const mstKey = process.env['MYSHIPTRACKING_API_KEY'] ?? '';
  const hasAnyKey =
    (aisKey && aisKey !== 'your_key_here') ||
    (vfKey  && vfKey  !== 'your_key_here') ||
    (mstKey && mstKey !== 'your_key_here');

  if (!hasAnyKey) {
    res.status(503).json({ error: 'No ship-tracking API key configured' });
    return;
  }

  trackRequest('ship:vessel-detail');

  // 1. Fresh cache hit
  const fresh = vesselDetailCache.getFresh(mmsi);
  if (fresh) {
    console.log(`[shipTracking] /vessel/${mmsi} — cache HIT`);
    res.json(fresh);
    return;
  }

  console.log(`[shipTracking] /vessel/${mmsi} — cache MISS, fetching detail…`);

  // Helper: serve stale disk cache; returns true if served
  const serveStale = (reason: string): boolean => {
    const staleEntry: DiskCacheEntry<NormalisedVesselDetail> | undefined = vesselDetailCache.get(mmsi);
    if (!staleEntry) return false;
    const ageS = Math.round((Date.now() - staleEntry.storedAt) / 1000);
    console.warn(`[shipTracking] /vessel/${mmsi} — ${reason}, returning disk cache (${ageS}s old)`);
    res.json({ ...staleEntry.value, isStale: true });
    return true;
  };

  // 2. Rate-limited: skip live fetch
  if (isRateLimited('ship:vessel-detail')) {
    console.warn(`[shipTracking] /vessel/${mmsi} — rate limited (${requestCount('ship:vessel-detail')} req/min)`);
    if (serveStale('rate limited')) return;
    res.status(503).json({ error: 'Rate limited and no cached data available' });
    return;
  }

  // 3. Live fetch (primary → backup)
  try {
    const { detail, provider } = await fetchDetailWithFallback(mmsi);
    vesselDetailCache.set(mmsi, detail, VESSEL_DETAIL_TTL_MS);
    console.log(`[shipTracking] /vessel/${mmsi} — "${detail.name}" via ${provider}  flag: ${detail.flag ?? '—'}  dest: ${detail.destination ?? '—'}`);
    res.json(detail);
  } catch (err) {
    console.error(`[shipTracking] Detail fetch failed for MMSI ${mmsi}:`, err);
    if (serveStale('live fetch failed')) return;
    res.status(502).json({ error: `Failed to fetch detail for MMSI ${mmsi}: ${(err as Error).message}` });
  }
});

export default router;
