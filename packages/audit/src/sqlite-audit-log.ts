import { DatabaseSync } from 'node:sqlite';

export type AuditEventInput = {
  type: string;
  payload: unknown;
  timestamp?: number;
};

export type AuditEvent = {
  id: number;
  type: string;
  payload: unknown;
  timestamp: number;
};

export class SqliteAuditLog {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
  }

  init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        payload TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  append(event: AuditEventInput): AuditEvent {
    const timestamp = event.timestamp ?? Date.now();
    const payloadText = JSON.stringify(event.payload ?? null);

    const stmt = this.db.prepare(
      'INSERT INTO audit_events (type, payload, timestamp) VALUES (?, ?, ?)',
    );
    const result = stmt.run(event.type, payloadText, timestamp);

    return {
      id: Number(result.lastInsertRowid),
      type: event.type,
      payload: event.payload,
      timestamp,
    };
  }

  list(): AuditEvent[] {
    const rows = this.db
      .prepare('SELECT id, type, payload, timestamp FROM audit_events ORDER BY id ASC')
      .all() as Array<{ id: number; type: string; payload: string; timestamp: number }>;

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: JSON.parse(row.payload),
      timestamp: row.timestamp,
    }));
  }
}
