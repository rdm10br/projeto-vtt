import db from "./connection.js";
import { generateId } from "./idGenerators.js";

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