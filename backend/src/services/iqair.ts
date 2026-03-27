/**
 * IQAir API client.
 *
 * Free tier: 10 000 calls/month — cache aggressively (min 5-min TTL).
 *
 * Docs: https://api-docs.iqair.com/
 *
 * Strategy:
 *   1. Call /v2/stations to list all monitoring stations in Portsmouth.
 *   2. Call /v2/station for each listed station (only subscribed ones succeed).
 *   3. Fall back to /v2/city if the stations list is empty or all fail.
 */

import axios from 'axios';
import { getAqiCategory, getAqiColor } from './aqiHelpers';

const BASE_URL = 'https://api.airvisual.com/v2';

// IQAir city/state/country identifiers for Portsmouth
const CITY = 'Portsmouth';
const STATE = 'England';
const COUNTRY = 'UK';

// Approximate centroid of Portsea Island
const PORTSEA_LAT = 50.806;
const PORTSEA_LNG = -1.070;

// ---------------------------------------------------------------------------
// Raw API types
// ---------------------------------------------------------------------------

interface IQAirStationsListResponse {
  status: string;
  data: Array<{ station: string }>;
}

interface IQAirPollutant {
  conc: number;
  aqius: number;
  aqicn: number;
}

interface IQAirCurrentData {
  ts: string; // ISO timestamp
  tp: number; // temperature °C
  pr: number; // pressure hPa
  hu: number; // humidity %
  ws: number; // wind speed m/s
  wd: number; // wind direction degrees
  ic: string; // weather icon
  p2: IQAirPollutant; // PM2.5
  p1?: IQAirPollutant; // PM10
  n2?: IQAirPollutant; // NO2
  o3?: IQAirPollutant; // O3
  co?: IQAirPollutant; // CO
  s2?: IQAirPollutant; // SO2
}

interface IQAirCityResponse {
  status: string;
  data: {
    city: string;
    state: string;
    country: string;
    location: {
      type: 'Point';
      coordinates: [number, number]; // [lng, lat]
    };
    current: {
      pollution: IQAirCurrentData & {
        aqius: number;
        mainus: string;
        aqicn: number;
        maincn: string;
      };
      weather: {
        ts: string;
        tp: number;
        pr: number;
        hu: number;
        ws: number;
        wd: number;
        ic: string;
      };
    };
  };
}

// ---------------------------------------------------------------------------
// Normalised station type
// ---------------------------------------------------------------------------

