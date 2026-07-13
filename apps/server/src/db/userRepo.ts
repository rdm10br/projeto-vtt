import db from "./connection.js";
import { generateId } from "./idGenerators.js";
import type { User } from "./types.js";

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

export function getOrCreateUserByNickname(nickname: string): User {
  const existing = getUserByNickname(nickname);
  return existing ?? createUser(nickname);
}