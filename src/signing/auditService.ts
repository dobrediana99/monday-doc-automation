export type AuditEventType = "VIEW" | "SIGN";

export interface AuditEvent {
  type: AuditEventType;
  timestamp: string;
  ip: string;
  userAgent: string;
}

export class AuditService {
  buildAuditLines(events: AuditEvent[]): string[] {
    return [
      "Audit trail:",
      ...events.map((event) => `${event.type} | ${event.timestamp} | IP: ${event.ip} | UA: ${event.userAgent}`)
    ];
  }
}
