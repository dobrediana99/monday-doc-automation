import { describe, expect, it, vi } from "vitest";
import { GenerationValidationError } from "../flows/generationErrors";
import { IdempotencyService } from "./idempotency";

describe("IdempotencyService", () => {
  it("forget removes a key so isDuplicate is false again", () => {
    const idem = new IdempotencyService(60_000);
    const key = "item:col:status";
    expect(idem.isDuplicate(key)).toBe(false);
    idem.remember(key);
    expect(idem.isDuplicate(key)).toBe(true);
    idem.forget(key);
    expect(idem.isDuplicate(key)).toBe(false);
  });

  it("duplicate protection: second check is duplicate while TTL active", () => {
    const idem = new IdempotencyService(60_000);
    const key = idem.makeKey("42", "color_x", "Client SRL");
    expect(idem.isDuplicate(key)).toBe(false);
    idem.remember(key);
    expect(idem.isDuplicate(key)).toBe(true);
  });

  it("same itemId+columnId+status can run again after forget (manual retry)", async () => {
    const idem = new IdempotencyService(60_000);
    const key = idem.makeKey("1", "color_mky3xvmr", "Client SRL");
    const run = vi
      .fn()
      .mockRejectedValueOnce(new GenerationValidationError("missing fields"))
      .mockResolvedValueOnce(undefined);

    // First webhook delivery
    expect(idem.isDuplicate(key)).toBe(false);
    idem.remember(key);
    await expect(run()).rejects.toThrow(GenerationValidationError);
    idem.forget(key);

    // User retry with same status value
    expect(idem.isDuplicate(key)).toBe(false);
    idem.remember(key);
    await run();
    expect(run).toHaveBeenCalledTimes(2);

    // True duplicate delivery shortly after success path would still remember
    expect(idem.isDuplicate(key)).toBe(true);
  });
});
