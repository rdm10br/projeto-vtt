import type { InviteCodeSummary } from "../../../../packages/protocol";
import type { InviteCode } from "../db.js";

export function toInviteSummary(inv: InviteCode | undefined | null): InviteCodeSummary | null {
  if (!inv) return null;
  return {
    code: inv.code,
    role: inv.role,
    use_count: inv.use_count,
    max_uses: inv.max_uses,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
  };
}