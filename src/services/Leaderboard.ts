/**
 * Leaderboard behind an interface so an online backend (Supabase) can be plugged in later.
 * The local version keeps the top N entries in localStorage and works fully offline.
 */

export interface LeaderboardEntry {
  team: string;
  score: number;
  players: number;
  date: string; // ISO
}

export interface Leaderboard {
  top(n?: number): Promise<LeaderboardEntry[]>;
  submit(entry: LeaderboardEntry): Promise<{ rank: number | null }>;
  best(): Promise<number>;
}

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'keepitup.leaderboard.v1';

export class LocalLeaderboard implements Leaderboard {
  constructor(
    private readonly storeOverride?: KeyValueStore,
    private readonly maxEntries = 10,
  ) {}

  // Resolved lazily so importing this module never touches localStorage (tests, SSR).
  private get store(): KeyValueStore {
    return this.storeOverride ?? globalThis.localStorage;
  }

  private read(): LeaderboardEntry[] {
    try {
      const raw = this.store.getItem(KEY);
      const parsed = raw ? (JSON.parse(raw) as LeaderboardEntry[]) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private write(list: LeaderboardEntry[]): void {
    try {
      this.store.setItem(KEY, JSON.stringify(list));
    } catch {
      // Storage full / disabled — the leaderboard is a nice-to-have, never crash the game.
    }
  }

  async top(n = this.maxEntries): Promise<LeaderboardEntry[]> {
    return this.read().slice(0, n);
  }

  async submit(entry: LeaderboardEntry): Promise<{ rank: number | null }> {
    const list = this.read();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const trimmed = list.slice(0, this.maxEntries);
    this.write(trimmed);
    const idx = trimmed.indexOf(entry);
    return { rank: idx >= 0 ? idx + 1 : null };
  }

  async best(): Promise<number> {
    return this.read()[0]?.score ?? 0;
  }

  /** Would this score make the board? Used to decide whether to show name entry. */
  async qualifies(score: number): Promise<boolean> {
    const list = this.read();
    return score > 0 && (list.length < this.maxEntries || score > list[list.length - 1].score);
  }
}

/**
 * Placeholder for the online leaderboard (later phase).
 * Implement with @supabase/supabase-js and fall back to LocalLeaderboard when offline.
 */
export class SupabaseLeaderboard implements Leaderboard {
  async top(): Promise<LeaderboardEntry[]> {
    throw new Error('SupabaseLeaderboard not implemented yet');
  }
  async submit(): Promise<{ rank: number | null }> {
    throw new Error('SupabaseLeaderboard not implemented yet');
  }
  async best(): Promise<number> {
    throw new Error('SupabaseLeaderboard not implemented yet');
  }
}

export const leaderboard = new LocalLeaderboard();