export interface IQAirStation {
  id: string;
  source: 'iqair';
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseCityResponse(raw: IQAirCityResponse): IQAirStation {
  const { data } = raw;
  const [lng, lat] = data.location.coordinates;
  const pollution = data.current.pollution;
  const weather = data.current.weather;
  const aqi = pollution.aqius ?? null;

  return {
    id: `iqair-${data.city.toLowerCase().replace(/\s+/g, '-')}`,
    source: 'iqair',
    name: `${data.city}, ${data.state}`,
    lat,
    lng,
    aqi,
    aqiCategory: getAqiCategory(aqi),
    aqiColor: getAqiColor(aqi),
    dominantPollutant: pollution.mainus ?? null,
    pollutants: {
      pm25: pollution.p2?.conc ?? null,
      pm10: pollution.p1?.conc ?? null,
      no2: pollution.n2?.conc ?? null,
      o3: pollution.o3?.conc ?? null,
      co: pollution.co?.conc ?? null,
      so2: pollution.s2?.conc ?? null,
    },
    temperature: weather.tp ?? null,
    humidity: weather.hu ?? null,
    wind: {
      speed: weather.ws ?? null,
      direction: weather.wd ?? null,
    },
    updatedAt: pollution.ts ?? null,
    isStale: false,
  };
}

// ---------------------------------------------------------------------------
// Public API functions
// ---------------------------------------------------------------------------

/**
 * List all monitoring station names available in Portsmouth from IQAir.
 */
async function fetchIQAirStationsList(apiKey: string): Promise<string[]> {
  const url = `${BASE_URL}/stations?city=${CITY}&state=${STATE}&country=${COUNTRY}&key=${apiKey}`;
  const response = await axios.get<IQAirStationsListResponse>(url, { timeout: 10_000 });

  console.log(`[iqair] stations list response — status: "${response.data.status}"`);

  if (response.data.status !== 'success') {
    console.warn(`[iqair] stations list error:`, JSON.stringify(response.data).slice(0, 300));
    throw new Error(`IQAir stations list returned status: ${response.data.status}`);
  }

  const names = (response.data.data ?? []).map((s) => s.station);
  console.log(`[iqair] stations list — ${names.length} station(s): ${names.join(', ')}`);
  return names;
}

/**
 * Fetch AQ data for a specific monitoring station in Portsmouth.
 * Returns null (does not throw) if the station is not subscribed or fails.
 */
async function fetchIQAirStation(
  stationName: string,
  apiKey: string,
): Promise<IQAirStation | null> {
  const encoded = encodeURIComponent(stationName);
  const url = `${BASE_URL}/station?station=${encoded}&city=${CITY}&state=${STATE}&country=${COUNTRY}&key=${apiKey}`;
  const response = await axios.get<IQAirCityResponse>(url, { timeout: 10_000 });

  if (response.data.status !== 'success') {
    console.warn(`[iqair] station "${stationName}" error: ${response.data.status}`);
    return null;
  }

  const { data } = response.data;
  const pollution = data.current.pollution;
  console.log(`[iqair] station "${stationName}" — coords: [${data.location.coordinates}]  AQI(us) ${pollution.aqius}  main: ${pollution.mainus}  ts: ${pollution.ts}`);

  // Reuse normaliseCityResponse — the response shape is identical
  return {
    ...normaliseCityResponse(response.data),
    // Override id/name to use station name rather than city name
    id: `iqair-${stationName.toLowerCase().replace(/\s+/g, '-')}`,
    name: stationName,
  };
}

/**
 * Fetch data for all subscribed IQAir monitoring stations in Portsmouth.
 * Falls back to city-level data if the stations list is empty or all fail.
 */
export async function fetchAllIQAirPortsmouthStations(
  apiKey: string,
): Promise<IQAirStation[]> {
  // 1. Get the list of stations
  let stationNames: string[] = [];
  try {
    stationNames = await fetchIQAirStationsList(apiKey);
  } catch (err) {
    console.warn(`[iqair] Could not list stations, falling back to city endpoint: ${(err as Error).message}`);
  }

  // 2. Fetch each station (only subscribed ones will succeed)
  if (stationNames.length > 0) {
    const results = await Promise.all(
      stationNames.map((name) => fetchIQAirStation(name, apiKey).catch(() => null)),
    );
    const stations = results.filter((s): s is IQAirStation => s !== null);
    if (stations.length > 0) {
      console.log(`[iqair] fetchAllIQAirPortsmouthStations — ${stations.length}/${stationNames.length} station(s) succeeded`);
      return stations;
    }
    console.warn('[iqair] All station fetches failed — falling back to city endpoint');
  }

  // 3. Fallback: city-level data
  const url = `${BASE_URL}/city?city=${CITY}&state=${STATE}&country=${COUNTRY}&key=${apiKey}`;
  const response = await axios.get<IQAirCityResponse>(url, { timeout: 10_000 });

  console.log(`[iqair] city fallback response — status: "${response.data.status}"`);

  if (response.data.status !== 'success') {
    console.warn(`[iqair] city API error payload:`, JSON.stringify(response.data).slice(0, 300));
    throw new Error(`IQAir city API returned status: ${response.data.status}`);
  }

  const { data } = response.data;
  console.log(`[iqair] city fallback — "${data.city}, ${data.state}"  AQI(us) ${data.current.pollution.aqius}`);
  return [normaliseCityResponse(response.data)];
}

/**
 * Fetch data for the nearest city to the Portsea Island centroid.
 * Falls back gracefully on error.
 */
export async function fetchIQAirNearestCity(
  apiKey: string,
): Promise<IQAirStation | null> {
  const url = `${BASE_URL}/nearest_city?lat=${PORTSEA_LAT}&lon=${PORTSEA_LNG}&key=${apiKey}`;
  const response = await axios.get<IQAirCityResponse>(url, { timeout: 10_000 });

  console.log(`[iqair] nearest_city response — status: "${response.data.status}"`);

  if (response.data.status !== 'success') {
    console.warn(`[iqair] nearest_city API error payload:`, JSON.stringify(response.data).slice(0, 300));
    throw new Error(`IQAir nearest_city API returned status: ${response.data.status}`);
  }

  const { data } = response.data;
  console.log(`[iqair] nearest_city data — "${data.city}, ${data.state}, ${data.country}"  AQI(us) ${data.current.pollution.aqius}`);

  return normaliseCityResponse(response.data);
}
