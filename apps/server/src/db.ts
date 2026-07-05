import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(__dirname, "../../../../data/vtt.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    nickname    TEXT NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    owner_id    TEXT NOT NULL REFERENCES users(id),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS memberships (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK(role IN ('gm', 'player', 'viewer')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(user_id, session_id)
  );

  CREATE TABLE IF NOT EXISTS invite_codes (
    code        TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role        TEXT NOT NULL CHECK(role IN ('gm', 'player', 'viewer')),
    created_by  TEXT NOT NULL REFERENCES users(id),
    use_count   INTEGER NOT NULL DEFAULT 0,
    max_uses    INTEGER,
    expires_at  INTEGER,
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

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

// --- Types ---

export type Role = "gm" | "player" | "viewer";

export type User = { id: string; nickname: string };

export type Session = { id: string; name: string; owner_id: string };

export type Membership = {
  id: string;
  user_id: string;
  session_id: string;
  role: Role;
};

export type InviteCode = {
  code: string;
  session_id: string;
  role: Role;
  created_by: string;
  use_count: number;
  max_uses: number | null;
  expires_at: number | null;
  created_at: number;
};

// --- Users ---

export function getUserById(id: string): User | undefined {
  return db.prepare("SELECT id, nickname FROM users WHERE id = ?").get(id) as User | undefined;
}

export function getUserByNickname(nickname: string): User | undefined {
  return db.prepare("SELECT id, nickname FROM users WHERE nickname = ?").get(nickname) as User | undefined;
}

export function createUser(nickname: string): User {
  const id = generateId("user");
  db.prepare("INSERT INTO users (id, nickname) VALUES (?, ?)").run(id, nickname);
  return { id, nickname };
}

// --- Sessions ---

export function getSession(id: string): Session | undefined {
  return db.prepare("SELECT id, name, owner_id FROM sessions WHERE id = ?").get(id) as Session | undefined;
}

export function getSessionByName(name: string): Session | undefined {
  return db.prepare("SELECT id, name, owner_id FROM sessions WHERE name = ?").get(name) as Session | undefined;
}

export function createSession(name: string, ownerId: string): Session {
  const id = generateId("sess");
  db.prepare("INSERT INTO sessions (id, name, owner_id) VALUES (?, ?, ?)").run(id, name, ownerId);
  return { id, name, owner_id: ownerId };
}

export function getSessionsForUser(userId: string) {
  return db.prepare(`
    SELECT s.id, s.name, s.owner_id, m.role
    FROM memberships m
    JOIN sessions s ON s.id = m.session_id
    WHERE m.user_id = ?
    ORDER BY m.created_at
  `).all(userId) as { id: string; name: string; owner_id: string; role: Role }[];
}

// --- Memberships ---

export function getMembership(userId: string, sessionId: string): Membership | undefined {
  return db.prepare(
    "SELECT * FROM memberships WHERE user_id = ? AND session_id = ?"
  ).get(userId, sessionId) as Membership | undefined;
}

export function createMembership(userId: string, sessionId: string, role: Role): Membership {
  const id = generateId("memb");
  db.prepare(
    "INSERT INTO memberships (id, user_id, session_id, role) VALUES (?, ?, ?, ?)"
  ).run(id, userId, sessionId, role);
  return { id, user_id: userId, session_id: sessionId, role };
}

export function getMembersForSession(sessionId: string) {
  return db.prepare(`
    SELECT u.id, u.nickname, m.role
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.session_id = ?
    ORDER BY m.created_at
  `).all(sessionId) as { id: string; nickname: string; role: Role }[];
}

// --- Invite codes ---

export type CreateInviteOptions = {
  sessionId: string;
  role: Role;
  createdBy: string;
  maxUses?: number;
  expiresAt?: number; // unix timestamp
};

export function createInviteCode(opts: CreateInviteOptions): string {
  let code = generateCode();
  while (getInviteCode(code)) code = generateCode();
  db.prepare(`
    INSERT INTO invite_codes (code, session_id, role, created_by, max_uses, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(code, opts.sessionId, opts.role, opts.createdBy, opts.maxUses ?? null, opts.expiresAt ?? null);
  return code;
}

export function getInviteCode(code: string): InviteCode | undefined {
  return db.prepare("SELECT * FROM invite_codes WHERE code = ?").get(code) as InviteCode | undefined;
}

export function getInviteCodesForSession(sessionId: string): InviteCode[] {
  return db.prepare(
    "SELECT * FROM invite_codes WHERE session_id = ? ORDER BY created_at DESC"
  ).all(sessionId) as InviteCode[];
}

export function useInviteCode(code: string): boolean {
  // Verifica validade antes de usar
  const invite = getInviteCode(code);
  if (!invite) return false;

  const now = Math.floor(Date.now() / 1000);
  if (invite.expires_at && invite.expires_at < now) return false;
  if (invite.max_uses !== null && invite.use_count >= invite.max_uses) return false;

  db.prepare("UPDATE invite_codes SET use_count = use_count + 1 WHERE code = ?").run(code);
  return true;
}

export function deleteInviteCode(code: string): void {
  db.prepare("DELETE FROM invite_codes WHERE code = ?").run(code);
}

// --- Scenes ---

export function createScene(sessionId: string, name: string) {
  const id = generateId("scene");
  db.prepare("INSERT INTO scenes (id, session_id, name) VALUES (?, ?, ?)").run(id, sessionId, name);
  return getScene(id)!;
}

export function getScene(id: string) {
  return db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as
    | { id: string; session_id: string; name: string; is_visible: number }
    | undefined;
}

export function getScenesForSession(sessionId: string) {
  return db.prepare(
    "SELECT * FROM scenes WHERE session_id = ? ORDER BY created_at"
  ).all(sessionId) as { id: string; name: string; is_visible: number }[];
}

export function getVisibleScenes(sessionId: string) {
  return db.prepare(
    "SELECT * FROM scenes WHERE session_id = ? AND is_visible = 1 ORDER BY created_at"
  ).all(sessionId) as { id: string; name: string; is_visible: number }[];
}

export function setSceneVisibility(sceneId: string, visible: boolean) {
  db.prepare("UPDATE scenes SET is_visible = ? WHERE id = ?").run(visible ? 1 : 0, sceneId);
}

// --- Tokens ---

export function createToken(sceneId: string, x: number, y: number) {
  const id = generateId("token");
  db.prepare("INSERT INTO tokens (id, scene_id, x, y) VALUES (?, ?, ?, ?)").run(id, sceneId, x, y);
  return getToken(id)!;
}

export function getToken(id: string) {
  return db.prepare("SELECT * FROM tokens WHERE id = ?").get(id) as
    | { id: string; scene_id: string; x: number; y: number }
    | undefined;
}

export function getTokensForScene(sceneId: string) {
  return db.prepare(
    "SELECT * FROM tokens WHERE scene_id = ? ORDER BY id"
  ).all(sceneId) as { id: string; x: number; y: number }[];
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