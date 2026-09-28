import cors from "cors";
import express from "express";
import { createServer } from "node:http";
import { randomInt } from "node:crypto";
import { Server } from "socket.io";
import type {
  ClientToServerEvents,
  Player,
  RoomActionResult,
  RoomSnapshot,
  ServerToClientEvents
} from "@rocky/shared";

interface RoomPlayer extends Player {
  sessionId: string;
  socketId: string | null;
}

interface Room extends RoomSnapshot {
  players: RoomPlayer[];
}

const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const app = express();
app.use(cors({ origin: allowedOrigins }));
app.get("/health", (_request, response) => {
  response.json({ status: "ok" });
});

const httpServer = createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"] }
});

const rooms = new Map<string, Room>();
const disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const roomCodeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const disconnectGracePeriodMs = 60_000;

function createRoomCode(): string {
  let code = "";
  do {
    code = Array.from({ length: 6 }, () =>
      roomCodeAlphabet[randomInt(roomCodeAlphabet.length)]
    ).join("");
  } while (rooms.has(code));
  return code;
}

function getSnapshot(room: Room): RoomSnapshot {
  return {
    code: room.code,
    players: room.players.map(({ id, nickname, isHost, isOnline }) => ({
      id,
      nickname,
      isHost,
      isOnline
    })),
    hostId: room.hostId,
    started: room.started,
    createdAt: room.createdAt
  };
}

function broadcastRoom(room: Room): void {
  io.to(room.code).emit("room:state", getSnapshot(room));
}

function findPlayerBySession(sessionId: string): { room: Room; player: RoomPlayer } | undefined {
  for (const room of rooms.values()) {
    const player = room.players.find((candidate) => candidate.sessionId === sessionId);
    if (player) return { room, player };
  }
  return undefined;
}

function cleanNickname(input: string): string | undefined {
  const nickname = input.trim();
  if (nickname.length < 1 || nickname.length > 18) return undefined;
  if (/[\u0000-\u001f\u007f]/.test(nickname)) return undefined;
  return nickname;
}

function fail(message: string): RoomActionResult {
  return { ok: false, message };
}

function succeed(room: Room): RoomActionResult {
  return { ok: true, room: getSnapshot(room) };
}

function attachPlayer(socketId: string, room: Room, player: RoomPlayer): void {
  const timer = disconnectTimers.get(player.sessionId);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(player.sessionId);
  player.socketId = socketId;
  player.isOnline = true;
  io.sockets.sockets.get(socketId)?.join(room.code);
}

function removePlayer(room: Room, player: RoomPlayer): void {
  const index = room.players.findIndex((candidate) => candidate.sessionId === player.sessionId);
  if (index < 0) return;
  room.players.splice(index, 1);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === player.id) {
    const nextHost = room.players.find((candidate) => candidate.isOnline) ?? room.players[0];
    nextHost.isHost = true;
    room.hostId = nextHost.id;
  }
  broadcastRoom(room);
}

