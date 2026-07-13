import db from "./connection.js";
import { generateId } from "./idGenerators.js";
import type { Session, Role } from "./types.js";

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