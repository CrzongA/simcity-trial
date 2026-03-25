import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface SeaLevelState {
  selectedYear: number;
  manualSeaLevelRise: number | null; // null = year-based, number = direct rise override in metres
}

const initialState: SeaLevelState = {
  selectedYear: 2024,
  manualSeaLevelRise: null,
};

export const seaLevelSlice = createSlice({
  name: 'seaLevel',
  initialState,
  reducers: {
    setSelectedYear: (state, action: PayloadAction<number>) => {
      state.selectedYear = action.payload;
    },
    setManualSeaLevelRise: (state, action: PayloadAction<number | null>) => {
      state.manualSeaLevelRise = action.payload;
    },
  },
});

export const { setSelectedYear, setManualSeaLevelRise } = seaLevelSlice.actions;
export default seaLevelSlice.reducer;
