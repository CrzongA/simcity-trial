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
  fetchAqicnStationDetail,
  AqicnStation,
} from '../services/aqicn';
import { fetchIQAirPortsmouth, IQAirStation } from '../services/iqair';
import {
  stationsCache,
  stationDetailCache,
  STATIONS_TTL_MS,
  STATION_DETAIL_TTL_MS,
  CacheEntry,
} from '../services/cache';

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

const STATIONS_CACHE_KEY = 'stations-list';

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
    console.log('[airQuality] AQICN: fetching stations in Portsea Island bounding box…');
    try {
      const rawStations = await fetchAqicnStationsInBounds(aqicnToken);
      console.log(`[airQuality] AQICN: ${rawStations.length} station(s) returned from bounding box`);

      // Filter to stations within the Portsea Island polygon
      const filtered = rawStations.filter((s) => isWithinPortseaIsland(s.lat, s.lng));
      console.log(`[airQuality] AQICN: ${filtered.length} station(s) within Portsea Island polygon`);

      if (filtered.length > 0) {
        filtered.forEach(s => {
          console.log(`  • ${s.name} (${s.lat.toFixed(4)}, ${s.lng.toFixed(4)}) — AQI ${s.aqi ?? '—'} [${s.aqiCategory}]`);
        });
      }

      stations = filtered.map(normaliseAqicn);
      sources.push('aqicn');
    } catch (err) {
      console.warn('[airQuality] AQICN fetch failed:', (err as Error).message);
    }
  } else {
    console.info('[airQuality] AQICN_TOKEN not configured — skipping AQICN fetch');
  }

  // --- IQAir ---
  if (iqairKey && iqairKey !== 'your_key_here') {
    console.log('[airQuality] IQAir: fetching Portsmouth city data…');
    try {
      const iqStation = await fetchIQAirPortsmouth(iqairKey);
      if (iqStation) {
        console.log(`[airQuality] IQAir: received data for "${iqStation.name}" (${iqStation.lat.toFixed(4)}, ${iqStation.lng.toFixed(4)})`);
        console.log(`  • AQI ${iqStation.aqi ?? '—'} [${iqStation.aqiCategory}]  dominant: ${iqStation.dominantPollutant ?? '—'}`);
        console.log(`  • PM2.5 ${iqStation.pollutants.pm25 ?? '—'}  PM10 ${iqStation.pollutants.pm10 ?? '—'}  NO2 ${iqStation.pollutants.no2 ?? '—'}  O3 ${iqStation.pollutants.o3 ?? '—'}`);
        console.log(`  • Temp ${iqStation.temperature ?? '—'}°C  Humidity ${iqStation.humidity ?? '—'}%  Wind ${iqStation.wind.speed ?? '—'} m/s @ ${iqStation.wind.direction ?? '—'}°`);

        const prevCount = stations.length;
        stations = mergeIQAirStation(stations, iqStation);
        if (stations.length > prevCount) {
          console.log(`[airQuality] IQAir: added as new station (no nearby AQICN station within 0.5 km)`);
        } else {
          console.log(`[airQuality] IQAir: merged into existing nearby AQICN station`);
        }
        if (!sources.includes('iqair')) sources.push('iqair');
      } else {
        console.warn('[airQuality] IQAir: response was empty');
      }
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
  // 1. Try fresh cache
  const fresh = stationsCache.getFresh(STATIONS_CACHE_KEY) as NormalisedStation[] | undefined;
  if (fresh) {
    console.log(`[airQuality] /stations — cache HIT (${fresh.length} station(s))`);
    const response: StationsResponse = {
      stations: fresh,
      fetchedAt: new Date().toISOString(),
      sources: [...new Set(fresh.map((s) => s.source))],
    };
    res.json(response);
    return;
  }

  console.log('[airQuality] /stations — cache MISS, starting live fetch…');

  // 2. Attempt live fetch
  let stations: NormalisedStation[] = [];
  let sources: string[] = [];
  let liveFetchFailed = false;

  try {
    ({ stations, sources } = await fetchLiveStations());
    stationsCache.set(STATIONS_CACHE_KEY, stations, STATIONS_TTL_MS);
    console.log(`[airQuality] /stations — cached ${stations.length} station(s) for ${STATIONS_TTL_MS / 60000} min`);
  } catch (err) {
    console.error('[airQuality] Live fetch error:', err);
    liveFetchFailed = true;
  }

  // 3. Fall back to stale cache on failure
  if (liveFetchFailed) {
    const staleEntry = stationsCache.get(STATIONS_CACHE_KEY) as CacheEntry<NormalisedStation[]> | undefined;
    if (staleEntry) {
      const ageMin = Math.round((Date.now() - staleEntry.storedAt) / 60000);
      console.warn(`[airQuality] /stations — live fetch failed, returning stale cache (${ageMin} min old)`);
      const staleStations = staleEntry.value.map((s) => ({ ...s, isStale: true }));
      const response: StationsResponse = {
        stations: staleStations,
        fetchedAt: new Date().toISOString(),
        sources: [...new Set(staleStations.map((s) => s.source))],
        isStale: true,
        error: 'Live fetch failed; returning cached data',
      };
      res.json(response);
      return;
    }

    console.error('[airQuality] /stations — live fetch failed and no cache available, returning 503');
    const response: StationsResponse = {
      stations: [],
      fetchedAt: new Date().toISOString(),
      sources: [],
      error: 'Failed to fetch air quality data and no cache is available',
    };
    res.status(503).json(response);
    return;
  }

  console.log(`[airQuality] /stations — responding with ${stations.length} station(s)`);
  if (stations.length > 0) {
    stations.forEach(s => {
      console.log(`  → ${s.id}  "${s.name}"  AQI ${s.aqi ?? '—'} [${s.aqiCategory}]  lat ${s.lat.toFixed(4)} lng ${s.lng.toFixed(4)}`);
    });
  }

  const response: StationsResponse = {
    stations,
    fetchedAt: new Date().toISOString(),
    sources,
  };
  res.json(response);
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

  // 1. Try fresh cache
  const fresh = stationDetailCache.getFresh(id) as StationDetailResponse | undefined;
  if (fresh) {
    console.log(`[airQuality] /station/${id} — cache HIT`);
    res.json(fresh);
    return;
  }

  console.log(`[airQuality] /station/${id} — cache MISS, fetching detail…`);

  const aqicnToken = process.env['AQICN_TOKEN'] ?? '';
  if (!aqicnToken || aqicnToken === 'your_token_here') {
    // Return stale if available
    const staleEntry = stationDetailCache.get(id) as CacheEntry<StationDetailResponse> | undefined;
    if (staleEntry) {
      const ageMin = Math.round((Date.now() - staleEntry.storedAt) / 60000);
      console.warn(`[airQuality] /station/${id} — no token, returning stale cache (${ageMin} min old)`);
      res.json({ ...staleEntry.value, isStale: true });
      return;
    }
    console.warn(`[airQuality] /station/${id} — AQICN_TOKEN not configured`);
    res.status(503).json({ error: 'AQICN_TOKEN not configured' });
    return;
  }

  // 2. Live fetch
  try {
    console.log(`[airQuality] /station/${id} — calling AQICN feed for uid ${uid}…`);
    const detail = await fetchAqicnStationDetail(uid, aqicnToken);
    console.log(`[airQuality] /station/${id} — received: "${detail.name}"  AQI ${detail.aqi ?? '—'} [${detail.aqiCategory}]  dominant: ${detail.dominantPollutant ?? '—'}`);
    console.log(`  PM2.5 ${detail.pollutants.pm25 ?? '—'}  PM10 ${detail.pollutants.pm10 ?? '—'}  NO2 ${detail.pollutants.no2 ?? '—'}  O3 ${detail.pollutants.o3 ?? '—'}`);

    const response: StationDetailResponse = {
      id: detail.id,
      source: detail.source,
      name: detail.name,
      lat: detail.lat,
      lng: detail.lng,
      aqi: detail.aqi,
      aqiCategory: detail.aqiCategory,
      aqiColor: detail.aqiColor,
      dominantPollutant: detail.dominantPollutant,
      pollutants: { ...detail.pollutants },
      pollutantsDetailed: { ...detail.pollutantsDetailed },
      temperature: detail.temperature,
      humidity: detail.humidity,
      wind: { ...detail.wind },
      updatedAt: detail.updatedAt,
      isStale: false,
    };

    stationDetailCache.set(id, response, STATION_DETAIL_TTL_MS);
    res.json(response);
  } catch (err) {
    console.error(`[airQuality] Station detail fetch failed for ${id}:`, err);

    // Fall back to stale
    const staleEntry = stationDetailCache.get(id) as CacheEntry<StationDetailResponse> | undefined;
    if (staleEntry) {
      res.json({ ...staleEntry.value, isStale: true });
      return;
    }

    res.status(502).json({
      error: `Failed to fetch detail for station ${id}: ${(err as Error).message}`,
    });
  }
});

export default router;
