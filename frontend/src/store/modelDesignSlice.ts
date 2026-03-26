import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface PlacedModel {
  id: string;
  name: string;
  uri: string;     // blob URL from URL.createObjectURL()
  lng: number;     // degrees
  lat: number;     // degrees
  height: number;  // meters above ellipsoid
  heading: number; // degrees (0 = North)
  pitch: number;   // degrees
  roll: number;    // degrees
  scale: number;   // uniform scale factor
  visible: boolean;
}

export type TransformMode = 'translate' | 'rotate' | 'scale';

interface ModelDesignState {
  models: PlacedModel[];
  selectedModelId: string | null;
  transformMode: TransformMode;
}

const initialState: ModelDesignState = {
  models: [],
  selectedModelId: null,
  transformMode: 'translate',
};

const modelDesignSlice = createSlice({
  name: 'modelDesign',
  initialState,
  reducers: {
    addModel: (state, action: PayloadAction<PlacedModel>) => {
      state.models.push(action.payload);
      state.selectedModelId = action.payload.id;
    },
    removeModel: (state, action: PayloadAction<string>) => {
      state.models = state.models.filter(m => m.id !== action.payload);
      if (state.selectedModelId === action.payload) {
        state.selectedModelId = state.models.length > 0
          ? state.models[state.models.length - 1].id
          : null;
      }
    },
    selectModel: (state, action: PayloadAction<string | null>) => {
      state.selectedModelId = action.payload;
    },
    updateModelTransform: (
      state,
      action: PayloadAction<
        { id: string } &
        Partial<Pick<PlacedModel, 'lng' | 'lat' | 'height' | 'heading' | 'pitch' | 'roll' | 'scale'>>
      >
    ) => {
      const model = state.models.find(m => m.id === action.payload.id);
      if (!model) return;
      const { id, ...updates } = action.payload;
      Object.assign(model, updates);
    },
    toggleModelVisibility: (state, action: PayloadAction<string>) => {
      const model = state.models.find(m => m.id === action.payload);
      if (model) model.visible = !model.visible;
    },
    setTransformMode: (state, action: PayloadAction<TransformMode>) => {
      state.transformMode = action.payload;
    },
  },
});

export const {
  addModel,
  removeModel,
  selectModel,
  updateModelTransform,
  toggleModelVisibility,
  setTransformMode,
} = modelDesignSlice.actions;

export default modelDesignSlice.reducer;
