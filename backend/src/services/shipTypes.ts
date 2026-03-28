/**
 * Shared types and utilities for ship-tracking data providers.
 *
 * Both VesselFinder and MyShipTracking normalise their raw API responses
 * into these shapes so the route layer is provider-agnostic.
 */

// ---------------------------------------------------------------------------
// Portsmouth Harbour + Solent bounding box
// ---------------------------------------------------------------------------

export const PORTSMOUTH_SHIP_BBOX = {
  minLat: 50.755,
  maxLat: 50.875,
  minLon: -1.175,
  maxLon: -1.020,
};

// ---------------------------------------------------------------------------
// Vessel type classification
// ---------------------------------------------------------------------------

export type VesselCategory =
  | 'fishing'
  | 'military'
  | 'sailing'
  | 'pleasure'
  | 'passenger'
  | 'cargo'
  | 'tanker'
  | 'other';

export const VESSEL_TYPE_COLORS: Record<VesselCategory, string> = {
  fishing:   '#22c55e',
  military:  '#ef4444',
  sailing:   '#f59e0b',
  pleasure:  '#06b6d4',
  passenger: '#a855f7',
  cargo:     '#4a9eff',
  tanker:    '#ff6b35',
  other:     '#94a3b8',
};

export function classifyVesselType(vtype: number | null): VesselCategory {
  if (vtype === null) return 'other';
  if (vtype === 30)                    return 'fishing';
  if (vtype === 35)                    return 'military';
  if (vtype === 36)                    return 'sailing';
  if (vtype === 37)                    return 'pleasure';
  if (vtype >= 60 && vtype <= 69)      return 'passenger';
  if (vtype >= 70 && vtype <= 79)      return 'cargo';
  if (vtype >= 80 && vtype <= 89)      return 'tanker';
  return 'other';
}

// ---------------------------------------------------------------------------
// Normalised vessel shapes
// ---------------------------------------------------------------------------

export interface NormalisedVessel {
  mmsi: string;
  imo: string | null;
  name: string;
  lat: number;
  lon: number;
  course: number | null;   // COG degrees 0–360
  speed: number | null;    // SOG knots
  vtypeCode: number | null;
  vesselType: VesselCategory;
  vesselTypeLabel: string | null;
  navStatus: number | null;
  receivedAt: string | null;
  isStale: boolean;
}

export interface NormalisedVesselDetail extends NormalisedVessel {
  callsign: string | null;
  flag: string | null;
  destination: string | null;
  eta: string | null;
  length: number | null;
  width: number | null;
  draught: number | null;
}
