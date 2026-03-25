import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import {
  setGamepadIndex,
  setAxisMapping,
  setButtonMapping,
  setAxisCalibration,
  setDeadzone,
  setSensitivity,
  setFov,
  setMass,
  setAcroThrust,
  setAcroDrag,
  setAcroCameraTilt,
  AxisCalibration,
} from '../../store/droneSlice';

// ─── Shared style tokens ──────────────────────────────────────────────────────

const PANEL: React.CSSProperties = {
  background: 'rgba(16, 18, 23, 0.97)',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '2px',
  fontFamily: '"Inter", "system-ui", sans-serif',
  color: '#ddd',
  fontSize: '12px',
};

const SECTION_LABEL: React.CSSProperties = {
  fontSize: '9px',
  fontWeight: 700,
  letterSpacing: '1.2px',
  color: 'rgba(255,255,255,0.4)',
  textTransform: 'uppercase',
  marginBottom: '6px',
};

const ROW: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '6px',
  marginBottom: '4px',
};

const INPUT_NUM: React.CSSProperties = {
  width: '44px',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: '2px',
  color: '#fff',
  fontSize: '11px',
  padding: '3px 5px',
  textAlign: 'center',
};

const BTN_SM = (active?: boolean, accent?: string): React.CSSProperties => ({
  background: active ? `${accent ?? '#00ffcc'}22` : 'rgba(255,255,255,0.06)',
  border: `1px solid ${active ? (accent ?? '#00ffcc') : 'rgba(255,255,255,0.15)'}`,
  borderRadius: '2px',
  color: active ? (accent ?? '#00ffcc') : '#aaa',
  fontSize: '10px',
  fontWeight: 600,
  padding: '3px 7px',
  cursor: 'pointer',
  letterSpacing: '0.5px',
  whiteSpace: 'nowrap',
});

const DIVIDER: React.CSSProperties = {
  borderTop: '1px solid rgba(255,255,255,0.08)',
  margin: '10px 0',
};

// ─── Axis live bar ────────────────────────────────────────────────────────────

