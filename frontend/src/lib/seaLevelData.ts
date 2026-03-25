import rawCsv from '../../data/sea-level-1965-2300.csv?raw';

export interface SeaLevelDataPoint {
  year: number;
  val: number;
  isHistorical: boolean;
}

let cachedData: SeaLevelDataPoint[] | null = null;

export const parseSeaLevelData = (): SeaLevelDataPoint[] => {
  if (cachedData) return cachedData;

  const lines = rawCsv.trim().split('\n').slice(1);
  const data: SeaLevelDataPoint[] = [];

  for (const line of lines) {
    const cols = line.split(',');
    if (cols.length < 5) continue;
    const year = parseInt(cols[0], 10);
    if (isNaN(year)) continue;

    const historicalStr = cols[1];
    const rcp85Str = cols[4];

    if (historicalStr && historicalStr.trim() !== '') {
      data.push({
        year,
        val: parseFloat(historicalStr),
        isHistorical: true
      });
    } else if (rcp85Str && rcp85Str.trim() !== '') {
      data.push({
        year,
        val: parseFloat(rcp85Str),
        isHistorical: false
      });
    }
  }

  // Ensure sorting
  data.sort((a, b) => a.year - b.year);
  cachedData = data;
  return data;
};

export const getInterpolatedSeaLevel = (year: number): number => {
  const data = parseSeaLevelData();
  if (data.length === 0) return 0;
  if (year <= data[0].year) return data[0].val;
  if (year >= data[data.length - 1].year) return data[data.length - 1].val;

  // Linear search interpolation
  for (let i = 0; i < data.length - 1; i++) {
    const curr = data[i];
    const next = data[i + 1];
    if (year >= curr.year && year <= next.year) {
      if (curr.year === next.year) return curr.val;
      const ratio = (year - curr.year) / (next.year - curr.year);
      return curr.val + ratio * (next.val - curr.val);
    }
  }
  return 0;
};
