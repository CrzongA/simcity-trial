import { useEffect, useRef, useState, useMemo } from 'react';
import { Viewer, Entity, ImageryLayer } from 'resium';
import { ContextMenuLogic } from './ContextMenuLogic';
import { AdvancedControls } from './AdvancedControls';
import { ContextMenuPopup } from './ContextMenuPopup';
import { BillboardsOverlay } from './BillboardsOverlay';
import { UrlTemplateImageryProvider, Cartesian3, createGooglePhotorealistic3DTileset, createWorldTerrainAsync, Math as CesiumMath, ClippingPolygon, ClippingPolygonCollection, ClippingPlane, ClippingPlaneCollection, Ion, ScreenSpaceEventType, SceneTransforms, Cartographic, ScreenSpaceEventHandler, CameraEventType, Color, DistanceDisplayCondition, HeightReference, CustomShader, UniformType, Transforms, PolygonGeometry, GeometryInstance, Primitive, Ellipsoid, Material, MaterialAppearance, buildModuleUrl, EllipsoidSurfaceAppearance, CallbackProperty, GridMaterialProperty, Cartesian2, JulianDate, ColorMaterialProperty, sampleTerrainMostDetailed, PolygonHierarchy, VerticalOrigin, HorizontalOrigin, ConstantProperty, Ray, Plane, IntersectionTests, PolylineGlowMaterialProperty } from 'cesium';
import { PORTSEA_POLYGON_COORDS } from '@/lib/consts';
import { SimulationControls } from './SimulationControls';
import { BaseMapControls, BASE_MAPS } from './BaseMapControls';
import { useAppSelector, useAppDispatch } from '../store';
import { StoriesMenu } from './StoriesMenu';
import { SeaLevelChart } from './SeaLevelChart';
import { SeaLevelMapController } from './stories/SeaLevelMapController';
import { MissileMenu } from './stories/MissileMenu';
import { MissileMapController } from './stories/MissileMapController';
import { DroneMapController } from './stories/DroneMapController';
import { DroneHUD } from './stories/DroneHUD';
import { DroneSettings } from './stories/DroneSettings';
import { ModelDesignMenu } from './stories/ModelDesignMenu';
import { ModelDesignMapController } from './stories/ModelDesignMapController';
import { setTilesLoaded } from '../store/uiSlice';
import BannerOverlay from './BannerOverlay';
import CityTitleOverlay from './CityTitleOverlay';

