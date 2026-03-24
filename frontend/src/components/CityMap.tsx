import { useEffect, useRef, useState } from 'react';
import { Viewer, ImageryLayer, Entity } from 'resium';
import { ContextMenuLogic } from './ContextMenuLogic';
import { AdvancedControls } from './AdvancedControls';
import { ContextMenuPopup } from './ContextMenuPopup';
import { BillboardsOverlay } from './BillboardsOverlay';
import { Cartesian3, createGooglePhotorealistic3DTileset, createWorldTerrainAsync, Math as CesiumMath, UrlTemplateImageryProvider, ClippingPolygon, ClippingPolygonCollection, ClippingPlane, ClippingPlaneCollection, Ion, ScreenSpaceEventType, SceneTransforms, Cartographic, ScreenSpaceEventHandler, CameraEventType, Color, DistanceDisplayCondition, HeightReference, CustomShader, UniformType, Transforms, PolygonGeometry, GeometryInstance, Primitive, Ellipsoid, Material, MaterialAppearance, buildModuleUrl, EllipsoidSurfaceAppearance, CallbackProperty, GridMaterialProperty, Cartesian2, JulianDate, ColorMaterialProperty, sampleTerrainMostDetailed, PolygonHierarchy, VerticalOrigin, HorizontalOrigin, ConstantProperty } from 'cesium';
import { PORTSEA_POLYGON_COORDS } from '@/lib/consts';
import { SimulationControls } from './SimulationControls';

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
const PORTSMOUTH_LON = -1.1088475841206984;
const PORTSMOUTH_LAT = 50.795478268951065;
const HEIGHT = 1500; // meters

const cartoDarkMatter = new UrlTemplateImageryProvider({
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  credit: 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
  subdomains: ['a', 'b', 'c', 'd']
});

