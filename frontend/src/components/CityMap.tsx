import { useEffect, useRef, useState } from 'react';
import { Viewer, Entity } from 'resium';
import { ContextMenuLogic } from './ContextMenuLogic';
import { AdvancedControls } from './AdvancedControls';
import { ContextMenuPopup } from './ContextMenuPopup';
import { BillboardsOverlay } from './BillboardsOverlay';
import { Cartesian3, createGooglePhotorealistic3DTileset, createWorldTerrainAsync, Math as CesiumMath, ClippingPolygon, ClippingPolygonCollection, ClippingPlane, ClippingPlaneCollection, Ion, ScreenSpaceEventType, SceneTransforms, Cartographic, ScreenSpaceEventHandler, CameraEventType, Color, DistanceDisplayCondition, HeightReference, CustomShader, UniformType, Transforms, PolygonGeometry, GeometryInstance, Primitive, Ellipsoid, Material, MaterialAppearance, buildModuleUrl, EllipsoidSurfaceAppearance, CallbackProperty, GridMaterialProperty, Cartesian2, JulianDate, ColorMaterialProperty, sampleTerrainMostDetailed, PolygonHierarchy, VerticalOrigin, HorizontalOrigin, ConstantProperty, Ray, Plane, IntersectionTests } from 'cesium';
import { PORTSEA_POLYGON_COORDS } from '@/lib/consts';
import { SimulationControls } from './SimulationControls';
import { BaseMapControls } from './BaseMapControls';
import { useAppSelector, useAppDispatch } from '../store';
import { getInterpolatedSeaLevel } from '../lib/seaLevelData';
import { StoriesMenu } from './StoriesMenu';
import { SeaLevelChart } from './SeaLevelChart';
import { MissileMenu } from './stories/MissileMenu';
import { MissileMapController } from './stories/MissileMapController';
import { setTilesLoaded } from '../store/uiSlice';
import BannerOverlay from './BannerOverlay';

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
  const [floodHeight, setFloodHeight] = useState<number>(0);
  const [animatedFloodHeight, setAnimatedFloodHeight] = useState<number>(0);
  const [sse, setSse] = useState<number>(16);
  const [autoSse, setAutoSse] = useState<boolean>(true);
  const autoSseRef = useRef<boolean>(true);
  const [fxaaEnabled, setFxaaEnabled] = useState<boolean>(true);
  const [resolutionScale, setResolutionScale] = useState<number>(0.9);
  const [optimizeVisuals, setOptimizeVisuals] = useState<boolean>(false);
  const [waterOpacity, setWaterOpacity] = useState<number>(0.8);
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const billboardsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());

  // -- Redux Story State --
  const activeStory = useAppSelector(state => state.story.activeStory);
  const selectedYear = useAppSelector(state => state.story.selectedYear);

  useEffect(() => {
    if (activeStory === 'sea-level-rise') {
      const currentLevel = getInterpolatedSeaLevel(selectedYear);
      // Data historically starts around 6.952m at Portsmouth. 
      // Calculate realistic meters of rise above the base year.
      const riseMeters = Math.max(0, currentLevel - 6.952 + 1.1);
      // If we need visual exaggeration, we can multiply the delta. But let's stick to true scale first.
      setFloodHeight(parseFloat(riseMeters.toFixed(2)));
    }
  }, [selectedYear, activeStory]);

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
        viewer.scene.globe.depthTestAgainstTerrain = true;

        // Remove Cesium's auto-added default imagery (Bing satellite via Ion).
        // BaseMapControls manages all imagery layers imperatively.
        viewer.imageryLayers.removeAll();

        // Default dark base colour — no imagery, no z-fighting with photorealistic tiles.
        viewer.scene.globe.baseColor = Color.fromCssColorString('#101217');

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

          // --- Loading Detection for Splash Screen ---
          let loadingHandled = false;
          const finishLoading = (reason: string) => {
            if (loadingHandled) return;
            loadingHandled = true;
            console.log(`Tileset loading finished. Reason: ${reason}`);
            dispatch(setTilesLoaded(true));
            clearInterval(checkInterval);
            clearTimeout(tilesetTimeout);
            tileset.initialTilesLoaded.removeEventListener(finishLoading);
          };
          const checkInterval = setInterval(() => {
            if (tileset.allTilesLoaded || (tileset as any).ready) finishLoading('Property Check');
          }, 500);
          const tilesetTimeout = setTimeout(() => finishLoading('Timeout Fallback'), 10000);
          tileset.initialTilesLoaded.addEventListener(finishLoading);
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
    }, 15000);

    return () => { isMounted = false; clearTimeout(globalTimeout); };
  }, []);

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
      >
        <ContextMenuLogic setContextMenu={setContextMenu} billboards={billboards} billboardsRef={billboardsRef} />

        {/* Imagery layer removed; globe.baseColor provides the dark background */}

        {/* All entities are managed imperatively via viewer.entities for requestRenderMode compatibility */}
      </Viewer>

      {activeStory === 'sea-level-rise' && (
        <>
          <SeaLevelChart />
          <SimulationControls floodHeight={floodHeight} setFloodHeight={setFloodHeight} />
        </>
      )}

      {activeStory === 'missile-strike' && (
        <>
          <MissileMenu />
          <MissileMapController viewerRef={viewerRef} />
        </>
      )}

      <BaseMapControls viewerRef={viewerRef} />

      <AdvancedControls
        fps={fps}
        optimizeVisuals={optimizeVisuals} setOptimizeVisuals={setOptimizeVisuals}
        resolutionScale={resolutionScale} setResolutionScale={setResolutionScale}
        sse={sse} setSse={setSse}
        autoSse={autoSse} setAutoSse={(v) => { setAutoSse(v); autoSseRef.current = v; }}
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
        onDragStart={handleDragStart}
        onTogglePin={handleTogglePin}
        requestRender={() => {
          const viewer = viewerRef.current?.cesiumElement;
          if (viewer && !viewer.isDestroyed()) viewer.scene.requestRender();
        }}
      />

      <StoriesMenu />
      <BannerOverlay />
    </div>
  );
};

export default CityMap;