export interface BillboardData {
  id: string;
  cartesian: Cartesian3; // 200m hovering point
  surfaceCartesian: Cartesian3; // Ground level point
  locationName: string;
  height: number;
  buildingHeight?: number;
  isPinned: boolean;
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

// CartoDB imagery layer removed — globe.baseColor is used instead to avoid
// z-fighting / clipping through the photorealistic tiles.

const CityMap = () => {
  const dispatch = useAppDispatch();
  const viewerRef = useRef<any>(null);
  const [terrainProvider, setTerrainProvider] = useState<any>(null);
  const [sse, setSse] = useState<number>(16);
  const [autoSse, setAutoSse] = useState<boolean>(true);
  const autoSseRef = useRef<boolean>(true);
  const [fxaaEnabled, setFxaaEnabled] = useState<boolean>(true);
  const [resolutionScale, setResolutionScale] = useState<number>(0.9);
  const [optimizeVisuals, setOptimizeVisuals] = useState<boolean>(false);
  const [waterOpacity, setWaterOpacity] = useState<number>(0.8);
  const [tileCacheSize, setTileCacheSize] = useState<number>(400);
  const [preloadSiblings, setPreloadSiblings] = useState<boolean>(true);
  const [foveatedRendering, setFoveatedRendering] = useState<boolean>(false);
  const [baseHeight, setBaseHeight] = useState<number>(0);

  const tilesetRef = useRef<any>(null);
  // Refs for Cesium callback properties (avoids stale closures / requestRenderMode issues)
  const waterOpacityRef = useRef<number>(0.7);
  const baseHeightRef = useRef<number>(0);
  const activeStoryRef = useRef<string | null>(null);

  // Drone HUD DOM refs (updated imperatively by DroneMapController each frame)
  const droneAltRef = useRef<HTMLSpanElement | null>(null);
  const droneSpdRef = useRef<HTMLSpanElement | null>(null);
  const droneHdgRef = useRef<HTMLSpanElement | null>(null);
  const droneHorizonRef = useRef<SVGLineElement | null>(null);
  const droneCtrlRef = useRef<HTMLSpanElement | null>(null);

  const [fps, setFps] = useState<number>(0);

  // -- Context Menu and Billboard State --
  const [contextMenu, setContextMenu] = useState<{ show: boolean, x: number, y: number, cartesian: Cartesian3 | null }>({ show: false, x: 0, y: 0, cartesian: null });
  const [billboards, setBillboards] = useState<BillboardData[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const billboardsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // -- Redux Story State --
  const activeStory = useAppSelector(state => state.story.activeStory);

  // Sync activeStory to Ref for Cesium CallbackProperty usage
  useEffect(() => {
    activeStoryRef.current = activeStory;
    // Force a scene render when story changes to ensure CallbackProperty is evaluated
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
  }, [activeStory]);

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

  // Google Elevation API returns heights above EGM96 geoid (≈ mean sea level).
  // sampleTerrainMostDetailed returns WGS84 ellipsoid heights, which differ by
  // ~47 m at Portsmouth — so we always use this for the displayed value.
  const fetchMslElevation = async (lat: number, lng: number): Promise<number | null> => {
    try {
      const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      if (!key) return null;
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/elevation/json?locations=${lat},${lng}&key=${key}`
      );
      const data = await res.json();
      if (data.results?.[0]?.elevation !== undefined) return data.results[0].elevation;
    } catch (e) {
      console.warn('Elevation API failed', e);
    }
    return null;
  };

  const handleShowDetails = async () => {
    if (!contextMenu.cartesian) return;

    const carto = Cartographic.fromCartesian(contextMenu.cartesian);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const lng = CesiumMath.toDegrees(carto.longitude);

    // Original height from the picked scene (building rooftop or ground)
    const pickedHeight = carto.height;

    // Sample true terrain height at this position.
    // globe.clippingPolygons only affects rendering — terrain data is still
    // fully queryable via sampleTerrainMostDetailed even inside Portsmouth.
    // We prefer this over carto.height, which inside Portsmouth would return
    // the photorealistic tile surface (building/road), not ground elevation.
    let height = pickedHeight; // fallback
    if (terrainProvider) {
      try {
        const sampled = await sampleTerrainMostDetailed(terrainProvider, [
          Cartographic.fromDegrees(lng, lat)
        ]);
        if (sampled[0]?.height !== undefined) height = sampled[0].height;
      } catch {
        // terrain sampling failed — pickedHeight fallback remains
      }
    }

    // Building height is the difference between the picked surface and the ground.
    // If we clicked the ground, building height will be ~0.
    const buildingHeight = Math.max(0, pickedHeight - height);

    // Create new point 400m hovering above true terrain height
    const hoveringCartesian = Cartesian3.fromRadians(carto.longitude, carto.latitude, height + 400);
    const surfaceCartesian = Cartesian3.fromRadians(carto.longitude, carto.latitude, height);
    const newId = Date.now().toString();

    setBillboards(prev => [...prev, {
      id: newId,
      cartesian: hoveringCartesian,
      surfaceCartesian: surfaceCartesian,
      locationName: "Fetching...",
      height: Math.round(height),
      buildingHeight: Math.round(buildingHeight),
      isPinned: true,
      loading: true
    }]);

    setContextMenu({ show: false, x: 0, y: 0, cartesian: null });

    // We add an interval here since React state batches, so Cesium might not know to re-render the primitive instantly
    const interval = setInterval(() => {
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
    }, 100);
    setTimeout(() => clearInterval(interval), 1000);

    // Fire geocoding + MSL elevation in parallel — no added wait time
    const [locName, mslElevation] = await Promise.all([
      fetchLocationName(lat, lng),
      fetchMslElevation(lat, lng),
    ]);

    // Prefer Google Elevation (MSL/EGM96). Fall back to ellipsoid height minus
    // approximate geoid undulation for Portsmouth (~47 m) if API unavailable.
    const displayHeight = mslElevation !== null
      ? Math.round(mslElevation)
      : Math.round(height - 47);

    setBillboards(prev => {
      setTimeout(() => {
        const viewer = viewerRef.current?.cesiumElement;
        if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
      }, 50);
      return prev.map(b => b.id === newId ? { ...b, locationName: locName, height: displayHeight, loading: false } : b);
    });
  };

  const handleTogglePin = (id: string) => {
    setBillboards(prev => prev.map(b => b.id === id ? { ...b, isPinned: !b.isPinned } : b));
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) viewer.scene.requestRender();
  };

  const handleDragStart = (id: string) => {
    setDraggingId(id);
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer) {
      viewer.scene.screenSpaceCameraController.enableInputs = false;
    }
  };

  const handleDragMove = async (e: React.MouseEvent) => {
    if (!draggingId || !viewerRef.current?.cesiumElement) return;
    const viewer = viewerRef.current.cesiumElement;
    const billboard = billboards.find(b => b.id === draggingId);
    if (!billboard) return;

    const mousePos = new Cartesian2(e.clientX, e.clientY);
    const ray = viewer.camera.getPickRay(mousePos);
    if (!ray) return;

    // Get current altitude from the billboard's cartesian
    const carto = Cartographic.fromCartesian(billboard.cartesian);
    const altitude = carto.height;

    // Drag on a plane horizontal to the current position (Tangent Plane at altitude)
    const normal = Ellipsoid.WGS84.geodeticSurfaceNormal(billboard.cartesian);
    const dragPlane = Plane.fromPointNormal(billboard.cartesian, normal);

    const newPos = IntersectionTests.rayPlane(ray, dragPlane);
    if (!newPos) return;

    if (billboard.isPinned) {
      // If pinned, only update the billboard's position, surfaceCartesian stays locked.
      setBillboards(prev => prev.map(b => b.id === draggingId ? {
        ...b,
        cartesian: newPos
      } : b));
    } else {
      // If NOT pinned, update both as before (label follows ground point)
      const newCarto = Cartographic.fromCartesian(newPos);
      const lng = CesiumMath.toDegrees(newCarto.longitude);
      const lat = CesiumMath.toDegrees(newCarto.latitude);

      let terrainHeight = 0;
      if (terrainProvider) {
        try {
          const sampled = await sampleTerrainMostDetailed(terrainProvider, [
            Cartographic.fromDegrees(lng, lat)
          ]);
          if (sampled[0]?.height !== undefined) terrainHeight = sampled[0].height;
        } catch (err) {
          terrainHeight = billboard.height; // fallback if sampling fails mid-drag
        }
      }

      const newSurfacePos = Cartesian3.fromRadians(newCarto.longitude, newCarto.latitude, terrainHeight);

      // Calculate real-time readings during drag
      const mslHeight = Math.round(terrainHeight - 47);
      const bHeight = Math.max(0, Math.round(altitude - terrainHeight));

      setBillboards(prev => prev.map(b => b.id === draggingId ? {
        ...b,
        cartesian: newPos,
        surfaceCartesian: newSurfacePos,
        height: mslHeight,
        buildingHeight: bHeight,
        locationName: "Moving...",
        loading: true
      } : b));
    }

    viewer.scene.requestRender();
  };

  const handleDragEnd = async () => {
    if (!draggingId || !viewerRef.current?.cesiumElement) return;
    const id = draggingId;
    setDraggingId(null);
    const viewer = viewerRef.current.cesiumElement;
    viewer.scene.screenSpaceCameraController.enableInputs = true;

    // Update the final location details
    const billboard = billboards.find(b => b.id === id);
    if (!billboard) return;

    // If pinned, skip re-sampling since the ground point didn't move
    if (billboard.isPinned) {
      setBillboards(prev => prev.map(b => b.id === id ? { ...b, loading: false } : b));
      viewer.scene.requestRender();
      return;
    }

    const carto = Cartographic.fromCartesian(billboard.cartesian);
    const lat = CesiumMath.toDegrees(carto.latitude);
    const lng = CesiumMath.toDegrees(carto.longitude);

    const [locName, mslElevation] = await Promise.all([
      fetchLocationName(lat, lng),
      fetchMslElevation(lat, lng),
    ]);

    const displayHeight = mslElevation !== null
      ? Math.round(mslElevation)
      : Math.round(carto.height - 400 - 47); // fallback logic

    setBillboards(prev => prev.map(b => b.id === id ? {
      ...b,
      locationName: locName,
      height: displayHeight,
      loading: false
    } : b));

    viewer.scene.requestRender();
  };

  // Update tileset/scene properties when settings change
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let postRenderListener: () => void;

    const getAutoSse = (heightM: number): number => {
      if (heightM < 3000) return 16;
      if (heightM < 6000) return 10;
      return 2;
    };

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

          // Dynamic SSE based on camera height
          if (autoSseRef.current && tilesetRef.current) {
            const h = viewer.camera.positionCartographic?.height ?? 0;
            const targetSse = getAutoSse(h);
            if (tilesetRef.current.maximumScreenSpaceError !== targetSse) {
              tilesetRef.current.maximumScreenSpaceError = targetSse;
              setSse(targetSse); // keep slider in sync
            }
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

  // Sync autoSse ref so postRender closure reads the latest value
  useEffect(() => { autoSseRef.current = autoSse; }, [autoSse]);

  useEffect(() => {
    // SSE slider only applies in manual mode
    if (!autoSse && tilesetRef.current) {
      tilesetRef.current.maximumScreenSpaceError = sse;
    }
    const viewer = viewerRef.current?.cesiumElement;
    if (viewer && viewer.scene && viewer.scene.postProcessStages?.fxaa) {
      viewer.scene.postProcessStages.fxaa.enabled = fxaaEnabled;
      viewer.scene.requestRender();
    }
  }, [sse, fxaaEnabled, autoSse]);

  // Sync opacity ref so CallbackProperty always reads the latest value
  useEffect(() => { waterOpacityRef.current = waterOpacity; }, [waterOpacity]);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.scene.globe.tileCacheSize = tileCacheSize;
    viewer.scene.globe.preloadSiblings = preloadSiblings;
    viewer.scene.requestRender();
  }, [tileCacheSize, preloadSiblings]);

  useEffect(() => {
    const viewer = viewerRef.current?.cesiumElement;
    if (!viewer || viewer.isDestroyed()) return;
    viewer.scene.globe.foveatedScreenSpaceError = foveatedRendering;
    if (tilesetRef.current) tilesetRef.current.foveatedScreenSpaceError = foveatedRendering;
    viewer.scene.requestRender();
  }, [foveatedRendering]);

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

        viewer.terrainProvider = terrain;
        viewer.scene.globe.depthTestAgainstTerrain = true;

        // Default dark base colour — ensures no z-fighting or blue seams while imagery loads.
        // BaseMapControls manages all imagery layers imperatively.
        viewer.scene.globe.baseColor = Color.fromCssColorString('#101217');

        // Tile streaming defaults — larger cache + preload neighbours for smooth flyovers
        viewer.scene.globe.tileCacheSize = 400;
        viewer.scene.globe.preloadSiblings = true;

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

          // Hide the globe terrain mesh inside Portsmouth so the dark base colour
          // cannot bleed through gaps in the photorealistic tile geometry.
          // The tileset fully covers this area, so there is no visible void.
          // The water entity uses absolute sampled heights and is unaffected.
          viewer.scene.globe.clippingPolygons = new ClippingPolygonCollection({
            polygons: [
              new ClippingPolygon({ positions: polygonPositionsForWater })
            ],
            // inverse: false (default) → terrain hidden INSIDE the polygon
          });
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
              // Shadow Stack: Multi-layered semi-transparent polylines to create a non-additive 
              // darkening gradient (feathering) between the city tiles and the dark map.
              const positions = Cartesian3.fromDegreesArray(PORTSEA_POLYGON_COORDS.flat());

              const shadowSteps = [
                { width: 120, alpha: 0.08 },
                { width: 90, alpha: 0.12 },
                { width: 60, alpha: 0.18 },
                { width: 30, alpha: 0.25 },
                { width: 10, alpha: 0.35 },
              ];

              shadowSteps.forEach(step => {
                viewer.entities.add({
                  name: `Boundary Shadow ${step.width}`,
                  polyline: {
                    positions: positions,
                    width: step.width,
                    material: Color.fromCssColorString('#0a0b0d').withAlpha(step.alpha),
                    clampToGround: true,
                  }
                });
              });
            }
          });

          // No clipping planes or primitives needed here.

          // Initial setup of SSE and FXAA
          tileset.maximumScreenSpaceError = sse;
          tilesetRef.current = tileset;

          // --- Loading Detection for Splash Screen ---
          let loadingHandled = false;
          const finishLoading = (reason: string) => {
            if (loadingHandled) return;
            loadingHandled = true;
            console.log(`Tileset loading finished. Reason: ${reason}`);
            dispatch(setTilesLoaded(true));
            clearInterval(checkInterval);
            clearTimeout(tilesetTimeout);
            tileset.allTilesLoaded.removeEventListener(onAllTilesLoaded);
          };

          const onAllTilesLoaded = () => finishLoading('allTilesLoaded Event');

          // Poll the boolean property as a backup
          const checkInterval = setInterval(() => {
            if ((tileset as any).tilesLoaded) finishLoading('tilesLoaded Property Check');
          }, 1000);

          // Safety fallback — never block the user forever
          const tilesetTimeout = setTimeout(() => finishLoading('Timeout Fallback (30s)'), 30000);

          tileset.allTilesLoaded.addEventListener(onAllTilesLoaded);
          // --- End Loading Detection ---

          if (viewer.scene.postProcessStages && viewer.scene.postProcessStages.fxaa) {
            viewer.scene.postProcessStages.fxaa.enabled = fxaaEnabled;
          }

          viewer.scene.primitives.add(tileset);
        }).catch(err => {
          console.warn("Could not load Google Photorealistic Tiles:", err);
          dispatch(setTilesLoaded(true));
        });
      }
    }).catch(err => {
      console.warn("Could not load terrain:", err);
      dispatch(setTilesLoaded(true));
    });

    const globalTimeout = setTimeout(() => {
      if (isMounted) dispatch(setTilesLoaded(true));
    }, 35000);

    return () => { isMounted = false; clearTimeout(globalTimeout); };
  }, []);

  const baseLayerId = useAppSelector(state => state.ui.baseLayer);
  const baseMapOption = BASE_MAPS.find(m => m.id === baseLayerId);

  const imageryProvider = useMemo(() => {
    if (baseMapOption?.url) {
      return new UrlTemplateImageryProvider({
        url: baseMapOption.url,
        subdomains: baseMapOption.subdomains,
        credit: baseMapOption.credit,
      });
    }
    return null;
  }, [baseMapOption]);

  return (
    <div
      style={{ width: '100%', height: '100%' }}
      onContextMenu={e => e.preventDefault()}
      onMouseMove={draggingId ? handleDragMove : undefined}
      onMouseUp={draggingId ? handleDragEnd : undefined}
      onMouseLeave={draggingId ? handleDragEnd : undefined}
    >
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
        baseLayer={false}
      >
        <ContextMenuLogic setContextMenu={setContextMenu} billboards={billboards} billboardsRef={billboardsRef} />

        {imageryProvider && (
          <ImageryLayer
            key={baseLayerId}
            imageryProvider={imageryProvider}
          />
        )}

        {/* All entities are managed imperatively via viewer.entities for requestRenderMode compatibility */}
      </Viewer>

      <CityTitleOverlay />

      {activeStory === 'sea-level-rise' && (
        <>
          <SeaLevelChart />
          {/* SimulationControls will no longer control the local state, but we removed it for now or keep it if it triggers Redux instead */}
        </>
      )}

      <SeaLevelMapController viewerRef={viewerRef} baseHeight={baseHeight} waterOpacity={waterOpacity} />

      {activeStory === 'missile-strike' && (
        <>
          <MissileMenu />
          <MissileMapController viewerRef={viewerRef} />
        </>
      )}

      {activeStory === 'drone-flying' && (
        <>
          <DroneHUD
            altRef={droneAltRef}
            spdRef={droneSpdRef}
            hdgRef={droneHdgRef}
            horizonRef={droneHorizonRef}
            ctrlRef={droneCtrlRef}
          />
          <DroneMapController
            viewerRef={viewerRef}
            altRef={droneAltRef}
            spdRef={droneSpdRef}
            hdgRef={droneHdgRef}
            horizonRef={droneHorizonRef}
            ctrlRef={droneCtrlRef}
          />
        </>
      )}

      {activeStory === 'model-design' && (
        <>
          <ModelDesignMenu viewerRef={viewerRef} />
          <ModelDesignMapController viewerRef={viewerRef} />
        </>
      )}

      <BaseMapControls viewerRef={viewerRef} />

      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '260px',
      }}>
        <AdvancedControls
          fps={fps}
          optimizeVisuals={optimizeVisuals} setOptimizeVisuals={setOptimizeVisuals}
          resolutionScale={resolutionScale} setResolutionScale={setResolutionScale}
          sse={sse} setSse={setSse}
          autoSse={autoSse} setAutoSse={(v) => { setAutoSse(v); autoSseRef.current = v; }}
          fxaaEnabled={fxaaEnabled} setFxaaEnabled={setFxaaEnabled}
          waterOpacity={waterOpacity} setWaterOpacity={setWaterOpacity}
          tileCacheSize={tileCacheSize} setTileCacheSize={setTileCacheSize}
          preloadSiblings={preloadSiblings} setPreloadSiblings={setPreloadSiblings}
          foveatedRendering={foveatedRendering} setFoveatedRendering={setFoveatedRendering}
          viewerRef={viewerRef}
        />
        {activeStory === 'drone-flying' && <DroneSettings />}
      </div>

      {/* --- Overlay UI --- */}
      {/* Context Menu */}
      <ContextMenuPopup contextMenu={contextMenu} handleShowDetails={handleShowDetails} />

      {/* Floating Detail Billboards */}
      <BillboardsOverlay
        billboards={billboards}
        setBillboards={setBillboards}
        billboardsRef={billboardsRef}
        onDragStart={handleDragStart}
        onTogglePin={handleTogglePin}
        requestRender={() => {
          const viewer = viewerRef.current?.cesiumElement;
          if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        }}
      />

      <StoriesMenu />
      <BannerOverlay />

      {/* Map Controls Hint */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        left: 24,
        zIndex: 1000,
        background: 'rgba(16, 18, 23, 0.75)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(0, 243, 255, 0.2)',
        borderRadius: '8px',
        padding: '8px 12px',
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
      }}>
        {[
          ['Drag', 'Pan'],
          ['Ctrl + Drag', 'Rotate'],
          ['Scroll', 'Zoom'],
          ['Right Click', 'Context Menu'],
        ].map(([key, action]) => (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '0.65rem',
              color: '#00f3ff',
              background: 'rgba(0, 243, 255, 0.1)',
              border: '1px solid rgba(0, 243, 255, 0.3)',
              borderRadius: '4px',
              padding: '1px 6px',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
            }}>{key}</span>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.05em',
            }}>{action}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CityMap;
