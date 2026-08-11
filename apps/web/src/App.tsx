import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import "./App.css";

const socket = io("http://localhost:3001");

type GameStatus = "LOBBY" | "BRIEFING" | "INVESTIGATION" | "FINALE";
type PlayerRole = "INSIDER" | "ANALYST";

interface Player {
  id: string;
  name: string;
  host: boolean;
  role: PlayerRole;
}

interface GameRoom {
  code: string;
  players: Player[];
  status: GameStatus;
  chapter: number;
}

export default function App() {
  const [connected, setConnected] = useState(socket.connected);
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    const onRoom = (nextRoom: GameRoom) => {
      setRoom(nextRoom);
      setError("");
    };
    const onError = (message: string) => setError(message);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("room:created", onRoom);
    socket.on("room:updated", onRoom);
    socket.on("game:started", onRoom);
    socket.on("room:error", onError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("room:created", onRoom);
      socket.off("room:updated", onRoom);
      socket.off("game:started", onRoom);
      socket.off("room:error", onError);
    };
  }, []);

  const me = room?.players.find((player) => player.id === socket.id);

  function createRoom() {
    setError("");
    socket.emit("room:create", playerName);
  }

  function joinRoom() {
    setError("");
    socket.emit("room:join", { code: joinCode, playerName });
  }

  function startGame() {
    if (room) socket.emit("game:start", room.code);
  }

  if (room?.status === "BRIEFING" && me) {
    const insider = me.role === "INSIDER";

    return (
      <main className="screen briefing-screen">
        <section className="panel briefing-card">
          <div className="eyebrow">NIGHTSHIFT // VERTRAULICH</div>
          <h1>FALL #001</h1>
          <h2>DIE VERSCHWUNDENE</h2>
          <div className="meta">RABENSTADT // SAMSTAG // 02:17 UHR</div>

          <div className="divider" />

          <div className="eyebrow">DEINE ROLLE</div>
          <h3>{insider ? "DER INSIDER" : "DER ANALYST"}</h3>
          <p>
            {insider
              ? "Du kennst Rabenstadts Nachtleben, Informanten, Clubs und die Leute, die lieber keine Fragen beantworten."
              : "Du arbeitest mit Daten, Zeitlinien, Kameras, Transaktionen und digitalen Spuren."}
          </p>
          <p className="muted">Dein Partner erhält andere Informationen als du.</p>

          <div className="divider" />

          <div className="eyebrow">AUFTRAGGEBER</div>
          <h3>VIKTOR BRANDT</h3>
          <blockquote>
            „Vanessa hat mir etwas genommen. Findet sie vor Sonnenaufgang. Keine Polizei. 5.000 € für euch beide.“
          </blockquote>
          <p>Vanessa Kern wurde zuletzt im Nachtclub VELVET gesehen. Seit 00:22 Uhr ist ihr Telefon offline.</p>
          <strong className="warning">Vertraue den Beweisen. Nicht den Menschen.</strong>
        </section>
      </main>
    );
  }

  if (room) {
    return (
      <main className="screen">
        <section className="panel lobby-card">
          <div className="eyebrow">FALLVORBEREITUNG</div>
          <h1>NIGHTSHIFT</h1>
          <div className="room-code-label">RAUMCODE</div>
          <div className="room-code">{room.code}</div>
          <p className="muted">Teile den Code mit deinem Partner.</p>

          <div className="divider" />

          <div className="players">
            {room.players.map((player) => (
              <div className="player-row" key={player.id}>
                <span>{player.name}</span>
                <span>{player.host ? "HOST" : "PARTNER"} · ONLINE</span>
              </div>
            ))}
          </div>

          {room.players.length === 1 ? (
            <p className="waiting">Warte auf den zweiten Spieler…</p>
          ) : me?.host ? (
            <button className="primary" onClick={startGame}>FALL BEGINNEN</button>
          ) : (
            <p className="waiting">Der Host bereitet den Fall vor…</p>
          )}

          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <section className="panel home-card">
        <div className="status"><span className={connected ? "dot online" : "dot"} />{connected ? "SERVER VERBUNDEN" : "SERVER OFFLINE"}</div>
        <div className="eyebrow">A CO-OP CRIME EXPERIENCE</div>
        <h1 className="logo">NIGHTSHIFT</h1>
        <p className="tagline">Zwei Spieler. Zwei Wahrheiten. Ein Fall.</p>

        <label>DEIN CODENAME</label>
        <input value={playerName} onChange={(event) => setPlayerName(event.target.value)} placeholder="z. B. Raven" maxLength={20} />
        <button className="primary" onClick={createRoom} disabled={!connected || !playerName.trim()}>NEUEN FALL STARTEN</button>

        <div className="divider"><span>ODER</span></div>

        <label>RAUMCODE</label>
        <input value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} placeholder="XXXXXX" maxLength={6} />
        <button onClick={joinRoom} disabled={!connected || !playerName.trim() || joinCode.length !== 6}>SPIEL BEITRETEN</button>

        {error && <p className="error">{error}</p>}
      </section>
    </main>
  );
}
