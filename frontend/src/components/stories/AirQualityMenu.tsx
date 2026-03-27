import React, { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  setRefreshInterval, setActivePollutant, setShowHeatmap, setShowBillboards,
  setStations, setLastFetchedAt, setLoading, setError,
  type RefreshInterval, type ActivePollutant,
} from '../../store/airQualitySlice';

const PANEL_STYLE: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  left: 20,
  transform: 'translateY(-50%)',
  zIndex: 50,
  background: 'rgba(14, 16, 20, 0.92)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '4px',
  padding: '14px 16px',
  fontFamily: '"Inter", "system-ui", sans-serif',
  color: '#ccc',
  width: '240px',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '1.2px',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: '6px',
};

const ROW: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '6px',
};

export const AirQualityMenu: React.FC = () => {
  const dispatch = useAppDispatch();
  const { stations, lastFetchedAt, loading, error, refreshInterval, activePollutant, showHeatmap, showBillboards } =
    useAppSelector(state => state.airQuality);

  const handleRefresh = useCallback(async () => {
    dispatch(setLoading(true));
    dispatch(setError(null));
    try {
      const res = await fetch('/api/air-quality/stations');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      dispatch(setStations(data.stations ?? []));
      dispatch(setLastFetchedAt(new Date().toISOString()));
    } catch (e: any) {
      dispatch(setError(e?.message ?? 'Fetch failed'));
    } finally {
      dispatch(setLoading(false));
    }
  }, [dispatch]);

  const lastUpdated = lastFetchedAt
    ? new Date(lastFetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '—';

  const POLLUTANTS: { id: ActivePollutant; label: string }[] = [
    { id: 'aqi', label: 'AQI' },
    { id: 'pm25', label: 'PM2.5' },
    { id: 'pm10', label: 'PM10' },
    { id: 'no2', label: 'NO2' },
    { id: 'o3', label: 'O3' },
  ];

  const INTERVALS: { v: RefreshInterval; label: string }[] = [
    { v: 5, label: '5m' },
    { v: 15, label: '15m' },
    { v: 30, label: '30m' },
  ];

  return (
    <div style={PANEL_STYLE}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
            Air Quality
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>
            {stations.length} station{stations.length !== 1 ? 's' : ''} · updated {lastUpdated}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          title="Refresh now"
          style={{
            background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '3px',
            color: loading ? '#555' : '#00ffcc',
            cursor: loading ? 'default' : 'pointer',
            fontSize: '14px',
            padding: '4px 8px',
            transition: 'all 0.2s',
            lineHeight: 1,
          }}
        >
          {loading ? '…' : '↻'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: '12px', color: '#ff6b6b', background: 'rgba(255,107,107,0.1)', border: '1px solid rgba(255,107,107,0.2)', borderRadius: '3px', padding: '5px 8px', marginBottom: '10px' }}>
          {error}
        </div>
      )}

      {/* Active Metric */}
      <div style={{ marginBottom: '10px' }}>
        <div style={SECTION_LABEL}>Highlight Metric</div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {POLLUTANTS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => dispatch(setActivePollutant(id))}
              style={{
                background: activePollutant === id ? 'rgba(0,255,204,0.15)' : 'transparent',
                border: activePollutant === id ? '1px solid #00ffcc' : '1px solid rgba(255,255,255,0.15)',
                color: activePollutant === id ? '#00ffcc' : '#888',
                borderRadius: '2px',
                padding: '3px 8px',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
                fontWeight: activePollutant === id ? 600 : 400,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Layers */}
      <div style={{ marginBottom: '10px' }}>
        <div style={SECTION_LABEL}>Layers</div>
        <div style={ROW}>
          <span style={{ fontSize: '13px' }}>Heatmap</span>
          <Toggle value={showHeatmap} onChange={v => dispatch(setShowHeatmap(v))} />
        </div>
        <div style={ROW}>
          <span style={{ fontSize: '13px' }}>Billboards</span>
          <Toggle value={showBillboards} onChange={v => dispatch(setShowBillboards(v))} />
        </div>
      </div>

      {/* Refresh interval */}
      <div>
        <div style={SECTION_LABEL}>Auto-Refresh</div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {INTERVALS.map(({ v, label }) => (
            <button
              key={v}
              onClick={() => dispatch(setRefreshInterval(v))}
              style={{
                flex: 1,
                background: refreshInterval === v ? 'rgba(0,255,204,0.15)' : 'transparent',
                border: refreshInterval === v ? '1px solid #00ffcc' : '1px solid rgba(255,255,255,0.15)',
                color: refreshInterval === v ? '#00ffcc' : '#888',
                borderRadius: '2px',
                padding: '4px 0',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Station list */}
      {stations.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px' }}>
          <div style={SECTION_LABEL}>Stations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '140px', overflowY: 'auto' }}>
            {stations.map(s => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                <span style={{ color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }}>
                  {s.name}
                </span>
                <span style={{
                  background: s.aqiColor,
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '11px',
                  padding: '1px 5px',
                  borderRadius: '2px',
                  minWidth: '28px',
                  textAlign: 'center',
                  flexShrink: 0,
                }}>
                  {s.aqi ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AQI legend */}
      <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '8px' }}>
        <div style={SECTION_LABEL}>AQI Scale</div>
        <div style={{ display: 'flex', gap: '2px' }}>
          {AQI_LEGEND.map(({ color, label }) => (
            <div key={label} title={label} style={{ flex: 1, height: '6px', background: color, borderRadius: '1px' }} />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
          <span style={{ fontSize: '10px', color: '#555' }}>Good</span>
          <span style={{ fontSize: '10px', color: '#555' }}>Hazardous</span>
        </div>
      </div>
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const AQI_LEGEND = [
  { color: '#00e400', label: 'Good (0–50)' },
  { color: '#ffff00', label: 'Moderate (51–100)' },
  { color: '#ff7e00', label: 'Unhealthy for Sensitive (101–150)' },
  { color: '#ff0000', label: 'Unhealthy (151–200)' },
  { color: '#8f3f97', label: 'Very Unhealthy (201–300)' },
  { color: '#7e0023', label: 'Hazardous (301+)' },
];

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({ value, onChange }) => (
  <div
    onClick={() => onChange(!value)}
    style={{
      width: '32px', height: '18px',
      background: value ? 'rgba(0,255,204,0.3)' : 'rgba(255,255,255,0.1)',
      border: value ? '1px solid #00ffcc' : '1px solid rgba(255,255,255,0.15)',
      borderRadius: '9px',
      cursor: 'pointer',
      position: 'relative',
      transition: 'all 0.2s',
      flexShrink: 0,
    }}
  >
    <div style={{
      position: 'absolute',
      top: '2px',
      left: value ? '14px' : '2px',
      width: '12px', height: '12px',
      borderRadius: '50%',
      background: value ? '#00ffcc' : 'rgba(255,255,255,0.4)',
      transition: 'all 0.2s',
    }} />
  </div>
);
