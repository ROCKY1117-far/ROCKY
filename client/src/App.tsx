import { useCallback, useEffect, useMemo, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  GraduationCap,
  Heart,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Radio,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import type {
  ClientToServerEvents,
  RoomActionResult,
  RoomSnapshot,
  ServerToClientEvents
} from "@rocky/shared";

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type Screen = "home" | "create" | "join" | "lobby";
type SavedSession = { sessionId: string; roomCode: string; nickname: string };

const serverUrl = import.meta.env.VITE_SERVER_URL ?? "http://localhost:3001";
const sessionStorageKey = "rocky-player-session";

function readSession(): SavedSession | undefined {
  try {
    const raw = window.localStorage.getItem(sessionStorageKey);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (
      typeof parsed.sessionId === "string" &&
      typeof parsed.roomCode === "string" &&
      typeof parsed.nickname === "string"
    ) {
      return parsed as SavedSession;
    }
  } catch (error) {
    console.error("Could not restore the player session.", error);
  }
  return undefined;
}

function App() {
  const [socket, setSocket] = useState<TypedSocket>();
  const [connected, setConnected] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [room, setRoom] = useState<RoomSnapshot>();
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [session, setSession] = useState<SavedSession>();
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const connection = io(serverUrl, { autoConnect: true, reconnection: true });
    setSocket(connection);
    connection.on("connect", () => setConnected(true));
    connection.on("disconnect", () => setConnected(false));
    connection.on("room:state", (snapshot) => {
      setRoom(snapshot);
      setScreen("lobby");
    });
    return () => {
      connection.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socket || !connected) return;
    const saved = readSession();
    if (!saved) return;
    setSession(saved);
    setNickname(saved.nickname);
    socket.emit("room:reconnect", {
      code: saved.roomCode,
      sessionId: saved.sessionId
    }, (result) => {
      if (result.ok) {
        setRoom(result.room);
        setScreen("lobby");
      } else {
        window.localStorage.removeItem(sessionStorageKey);
      }
    });
  }, [socket, connected]);

  const statusLabel = connected ? "Connected" : "Reconnecting";
  const sessionId = useMemo(() => session?.sessionId, [session]);

  const submitRoomAction = useCallback((
    action: "room:create" | "room:join",
    formNickname: string,
    code?: string
  ) => {
    if (!socket || !connected) {
      setErrorMessage("Connecting to the game server. Try again in a moment.");
      return;
    }
    const cleanedNickname = formNickname.trim();
    if (!cleanedNickname) {
      setErrorMessage("Enter a nickname to continue.");
      return;
    }
    const newSessionId = session?.sessionId ?? crypto.randomUUID();
    const acknowledge = (result: RoomActionResult) => {
      setBusy(false);
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }
      const savedSession = {
        sessionId: newSessionId,
        roomCode: result.room.code,
        nickname: cleanedNickname
      };
      window.localStorage.setItem(sessionStorageKey, JSON.stringify(savedSession));
      setSession(savedSession);
      setRoom(result.room);
      setNickname(cleanedNickname);
      setErrorMessage("");
      setScreen("lobby");
    };

    setBusy(true);
    setErrorMessage("");
    if (action === "room:create") {
      socket.emit("room:create", { nickname: cleanedNickname, sessionId: newSessionId }, acknowledge);
    } else {
      socket.emit("room:join", {
        code: code ?? "",
        nickname: cleanedNickname,
        sessionId: newSessionId
      }, acknowledge);
    }
  }, [connected, session, socket]);

  const startJourney = () => {
    if (!socket || !room || !sessionId) return;
    setBusy(true);
    socket.emit("room:start", { code: room.code, sessionId }, (result) => {
      setBusy(false);
      if (result.ok) setRoom(result.room);
      else setErrorMessage(result.message);
    });
  };

  const leaveRoom = () => {
    if (socket && room && sessionId) {
      socket.emit("room:leave", { code: room.code, sessionId });
    }
    window.localStorage.removeItem(sessionStorageKey);
    setSession(undefined);
    setRoom(undefined);
    setErrorMessage("");
    setScreen("home");
  };

  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch (error) {
      console.error("Could not copy the room code.", error);
      setErrorMessage("Copy isn't available here. Select the room code to copy it.");
    }
  };

  if (screen === "lobby" && room && session) {
    const isHost = room.hostId === session.sessionId;
    return (
      <main className="app-shell lobby-shell">
        <Header connected={connected} onBack={leaveRoom} />
        <section className="lobby-layout">
          <div className="lobby-main">
            <div className="eyebrow"><span className="eyebrow-dot" /> YOUR TABLE IS READY</div>
            <h1>Every journey<br /><em>starts somewhere.</em></h1>
            <p className="lobby-copy">Gather your people. The choices ahead are better made together.</p>

            <div className="room-card">
              <div className="room-card-top">
                <div>
                  <span className="small-label">ROOM CODE</span>
                  <div className="room-code">{room.code}</div>
                </div>
                <button className="copy-button" onClick={copyCode} aria-label="Copy room code">
                  {copied ? <Check size={17} /> : <Copy size={17} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="invite-note"><Link2 size={15} /> Share this code with your players</div>
            </div>

            <div className="player-section">
              <div className="section-heading">
                <div>
                  <span className="small-label">THE PEOPLE HERE</span>
                  <h2>Players <span className="player-count">{room.players.length}/8</span></h2>
                </div>
                <span className="live-indicator"><i /> LIVE</span>
              </div>
              <div className="player-grid">
                {room.players.map((player, index) => (
                  <article className={`player-card ${player.isOnline ? "" : "offline"}`} key={player.id}>
                    <div className={`player-avatar avatar-${index % 4}`}>
                      {player.nickname.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="player-info">
                      <strong>{player.nickname}{player.id === session.sessionId ? <span className="you-tag">YOU</span> : null}</strong>
                      <span>{player.isOnline ? (player.isHost ? "HOST" : "READY") : "RECONNECTING"}</span>
                    </div>
                    <span className={`online-dot ${player.isOnline ? "is-online" : ""}`} />
                  </article>
                ))}
                {Array.from({ length: Math.max(0, 2 - room.players.length) }).map((_, index) => (
                  <div className="player-card waiting-card" key={`waiting-${index}`}>
                    <div className="waiting-avatar"><Users size={17} /></div>
                    <span>Waiting for a player…</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lobby-footer">
              {room.started ? (
                <div className="started-note"><Sparkles size={18} /> The journey is ready to begin.</div>
              ) : isHost ? (
                <button className="primary-button start-button" disabled={busy || room.players.length < 2} onClick={startJourney}>
                  {busy ? <LoaderCircle className="spin" size={18} /> : <Sparkles size={18} />}
                  START JOURNEY <ArrowRight size={17} />
                </button>
              ) : (
                <div className="waiting-note"><span className="pulse" /> Waiting for the host to start the journey…</div>
              )}
              {isHost && !room.started && room.players.length < 2 ? (
                <span className="minimum-note">At least 2 players are needed to begin</span>
              ) : null}
              <button className="text-button leave-button" onClick={leaveRoom}>Leave room</button>
            </div>
          </div>
          <aside className="lobby-aside">
            <div className="aside-art">
              <div className="sun-halo" />
              <div className="hill hill-back" />
              <div className="hill hill-front" />
              <div className="road" />
              <div className="road-mark" />
              <div className="art-caption"><span>01</span><span>THE FIRST STEP</span></div>
            </div>
            <div className="aside-quote">
              <GraduationCap size={19} />
              <p>“Your starting point does not decide your destination.”</p>
              <span>ROCKY'S JOURNEY</span>
            </div>
            <div className="aside-status"><Radio size={15} /><span>Real players. One shared story.</span></div>
          </aside>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell home-shell">
      <Header connected={connected} />
      <section className="home-layout">
        <div className="home-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> A STORY YOU SHAPE TOGETHER</div>
          <h1>Rocky<br /><em>— the journey.</em></h1>
          <p className="hero-description">One student. A thousand choices. A future built one brave step at a time.</p>
          <div className="hero-rule"><span /><span>AN INTERACTIVE MULTIPLAYER STORY</span></div>

          {screen === "home" ? (
            <div className="home-actions">
              <button className="primary-button" onClick={() => { setErrorMessage(""); setScreen("create"); }}>
                CREATE A GAME <ArrowRight size={17} />
              </button>
              <button className="secondary-button" onClick={() => { setErrorMessage(""); setScreen("join"); }}>
                JOIN WITH A CODE <Users size={17} />
              </button>
            </div>
          ) : (
            <RoomForm
              mode={screen === "create" ? "create" : "join"}
              nickname={nickname}
              roomCode={roomCode}
              busy={busy}
              errorMessage={errorMessage}
              onNicknameChange={setNickname}
              onRoomCodeChange={setRoomCode}
              onBack={() => { setErrorMessage(""); setScreen("home"); }}
              onSubmit={() => submitRoomAction(
                screen === "create" ? "room:create" : "room:join",
                nickname,
                roomCode
              )}
            />
          )}
          <div className="feature-strip">
            <span><Users size={16} /> 2—8 PLAYERS</span>
            <span><Heart size={16} /> A STORY OF HOPE</span>
            <span><LockKeyhole size={15} /> PRIVATE ROOMS</span>
          </div>
        </div>
        <aside className="hero-visual">
          <div className="hero-image">
            <div className="visual-sun" />
            <div className="visual-stars"><i /><i /><i /><i /><i /></div>
            <div className="visual-mountain mountain-back" />
            <div className="visual-mountain mountain-mid" />
            <div className="visual-mountain mountain-front" />
            <div className="visual-road" />
            <div className="visual-person"><span /><i /><b /><em /></div>
            <div className="visual-label"><span>CHAPTER ONE</span><strong>The beginning<br />is yours to make.</strong></div>
          </div>
          <div className="visual-bottom"><span><span className="tiny-dot" /> BUILT FOR THE DECISIONS THAT MATTER</span><span>01 — 05</span></div>
        </aside>
      </section>
      <div className="home-bottom">
        <span>YOUR STARTING POINT DOES NOT DECIDE YOUR DESTINATION.</span>
        <span>ROCKY — THE JOURNEY <span className="footer-heart">✳</span></span>
      </div>
      {!connected ? <div className="connection-toast"><WifiOff size={16} /> Connecting to the game server…</div> : null}
    </main>
  );
}

function Header({ connected, onBack }: { connected: boolean; onBack?: () => void }) {
  return (
    <header className="topbar">
      <a className="brand" href="#" onClick={(event) => { event.preventDefault(); onBack?.(); }}>
        <span className="brand-mark">R</span>
        <span>ROCKY <i>—</i> THE JOURNEY</span>
      </a>
      <div className="topbar-right">
        <span className="desktop-label">A STORY OF COURAGE, CHOICE & POSSIBILITY</span>
        <span className={`connection-pill ${connected ? "connected" : ""}`}>
          {connected ? <Wifi size={13} /> : <WifiOff size={13} />}
          {connected ? "SERVER ONLINE" : "RECONNECTING"}
        </span>
        {onBack ? <button className="icon-button" onClick={onBack} aria-label="Leave room"><ArrowLeft size={17} /></button> : null}
      </div>
    </header>
  );
}

function RoomForm({
  mode,
  nickname,
  roomCode,
  busy,
  errorMessage,
  onNicknameChange,
  onRoomCodeChange,
  onBack,
  onSubmit
}: {
  mode: "create" | "join";
  nickname: string;
  roomCode: string;
  busy: boolean;
  errorMessage: string;
  onNicknameChange: (value: string) => void;
  onRoomCodeChange: (value: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const isCreate = mode === "create";
  return (
    <form className="room-form" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <button type="button" className="form-back" onClick={onBack}><ArrowLeft size={15} /> BACK</button>
      <h2>{isCreate ? "Create your game" : "Join the journey"}</h2>
      <p>{isCreate ? "Start a room and invite your people." : "Enter your details to join your people."}</p>
      <label htmlFor="nickname">YOUR NICKNAME</label>
      <input
        id="nickname"
        autoComplete="nickname"
        maxLength={18}
        placeholder="How should we call you?"
        value={nickname}
        onChange={(event) => onNicknameChange(event.target.value)}
        required
      />
      {!isCreate ? (
        <>
          <label htmlFor="room-code">ROOM CODE</label>
          <input
            id="room-code"
            className="code-input"
            autoComplete="off"
            maxLength={6}
            placeholder="E.G. R7K9P2"
            value={roomCode}
            onChange={(event) => onRoomCodeChange(event.target.value.toUpperCase())}
            required
          />
        </>
      ) : null}
      {errorMessage ? <div className="form-error" role="alert"><X size={15} /> {errorMessage}</div> : null}
      <button className="primary-button form-submit" type="submit" disabled={busy}>
        {busy ? <LoaderCircle className="spin" size={17} /> : null}
        {isCreate ? "CREATE ROOM" : "JOIN ROOM"}
        {busy ? null : <ArrowRight size={16} />}
      </button>
    </form>
  );
}

export default App;
