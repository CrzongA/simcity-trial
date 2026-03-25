import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface StoryState {
  activeStory: string | null;
  selectedYear: number;
  manualSeaLevelRise: number | null; // null = year-based, number = direct rise override in metres
}

const initialState: StoryState = {
  activeStory: null,
  selectedYear: 2024,
  manualSeaLevelRise: null,
};

export const storySlice = createSlice({
  name: 'story',
  initialState,
  reducers: {
    setActiveStory: (state, action: PayloadAction<string | null>) => {
      state.activeStory = action.payload;
      if (action.payload !== 'sea-level-rise') {
        state.manualSeaLevelRise = null;
      }
    },
    setSelectedYear: (state, action: PayloadAction<number>) => {
      state.selectedYear = action.payload;
    },
    setManualSeaLevelRise: (state, action: PayloadAction<number | null>) => {
      state.manualSeaLevelRise = action.payload;
    },
  },
});

export const { setActiveStory, setSelectedYear, setManualSeaLevelRise } = storySlice.actions;
export default storySlice.reducer;
