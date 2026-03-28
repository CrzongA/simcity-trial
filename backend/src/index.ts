/**
 * City in Time — Air Quality API server
 *
 * Start with:
 *   npm run dev      (TypeScript / nodemon)
 *   npm run build && npm start  (compiled JS)
 */

import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import airQualityRouter from './routes/airQuality';
import shipTrackingRouter from './routes/shipTracking';
import './services/aisstream';  // starts WebSocket connection on boot if AISSTREAM_API_KEY is set

const app = express();
const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(
  cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(express.json());

// Request logger
app.use((req: Request, _res: Response, next: NextFunction) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Air quality routes
app.use('/api/air-quality', airQualityRouter);

// Ship tracking routes
app.use('/api/ship-tracking', shipTrackingRouter);

// 404 catch-all
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

app.listen(PORT, () => {
  console.log(`\nCity in Time API server running on http://localhost:${PORT}`);
  console.log('  GET /api/health');
  console.log('  GET /api/air-quality/stations');
  console.log('  GET /api/air-quality/station/:id');
  console.log('  GET /api/ship-tracking/vessels');
  console.log('  GET /api/ship-tracking/vessel/:mmsi\n');

  const aqicnToken = process.env['AQICN_TOKEN'];
  const iqairKey = process.env['IQAIR_API_KEY'];

  if (!aqicnToken || aqicnToken === 'your_token_here') {
    console.warn('  [warn] AQICN_TOKEN not set — AQICN data will not be fetched');
  } else {
    console.log('  [ok]   AQICN_TOKEN configured');
  }

  if (!iqairKey || iqairKey === 'your_key_here') {
    console.warn('  [warn] IQAIR_API_KEY not set — IQAir data will not be fetched');
  } else {
    console.log('  [ok]   IQAIR_API_KEY configured');
  }

  const aisKey = process.env['AISSTREAM_API_KEY'];
  if (!aisKey || aisKey === 'your_key_here') {
    console.warn('  [warn] AISSTREAM_API_KEY not set — AISStream will not connect');
  } else {
    console.log('  [ok]   AISSTREAM_API_KEY configured (WebSocket connecting…)');
  }

  const vfKey = process.env['VESSELFINDER_API_KEY'];
  if (vfKey && vfKey !== 'your_key_here') {
    console.log('  [ok]   VESSELFINDER_API_KEY configured (fallback)');
  }

  const shipKey = process.env['MYSHIPTRACKING_API_KEY'];
  if (shipKey && shipKey !== 'your_key_here') {
    console.log('  [ok]   MYSHIPTRACKING_API_KEY configured (fallback)');
  }

  console.log('');
});

export default app;
