/**
 * Ship tracking route handlers.
 *
 * GET /api/ship-tracking/vessels        — all vessels in Portsmouth Harbour (60s TTL)
 * GET /api/ship-tracking/vessel/:mmsi   — single vessel extended detail (5min TTL)
 */

import { Router, Request, Response } from 'express';
import {
  fetchVesselsInZone,
  fetchVesselDetail,
  type NormalisedVessel,
  type NormalisedVesselDetail,
} from '../services/myshiptracking';
import { TTLCache, type CacheEntry } from '../services/cache';

const router = Router();

// ---------------------------------------------------------------------------
// Cache instances
// ---------------------------------------------------------------------------

const VESSELS_TTL_MS = 60 * 1000;         // 60 seconds
const VESSEL_DETAIL_TTL_MS = 5 * 60 * 1000; // 5 minutes

const vesselsCache = new TTLCache<NormalisedVessel[]>();
const vesselDetailCache = new TTLCache<NormalisedVesselDetail>();

const VESSELS_CACHE_KEY = 'vessels-list';

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface VesselsResponse {
  vessels: NormalisedVessel[];
  fetchedAt: string;
  count: number;
  isStale?: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Route: GET /api/ship-tracking/vessels
// ---------------------------------------------------------------------------

router.get('/vessels', async (_req: Request, res: Response): Promise<void> => {
  const apiKey = process.env['MYSHIPTRACKING_API_KEY'] ?? '';
  if (!apiKey || apiKey === 'your_key_here') {
    console.warn('[shipTracking] MYSHIPTRACKING_API_KEY not configured');
    res.status(503).json({
      vessels: [],
      fetchedAt: new Date().toISOString(),
      count: 0,
      error: 'MYSHIPTRACKING_API_KEY not configured',
    } satisfies VesselsResponse);
    return;
  }

  // 1. Try fresh cache
  const fresh = vesselsCache.getFresh(VESSELS_CACHE_KEY);
  if (fresh) {
    console.log(`[shipTracking] /vessels — cache HIT (${fresh.length} vessel(s))`);
    res.json({ vessels: fresh, fetchedAt: new Date().toISOString(), count: fresh.length } satisfies VesselsResponse);
    return;
  }

  console.log('[shipTracking] /vessels — cache MISS, fetching live…');

  // 2. Live fetch
  let vessels: NormalisedVessel[] = [];
  let liveFailed = false;

  try {
    vessels = await fetchVesselsInZone(apiKey);
    vesselsCache.set(VESSELS_CACHE_KEY, vessels, VESSELS_TTL_MS);
    console.log(`[shipTracking] /vessels — fetched ${vessels.length} vessel(s), cached for ${VESSELS_TTL_MS / 1000}s`);
    vessels.forEach(v => {
      console.log(`  → MMSI ${v.mmsi}  "${v.name}"  [${v.vesselType}]  lat ${v.lat.toFixed(4)} lon ${v.lon.toFixed(4)}  ${v.speed ?? '—'} kn  hdg ${v.course ?? '—'}°`);
    });
  } catch (err) {
    console.error('[shipTracking] Live fetch error:', err);
    liveFailed = true;
  }

  // 3. Fallback to stale cache
  if (liveFailed) {
    const staleEntry = vesselsCache.get(VESSELS_CACHE_KEY) as CacheEntry<NormalisedVessel[]> | undefined;
    if (staleEntry) {
      const ageS = Math.round((Date.now() - staleEntry.storedAt) / 1000);
      console.warn(`[shipTracking] /vessels — live failed, returning stale cache (${ageS}s old)`);
      const stale = staleEntry.value.map((v) => ({ ...v, isStale: true }));
      res.json({ vessels: stale, fetchedAt: new Date().toISOString(), count: stale.length, isStale: true, error: 'Live fetch failed; returning cached data' } satisfies VesselsResponse);
      return;
    }
    console.error('[shipTracking] /vessels — live failed and no cache, returning 503');
    res.status(503).json({ vessels: [], fetchedAt: new Date().toISOString(), count: 0, error: 'Failed to fetch vessel data' } satisfies VesselsResponse);
    return;
  }

  res.json({ vessels, fetchedAt: new Date().toISOString(), count: vessels.length } satisfies VesselsResponse);
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

  const apiKey = process.env['MYSHIPTRACKING_API_KEY'] ?? '';
  if (!apiKey || apiKey === 'your_key_here') {
    res.status(503).json({ error: 'MYSHIPTRACKING_API_KEY not configured' });
    return;
  }

  // 1. Try fresh cache
  const fresh = vesselDetailCache.getFresh(mmsi);
  if (fresh) {
    console.log(`[shipTracking] /vessel/${mmsi} — cache HIT`);
    res.json(fresh);
    return;
  }

  console.log(`[shipTracking] /vessel/${mmsi} — cache MISS, fetching detail…`);

  // 2. Live fetch
  try {
    const detail = await fetchVesselDetail(mmsi, apiKey);
    vesselDetailCache.set(mmsi, detail, VESSEL_DETAIL_TTL_MS);
    console.log(`[shipTracking] /vessel/${mmsi} — "${detail.name}"  flag: ${detail.flag ?? '—'}  dest: ${detail.destination ?? '—'}`);
    res.json(detail);
  } catch (err) {
    console.error(`[shipTracking] Detail fetch failed for MMSI ${mmsi}:`, err);

    // Fallback to stale
    const staleEntry = vesselDetailCache.get(mmsi) as CacheEntry<NormalisedVesselDetail> | undefined;
    if (staleEntry) {
      res.json({ ...staleEntry.value, isStale: true });
      return;
    }

    res.status(502).json({ error: `Failed to fetch detail for MMSI ${mmsi}: ${(err as Error).message}` });
  }
});

export default router;
