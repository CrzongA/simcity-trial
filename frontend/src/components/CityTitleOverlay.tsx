import React from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { setShowCityInfo } from '../store/uiSlice';

const CityTitleOverlay: React.FC = () => {
  const dispatch = useAppDispatch();
  const { currentCity, showCityInfo, isAppStarted } = useAppSelector(state => state.ui);

  if (!isAppStarted) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: '50%',
        transform: `translateX(-50%) translateY(${showCityInfo ? '0' : '-100%'})`,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        transition: 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(180deg, rgba(16, 18, 23, 0.95) 0%, rgba(16, 18, 23, 0.7) 100%)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0, 243, 255, 0.4)',
          borderTop: 'none',
          padding: '10px 40px',
          borderRadius: '0 0 16px 16px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(0, 243, 255, 0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: '20px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Subtle Scanline HUD effect */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))',
          backgroundSize: '100% 2px, 3px 100%',
          pointerEvents: 'none',
          opacity: 0.3,
        }} />

        <div style={{
          width: '6px',
          height: '24px',
          background: '#00f3ff',
          boxShadow: '0 0 12px rgba(0, 243, 255, 0.8)',
          borderRadius: '2px',
        }} />
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span style={{
            color: 'rgba(255, 255, 255, 0.5)',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
            marginBottom: '2px',
          }}>
            GEO-STATIONARY FEED //
          </span>
          <span style={{
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            letterSpacing: '0.1em',
            textShadow: '0 0 10px rgba(0, 243, 255, 0.5)',
          }}>
            <span style={{ color: '#00f3ff', marginRight: '8px' }}>SITE:</span>
            {currentCity}
          </span>
        </div>
      </div>

      <button
        onClick={() => dispatch(setShowCityInfo(!showCityInfo))}
        style={{
          background: 'rgba(16, 18, 23, 0.8)',
          border: '1px solid rgba(0, 243, 255, 0.3)',
          borderTop: 'none',
          color: '#00f3ff',
          padding: '6px 20px',
          cursor: 'pointer',
          borderRadius: '0 0 12px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.3s ease',
          transform: `translateY(${showCityInfo ? '0' : '100%'})`,
          marginTop: '-1px', // Seamless join
          outline: 'none',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)',
        }}
      >
        <svg
          width="16"
          height="10"
          viewBox="0 0 16 10"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            transform: showCityInfo ? 'rotate(0deg)' : 'rotate(180deg)',
            transition: 'transform 0.5s ease',
          }}
        >
          <path d="M2 2L8 8L14 2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
};

export default CityTitleOverlay;
