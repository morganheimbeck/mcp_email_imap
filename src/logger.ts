export type ActionType = "send_email" | "create_draft" | "move_email" | "mark_read" | "mark_unread";

export interface LogEntry {
  timestamp: string;
  action: ActionType;
  details: Record<string, unknown>;
}

export function logAction(action: ActionType, details: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    action,
    details,
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}
