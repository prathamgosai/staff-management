/**
 * Tiny in-process TTL cache (same proven pattern RolesService uses for the permission
 * matrix). Deliberately NOT Redis: the app runs as a single Render instance, so an
 * in-memory cache removes the recomputation + pool-saturation without adding an external
 * dependency or a network hop. If the API is ever scaled to multiple instances, swap the
 * store for Redis behind this same interface (each instance would otherwise cache locally,
 * which is still correct — just a lower hit rate).
 *
 * Keys must already encode every input that changes the value (tenant, scope, date, …),
 * so distinct callers never collide and no cross-tenant/scope value is ever returned.
 */
export class TtlCache<T> {
  private readonly store = new Map<string, { value: T; expiresAt: number }>();

  constructor(private readonly ttlMs: number) {}

  get(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    // Bound memory: opportunistically sweep expired entries when the map grows.
    if (this.store.size > 500) {
      const now = Date.now();
      for (const [k, v] of this.store) if (v.expiresAt <= now) this.store.delete(k);
    }
  }

  /** Return the cached value or compute + cache it. Concurrent callers may each compute
   *  once on a cold key (no in-flight de-dup) — acceptable for short TTLs. */
  async getOrCompute(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = this.get(key);
    if (cached !== undefined) return cached;
    const value = await compute();
    this.set(key, value);
    return value;
  }

  clear(): void {
    this.store.clear();
  }
}
