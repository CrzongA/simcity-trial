import React, { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  setRefreshInterval, setShowTrails, toggleHiddenType, clearHiddenTypes,
  setVessels, setLastFetchedAt, setLoading, setError,
  VESSEL_TYPE_COLORS, VESSEL_CATEGORY_LABELS, ALL_VESSEL_CATEGORIES,
  type RefreshInterval, type VesselCategory,
} from '../../store/shipTrackingSlice';

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

export const ShipTrackingMenu: React.FC = () => {
  const dispatch = useAppDispatch();
  const { vessels, lastFetchedAt, loading, error, refreshInterval, showTrails, hiddenTypes } =
    useAppSelector(state => state.shipTracking);

  const handleRefresh = useCallback(async () => {
    dispatch(setLoading(true));
    dispatch(setError(null));
    try {
      const res = await fetch('/api/ship-tracking/vessels');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      dispatch(setVessels(data.vessels ?? []));
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

  const visibleCount = vessels.filter(v => !hiddenTypes.includes(v.vesselType)).length;

  const INTERVALS: { v: RefreshInterval; label: string }[] = [
    { v: 30, label: '30s' },
    { v: 60, label: '60s' },
    { v: 120, label: '2m' },
  ];

  return (
    <div style={PANEL_STYLE}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', letterSpacing: '0.02em' }}>
            Ship Tracking
          </div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>
            {visibleCount}/{vessels.length} vessel{vessels.length !== 1 ? 's' : ''} · {lastUpdated}
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

      {/* Vessel type filters */}
      <div style={{ marginBottom: '10px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
          <div style={SECTION_LABEL}>Vessel Types</div>
          {hiddenTypes.length > 0 && (
            <button
              onClick={() => dispatch(clearHiddenTypes())}
              style={{ background: 'transparent', border: 'none', color: '#00ffcc', fontSize: '10px', cursor: 'pointer', padding: 0 }}
            >
              show all
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {ALL_VESSEL_CATEGORIES.map((cat: VesselCategory) => {
            const hidden = hiddenTypes.includes(cat);
            const count = vessels.filter(v => v.vesselType === cat).length;
            const color = VESSEL_TYPE_COLORS[cat];
            return (
              <button
                key={cat}
                onClick={() => dispatch(toggleHiddenType(cat))}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: hidden ? 'transparent' : `${color}18`,
                  border: hidden ? '1px solid rgba(255,255,255,0.08)' : `1px solid ${color}55`,
                  borderRadius: '2px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                  opacity: hidden ? 0.4 : 1,
                  width: '100%',
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: hidden ? '#555' : color, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', color: hidden ? '#555' : '#ccc', flex: 1, textAlign: 'left' }}>
                  {VESSEL_CATEGORY_LABELS[cat]}
                </span>
                {count > 0 && (
                  <span style={{ fontSize: '11px', color: hidden ? '#444' : color, fontWeight: 600 }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Layers */}
      <div style={{ marginBottom: '10px' }}>
        <div style={SECTION_LABEL}>Layers</div>
        <div style={ROW}>
          <span style={{ fontSize: '13px' }}>Trails</span>
          <Toggle value={showTrails} onChange={v => dispatch(setShowTrails(v))} />
        </div>
      </div>

      {/* Refresh interval */}
      <div style={{ marginBottom: '10px' }}>
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

      {/* Vessel list */}
      {vessels.length > 0 && (
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '10px' }}>
          <div style={SECTION_LABEL}>Vessels</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '160px', overflowY: 'auto' }}>
            {vessels
              .filter(v => !hiddenTypes.includes(v.vesselType))
              .map(v => (
                <div key={v.mmsi} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: VESSEL_TYPE_COLORS[v.vesselType],
                    flexShrink: 0,
                  }} />
                  <span style={{ color: '#aaa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                    {v.name}
                  </span>
                  {v.speed != null && (
                    <span style={{ color: '#555', flexShrink: 0 }}>{v.speed.toFixed(1)} kn</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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
