/**
 * Air quality route handlers.
 *
 * GET /api/air-quality/stations   — all stations within Portsea Island
 * GET /api/air-quality/station/:id — single station detail
 */

import { Router, Request, Response } from 'express';
import { isWithinPortseaIsland } from '../utils/geo';
import {
  fetchAqicnStationsInBounds,
  fetchAqicnStationsBySearch,
  fetchAqicnStationDetail,
  AqicnStation,
  AqicnStationDetail,
} from '../services/aqicn';
import { fetchAllIQAirPortsmouthStations, IQAirStation } from '../services/iqair';
import { STATIONS_TTL_MS, STATION_DETAIL_TTL_MS } from '../services/cache';
import {
  DiskCache,
  DiskCacheEntry,
  trackRequest,
  isRateLimited,
  requestCount,
} from '../services/diskCache';

// Disk-backed caches (persist across restarts).
// stationsCache is keyed per-station (by id) so a smaller API response
// does not evict stations returned by a previous, richer response.
const stationsCache      = new DiskCache<NormalisedStation>('air-stations');
const stationDetailCache = new DiskCache<StationDetailResponse>('air-station-detail');

const router = Router();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NormalisedStation {
  id: string;
  source: 'aqicn' | 'iqair';
  name: string;
  lat: number;
  lng: number;
  aqi: number | null;
  aqiCategory: string;
  aqiColor: string;
  dominantPollutant: string | null;
  pollutants: {
    pm25: number | null;
    pm10: number | null;
    no2: number | null;
    o3: number | null;
    co: number | null;
    so2: number | null;
  };
  temperature: number | null;
  humidity: number | null;
  wind: { speed: number | null; direction: number | null };
  updatedAt: string | null;
  isStale: boolean;
}

interface StationsResponse {
  stations: NormalisedStation[];
  fetchedAt: string;
  sources: string[];
  isStale?: boolean;
  error?: string;
}

