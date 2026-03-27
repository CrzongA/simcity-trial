/**
 * Simple in-memory TTL cache.
 *
 * Entries are never auto-evicted; they are considered "fresh" only within their
 * TTL window.  Stale entries are retained so callers can return stale data with
 * an `isStale` flag when a live fetch fails.
 */

export interface CacheEntry<T> {
  value: T;
  storedAt: number; // Unix ms
  ttlMs: number;
}

export class TTLCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();

  /**
   * Store a value under `key` with the given TTL (milliseconds).
   */
  set(key: string, value: T, ttlMs: number): void {
    this.store.set(key, { value, storedAt: Date.now(), ttlMs });
  }

  /**
   * Returns the entry if it exists (fresh OR stale).
   * Returns `undefined` if no entry has ever been stored for `key`.
   */
  get(key: string): CacheEntry<T> | undefined {
    return this.store.get(key);
  }

  /**
   * Returns the value only when the entry is fresh (within TTL).
   * Returns `undefined` when missing or stale.
   */
  getFresh(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.storedAt > entry.ttlMs) return undefined;
    return entry.value;
  }

  /**
   * Returns `true` if an entry exists and is within its TTL.
   */
  isFresh(key: string): boolean {
    return this.getFresh(key) !== undefined;
  }

  /** Remove a single entry. */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** Clear all entries. */
  clear(): void {
    this.store.clear();
  }
}

// ---------------------------------------------------------------------------
// Shared singleton instances
// ---------------------------------------------------------------------------

/** Cache for the stations list (10-minute TTL). */
export const stationsCache = new TTLCache<unknown>();

/** Cache for individual station detail responses (15-minute TTL). */
export const stationDetailCache = new TTLCache<unknown>();

export const STATIONS_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const STATION_DETAIL_TTL_MS = 15 * 60 * 1000; // 15 minutes
