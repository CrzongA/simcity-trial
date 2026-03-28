import React, { useState, useEffect, useRef } from 'react';
import { useAppDispatch, useAppSelector } from '../store';
import { setActiveStory } from '../store/storySlice';

const INFORMATIVE_STORIES = [
  { id: 'community-reports', label: 'Community Reports', emoji: '🗑️' },
  { id: 'air-quality', label: 'Air Quality', emoji: '🌬️' },
  { id: 'ship-tracking', label: 'Ship Tracking', emoji: '🚢' },
];

const SIMULATION_STORIES = [
  { id: 'sea-level-rise', label: 'Sea Level Rise', emoji: '🌊' },
  { id: 'drone-flying', label: 'Drone FPV', emoji: '🚁' },
  { id: 'model-design', label: 'Design Portsmouth', emoji: '🏗️' },
];

const ALL_STORIES = [...INFORMATIVE_STORIES, ...SIMULATION_STORIES];

const HINT_KEY = 'cityintime_stories_hint_shown';

export const StoriesMenu: React.FC = () => {
  const dispatch = useAppDispatch();
  const activeStory = useAppSelector(state => state.story.activeStory);
  const isAppStarted = useAppSelector(state => state.ui.isAppStarted);

  const isFirstVisit = !localStorage.getItem(HINT_KEY);
  const [showHint, setShowHint] = useState(false);
  const [expanded, setExpanded] = useState(false);
  
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isAppStarted || !isFirstVisit) return;
    localStorage.setItem(HINT_KEY, '1');
    setShowHint(true);
    const timer = setTimeout(() => setShowHint(false), 15000);
    return () => clearTimeout(timer);
  }, [isAppStarted]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setExpanded(false);
      }
    };

    if (expanded) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [expanded]);

  const activeStoryObj = ALL_STORIES.find(s => s.id === activeStory);

  return (
    <div ref={menuRef}>
      {/* Expanded Menu Drawer */}
      <div 
        style={{
          position: 'absolute',
          bottom: '80px',
          left: '50%',
          transform: `translate(-50%, ${expanded ? '0' : '40px'})`,
          opacity: expanded ? 1 : 0,
          pointerEvents: expanded ? 'auto' : 'none',
          transition: 'transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease',
          zIndex: 90,
          background: '#101217',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '16px',
          padding: '24px',
          width: '560px',
          maxWidth: '90vw',
          boxShadow: '0 16px 48px rgba(0,0,0,0.8)',
          fontFamily: '"Inter", "system-ui", sans-serif',
        }}
      >
        <button 
          onClick={() => setExpanded(false)}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'rgba(255,255,255,0.5)',
            cursor: 'pointer',
            fontSize: '20px'
          }}
        >
          ✕
        </button>
        
        <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', color: '#fff', textAlign: 'center' }}>
          Explore Stories
        </h2>

        <div style={{ display: 'flex', gap: '24px' }}>
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
              Informative
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {INFORMATIVE_STORIES.map(story => (
                <button
                  key={story.id}
                  onClick={() => {
                    dispatch(setActiveStory(activeStory === story.id ? null : story.id));
                    setExpanded(false);
                  }}
                  style={{
                    background: activeStory === story.id ? 'rgba(0, 255, 204, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: activeStory === story.id ? '1px solid #00ffcc' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: activeStory === story.id ? '#00ffcc' : '#ccc',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    textAlign: 'left',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ marginRight: '8px' }}>{story.emoji}</span>
                  {story.label}
                </button>
              ))}
            </div>
          </div>
          
          <div style={{ flex: 1 }}>
            <h3 style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>
              Simulations
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {SIMULATION_STORIES.map(story => (
                <button
                  key={story.id}
                  onClick={() => {
                    dispatch(setActiveStory(activeStory === story.id ? null : story.id));
                    setExpanded(false);
                  }}
                  style={{
                    background: activeStory === story.id ? 'rgba(0, 255, 204, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                    border: activeStory === story.id ? '1px solid #00ffcc' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: activeStory === story.id ? '#00ffcc' : '#ccc',
                    padding: '12px 16px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    textAlign: 'left',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span style={{ marginRight: '8px' }}>{story.emoji}</span>
                  {story.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Collapsed Menu Button Wrapper */}
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
          display: showHint && !expanded ? 'block' : 'none',
          opacity: showHint && !expanded ? 1 : 0,
          transform: showHint && !expanded ? 'translateY(0)' : 'translateY(6px)',
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
          borderRadius: '4px',
          padding: '6px 16px',
          whiteSpace: 'nowrap',
        }}>
          Explore different imaginative visualizations by choosing a scenario below!
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          {activeStoryObj && (
            <button
              onClick={() => dispatch(setActiveStory(null))}
              style={{
                background: 'rgba(0, 255, 204, 0.15)',
                border: '1px solid #00ffcc',
                color: '#00ffcc',
                padding: '10px 16px',
                cursor: 'pointer',
                fontSize: '14px',
                fontFamily: '"Inter", "system-ui", sans-serif',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                borderRadius: '24px',
                boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                transition: 'all 0.2s ease',
              }}
              title="Close Active Story"
            >
              <span>{activeStoryObj.emoji}</span>
              {activeStoryObj.label}
              <span style={{ 
                marginLeft: '4px', 
                fontSize: '14px', 
                lineHeight: 1, 
                opacity: 0.8 
              }}>✕</span>
            </button>
          )}
          
          <button
            onClick={() => setExpanded(true)}
            style={{
              background: '#101217',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#fff',
              padding: '10px 24px',
              cursor: 'pointer',
              fontSize: '14px',
              fontFamily: '"Inter", "system-ui", sans-serif',
              fontWeight: 500,
              borderRadius: '24px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.8)',
              transition: 'all 0.2s ease',
            }}
          >
            Explore Stories
          </button>
        </div>
      </div>
    </div>
  );
};
