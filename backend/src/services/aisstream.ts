/**
 * AISStream.io WebSocket client (primary ship-tracking provider).
 *
 * Docs: https://aisstream.io/documentation
 * Endpoint: wss://stream.aisstream.io/v0/stream
 *
 * Connects on module import, maintains a persistent connection for the server
 * lifetime, and accumulates vessel state in memory from incoming AIS messages.
 *
 * Two message types are consumed:
 *   PositionReport  — lat/lon, COG, SOG, nav status
 *   ShipStaticData  — name, type, dimensions, callsign, destination, ETA
 *
 * Both are merged per MMSI into AISVesselState. Entries expire after
 * VESSEL_TTL_MS of silence (vessel left area or AIS off).
 */

import WebSocket from 'ws';
import {
  PORTSMOUTH_SHIP_BBOX,
  classifyVesselType,
  type NormalisedVessel,
  type NormalisedVesselDetail,
} from './shipTypes';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WS_URL        = 'wss://stream.aisstream.io/v0/stream';
const VESSEL_TTL_MS = 5 * 60 * 1000;   // expire vessels not seen for 5 min
const RECONNECT_MS  = 5_000;

// ---------------------------------------------------------------------------
// In-memory vessel state
// ---------------------------------------------------------------------------

interface AISVesselState {
  mmsi:        string;
  name:        string;
  lat:         number;
  lon:         number;
  receivedAt:  string;
  lastSeen:    number;   // Date.now() timestamp for expiry
  // from PositionReport
  course:      number | null;
  speed:       number | null;
  navStatus:   number | null;
  // from ShipStaticData (arrive separately, may be absent)
  imo:         string | null;
  vtypeCode:   number | null;
  callsign:    string | null;
  destination: string | null;
  eta:         string | null;
  length:      number | null;
  width:       number | null;
  draught:     number | null;
}

const vessels = new Map<string, AISVesselState>();
let connected = false;

// ---------------------------------------------------------------------------
// Raw AISStream message types
// ---------------------------------------------------------------------------

interface AISMetaData {
  MMSI:        number;
  MMSI_String: string;
  ShipName:    string;
  latitude:    number;
  longitude:   number;
  time_utc:    string;
}

interface RawPositionReport {
  UserID:             number;
  Cog:                number;
  Sog:                number;
  TrueHeading:        number;
  NavigationalStatus: number;
  Latitude:           number;
  Longitude:          number;
  Valid:              boolean;
}

interface RawShipStaticData {
  UserID:               number;
  Name:                 string;
  CallSign:             string;
  ImoNumber:            number;
  Type:                 number;
  MaximumStaticDraught: number;
  Destination:          string;
  Eta: {
    Month:  number;
    Day:    number;
    Hour:   number;
    Minute: number;
  };
  Dimension: {
    A: number;  // bow
    B: number;  // stern
    C: number;  // port
    D: number;  // starboard
  };
}

