import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface AxisCalibration {
  low: number;
  mid: number;
  high: number;
  inverted: boolean;
}

const defaultCalibration: AxisCalibration = { low: -1, mid: 0, high: 1, inverted: false };

interface DroneState {
  gamepadIndex: number | null;
  axisMapping: {
    throttle: number;
    yaw: number;
    pitch: number;
    roll: number;
  };
  buttonMapping: {
    flightModeToggle: number;
    speedTierUp: number;
    speedTierDown: number;
  };
  calibration: {
    throttle: AxisCalibration;
    yaw: AxisCalibration;
    pitch: AxisCalibration;
    roll: AxisCalibration;
  };
  deadzone: number;
  sensitivity: number;
  fov: number;          // degrees
  mass: number;           // kg — affects transient response (time to reach terminal v)
  acroThrust: number;     // m/s² total motor thrust (hover = acroThrust/2 = gravity)
  acroDrag: number;       // 1/s exponential air-resistance coefficient
  acroCameraTilt: number; // degrees — camera pitch offset from drone body (FPV tilt)
  flightMode: 'angle' | 'acro';
  speedTier: 'slow' | 'normal' | 'sport';
}

const initialState: DroneState = {
  gamepadIndex: null,
  // Mode 2: left stick = throttle(Y=1) + yaw(X=0), right stick = pitch(Y=3) + roll(X=2)
  axisMapping: { throttle: 1, yaw: 0, pitch: 3, roll: 2 },
  buttonMapping: { flightModeToggle: 0, speedTierUp: 5, speedTierDown: 4 },
  calibration: {
    throttle: { ...defaultCalibration },
    yaw: { ...defaultCalibration },
    pitch: { ...defaultCalibration },
    roll: { ...defaultCalibration },
  },
  deadzone: 0.08,
  sensitivity: 1.0,
  fov: 90,
  mass: 1.0,
  acroThrust: 58.86,   // 6g TWR — hover at stick centre, 5g net climb at full throttle
  acroDrag: 0.3,       // ~70 m/s terminal at 45° tilt (~250 km/h)
  acroCameraTilt: 20,
  flightMode: 'angle',
  speedTier: 'normal',
};

const droneSlice = createSlice({
  name: 'drone',
  initialState,
  reducers: {
    setGamepadIndex: (state, action: PayloadAction<number | null>) => {
      state.gamepadIndex = action.payload;
    },
    setAxisMapping: (state, action: PayloadAction<Partial<DroneState['axisMapping']>>) => {
      state.axisMapping = { ...state.axisMapping, ...action.payload };
    },
    setButtonMapping: (state, action: PayloadAction<Partial<DroneState['buttonMapping']>>) => {
      state.buttonMapping = { ...state.buttonMapping, ...action.payload };
    },
    setAxisCalibration: (
      state,
      action: PayloadAction<{ axis: keyof DroneState['calibration']; value: Partial<AxisCalibration> }>
    ) => {
      state.calibration[action.payload.axis] = {
        ...state.calibration[action.payload.axis],
        ...action.payload.value,
      };
    },
    setDeadzone: (state, action: PayloadAction<number>) => {
      state.deadzone = action.payload;
    },
    setSensitivity: (state, action: PayloadAction<number>) => {
      state.sensitivity = action.payload;
    },
    setFov: (state, action: PayloadAction<number>) => {
      state.fov = action.payload;
    },
    setMass: (state, action: PayloadAction<number>) => {
      state.mass = action.payload;
    },
    setAcroThrust: (state, action: PayloadAction<number>) => {
      state.acroThrust = action.payload;
    },
    setAcroDrag: (state, action: PayloadAction<number>) => {
      state.acroDrag = action.payload;
    },
    setAcroCameraTilt: (state, action: PayloadAction<number>) => {
      state.acroCameraTilt = action.payload;
    },
    setFlightMode: (state, action: PayloadAction<'angle' | 'acro'>) => {
      state.flightMode = action.payload;
    },
    setSpeedTier: (state, action: PayloadAction<'slow' | 'normal' | 'sport'>) => {
      state.speedTier = action.payload;
    },
  },
});

export const {
  setGamepadIndex,
  setAxisMapping,
  setButtonMapping,
  setAxisCalibration,
  setDeadzone,
  setSensitivity,
  setFov,
  setMass,
  setAcroThrust,
  setAcroDrag,
  setAcroCameraTilt,
  setFlightMode,
  setSpeedTier,
} = droneSlice.actions;

export default droneSlice.reducer;
