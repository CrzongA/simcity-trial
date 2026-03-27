/**
 * Geographic utilities: point-in-polygon (ray casting) and Portsea Island boundary.
 *
 * The polygon is loaded at startup from data/portsmouth_geojson.json at the
 * monorepo root, so both backend and frontend share a single source of truth.
 */

import * as fs from 'fs';
import * as path from 'path';

/** [lng, lat] tuple — GeoJSON coordinate order */
export type LngLat = [number, number];

// ---------------------------------------------------------------------------
// Load GeoJSON from monorepo root data directory
// ---------------------------------------------------------------------------

interface MultiPolygonGeoJSON {
  type: 'MultiPolygon';
  /** [polygon][ring][point] = [lng, lat] */
  coordinates: number[][][][];
}

const geojsonPath = path.resolve(__dirname, '../../../data/portsmouth_geojson.json');
const portsmouthGeoJSON: MultiPolygonGeoJSON = JSON.parse(
  fs.readFileSync(geojsonPath, 'utf-8'),
);

console.log(
  `[geo] Loaded portsmouth_geojson.json — ${portsmouthGeoJSON.coordinates.length} polygon(s), ` +
  `largest outer ring: ${portsmouthGeoJSON.coordinates.reduce((n, p) => Math.max(n, p[0].length), 0)} vertices`,
);

// ---------------------------------------------------------------------------
// Derived polygon data
// ---------------------------------------------------------------------------

/**
 * Outer ring of the largest polygon (main Portsea Island).
 * Used for single-polygon operations (legacy / BBOX queries).
 */
export const PORTSEA_POLYGON: LngLat[] = portsmouthGeoJSON.coordinates
  .reduce((largest, current) => current[0].length > largest[0].length ? current : largest)
  [0] as LngLat[];

/**
 * Outer ring of every polygon in the MultiPolygon.
 * Used when checking membership across all Portsmouth islands.
 */
const PORTSEA_RINGS: LngLat[][] = portsmouthGeoJSON.coordinates.map(
  polygon => polygon[0] as LngLat[],
);

/**
 * Bounding box for API queries — SW and NE corners.
 */
export const PORTSEA_BBOX = {
  sw: { lat: 50.776, lng: -1.115 },
  ne: { lat: 50.838, lng: -1.026 },
} as const;

// ---------------------------------------------------------------------------
// Algorithms
// ---------------------------------------------------------------------------

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
 * Returns true if the given lat/lng lies within any polygon of the
 * Portsmouth MultiPolygon boundary (covers all islands in the dataset).
 */
export function isWithinPortseaIsland(lat: number, lng: number): boolean {
  return PORTSEA_RINGS.some(ring => pointInPolygon(lng, lat, ring));
}
