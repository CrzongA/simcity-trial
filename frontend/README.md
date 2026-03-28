# Sim City: Portsmouth — Frontend

React + Vite application that renders a photorealistic 3D map of Portsmouth and hosts all simulation stories.

---

## Quick Start

```bash
cp .env.template .env   # fill in API keys
npm install
npm run dev             # http://localhost:5173
```

All `/api` requests are automatically proxied to `http://localhost:3001` (backend).

---

## Environment Variables

Copy `.env.template` to `.env` and populate:

```env
VITE_CESIUM_ION_TOKEN=your_cesium_ion_token
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

| Variable | Purpose |
|---|---|
| `VITE_CESIUM_ION_TOKEN` | Cesium Ion access token — enables World Terrain and asset hosting |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps API key — required for Photorealistic 3D Tiles |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | Type-check + compile to `dist/` |
| `npm run preview` | Preview production build locally |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checker without emitting |

---

## Project Structure

```
frontend/
├── src/
│   ├── App.tsx                     # Root app with routing
│   ├── main.tsx                    # React entry point
│   ├── store.ts                    # Redux store setup
│   ├── components/
│   │   ├── CityMap.tsx             # Main 3D Cesium viewer
│   │   ├── StoriesMenu.tsx         # Bottom story selector
│   │   ├── AdvancedControls.tsx    # Rendering quality options
│   │   ├── BaseMapControls.tsx     # Base map switcher
│   │   ├── SeaLevelChart.tsx       # Historical/projected chart
│   │   ├── BillboardsOverlay.tsx   # Draggable 3D floating labels
│   │   ├── SimulationControls.tsx  # Timeline playback controls
│   │   └── stories/
│   │       ├── SeaLevelMapController.tsx
│   │       ├── MissileMapController.tsx   + MissileMenu.tsx
│   │       ├── DroneMapController.tsx     + DroneHUD.tsx + DroneSettings.tsx
│   │       ├── AirQualityMapController.tsx + AirQualityMenu.tsx
│   │       ├── ShipTrackingMapController.tsx + ShipTrackingMenu.tsx
│   │       └── ModelDesignMapController.tsx + ModelDesignMenu.tsx
│   ├── store/
│   │   ├── storySlice.ts           # Active story selection
│   │   ├── seaLevelSlice.ts        # Year + manual rise override
│   │   ├── missileStrikeSlice.ts   # Weapon selection + pinned strikes
│   │   ├── airQualitySlice.ts      # Stations, pollutant filter, refresh
│   │   ├── droneSlice.ts           # Gamepad config + physics params
│   │   ├── shipTrackingSlice.ts    # Vessels, trails, type filters
│   │   ├── modelDesignSlice.ts     # Placed 3D models + transform mode
│   │   └── uiSlice.ts              # App start state + tile load status
│   ├── lib/
│   │   ├── consts.ts               # Portsea Island coords, decimation config
│   │   └── seaLevelData.ts         # CSV parser for sea level data
│   └── types/
│       └── portsmouth-geojson.d.ts
└── data/
    ├── sea-level-1962-2025.csv     # Historical tide gauge data
    └── sea-level-1965-2300.csv     # Historical + IPCC projections to 2300
```

---

## Simulation Stories

### Sea Level Rise
- Animates flood volume across the terrain based on selected year or manual offset
- Reads real tide gauge data (1962–2025) and IPCC scenario projections (2026–2300)
- Water surface rendered with animated CSM shader

### Missile Strike
Weapons: **Shahed-136 drone**, **Tomahawk cruise missile**, **Trident D5 ICBM**
- Click to place strike anywhere on the map
- Visualises tiered damage radii: Epicenter, Blast Wave, Thermal Radiation
- Multiple strikes can be pinned simultaneously; each has a draggable billboard label

### Drone FPV
- Requires a gamepad (USB or Bluetooth controller)
- Two flight modes: **Angle** (self-levelling) and **Acro** (manual, no stabilisation)
- Physics: thrust, drag, mass, gravity — realistic terminal velocity (~250 km/h in sport mode)
- Configurable: axis mapping, calibration, dead zone, sensitivity, FOV, speed tier (slow/normal/sport)
- Real-time HUD: altitude, heading, speed, artificial horizon

### Air Quality
- Live data from AQICN and IQAir stations within Portsea Island
- Pollutant filters: AQI index, PM2.5, PM10, NO₂, O₃
- AQI heatmap + per-station billboards with colour-coded EPA scale
- Auto-refresh: 5 / 15 / 30-minute intervals

### Ship Tracking
- Real-time vessel positions from MyShipTracking API
- 8 vessel type categories: Cargo, Tanker, Passenger, Fishing, Military, Sailing, Pleasure, Other
- Click a vessel for MMSI, type, speed, heading, and navigation status
- Trail visualisation, type-based filtering, 60-second auto-refresh

### Design Portsmouth
- Upload `.glb` / `.gltf` model files and place them anywhere on the map
- Transform tools: **Translate**, **Rotate**, **Scale**
- Per-model visibility toggle; model library persisted to `localStorage`

---

## Key Dependencies

| Package | Version | Purpose |
|---|---|---|
| `cesium` | 1.139 | 3D globe, terrain, 3D tiles |
| `resium` | 1.17 | React wrapper for Cesium |
| `three` | 0.183 | Custom shader / mesh work |
| `@reduxjs/toolkit` | 2.11 | State management |
| `@mui/material` | 7.3 | UI component library |
| `react` | 18.3 | UI framework |
| `vite` | 5.4 | Build tool + dev server |
