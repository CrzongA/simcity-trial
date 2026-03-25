import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface StoryState {
  activeStory: string | null;
  selectedYear: number;
}

const initialState: StoryState = {
  activeStory: null,
  selectedYear: 2024,
};

export const storySlice = createSlice({
  name: 'story',
  initialState,
  reducers: {
    setActiveStory: (state, action: PayloadAction<string | null>) => {
      state.activeStory = action.payload;
    },
    setSelectedYear: (state, action: PayloadAction<number>) => {
      state.selectedYear = action.payload;
    },
  },
});

export const { setActiveStory, setSelectedYear } = storySlice.actions;
export default storySlice.reducer;
