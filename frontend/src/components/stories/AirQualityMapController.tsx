import React, { useEffect, useRef, useCallback } from 'react';
import { useAppSelector, useAppDispatch } from '../../store';
import {
  setStations, setLastFetchedAt, setLoading, setError,
  type AirQualityStation, type ActivePollutant,
} from '../../store/airQualitySlice';
import { Cartesian3, Color, HeightReference, SceneTransforms, ClassificationType, type Entity } from 'cesium';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatAge(updatedAt: string | null): string {
  if (!updatedAt) return '—';
  const mins = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

function fmt(v: number | null): string {
  return v !== null ? v.toFixed(1) : '—';
}

const POLLUTANT_LABELS: Record<string, string> = {
  pm25: 'PM2.5', pm10: 'PM10', no2: 'NO2', o3: 'O3',
};

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  viewerRef: React.MutableRefObject<any>;
}

export const AirQualityMapController: React.FC<Props> = ({ viewerRef }) => {
  const dispatch = useAppDispatch();
  const activeStory = useAppSelector(state => state.story.activeStory);
  const { stations, refreshInterval, activePollutant, showHeatmap, showBillboards } =
    useAppSelector(state => state.airQuality);

  // Refs for use inside Cesium callbacks (avoid stale closures)
  const stationsRef = useRef<AirQualityStation[]>([]);
  const showBillboardsRef = useRef(showBillboards);
  const billboardsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());
  const stationEntitiesRef = useRef<Entity[]>([]);
  const heatmapEntitiesRef = useRef<Entity[]>([]);

  useEffect(() => { stationsRef.current = stations; }, [stations]);
  useEffect(() => { showBillboardsRef.current = showBillboards; }, [showBillboards]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchStations = useCallback(async () => {
    dispatch(setLoading(true));
    dispatch(setError(null));
    try {
      const res = await fetch('/api/air-quality/stations');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      dispatch(setStations(data.stations ?? []));
      dispatch(setLastFetchedAt(new Date().toISOString()));
    } catch (e: any) {
      dispatch(setError(e?.message ?? 'Failed to fetch air quality data'));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  useEffect(() => {
    if (activeStory !== 'air-quality') return;
    fetchStations();
    const id = setInterval(fetchStations, refreshInterval * 60 * 1000);
    return () => clearInterval(id);
  }, [activeStory, refreshInterval, fetchStations]);

  // ── Station point markers ──────────────────────────────────────────────────

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    // Clear previous
    stationEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    stationEntitiesRef.current = [];

    if (activeStory === 'air-quality') {
      stations.forEach(station => {
        const color = Color.fromCssColorString(station.aqiColor);
        const entity = viewer.entities.add({
          position: Cartesian3.fromDegrees(station.lng, station.lat, 5),
          point: {
            pixelSize: 18,
            color,
            outlineColor: Color.WHITE.withAlpha(0.6),
            outlineWidth: 2,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            heightReference: HeightReference.CLAMP_TO_GROUND,
          },
        });
        stationEntitiesRef.current.push(entity);
      });
      if (!viewer.isDestroyed()) viewer.scene.requestRender();
    }

    return () => {
      if (!viewer.isDestroyed()) {
        stationEntitiesRef.current.forEach(e => viewer.entities.remove(e));
        stationEntitiesRef.current = [];
        viewer.scene.requestRender();
      }
    };
  }, [stations, activeStory, viewerRef]);

  // ── Heatmap ellipses ───────────────────────────────────────────────────────

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    heatmapEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    heatmapEntitiesRef.current = [];

    if (activeStory === 'air-quality' && showHeatmap) {
      stations.forEach(station => {
        const color = Color.fromCssColorString(station.aqiColor).withAlpha(0.28);
        const entity = viewer.entities.add({
          position: Cartesian3.fromDegrees(station.lng, station.lat),
          ellipse: {
            semiMajorAxis: 650,
            semiMinorAxis: 650,
            material: color,
            outline: false,
            heightReference: HeightReference.CLAMP_TO_GROUND,
            classificationType: ClassificationType.BOTH,
          },
        });
        heatmapEntitiesRef.current.push(entity);
      });
      if (!viewer.isDestroyed()) viewer.scene.requestRender();
    }

    return () => {
      if (!viewer.isDestroyed()) {
        heatmapEntitiesRef.current.forEach(e => viewer.entities.remove(e));
        heatmapEntitiesRef.current = [];
        viewer.scene.requestRender();
      }
    };
  }, [stations, showHeatmap, activeStory, viewerRef]);

  // ── Billboard DOM positioning (preRender) ──────────────────────────────────

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer) return;

    const updatePositions = () => {
      billboardsRef.current.forEach((el, id) => {
        if (!el) return;
        if (!showBillboardsRef.current) {
          el.style.display = 'none';
          return;
        }
        const station = stationsRef.current.find(s => s.id === id);
        if (!station) { el.style.display = 'none'; return; }
        const pos = Cartesian3.fromDegrees(station.lng, station.lat, 200);
        const winPos = SceneTransforms.worldToWindowCoordinates(viewer.scene, pos);
        if (winPos) {
          el.style.display = 'block';
          el.style.transform = `translate(-50%, -100%) translate(${winPos.x}px, ${winPos.y - 15}px)`;
        } else {
          el.style.display = 'none';
        }
      });
    };

    const removeListener = viewer.scene.preRender.addEventListener(updatePositions);
    return () => removeListener();
  }, [stations, viewerRef]);

  // ── Render billboard divs ──────────────────────────────────────────────────

  if (activeStory !== 'air-quality') return null;

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '100%', height: '100%',
      pointerEvents: 'none', zIndex: 100, overflow: 'hidden',
    }}>
      {showBillboards && stations.map(station => (
        <AirQualityBillboard
          key={station.id}
          station={station}
          activePollutant={activePollutant}
          billboardRef={el => {
            if (el) billboardsRef.current.set(station.id, el);
            else billboardsRef.current.delete(station.id);
          }}
        />
      ))}
    </div>
  );
};

