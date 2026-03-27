# City in Time — Air Quality API Server

A lightweight Express + TypeScript server that fetches real-time air quality data from [IQAir](https://www.iqair.com/air-pollution-data-api) and [AQICN](https://aqicn.org/api/), filters results to stations within **Portsea Island**, and serves them to the frontend.

---

## Quick start

```bash
cd backend
cp .env.template .env   # then fill in your API keys
npm install
npm run dev             # starts on http://localhost:3001
```

The frontend Vite dev server (`npm run dev` in `frontend/`) proxies all `/api` requests to `localhost:3001` automatically — no extra config needed.

---

## API Keys

| Key | Where to get it | Free tier |
|---|---|---|
| `AQICN_TOKEN` | [aqicn.org/data-platform/token](https://aqicn.org/data-platform/token/) | ~1 000 calls/day |
| `IQAIR_API_KEY` | [iqair.com/dashboard/api](https://www.iqair.com/dashboard/api) | 10 000 calls/month |

Set both in `backend/.env`:

```env
AQICN_TOKEN=your_token_here
IQAIR_API_KEY=your_key_here
PORT=3001
```

The server starts cleanly without keys — sources with missing keys are skipped and the response will contain an empty `stations` array until keys are configured.

---

## Endpoints

### `GET /api/health`
Basic liveness check.

```json
{ "status": "ok", "timestamp": "2026-03-27T10:00:00.000Z" }
```

---

### `GET /api/air-quality/stations`
Returns all air quality monitoring stations within Portsea Island with their latest readings, merged from both AQICN and IQAir.

**Response shape:**
```json
{
  "stations": [
    {
      "id": "aqicn-1234",
      "source": "aqicn",
      "name": "Portsmouth City Centre",
      "lat": 50.798,
      "lng": -1.091,
      "aqi": 42,
      "aqiCategory": "Good",
      "aqiColor": "#00e400",
      "dominantPollutant": "pm25",
      "pollutants": {
        "pm25": 8.2,
        "pm10": 15.1,
        "no2": 22.0,
        "o3": 34.5,
        "co": null,
        "so2": null
      },
      "temperature": 12.5,
      "humidity": 78,
      "wind": { "speed": 3.2, "direction": 220 },
      "updatedAt": "2026-03-27T10:00:00Z",
      "isStale": false
    }
  ],
  "fetchedAt": "2026-03-27T10:05:00Z",
  "sources": ["aqicn", "iqair"],
  "isStale": false
}
```

**Caching:** Results are cached in memory for **10 minutes**. If a live fetch fails but a previous result exists, stale data is returned with `"isStale": true`.

---

### `GET /api/air-quality/station/:id`
Returns a detailed reading for a single AQICN station (includes per-pollutant raw values).

Only `aqicn-*` IDs are supported (IQAir free tier does not expose per-station detail endpoints).

**Response shape:** Same as a single station object above, plus:
```json
{
  "pollutantsDetailed": {
    "pm25": { "v": 8.2 },
    "pm10": { "v": 15.1 }
  }
}
```

**Caching:** Individual station details are cached for **15 minutes**.

---

## Architecture

```
backend/
├── src/
│   ├── index.ts              # Express app, middleware, startup
│   ├── routes/
│   │   └── airQuality.ts     # Route handlers (cache → live fetch → stale fallback)
│   ├── services/
│   │   ├── aqicn.ts          # AQICN API client + response normalisation
│   │   ├── iqair.ts          # IQAir API client + response normalisation
│   │   ├── aqiHelpers.ts     # AQI category + colour lookup (US EPA scale)
│   │   └── cache.ts          # Generic in-memory TTL cache
│   └── utils/
│       └── geo.ts            # Portsea Island polygon, bounding box, point-in-polygon
├── .env.template
├── package.json
└── tsconfig.json
```

### Request flow

```
GET /api/air-quality/stations
        │
        ▼
  Cache fresh? ──yes──► return cached response
        │ no
        ▼
  Fetch AQICN bounds (bounding box query)
  Filter by Portsea Island polygon (ray casting)
        +
  Fetch IQAir Portsmouth city data
  Merge / deduplicate by proximity (< 0.5 km)
        │
        ├─ success ──► cache 10 min ──► return response
        │
        └─ failure ──► stale cache? ──yes──► return with isStale:true
                               │ no
                               ▼
                       503 + error message
```

### Data sources

**AQICN** (`/map/bounds/`)
- Queries a bounding box around Portsea Island (`50.776,-1.115,50.838,-1.026`)
- Returns all stations in the area; filtered server-side to those within the island polygon
- Provides: AQI, station name, lat/lng, dominant pollutant

**IQAir** (`/city?city=Portsmouth&state=England&country=UK`)
- City-level reading for Portsmouth
- Provides: AQI, PM2.5, temperature, humidity, wind speed/direction
- Merged into the AQICN station list (deduplicated if within 0.5 km of an existing station)

### Polygon filtering

The Portsea Island boundary is an 18-vertex polygon defined in `src/utils/geo.ts`. After fetching the AQICN bounding box results, each station is tested with a ray-casting point-in-polygon algorithm (`isWithinPortseaIsland(lat, lng)`). Stations outside the island are discarded.

### AQI colour scale (US EPA)

| Range | Category | Colour |
|---|---|---|
| 0–50 | Good | `#00e400` |
| 51–100 | Moderate | `#ffff00` |
| 101–150 | Unhealthy for Sensitive Groups | `#ff7e00` |
| 151–200 | Unhealthy | `#ff0000` |
| 201–300 | Very Unhealthy | `#8f3f97` |
| 301+ | Hazardous | `#7e0023` |

---

## Rate limits & caching strategy

| Source | Free limit | Cache TTL | Effective calls |
|---|---|---|---|
| AQICN | ~1 000/day | 10 min | ≤ 144/day |
| IQAir | 10 000/month | 10 min | ≤ 4 320/month |

With a 10-minute TTL, the server makes at most ~144 calls/day per source — well within free tier limits even if multiple users hit the API simultaneously.

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run with nodemon + ts-node (hot-reload on file changes) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output from `dist/` |
