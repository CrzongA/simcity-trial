import React, { useState } from 'react';

interface SimulationControlsProps {
  floodHeight: number;
  setFloodHeight: (v: number) => void;
}

export const SimulationControls: React.FC<SimulationControlsProps> = ({
  floodHeight, setFloodHeight
}) => {
  const [isSimulationOpen, setIsSimulationOpen] = useState<boolean>(true);

  return (
    <div style={{
      position: 'absolute',
      top: 20,
      left: 20,
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
        onClick={() => setIsSimulationOpen(!isSimulationOpen)}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <span style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.5px', color: '#00ffcc' }}>
          SIMULATION CONTROLS
        </span>
        <span style={{
          transform: isSimulationOpen ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.2s ease',
          fontSize: '12px'
        }}>
          ▼
        </span>
      </div>

      {isSimulationOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '4px' }}>
          {/* Flood Height Control */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
              <label>Flood Height</label>
              <span style={{ color: '#00ffcc' }}>{floodHeight}m</span>
            </div>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={floodHeight}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFloodHeight(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#00ffcc' }}
            />
            <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>
              Simulates sea level rise and flood impact.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
