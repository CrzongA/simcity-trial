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

  // Log each raw station so we can diagnose filter issues
  rawData.forEach(s => {
    console.log(`  [aqicn] raw station uid=${s.uid} aqi="${s.aqi}" geo=${JSON.stringify(s.station?.geo)} name="${s.station?.name}"`);
  });

  return rawData
    .filter((s) => {
      // Only require valid coordinates — include stations with no current AQI reading
      return Array.isArray(s.station?.geo) && s.station.geo.length >= 2;
    })
    .map(normaliseBoundsStation);
}

/**
 * Search for stations by keyword (e.g. "Portsmouth").
 * Returns all matching stations the token has access to, with their current AQI.
 * The response shape is identical to the bounds endpoint so we reuse the same types.
 */
export async function fetchAqicnStationsBySearch(
  keyword: string,
  token: string,
): Promise<AqicnStation[]> {
  const url = `${BASE_URL}/search/?keyword=${encodeURIComponent(keyword)}&token=${token}`;
  const response = await axios.get<AqicnBoundsResponse>(url, { timeout: 10_000 });

  console.log(`[aqicn] search "${keyword}" — status: "${response.data.status}", results: ${Array.isArray(response.data.data) ? response.data.data.length : typeof response.data.data}`);

  if (response.data.status !== 'ok') {
    console.warn(`[aqicn] search API error:`, JSON.stringify(response.data).slice(0, 300));
    throw new Error(`AQICN search API returned status: ${response.data.status}`);
  }

  const rawData = Array.isArray(response.data.data) ? response.data.data : [];

  rawData.forEach(s => {
    console.log(`  [aqicn] search result uid=${s.uid} aqi="${s.aqi}" geo=${JSON.stringify(s.station?.geo)} name="${s.station?.name}"`);
  });

  return rawData
    .filter((s) => Array.isArray(s.station?.geo) && s.station.geo.length >= 2)
    .map(normaliseBoundsStation);
}

/**
 * Try a single AQICN feed URL variant. Returns the parsed feed data on success,
 * or null if the response contains an error (so the caller can try the next variant).
 * Throws only on network/HTTP failure.
 */
async function tryFeedVariant(
  slug: string,
  token: string,
): Promise<AqicnFeedData | null> {
  const url = `${BASE_URL}/feed/${slug}/?token=${token}`;
  const response = await axios.get<AqicnFeedResponse>(url, { timeout: 10_000 });

  if (response.data.status !== 'ok') return null;

  const feed = response.data.data;
  const feedAny = feed as unknown as { status?: string };
  if (feedAny.status === 'error') return null;

  if (!feed.city?.geo) return null;

  return feed;
}

/**
 * Fetch detailed reading for a single station by its numeric UID.
 * Tries three slug formats in order: @{uid}, A{uid}, {uid} (bare).
 * Throws if all variants fail.
 */
export async function fetchAqicnStationDetail(
  uid: number,
  token: string,
): Promise<AqicnStationDetail> {
  const variants = [`@${uid}`, `A${uid}`, `${uid}`];

  for (const slug of variants) {
    const feed = await tryFeedVariant(slug, token);
    if (feed) {
      console.log(`[aqicn] feed uid ${uid} — succeeded with slug "${slug}"  city: "${feed.city?.name}"  AQI: ${feed.aqi}  iaqi keys: [${Object.keys(feed.iaqi ?? {}).join(', ')}]`);
      return normaliseFeedData(uid, feed);
    }
    console.log(`[aqicn] feed uid ${uid} — slug "${slug}" returned no data, trying next…`);
  }

  throw new Error(`AQICN feed uid ${uid}: all slug variants (@, A, bare) failed`);
}
