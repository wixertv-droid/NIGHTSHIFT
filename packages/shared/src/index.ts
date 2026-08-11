export type GameStatus = "LOBBY" | "BRIEFING" | "INVESTIGATION" | "FINALE";
export type PlayerRole = "INSIDER" | "ANALYST";

export interface Player {
  id: string;
  name: string;
  host: boolean;
  role: PlayerRole;
}

export interface GameRoom {
  code: string;
  players: Player[];
  status: GameStatus;
  chapter: number;
}
