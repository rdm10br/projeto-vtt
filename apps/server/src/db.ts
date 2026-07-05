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

  CREATE TABLE IF NOT EXISTS chat_messages (
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

const chatColumns = db.prepare("PRAGMA table_info(chat_messages)").all();
const chatColumnNames = chatColumns.map((col: any) => col.name);
if (!chatColumnNames.includes("message_type") || !chatColumnNames.includes("target") || !chatColumnNames.includes("metadata")) {
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
  db.exec(`
    DROP TABLE chat_messages;
  `);
  db.exec(`
    ALTER TABLE chat_messages_new RENAME TO chat_messages;
  `);
  db.exec("COMMIT;");
}

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

export type Session = { id: string; name: string; owner_id: string; created_at: number };

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

export type ChatMessage = {
  id: string;
  session_id: string;
  sender: string;
  text: string;
  timestamp: number;
  message_type: "text" | "roll" | "whisper" | "secret" | "system";
  target?: string;
  metadata?: Record<string, unknown>;
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
  return db.prepare("SELECT id, name, owner_id, created_at FROM sessions WHERE id = ?").get(id) as Session | undefined;
}

export function getSessionByName(name: string): Session | undefined {
  return db.prepare("SELECT id, name, owner_id, created_at FROM sessions WHERE name = ?").get(name) as Session | undefined;
}

export function createSession(name: string, ownerId: string): Session {
  const id = generateId("sess");
  const createdAt = Math.floor(Date.now() / 1000);
  db.prepare("INSERT INTO sessions (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)").run(id, name, ownerId, createdAt);
  return { id, name, owner_id: ownerId, created_at: createdAt };
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
    SELECT u.id, u.nickname, m.role, m.created_at
    FROM memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.session_id = ?
    ORDER BY m.created_at
  `).all(sessionId) as { id: string; nickname: string; role: Role; created_at: number }[];
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
  ).all(sessionId) as { id: string; name: string; is_visible: number; created_at: number }[];
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
  ).all(sceneId) as { id: string; x: number; y: number; created_at: number }[];
}

export function getTokensForSession(sessionId: string) {
  return db.prepare(
    `SELECT t.x, t.y, t.created_at, s.name AS scene_name
     FROM tokens t
     JOIN scenes s ON s.id = t.scene_id
     WHERE s.session_id = ?
     ORDER BY t.id`
  ).all(sessionId) as { scene_name: string; x: number; y: number; created_at: number }[];
}

export function moveToken(id: string, x: number, y: number) {
  db.prepare(
    "UPDATE tokens SET x = ?, y = ?, updated_at = unixepoch() WHERE id = ?"
  ).run(x, y, id);
}

export function deleteToken(id: string) {
  db.prepare("DELETE FROM tokens WHERE id = ?").run(id);
}

export function createChatMessage(
  sessionId: string,
  sender: string,
  text: string,
  timestamp: number,
  message_type: "text" | "roll" | "whisper" | "secret" | "system" = "text",
  target?: string,
  metadata?: Record<string, any>
) {
  const id = generateId("chat");
  db.prepare(
    "INSERT INTO chat_messages (id, session_id, sender, text, timestamp, message_type, target, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).run(id, sessionId, sender, text, timestamp, message_type, target ?? null, metadata ? JSON.stringify(metadata) : null);
  return getChatMessage(id)!;
}

export function getChatMessage(id: string) {
  const row = db.prepare("SELECT * FROM chat_messages WHERE id = ?").get(id) as
    | {
        id: string;
        session_id: string;
        sender: string;
        text: string;
        timestamp: number;
        message_type: "text" | "roll" | "whisper" | "secret" | "system";
        target: string | null;
        metadata: string | null;
        created_at: number;
      }
    | undefined;
  if (!row) return undefined;
  return {
    id: row.id,
    session_id: row.session_id,
    sender: row.sender,
    text: row.text,
    timestamp: row.timestamp,
    message_type: row.message_type,
    target: row.target ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    created_at: row.created_at,
  } as ChatMessage;
}

export function getChatMessagesForSession(sessionId: string, role?: Role, requester?: string) {
  const rows = db.prepare(
    "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC"
  ).all(sessionId).map((row: any) => ({
    ...row,
    target: row.target ?? undefined,
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
  })) as ChatMessage[];

  if (!role || role === "gm") {
    return rows;
  }

  const requesterName = requester?.toLowerCase() ?? "";
  return rows.filter((message) => {
    if (message.message_type === "secret") {
      return false;
    }
    if (message.message_type === "whisper") {
      return (
        message.sender.toLowerCase() === requesterName ||
        message.target?.toLowerCase() === requesterName
      );
    }
    return true;
  });
}

export type SessionBackup = {
  session_name: string;
  owner_nickname: string;
  members: { nickname: string; role: Role; created_at: number }[];
  invite_codes: { role: Role; use_count: number; max_uses: number | null; expires_at: number | null; created_at: number }[];
  scenes: { name: string; is_visible: boolean; created_at: number }[];
  tokens: { scene_name: string; x: number; y: number; created_at: number }[];
  chat_messages: { sender: string; text: string; timestamp: number; created_at: number }[];
  created_at: number;
};

export function getSessionBackup(sessionId: string) {
  const session = getSession(sessionId);
  if (!session) return undefined;

  const owner = getUserById(session.owner_id);
  if (!owner) return undefined;

  return {
    session_name: session.name,
    owner_nickname: owner.nickname,
    members: getMembersForSession(sessionId).map((m) => ({
      nickname: m.nickname,
      role: m.role,
      created_at: m.created_at,
    })),
    invite_codes: getInviteCodesForSession(sessionId).map((inv) => ({
      role: inv.role,
      use_count: inv.use_count,
      max_uses: inv.max_uses,
      expires_at: inv.expires_at,
      created_at: inv.created_at,
    })),
    scenes: getScenesForSession(sessionId).map((scene) => ({
      name: scene.name,
      is_visible: scene.is_visible === 1,
      created_at: scene.created_at,
    })),
    tokens: getTokensForSession(sessionId),
    chat_messages: db.prepare(
      "SELECT sender, text, timestamp, created_at FROM chat_messages WHERE session_id = ? ORDER BY timestamp ASC"
    ).all(sessionId) as { sender: string; text: string; timestamp: number; created_at: number }[],
    created_at: session.created_at,
  };
}

export function getOrCreateUserByNickname(nickname: string) {
  const existing = getUserByNickname(nickname);
  return existing ?? createUser(nickname);
}

export function importSessionBackup(backup: SessionBackup, targetName?: string) {
  const baseName = (targetName?.trim() || backup.session_name).trim();
  let name = baseName;
  let suffix = 1;
  while (getSessionByName(name)) {
    name = `${baseName}-${suffix}`;
    suffix += 1;
  }

  const owner = getOrCreateUserByNickname(backup.owner_nickname);
  const session = createSession(name, owner.id);
  createMembership(owner.id, session.id, 'gm');

  const userIds = new Map<string, string>();
  userIds.set(owner.nickname, owner.id);

  for (const member of backup.members) {
    if (member.nickname === owner.nickname) continue;
    const user = getOrCreateUserByNickname(member.nickname);
    userIds.set(user.nickname, user.id);
    createMembership(user.id, session.id, member.role);
  }

  const sceneIds = new Map<string, string>();
  for (const scene of backup.scenes) {
    const created = createScene(session.id, scene.name);
    if (scene.is_visible) setSceneVisibility(created.id, true);
    sceneIds.set(scene.name, created.id);
  }

  for (const token of backup.tokens) {
    const sceneId = sceneIds.get(token.scene_name);
    if (!sceneId) continue;
    createToken(sceneId, token.x, token.y);
  }

  for (const message of backup.chat_messages) {
    getOrCreateUserByNickname(message.sender);
    createChatMessage(session.id, message.sender, message.text, message.timestamp);
  }

  const codes: string[] = [];
  for (const invite of backup.invite_codes) {
    const code = createInviteCode({
      sessionId: session.id,
      role: invite.role,
      createdBy: owner.id,
      maxUses: invite.max_uses ?? undefined,
      expiresAt: invite.expires_at ?? undefined,
    });
    if (invite.use_count > 0) {
      db.prepare("UPDATE invite_codes SET use_count = ? WHERE code = ?").run(invite.use_count, code);
    }
    codes.push(code);
  }

  return { session, invite_codes: codes };
}

export default db;