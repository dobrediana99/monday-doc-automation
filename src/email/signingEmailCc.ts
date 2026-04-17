const SIMPLE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Builds CC address list for signing emails: includes Principal only when valid and not the same as `primaryTo` (case-insensitive).
 * Dedupes against `primaryTo` and duplicate entries in `extra` (case-insensitive).
 */
export function signingPrincipalCcAddresses(
  primaryTo: string,
  principalEmail: string | null | undefined
): string[] | undefined {
  if (!principalEmail?.trim()) {
    return undefined;
  }
  return normalizeDedupedCcExcludingTo(primaryTo, [principalEmail.trim()]);
}

export function normalizeDedupedCcExcludingTo(primaryTo: string, extra: string[]): string[] | undefined {
  const toKey = primaryTo.trim().toLowerCase();
  const seen = new Set<string>([toKey]);
  const out: string[] = [];
  for (const raw of extra) {
    const e = raw.trim();
    if (!SIMPLE_EMAIL.test(e)) {
      continue;
    }
    const k = e.toLowerCase();
    if (seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(e);
  }
  return out.length > 0 ? out : undefined;
}
