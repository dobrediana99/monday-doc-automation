/**
 * Parses Monday **people** column `value` JSON (`personsAndTeams`).
 * Returns the first **person** user id; skips **team** entries.
 */
export function extractFirstPersonUserIdFromPeopleColumnJson(valueJson: string | null | undefined): string | null {
  if (!valueJson?.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(valueJson) as {
      personsAndTeams?: Array<{ id?: number | string; kind?: string }>;
    };
    const list = parsed.personsAndTeams;
    if (!Array.isArray(list) || list.length === 0) {
      return null;
    }
    for (const entry of list) {
      const kind = (entry.kind ?? "person").toLowerCase();
      if (kind === "team") {
        continue;
      }
      if (entry.id == null) {
        continue;
      }
      const id = typeof entry.id === "number" ? entry.id : Number(entry.id);
      if (!Number.isFinite(id)) {
        continue;
      }
      return String(Math.trunc(id));
    }
    return null;
  } catch {
    return null;
  }
}
