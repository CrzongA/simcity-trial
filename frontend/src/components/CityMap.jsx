import React, { useEffect, useRef, useState } from 'react';
import { Viewer, ImageryLayer } from 'resium';
import { Cartesian3, createGooglePhotorealistic3DTileset, createWorldTerrainAsync, Math as CesiumMath, UrlTemplateImageryProvider, ClippingPolygon, ClippingPolygonCollection, ClippingPlane, ClippingPlaneCollection, Ion } from 'cesium';

// Set Ion token securely from environment variables
if (import.meta.env.VITE_CESIUM_ION_TOKEN) {
  Ion.defaultAccessToken = import.meta.env.VITE_CESIUM_ION_TOKEN;
}

// Portsmouth coordinates
const PORTSMOUTH_LON = -1.0856;
const PORTSMOUTH_LAT = 50.7990;
const HEIGHT = 1500; // meters

// Expanded polygon roughly tracing Portsea Island and extending slightly into the sea/harbours
const PORTSEA_POLYGON_COORDS = [[-1.0388033354462038, 50.831544279806934], [-1.0626290908832345, 50.83630633293342], [-1.0786037402600641, 50.83724182872129], [-1.086002321696668, 50.83088680945394], [-1.0997583969784728, 50.830327817581576], [-1.116919231414073, 50.808738524885655], [-1.1111497856590518, 50.79031743885528], [-1.091176773988451, 50.77160771940291], [-1.0237147133547637, 50.78451886460368], [-1.0388033354462038, 50.831544279806934]]

const cartoDarkMatter = new UrlTemplateImageryProvider({
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
  credit: 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
  subdomains: ['a', 'b', 'c', 'd']
});

const CityMap = () => {
  const viewerRef = useRef(null);
  const [terrainProvider, setTerrainProvider] = useState(null);
  const [minHeight, setMinHeight] = useState(0); // Set default to 0 so the map isn't completely black on load!
  const clippingPlaneRef = useRef(null);
  const earthRadiusRef = useRef(0);

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
        background: 'rgba(25, 25, 25, 0.85)',
        color: '#fff',
        padding: '16px',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '240px',
        fontFamily: 'sans-serif'
      }}>
        <label style={{ fontSize: '14px', fontWeight: 'bold' }}>
          Minimum Height: {minHeight}m
        </label>
        <input
          type="range"
          min="-50"
          max="200"
          step="1"
          value={minHeight}
          onChange={(e) => setMinHeight(Number(e.target.value))}
          style={{ width: '100%', cursor: 'pointer' }}
        />
        <div style={{ fontSize: '12px', color: '#ccc' }}>
          Hides 3D map tiles below this height.
        </div>
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
