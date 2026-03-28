/**
 * VesselFinder AIS API client (primary ship-tracking provider).
 *
 * Docs: https://api.vesselfinder.com/docs/
 *
 * Zone query:    GET /livedata?userkey=KEY&format=json&interval=60&bbox=minlat,minlon,maxlat,maxlon
 * Vessel detail: GET /vessels?userkey=KEY&mmsi=MMSI&format=json
 *
 * Auth: userkey query parameter
 */

import axios from 'axios';
import {
  PORTSMOUTH_SHIP_BBOX,
  classifyVesselType,
  type NormalisedVessel,
  type NormalisedVesselDetail,
} from './shipTypes';

const BASE_URL = 'https://api.vesselfinder.com';

// ---------------------------------------------------------------------------
// Raw API types
// ---------------------------------------------------------------------------

interface RawAIS {
  MMSI?: string | number;
  IMO?: string | number;
  NAME?: string;
  CALLSIGN?: string;
  TYPE?: string | number;
  NAVSTAT?: string | number;
  HEADING?: string | number;
  COURSE?: string | number;
  SPEED?: string | number;
  LATITUDE?: string | number;
  LONGITUDE?: string | number;
  TIMESTAMP?: string;
  DESTINATION?: string;
  ETA?: string;
  DRAUGHT?: string | number;
  /** Length (bow to GPS) */
  A?: string | number;
  /** Length (GPS to stern) */
  B?: string | number;
  /** Beam (GPS to port) */
  C?: string | number;
  /** Beam (GPS to starboard) */
  D?: string | number;
}

interface RawMasterData {
  VESSEL_TYPE?: string;
  FLAG?: string;
  LENGTH?: string | number;
  BEAM?: string | number;
}

interface RawVesselFinderEntry {
  AIS?: RawAIS;
  MASTERDATA?: RawMasterData;
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function num(v: string | number | undefined | null): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function str(v: string | number | undefined | null): string | null {
  if (v == null || v === '') return null;
  return String(v);
}

function normalise(entry: RawVesselFinderEntry): NormalisedVessel | null {
  const a = entry.AIS;
  if (!a) return null;

  const mmsi = str(a.MMSI);
  if (!mmsi) return null;

  const lat = num(a.LATITUDE);
  const lon = num(a.LONGITUDE);
  if (lat == null || lon == null) return null;

  const vtypeCode = num(a.TYPE);

  return {
    mmsi,
    imo: str(a.IMO),
    name: a.NAME?.trim() || 'Unknown',
    lat,
    lon,
    course: num(a.COURSE),
    speed: num(a.SPEED),
    vtypeCode,
    vesselType: classifyVesselType(vtypeCode),
    vesselTypeLabel: null,
    navStatus: num(a.NAVSTAT),
    receivedAt: a.TIMESTAMP ?? null,
    isStale: false,
  };
}

function normaliseDetail(entry: RawVesselFinderEntry): NormalisedVesselDetail | null {
  const base = normalise(entry);
  if (!base) return null;

  const a = entry.AIS!;
  const m = entry.MASTERDATA;

  // VesselFinder gives length as A+B (bow-to-GPS + GPS-to-stern)
  const lenA = num(a.A);
  const lenB = num(a.B);
  const length = lenA != null && lenB != null ? lenA + lenB : num(m?.LENGTH) ?? null;

  // Beam as C+D (port + starboard from GPS)
  const beamC = num(a.C);
  const beamD = num(a.D);
  const beam = beamC != null && beamD != null ? beamC + beamD : num(m?.BEAM) ?? null;

  return {
    ...base,
    vesselTypeLabel: m?.VESSEL_TYPE ?? null,
    callsign: str(a.CALLSIGN),
    flag: m?.FLAG ?? null,
    destination: str(a.DESTINATION),
    eta: str(a.ETA),
    length,
    width: beam,
    draught: num(a.DRAUGHT),
  };
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

/**
 * Fetch all vessels currently in the Portsmouth Harbour bounding box.
 */
export async function fetchVesselsInZone(apiKey: string): Promise<NormalisedVessel[]> {
  const { minLat, maxLat, minLon, maxLon } = PORTSMOUTH_SHIP_BBOX;
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;

  const res = await axios.get<RawVesselFinderEntry[] | { vessels?: RawVesselFinderEntry[] }>(
    `${BASE_URL}/livedata`,
    {
      params: { userkey: apiKey, format: 'json', interval: 60, bbox },
      timeout: 15_000,
    },
  );

  const raw: RawVesselFinderEntry[] = Array.isArray(res.data)
    ? res.data
    : (res.data as any)?.vessels ?? [];

  const vessels: NormalisedVessel[] = [];
  for (const entry of raw) {
    const v = normalise(entry);
    if (v) vessels.push(v);
  }
  return vessels;
}

/**
 * Fetch extended detail for a single vessel by MMSI.
 */
export async function fetchVesselDetail(
  mmsi: string,
  apiKey: string,
): Promise<NormalisedVesselDetail> {
  const res = await axios.get<RawVesselFinderEntry[] | RawVesselFinderEntry>(
    `${BASE_URL}/vessels`,
    {
      params: { userkey: apiKey, mmsi, format: 'json' },
      timeout: 15_000,
    },
  );

  const entries: RawVesselFinderEntry[] = Array.isArray(res.data)
    ? res.data
    : [res.data as RawVesselFinderEntry];

  const detail = normaliseDetail(entries[0] ?? {});
  if (!detail) throw new Error(`No vessel data returned for MMSI ${mmsi}`);
  return detail;
}
