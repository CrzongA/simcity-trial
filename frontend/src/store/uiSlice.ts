import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  isTilesLoaded: boolean;
  isAppStarted: boolean;
  baseLayer: string;
}

const initialState: UiState = {
  isTilesLoaded: false,
  isAppStarted: false,
  baseLayer: 'carto-dark',
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
  },
});

export const { setTilesLoaded, setAppStarted, setBaseLayer } = uiSlice.actions;
export default uiSlice.reducer;
