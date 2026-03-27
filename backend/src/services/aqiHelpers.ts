/**
 * AQI category and colour helpers shared between all API clients.
 *
 * Standard US AQI breakpoints per EPA:
 *   0–50      Good
 *   51–100    Moderate
 *   101–150   Unhealthy for Sensitive Groups
 *   151–200   Unhealthy
 *   201–300   Very Unhealthy
 *   301+      Hazardous
 */

export interface AqiLevel {
  category: string;
  color: string;
  min: number;
  max: number;
}

export const AQI_LEVELS: AqiLevel[] = [
  { category: 'Good',                              color: '#00e400', min: 0,   max: 50  },
  { category: 'Moderate',                          color: '#ffff00', min: 51,  max: 100 },
  { category: 'Unhealthy for Sensitive Groups',    color: '#ff7e00', min: 101, max: 150 },
  { category: 'Unhealthy',                         color: '#ff0000', min: 151, max: 200 },
  { category: 'Very Unhealthy',                    color: '#8f3f97', min: 201, max: 300 },
  { category: 'Hazardous',                         color: '#7e0023', min: 301, max: Infinity },
];

/**
 * Maps a numeric AQI value to its EPA category string.
 * Returns "Unknown" for null or negative inputs.
 */
export function getAqiCategory(aqi: number | null): string {
  if (aqi === null || aqi < 0) return 'Unknown';
  const level = AQI_LEVELS.find((l) => aqi >= l.min && aqi <= l.max);
  return level?.category ?? 'Unknown';
}

/**
 * Maps a numeric AQI value to its associated hex colour string.
 * Returns '#cccccc' for null or negative inputs.
 */
export function getAqiColor(aqi: number | null): string {
  if (aqi === null || aqi < 0) return '#cccccc';
  const level = AQI_LEVELS.find((l) => aqi >= l.min && aqi <= l.max);
  return level?.color ?? '#cccccc';
}
