import { useEffect, useRef, useState } from 'react';
import { Viewer, ImageryLayer } from 'resium';
import { ContextMenuLogic } from './ContextMenuLogic';
import { Cartesian3, createGooglePhotorealistic3DTileset, createWorldTerrainAsync, Math as CesiumMath, UrlTemplateImageryProvider, ClippingPolygon, ClippingPolygonCollection, ClippingPlane, ClippingPlaneCollection, Ion, ScreenSpaceEventType, SceneTransforms, Cartographic, ScreenSpaceEventHandler, CameraEventType, Color, DistanceDisplayCondition, HeightReference, CustomShader, UniformType } from 'cesium';
import { PORTSEA_POLYGON_COORDS } from '@/lib/consts';

export interface BillboardData {
  id: string;
  cartesian: Cartesian3; // 200m hovering point
  surfaceCartesian: Cartesian3; // Ground level point
  locationName: string;
  height: number;
  loading: boolean;
}


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
  const viewerRef = useRef<any>(null);
  const [terrainProvider, setTerrainProvider] = useState<any>(null);
  const [minHeight, setMinHeight] = useState<number>(10);
  const [sse, setSse] = useState<number>(4);
  const [fxaaEnabled, setFxaaEnabled] = useState<boolean>(true);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);

  const clippingPlaneRef = useRef<ClippingPlane | null>(null);
  const earthRadiusRef = useRef<number>(0);
  const tilesetRef = useRef<any>(null);

  // -- Context Menu and Billboard State --
  const [contextMenu, setContextMenu] = useState<{ show: boolean, x: number, y: number, cartesian: Cartesian3 | null }>({ show: false, x: 0, y: 0, cartesian: null });
  const [billboards, setBillboards] = useState<BillboardData[]>([]);
  const billboardsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const fetchLocationName = async (lat: number, lng: number): Promise<string> => {
    try {
      const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!key) return "Unknown Location (No API Key)";
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
    } catch (e) {
      console.warn("Geocoding failed", e);
    }
    return "Unknown Location";
  };

  const handleShowDetails = async () => {
    if (!contextMenu.cartesian) return;

    const carto = Cartographic.fromCartesian(contextMenu.cartesian);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const lng = CesiumMath.toDegrees(carto.longitude);
    const height = carto.height;

    // Create new point 200m hovering
    const hoveringCartesian = Cartesian3.fromRadians(carto.longitude, carto.latitude, height + 400);
    const surfaceCartesian = Cartesian3.fromRadians(carto.longitude, carto.latitude, height);
    const newId = Date.now().toString();

    setBillboards(prev => [...prev, {
      id: newId,
      cartesian: hoveringCartesian,
      surfaceCartesian: surfaceCartesian,
      locationName: "Fetching...",
      height: Math.round(height),
      loading: true
    }]);

    setContextMenu({ show: false, x: 0, y: 0, cartesian: null });

    // We add an interval here since React state batches, so Cesium might not know to re-render the primitive instantly
    const interval = setInterval(() => {
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, 100);
    setTimeout(() => clearInterval(interval), 1000);

    const locName = await fetchLocationName(lat, lng);

    setBillboards(prev => {
      // Force a re-render hook so Cesium catches the state transition from loading to loaded
      setTimeout(() => {
        const viewer = viewerRef.current?.cesiumElement;
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
      }, 50);
      return prev.map(b => b.id === newId ? { ...b, locationName: locName, loading: false } : b);
    });
  };

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
    if (tilesetRef.current && tilesetRef.current.customShader && earthRadiusRef.current !== 0) {
      tilesetRef.current.customShader.setUniform('u_minDistance', earthRadiusRef.current + minHeight);

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
        viewer.scene.globe.depthTestAgainstTerrain = true; // Required for proper object rendering over terrain

        const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

        // Load Photorealistic 3D Tiles
        createGooglePhotorealistic3DTileset({
          key: googleKey || undefined,
          onlyUsingWithGoogleGeocoder: true
        }).then(tileset => {
          if (!isMounted || viewer.isDestroyed()) return;

          const polygonPositions = Cartesian3.fromDegreesArray(PORTSEA_POLYGON_COORDS.flat());

          // Only show 3D tiles strictly within the Portsmouth boundary polygon
          tileset.clippingPolygons = new ClippingPolygonCollection({
            polygons: [
              new ClippingPolygon({
                positions: polygonPositions
              })
            ],
            inverse: true // Clip OUTSIDE the polygon
          });

          // Clip the base terrain globe INSIDE the polygon so it doesn't clip through 3D tiles
          viewer.scene.globe.clippingPolygons = new ClippingPolygonCollection({
            polygons: [
              new ClippingPolygon({
                positions: polygonPositions
              })
            ]
          });

          // Add height clipping via custom shader (ClippingPlane and ClippingPolygon cannot be mixed)
          const center = Cartesian3.fromDegrees(PORTSMOUTH_LON, PORTSMOUTH_LAT);
          const normal = Cartesian3.normalize(center, new Cartesian3());
          earthRadiusRef.current = Cartesian3.magnitude(center);

          tileset.customShader = new CustomShader({
            uniforms: {
              u_minDistance: {
                type: UniformType.FLOAT,
                value: earthRadiusRef.current + minHeight
              },
              u_normal: {
                type: UniformType.VEC3,
                value: normal
              }
            },
            fragmentShaderText: `
              void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                float dist = dot(fsInput.attributes.positionWC, u_normal);
                if (dist < u_minDistance) {
                  discard;
                }
              }
            `
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
    <div style={{ width: '100%', height: '100%' }} onContextMenu={e => e.preventDefault()}>
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
        requestRenderMode={true} // Optimize rendering
      >
        <ContextMenuLogic setContextMenu={setContextMenu} billboards={billboards} billboardsRef={billboardsRef} />

        {/* Lines now drawn imperatively inside ContextMenuLogic */}

        <ImageryLayer imageryProvider={cartoDarkMatter} />
      </Viewer>

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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMinHeight(Number(e.target.value))}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSse(Number(e.target.value))}
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFxaaEnabled(e.target.checked)}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#00ffcc' }}
              />
            </div>
          </div>
        )}
      </div>

      {/* --- Overlay UI --- */}
      {/* Context Menu */}
      {contextMenu.show && (
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
      )}

      {/* Floating Detail Billboards */}
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
                  setTimeout(() => {
                    const viewer = viewerRef.current?.cesiumElement;
                    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
                  }, 50);
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
    </div>
  );
};

export default CityMap;
