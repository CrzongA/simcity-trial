import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AirQualityStation {
  id: string;
  source: 'aqicn' | 'iqair';
  name: string;
  lat: number;
  lng: number;
  aqi: number | null;
  aqiCategory: string;
  aqiColor: string;
  dominantPollutant: string | null;
  pollutants: {
    pm25: number | null;
    pm10: number | null;
    no2: number | null;
    o3: number | null;
    co: number | null;
    so2: number | null;
  };
  temperature: number | null;
  humidity: number | null;
  wind: { speed: number; direction: number } | null;
  updatedAt: string | null;
  isStale: boolean;
}

export type RefreshInterval = 5 | 15 | 30;
export type ActivePollutant = 'aqi' | 'pm25' | 'pm10' | 'no2' | 'o3';

interface AirQualityState {
  stations: AirQualityStation[];
  lastFetchedAt: string | null;
  loading: boolean;
  error: string | null;
  refreshInterval: RefreshInterval;
  activePollutant: ActivePollutant;
  showHeatmap: boolean;
  showBillboards: boolean;
}

const initialState: AirQualityState = {
  stations: [],
  lastFetchedAt: null,
  loading: false,
  error: null,
  refreshInterval: 15,
  activePollutant: 'aqi',
  showHeatmap: true,
  showBillboards: true,
};

export const airQualitySlice = createSlice({
  name: 'airQuality',
  initialState,
  reducers: {
    setStations: (state, action: PayloadAction<AirQualityStation[]>) => {
      state.stations = action.payload;
    },
    setLastFetchedAt: (state, action: PayloadAction<string>) => {
      state.lastFetchedAt = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setRefreshInterval: (state, action: PayloadAction<RefreshInterval>) => {
      state.refreshInterval = action.payload;
    },
    setActivePollutant: (state, action: PayloadAction<ActivePollutant>) => {
      state.activePollutant = action.payload;
    },
    setShowHeatmap: (state, action: PayloadAction<boolean>) => {
      state.showHeatmap = action.payload;
    },
    setShowBillboards: (state, action: PayloadAction<boolean>) => {
      state.showBillboards = action.payload;
    },
  },
});

export const {
  setStations,
  setLastFetchedAt,
  setLoading,
  setError,
  setRefreshInterval,
  setActivePollutant,
  setShowHeatmap,
  setShowBillboards,
} = airQualitySlice.actions;

export default airQualitySlice.reducer;
