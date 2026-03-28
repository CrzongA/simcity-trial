import React, { useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  setRefreshInterval, setShowTrails, toggleHiddenType, clearHiddenTypes,
  setAutoRefresh, setVessels, setLastFetchedAt, setLoading, setError,
  VESSEL_TYPE_COLORS, VESSEL_CATEGORY_LABELS, ALL_VESSEL_CATEGORIES,
  type RefreshInterval, type VesselCategory, type Vessel,
} from '../../store/shipTrackingSlice';

const PANEL_STYLE: React.CSSProperties = {
  background: 'rgba(14, 16, 20, 0.92)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '4px',
  padding: '14px 16px',
  fontFamily: '"Inter", "system-ui", sans-serif',
  color: '#ccc',
  width: '240px',
  backdropFilter: 'blur(12px)',
  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  flexShrink: 0,
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
  const { vessels, lastFetchedAt, loading, error, autoRefresh, refreshInterval, showTrails, hiddenTypes, selectedMmsi } =
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

  const selectedVessel = selectedMmsi ? vessels.find(v => v.mmsi === selectedMmsi) : null;

  return (
    <div style={{
      position: 'absolute',
      top: '50%',
      left: 20,
      transform: 'translateY(-50%)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: '10px',
    }}>
      {/* ── Config panel ── */}
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

        {/* Auto-Refresh */}
        <div>
          <div style={ROW}>
            <div style={SECTION_LABEL}>Auto-Refresh</div>
            <Toggle value={autoRefresh} onChange={v => dispatch(setAutoRefresh(v))} />
          </div>
          {autoRefresh && (
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
          )}
        </div>
      </div>

      {/* ── Selected vessel info card ── */}
      {selectedVessel && <VesselInfoCard vessel={selectedVessel} />}
    </div>
  );
};

// ── Vessel info card ──────────────────────────────────────────────────────────

const VesselInfoCard: React.FC<{ vessel: Vessel }> = ({ vessel }) => {
  const color = VESSEL_TYPE_COLORS[vessel.vesselType];
  return (
    <div style={{
      fontFamily: '"Inter", "system-ui", sans-serif',
      width: '200px',
      background: 'rgba(14, 16, 20, 0.92)',
      border: `1px solid ${color}55`,
      borderTop: `3px solid ${color}`,
      borderRadius: '4px',
      padding: '12px 14px',
      boxShadow: `0 8px 32px rgba(0,0,0,0.6), 0 0 12px ${color}22`,
      backdropFilter: 'blur(12px)',
      flexShrink: 0,
    }}>
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#fff', marginBottom: '2px' }}>
        {vessel.name}
      </div>
      <div style={{ fontSize: '11px', color, marginBottom: '10px', fontWeight: 500, textTransform: 'capitalize' }}>
        {vessel.vesselType}{vessel.vesselTypeLabel ? ` — ${vessel.vesselTypeLabel}` : ''}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: '10px' }}>
        <Stat label="Speed"   value={vessel.speed  != null ? `${vessel.speed.toFixed(1)} kn` : '—'} />
        <Stat label="Heading" value={vessel.course  != null ? `${Math.round(vessel.course)}°` : '—'} />
        <Stat label="MMSI"    value={vessel.mmsi} />
        {vessel.imo && <Stat label="IMO" value={vessel.imo} />}
      </div>
      {navStatusLabel(vessel.navStatus) && (
        <div style={{ fontSize: '11px', color: '#888', marginBottom: '8px' }}>
          {navStatusLabel(vessel.navStatus)}
        </div>
      )}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: '5px', display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', color: '#555' }}>↻ {formatAge(vessel.receivedAt)}</span>
        {vessel.isStale && <span style={{ fontSize: '10px', color: '#ff6b6b', fontWeight: 500 }}>STALE</span>}
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