const CityMap = () => {
  const viewerRef = useRef<any>(null);
  const [terrainProvider, setTerrainProvider] = useState<any>(null);
  const [floodHeight, setFloodHeight] = useState<number>(0);
  const [animatedFloodHeight, setAnimatedFloodHeight] = useState<number>(0);
  const [sse, setSse] = useState<number>(20);
  const [fxaaEnabled, setFxaaEnabled] = useState<boolean>(true);
  const [resolutionScale, setResolutionScale] = useState<number>(0.9);
  const [optimizeVisuals, setOptimizeVisuals] = useState<boolean>(false);
  const [waterOpacity, setWaterOpacity] = useState<number>(0.7);
  const [baseHeight, setBaseHeight] = useState<number>(0);

  const tilesetRef = useRef<any>(null);
  // Refs for Cesium callback properties (avoids stale closures / requestRenderMode issues)
  const animatedFloodHeightRef = useRef<number>(10);
  const waterOpacityRef = useRef<number>(0.7);
  const baseHeightRef = useRef<number>(0);

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

  // Smooth animation for floodHeight
  useEffect(() => {
    let animationFrame: number;
    const startTime = performance.now();
    const duration = 1000; // 1 second for smooth transition
    const startHeight = animatedFloodHeight;
    const targetHeight = floodHeight;

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing: easeInOutQuad
      const easedProgress = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

      const currentHeight = startHeight + (targetHeight - startHeight) * easedProgress;
      setAnimatedFloodHeight(currentHeight);
      animatedFloodHeightRef.current = currentHeight; // Keep ref in sync

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [floodHeight]);

  // Request render on animated height change
  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer && !viewer.isDestroyed()) {
      viewer.scene.requestRender();
    }
  }, [animatedFloodHeight]);

  // Sync opacity ref so CallbackProperty always reads the latest value
  useEffect(() => { waterOpacityRef.current = waterOpacity; }, [waterOpacity]);

  // Fallback: if viewer was ready before baseHeight was sampled, entity may not have been created
  const waterEntityRef = useRef<any>(null);
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
          destination: Cartesian3.fromDegrees(
            -1.114619, 50.792307, 182.83
          ),
          orientation: {
            heading: CesiumMath.toRadians(58.79),
            pitch: CesiumMath.toRadians(-6.83),
            roll: CesiumMath.toRadians(0),
          }
        });
        // viewer.camera.flyTo({
        //   destination: Cartesian3.fromDegrees(PORTSMOUTH_LON, PORTSMOUTH_LAT, HEIGHT),
        //   orientation: {
        //     heading: CesiumMath.toRadians(80.0),
        //     pitch: CesiumMath.toRadians(-45.0),
        //     roll: 0.0
        //   },
        //   duration: 0
        // });

        viewer.terrainProvider = terrain;
        viewer.scene.globe.depthTestAgainstTerrain = true; // Required for proper object rendering over terrain

        const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

        // Load Photorealistic 3D Tiles
        createGooglePhotorealistic3DTileset({
          key: googleKey || undefined,
          onlyUsingWithGoogleGeocoder: true
        }).then(tileset => {
          if (!isMounted || viewer.isDestroyed()) return;

          const polygonPositionsForWater = Cartesian3.fromDegreesArray(PORTSEA_POLYGON_COORDS.flat());

          // Re-apply boundary clipping to the tileset (strictly Portsmouth)
          tileset.clippingPolygons = new ClippingPolygonCollection({
            polygons: [
              new ClippingPolygon({
                positions: polygonPositionsForWater
              })
            ],
            inverse: true // Clip OUTSIDE the polygon
          });

          // Globe clipping and vertical clipping planes remain disabled for the volume approach
          viewer.scene.globe.clippingPolygons = new ClippingPolygonCollection();
          tileset.clippingPlanes = new ClippingPlaneCollection();
          // Elevation/Volume based flooding approach
          // Sample terrain height at the center of Portsmouth to offset the water volume correctly
          const centerCartographic = Cartographic.fromDegrees(PORTSMOUTH_LON, PORTSMOUTH_LAT);
          sampleTerrainMostDetailed(terrain, [centerCartographic]).then(updated => {
            const h = (updated && updated.length > 0 && updated[0].height !== undefined)
              ? updated[0].height
              : 47;
            console.log('Portsmouth Base Height Sampled:', h);
            // Update ref immediately; CallbackProperty reads this live
            baseHeightRef.current = h;
            setBaseHeight(h);

            if (!viewer.isDestroyed()) {
              // // Diagnostic label
              // viewer.entities.add({
              //   position: Cartesian3.fromDegrees(PORTSMOUTH_LON, PORTSMOUTH_LAT, h + 80),
              //   label: {
              //     text: `Base: ${h.toFixed(1)}m`,
              //     font: '14px sans-serif',
              //     fillColor: Color.AQUA,
              //     outlineColor: Color.BLACK,
              //     outlineWidth: 2,
              //     style: 2,
              //     verticalOrigin: VerticalOrigin.BOTTOM,
              //     disableDepthTestDistance: Number.POSITIVE_INFINITY
              //   }
              // });

              // Flood water volume
              if (!waterEntityRef.current) {
                const positions = Cartesian3.fromDegreesArray(PORTSEA_POLYGON_COORDS.flat());
                waterEntityRef.current = viewer.entities.add({
                  name: 'Flood Water',
                  polygon: {
                    hierarchy: new ConstantProperty(new PolygonHierarchy(positions)),
                    height: new CallbackProperty(() => baseHeightRef.current, false),
                    extrudedHeight: new CallbackProperty(
                      () => baseHeightRef.current + animatedFloodHeightRef.current, false
                    ),
                    material: new ColorMaterialProperty(
                      new CallbackProperty(
                        () => Color.NAVY.withAlpha(Math.max(waterOpacityRef.current, 0.1)), false
                      )
                    ),
                    outline: new ConstantProperty(false),
                  }
                });
              }
            }
          });

          // No clipping planes or primitives needed here.

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
        requestRenderMode={false}
      >
        <ContextMenuLogic setContextMenu={setContextMenu} billboards={billboards} billboardsRef={billboardsRef} />

        {/* Lines now drawn imperatively inside ContextMenuLogic */}
        <ImageryLayer imageryProvider={cartoDarkMatter} />

        {/* All entities are managed imperatively via viewer.entities for requestRenderMode compatibility */}
      </Viewer>

      <SimulationControls floodHeight={floodHeight} setFloodHeight={setFloodHeight} />

      <AdvancedControls
        fps={fps}
        optimizeVisuals={optimizeVisuals} setOptimizeVisuals={setOptimizeVisuals}
        resolutionScale={resolutionScale} setResolutionScale={setResolutionScale}
        sse={sse} setSse={setSse}
        fxaaEnabled={fxaaEnabled} setFxaaEnabled={setFxaaEnabled}
        waterOpacity={waterOpacity} setWaterOpacity={setWaterOpacity}
        viewerRef={viewerRef}
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
