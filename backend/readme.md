# City In Time — Backend API

Express + TypeScript server that fetches real-time air quality and ship tracking data, caches it, and serves it to the frontend.

---

## Quick Start

```bash
cd backend
cp .env.template .env   # fill in your API keys
npm install
npm run dev             # starts on http://localhost:3001
```

The frontend Vite dev server proxies all `/api` requests to `localhost:3001` automatically — no extra config needed.

---

## Environment Variables

```env
PORT=3001
AQICN_TOKEN=your_token_here
IQAIR_API_KEY=your_key_here
MYSHIPTRACKING_API_KEY=your_key_here
AQICN_STATION_UIDS=          # optional: comma-separated UIDs to pre-pin
```

| Key | Where to get it | Free tier |
|---|---|---|
| `AQICN_TOKEN` | [aqicn.org/data-platform/token](https://aqicn.org/data-platform/token/) | ~1,000 calls/day |
| `IQAIR_API_KEY` | [iqair.com/dashboard/api](https://www.iqair.com/dashboard/api) | 10,000 calls/month |
| `MYSHIPTRACKING_API_KEY` | [myshiptracking.com](https://myshiptracking.com) | Pay-per-call |

The server starts cleanly without keys — sources with missing keys are skipped and the response will contain empty data until keys are configured.

---

## API Endpoints

### `GET /api/health`
Liveness check.

```json
{ "status": "ok", "timestamp": "2026-03-28T10:00:00.000Z" }
```

---

### `GET /api/air-quality/stations`
All air quality monitoring stations within Portsea Island, merged from AQICN and IQAir.

**Response:**
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
        "pm25": 8.2, "pm10": 15.1, "no2": 22.0,
        "o3": 34.5, "co": null, "so2": null
      },
      "temperature": 12.5,
      "humidity": 78,
      "wind": { "speed": 3.2, "direction": 220 },
      "updatedAt": "2026-03-28T10:00:00Z",
      "isStale": false
    }
  ],
  "fetchedAt": "2026-03-28T10:05:00Z",
  "sources": ["aqicn", "iqair"],
  "isStale": false
}
```

**Cache:** 10 minutes. Returns stale data with `"isStale": true` if a live fetch fails but a previous result exists.

---

### `GET /api/air-quality/station/:id`
Detailed reading for a single AQICN station (includes per-pollutant raw values).

Only `aqicn-*` IDs are supported (IQAir free tier does not expose per-station detail endpoints).

**Additional field in response:**
```json
{
  "pollutantsDetailed": {
    "pm25": { "v": 8.2 },
    "pm10": { "v": 15.1 }
  }
}
```

**Cache:** 15 minutes.

---

### `GET /api/ship-tracking/vessels`
All vessels currently within the Portsmouth Harbour bounding box.

**Response:**
```json
{
  "vessels": [
    {
      "mmsi": 235001234,
      "name": "HMS EXAMPLE",
      "type": "military",
      "lat": 50.798,
      "lng": -1.111,
      "speed": 4.2,
      "heading": 180,
      "course": 178,
      "navStatus": "Under Way Using Engine",
      "updatedAt": "2026-03-28T10:00:00Z"
    }
  ],
  "fetchedAt": "2026-03-28T10:00:05Z",
  "isStale": false
}
```

**Vessel types:** `cargo`, `tanker`, `passenger`, `fishing`, `military`, `sailing`, `pleasure`, `other`

**Cache:** 60 seconds.

---

### `GET /api/ship-tracking/vessel/:mmsi`
Extended detail for a single vessel by MMSI.

**Additional fields:**
```json
{
  "imo": 1234567,
  "callsign": "EXAM1",
  "flag": "GB",
  "length": 142,
  "beam": 22,
  "draught": 6.5,
  "destination": "PORTSMOUTH",
  "eta": "2026-03-28T14:00:00Z"
}
```

**Cache:** 5 minutes.

---

## Architecture

```
backend/
├── src/
│   ├── index.ts              # Express app, middleware, startup
│   ├── routes/
│   │   ├── airQuality.ts     # Air quality route handlers
│   │   └── shipTracking.ts   # Ship tracking route handlers
│   ├── services/
│   │   ├── aqicn.ts          # AQICN API client + response normalisation
│   │   ├── iqair.ts          # IQAir API client + response normalisation
│   │   ├── myshiptracking.ts # MyShipTracking API client + type mapping
│   │   ├── aqiHelpers.ts     # AQI category + colour lookup (US EPA scale)
│   │   └── cache.ts          # Generic in-memory TTL cache with stale fallback
│   └── utils/
│       └── geo.ts            # Portsea Island polygon, bounding box, point-in-polygon
├── .env.template
├── package.json
└── tsconfig.json
```

### Air Quality Request Flow

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

### Ship Tracking Request Flow

```
GET /api/ship-tracking/vessels
        │
        ▼
  Cache fresh? ──yes──► return cached response
        │ no
        ▼
  Query MyShipTracking zone API (Portsmouth Harbour bbox)
  Map raw vessel type codes → named categories
        │
        ├─ success ──► cache 60 sec ──► return response
        │
        └─ failure ──► stale cache? ──yes──► return with isStale:true
                               │ no
                               ▼
                       503 + error message
```

---

## Data Sources

**AQICN** — queries bounding box `50.776,-1.115,50.838,-1.026`, then filters server-side to stations within the Portsea Island polygon (18-vertex ray-casting).

**IQAir** — city-level reading for Portsmouth, England. Merged into the station list; deduplicated if within 0.5 km of an existing AQICN station.

**MyShipTracking** — zone query for the Portsmouth Harbour area. Returns live AIS positions with speed, heading, navigation status, and vessel metadata.

---

## AQI Colour Scale (US EPA)

| Range | Category | Colour |
|---|---|---|
| 0–50 | Good | `#00e400` |
| 51–100 | Moderate | `#ffff00` |
| 101–150 | Unhealthy for Sensitive Groups | `#ff7e00` |
| 151–200 | Unhealthy | `#ff0000` |
| 201–300 | Very Unhealthy | `#8f3f97` |
| 301+ | Hazardous | `#7e0023` |

---

## Rate Limits & Caching

| Source | Free limit | Cache TTL | Max calls/day |
|---|---|---|---|
| AQICN | ~1,000/day | 10 min | ≤ 144 |
| IQAir | 10,000/month | 10 min | ≤ 144 |
| MyShipTracking | Pay-per-call | 60 sec | ≤ 1,440 |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Run with nodemon + ts-node (hot-reload) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output from `dist/` |
