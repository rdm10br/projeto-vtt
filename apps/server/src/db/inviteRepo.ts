import db from "./connection.js";
import { generateCode } from "./idGenerators.js";
import type { InviteCode, CreateInviteOptions } from "./types.js";

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

// Usado só pelo backupRepo, pra restaurar o use_count exato de um backup importado.
export function setInviteUseCount(code: string, useCount: number): void {
  db.prepare("UPDATE invite_codes SET use_count = ? WHERE code = ?").run(useCount, code);
}