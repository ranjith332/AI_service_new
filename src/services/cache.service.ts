export class QueryCacheService {
  private readonly store = new Map<string, { expiresAt: number; value: unknown }>();

  constructor(private readonly ttlMs: number) {}

  get<T>(key: string): T | null {
    const item = this.store.get(key);
    if (!item) {
      return null;
    }

    if (item.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    return item.value as T;
  }

  set<T>(key: string, value: T): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs
    });
  }
}