const AxisBar: React.FC<{ value: number }> = ({ value }) => {
  const pct = ((value + 1) / 2) * 100;
  return (
    <div style={{ width: '60px', height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '1px', position: 'relative' }}>
      <div style={{
        position: 'absolute',
        left: '50%',
        width: '1px',
        height: '100%',
        background: 'rgba(255,255,255,0.2)',
      }} />
      <div style={{
        position: 'absolute',
        left: `${pct}%`,
        transform: 'translateX(-50%)',
        width: '4px',
        height: '6px',
        background: '#00ffcc',
        borderRadius: '1px',
      }} />
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

type AxisKey = 'throttle' | 'yaw' | 'pitch' | 'roll';
type CalPoint = 'low' | 'mid' | 'high';
type DetectTarget    = { type: 'axis'; axis: AxisKey } | null;
type BtnKey          = 'flightModeToggle' | 'speedTierUp' | 'speedTierDown';
type BtnDetectTarget = { key: BtnKey } | null;

export const DroneSettings: React.FC = () => {
  const dispatch = useAppDispatch();
  const drone = useAppSelector(state => state.drone);

  const [isOpen, setIsOpen] = useState(false);
  const [gamepads, setGamepads] = useState<(Gamepad | null)[]>([]);
  const [liveAxes, setLiveAxes] = useState<number[]>([]);
  const [detecting, setDetecting] = useState<DetectTarget>(null);
  const [detectingBtn, setDetectingBtn] = useState<BtnDetectTarget>(null);

  const detectingRef     = useRef<DetectTarget>(null);
  const detectBaselineRef = useRef<number[]>([]);
  const detectingBtnRef   = useRef<BtnDetectTarget>(null);
  const prevBtnStatesRef  = useRef<boolean[]>([]);
  const rafRef = useRef<number | null>(null);

  // Poll gamepads for live axis display
  const pollLoop = useCallback(() => {
    const gps = Array.from(navigator.getGamepads());
    setGamepads(gps);
    const selected = drone.gamepadIndex !== null ? gps[drone.gamepadIndex] : null;
    if (selected) setLiveAxes(Array.from(selected.axes));

    // Axis detect: find axis with biggest delta from baseline
    if (detectingRef.current?.type === 'axis' && selected) {
      const axes = Array.from(selected.axes);
      const baseline = detectBaselineRef.current;
      let maxDelta = 0.3;
      let maxIdx = -1;
      axes.forEach((v, i) => {
        const delta = Math.abs(v - (baseline[i] ?? 0));
        if (delta > maxDelta) { maxDelta = delta; maxIdx = i; }
      });
      if (maxIdx !== -1) {
        const target = detectingRef.current;
        dispatch(setAxisMapping({ [target.axis]: maxIdx }));
        detectingRef.current = null;
        setDetecting(null);
      }
    }

    // Button detect: first rising-edge button press after detect started
    if (detectingBtnRef.current && selected) {
      const buttons = Array.from(selected.buttons);
      const prev    = prevBtnStatesRef.current;
      for (let i = 0; i < buttons.length; i++) {
        if (buttons[i].pressed && !prev[i]) {
          dispatch(setButtonMapping({ [detectingBtnRef.current.key]: i }));
          detectingBtnRef.current = null;
          setDetectingBtn(null);
          break;
        }
      }
      prevBtnStatesRef.current = buttons.map(b => b.pressed);
    }

    rafRef.current = requestAnimationFrame(pollLoop);
  }, [drone.gamepadIndex, dispatch]);

  useEffect(() => {
    if (isOpen) {
      rafRef.current = requestAnimationFrame(pollLoop);
    } else {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    }
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); };
  }, [isOpen, pollLoop]);

  const startDetect = (axis: AxisKey) => {
    const gps = Array.from(navigator.getGamepads());
    const selected = drone.gamepadIndex !== null ? gps[drone.gamepadIndex] : null;
    detectBaselineRef.current = selected ? Array.from(selected.axes) : [];
    const target: DetectTarget = { type: 'axis', axis };
    detectingRef.current = target;
    setDetecting(target);
  };

  const startDetectBtn = (key: BtnKey) => {
    const gps = Array.from(navigator.getGamepads());
    const selected = drone.gamepadIndex !== null ? gps[drone.gamepadIndex] : null;
    prevBtnStatesRef.current = selected
      ? Array.from(selected.buttons).map(b => b.pressed)
      : [];
    detectingBtnRef.current = { key };
    setDetectingBtn({ key });
  };

  const captureCalibration = (axis: AxisKey, point: CalPoint) => {
    const gps = Array.from(navigator.getGamepads());
    const selected = drone.gamepadIndex !== null ? gps[drone.gamepadIndex] : null;
    if (!selected) return;
    const axisIdx = drone.axisMapping[axis];
    const raw = selected.axes[axisIdx] ?? 0;
    dispatch(setAxisCalibration({ axis, value: { [point]: raw } }));
  };

  const AXES: { key: AxisKey; label: string }[] = [
    { key: 'throttle', label: 'Throttle' },
    { key: 'yaw',      label: 'Yaw'      },
    { key: 'pitch',    label: 'Pitch'    },
    { key: 'roll',     label: 'Roll'     },
  ];

  const BTN_ACTIONS = [
    { key: 'flightModeToggle' as const, label: 'Flight Mode Toggle' },
    { key: 'speedTierUp'      as const, label: 'Speed Tier Up'      },
    { key: 'speedTierDown'    as const, label: 'Speed Tier Down'    },
  ];

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(v => !v)}
        style={{
          ...PANEL,
          width: '100%',
          padding: '8px 12px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          fontWeight: 600,
          letterSpacing: '0.4px',
          color: isOpen ? '#00ffcc' : '#ccc',
          border: `1px solid ${isOpen ? 'rgba(0,255,204,0.4)' : 'rgba(255,255,255,0.12)'}`,
        }}
      >
        <span>⚙ DRONE CONFIG</span>
        <span style={{ fontSize: '10px', transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
      </button>

      {/* Settings overlay */}
      {isOpen && (
        <div style={{
          ...PANEL,
          padding: '14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '0',
          maxHeight: '70vh',
          overflowY: 'auto',
        }}>

          {/* ── A. Gamepad Device ── */}
          <div style={SECTION_LABEL}>Gamepad Device</div>
          <div style={{ ...ROW, marginBottom: '8px' }}>
            <select
              value={drone.gamepadIndex ?? ''}
              onChange={e => dispatch(setGamepadIndex(e.target.value === '' ? null : Number(e.target.value)))}
              style={{ ...INPUT_NUM, width: '100%', textAlign: 'left', padding: '4px 6px' }}
            >
              <option value="">— none —</option>
              {gamepads.map((gp, i) => gp ? (
                <option key={i} value={i}>[{i}] {gp.id.slice(0, 40)}</option>
              ) : null)}
            </select>
            <button
              style={BTN_SM()}
              onClick={() => setGamepads(Array.from(navigator.getGamepads()))}
            >Refresh</button>
          </div>

          {/* Live axis bars */}
          {liveAxes.length > 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {liveAxes.map((v, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>A{i}</span>
                  <AxisBar value={v} />
                </div>
              ))}
            </div>
          )}

          <div style={DIVIDER} />

          {/* ── B. Axis Mapping ── */}
          <div style={SECTION_LABEL}>Axis Mapping</div>
          {AXES.map(({ key, label }) => {
            const isDetecting = detecting?.type === 'axis' && detecting.axis === key;
            return (
              <div key={key} style={{ ...ROW, marginBottom: '6px' }}>
                <span style={{ minWidth: '58px', color: '#bbb' }}>{label}</span>
                <input
                  type="number"
                  min={0}
                  max={15}
                  value={drone.axisMapping[key]}
                  onChange={e => dispatch(setAxisMapping({ [key]: Number(e.target.value) }))}
                  style={INPUT_NUM}
                />
                <button
                  style={BTN_SM(isDetecting, '#ffaa00')}
                  onClick={() => isDetecting ? setDetecting(null) : startDetect(key)}
                >
                  {isDetecting ? 'Cancel' : 'Detect'}
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#aaa', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={drone.calibration[key].inverted}
                    onChange={e => dispatch(setAxisCalibration({ axis: key, value: { inverted: e.target.checked } }))}
                    style={{ accentColor: '#00ffcc' }}
                  />
                  Inv
                </label>
              </div>
            );
          })}

          <div style={DIVIDER} />

          {/* ── C. Button Mapping ── */}
          <div style={SECTION_LABEL}>Button Mapping</div>
          {BTN_ACTIONS.map(({ key, label }) => {
            const isDetecting = detectingBtn?.key === key;
            return (
              <div key={key} style={{ ...ROW, marginBottom: '6px' }}>
                <span style={{ minWidth: '100px', color: '#bbb' }}>{label}</span>
                <input
                  type="number"
                  min={0}
                  max={31}
                  value={drone.buttonMapping[key]}
                  onChange={e => dispatch(setButtonMapping({ [key]: Number(e.target.value) }))}
                  style={INPUT_NUM}
                />
                <button
                  style={BTN_SM(isDetecting, '#ffaa00')}
                  onClick={() => {
                    if (isDetecting) { detectingBtnRef.current = null; setDetectingBtn(null); }
                    else startDetectBtn(key);
                  }}
                >
                  {isDetecting ? 'Cancel' : 'Detect'}
                </button>
              </div>
            );
          })}

          <div style={DIVIDER} />

          {/* ── D. Calibration ── */}
          <div style={SECTION_LABEL}>Stick Calibration (Low / Mid / High)</div>
          {AXES.map(({ key, label }) => {
            const cal = drone.calibration[key];
            const axisIdx = drone.axisMapping[key];
            const liveVal = liveAxes[axisIdx] ?? 0;
            return (
              <div key={key} style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{label}</span>
                  <span style={{ color: '#00ffcc' }}>live: {liveVal.toFixed(3)}</span>
                </div>
                {/* Live position strip */}
                <AxisBar value={liveVal} />
                <div style={{ display: 'flex', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                  {(['low', 'mid', 'high'] as CalPoint[]).map(pt => (
                    <div key={pt} style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.5px' }}>
                        {pt.toUpperCase()}
                      </span>
                      <input
                        type="number"
                        step={0.001}
                        value={cal[pt].toFixed(3)}
                        onChange={e => dispatch(setAxisCalibration({ axis: key, value: { [pt]: Number(e.target.value) } }))}
                        style={{ ...INPUT_NUM, width: '60px' }}
                      />
                      <button
                        style={BTN_SM()}
                        onClick={() => captureCalibration(key, pt)}
                        title={`Capture current axis value as ${pt}`}
                      >Cap</button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={DIVIDER} />

          {/* ── E. Deadzone & Sensitivity ── */}
          <div style={SECTION_LABEL}>Deadzone & Sensitivity</div>
          <div style={{ ...ROW, marginBottom: '6px' }}>
            <span style={{ color: '#bbb' }}>Deadzone</span>
            <input
              type="range"
              min={0} max={0.3} step={0.01}
              value={drone.deadzone}
              onChange={e => dispatch(setDeadzone(Number(e.target.value)))}
              style={{ flex: 1, accentColor: '#00ffcc' }}
            />
            <span style={{ color: '#00ffcc', minWidth: '32px', textAlign: 'right' }}>{drone.deadzone.toFixed(2)}</span>
          </div>
          <div style={{ ...ROW, marginBottom: '6px' }}>
            <span style={{ color: '#bbb' }}>Sensitivity</span>
            <input
              type="range"
              min={0.25} max={3.0} step={0.05}
              value={drone.sensitivity}
              onChange={e => dispatch(setSensitivity(Number(e.target.value)))}
              style={{ flex: 1, accentColor: '#00ffcc' }}
            />
            <span style={{ color: '#00ffcc', minWidth: '32px', textAlign: 'right' }}>{drone.sensitivity.toFixed(2)}×</span>
          </div>
          <div style={{ ...ROW, marginBottom: '6px' }}>
            <span style={{ color: '#bbb' }}>Mass (acro)</span>
            <input
              type="range"
              min={0.1} max={10} step={0.1}
              value={drone.mass}
              onChange={e => dispatch(setMass(Number(e.target.value)))}
              style={{ flex: 1, accentColor: '#00ffcc' }}
            />
            <span style={{ color: '#00ffcc', minWidth: '36px', textAlign: 'right' }}>{drone.mass.toFixed(1)}kg</span>
          </div>
          <div style={{ ...ROW, marginBottom: '6px' }}>
            <span style={{ color: '#bbb' }}>Thrust (acro)</span>
            <input
              type="range"
              min={9.81} max={196.2} step={0.5}
              value={drone.acroThrust}
              onChange={e => dispatch(setAcroThrust(Number(e.target.value)))}
              style={{ flex: 1, accentColor: '#00ffcc' }}
            />
            <span style={{ color: '#00ffcc', minWidth: '36px', textAlign: 'right' }}>{(drone.acroThrust / 9.81).toFixed(1)}g</span>
          </div>
          <div style={{ ...ROW, marginBottom: '6px' }}>
            <span style={{ color: '#bbb' }}>Air drag (acro)</span>
            <input
              type="range"
              min={0.05} max={2.0} step={0.05}
              value={drone.acroDrag}
              onChange={e => dispatch(setAcroDrag(Number(e.target.value)))}
              style={{ flex: 1, accentColor: '#00ffcc' }}
            />
            <span style={{ color: '#00ffcc', minWidth: '36px', textAlign: 'right' }}>{drone.acroDrag.toFixed(2)}</span>
          </div>
          <div style={ROW}>
            <span style={{ color: '#bbb' }}>Cam tilt (acro)</span>
            <input
              type="range"
              min={-30} max={60} step={1}
              value={drone.acroCameraTilt}
              onChange={e => dispatch(setAcroCameraTilt(Number(e.target.value)))}
              style={{ flex: 1, accentColor: '#00ffcc' }}
            />
            <span style={{ color: '#00ffcc', minWidth: '36px', textAlign: 'right' }}>{drone.acroCameraTilt}°</span>
          </div>

          <div style={DIVIDER} />

          {/* ── F. Field of View ── */}
          <div style={SECTION_LABEL}>Field of View</div>
          <div style={ROW}>
            <span style={{ color: '#bbb' }}>FOV</span>
            <input
              type="range"
              min={30} max={150} step={1}
              value={drone.fov}
              onChange={e => dispatch(setFov(Number(e.target.value)))}
              style={{ flex: 1, accentColor: '#00ffcc' }}
            />
            <span style={{ color: '#00ffcc', minWidth: '36px', textAlign: 'right' }}>{drone.fov}°</span>
          </div>

        </div>
      )}
    </>
  );
};
