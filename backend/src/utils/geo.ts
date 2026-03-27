/**
 * Geographic utilities: point-in-polygon (ray casting) and Portsea Island boundary.
 */

/** [lng, lat] tuple — GeoJSON coordinate order */
export type LngLat = [number, number];

/**
 * Portsea Island polygon vertices in [lng, lat] order.
 * Closing vertex equals opening vertex.
 */
export const PORTSEA_POLYGON: LngLat[] = [
  [-1.0427596626152251, 50.830958237034054],
  [-1.0604743796138791, 50.83584374006128],
  [-1.0776044133194205, 50.837192014143255],
  [-1.0875733159936942, 50.827411088478044],
  [-1.0929942237834496, 50.829673878802794],
  [-1.101024659954561,  50.82728764891729],
  [-1.0986043596175534, 50.82092912675901],
  [-1.1040285083727213, 50.81243061496508],
  [-1.1078999988087617, 50.8077212014195],
  [-1.1127339276309556, 50.807476668237314],
  [-1.1122566693125293, 50.79811717595592],
  [-1.109653123524879,  50.79013353733296],
  [-1.1022996381986445, 50.785291871069774],
  [-1.091646333565933,  50.77778524559278],
  [-1.0864481981128051, 50.77660843328354],
  [-1.07541055672948,   50.77717665266604],
  [-1.0268733632743476, 50.7866545480594],
  [-1.0285613163973721, 50.79584699688698],
  [-1.0427596626152251, 50.830958237034054],
];

/**
 * Bounding box for API queries — SW and NE corners.
 */
export const PORTSEA_BBOX = {
  sw: { lat: 50.776, lng: -1.115 },
  ne: { lat: 50.838, lng: -1.026 },
} as const;

/**
 * Ray-casting point-in-polygon test.
 *
 * @param lng  Longitude of the test point
 * @param lat  Latitude of the test point
 * @param polygon  Array of [lng, lat] vertices (first === last is fine)
 * @returns true if the point is inside the polygon
 */
export function pointInPolygon(
  lng: number,
  lat: number,
  polygon: LngLat[],
): boolean {
  let inside = false;
  const n = polygon.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

/**
 * Returns true if the given lat/lng lies within the Portsea Island polygon.
 */
export function isWithinPortseaIsland(lat: number, lng: number): boolean {
  return pointInPolygon(lng, lat, PORTSEA_POLYGON);
}