interface StationDetailResponse extends NormalisedStation {
  pollutantsDetailed: Record<string, { v: number }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Haversine distance in km between two lat/lng pairs.
 */
function haversineKm(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Merges IQAir data point into the stations list, deduplicating by proximity.
 * If an AQICN station is within 0.5 km of the IQAir point, we enrich the AQICN
 * station with IQAir weather data (which is often richer) but keep the AQICN id.
 * Otherwise the IQAir point is added as its own entry.
 */
function mergeIQAirStation(
  stations: NormalisedStation[],
  iqairStation: IQAirStation,
): NormalisedStation[] {
  const PROXIMITY_KM = 0.5;
  const nearby = stations.find(
    (s) => haversineKm(s.lat, s.lng, iqairStation.lat, iqairStation.lng) < PROXIMITY_KM,
  );

  if (nearby) {
    // Enrich existing station with IQAir weather data if not already present
    if (nearby.temperature === null) nearby.temperature = iqairStation.temperature;
    if (nearby.humidity === null) nearby.humidity = iqairStation.humidity;
    if (nearby.wind.speed === null) nearby.wind.speed = iqairStation.wind.speed;
    if (nearby.wind.direction === null) nearby.wind.direction = iqairStation.wind.direction;
    // Prefer the higher-detail AQI source but fill in missing pollutants
    for (const key of Object.keys(iqairStation.pollutants) as Array<keyof typeof iqairStation.pollutants>) {
      if (nearby.pollutants[key] === null) {
        nearby.pollutants[key] = iqairStation.pollutants[key];
      }
    }
    return stations;
  }

  // No nearby AQICN station — add IQAir as its own entry
  return [
    ...stations,
    {
      id: iqairStation.id,
      source: iqairStation.source,
      name: iqairStation.name,
      lat: iqairStation.lat,
      lng: iqairStation.lng,
      aqi: iqairStation.aqi,
      aqiCategory: iqairStation.aqiCategory,
      aqiColor: iqairStation.aqiColor,
      dominantPollutant: iqairStation.dominantPollutant,
      pollutants: { ...iqairStation.pollutants },
      temperature: iqairStation.temperature,
      humidity: iqairStation.humidity,
      wind: { ...iqairStation.wind },
      updatedAt: iqairStation.updatedAt,
      isStale: false,
    },
  ];
}

/**
 * Convert an AqicnStation to the shared NormalisedStation shape.
 */
function normaliseAqicn(s: AqicnStation): NormalisedStation {
  return {
    id: s.id,
    source: s.source,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    aqi: s.aqi,
    aqiCategory: s.aqiCategory,
    aqiColor: s.aqiColor,
    dominantPollutant: s.dominantPollutant,
    pollutants: { ...s.pollutants },
    temperature: s.temperature,
    humidity: s.humidity,
    wind: { ...s.wind },
    updatedAt: s.updatedAt,
    isStale: s.isStale,
  };
}

// ---------------------------------------------------------------------------
// Live fetch logic
// ---------------------------------------------------------------------------

async function fetchLiveStations(): Promise<{
  stations: NormalisedStation[];
  sources: string[];
}> {
  const aqicnToken = process.env['AQICN_TOKEN'] ?? '';
  const iqairKey = process.env['IQAIR_API_KEY'] ?? '';

  const sources: string[] = [];
  let stations: NormalisedStation[] = [];

  // --- AQICN ---
  if (aqicnToken && aqicnToken !== 'your_token_here') {
    // Run bounds query and keyword search in parallel, then merge by UID
    console.log('[airQuality] AQICN: fetching via bounds + search in parallel…');
    try {
      const [boundsStations, searchStations] = await Promise.allSettled([
        fetchAqicnStationsInBounds(aqicnToken),
        fetchAqicnStationsBySearch('Portsmouth', aqicnToken),
      ]);

      const allRaw: AqicnStation[] = [];
      if (boundsStations.status === 'fulfilled') {
        console.log(`[airQuality] AQICN bounds: ${boundsStations.value.length} station(s)`);
        allRaw.push(...boundsStations.value);
      } else {
        console.warn('[airQuality] AQICN bounds failed:', boundsStations.reason);
      }
      if (searchStations.status === 'fulfilled') {
        console.log(`[airQuality] AQICN search: ${searchStations.value.length} station(s)`);
        // Merge: add search results not already present by uid
        const existingIds = new Set(allRaw.map((s) => s.id));
        for (const s of searchStations.value) {
          if (!existingIds.has(s.id)) allRaw.push(s);
        }
      } else {
        console.warn('[airQuality] AQICN search failed:', searchStations.reason);
      }

      // Filter to stations within the Portsea Island polygon
      const filtered = allRaw.filter((s) => isWithinPortseaIsland(s.lat, s.lng));
      console.log(`[airQuality] AQICN: ${filtered.length}/${allRaw.length} station(s) within Portsea Island`);

      // Enrich each station with full pollutant detail from the feed endpoint
      console.log('[airQuality] AQICN: fetching pollutant detail for each station…');
      const enriched = await Promise.all(
        filtered.map(async (s) => {
          const uid = parseInt(s.id.replace('aqicn-', ''), 10);
          try {
            const detail = await fetchAqicnStationDetail(uid, aqicnToken);
            console.log(`  • ${detail.name} (${detail.lat.toFixed(4)}, ${detail.lng.toFixed(4)}) — AQI ${detail.aqi ?? '—'}  PM2.5 ${detail.pollutants.pm25 ?? '—'}  PM10 ${detail.pollutants.pm10 ?? '—'}  NO2 ${detail.pollutants.no2 ?? '—'}  O3 ${detail.pollutants.o3 ?? '—'}`);
            return detail;
          } catch (err) {
            console.warn(`  • ${s.name} detail failed (uid ${uid}): ${(err as Error).message} — using summary data`);
            return s;
          }
        }),
      );

      stations = enriched.map(normaliseAqicn);

      // Also fetch any UIDs pinned in AQICN_STATION_UIDS that aren't already present
      const pinnedUids: number[] = (process.env['AQICN_STATION_UIDS'] ?? '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      if (pinnedUids.length > 0) {
        const existingIds = new Set(stations.map((s) => s.id));
        const missingUids = pinnedUids.filter((uid) => !existingIds.has(`aqicn-${uid}`));
        if (missingUids.length > 0) {
          console.log(`[airQuality] AQICN: fetching ${missingUids.length} pinned UID(s) not found via bounds/search: ${missingUids.join(', ')}`);
          const pinnedResults = await Promise.all(
            missingUids.map(async (uid) => {
              try {
                const detail = await fetchAqicnStationDetail(uid, aqicnToken);
                console.log(`  • [pinned] ${detail.name} (${detail.lat.toFixed(4)}, ${detail.lng.toFixed(4)}) — AQI ${detail.aqi ?? '—'}  PM2.5 ${detail.pollutants.pm25 ?? '—'}`);
                return detail;
              } catch (err) {
                console.warn(`  • [pinned] uid ${uid} failed: ${(err as Error).message}`);
                return null;
              }
            }),
          );
          const validPinned = pinnedResults.filter((s): s is AqicnStationDetail => s !== null);
          stations = [...stations, ...validPinned.map(normaliseAqicn)];
        } else {
          console.log('[airQuality] AQICN: all pinned UIDs already found via bounds/search');
        }
      }

      if (stations.length > 0) sources.push('aqicn');
    } catch (err) {
      console.warn('[airQuality] AQICN fetch failed:', (err as Error).message);
    }
  } else {
    console.info('[airQuality] AQICN_TOKEN not configured — skipping AQICN fetch');
  }

  // --- IQAir ---
  if (iqairKey && iqairKey !== 'your_key_here') {
    console.log('[airQuality] IQAir: fetching Portsmouth stations…');
    try {
      const iqStations = await fetchAllIQAirPortsmouthStations(iqairKey);
      console.log(`[airQuality] IQAir: received ${iqStations.length} station(s)`);
      for (const iqStation of iqStations) {
        console.log(`  • "${iqStation.name}" (${iqStation.lat.toFixed(4)}, ${iqStation.lng.toFixed(4)})  AQI ${iqStation.aqi ?? '—'} [${iqStation.aqiCategory}]  dominant: ${iqStation.dominantPollutant ?? '—'}`);
        console.log(`    PM2.5 ${iqStation.pollutants.pm25 ?? '—'}  PM10 ${iqStation.pollutants.pm10 ?? '—'}  NO2 ${iqStation.pollutants.no2 ?? '—'}  O3 ${iqStation.pollutants.o3 ?? '—'}`);
        const prevCount = stations.length;
        stations = mergeIQAirStation(stations, iqStation);
        if (stations.length > prevCount) {
          console.log(`    → added as new station`);
        } else {
          console.log(`    → merged into existing nearby station`);
        }
      }
      if (iqStations.length > 0 && !sources.includes('iqair')) sources.push('iqair');
    } catch (err) {
      console.warn('[airQuality] IQAir fetch failed:', (err as Error).message);
    }
  } else {
    console.info('[airQuality] IQAIR_API_KEY not configured — skipping IQAir fetch');
  }

  console.log(`[airQuality] Live fetch complete: ${stations.length} total station(s) from [${sources.join(', ')}]`);
  return { stations, sources };
}

// ---------------------------------------------------------------------------
// Route: GET /api/air-quality/stations
// ---------------------------------------------------------------------------

router.get('/stations', async (_req: Request, res: Response): Promise<void> => {
  trackRequest('air:stations');

  // Helpers: collect all fresh / all (stale+fresh) stations from per-entity cache
  const getFreshStations = (): NormalisedStation[] =>
    stationsCache.keys()
      .map(k => stationsCache.getFresh(k))
      .filter((s): s is NormalisedStation => s !== undefined);

  const getAllCachedStations = (): DiskCacheEntry<NormalisedStation>[] =>
    stationsCache.keys()
      .map(k => stationsCache.get(k))
      .filter((e): e is DiskCacheEntry<NormalisedStation> => e !== undefined);

  // 1. Try fresh cache (memory-backed, persisted to disk)
  const freshStations = getFreshStations();
  if (freshStations.length > 0) {
    console.log(`[airQuality] /stations — cache HIT (${freshStations.length} station(s))`);
    res.json({ stations: freshStations, fetchedAt: new Date().toISOString(), sources: [...new Set(freshStations.map(s => s.source))] } satisfies StationsResponse);
    return;
  }

  // Helper: try to respond with stale disk cache; returns true if served
  const serveStale = (reason: string): boolean => {
    const entries = getAllCachedStations();
    if (entries.length === 0) return false;
    const oldestAgeMin = Math.round(Math.max(...entries.map(e => Date.now() - e.storedAt)) / 60_000);
    console.warn(`[airQuality] /stations — ${reason}, returning disk cache (oldest: ${oldestAgeMin} min)`);
    const stale = entries.map(e => ({ ...e.value, isStale: true }));
    res.json({ stations: stale, fetchedAt: new Date().toISOString(), sources: [...new Set(stale.map(s => s.source))], isStale: true, error: `${reason}; returning cached data` } satisfies StationsResponse);
    return true;
  };

  // 2. Rate-limited: skip live fetch
  if (isRateLimited('air:stations')) {
    console.warn(`[airQuality] /stations — rate limited (${requestCount('air:stations')} req/min)`);
    if (serveStale('rate limited')) return;
    res.status(503).json({ stations: [], fetchedAt: new Date().toISOString(), sources: [], error: 'Rate limited and no cached data available' } satisfies StationsResponse);
    return;
  }

  console.log('[airQuality] /stations — cache MISS, starting live fetch…');

  // 3. Attempt live fetch
  let stations: NormalisedStation[] = [];
  let sources: string[] = [];

  try {
    ({ stations, sources } = await fetchLiveStations());
    // Store each station individually — a smaller response won't evict stations
    // returned by a previous, richer response; each entry expires on its own TTL.
    for (const station of stations) {
      stationsCache.set(station.id, station, STATIONS_TTL_MS);
    }
    console.log(`[airQuality] /stations — cached ${stations.length} station(s) for ${STATIONS_TTL_MS / 60000} min`);
  } catch (err) {
    console.error('[airQuality] Live fetch error:', err);
    if (serveStale('live fetch failed')) return;
    console.error('[airQuality] /stations — no cache available, returning 503');
    res.status(503).json({ stations: [], fetchedAt: new Date().toISOString(), sources: [], error: 'Failed to fetch air quality data and no cache is available' } satisfies StationsResponse);
    return;
  }

  console.log(`[airQuality] /stations — responding with ${stations.length} station(s)`);
  stations.forEach(s => {
    console.log(`  → ${s.id}  "${s.name}"  AQI ${s.aqi ?? '—'} [${s.aqiCategory}]  lat ${s.lat.toFixed(4)} lng ${s.lng.toFixed(4)}`);
  });

  res.json({ stations, fetchedAt: new Date().toISOString(), sources } satisfies StationsResponse);
});

// ---------------------------------------------------------------------------
// Route: GET /api/air-quality/station/:id
// ---------------------------------------------------------------------------

router.get('/station/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!id) {
    res.status(400).json({ error: 'Missing station id' });
    return;
  }

  // Only AQICN stations support detailed fetch via UID
  if (!id.startsWith('aqicn-')) {
    res.status(400).json({
      error: `Station id "${id}" does not support detail fetch; only aqicn-* ids are supported`,
    });
    return;
  }

  const uidStr = id.replace('aqicn-', '');
  const uid = parseInt(uidStr, 10);
  if (isNaN(uid)) {
    res.status(400).json({ error: `Invalid station id: ${id}` });
    return;
  }

  trackRequest('air:station-detail');

  // 1. Try fresh cache
  const fresh = stationDetailCache.getFresh(id);
  if (fresh) {
    console.log(`[airQuality] /station/${id} — cache HIT`);
    res.json(fresh);
    return;
  }

  console.log(`[airQuality] /station/${id} — cache MISS, fetching detail…`);

  // Helper: try to respond with stale disk cache; returns true if served
  const serveStale = (reason: string): boolean => {
    const staleEntry: DiskCacheEntry<StationDetailResponse> | undefined = stationDetailCache.get(id);
    if (!staleEntry) return false;
    const ageMin = Math.round((Date.now() - staleEntry.storedAt) / 60_000);
    console.warn(`[airQuality] /station/${id} — ${reason}, returning disk cache (${ageMin} min old)`);
    res.json({ ...staleEntry.value, isStale: true });
    return true;
  };

  const aqicnToken = process.env['AQICN_TOKEN'] ?? '';
  if (!aqicnToken || aqicnToken === 'your_token_here') {
    if (serveStale('no token')) return;
    console.warn(`[airQuality] /station/${id} — AQICN_TOKEN not configured`);
    res.status(503).json({ error: 'AQICN_TOKEN not configured' });
    return;
  }

  // 2. Rate-limited: skip live fetch
  if (isRateLimited('air:station-detail')) {
    console.warn(`[airQuality] /station/${id} — rate limited (${requestCount('air:station-detail')} req/min)`);
    if (serveStale('rate limited')) return;
    res.status(503).json({ error: 'Rate limited and no cached data available' });
    return;
  }

  // 3. Live fetch
  try {
    console.log(`[airQuality] /station/${id} — calling AQICN feed for uid ${uid}…`);
    const detail = await fetchAqicnStationDetail(uid, aqicnToken);
    console.log(`[airQuality] /station/${id} — received: "${detail.name}"  AQI ${detail.aqi ?? '—'} [${detail.aqiCategory}]  dominant: ${detail.dominantPollutant ?? '—'}`);
    console.log(`  PM2.5 ${detail.pollutants.pm25 ?? '—'}  PM10 ${detail.pollutants.pm10 ?? '—'}  NO2 ${detail.pollutants.no2 ?? '—'}  O3 ${detail.pollutants.o3 ?? '—'}`);

    const response: StationDetailResponse = {
      id: detail.id, source: detail.source, name: detail.name,
      lat: detail.lat, lng: detail.lng, aqi: detail.aqi,
      aqiCategory: detail.aqiCategory, aqiColor: detail.aqiColor,
      dominantPollutant: detail.dominantPollutant,
      pollutants: { ...detail.pollutants },
      pollutantsDetailed: { ...detail.pollutantsDetailed },
      temperature: detail.temperature, humidity: detail.humidity,
      wind: { ...detail.wind }, updatedAt: detail.updatedAt, isStale: false,
    };

    stationDetailCache.set(id, response, STATION_DETAIL_TTL_MS);
    res.json(response);
  } catch (err) {
    console.error(`[airQuality] Station detail fetch failed for ${id}:`, err);
    if (serveStale('live fetch failed')) return;
    res.status(502).json({ error: `Failed to fetch detail for station ${id}: ${(err as Error).message}` });
  }
});

export default router;
