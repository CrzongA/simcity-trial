import React, { useState, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { setActiveStory } from '../store/storySlice';

const STORIES = [
  { id: 'sea-level-rise', label: 'Sea Level Rise', emoji: '🌊' },
  { id: 'missile-strike', label: 'Missile Strike', emoji: '🚀' },
  { id: 'drone-flying', label: 'Drone FPV', emoji: '🚁' },
  { id: 'model-design', label: 'Design Portsmouth', emoji: '🏗️' },
];

const HINT_KEY = 'cityintime_stories_hint_shown';

export const StoriesMenu: React.FC = () => {
  const dispatch = useAppDispatch();
  const activeStory = useAppSelector(state => state.story.activeStory);
  const isAppStarted = useAppSelector(state => state.ui.isAppStarted);

  const isFirstVisit = !localStorage.getItem(HINT_KEY);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (!isAppStarted || !isFirstVisit) return;
    localStorage.setItem(HINT_KEY, '1');
    setShowHint(true);
    const timer = setTimeout(() => setShowHint(false), 15000);
    return () => clearTimeout(timer);
  }, [isAppStarted]);

  return (
    <div style={{
      position: 'absolute',
      bottom: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 50,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '8px',
    }}>
      {/* First-visit hint */}
      <div style={{
        opacity: showHint ? 1 : 0,
        transform: showHint ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 0.6s ease, transform 0.6s ease',
        pointerEvents: 'none',
        color: 'rgba(255,255,255,0.7)',
        fontSize: '12px',
        fontFamily: '"Inter", "system-ui", sans-serif',
        letterSpacing: '0.03em',
        textAlign: 'center',
        background: 'rgba(16, 18, 23, 0.7)',
        backdropFilter: 'blur(6px)',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '2px',
        padding: '6px 16px',
        whiteSpace: 'nowrap',
      }}>
        Explore different imaginative visualizations by choosing a scenario below!
      </div>

      <div
        style={{
          background: '#101217',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          padding: '12px 24px',
          display: 'flex',
          gap: '16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
          // SHARP design: 0px or 2px radius
          borderRadius: '2px',
          fontFamily: '"Inter", "system-ui", sans-serif',
        }}
      >
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            color: 'rgba(255,255,255,0.5)',
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            marginRight: '8px'
          }}
        >
          ACTIVE SIMULATION
        </span>

        {STORIES.map(story => {
          const isActive = activeStory === story.id;
          return (
            <button
              key={story.id}
              onClick={() => dispatch(setActiveStory(isActive ? null : story.id))}
              style={{
                background: isActive ? 'rgba(0, 255, 204, 0.15)' : 'transparent',
                border: isActive ? '1px solid #00ffcc' : '1px solid rgba(255, 255, 255, 0.2)',
                color: isActive ? '#00ffcc' : '#ccc',
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: 'inherit',
                transition: 'all 0.2s ease',
                borderRadius: '2px', // sharp corners
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontWeight: isActive ? 600 : 400
              }}
            >
              <span>{story.emoji}</span>
              {story.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
