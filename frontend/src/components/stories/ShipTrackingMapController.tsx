import React, { useEffect, useRef, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../../store';
import {
  setVessels, setLastFetchedAt, setLoading, setError, setSelectedMmsi,
  VESSEL_TYPE_COLORS, type Vessel, type VesselCategory,
} from '../../store/shipTrackingSlice';
import {
  Cartesian3, Color, Math as CesiumMath, PolygonHierarchy,
  PolylineGlowMaterialProperty, type Entity,
} from 'cesium';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRAIL_MAX_POINTS = 20;

// Ship geometry (metres from vessel centre along heading / beam axes)
const HULL_HALF_LEN   = 25;   // ± from centre → total 50 m hull
const HULL_HALF_BEAM  = 7;    // ± from centreline → 14 m beam
const HULL_TAPER_FWD  = 12;   // bow taper: last 12 m narrows to a point
const HULL_HEIGHT     = 5;    // waterline → deck (m)

const BEACON_HEIGHT   = 120;  // vertical beacon line height (m)

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

/** Five-vertex hull: pointed bow, flat stern. */
function hullPolygon(
  lat: number, lon: number, sinH: number, cosH: number, baseAlt: number,
): Cartesian3[] {
  return [
    shipPt(lat, lon, sinH, cosH,  HULL_HALF_LEN,                    0,               baseAlt), // bow tip
    shipPt(lat, lon, sinH, cosH,  HULL_HALF_LEN - HULL_TAPER_FWD,  HULL_HALF_BEAM,  baseAlt), // stbd fwd shoulder
    shipPt(lat, lon, sinH, cosH, -HULL_HALF_LEN,                    HULL_HALF_BEAM,  baseAlt), // stbd stern corner
    shipPt(lat, lon, sinH, cosH, -HULL_HALF_LEN,                   -HULL_HALF_BEAM,  baseAlt), // port stern corner
    shipPt(lat, lon, sinH, cosH,  HULL_HALF_LEN - HULL_TAPER_FWD, -HULL_HALF_BEAM,  baseAlt), // port fwd shoulder
  ];
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
  const { vessels, autoRefresh, refreshInterval, showTrails, hiddenTypes, selectedMmsi } =
    useAppSelector(s => s.shipTracking);

  const vesselsRef      = useRef<Vessel[]>([]);
  const selectedRef     = useRef<string | null>(null);
  const hiddenRef       = useRef<VesselCategory[]>([]);
  const showTrailsRef   = useRef(showTrails);
  const baseHeightRef   = useRef(baseHeight);

  const entitiesRef = useRef<Map<string, Entity[]>>(new Map());
  const trailsRef   = useRef<Map<string, Array<{ lat: number; lon: number }>>>(new Map());

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
    if (!autoRefresh) return;
    const id = setInterval(fetchVessels, refreshInterval * 1000);
    return () => clearInterval(id);
  }, [activeStory, autoRefresh, refreshInterval, fetchVessels]);

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
        const color   = VESSEL_TYPE_COLORS[vessel.vesselType];
        const hullCol = Color.fromCssColorString(color);
        const course  = vessel.course ?? 0;
        const sinH       = Math.sin(CesiumMath.toRadians(course));
        const cosH       = Math.cos(CesiumMath.toRadians(course));
        const list: Entity[] = [];
        const { lat, lon, mmsi } = vessel;
        const selected = String(mmsi) === String(selectedMmsi);

        // ── Hull solid (extruded polygon: waterline → deck) ─────────────────
        list.push(viewer.entities.add({
          id: `ship-${mmsi}-hull`,
          polygon: {
            hierarchy:      new PolygonHierarchy(hullPolygon(lat, lon, sinH, cosH, base)),
            height:         base,
            extrudedHeight: base + HULL_HEIGHT,
            material:       selected
              ? hullCol.brighten(0.4, new Color()).withAlpha(0.95)
              : hullCol.withAlpha(0.82),
            outline:        true,
            outlineColor:   selected
              ? Color.WHITE.withAlpha(0.9)
              : hullCol.brighten(0.2, new Color()),
            outlineWidth:   selected ? 2 : 1,
          },
        }));

        // ── Selection glow ring ─────────────────────────────────────────────
        if (selected) {
          list.push(viewer.entities.add({
            id: `ship-${mmsi}-glow`,
            position: Cartesian3.fromDegrees(lon, lat, base),
            ellipse: {
              semiMajorAxis: 60,
              semiMinorAxis: 60,
              height:        base + 0.5,
              material:      hullCol.withAlpha(0.12),
              outline:       true,
              outlineColor:  hullCol.withAlpha(0.6),
              outlineWidth:  2,
            } as any,
          }));
        }

        // ── Beacon: thick glowing vertical line rising from ship centre ──────
        const deckTop    = base + HULL_HEIGHT;
        const beaconBase = Cartesian3.fromDegrees(lon, lat, deckTop);
        const beaconTop  = Cartesian3.fromDegrees(lon, lat, deckTop + BEACON_HEIGHT);
        list.push(viewer.entities.add({
          id: `ship-${mmsi}-beacon`,
          polyline: {
            positions:     [beaconBase, beaconTop],
            width:         selected ? 8 : 5,
            material:      new PolylineGlowMaterialProperty({
              glowPower:   selected ? 0.7 : 0.4,
              color:       selected
                ? hullCol.brighten(0.3, new Color()).withAlpha(0.85)
                : hullCol.withAlpha(0.55),
            }),
            followSurface: false,
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
  }, [vessels, activeStory, hiddenTypes, showTrails, baseHeight, selectedMmsi, viewerRef]);

  // ---------------------------------------------------------------------------
  // Click handling
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    if (activeStory !== 'ship-tracking') return;

    const onClick = (e: any) => {
      const picked = viewer.scene.pick(e.position);
      const entityId: string | undefined = picked?.id?.id;
      if (!entityId) { dispatch(setSelectedMmsi(null)); return; }

      if (entityId.startsWith('ship-')) {
        // ID format: ship-<mmsi>-<part>  (mmsi is always a 9-digit number)
        const match = entityId.match(/^ship-(\d+)-/);
        const mmsi = match?.[1] ?? null;
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
  // Render
  // ---------------------------------------------------------------------------

  if (activeStory !== 'ship-tracking') return null;

  return null;
};
