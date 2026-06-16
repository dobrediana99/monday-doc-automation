/**
 * Parses CRM person column value for crmKey `assigned` (Principal).
 * Supports multi-person shape ({ users, user_ids }) and legacy single { user_id }.
 */
export function extractFirstAssignedUserId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as {
    user_id?: string;
    user_ids?: string[];
    users?: Array<{ user_id?: string }>;
  };

  if (typeof record.user_id === "string" && record.user_id.trim()) {
    return record.user_id.trim();
  }

  if (Array.isArray(record.user_ids)) {
    for (const id of record.user_ids) {
      if (typeof id === "string" && id.trim()) {
        return id.trim();
      }
    }
  }

  if (Array.isArray(record.users)) {
    for (const user of record.users) {
      const id = user?.user_id;
      if (typeof id === "string" && id.trim()) {
        return id.trim();
      }
    }
  }

  return null;
}
