let lastSuccessfulLocalAuthAt = 0;

const RECENT_LOCAL_AUTH_WINDOW_MS = 20 * 1000;

export function noteSuccessfulLocalAuth(at = Date.now()): void {
  lastSuccessfulLocalAuthAt = at;
}

export function hasRecentLocalAuth(now = Date.now()): boolean {
  return now - lastSuccessfulLocalAuthAt < RECENT_LOCAL_AUTH_WINDOW_MS;
}
