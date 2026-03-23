import { useEffect, useRef, useState } from 'react';
import { Viewer, ImageryLayer } from 'resium';
import { Cartesian3, createGooglePhotorealistic3DTileset, createWorldTerrainAsync, Math as CesiumMath, UrlTemplateImageryProvider, ClippingPolygon, ClippingPolygonCollection, ClippingPlane, ClippingPlaneCollection, Ion } from 'cesium';
import { PORTSEA_POLYGON_COORDS } from '@/lib/consts';

// Set Ion token securely from environment variables
if (import.meta.env.VITE_CESIUM_ION_TOKEN) {
  Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
}

// Portsmouth coordinates
const PORTSMOUTH_LON = -1.0856;
const PORTSMOUTH_LAT = 50.7990;
const HEIGHT = 1500; // meters

const cartoDarkMatter = new UrlTemplateImageryProvider({
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  credit: 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
  subdomains: ['a', 'b', 'c', 'd']
});

const CityMap = () => {
  const viewerRef = useRef(null);
  const [terrainProvider, setTerrainProvider] = useState(null);
  const [minHeight, setMinHeight] = useState(10);
  const [sse, setSse] = useState(4);
  const [fxaaEnabled, setFxaaEnabled] = useState(true);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const clippingPlaneRef = useRef(null);
  const earthRadiusRef = useRef(0);
  const tilesetRef = useRef(null);

  // Update tileset/scene properties when settings change
  useEffect(() => {
    if (tilesetRef.current) {
      tilesetRef.current.maximumScreenSpaceError = sse;
    }
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer && viewer.scene && viewer.scene.postProcessStages?.fxaa) {
      viewer.scene.postProcessStages.fxaa.enabled = fxaaEnabled;
      viewer.scene.requestRender();
    }
  }, [sse, fxaaEnabled]);

  useEffect(() => {
    if (clippingPlaneRef.current && earthRadiusRef.current !== 0) {
      clippingPlaneRef.current.distance = -(earthRadiusRef.current + minHeight);

      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    }
  }, [minHeight]);

  useEffect(() => {
    let isMounted = true;

    // Load Cesium World Terrain so buildings don't float or Z-fight
    createWorldTerrainAsync().then(terrain => {
      if (!isMounted) return;

      setTerrainProvider(terrain);
      const viewer = viewerRef.current?.cesiumElement;

      if (viewer && viewer.scene && !viewer.isDestroyed()) {
        // Init camera position once on load to prevent jumping when UI state changes
        viewer.camera.flyTo({
          destination: Cartesian3.fromDegrees(PORTSMOUTH_LON, PORTSMOUTH_LAT, HEIGHT),
          orientation: {
            heading: CesiumMath.toRadians(0.0),
            pitch: CesiumMath.toRadians(-45.0),
            roll: 0.0
          },
          duration: 0
        });

        viewer.terrainProvider = terrain;
        viewer.scene.globe.depthTestAgainstTerrain = true;

        const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

        // Load Photorealistic 3D Tiles
        createGooglePhotorealistic3DTileset({
          key: googleKey || undefined,
          onlyUsingWithGoogleGeocoder: true
        }).then(tileset => {
          if (!isMounted || viewer.isDestroyed()) return;

          // Only show tiles strictly within the Portsmouth boundary polygon
          tileset.clippingPolygons = new ClippingPolygonCollection({
            polygons: [
              new ClippingPolygon({
                positions: Cartesian3.fromDegreesArray(PORTSEA_POLYGON_COORDS.flat())
              })
            ]
          });
          tileset.clippingPolygons.inverse = true; // explicitly inverse to clip REST of world

          // Add height clipping plane
          const center = Cartesian3.fromDegrees(PORTSMOUTH_LON, PORTSMOUTH_LAT);
          const normal = Cartesian3.normalize(center, new Cartesian3());
          earthRadiusRef.current = Cartesian3.magnitude(center);

          const plane = new ClippingPlane(normal, -(earthRadiusRef.current + minHeight));
          clippingPlaneRef.current = plane;

          tileset.clippingPlanes = new ClippingPlaneCollection({
            planes: [plane],
            edgeWidth: 0.0
          });

          // Initial setup of SSE and FXAA
          tileset.maximumScreenSpaceError = sse;
          tilesetRef.current = tileset;

          if (viewer.scene.postProcessStages && viewer.scene.postProcessStages.fxaa) {
            viewer.scene.postProcessStages.fxaa.enabled = fxaaEnabled;
          }

          viewer.scene.primitives.add(tileset);
        }).catch(err => console.warn("Could not load Google Photorealistic Tiles:", err));
      }
    }).catch(err => console.warn("Could not load terrain:", err));

    return () => { isMounted = false; };
  }, []);

  return (
    <>
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
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
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            userSelect: 'none'
          }}
        >
          <span style={{ fontSize: '14px', fontWeight: 'bold', letterSpacing: '0.5px' }}>
            ADVANCED CONTROLS
          </span>
          <span style={{
            transform: isAdvancedOpen ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            fontSize: '12px'
          }}>
            ▼
          </span>
        </div>

        {isAdvancedOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '4px' }}>
            {/* Height Control */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <label>Min Height</label>
                <span style={{ color: '#00ffcc' }}>{minHeight}m</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                step="1"
                value={minHeight}
                onChange={(e) => setMinHeight(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#00ffcc' }}
              />
            </div>

            {/* SSE / Detail Level Control */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                <label>Detail Level (SSE)</label>
                <span style={{ color: '#00ffcc' }}>{sse}</span>
              </div>
              <input
                type="range"
                min="1"
                max="32"
                step="1"
                value={sse}
                onChange={(e) => setSse(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#00ffcc' }}
              />
              <div style={{ fontSize: '10px', color: '#888', fontStyle: 'italic' }}>
                Lower = Higher Detail (Fixes &quot;Jagged&quot; tiles)
              </div>
            </div>

            {/* FXAA Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px' }}>
              <label>Smooth Edges (FXAA)</label>
              <input
                type="checkbox"
                checked={fxaaEnabled}
                onChange={(e) => setFxaaEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#00ffcc' }}
              />
            </div>
          </div>
        )}
      </div>
      <Viewer
        full
        ref={viewerRef}
        terrainProvider={terrainProvider || undefined}
        timeline={false}
        animation={false}
        homeButton={false}
        geocoder={false}
        navigationHelpButton={false}
        sceneModePicker={false}
        baseLayerPicker={false}
        imageryProvider={false}
        requestRenderMode={true} // Optimize rendering
      >
        <ImageryLayer imageryProvider={cartoDarkMatter} />
      </Viewer>
    </>
  );
};

export default CityMap;
