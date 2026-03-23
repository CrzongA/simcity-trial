import React, { useEffect, useRef, useState } from 'react';
import { Viewer, CameraFlyTo, ImageryLayer } from 'resium';
import { Cartesian3, createGooglePhotorealistic3DTileset, createWorldTerrainAsync, Math as CesiumMath, UrlTemplateImageryProvider, ClippingPolygon, ClippingPolygonCollection, Ion } from 'cesium';

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

  useEffect(() => {
    let isMounted = true;

    // Load Cesium World Terrain so buildings don't float or Z-fight
    createWorldTerrainAsync().then(terrain => {
      if (!isMounted) return;

      setTerrainProvider(terrain);
      const viewer = viewerRef.current?.cesiumElement;

      if (viewer && viewer.scene && !viewer.isDestroyed()) {
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

          viewer.scene.primitives.add(tileset);
        }).catch(err => console.warn("Could not load Google Photorealistic Tiles:", err));
      }
    }).catch(err => console.warn("Could not load terrain:", err));

    return () => { isMounted = false; };
  }, []);

  return (
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
      <CameraFlyTo
        destination={Cartesian3.fromDegrees(PORTSMOUTH_LON, PORTSMOUTH_LAT, HEIGHT)}
        orientation={{
          heading: CesiumMath.toRadians(0.0), // North
          pitch: CesiumMath.toRadians(-45.0), // Looking down at an angle
          roll: 0.0
        }}
        duration={0} // Instantly go there on load
      />
    </Viewer>
  );
};

export default CityMap;
