import React from 'react';
import type { BillboardData } from './CityMap';

interface BillboardsOverlayProps {
  billboards: BillboardData[];
  setBillboards: React.Dispatch<React.SetStateAction<BillboardData[]>>;
  billboardsRef: React.MutableRefObject<Map<string, HTMLDivElement | null>>;
  requestRender: () => void;
}

export const BillboardsOverlay: React.FC<BillboardsOverlayProps> = ({
  billboards,
  setBillboards,
  billboardsRef,
  requestRender,
}) => {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 100, overflow: 'hidden' }}>
      {billboards.map(b => (
        <div
          key={b.id}
          ref={el => {
            if (el) billboardsRef.current.set(b.id, el);
            else billboardsRef.current.delete(b.id);
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            pointerEvents: 'auto',
            background: 'rgba(25, 25, 25, 0.85)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            padding: '12px',
            color: '#fff',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(10px)',
            fontFamily: '"Inter", "system-ui", sans-serif',
            minWidth: '220px',
            maxWidth: '300px',
            display: 'none', // Shown by preRender listener
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>Location Info</div>
            <div
              onClick={() => {
                setBillboards(prev => prev.filter(x => x.id !== b.id));
                setTimeout(() => requestRender(), 50);
              }}
              style={{ cursor: 'pointer', opacity: 0.7, padding: '4px', marginTop: '-4px', marginRight: '-4px' }}
              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
              onMouseLeave={e => e.currentTarget.style.opacity = '0.7'}
            >
              ✕
            </div>
          </div>
          <div style={{ fontSize: '13px', color: '#ccc', marginBottom: '4px' }}>
            <strong style={{ color: '#00ffcc' }}>Terrain Height:</strong> {b.height}m (MSL)
          </div>
          <div style={{ fontSize: '13px', color: '#ccc' }}>
            <strong style={{ color: '#00ffcc' }}>Location:</strong> {b.loading ? 'Fetching...' : b.locationName}
          </div>

          <div style={{
            position: 'absolute',
            bottom: '-8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '0',
            height: '0',
            borderLeft: '8px solid transparent',
            borderRight: '8px solid transparent',
            borderTop: '8px solid rgba(255, 255, 255, 0.15)',
          }}>
            <div style={{
              position: 'absolute',
              top: '-9px',
              left: '-7px',
              width: '0',
              height: '0',
              borderLeft: '7px solid transparent',
              borderRight: '7px solid transparent',
              borderTop: '8px solid rgba(25, 25, 25, 0.85)',
            }} />
          </div>
        </div>
      ))}
    </div>
  );
};