// ─── Billboard card ───────────────────────────────────────────────────────────

interface BillboardProps {
  station: AirQualityStation;
  activePollutant: ActivePollutant;
  billboardRef: (el: HTMLDivElement | null) => void;
}

const AirQualityBillboard: React.FC<BillboardProps> = ({ station, activePollutant, billboardRef }) => {
  const color = station.aqiColor;
  const pollutants: Array<[keyof typeof station.pollutants, string]> = [
    ['pm25', 'PM2.5'], ['pm10', 'PM10'], ['no2', 'NO2'], ['o3', 'O3'],
  ];

  return (
    <div
      ref={billboardRef}
      style={{
        position: 'absolute', top: 0, left: 0,
        display: 'none',
        fontFamily: '"Inter", "system-ui", sans-serif',
        minWidth: '200px',
        background: 'rgba(14, 16, 20, 0.92)',
        border: `1px solid ${color}55`,
        borderTop: `3px solid ${color}`,
        borderRadius: '4px 4px 4px 4px',
        padding: '10px 12px',
        boxShadow: `0 8px 32px rgba(0,0,0,0.7), 0 0 12px ${color}22`,
        backdropFilter: 'blur(10px)',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {/* Station name */}
      <div style={{ fontSize: '11px', color: '#aaa', marginBottom: '6px', letterSpacing: '0.03em' }}>
        {station.name}
      </div>

      {/* AQI badge + category */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <span style={{
          background: color,
          color: isDark(color) ? '#fff' : '#000',
          fontWeight: 700,
          fontSize: '22px',
          lineHeight: 1,
          padding: '3px 8px',
          borderRadius: '2px',
          minWidth: '48px',
          textAlign: 'center',
        }}>
          {station.aqi ?? '—'}
        </span>
        <div>
          <div style={{ color, fontWeight: 600, fontSize: '12px' }}>{station.aqiCategory}</div>
          {station.dominantPollutant && (
            <div style={{ color: '#666', fontSize: '10px' }}>
              ↑ {POLLUTANT_LABELS[station.dominantPollutant] ?? station.dominantPollutant}
            </div>
          )}
        </div>
      </div>

      {/* Pollutant grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px' }}>
        {pollutants.map(([key, label]) => {
          const isActive = activePollutant === key;
          return (
            <div key={key} style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', gap: '4px' }}>
              <span style={{ color: isActive ? '#00ffcc' : '#555', fontWeight: isActive ? 600 : 400 }}>
                {label}
              </span>
              <span style={{ color: isActive ? '#fff' : '#888' }}>
                {fmt(station.pollutants[key])}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '7px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '10px', color: '#555' }}>↻ {formatAge(station.updatedAt)}</span>
        {station.isStale && (
          <span style={{ fontSize: '10px', color: '#ff6b6b', fontWeight: 500 }}>STALE</span>
        )}
        <span style={{ fontSize: '9px', color: '#444', textTransform: 'uppercase' }}>{station.source}</span>
      </div>

      {/* Downward pointer */}
      <div style={{
        position: 'absolute', bottom: -8, left: '50%',
        transform: 'translateX(-50%)',
        width: 0, height: 0,
        borderLeft: '7px solid transparent',
        borderRight: '7px solid transparent',
        borderTop: `8px solid ${color}55`,
      }}>
        <div style={{
          position: 'absolute', top: -9, left: -6,
          width: 0, height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '8px solid rgba(14, 16, 20, 0.92)',
        }} />
      </div>
    </div>
  );
};

// Returns true if the hex color is perceptually dark (so we use white text)
function isDark(hex: string): boolean {
  const c = hex.replace('#', '');
  if (c.length !== 6) return true;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) < 140;
}
