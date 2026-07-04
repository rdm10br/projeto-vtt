import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(__dirname, "../../../../data/vtt.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    code        TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK(role IN ('gm', 'player')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS members (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    nickname    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK(role IN ('gm', 'player')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS scenes (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    is_visible  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS tokens (
    id          TEXT PRIMARY KEY,
    scene_id    TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    x           REAL NOT NULL,
    y           REAL NOT NULL,
    updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// --- ID helpers ---

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Código curto legível para convites (ex: "XKCD42")
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

// --- Sessions ---

export function createSession(name: string) {
  const id = generateId("sess");
  db.prepare("INSERT INTO sessions (id, name) VALUES (?, ?)").run(id, name);
  return getSession(id)!;
}

export function getSession(id: string) {
  return db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
    | { id: string; name: string; created_at: number }
    | undefined;
}

// --- Invite codes ---

export function createInviteCode(sessionId: string, role: "gm" | "player") {
  // Garante código único
  let code = generateCode();
  while (getInviteCode(code)) {
    code = generateCode();
  }
  db.prepare(
    "INSERT INTO invite_codes (code, session_id, role) VALUES (?, ?, ?)"
  ).run(code, sessionId, role);
  return code;
}

export function getInviteCode(code: string) {
  return db.prepare("SELECT * FROM invite_codes WHERE code = ?").get(code) as
    | { code: string; session_id: string; role: "gm" | "player" }
    | undefined;
}

export type InviteCodes = {
  player: string;
  gm: string;
};

export function getInviteCodesForSession(sessionId: string): InviteCodes {
  const rows = db
    .prepare("SELECT * FROM invite_codes WHERE session_id = ?")
    .all(sessionId) as { code: string; role: "gm" | "player" }[];

  const result: Partial<InviteCodes> = {};
  for (const row of rows) {
    result[row.role] = row.code;
  }
  return result as InviteCodes;
}

// --- Members ---

export function createMember(
  sessionId: string,
  nickname: string,
  role: "gm" | "player"
) {
  const id = generateId("member");
  db.prepare(
    "INSERT INTO members (id, session_id, nickname, role) VALUES (?, ?, ?, ?)"
  ).run(id, sessionId, nickname, role);
  return { id, session_id: sessionId, nickname, role };
}

// --- Scenes ---

export function createScene(sessionId: string, name: string) {
  const id = generateId("scene");
  db.prepare(
    "INSERT INTO scenes (id, session_id, name) VALUES (?, ?, ?)"
  ).run(id, sessionId, name);
  return getScene(id)!;
}

export function getScene(id: string) {
  return db
    .prepare("SELECT * FROM scenes WHERE id = ?")
    .get(id) as
    | { id: string; session_id: string; name: string; is_visible: number }
    | undefined;
}

export function getScenesForSession(sessionId: string) {
  return db
    .prepare(
      "SELECT * FROM scenes WHERE session_id = ? ORDER BY created_at"
    )
    .all(sessionId) as { id: string; name: string; is_visible: number }[];
}

export function getVisibleScenes(sessionId: string) {
  return db
    .prepare(
      "SELECT * FROM scenes WHERE session_id = ? AND is_visible = 1 ORDER BY created_at"
    )
    .all(sessionId) as { id: string; name: string; is_visible: number }[];
}

export function setSceneVisibility(sceneId: string, visible: boolean) {
  db.prepare("UPDATE scenes SET is_visible = ? WHERE id = ?").run(
    visible ? 1 : 0,
    sceneId
  );
}

// --- Tokens ---

export function createToken(sceneId: string, x: number, y: number) {
  const id = generateId("token");
  db.prepare(
    "INSERT INTO tokens (id, scene_id, x, y) VALUES (?, ?, ?, ?)"
  ).run(id, sceneId, x, y);
  return getToken(id)!;
}

export function getToken(id: string) {
  return db.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as
    | { id: string; scene_id: string; x: number; y: number }
    | undefined;
}

export function getTokensForScene(sceneId: string) {
  return db
    .prepare("SELECT * FROM tokens WHERE scene_id = ? ORDER BY id")
    .all(sceneId) as { id: string; x: number; y: number }[];
}

export function moveToken(id: string, x: number, y: number) {
  db.prepare(
    "UPDATE tokens SET x = ?, y = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(x, y, id);
}

export function deleteToken(id: string) {
  db.prepare("DELETE FROM tokens WHERE id = ?").run(id);
}

export default db;