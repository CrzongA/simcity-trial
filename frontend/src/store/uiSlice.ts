import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  isTilesLoaded: boolean;
  isAppStarted: boolean;
  baseLayer: string;
  currentCity: string;
  showCityInfo: boolean;
}

const initialState: UiState = {
  isTilesLoaded: false,
  isAppStarted: false,
  baseLayer: 'carto-dark',
  currentCity: 'Portsmouth, UK',
  showCityInfo: true,
};

export const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setTilesLoaded: (state, action: PayloadAction<boolean>) => {
      state.isTilesLoaded = action.payload;
    },
    setAppStarted: (state, action: PayloadAction<boolean>) => {
      state.isAppStarted = action.payload;
    },
    setBaseLayer: (state, action: PayloadAction<string>) => {
      state.baseLayer = action.payload;
    },
    setCurrentCity: (state, action: PayloadAction<string>) => {
      state.currentCity = action.payload;
    },
    setShowCityInfo: (state, action: PayloadAction<boolean>) => {
      state.showCityInfo = action.payload;
    },
  },
});

export const { setTilesLoaded, setAppStarted, setBaseLayer, setCurrentCity, setShowCityInfo } = uiSlice.actions;
export default uiSlice.reducer;
