import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface DamageTier {
  name: string;
  radius: number; // in meters
  color: string;
}

export interface Weapon {
  id: string;
  name: string;
  tiers: DamageTier[];
}

export interface PinnedStrike {
  id: string;
  weaponId: string;
  lng: number;
  lat: number;
  height: number;
  billboardLng: number;
  billboardLat: number;
  billboardHeight: number;
}

export const WEAPONS: Record<string, Weapon> = {
  'shahed': {
    id: 'shahed',
    name: 'Shahed-136 Drone',
    tiers: [
      { name: 'Epicenter', radius: 50, color: 'rgba(255, 255, 255, 0.8)' },
      { name: 'Blast Wave', radius: 150, color: 'rgba(255, 85, 0, 0.3)' },
      { name: 'Debris/Shrapnel', radius: 300, color: 'rgba(204, 255, 0, 0.2)' } // technical HUD green/yellow
    ]
  },
  'tomahawk': {
    id: 'tomahawk',
    name: 'Tomahawk Cruise Missile',
    tiers: [
      { name: 'Epicenter', radius: 200, color: 'rgba(255, 255, 255, 0.9)' },
      { name: 'Blast Wave', radius: 600, color: 'rgba(255, 85, 0, 0.1)' },
      { name: 'Thermal Radiation', radius: 1200, color: 'rgba(170, 0, 0, 0.1)' } // critical red
    ]
  },
  'trident': {
    id: 'trident',
    name: 'Trident D5 ICBM',
    tiers: [
      { name: 'Fireball', radius: 1000, color: 'rgba(255, 255, 255, 1.0)' },
      { name: 'Air Blast (20 psi)', radius: 3200, color: 'rgba(255, 85, 0, 0.1)' },
      { name: 'Air Blast (5 psi)', radius: 6800, color: 'rgba(255, 136, 0, 0.1)' },
      { name: 'Thermal Radiation', radius: 11500, color: 'rgba(204, 255, 0, 0.1)' }
    ]
  }
};

interface MissileStrikeState {
  selectedWeaponId: string;
  isPlacing: boolean;
  pinnedStrikes: PinnedStrike[];
}

const initialState: MissileStrikeState = {
  selectedWeaponId: 'shahed',
  isPlacing: false,
  pinnedStrikes: []
};

const missileStrikeSlice = createSlice({
  name: 'missileStrike',
  initialState,
  reducers: {
    setSelectedWeaponId: (state, action: PayloadAction<string>) => {
      state.selectedWeaponId = action.payload;
    },
    setIsPlacing: (state, action: PayloadAction<boolean>) => {
      state.isPlacing = action.payload;
    },
    addPinnedStrike: (state, action: PayloadAction<PinnedStrike>) => {
      state.pinnedStrikes.push(action.payload);
    },
    updatePinnedStrikeBillboard: (state, action: PayloadAction<{ id: string, lng: number, lat: number, height: number }>) => {
      const strike = state.pinnedStrikes.find(s => s.id === action.payload.id);
      if (strike) {
        strike.billboardLng = action.payload.lng;
        strike.billboardLat = action.payload.lat;
        strike.billboardHeight = action.payload.height;
      }
    },
    removePinnedStrike: (state, action: PayloadAction<string>) => {
      state.pinnedStrikes = state.pinnedStrikes.filter(s => s.id !== action.payload);
    },
    clearAllStrikes: (state) => {
      state.pinnedStrikes = [];
    }
  }
});

export const { setSelectedWeaponId, setIsPlacing, addPinnedStrike, updatePinnedStrikeBillboard, removePinnedStrike, clearAllStrikes } = missileStrikeSlice.actions;
export default missileStrikeSlice.reducer;
