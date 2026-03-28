import React, { useEffect, useRef, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../../store';
import {
  setVessels, setLastFetchedAt, setLoading, setError, setSelectedMmsi,
  VESSEL_TYPE_COLORS, type Vessel, type VesselCategory,
} from '../../store/shipTrackingSlice';
import {
  Cartesian3, Color, Math as CesiumMath, SceneTransforms, PolygonHierarchy,
  type Entity,
} from 'cesium';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRAIL_MAX_POINTS = 20;

// Ship geometry (metres from vessel centre along heading / beam axes)
const HULL_HALF_LEN   = 25;   // ± from centre → total 50 m hull
const HULL_HALF_BEAM  = 7;    // ± from centreline → 14 m beam
const HULL_TAPER_FWD  = 12;   // last 12 m from bow/stern taper to a point
const HULL_HEIGHT     = 5;    // waterline → deck (m)
const BRIDGE_FWD      = 5;    // forward edge of bridge from vessel centre (m)
const BRIDGE_AFT      = -8;   // aft edge of bridge from vessel centre (m)
const BRIDGE_HALF_B   = 4;    // bridge half-beam (m)
const BRIDGE_TOP      = 10;   // total height above waterline to top of bridge (m)

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/**
 * Convert ship-local (fwd, stbd, upM) to world Cartesian3.
 *
 * Heading convention: 0° = North, 90° = East (AIS standard, clockwise).
 *   east  = sin(H)·fwd + cos(H)·stbd
 *   north = cos(H)·fwd − sin(H)·stbd
 *
 * upM is the WGS-84 ellipsoid altitude (add baseHeight to put at sea level).
 */
function shipPt(
  baseLat: number, baseLon: number,
  sinH: number, cosH: number,
  fwd: number, stbd: number, upM: number,
): Cartesian3 {
  const R_LAT = 111_000;
  const R_LON = 111_000 * Math.cos(CesiumMath.toRadians(baseLat));
  return Cartesian3.fromDegrees(
    baseLon + (sinH * fwd + cosH * stbd) / R_LON,
    baseLat + (cosH * fwd - sinH * stbd) / R_LAT,
    upM,
  );
}

/** Return the six hull vertices (for PolygonHierarchy / polygon outline). */
function hullPolygon(
  lat: number, lon: number, sinH: number, cosH: number, baseAlt: number,
): Cartesian3[] {
  // ship-frame (fwd, stbd) for each vertex — pointed bow and stern, full beam midships
  return [
    shipPt(lat, lon, sinH, cosH,  HULL_HALF_LEN,                     0,                  baseAlt), // bow tip
    shipPt(lat, lon, sinH, cosH,  HULL_HALF_LEN - HULL_TAPER_FWD,  HULL_HALF_BEAM,      baseAlt), // stbd fwd shoulder
    shipPt(lat, lon, sinH, cosH, -HULL_HALF_LEN + HULL_TAPER_FWD,  HULL_HALF_BEAM,      baseAlt), // stbd aft shoulder
    shipPt(lat, lon, sinH, cosH, -HULL_HALF_LEN,                    0,                  baseAlt), // stern
    shipPt(lat, lon, sinH, cosH, -HULL_HALF_LEN + HULL_TAPER_FWD, -HULL_HALF_BEAM,      baseAlt), // port aft shoulder
    shipPt(lat, lon, sinH, cosH,  HULL_HALF_LEN - HULL_TAPER_FWD, -HULL_HALF_BEAM,      baseAlt), // port fwd shoulder
  ];
}

/** Return the four bridge vertices (rectangular superstructure). */
function bridgePolygon(
  lat: number, lon: number, sinH: number, cosH: number, baseAlt: number,
): Cartesian3[] {
  return [
    shipPt(lat, lon, sinH, cosH, BRIDGE_FWD,  BRIDGE_HALF_B,  baseAlt),
    shipPt(lat, lon, sinH, cosH, BRIDGE_AFT,  BRIDGE_HALF_B,  baseAlt),
    shipPt(lat, lon, sinH, cosH, BRIDGE_AFT, -BRIDGE_HALF_B,  baseAlt),
    shipPt(lat, lon, sinH, cosH, BRIDGE_FWD, -BRIDGE_HALF_B,  baseAlt),
  ];
}

// ---------------------------------------------------------------------------
// Info card helpers
// ---------------------------------------------------------------------------

function formatAge(receivedAt: string | null): string {
  if (!receivedAt) return '—';
  const mins = Math.floor((Date.now() - new Date(receivedAt).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function navStatusLabel(status: number | null): string | null {
  if (status === null) return null;
  const map: Record<number, string> = {
    0: 'Underway (engine)', 1: 'At anchor', 2: 'Not under command',
    3: 'Restricted manoeuvrability', 5: 'Moored', 6: 'Aground',
    7: 'Fishing', 8: 'Underway (sailing)', 15: 'Unknown',
  };
  return map[status] ?? `Status ${status}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  viewerRef:  React.MutableRefObject<any>;
  baseHeight: number; // WGS-84 ellipsoid height of sea level at Portsmouth (~47 m)
}

export const ShipTrackingMapController: React.FC<Props> = ({ viewerRef, baseHeight }) => {
  const dispatch = useAppDispatch();
  const activeStory = useAppSelector(s => s.story.activeStory);
  const { vessels, refreshInterval, showTrails, hiddenTypes, selectedMmsi } =
    useAppSelector(s => s.shipTracking);

  const vesselsRef      = useRef<Vessel[]>([]);
  const selectedRef     = useRef<string | null>(null);
  const hiddenRef       = useRef<VesselCategory[]>([]);
  const showTrailsRef   = useRef(showTrails);
  const baseHeightRef   = useRef(baseHeight);

  const entitiesRef = useRef<Map<string, Entity[]>>(new Map());
  const trailsRef   = useRef<Map<string, Array<{ lat: number; lon: number }>>>(new Map());
  const infoDivRef  = useRef<HTMLDivElement | null>(null);

  useEffect(() => { vesselsRef.current    = vessels;      }, [vessels]);
  useEffect(() => { selectedRef.current   = selectedMmsi; }, [selectedMmsi]);
  useEffect(() => { hiddenRef.current     = hiddenTypes;  }, [hiddenTypes]);
  useEffect(() => { showTrailsRef.current = showTrails;   }, [showTrails]);
  useEffect(() => { baseHeightRef.current = baseHeight;   }, [baseHeight]);

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const fetchVessels = useCallback(async () => {
    dispatch(setLoading(true));
    dispatch(setError(null));
    try {
      const res = await fetch('/api/ship-tracking/vessels');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      dispatch(setVessels(data.vessels ?? []));
      dispatch(setLastFetchedAt(new Date().toISOString()));
    } catch (e: any) {
      dispatch(setError(e?.message ?? 'Failed to fetch vessel data'));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  useEffect(() => {
    if (activeStory !== 'ship-tracking') return;
    fetchVessels();
    const id = setInterval(fetchVessels, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [activeStory, refreshInterval, fetchVessels]);

  // ---------------------------------------------------------------------------
  // Trail accumulation
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (activeStory !== 'ship-tracking') return;
    vessels.forEach(v => {
      const trail = trailsRef.current.get(v.mmsi) ?? [];
      const last  = trail[trail.length - 1];
      if (!last || last.lat !== v.lat || last.lon !== v.lon) {
        trailsRef.current.set(v.mmsi, [...trail, { lat: v.lat, lon: v.lon }].slice(-TRAIL_MAX_POINTS));
      }
    });
  }, [vessels, activeStory]);

  // ---------------------------------------------------------------------------
  // Cesium entity management — solid extruded polygons
  // ---------------------------------------------------------------------------

  function clearEntities(viewer: any) {
    entitiesRef.current.forEach(list => list.forEach(e => viewer.entities.remove(e)));
    entitiesRef.current.clear();
  }

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    clearEntities(viewer);

    if (activeStory !== 'ship-tracking') {
      trailsRef.current.clear();
      dispatch(setSelectedMmsi(null));
      viewer.scene.requestRender();
      return;
    }

    // Use the current baseHeight ref so we always have the latest sampled value
    const base = baseHeightRef.current;

    vessels
      .filter(v => !hiddenTypes.includes(v.vesselType))
      .forEach(vessel => {
        const color      = VESSEL_TYPE_COLORS[vessel.vesselType];
        const hullCol    = Color.fromCssColorString(color);
        const bridgeCol  = hullCol.brighten(0.3, new Color());
        const isSelected = selectedMmsi === vessel.mmsi;
        const course     = vessel.course ?? 0;
        const sinH       = Math.sin(CesiumMath.toRadians(course));
        const cosH       = Math.cos(CesiumMath.toRadians(course));
        const list: Entity[] = [];
        const { lat, lon, mmsi } = vessel;

        // ── Hull solid (extruded polygon: waterline → deck) ─────────────────
        list.push(viewer.entities.add({
          id: `ship-${mmsi}-hull`,
          polygon: {
            hierarchy:      new PolygonHierarchy(hullPolygon(lat, lon, sinH, cosH, base)),
            height:         base,
            extrudedHeight: base + HULL_HEIGHT,
            material:       hullCol.withAlpha(isSelected ? 0.95 : 0.82),
            outline:        true,
            outlineColor:   hullCol.brighten(0.2, new Color()),
            outlineWidth:   isSelected ? 2 : 1,
          },
        }));

        // ── Bridge solid (extruded polygon: deck → bridge top) ──────────────
        list.push(viewer.entities.add({
          id: `ship-${mmsi}-bridge`,
          polygon: {
            hierarchy:      new PolygonHierarchy(bridgePolygon(lat, lon, sinH, cosH, base + HULL_HEIGHT)),
            height:         base + HULL_HEIGHT,
            extrudedHeight: base + BRIDGE_TOP,
            material:       bridgeCol.withAlpha(isSelected ? 1.0 : 0.9),
            outline:        true,
            outlineColor:   Color.WHITE.withAlpha(0.5),
            outlineWidth:   1,
          },
        }));

        // ── Heading arrow (from bow tip, deck level, scaled by speed) ────────
        const arrowLen = 80 + (vessel.speed ?? 0) * 8;
        const bowTip   = shipPt(lat, lon, sinH, cosH, HULL_HALF_LEN,            0, base + HULL_HEIGHT);
        const arrowEnd = shipPt(lat, lon, sinH, cosH, HULL_HALF_LEN + arrowLen, 0, base + HULL_HEIGHT);
        list.push(viewer.entities.add({
          id: `ship-${mmsi}-arrow`,
          polyline: {
            positions:         [bowTip, arrowEnd],
            width:             isSelected ? 2.5 : 1.5,
            material:          hullCol.withAlpha(0.8),
            depthFailMaterial: hullCol.withAlpha(0.25),
            followSurface:     false,
          },
        }));

        // ── Trail (previous positions, draped on ground) ─────────────────────
        const trailPts = trailsRef.current.get(mmsi) ?? [];
        if (showTrails && trailPts.length > 1) {
          list.push(viewer.entities.add({
            id: `ship-${mmsi}-trail`,
            polyline: {
              positions:    trailPts.map(p => Cartesian3.fromDegrees(p.lon, p.lat, 0.5)),
              width:        1.5,
              material:     hullCol.withAlpha(0.4),
              clampToGround: true,
            },
          }));
        }

        entitiesRef.current.set(mmsi, list);
      });

    viewer.scene.requestRender();

    return () => {
      if (!viewer.isDestroyed()) {
        clearEntities(viewer);
        viewer.scene.requestRender();
      }
    };
  }, [vessels, activeStory, hiddenTypes, showTrails, selectedMmsi, baseHeight, viewerRef]);

  // ---------------------------------------------------------------------------
  // Click handling
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    if (activeStory !== 'ship-tracking') return;

    const onClick = (e: any) => {
      const picked = viewer.scene.pick(e.position);
      if (!picked?.id?.id) { dispatch(setSelectedMmsi(null)); return; }
      const entityId: string = picked.id.id;
      if (entityId.startsWith('ship-')) {
        const mmsi = entityId.split('-')[1];
        if (mmsi) {
          dispatch(setSelectedMmsi(mmsi === selectedRef.current ? null : mmsi));
          return;
        }
      }
      dispatch(setSelectedMmsi(null));
    };

    viewer.screenSpaceEventHandler.setInputAction(onClick, 2 /* LEFT_CLICK */);
    return () => {
      if (!viewer.isDestroyed()) viewer.screenSpaceEventHandler.removeInputAction(2);
    };
  }, [activeStory, viewerRef, dispatch]);

  // ---------------------------------------------------------------------------
  // DOM info card positioning (preRender)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const update = () => {
      const div = infoDivRef.current;
      if (!div) return;
      const vessel = selectedRef.current
        ? vesselsRef.current.find(v => v.mmsi === selectedRef.current)
        : null;
      if (!vessel) { div.style.display = 'none'; return; }

      const worldPos = Cartesian3.fromDegrees(vessel.lon, vessel.lat, baseHeightRef.current + BRIDGE_TOP + 5);
      const screen   = SceneTransforms.worldToWindowCoordinates(viewer.scene, worldPos);
      if (!screen) { div.style.display = 'none'; return; }

      div.style.display   = 'block';
      div.style.transform = `translate(-50%, calc(-100% - 12px)) translate(${screen.x}px, ${screen.y}px)`;
    };

    const remove = viewer.scene.preRender.addEventListener(update);
    return () => remove();
  }, [viewerRef]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (activeStory !== 'ship-tracking') return null;

  const selectedVessel = selectedMmsi ? vessels.find(v => v.mmsi === selectedMmsi) : null;

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 5, overflow: 'hidden',
    }}>
      <div ref={infoDivRef} style={{ position: 'absolute', top: 0, left: 0, display: 'none', pointerEvents: 'none' }}>
        {selectedVessel && <VesselInfoCard vessel={selectedVessel} />}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Vessel info card
// ---------------------------------------------------------------------------

const VesselInfoCard: React.FC<{ vessel: Vessel }> = ({ vessel }) => {
  const color = VESSEL_TYPE_COLORS[vessel.vesselType];
  return (
    <div style={{
      fontFamily: '"Inter", "system-ui", sans-serif',
      minWidth: '210px',
      background: 'rgba(14, 16, 20, 0.94)',
      border: `1px solid ${color}55`,
      borderTop: `3px solid ${color}`,
      borderRadius: '4px',
      padding: '10px 12px',
      boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 12px ${color}22`,
      backdropFilter: 'blur(10px)',
      userSelect: 'none',
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
        {vessel.name}
      </div>
      <div style={{ fontSize: '11px', color, marginBottom: '8px', fontWeight: 500, textTransform: 'capitalize' }}>
        {vessel.vesselType}{vessel.vesselTypeLabel ? ` — ${vessel.vesselTypeLabel}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: '8px' }}>
        <Stat label="Speed"   value={vessel.speed  != null ? `${vessel.speed.toFixed(1)} kn` : '—'} />
        <Stat label="Heading" value={vessel.course  != null ? `${Math.round(vessel.course)}°`   : '—'} />
        <Stat label="MMSI"    value={vessel.mmsi} />
        {vessel.imo && <Stat label="IMO" value={vessel.imo} />}
      </div>
      {navStatusLabel(vessel.navStatus) && (
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>
          {navStatusLabel(vessel.navStatus)}
        </div>
      )}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', color: '#555' }}>↻ {formatAge(vessel.receivedAt)}</span>
        {vessel.isStale && <span style={{ fontSize: '10px', color: '#ff6b6b', fontWeight: 500 }}>STALE</span>}
      </div>
      <div style={{
        position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '7px solid transparent', borderRight: '7px solid transparent',
        borderTop: `8px solid ${color}55`,
      }}>
        <div style={{
          position: 'absolute', top: -9, left: -6, width: 0, height: 0,
          borderLeft: '6px solid transparent', borderRight: '6px solid transparent',
          borderTop: '8px solid rgba(14, 16, 20, 0.94)',
        }} />
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: '9px', color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
    <div style={{ fontSize: '12px', color: '#ccc', fontWeight: 500 }}>{value}</div>
  </div>
);
