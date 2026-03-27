/**
 * AQICN API client.
 *
 * Free tier: ~1 000 calls/day — callers must cache aggressively.
 *
 * Docs: https://aqicn.org/api/
 */

import axios from 'axios';
import { PORTSEA_BBOX } from '../utils/geo';
import { getAqiCategory, getAqiColor } from './aqiHelpers';

const BASE_URL = 'https://api.waqi.info';

// ---------------------------------------------------------------------------
// Raw API types
// ---------------------------------------------------------------------------

interface AqicnBoundsStation {
  uid: number;
  aqi: string | number; // sometimes "-" when unavailable
  station: {
    name: string;
    geo: [number, number]; // [lat, lng]
    url: string;
    country: string;
  };
}

interface AqicnBoundsResponse {
  status: string;
  data: AqicnBoundsStation[];
}

interface AqicnPollutant {
  v: number;
}

interface AqicnFeedData {
  aqi: number;
  idx: number;
  dominentpol?: string;
  city: {
    name: string;
    geo: [number, number]; // [lat, lng]
    url: string;
  };
  iaqi: {
    pm25?: AqicnPollutant;
    pm10?: AqicnPollutant;
    no2?: AqicnPollutant;
    o3?: AqicnPollutant;
    co?: AqicnPollutant;
    so2?: AqicnPollutant;
    t?: AqicnPollutant;   // temperature
    h?: AqicnPollutant;   // humidity
    w?: AqicnPollutant;   // wind speed
    wd?: AqicnPollutant;  // wind direction
  };
  time: {
    s: string;  // "2026-03-27 10:00:00"
    tz: string;
    v: number;  // unix timestamp
    iso: string;
  };
}

interface AqicnFeedResponse {
  status: string;
  data: AqicnFeedData;
}

// ---------------------------------------------------------------------------
// Normalised station type
// ---------------------------------------------------------------------------

export interface AqicnStation {
  id: string;
  source: 'aqicn';
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

export interface AqicnStationDetail extends AqicnStation {
  pollutantsDetailed: {
    pm25?: { v: number };
    pm10?: { v: number };
    no2?: { v: number };
    o3?: { v: number };
    co?: { v: number };
    so2?: { v: number };
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseAqi(raw: string | number | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
  return isNaN(n) ? null : n;
}

function iaqi(
  data: AqicnFeedData,
  key: keyof AqicnFeedData['iaqi'],
): number | null {
  return data.iaqi[key]?.v ?? null;
}

function normaliseBoundsStation(raw: AqicnBoundsStation): AqicnStation {
  const aqi = parseAqi(raw.aqi);
  const [lat, lng] = raw.station.geo;

  return {
    id: `aqicn-${raw.uid}`,
    source: 'aqicn',
    name: raw.station.name,
    lat,
    lng,
    aqi,
    aqiCategory: getAqiCategory(aqi),
    aqiColor: getAqiColor(aqi),
    dominantPollutant: null,
    pollutants: { pm25: null, pm10: null, no2: null, o3: null, co: null, so2: null },
    temperature: null,
    humidity: null,
    wind: { speed: null, direction: null },
    updatedAt: null,
    isStale: false,
  };
}

function normaliseFeedData(uid: number, feed: AqicnFeedData): AqicnStationDetail {
  const aqi = parseAqi(feed.aqi);
  const [lat, lng] = feed.city.geo;

  return {
    id: `aqicn-${uid}`,
    source: 'aqicn',
    name: feed.city.name,
    lat,
    lng,
    aqi,
    aqiCategory: getAqiCategory(aqi),
    aqiColor: getAqiColor(aqi),
    dominantPollutant: feed.dominentpol ?? null,
    pollutants: {
      pm25: iaqi(feed, 'pm25'),
      pm10: iaqi(feed, 'pm10'),
      no2: iaqi(feed, 'no2'),
      o3: iaqi(feed, 'o3'),
      co: iaqi(feed, 'co'),
      so2: iaqi(feed, 'so2'),
    },
    pollutantsDetailed: {
      ...(feed.iaqi.pm25 && { pm25: feed.iaqi.pm25 }),
      ...(feed.iaqi.pm10 && { pm10: feed.iaqi.pm10 }),
      ...(feed.iaqi.no2  && { no2:  feed.iaqi.no2  }),
      ...(feed.iaqi.o3   && { o3:   feed.iaqi.o3   }),
      ...(feed.iaqi.co   && { co:   feed.iaqi.co   }),
      ...(feed.iaqi.so2  && { so2:  feed.iaqi.so2  }),
    },
    temperature: iaqi(feed, 't'),
    humidity: iaqi(feed, 'h'),
    wind: {
      speed: iaqi(feed, 'w'),
      direction: iaqi(feed, 'wd'),
    },
    updatedAt: feed.time?.iso ?? null,
    isStale: false,
  };
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * Fetch all stations within the Portsea Island bounding box.
 * Returns an empty array (not a throw) when the token is missing or the
 * request fails.
 */
export async function fetchAqicnStationsInBounds(
  token: string,
): Promise<AqicnStation[]> {
  const { sw, ne } = PORTSEA_BBOX;
  const latlng = `${sw.lat},${sw.lng},${ne.lat},${ne.lng}`;
  const url = `${BASE_URL}/map/bounds/?latlng=${latlng}&networks=all&token=${token}`;

  const response = await axios.get<AqicnBoundsResponse>(url, { timeout: 10_000 });

  console.log(`[aqicn] bounds response — status: "${response.data.status}", stations in payload: ${Array.isArray(response.data.data) ? response.data.data.length : typeof response.data.data}`);

  if (response.data.status !== 'ok') {
    console.warn(`[aqicn] bounds API error payload:`, JSON.stringify(response.data).slice(0, 300));
    throw new Error(`AQICN bounds API returned status: ${response.data.status}`);
  }

  const rawData = Array.isArray(response.data.data) ? response.data.data : [];

  return rawData
    .filter((s) => {
      const aqi = parseAqi(s.aqi);
      // Skip stations with no AQI data or missing coordinates
      return aqi !== null && Array.isArray(s.station?.geo) && s.station.geo.length >= 2;
    })
    .map(normaliseBoundsStation);
}

/**
 * Fetch detailed reading for a single station by its numeric UID.
 * Throws on failure so callers can handle/cache as appropriate.
 */
export async function fetchAqicnStationDetail(
  uid: number,
  token: string,
): Promise<AqicnStationDetail> {
  const url = `${BASE_URL}/feed/@${uid}/?token=${token}`;
  const response = await axios.get<AqicnFeedResponse>(url, { timeout: 10_000 });

  console.log(`[aqicn] feed response for uid ${uid} — status: "${response.data.status}"`);

  if (response.data.status !== 'ok') {
    console.warn(`[aqicn] feed API error payload:`, JSON.stringify(response.data).slice(0, 300));
    throw new Error(`AQICN feed API returned status: ${response.data.status}`);
  }

  const feed = response.data.data;
  console.log(`[aqicn] feed data — city: "${feed.city?.name}"  AQI: ${feed.aqi}  dominant: ${feed.dominentpol ?? '—'}  iaqi keys: [${Object.keys(feed.iaqi ?? {}).join(', ')}]`);

  return normaliseFeedData(uid, feed);
}
