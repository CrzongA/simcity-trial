import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type VesselCategory =
  | 'fishing'
  | 'military'
  | 'sailing'
  | 'pleasure'
  | 'passenger'
  | 'cargo'
  | 'tanker'
  | 'other';

export const VESSEL_TYPE_COLORS: Record<VesselCategory, string> = {
  fishing:   '#22c55e',
  military:  '#ef4444',
  sailing:   '#f59e0b',
  pleasure:  '#06b6d4',
  passenger: '#a855f7',
  cargo:     '#4a9eff',
  tanker:    '#ff6b35',
  other:     '#94a3b8',
};

export const VESSEL_CATEGORY_LABELS: Record<VesselCategory, string> = {
  fishing:   'Fishing',
  military:  'Military',
  sailing:   'Sailing',
  pleasure:  'Pleasure',
  passenger: 'Passenger',
  cargo:     'Cargo',
  tanker:    'Tanker',
  other:     'Other',
};

export const ALL_VESSEL_CATEGORIES: VesselCategory[] = [
  'cargo', 'tanker', 'passenger', 'fishing', 'military', 'sailing', 'pleasure', 'other',
];

export interface Vessel {
  mmsi: string;
  imo: string | null;
  name: string;
  lat: number;
  lon: number;
  course: number | null;
  speed: number | null;
  vtypeCode: number | null;
  vesselType: VesselCategory;
  vesselTypeLabel: string | null;
  navStatus: number | null;
  receivedAt: string | null;
  isStale: boolean;
}

export type RefreshInterval = 30 | 60 | 120;

interface ShipTrackingState {
  vessels: Vessel[];
  lastFetchedAt: string | null;
  loading: boolean;
  error: string | null;
  autoRefresh: boolean;
  refreshInterval: RefreshInterval;
  selectedMmsi: string | null;
  showTrails: boolean;
  hiddenTypes: VesselCategory[]; // types to hide; empty = show all
}

const initialState: ShipTrackingState = {
  vessels: [],
  lastFetchedAt: null,
  loading: false,
  error: null,
  autoRefresh: false,
  refreshInterval: 60,
  selectedMmsi: null,
  showTrails: true,
  hiddenTypes: [],
};

export const shipTrackingSlice = createSlice({
  name: 'shipTracking',
  initialState,
  reducers: {
    setVessels: (state, action: PayloadAction<Vessel[]>) => {
      state.vessels = action.payload;
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
    setAutoRefresh: (state, action: PayloadAction<boolean>) => {
      state.autoRefresh = action.payload;
    },
    setRefreshInterval: (state, action: PayloadAction<RefreshInterval>) => {
      state.refreshInterval = action.payload;
    },
    setSelectedMmsi: (state, action: PayloadAction<string | null>) => {
      state.selectedMmsi = action.payload;
    },
    setShowTrails: (state, action: PayloadAction<boolean>) => {
      state.showTrails = action.payload;
    },
    toggleHiddenType: (state, action: PayloadAction<VesselCategory>) => {
      const type = action.payload;
      if (state.hiddenTypes.includes(type)) {
        state.hiddenTypes = state.hiddenTypes.filter(t => t !== type);
      } else {
        state.hiddenTypes.push(type);
      }
    },
    clearHiddenTypes: (state) => {
      state.hiddenTypes = [];
    },
  },
});

export const {
  setVessels,
  setLastFetchedAt,
  setLoading,
  setError,
  setAutoRefresh,
  setRefreshInterval,
  setSelectedMmsi,
  setShowTrails,
  toggleHiddenType,
  clearHiddenTypes,
} = shipTrackingSlice.actions;

export default shipTrackingSlice.reducer;
