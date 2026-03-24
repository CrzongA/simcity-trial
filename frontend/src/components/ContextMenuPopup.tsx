import React from 'react';
import type { Cartesian3 } from 'cesium';

interface ContextMenuPopupProps {
  contextMenu: { show: boolean, x: number, y: number, cartesian: Cartesian3 | null };
  handleShowDetails: () => void;
}

export const ContextMenuPopup: React.FC<ContextMenuPopupProps> = ({ contextMenu, handleShowDetails }) => {
  if (!contextMenu.show) return null;

  return (
    <div style={{
      position: 'absolute',
      left: contextMenu.x,
      top: contextMenu.y,
      zIndex: 100,
      background: 'rgba(25, 25, 25, 0.95)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      padding: '8px 0',
      minWidth: '150px',
      backdropFilter: 'blur(8px)',
      fontFamily: '"Inter", "system-ui", sans-serif',
    }}>
      <div
        onClick={handleShowDetails}
        style={{
          padding: '8px 16px',
          color: '#fff',
          fontSize: '14px',
          cursor: 'pointer',
          transition: 'background 0.2s'
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        Show details
      </div>
    </div>
  );
};
