export class IdempotencyService {
  private readonly store = new Map<string, number>();

  constructor(private readonly ttlMs: number) {}

  makeKey(itemId: string | number, columnId: string, newStatus: string): string {
    return `${itemId}:${columnId}:${newStatus}`;
  }

  /** True if this key was recently remembered and is still within TTL. */
  isDuplicate(key: string): boolean {
    this.cleanupExpired();
    const existing = this.store.get(key);
    return Boolean(existing && existing > Date.now());
  }

  remember(key: string): void {
    this.cleanupExpired();
    this.store.set(key, Date.now() + this.ttlMs);
  }

  forget(key: string): void {
    this.store.delete(key);
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, expiresAt] of this.store.entries()) {
      if (expiresAt <= now) {
        this.store.delete(key);
      }
    }
  }
}
