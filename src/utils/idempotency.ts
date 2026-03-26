const idempotencyMap = new Map<string, number>();

export class IdempotencyService {
  constructor(private readonly ttlMs: number) {}

  makeKey(itemId: string | number, columnId: string, newStatus: string): string {
    return `${itemId}:${columnId}:${newStatus}`;
  }

  isDuplicateAndRemember(key: string): boolean {
    this.cleanupExpired();
    const existing = idempotencyMap.get(key);
    if (existing && existing > Date.now()) {
      return true;
    }

    idempotencyMap.set(key, Date.now() + this.ttlMs);
    return false;
  }

  private cleanupExpired(): void {
    const now = Date.now();
    for (const [key, expiresAt] of idempotencyMap.entries()) {
      if (expiresAt <= now) {
        idempotencyMap.delete(key);
      }
    }
  }
}
