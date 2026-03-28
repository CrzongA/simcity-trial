# City In Time

A web-based 3D city simulation platform for exploring urban futures under different scenarios. Built around Portsmouth, UK, it renders photorealistic 3D buildings, terrain, and live data layers through a set of interactive simulation stories.

---

## Features

### Core Map
- **Google Photorealistic 3D Tiles** clipped precisely to the Portsea Island boundary
- **Cesium World Terrain** for accurate elevation data
- **Switchable base maps**: CartoDB Dark Matter, ESRI Satellite, OpenStreetMap Streets
- **Advanced rendering controls**: SSE threshold, FXAA, resolution scale, tile cache size

### Simulation Stories

| Story | Description |
|---|---|
| **Sea Level Rise** | Animate flood water based on year (1962–2300) using real historical data and IPCC projections |
| **Missile Strike** | Place Shahed-136, Tomahawk, or Trident D5 strikes with multi-tier damage radius overlays |
| **Drone FPV** | Gamepad-controlled first-person drone with physics simulation (angle/acro modes, configurable speed tiers) |
| **Air Quality** | Live AQI heatmap and billboards from AQICN + IQAir stations within Portsea Island |
| **Ship Tracking** | Real-time vessel positions in Portsmouth Harbour with type filtering and trail visualization |
| **Design Portsmouth** | Upload and place 3D models (glTF) anywhere on the map with translate/rotate/scale tools |

---

## Architecture

```
cityintime/
├── frontend/           # React + Vite + Cesium app
├── backend/            # Express + TypeScript API server
├── data/               # Portsea Island GeoJSON boundary
├── docs/               # Implementation guides
└── docker/             # Dockerfile for containerised dev
```

The frontend proxies all `/api` requests to the backend (`localhost:3001`) automatically in development — no extra configuration needed.

---

## Getting Started

### Prerequisites
- Node.js v20+
- API keys (see below)

### 1. Backend

```bash
cd backend
cp .env.template .env   # fill in your API keys
npm install
npm run dev             # starts on http://localhost:3001
```

### 2. Frontend

```bash
cd frontend
cp .env.template .env   # fill in your Cesium / Google Maps keys
npm install
npm run dev             # starts on http://localhost:5173
```

### API Keys

| Key | Where to get it | Required for |
|---|---|---|
| `VITE_CESIUM_ION_TOKEN` | [ion.cesium.com](https://ion.cesium.com) | 3D tiles + terrain |
| `VITE_GOOGLE_MAPS_API_KEY` | [Google Cloud Console](https://console.cloud.google.com) | Photorealistic 3D Tiles |
| `AQICN_TOKEN` | [aqicn.org/data-platform/token](https://aqicn.org/data-platform/token/) | Air Quality story |
| `IQAIR_API_KEY` | [iqair.com/dashboard/api](https://www.iqair.com/dashboard/api) | Air Quality story |
| `MYSHIPTRACKING_API_KEY` | [myshiptracking.com](https://myshiptracking.com) | Ship Tracking story |

The app runs without all keys — stories with missing keys will show empty data rather than crash.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, Redux Toolkit, Cesium 1.139 (Resium), Three.js, Material-UI 7 |
| Backend | Node.js, Express 4, TypeScript, Axios |
| 3D/Maps | Google Photorealistic 3D Tiles, Cesium World Terrain, CartoDB, ESRI |
| Data APIs | AQICN, IQAir, MyShipTracking |

---

## Docker (optional)

```bash
docker compose up
```

Runs the frontend dev server in a container on port 5173.

---

## License

MIT — see [LICENSE](LICENSE) for details.
