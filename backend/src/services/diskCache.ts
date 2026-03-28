/**
 * File-backed persistent cache.
 *
 * Mirrors the TTLCache API but also writes each entry to a JSON file under
 * `backend/cache/` so data survives server restarts.  On startup all matching
 * files are loaded back into memory.
 *
 * Rate limiter: counts incoming requests per logical endpoint key.  When a
 * key exceeds RATE_LIMIT requests inside RATE_WINDOW_MS, callers should skip
 * live external API calls and serve from this cache instead.
 */

import * as fs   from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Types (inline to avoid circular import with cache.ts)
// ---------------------------------------------------------------------------

export interface DiskCacheEntry<T> {
  value:     T;
  storedAt:  number; // Unix ms
  ttlMs:     number;
}

interface CacheFile<T> {
  key:   string;
  entry: DiskCacheEntry<T>;
}

// ---------------------------------------------------------------------------
// Cache directory
// ---------------------------------------------------------------------------

const CACHE_DIR = path.resolve(__dirname, '../../cache');

function ensureDir(): void {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    console.log(`[diskCache] Created cache directory: ${CACHE_DIR}`);
  }
}

// ---------------------------------------------------------------------------
// DiskCache class
// ---------------------------------------------------------------------------

export class DiskCache<T> {
  private readonly mem: Map<string, DiskCacheEntry<T>> = new Map();
  private readonly ns: string;

  constructor(namespace: string) {
    this.ns = namespace;
    ensureDir();
    this.loadAll();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Store value in memory and write it to disk. */
  set(key: string, value: T, ttlMs: number): void {
    const entry: DiskCacheEntry<T> = { value, storedAt: Date.now(), ttlMs };
    this.mem.set(key, entry);
    this.writeToDisk(key, entry);
  }

  /** Return the entry (fresh OR stale) if it exists; otherwise undefined. */
  get(key: string): DiskCacheEntry<T> | undefined {
    return this.mem.get(key);
  }

  /** Return the value only when the entry is within its TTL. */
  getFresh(key: string): T | undefined {
    const entry = this.mem.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.storedAt > entry.ttlMs) return undefined;
    return entry.value;
  }

  /** True when an entry exists and is within its TTL. */
  isFresh(key: string): boolean {
    return this.getFresh(key) !== undefined;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private filePath(key: string): string {
    const safe = key.replace(/[^a-zA-Z0-9_-]/g, '-');
    return path.join(CACHE_DIR, `${this.ns}__${safe}.json`);
  }

  private loadAll(): void {
    try {
      const prefix = `${this.ns}__`;
      const files  = fs.readdirSync(CACHE_DIR)
        .filter(f => f.startsWith(prefix) && f.endsWith('.json'));

      for (const file of files) {
        try {
          const raw: CacheFile<T> = JSON.parse(
            fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8'),
          );
          this.mem.set(raw.key, raw.entry);
          const ageMin = Math.round((Date.now() - raw.entry.storedAt) / 60_000);
          const fresh  = Date.now() - raw.entry.storedAt <= raw.entry.ttlMs;
          console.log(
            `[diskCache:${this.ns}] Loaded "${raw.key}" from disk` +
            ` (age: ${ageMin} min, ${fresh ? 'still fresh' : 'stale'})`,
          );
        } catch (e) {
          console.warn(`[diskCache:${this.ns}] Skipping corrupt file "${file}": ${(e as Error).message}`);
        }
      }
    } catch (e) {
      console.warn(`[diskCache:${this.ns}] Failed to read cache dir: ${(e as Error).message}`);
    }
  }

  private writeToDisk(key: string, entry: DiskCacheEntry<T>): void {
    const payload: CacheFile<T> = { key, entry };
    fs.writeFile(
      this.filePath(key),
      JSON.stringify(payload, null, 2),
      (err) => {
        if (err) console.warn(`[diskCache:${this.ns}] Write failed for "${key}": ${err.message}`);
      },
    );
  }
}

// ---------------------------------------------------------------------------
// Rate limiter — sliding window, per logical endpoint key
// ---------------------------------------------------------------------------

/** Max requests per window before live fetch is skipped. */
export const RATE_LIMIT     = 100;
/** Sliding window size in milliseconds. */
export const RATE_WINDOW_MS = 60_000;

const reqTimestamps = new Map<string, number[]>();

/**
 * Record one incoming request for `endpointKey`.
 * Call this at the top of every route handler.
 */
export function trackRequest(endpointKey: string): void {
  const now   = Date.now();
  const prev  = reqTimestamps.get(endpointKey) ?? [];
  const recent = prev.filter(t => now - t < RATE_WINDOW_MS);
  recent.push(now);
  reqTimestamps.set(endpointKey, recent);
}

/**
 * Returns true when the endpoint has exceeded RATE_LIMIT requests in the
 * last RATE_WINDOW_MS milliseconds.
 */
export function isRateLimited(endpointKey: string): boolean {
  const now    = Date.now();
  const recent = (reqTimestamps.get(endpointKey) ?? [])
    .filter(t => now - t < RATE_WINDOW_MS);
  return recent.length > RATE_LIMIT;
}

/** Current request count for an endpoint (useful for logging). */
export function requestCount(endpointKey: string): number {
  const now = Date.now();
  return (reqTimestamps.get(endpointKey) ?? [])
    .filter(t => now - t < RATE_WINDOW_MS).length;
}
