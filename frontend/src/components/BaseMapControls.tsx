import { useRef, useState, useEffect } from 'react';
import { UrlTemplateImageryProvider, Color } from 'cesium';

type BaseMapId = 'dark' | 'light' | 'satellite' | 'osm' | 'carto-dark';

interface BaseMapOption {
  id: BaseMapId;
  label: string;
  emoji: string;
  /** Solid globe base colour (no imagery layer). */
  baseColor?: string;
  /** Imagery tile URL template (uses {z}/{x}/{y}, or {z}/{y}/{x} for ESRI). */
  url?: string;
  subdomains?: string[];
  credit?: string;
}

const BASE_MAPS: BaseMapOption[] = [
  {
    id: 'satellite',
    label: 'Satellite',
    emoji: '🛰',
    // ESRI World Imagery — no API key required
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    credit: 'Tiles © Esri',
  },
  {
    id: 'osm',
    label: 'Streets',
    emoji: '🗺',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    credit: '© OpenStreetMap contributors',
  },
  {
    id: 'carto-dark',
    label: 'Dark Streets',
    emoji: '🌆',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    subdomains: ['a', 'b', 'c', 'd'],
    credit: 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
  },
];

interface BaseMapControlsProps {
  viewerRef: React.MutableRefObject<any>;
}

export const BaseMapControls: React.FC<BaseMapControlsProps> = ({ viewerRef }) => {
  const [selected, setSelected] = useState<BaseMapId>('carto-dark');
  const currentLayerRef = useRef<any>(null);

  // Apply the selected map on mount once the viewer is available
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer && !currentLayerRef.current) {
      const initialMap = BASE_MAPS.find(m => m.id === selected);
      if (initialMap) handleSelect(initialMap);
    }
  }, [viewerRef.current?.cesiumElement]);

  const handleSelect = (option: BaseMapOption) => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;

    setSelected(option.id);

    // Remove previous imagery layer
    if (currentLayerRef.current) {
      viewer.imageryLayers.remove(currentLayerRef.current, true);
      currentLayerRef.current = null;
    }

    if (option.baseColor) {
      // Solid-color mode — no imagery, no z-fighting
      viewer.scene.globe.baseColor = Color.fromCssColorString(option.baseColor);
    } else if (option.url) {
      // Imagery mode — reset base color to dark so seams aren't jarring
      viewer.scene.globe.baseColor = Color.fromCssColorString('#101217');
      const provider = new UrlTemplateImageryProvider({
        url: option.url,
        credit: option.credit || '',
        subdomains: option.subdomains,
      });
      const layer = viewer.imageryLayers.addImageryProvider(provider, 0);
      currentLayerRef.current = layer;
    }

    viewer.scene.requestRender();
  };

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        zIndex: 10,
        background: 'rgba(25, 25, 25, 0.9)',
        color: '#fff',
        padding: '10px 12px',
        borderRadius: '8px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.1)',
        fontFamily: '"Inter", "system-ui", sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        minWidth: '140px',
      }}
    >
      <span style={{ fontSize: '11px', fontWeight: 'bold', letterSpacing: '0.5px', color: '#00ffcc' }}>
        BASE MAP
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {BASE_MAPS.map(option => {
          const isActive = selected === option.id;
          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: isActive ? '1px solid #00ffcc' : '1px solid rgba(255,255,255,0.1)',
                background: isActive ? 'rgba(0,255,204,0.12)' : 'rgba(255,255,255,0.04)',
                color: isActive ? '#00ffcc' : '#ccc',
                fontSize: '12px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                textAlign: 'left',
                fontFamily: 'inherit',
              }}
            >
              <span style={{ fontSize: '14px' }}>{option.emoji}</span>
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
