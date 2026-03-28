import portsmouthGeoJSON from '../../../data/portsmouth_geojson.json';

// ---------------------------------------------------------------------------
// Polygon decimation
// ---------------------------------------------------------------------------

/**
 * Uniformly samples a closed polygon ring down to at most `maxVertices` points
 * while always preserving the closing vertex so the ring stays closed.
 * For Cesium rendering, 80–120 vertices gives accurate boundaries with no
 * perceptible GPU overhead. Thousands of raw GeoJSON vertices cause serious
 * frame-rate degradation in ClippingPolygon and polyline entities.
 */
function decimateRing(ring: number[][], maxVertices: number): [number, number][] {
  if (ring.length <= maxVertices) return ring as [number, number][];
  const step = (ring.length - 1) / (maxVertices - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < maxVertices - 1; i++) {
    out.push(ring[Math.round(i * step)] as [number, number]);
  }
  out.push(ring[ring.length - 1] as [number, number]); // preserve closing vertex
  return out;
}

const MAX_RING_VERTICES = 50;

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Decimated outer ring of each polygon in Portsmouth's MultiPolygon boundary.
 * Used to build ClippingPolygonCollection entries in CityMap.
 * Coordinates are [lng, lat] — GeoJSON / Cesium fromDegreesArray order.
 */
export const PORTSEA_ALL_RINGS: [number, number][][] =
  portsmouthGeoJSON.coordinates.map(
    polygon => decimateRing(polygon[0], MAX_RING_VERTICES),
  );

/**
 * Decimated outer ring of the largest polygon (main Portsea Island).
 * Used for single-polygon consumers: sea level water entity, shadow polylines.
 */
export const PORTSEA_POLYGON_COORDS: [number, number][] = decimateRing(
  portsmouthGeoJSON.coordinates.reduce(
    (largest, current) => current[0].length > largest[0].length ? current : largest,
  )[0],
  MAX_RING_VERTICES,
);
