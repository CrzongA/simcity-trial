import { configureStore } from '@reduxjs/toolkit';

interface TimelineState {
  currentYear: number;
}
interface TimelineAction {
  type: string;
  payload?: number;
}

// Placeholder for a timeline slice
const timelineReducer = (state: TimelineState = { currentYear: 2024 }, action: TimelineAction) => {
  switch (action.type) {
    case 'SET_YEAR':
      return { ...state, currentYear: action.payload as number };
    default:
      return state;
  }
};

export const store = configureStore({
  reducer: {
    timeline: timelineReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
