import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export const PREDEFINED_TAGS = [
  { id: 'community-activity', label: 'Community Activity', emoji: '🧑‍🤝‍🧑' },
  { id: 'fly-tip', label: 'Fly-tip', emoji: '🗑️' },
  { id: 'news', label: 'News', emoji: '📰' },
];

export interface CommunityReport {
  id: string;
  lat: number;
  lng: number;
  height: number;
  cartesian: { x: number; y: number; z: number };
  description: string;
  tags: string[];
  image: string | null;
  createdAt: string;
}

interface CommunityReportState {
  reports: CommunityReport[];
  selectedReportId: string | null;
  isFormOpen: boolean;
  formLocation: { lat: number; lng: number; height: number; cartesian: { x: number; y: number; z: number } } | null;
}

const initialState: CommunityReportState = {
  reports: [],
  selectedReportId: null,
  isFormOpen: false,
  formLocation: null,
};

export const communityReportSlice = createSlice({
  name: 'communityReport',
  initialState,
  reducers: {
    setReports: (state, action: PayloadAction<CommunityReport[]>) => {
      state.reports = action.payload;
    },
    addReport: (state, action: PayloadAction<CommunityReport>) => {
      state.reports.push(action.payload);
    },
    setSelectedReportId: (state, action: PayloadAction<string | null>) => {
      state.selectedReportId = action.payload;
    },
    openForm: (state, action: PayloadAction<{ lat: number; lng: number; height: number; cartesian: { x: number; y: number; z: number } }>) => {
      state.isFormOpen = true;
      state.formLocation = action.payload;
    },
    closeForm: (state) => {
      state.isFormOpen = false;
      state.formLocation = null;
    },
  },
});

export const { setReports, addReport, setSelectedReportId, openForm, closeForm } = communityReportSlice.actions;
export default communityReportSlice.reducer;
