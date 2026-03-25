import React from 'react';
import { useAppSelector, useAppDispatch } from '../../store';
import { setFlightMode, setSpeedTier } from '../../store/droneSlice';

export interface DroneHUDRefs {
  altRef: React.MutableRefObject<HTMLSpanElement | null>;
  spdRef: React.MutableRefObject<HTMLSpanElement | null>;
  hdgRef: React.MutableRefObject<HTMLSpanElement | null>;
  horizonRef: React.MutableRefObject<SVGLineElement | null>;
  ctrlRef: React.MutableRefObject<HTMLSpanElement | null>;
}

interface DroneHUDProps {
  altRef: React.MutableRefObject<HTMLSpanElement | null>;
  spdRef: React.MutableRefObject<HTMLSpanElement | null>;
  hdgRef: React.MutableRefObject<HTMLSpanElement | null>;
  horizonRef: React.MutableRefObject<SVGLineElement | null>;
  ctrlRef: React.MutableRefObject<HTMLSpanElement | null>;
}

const hudStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 90,
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: 40,
  fontFamily: '"Inter", "system-ui", monospace',
  userSelect: 'none',
};

const panelStyle: React.CSSProperties = {
  background: 'rgba(10, 14, 18, 0.82)',
  border: '1px solid rgba(0, 255, 204, 0.25)',
  borderRadius: '2px',
  backdropFilter: 'blur(6px)',
  padding: '10px 14px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  minWidth: '220px',
};

const badgeRow: React.CSSProperties = {
  display: 'flex',
  gap: '8px',
  width: '100%',
  justifyContent: 'space-between',
};

const badge = (active: boolean, accent?: string): React.CSSProperties => ({
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '1.2px',
  padding: '3px 8px',
  borderRadius: '2px',
  border: `1px solid ${active ? (accent ?? '#00ffcc') : 'rgba(255,255,255,0.15)'}`,
  color: active ? (accent ?? '#00ffcc') : 'rgba(255,255,255,0.35)',
  background: active ? `${(accent ?? '#00ffcc')}18` : 'transparent',
});

const dataRow: React.CSSProperties = {
  display: 'flex',
  gap: '20px',
  width: '100%',
  justifyContent: 'center',
};

const dataCell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '1px',
};

const dataLabel: React.CSSProperties = {
  fontSize: '9px',
  letterSpacing: '1px',
  color: 'rgba(255,255,255,0.4)',
  fontWeight: 600,
};

const dataValue: React.CSSProperties = {
  fontSize: '18px',
  fontWeight: 700,
  color: '#00ffcc',
  lineHeight: 1,
  minWidth: '48px',
  textAlign: 'center',
};

const dataUnit: React.CSSProperties = {
  fontSize: '9px',
  color: 'rgba(255,255,255,0.35)',
  letterSpacing: '0.5px',
};

export const DroneHUD: React.FC<DroneHUDProps> = ({
  altRef,
  spdRef,
  hdgRef,
  horizonRef,
  ctrlRef,
}) => {
  const dispatch = useAppDispatch();
  const flightMode = useAppSelector(state => state.drone.flightMode);
  const speedTier = useAppSelector(state => state.drone.speedTier);

  return (
    <div style={hudStyle}>
      <div style={panelStyle}>

        {/* Badges row */}
        <div style={badgeRow}>
          <button
            style={{ ...badge(flightMode === 'angle'), cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => dispatch(setFlightMode('angle'))}
          >ANGLE</button>
          <button
            style={{ ...badge(flightMode === 'acro', '#ff6644'), cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => dispatch(setFlightMode('acro'))}
          >ACRO</button>
          <span style={{ width: 1, background: 'rgba(255,255,255,0.1)' }} />
          <button
            style={{ ...badge(speedTier === 'slow', '#aaccff'), cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => dispatch(setSpeedTier('slow'))}
          >SLOW</button>
          <button
            style={{ ...badge(speedTier === 'normal', '#00ffcc'), cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => dispatch(setSpeedTier('normal'))}
          >NRM</button>
          <button
            style={{ ...badge(speedTier === 'sport', '#ff4444'), cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={() => dispatch(setSpeedTier('sport'))}
          >SPORT</button>
        </div>

        {/* Artificial horizon SVG */}
        <svg
          width="120"
          height="60"
          viewBox="0 0 120 60"
          style={{ display: 'block', overflow: 'hidden', borderRadius: '2px', border: '1px solid rgba(0,255,204,0.15)' }}
        >
          {/* Sky */}
          <rect x="0" y="0" width="120" height="30" fill="rgba(0,80,120,0.35)" />
          {/* Ground */}
          <rect x="0" y="30" width="120" height="30" fill="rgba(80,50,10,0.35)" />
          {/* Horizon line — animated by controller via ref */}
          <line
            ref={horizonRef}
            x1="0" y1="30" x2="120" y2="30"
            stroke="#00ffcc"
            strokeWidth="1.5"
          />
          {/* Centre crosshair */}
          <line x1="50" y1="30" x2="70" y2="30" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
          <line x1="60" y1="25" x2="60" y2="35" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
          {/* Roll tick marks */}
          {[-30, -20, -10, 0, 10, 20, 30].map(deg => {
            const x = 60 + (deg / 90) * 60;
            return <line key={deg} x1={x} y1="3" x2={x} y2={deg === 0 ? 10 : 7} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />;
          })}
        </svg>

        {/* Data row */}
        <div style={dataRow}>
          <div style={dataCell}>
            <span style={dataLabel}>ALT</span>
            <span style={dataValue} ref={altRef}>---</span>
            <span style={dataUnit}>m</span>
          </div>
          <div style={dataCell}>
            <span style={dataLabel}>SPD</span>
            <span style={dataValue} ref={spdRef}>0</span>
            <span style={dataUnit}>m/s</span>
          </div>
          <div style={dataCell}>
            <span style={dataLabel}>HDG</span>
            <span style={dataValue} ref={hdgRef}>---</span>
            <span style={dataUnit}>°</span>
          </div>
          <div style={dataCell}>
            <span style={dataLabel}>SRC</span>
            <span style={{ ...dataValue, fontSize: '11px', letterSpacing: '1px' }} ref={ctrlRef}>---</span>
          </div>
        </div>

      </div>
    </div>
  );
};
