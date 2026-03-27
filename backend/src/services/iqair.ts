/**
 * IQAir API client.
 *
 * Free tier: 10 000 calls/month — cache aggressively (min 5-min TTL).
 *
 * Docs: https://api-docs.iqair.com/
 *
 * On the free tier there is no "get all stations in bounding box" endpoint.
 * We query Portsmouth as a city and also try nearest_city for the island
 * centroid.  Results are returned as a single normalised station.
 */

import axios from 'axios';
import { getAqiCategory, getAqiColor } from './aqiHelpers';

const BASE_URL = 'https://api.airvisual.com/v2';

// Approximate centroid of Portsea Island
const PORTSEA_LAT = 50.806;
const PORTSEA_LNG = -1.070;

// ---------------------------------------------------------------------------
// Raw API types
// ---------------------------------------------------------------------------

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
 * Fetch city-level AQ data for Portsmouth from IQAir.
 * Returns `null` (does not throw) when the key is missing or the request fails,
 * so callers can degrade gracefully.
 */
export async function fetchIQAirPortsmouth(
  apiKey: string,
): Promise<IQAirStation | null> {
  const url =
    `${BASE_URL}/city?city=Portsmouth&state=England&country=UK&key=${apiKey}`;

  const response = await axios.get<IQAirCityResponse>(url, { timeout: 10_000 });

  console.log(`[iqair] city response — status: "${response.data.status}"`);

  if (response.data.status !== 'success') {
    console.warn(`[iqair] city API error payload:`, JSON.stringify(response.data).slice(0, 300));
    throw new Error(`IQAir city API returned status: ${response.data.status}`);
  }

  const { data } = response.data;
  console.log(`[iqair] city data — "${data.city}, ${data.state}, ${data.country}"  coords: [${data.location.coordinates}]`);
  console.log(`  pollution: AQI(us) ${data.current.pollution.aqius}  main: ${data.current.pollution.mainus}  ts: ${data.current.pollution.ts}`);
  console.log(`  weather: temp ${data.current.weather.tp}°C  humidity ${data.current.weather.hu}%  wind ${data.current.weather.ws} m/s @ ${data.current.weather.wd}°`);

  return normaliseCityResponse(response.data);
}

/**
 * Fetch data for the nearest city to the Portsea Island centroid.
 * Falls back gracefully on error.
 */
export async function fetchIQAirNearestCity(
  apiKey: string,
): Promise<IQAirStation | null> {
  const url =
    `${BASE_URL}/nearest_city?lat=${PORTSEA_LAT}&lon=${PORTSEA_LNG}&key=${apiKey}`;

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
