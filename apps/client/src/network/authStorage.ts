const NICKNAME_KEY = "vtt_nickname";
const REMEMBER_KEY = "vtt_remember_login";
const BOOT_ID_KEY = "vtt_boot_id";

// Por padrão, lembra o login (mantém o comportamento que já existia antes
// desse toggle ser adicionado) — a pessoa precisa desmarcar explicitamente.
export function isRememberEnabled(): boolean {
  const stored = localStorage.getItem(REMEMBER_KEY);
  return stored === null ? true : stored === "true";
}

export function setRememberEnabled(value: boolean): void {
  localStorage.setItem(REMEMBER_KEY, String(value));
  if (!value) {
    // Desligou a preferência: não faz sentido manter resíduo salvo.
    clearNickname();
    clearBootId();
  }
}

export function getSavedNickname(): string | null {
  return localStorage.getItem(NICKNAME_KEY);
}

export function saveNickname(nickname: string): void {
  if (!isRememberEnabled()) return;
  localStorage.setItem(NICKNAME_KEY, nickname);
}

export function clearNickname(): void {
  localStorage.removeItem(NICKNAME_KEY);
}

export function getSavedBootId(): string | null {
  return localStorage.getItem(BOOT_ID_KEY);
}

export function saveBootId(bootId: string): void {
  if (!isRememberEnabled()) return;
  localStorage.setItem(BOOT_ID_KEY, bootId);
}

export function clearBootId(): void {
  localStorage.removeItem(BOOT_ID_KEY);
}