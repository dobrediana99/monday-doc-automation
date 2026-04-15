/**
 * Thrown after Monday has been updated for a generation failure that should allow
 * the user to retry the same trigger status without being blocked by webhook idempotency.
 */
export class GenerationValidationError extends Error {
  override readonly name = "GenerationValidationError";

  constructor(message?: string) {
    super(message ?? "Generation validation failed");
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
