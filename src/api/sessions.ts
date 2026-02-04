import { PlayerSession, createPlayerSession } from '../game/player-session';

interface PlayerData {
  session: PlayerSession;
  connected: boolean;
  lastSeen: number;
}

export class SessionManager {
  private sessions = new Map<string, PlayerData>();
  private nextId = 1;

  createSession(): string {
    const playerId = `player-${this.nextId++}`;
    const session = createPlayerSession(playerId, 100000);
    this.sessions.set(playerId, {
      session,
      connected: true,
      lastSeen: Date.now(),
    });
    return playerId;
  }

  getSession(playerId: string): PlayerSession | undefined {
    return this.sessions.get(playerId)?.session;
  }

  updateLastSeen(playerId: string): void {
    const data = this.sessions.get(playerId);
    if (data) data.lastSeen = Date.now();
  }

  cleanup(maxAge = 3600000): void {
    const now = Date.now();
    for (const [id, data] of this.sessions.entries()) {
      if (now - data.lastSeen > maxAge) {
        this.sessions.delete(id);
      }
    }
  }
}

export const sessionManager = new SessionManager();
