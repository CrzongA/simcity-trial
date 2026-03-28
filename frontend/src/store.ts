import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import storyReducer from './store/storySlice';
import seaLevelReducer from './store/seaLevelSlice';
import missileStrikeReducer from './store/missileStrikeSlice';
import uiReducer from './store/uiSlice';
import droneReducer from './store/droneSlice';
import modelDesignReducer from './store/modelDesignSlice';
import airQualityReducer from './store/airQualitySlice';
import shipTrackingReducer from './store/shipTrackingSlice';

export const store = configureStore({
  reducer: {
    story: storyReducer,
    seaLevel: seaLevelReducer,
    missileStrike: missileStrikeReducer,
    ui: uiReducer,
    drone: droneReducer,
    modelDesign: modelDesignReducer,
    airQuality: airQualityReducer,
    shipTracking: shipTrackingReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
