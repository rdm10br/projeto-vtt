// Mapeia session_id -> scene_id da última cena "empurrada" via SCENE_PUSH pelo GM.
// Usado para reconectar jogadores na cena certa ao entrarem/reentrarem na sessão.
export const activeScenesPerSession = new Map<string, string>();