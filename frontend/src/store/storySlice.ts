import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface StoryState {
  activeStory: string | null;
}

const initialState: StoryState = {
  activeStory: null,
};

export const storySlice = createSlice({
  name: 'story',
  initialState,
  reducers: {
    setActiveStory: (state, action: PayloadAction<string | null>) => {
      state.activeStory = action.payload;
    },
  },
});

export const { setActiveStory } = storySlice.actions;
export default storySlice.reducer;
