import { useEffect, useRef, useState } from 'react';
import { Viewer, ImageryLayer } from 'resium';
import { ContextMenuLogic } from './ContextMenuLogic';
import { AdvancedControls } from './AdvancedControls';
import { ContextMenuPopup } from './ContextMenuPopup';
import { BillboardsOverlay } from './BillboardsOverlay';
import { Cartesian3, createGooglePhotorealistic3DTileset, createWorldTerrainAsync, Math as CesiumMath, UrlTemplateImageryProvider, ClippingPolygon, ClippingPolygonCollection, ClippingPlane, ClippingPlaneCollection, Ion, ScreenSpaceEventType, SceneTransforms, Cartographic, ScreenSpaceEventHandler, CameraEventType, Color, DistanceDisplayCondition, HeightReference, CustomShader, UniformType, Transforms } from 'cesium';
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
  const [sse, setSse] = useState<number>(20);
  const [fxaaEnabled, setFxaaEnabled] = useState<boolean>(true);
  const [resolutionScale, setResolutionScale] = useState<number>(0.9);
  const [optimizeVisuals, setOptimizeVisuals] = useState<boolean>(false);

  const clippingPlaneRef = useRef<ClippingPlane | null>(null);
  const earthRadiusRef = useRef<number>(0);
  const tilesetRef = useRef<any>(null);

  const [fps, setFps] = useState<number>(0);

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
    let frameCount = 0;
    let lastTime = performance.now();
    let postRenderListener: () => void;

    const setupFpsTracker = setInterval(() => {
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && viewer.scene) {
        clearInterval(setupFpsTracker);
        postRenderListener = () => {
          frameCount++;
          const now = performance.now();
          if (now - lastTime >= 1000) {
            setFps(Math.round((frameCount * 1000) / (now - lastTime)));
            frameCount = 0;
            lastTime = now;
          }
        };
        viewer.scene.postRender.addEventListener(postRenderListener);
      }
    }, 500);

    return () => {
      clearInterval(setupFpsTracker);
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && viewer.scene && postRenderListener) {
        viewer.scene.postRender.removeEventListener(postRenderListener);
      }
    };
  }, []);

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
    if (clippingPlaneRef.current) {
      clippingPlaneRef.current.distance = -minHeight;

      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && !viewer.isDestroyed()) {
        viewer.scene.requestRender();
      }
    }
  }, [minHeight]);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
      viewer.resolutionScale = resolutionScale;
      viewer.scene.requestRender();
    }
  }, [resolutionScale]);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer && viewer.scene) {
      if (optimizeVisuals) {
        viewer.shadows = false;
        viewer.scene.fog.enabled = false;
        viewer.scene.skyAtmosphere.show = false;
        viewer.scene.globe.showWaterEffect = false;
      } else {
        viewer.scene.fog.enabled = true;
        viewer.scene.skyAtmosphere.show = true;
      }
      viewer.scene.requestRender();
    }
  }, [optimizeVisuals]);

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

          // Height clipping via ClippingPlane
          const center = Cartesian3.fromDegrees(PORTSMOUTH_LON, PORTSMOUTH_LAT);
          earthRadiusRef.current = Cartesian3.magnitude(center);

          const clippingPlane = new ClippingPlane(new Cartesian3(0.0, 0.0, 1.0), -minHeight);
          clippingPlaneRef.current = clippingPlane;

          tileset.clippingPlanes = new ClippingPlaneCollection({
            modelMatrix: Transforms.eastNorthUpToFixedFrame(center),
            planes: [clippingPlane],
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

      <AdvancedControls
        fps={fps}
        optimizeVisuals={optimizeVisuals} setOptimizeVisuals={setOptimizeVisuals}
        resolutionScale={resolutionScale} setResolutionScale={setResolutionScale}
        minHeight={minHeight} setMinHeight={setMinHeight}
        sse={sse} setSse={setSse}
        fxaaEnabled={fxaaEnabled} setFxaaEnabled={setFxaaEnabled}
      />

      {/* --- Overlay UI --- */}
      {/* Context Menu */}
      <ContextMenuPopup contextMenu={contextMenu} handleShowDetails={handleShowDetails} />

      {/* Floating Detail Billboards */}
      <BillboardsOverlay
        billboards={billboards}
        setBillboards={setBillboards}
        billboardsRef={billboardsRef}
        requestRender={() => {
          const viewer = viewerRef.current?.cesiumElement;
          if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        }}
      />
    </div>
  );
};

export default CityMap;
