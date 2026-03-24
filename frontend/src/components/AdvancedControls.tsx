import React, { useState } from 'react';

interface AdvancedControlsProps {
  fps: number;
  optimizeVisuals: boolean;
  setOptimizeVisuals: (v: boolean) => void;
  resolutionScale: number;
  setResolutionScale: (v: number) => void;
  minHeight: number;
  setMinHeight: (v: number) => void;
  sse: number;
  setSse: (v: number) => void;
  fxaaEnabled: boolean;
  setFxaaEnabled: (v: boolean) => void;
}

export const AdvancedControls: React.FC<AdvancedControlsProps> = ({
  fps,
  optimizeVisuals, setOptimizeVisuals,
  resolutionScale, setResolutionScale,
  minHeight, setMinHeight,
  sse, setSse,
  fxaaEnabled, setFxaaEnabled
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);

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

          {/* Height Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <label>Min Height</label>
              <span style={{ color: '#00ffcc' }}>{minHeight}m</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={minHeight}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinHeight(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#00ffcc' }}
            />
          </div>

          {/* SSE / Detail Level Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <label>Detail Level (SSE)</label>
              <span style={{ color: '#00ffcc' }}>{sse}</span>
            </div>
            <input
              type="range"
              min="1"
              max="32"
              step="1"
              value={sse}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSse(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#00ffcc' }}
            />
            <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>
              Lower = Higher Detail (Fixes "Jagged" tiles)
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
        </div>
      )}
    </div>
  );
};
