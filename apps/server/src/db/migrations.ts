import type Database from "better-sqlite3";

// Migração incremental: garante que chat_messages tenha as colunas
// message_type/target/metadata mesmo em bancos criados antes delas existirem.
export function runMigrations(db: Database.Database) {
  const chatColumns = db.prepare("PRAGMA table_info(chat_messages)").all();
  const chatColumnNames = chatColumns.map((col: any) => col.name);

  const needsMigration =
    !chatColumnNames.includes("message_type") ||
    !chatColumnNames.includes("target") ||
    !chatColumnNames.includes("metadata");

  if (!needsMigration) return;

  db.exec("BEGIN TRANSACTION;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages_new (
      id          TEXT PRIMARY KEY,
      session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      sender      TEXT NOT NULL,
      text        TEXT NOT NULL,
      timestamp   INTEGER NOT NULL,
      message_type TEXT NOT NULL DEFAULT 'text',
      target      TEXT,
      metadata    TEXT,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);
  db.exec(`
    INSERT INTO chat_messages_new (id, session_id, sender, text, timestamp, message_type, target, metadata, created_at)
    SELECT id, session_id, sender, text, timestamp, 'text', NULL, NULL, created_at
    FROM chat_messages;
  `);
  db.exec(`DROP TABLE chat_messages;`);
  db.exec(`ALTER TABLE chat_messages_new RENAME TO chat_messages;`);
  db.exec("COMMIT;");
}