interface AISMessage {
  MessageType: string;
  MetaData:    AISMetaData;
  Message: {
    PositionReport?:  RawPositionReport;
    ShipStaticData?:  RawShipStaticData;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatEta(eta: RawShipStaticData['Eta']): string | null {
  if (!eta || (eta.Month === 0 && eta.Day === 0)) return null;
  const m = String(eta.Month).padStart(2, '0');
  const d = String(eta.Day).padStart(2, '0');
  const h = String(eta.Hour).padStart(2, '0');
  const min = String(eta.Minute).padStart(2, '0');
  return `${m}-${d} ${h}:${min}`;
}

function cleanStr(s: string | undefined | null): string | null {
  if (!s) return null;
  const trimmed = s.replace(/@/g, '').trim();
  return trimmed || null;
}

function toNormalisedVessel(state: AISVesselState): NormalisedVessel {
  return {
    mmsi:           state.mmsi,
    imo:            state.imo,
    name:           state.name,
    lat:            state.lat,
    lon:            state.lon,
    course:         state.course,
    speed:          state.speed,
    vtypeCode:      state.vtypeCode,
    vesselType:     classifyVesselType(state.vtypeCode),
    vesselTypeLabel: null,
    navStatus:      state.navStatus,
    receivedAt:     state.receivedAt,
    isStale:        false,
  };
}

function toNormalisedDetail(state: AISVesselState): NormalisedVesselDetail {
  return {
    ...toNormalisedVessel(state),
    callsign:    state.callsign,
    flag:        null,   // AIS protocol does not include vessel flag/country
    destination: state.destination,
    eta:         state.eta,
    length:      state.length,
    width:       state.width,
    draught:     state.draught,
  };
}

// ---------------------------------------------------------------------------
// Message handlers
// ---------------------------------------------------------------------------

function handlePositionReport(msg: AISMessage): void {
  const pr   = msg.Message.PositionReport!;
  const meta = msg.MetaData;
  if (!pr.Valid) return;

  const mmsi = meta.MMSI_String;
  const existing = vessels.get(mmsi);
  const base: AISVesselState = existing ?? {
    mmsi,
    name:        meta.ShipName?.trim() || 'Unknown',
    lat:         meta.latitude,
    lon:         meta.longitude,
    receivedAt:  meta.time_utc,
    lastSeen:    Date.now(),
    course:      null,
    speed:       null,
    navStatus:   null,
    imo:         null,
    vtypeCode:   null,
    callsign:    null,
    destination: null,
    eta:         null,
    length:      null,
    width:       null,
    draught:     null,
  };

  vessels.set(mmsi, {
    ...base,
    lat:       meta.latitude,
    lon:       meta.longitude,
    receivedAt: meta.time_utc,
    lastSeen:  Date.now(),
    course:    pr.Cog ?? null,
    speed:     pr.Sog ?? null,
    navStatus: pr.NavigationalStatus ?? null,
  });
}

function handleShipStaticData(msg: AISMessage): void {
  const sd   = msg.Message.ShipStaticData!;
  const meta = msg.MetaData;

  const mmsi = meta.MMSI_String;
  const existing = vessels.get(mmsi);
  const base: AISVesselState = existing ?? {
    mmsi,
    name:        cleanStr(sd.Name) ?? meta.ShipName?.trim() ?? 'Unknown',
    lat:         meta.latitude,
    lon:         meta.longitude,
    receivedAt:  meta.time_utc,
    lastSeen:    Date.now(),
    course:      null,
    speed:       null,
    navStatus:   null,
    imo:         null,
    vtypeCode:   null,
    callsign:    null,
    destination: null,
    eta:         null,
    length:      null,
    width:       null,
    draught:     null,
  };

  const lenA = sd.Dimension?.A ?? 0;
  const lenB = sd.Dimension?.B ?? 0;
  const beamC = sd.Dimension?.C ?? 0;
  const beamD = sd.Dimension?.D ?? 0;

  vessels.set(mmsi, {
    ...base,
    lastSeen:    Date.now(),
    imo:         sd.ImoNumber ? String(sd.ImoNumber) : base.imo,
    vtypeCode:   sd.Type ?? base.vtypeCode,
    callsign:    cleanStr(sd.CallSign) ?? base.callsign,
    destination: cleanStr(sd.Destination) ?? base.destination,
    eta:         formatEta(sd.Eta) ?? base.eta,
    length:      (lenA + lenB) > 0 ? lenA + lenB : base.length,
    width:       (beamC + beamD) > 0 ? beamC + beamD : base.width,
    draught:     sd.MaximumStaticDraught > 0 ? sd.MaximumStaticDraught : base.draught,
  });
}

// ---------------------------------------------------------------------------
// WebSocket connection
// ---------------------------------------------------------------------------

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect(): void {
  const apiKey = process.env['AISSTREAM_API_KEY'] ?? '';
  if (!apiKey || apiKey === 'your_key_here') {
    // No key configured — don't attempt connection
    return;
  }

  console.log('[aisstream] connecting…');
  ws = new WebSocket(WS_URL);

  ws.on('open', () => {
    connected = true;
    console.log('[aisstream] connected');

    const { minLat, maxLat, minLon, maxLon } = PORTSMOUTH_SHIP_BBOX;
    const subscription = {
      APIKey:             apiKey,
      BoundingBoxes:      [[[minLat, minLon], [maxLat, maxLon]]],
      FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
    };
    ws!.send(JSON.stringify(subscription));
    console.log('[aisstream] subscribed to Portsmouth bbox');
  });

  ws.on('message', (data: WebSocket.RawData) => {
    try {
      const msg: AISMessage = JSON.parse(data.toString());
      if (msg.MessageType === 'PositionReport')  handlePositionReport(msg);
      if (msg.MessageType === 'ShipStaticData') handleShipStaticData(msg);
    } catch {
      // malformed message — ignore
    }
  });

  ws.on('close', () => {
    connected = false;
    console.warn(`[aisstream] disconnected — reconnecting in ${RECONNECT_MS / 1000}s`);
    scheduleReconnect();
  });

  ws.on('error', (err: Error) => {
    console.error('[aisstream] error:', err.message);
    ws?.terminate();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, RECONNECT_MS);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** All vessels seen within the last VESSEL_TTL_MS. */
export function getVessels(): NormalisedVessel[] {
  const cutoff = Date.now() - VESSEL_TTL_MS;
  const result: NormalisedVessel[] = [];
  for (const [mmsi, state] of vessels) {
    if (state.lastSeen < cutoff) {
      vessels.delete(mmsi);  // prune expired
    } else {
      result.push(toNormalisedVessel(state));
    }
  }
  return result;
}

/** Detail for a specific vessel, or null if not yet seen. */
export function getVesselDetail(mmsi: string): NormalisedVesselDetail | null {
  const state = vessels.get(mmsi);
  if (!state) return null;
  return toNormalisedDetail(state);
}

export function isConnected(): boolean {
  return connected;
}

// ---------------------------------------------------------------------------
// Boot — connect immediately on import if key is present
// ---------------------------------------------------------------------------

connect();
