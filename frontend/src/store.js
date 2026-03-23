import { configureStore } from '@reduxjs/toolkit';

// Placeholder for a timeline slice
const timelineReducer = (state = { currentYear: 2024 }, action) => {
  switch (action.type) {
    case 'SET_YEAR':
      return { ...state, currentYear: action.payload };
    default:
      return state;
  }
};

export const store = configureStore({
  reducer: {
    timeline: timelineReducer,
  },
});
