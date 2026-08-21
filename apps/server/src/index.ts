import express from "express";
import cors from "cors";
import { createServer } from "node:http";
import { Server } from "socket.io";

const PORT = 3001;
const WEB_ORIGIN = "http://localhost:5173";
const app = express();
app.use(cors({ origin: WEB_ORIGIN }));
app.use(express.json());
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: WEB_ORIGIN, methods: ["GET", "POST"] } });

type GameStatus = "LOBBY" | "BRIEFING" | "INVESTIGATION" | "FINALE";
type PlayerRole = "INSIDER" | "ANALYST";
interface Player { id: string; name: string; host: boolean; role: PlayerRole; ready: boolean; }
interface GameRoom { code: string; players: Player[]; status: GameStatus; chapter: number; solved: boolean; attempts: number; }
const rooms = new Map<string, GameRoom>();

function createRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  do { code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join(""); } while (rooms.has(code));
  return code;
}
function broadcast(code: string, event = "room:updated") { const room = rooms.get(code); if (room) io.to(code).emit(event, room); }

app.get("/", (_req, res) => res.json({ game: "NIGHTSHIFT", version: "0.2.0", status: "online", playersOnline: io.engine.clientsCount, activeRooms: rooms.size }));

io.on("connection", (socket) => {
  console.log(`Spieler verbunden: ${socket.id}`);

  socket.on("room:create", (playerName: string) => {
    const name = playerName?.trim();
    if (!name) return socket.emit("room:error", "Bitte gib einen Codenamen ein.");
    const code = createRoomCode();
    const room: GameRoom = { code, status: "LOBBY", chapter: 0, solved: false, attempts: 0, players: [{ id: socket.id, name, host: true, role: "INSIDER", ready: false }] };
    rooms.set(code, room); socket.join(code); socket.emit("room:created", room);
  });

  socket.on("room:join", (data: { code: string; playerName: string }) => {
    const code = data.code?.trim().toUpperCase(); const name = data.playerName?.trim(); const room = rooms.get(code);
    if (!name) return socket.emit("room:error", "Bitte gib einen Codenamen ein.");
    if (!room) return socket.emit("room:error", "Dieser Raum existiert nicht.");
    if (room.status !== "LOBBY") return socket.emit("room:error", "Dieser Fall wurde bereits gestartet.");
    if (room.players.length >= 2) return socket.emit("room:error", "Dieser Raum ist bereits voll.");
    room.players.push({ id: socket.id, name, host: false, role: "ANALYST", ready: false }); socket.join(code); broadcast(code);
  });

  socket.on("game:start", (code: string) => {
    const room = rooms.get(code); if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player?.host) return socket.emit("room:error", "Nur der Host kann den Fall starten.");
    if (room.players.length !== 2) return socket.emit("room:error", "Der Fall benötigt genau zwei Spieler.");
    room.status = "BRIEFING"; room.chapter = 1; room.players.forEach(p => p.ready = false); broadcast(code, "game:started");
  });

  socket.on("briefing:ready", (code: string) => {
    const room = rooms.get(code); if (!room || room.status !== "BRIEFING") return;
    const player = room.players.find(p => p.id === socket.id); if (!player) return;
    player.ready = true; broadcast(code);
    if (room.players.length === 2 && room.players.every(p => p.ready)) {
      room.status = "INVESTIGATION"; room.players.forEach(p => p.ready = false); broadcast(code, "chapter:started");
    }
  });

  socket.on("chapter:answer", (data: { code: string; answer: string }) => {
    const room = rooms.get(data.code); if (!room || room.status !== "INVESTIGATION" || room.solved) return;
    room.attempts += 1;
    const normalized = data.answer.trim().toLowerCase().replace(/[^a-z0-9äöüß]/g, "");
    const correct = ["leohartmann", "leo", "leonhartmann"].includes(normalized);
    if (correct) { room.solved = true; io.to(data.code).emit("chapter:result", { correct: true, room, message: "Treffer. Der Wagen gehört zu Leo Hartmann. Aber die Kamera zeigt etwas, das nicht zu seiner Aussage passt…" }); }
    else socket.emit("chapter:result", { correct: false, room, message: "Die Spur passt nicht. Vergleicht Uhrzeiten, Fahrzeugakte und Chat noch einmal." });
  });

  socket.on("disconnect", () => {
    for (const [code, room] of rooms) {
      const index = room.players.findIndex(p => p.id === socket.id); if (index < 0) continue;
      room.players.splice(index, 1);
      if (!room.players.length) rooms.delete(code); else { room.players[0].host = true; room.players[0].role = "INSIDER"; broadcast(code); }
    }
  });
});

httpServer.listen(PORT, () => console.log(`NIGHTSHIFT v0.2 // http://localhost:${PORT}`));
