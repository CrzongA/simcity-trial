import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UiState {
  isTilesLoaded: boolean;
  isAppStarted: boolean;
}

const initialState: UiState = {
  isTilesLoaded: false,
  isAppStarted: false,
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
  },
});

export const { setTilesLoaded, setAppStarted } = uiSlice.actions;
export default uiSlice.reducer;
