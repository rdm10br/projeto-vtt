const NICKNAME_KEY = "vtt_nickname";

export function getSavedNickname(): string | null {
  return localStorage.getItem(NICKNAME_KEY);
}

export function saveNickname(nickname: string): void {
  localStorage.setItem(NICKNAME_KEY, nickname);
}

export function clearNickname(): void {
  localStorage.removeItem(NICKNAME_KEY);
}