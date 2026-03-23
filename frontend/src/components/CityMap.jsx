import React, { useEffect, useRef } from 'react';
import { Viewer, CameraFlyTo, ImageryLayer } from 'resium';
import { Cartesian3, createOsmBuildingsAsync, Math as CesiumMath, UrlTemplateImageryProvider } from 'cesium';

// Portsmouth coordinates
const PORTSMOUTH_LON = -1.0856;
const PORTSMOUTH_LAT = 50.7990;
const HEIGHT = 1500; // meters

const cartoPositron = new UrlTemplateImageryProvider({
  url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
  credit: 'Map tiles by CartoDB, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
  subdomains: ['a', 'b', 'c', 'd']
});

const CityMap = () => {
  const viewerRef = useRef(null);

  useEffect(() => {
    // Attempt to load 3D OSM buildings
    // Note: This requires a default Cesium Ion token, which is usually included
    // for non-commercial development, but it may display a watermark.
    createOsmBuildingsAsync().then(buildings => {
      const viewer = viewerRef.current?.cesiumElement;
      if (viewer && viewer.scene && !viewer.isDestroyed()) {
        viewer.scene.primitives.add(buildings);
      }
    }).catch(err => console.warn("Could not load OSM buildings:", err));
  }, []);

  return (
    <Viewer 
      full 
      ref={viewerRef}
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
      <ImageryLayer imageryProvider={cartoPositron} />
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
