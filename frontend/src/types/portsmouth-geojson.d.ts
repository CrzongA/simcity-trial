// Ambient declaration for the large Portsmouth MultiPolygon GeoJSON.
// Without this, TypeScript infers every coordinate as a literal type,
// creating a multi-megabyte internal type that slows the language server.
declare module '*/portsmouth_geojson.json' {
  interface PortsmouthMultiPolygon {
    type: 'MultiPolygon';
    /** [polygon][ring][point] — each point is [lng, lat] (GeoJSON order) */
    coordinates: number[][][][];
  }
  const value: PortsmouthMultiPolygon;
  export default value;
}
