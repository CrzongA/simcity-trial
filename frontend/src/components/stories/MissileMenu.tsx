import React from 'react';
import { useAppDispatch, useAppSelector } from '../../store';
import { WEAPONS, setSelectedWeaponId, setIsPlacing } from '../../store/missileStrikeSlice';

export const MissileMenu: React.FC = () => {
  const dispatch = useAppDispatch();
  const selectedWeaponId = useAppSelector(state => state.missileStrike.selectedWeaponId);

  return (
    <div
      style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        width: '320px',
        zIndex: 100,
        background: '#101217',
        border: '1px solid rgba(255, 60, 0, 0.4)',
        padding: '20px',
        fontFamily: '"Inter", "system-ui", sans-serif',
        boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
        borderRadius: '2px', // Sharp minimalism
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 60, 0, 0.2)', paddingBottom: '12px' }}>
        <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', color: '#ff3c00' }}>
          Strike Simulation
        </h2>
        <div style={{ width: '8px', height: '8px', background: '#ff3c00', borderRadius: '50%', boxShadow: '0 0 10px #ff3c00', animation: 'pulse 2s infinite' }} />
      </div>

      <p style={{ margin: 0, fontSize: '13px', color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>
        Select payload type. Click on the map to mark ground zero. Multiple strikes allowed.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {Object.values(WEAPONS).map(weapon => {
          const isSelected = selectedWeaponId === weapon.id;
          
          return (
            <button
              key={weapon.id}
              onClick={() => {
                dispatch(setSelectedWeaponId(weapon.id));
                dispatch(setIsPlacing(true));
              }}
              style={{
                background: isSelected ? 'rgba(255, 60, 0, 0.15)' : 'transparent',
                border: isSelected ? '1px solid #ff3c00' : '1px solid rgba(255, 255, 255, 0.1)',
                padding: '12px',
                cursor: 'pointer',
                textAlign: 'left',
                borderRadius: '2px', // Sharp
                transition: 'all 0.2s',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '15px', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#ff3c00' : '#ccc' }}>
                {weapon.name}
              </span>
              
               <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {weapon.tiers.map((tier, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                    <span>{tier.name}</span>
                    <span>{tier.radius >= 1000 ? `${(tier.radius/1000).toFixed(1)}km` : `${tier.radius}m`}</span>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(0.95); opacity: 0.5; }
        }
      `}</style>
    </div>
  );
};