io.on("connection", (socket) => {
  socket.on("room:create", ({ nickname: rawNickname, sessionId }, acknowledge) => {
    const nickname = cleanNickname(rawNickname);
    if (!nickname) {
      acknowledge(fail("Choose a nickname between 1 and 18 characters."));
      return;
    }
    if (!sessionId || sessionId.length > 100) {
      acknowledge(fail("Your player session is invalid. Refresh the page and try again."));
      return;
    }
    if (findPlayerBySession(sessionId)) {
      acknowledge(fail("This browser already has an active room. Leave it before creating another."));
      return;
    }

    const playerId = sessionId;
    const code = createRoomCode();
    const player: RoomPlayer = {
      id: playerId,
      sessionId,
      nickname,
      isHost: true,
      isOnline: true,
      socketId: socket.id
    };
    const room: Room = {
      code,
      players: [player],
      hostId: playerId,
      started: false,
      createdAt: Date.now()
    };
    rooms.set(code, room);
    socket.join(code);
    acknowledge(succeed(room));
    broadcastRoom(room);
  });

  socket.on("room:join", ({ code: rawCode, nickname: rawNickname, sessionId }, acknowledge) => {
    const code = rawCode.trim().toUpperCase();
    const nickname = cleanNickname(rawNickname);
    if (!nickname) {
      acknowledge(fail("Choose a nickname between 1 and 18 characters."));
      return;
    }
    if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/.test(code)) {
      acknowledge(fail("Enter a valid six-character room code."));
      return;
    }
    if (!sessionId || sessionId.length > 100) {
      acknowledge(fail("Your player session is invalid. Refresh the page and try again."));
      return;
    }
    if (findPlayerBySession(sessionId)) {
      acknowledge(fail("This browser already has an active room. Leave it before joining another."));
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      acknowledge(fail("We couldn't find that room. Check the code and try again."));
      return;
    }
    if (room.started) {
      acknowledge(fail("That journey has already started."));
      return;
    }
    if (room.players.some((player) => player.nickname.toLowerCase() === nickname.toLowerCase())) {
      acknowledge(fail("That nickname is already in use in this room."));
      return;
    }
    if (room.players.length >= 8) {
      acknowledge(fail("That room is full. The journey can have up to 8 players."));
      return;
    }

    const player: RoomPlayer = {
      id: sessionId,
      sessionId,
      nickname,
      isHost: false,
      isOnline: true,
      socketId: socket.id
    };
    room.players.push(player);
    socket.join(code);
    acknowledge(succeed(room));
    broadcastRoom(room);
  });

  socket.on("room:reconnect", ({ code: rawCode, sessionId }, acknowledge) => {
    const code = rawCode.trim().toUpperCase();
    const room = rooms.get(code);
    const player = room?.players.find((candidate) => candidate.sessionId === sessionId);
    if (!room || !player) {
      acknowledge(fail("Your previous room is no longer available. Create or join a room."));
      return;
    }
    attachPlayer(socket.id, room, player);
    acknowledge(succeed(room));
    broadcastRoom(room);
  });

  socket.on("room:start", ({ code: rawCode, sessionId }, acknowledge) => {
    const room = rooms.get(rawCode.trim().toUpperCase());
    const player = room?.players.find((candidate) => candidate.sessionId === sessionId);
    if (!room || !player || !player.isOnline || player.socketId !== socket.id) {
      acknowledge(fail("You are no longer connected to that room."));
      return;
    }
    if (room.hostId !== player.id) {
      acknowledge(fail("Only the host can start the journey."));
      return;
    }
    if (room.players.length < 2) {
      acknowledge(fail("At least 2 players are needed to start."));
      return;
    }
    room.started = true;
    acknowledge(succeed(room));
    broadcastRoom(room);
  });

  socket.on("room:leave", ({ code: rawCode, sessionId }) => {
    const room = rooms.get(rawCode.trim().toUpperCase());
    const player = room?.players.find((candidate) => candidate.sessionId === sessionId);
    if (room && player) {
      const timer = disconnectTimers.get(sessionId);
      if (timer) clearTimeout(timer);
      disconnectTimers.delete(sessionId);
      socket.leave(room.code);
      removePlayer(room, player);
    }
  });

  socket.on("disconnect", () => {
    let match: { room: Room; player: RoomPlayer } | undefined;
    for (const room of rooms.values()) {
      const player = room.players.find((candidate) => candidate.socketId === socket.id);
      if (player) {
        match = { room, player };
        break;
      }
    }
    if (!match) return;

    const { room, player } = match;
    player.isOnline = false;
    player.socketId = null;
    broadcastRoom(room);

    const timer = setTimeout(() => {
      disconnectTimers.delete(player.sessionId);
      removePlayer(room, player);
    }, disconnectGracePeriodMs);
    disconnectTimers.set(player.sessionId, timer);
  });
});

httpServer.listen(port, () => {
  console.log(`Rocky game server listening on port ${port}`);
});
