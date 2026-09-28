export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  isOnline: boolean;
}

export interface RoomSnapshot {
  code: string;
  players: Player[];
  hostId: string;
  started: boolean;
  createdAt: number;
}

export type RoomActionResult =
  | { ok: true; room: RoomSnapshot }
  | { ok: false; message: string };

export interface ClientToServerEvents {
  "room:create": (
    payload: { nickname: string; sessionId: string },
    acknowledge: (result: RoomActionResult) => void
  ) => void;
  "room:join": (
    payload: { code: string; nickname: string; sessionId: string },
    acknowledge: (result: RoomActionResult) => void
  ) => void;
  "room:reconnect": (
    payload: { code: string; sessionId: string },
    acknowledge: (result: RoomActionResult) => void
  ) => void;
  "room:start": (
    payload: { code: string; sessionId: string },
    acknowledge: (result: RoomActionResult) => void
  ) => void;
  "room:leave": (payload: { code: string; sessionId: string }) => void;
}

export interface ServerToClientEvents {
  "room:state": (room: RoomSnapshot) => void;
}
