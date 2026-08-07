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

/**
 * Parses CRM person column value for crmKey `assigned` (Secondary).
 * Only the multi-person shape can carry a second user; the legacy single
 * `user_id` shape has no secondary by definition.
 */
export function extractSecondAssignedUserId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as {
    user_ids?: string[];
    users?: Array<{ user_id?: string }>;
  };

  if (Array.isArray(record.user_ids)) {
    const ids = record.user_ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    if (ids.length > 1) {
      return ids[1].trim();
    }
  }

  if (Array.isArray(record.users)) {
    const ids = record.users
      .map((user) => user?.user_id)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    if (ids.length > 1) {
      return ids[1].trim();
    }
  }

  return null;
}
