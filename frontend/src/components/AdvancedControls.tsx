import React, { useState, useEffect, useRef } from 'react';
import { Math as CesiumMath } from 'cesium';

interface CameraPos {
  lon: number;
  lat: number;
  height: number;
  heading: number;
  pitch: number;
  roll: number;
}

interface AdvancedControlsProps {
  fps: number;
  optimizeVisuals: boolean;
  setOptimizeVisuals: (v: boolean) => void;
  resolutionScale: number;
  setResolutionScale: (v: number) => void;
  sse: number;
  setSse: (v: number) => void;
  autoSse: boolean;
  setAutoSse: (v: boolean) => void;
  fxaaEnabled: boolean;
  setFxaaEnabled: (v: boolean) => void;
  waterOpacity: number;
  setWaterOpacity: (v: number) => void;
  viewerRef: React.MutableRefObject<any>;
}

export const AdvancedControls: React.FC<AdvancedControlsProps> = ({
  fps,
  optimizeVisuals, setOptimizeVisuals,
  resolutionScale, setResolutionScale,
  sse, setSse,
  autoSse, setAutoSse,
  fxaaEnabled, setFxaaEnabled,
  waterOpacity, setWaterOpacity,
  viewerRef
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);
  const [cameraPos, setCameraPos] = useState<CameraPos | null>(null);
  const [copied, setCopied] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isAdvancedOpen) {
      const poll = () => {
        const viewer = viewerRef.current?.cesiumElement;
        if (!viewer || viewer.isDestroyed()) return;
        const cam = viewer.camera;
        const carto = cam.positionCartographic;
        if (!carto) return;
        setCameraPos({
          lon: parseFloat(CesiumMath.toDegrees(carto.longitude).toFixed(6)),
          lat: parseFloat(CesiumMath.toDegrees(carto.latitude).toFixed(6)),
          height: parseFloat(carto.height.toFixed(2)),
          heading: parseFloat(CesiumMath.toDegrees(cam.heading).toFixed(2)),
          pitch: parseFloat(CesiumMath.toDegrees(cam.pitch).toFixed(2)),
          roll: parseFloat(CesiumMath.toDegrees(cam.roll).toFixed(2)),
        });
      };
      poll();
      intervalRef.current = setInterval(poll, 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAdvancedOpen]);

  const flyToSnippet = cameraPos
    ? `viewer.camera.flyTo({\n  destination: Cesium.Cartesian3.fromDegrees(\n    ${cameraPos.lon}, ${cameraPos.lat}, ${cameraPos.height}\n  ),\n  orientation: {\n    heading: Cesium.Math.toRadians(${cameraPos.heading}),\n    pitch:   Cesium.Math.toRadians(${cameraPos.pitch}),\n    roll:    Cesium.Math.toRadians(${cameraPos.roll}),\n  }\n});`
    : '';

  const handleCopy = () => {
    if (!flyToSnippet) return;
    navigator.clipboard.writeText(flyToSnippet).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  };

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      right: 20,
      zIndex: 10,
      background: 'rgba(25, 25, 25, 0.9)',
      color: '#fff',
      padding: '12px',
      borderRadius: '8px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      width: '260px',
      fontFamily: '"Inter", "system-ui", sans-serif',
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      <div
        onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
          ADVANCED CONTROLS
        </span>
        <span style={{
          transform: isAdvancedOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
          fontSize: '12px'
        }}>
          ▼
        </span>
      </div>

      {isAdvancedOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '4px' }}>

          {/* Camera Position */}
          {cameraPos && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: 'bold', color: '#aaa', letterSpacing: '0.4px' }}>
                <span>📍 CAMERA POSITION</span>
                <button
                  onClick={handleCopy}
                  title="Copy flyTo() snippet"
                  style={{
                    background: copied ? '#00ffcc22' : 'rgba(255,255,255,0.07)',
                    border: `1px solid ${copied ? '#00ffcc' : 'rgba(255,255,255,0.15)'}`,
                    color: copied ? '#00ffcc' : '#ccc',
                    borderRadius: '4px',
                    padding: '2px 7px',
                    fontSize: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  {copied ? '✓ Copied!' : 'Copy flyTo()'}
                </button>
              </div>
              <div style={{
                background: 'rgba(0,0,0,0.4)',
                borderRadius: '6px',
                padding: '8px 10px',
                fontFamily: '"JetBrains Mono", "Fira Code", monospace',
                fontSize: '11px',
                lineHeight: '1.7',
                color: '#e0e0e0',
                border: '1px solid rgba(255,255,255,0.08)'
              }}>
                {([
                  ['lon',     cameraPos.lon,     '°'],
                  ['lat',     cameraPos.lat,     '°'],
                  ['height',  cameraPos.height,  ' m'],
                  ['heading', cameraPos.heading, '°'],
                  ['pitch',   cameraPos.pitch,   '°'],
                  ['roll',    cameraPos.roll,    '°'],
                ] as [string, number, string][]).map(([key, val, unit]) => (
                  <div key={key} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#888' }}>{key}</span>
                    <span style={{ color: '#00ffcc' }}>{val}{unit}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* FPS Display */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold' }}>
            <label>Current FPS</label>
            <span style={{ color: fps < 30 ? '#ff4d4d' : '#00ffcc' }}>{fps > 0 ? fps : '--'}</span>
          </div>

          {/* Optimize Visuals Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
            <label>Optimize Visuals (Fast Render)</label>
            <input
              type="checkbox"
              checked={optimizeVisuals}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOptimizeVisuals(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#00ffcc' }}
            />
          </div>

          {/* Resolution Scale Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <label>Resolution Scale</label>
              <span style={{ color: '#00ffcc' }}>{resolutionScale.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="1"
              step="0.05"
              value={resolutionScale}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setResolutionScale(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#00ffcc' }}
            />
            <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>
              Lower = Higher FPS (Recommended: 0.75x for High DPI)
            </div>
          </div>

          {/* SSE / Detail Level Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
              <label>Detail Level (SSE)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: autoSse ? '#00ffcc' : '#888', fontSize: '10px' }}>
                  {autoSse ? `auto (${sse})` : sse}
                </span>
                <label style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', fontSize: '10px', color: '#aaa' }}>
                  <input
                    type="checkbox"
                    checked={autoSse}
                    onChange={(e) => setAutoSse(e.target.checked)}
                    style={{ width: '13px', height: '13px', accentColor: '#00ffcc' }}
                  />
                  auto
                </label>
              </div>
            </div>
            <input
              type="range"
              min="1"
              max="32"
              step="1"
              value={sse}
              disabled={autoSse}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSse(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#00ffcc', opacity: autoSse ? 0.35 : 1, cursor: autoSse ? 'not-allowed' : 'pointer' }}
            />
            <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>
              {autoSse
                ? 'Auto: 16 (0–3km) · 10 (3–6km) · 2 (6km+)'
                : 'Lower = Higher Detail (Fixes "Jagged" tiles)'}
            </div>
          </div>

          {/* FXAA Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
            <label>Smooth Edges (FXAA)</label>
            <input
              type="checkbox"
              checked={fxaaEnabled}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFxaaEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#00ffcc' }}
            />
          </div>

          {/* Water Transparency Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <label>Water Transparency</label>
              <span style={{ color: '#00ffcc' }}>{(waterOpacity * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1.0"
              step="0.05"
              value={waterOpacity}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWaterOpacity(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#00ffcc' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
