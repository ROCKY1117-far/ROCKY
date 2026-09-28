# Rocky — The Journey

PC-first multiplayer story game. The current milestone implements room creation, joining, and the live lobby; gameplay is intentionally a later phase.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

1. Copy `.env.example` to `.env` if you need to change the server port or allowed client origin.
2. Run `npm install`.
3. Run `npm run dev`.
4. Open `http://localhost:5173` in separate browsers or computers. For remote players, expose the Vite client and Socket.IO server on reachable addresses and set the server's `CLIENT_ORIGIN` accordingly.

The client uses `VITE_SERVER_URL` to connect to the Socket.IO server; it defaults to `http://localhost:3001`. The server exposes `/health` for hosting checks. For deployment, set `PORT`, `CLIENT_ORIGIN`, and `VITE_SERVER_URL` to the host-provided values.

## Architecture

- `client/`: React, TypeScript, and Vite desktop interface; Socket.IO client for live room updates.
- `server/`: Express health endpoint and authoritative Socket.IO room handling. Rooms currently live in server memory and are lost when the process restarts.
- `shared/`: Typed room snapshots and Socket.IO event contracts shared between browser and server.

The server validates room codes, nickname uniqueness, room capacity, membership, reconnects, and host-only game start. A disconnected player remains reserved for 60 seconds to allow a reconnect. This in-memory lobby does not yet require a database; persistent accounts, room history, and cross-process room recovery would need storage in a later deployment phase.

## Development phases

1. Inspect the project and settle the architecture.
2. Build room creation, joining, and the real-time lobby; verify players can share a room.
3. Add the server-authoritative scenario, voting, timer, and stat engine.
4. Add the five stages and 27 scenarios.
5. Add progression, animations, sound, stage transitions, and the ending.
6. Test and polish the full game.
7. Prepare production deployment.

Run `npm run typecheck` and `npm run build` to validate all workspaces.
