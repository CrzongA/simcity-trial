/**
 * MyShipTracking API client.
 *
 * Docs: https://api.myshiptracking.com/
 *
 * Zone query:   GET /api/v2/vessel/zone?minlat=…&maxlat=…&minlon=…&maxlon=…&minutesBack=60
 * Vessel detail: GET /api/v2/vessel?mmsi=…&response=extended
 *
 * Auth: Authorization: Bearer API_KEY
 */

import axios from 'axios';
import {
  PORTSMOUTH_SHIP_BBOX,
  classifyVesselType,
  type NormalisedVessel,
  type NormalisedVesselDetail,
} from './shipTypes';

// Re-export so existing imports from this module still work
export {
  PORTSMOUTH_SHIP_BBOX,
  classifyVesselType,
  VESSEL_TYPE_COLORS,
  type VesselCategory,
  type NormalisedVessel,
  type NormalisedVesselDetail,
} from './shipTypes';

const BASE_URL = 'https://api.myshiptracking.com/api/v2';

// ---------------------------------------------------------------------------
// Raw API types (simple response)
// ---------------------------------------------------------------------------

interface RawVessel {
  vessel_name?: string;
  mmsi?: string | number;
  imo?: string | number;
  vtype?: number;
  lat?: number;
  lng?: number;
  course?: number;
  speed?: number;
  nav_status?: number;
  received?: string;
}

interface RawVesselExtended extends RawVessel {
  callsign?: string;
  vessel_type?: string;
  flag?: string;
  destination?: string;
  eta?: string;
  length?: number;
  width?: number;
  draught?: number;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function normalise(raw: RawVessel): NormalisedVessel {
  const vtypeCode = raw.vtype ?? null;
  return {
    mmsi: String(raw.mmsi ?? ''),
    imo: raw.imo != null ? String(raw.imo) : null,
    name: raw.vessel_name || 'Unknown',
    lat: raw.lat ?? 0,
    lon: raw.lng ?? 0,
    course: raw.course ?? null,
    speed: raw.speed ?? null,
    vtypeCode,
    vesselType: classifyVesselType(vtypeCode),
    vesselTypeLabel: null,
    navStatus: raw.nav_status ?? null,
    receivedAt: raw.received ?? null,
    isStale: false,
  };
}

function normaliseExtended(raw: RawVesselExtended): NormalisedVesselDetail {
  const base = normalise(raw);
  return {
    ...base,
    vesselTypeLabel: raw.vessel_type ?? null,
    callsign: raw.callsign ?? null,
    flag: raw.flag ?? null,
    destination: raw.destination ?? null,
    eta: raw.eta ?? null,
    length: raw.length ?? null,
    width: raw.width ?? null,
    draught: raw.draught ?? null,
  };
}

function authHeader(apiKey: string) {
  return { Authorization: `Bearer ${apiKey}` };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Fetch all vessels currently in the Portsmouth Harbour bounding box.
 */
export async function fetchVesselsInZone(apiKey: string): Promise<NormalisedVessel[]> {
  const { minLat, maxLat, minLon, maxLon } = PORTSMOUTH_SHIP_BBOX;
  const url = `${BASE_URL}/vessel/zone`;
  const params = {
    minlat: minLat,
    maxlat: maxLat,
    minlon: minLon,
    maxlon: maxLon,
    minutesBack: 60,
  };

  const res = await axios.get<RawVessel[] | { data?: RawVessel[] }>(url, {
    headers: authHeader(apiKey),
    params,
    timeout: 15_000,
  });

  // API may return array directly or wrapped in { data: [] }
  const raw: RawVessel[] = Array.isArray(res.data)
    ? res.data
    : (res.data as any)?.data ?? [];

  return raw
    .filter((v) => v.mmsi && v.lat != null && v.lng != null)
    .map(normalise);
}

/**
 * Fetch extended detail for a single vessel by MMSI.
 */
export async function fetchVesselDetail(
  mmsi: string,
  apiKey: string,
): Promise<NormalisedVesselDetail> {
  const url = `${BASE_URL}/vessel`;
  const params = { mmsi, response: 'extended' };

  const res = await axios.get<RawVesselExtended | { data?: RawVesselExtended }>(url, {
    headers: authHeader(apiKey),
    params,
    timeout: 15_000,
  });

  const raw: RawVesselExtended = Array.isArray(res.data)
    ? (res.data as RawVesselExtended[])[0]
    : (res.data as any)?.data ?? res.data;

  if (!raw || !raw.mmsi) throw new Error(`No vessel data returned for MMSI ${mmsi}`);
  return normaliseExtended(raw);
}
