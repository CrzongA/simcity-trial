import React, { useEffect, useState, useRef } from 'react';
import { useAppSelector, useAppDispatch } from '../store';
import { setAppStarted } from '../store/uiSlice';

const BannerOverlay: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isTilesLoaded, isAppStarted } = useAppSelector(state => state.ui);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [opacity, setOpacity] = useState(1);

  const handleEnter = () => {
    setOpacity(0);
    setTimeout(() => {
      dispatch(setAppStarted(true));
    }, 1000);
  };

  // Force Cesium to resize after overlay disappears
  useEffect(() => {
    if (isAppStarted) {
      window.dispatchEvent(new Event('resize'));
    }
  }, [isAppStarted]);

  if (isAppStarted) return null;

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle, rgba(16, 18, 23, 1) 0%, rgba(16, 18, 23, 0.95) 60%, rgba(16, 18, 23, 0.85) 100%)',
        color: '#fff',
        textAlign: 'center' as const,
        gap: '32px',
        pointerEvents: opacity > 0 ? 'auto' as const : 'none' as const,
        opacity,
        transition: 'opacity 1s ease',
      }}
    >
      {/* Decorative HUD accent line */}
      <div style={{
        position: 'absolute',
        top: '10%',
        left: '5%',
        width: '150px',
        height: '1px',
        background: 'linear-gradient(90deg, #00f3ff, transparent)',
      }} />
      <div style={{
        position: 'absolute',
        bottom: '10%',
        right: '5%',
        width: '150px',
        height: '1px',
        background: 'linear-gradient(-90deg, #00f3ff, transparent)',
      }} />

      <div>
        <h1 style={{
          fontSize: '4rem',
          fontWeight: 800,
          letterSpacing: '0.2em',
          textTransform: 'uppercase' as const,
          textShadow: '0 0 20px rgba(0, 243, 255, 0.5)',
          marginBottom: '8px',
          fontFamily: 'monospace',
        }}>
          City in Time
        </h1>
        <h2 style={{
          fontSize: '1.2rem',
          fontWeight: 300,
          letterSpacing: '0.4em',
          color: '#00f3ff',
          textTransform: 'uppercase' as const,
          opacity: 0.8,
          fontFamily: 'monospace',
          margin: 0,
        }}>
          Portsmouth
        </h2>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
        {!isTilesLoaded && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#00f3ff' }}>
            <div style={{
              width: 20, height: 20, borderRadius: '50%',
              border: '3px solid currentColor', borderTopColor: 'transparent',
              animation: 'spin 1s linear infinite',
            }} />
            <span style={{ fontSize: '0.8rem', letterSpacing: '0.1em', fontFamily: 'monospace' }}>
              INITIALIZING PHOTOREALISTIC ENVIRONMENTS...
            </span>
          </div>
        )}

        <button
          disabled={!isTilesLoaded}
          onClick={handleEnter}
          style={{
            padding: '12px 48px',
            border: '2px solid #00f3ff',
            borderColor: isTilesLoaded ? '#00f3ff' : 'rgba(0, 243, 255, 0.2)',
            color: isTilesLoaded ? '#00f3ff' : 'rgba(0, 243, 255, 0.2)',
            background: 'transparent',
            fontSize: '1rem',
            letterSpacing: '0.3em',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            cursor: isTilesLoaded ? 'pointer' : 'default',
            transition: 'all 0.3s ease',
            borderRadius: 0,
          }}
        >
          {isTilesLoaded ? 'PROCEED' : 'LOADING TILES'}
        </button>
      </div>

      <div style={{
        position: 'absolute',
        bottom: '5%',
        width: '100%',
        opacity: 0.4,
        fontSize: '1rem',
        fontFamily: 'monospace',
        textAlign: 'center' as const,
      }}>
        Leon Ng // <a href="https://hackpompey.co.uk/2026-century-hack" target="_blank" rel="noopener noreferrer" style={{ color: '#00f3ff' }}>HackPompey 2026</a>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default BannerOverlay;
