import React from 'react';
import type { Cartesian3 } from 'cesium';
import { Cartographic, Math as CesiumMath } from 'cesium';
import { useAppSelector, useAppDispatch } from '../store';
import { openForm } from '../store/communityReportSlice';

interface ContextMenuPopupProps {
  contextMenu: { show: boolean, x: number, y: number, cartesian: Cartesian3 | null };
  handleShowDetails: () => void;
  setContextMenu: any;
}

export const ContextMenuPopup: React.FC<ContextMenuPopupProps> = ({ contextMenu, handleShowDetails, setContextMenu }) => {
  const activeStory = useAppSelector(state => state.story.activeStory);
  const dispatch = useAppDispatch();

  if (!contextMenu.show) return null;

  const handleCreateReport = () => {
    if (!contextMenu.cartesian) return;
    const carto = Cartographic.fromCartesian(contextMenu.cartesian);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const lng = CesiumMath.toDegrees(carto.longitude);
    const height = carto.height;
    
    dispatch(openForm({
      lat, lng, height, 
      cartesian: { x: contextMenu.cartesian.x, y: contextMenu.cartesian.y, z: contextMenu.cartesian.z }
    }));
    
    setContextMenu({ show: false, x: 0, y: 0, cartesian: null });
  };

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
      
      {activeStory === 'community-reports' && (
        <div
          onClick={handleCreateReport}
          style={{
            padding: '8px 16px',
            color: '#00ffcc',
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'background 0.2s',
            borderTop: '1px solid rgba(255,255,255,0.1)'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,255,204,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          Create report here...
        </div>
      )}
    </div>
  );
};
