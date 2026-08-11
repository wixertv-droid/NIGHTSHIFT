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
const io = new Server(httpServer, {
  cors: {
    origin: WEB_ORIGIN,
    methods: ["GET", "POST"]
  }
});

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

const rooms = new Map<string, GameRoom>();

function createRoomCode(): string {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  do {
    code = Array.from({ length: 6 }, () =>
      characters.charAt(Math.floor(Math.random() * characters.length))
    ).join("");
  } while (rooms.has(code));

  return code;
}

app.get("/", (_req, res) => {
  res.json({
    game: "NIGHTSHIFT",
    version: "0.1.0",
    status: "online",
    playersOnline: io.engine.clientsCount,
    activeRooms: rooms.size
  });
});

io.on("connection", (socket) => {
  console.log(`Spieler verbunden: ${socket.id}`);

  socket.emit("nightshift:welcome", {
    message: "Willkommen bei NIGHTSHIFT.",
    playerId: socket.id
  });

  socket.on("room:create", (playerName: string) => {
    const name = playerName.trim();
    if (!name) {
      socket.emit("room:error", "Bitte gib einen Codenamen ein.");
      return;
    }

    const code = createRoomCode();
    const room: GameRoom = {
      code,
      status: "LOBBY",
      chapter: 0,
      players: [
        {
          id: socket.id,
          name,
          host: true,
          role: "INSIDER"
        }
      ]
    };

    rooms.set(code, room);
    socket.join(code);
    socket.emit("room:created", room);
    console.log(`Raum ${code} erstellt von ${name}`);
  });

  socket.on("room:join", (data: { code: string; playerName: string }) => {
    const code = data.code.trim().toUpperCase();
    const name = data.playerName.trim();

    if (!name) {
      socket.emit("room:error", "Bitte gib einen Codenamen ein.");
      return;
    }

    const room = rooms.get(code);
    if (!room) {
      socket.emit("room:error", "Dieser Raum existiert nicht.");
      return;
    }

    if (room.status !== "LOBBY") {
      socket.emit("room:error", "Dieser Fall wurde bereits gestartet.");
      return;
    }

    if (room.players.length >= 2) {
      socket.emit("room:error", "Dieser Raum ist bereits voll.");
      return;
    }

    room.players.push({
      id: socket.id,
      name,
      host: false,
      role: "ANALYST"
    });

    socket.join(code);
    io.to(code).emit("room:updated", room);
    console.log(`${name} ist Raum ${code} beigetreten`);
  });

  socket.on("game:start", (code: string) => {
    const room = rooms.get(code);
    if (!room) {
      socket.emit("room:error", "Raum wurde nicht gefunden.");
      return;
    }

    const player = room.players.find((entry) => entry.id === socket.id);
    if (!player?.host) {
      socket.emit("room:error", "Nur der Host kann den Fall starten.");
      return;
    }

    if (room.players.length !== 2) {
      socket.emit("room:error", "Der Fall benötigt genau zwei Spieler.");
      return;
    }

    room.status = "BRIEFING";
    room.chapter = 1;
    io.to(code).emit("game:started", room);
    console.log(`Fall #001 in Raum ${code} gestartet`);
  });

  socket.on("disconnect", (reason) => {
    console.log(`Spieler getrennt: ${socket.id} (${reason})`);

    for (const [code, room] of rooms.entries()) {
      const index = room.players.findIndex((player) => player.id === socket.id);
      if (index === -1) continue;

      room.players.splice(index, 1);

      if (room.players.length === 0) {
        rooms.delete(code);
      } else {
        room.players[0].host = true;
        room.players[0].role = "INSIDER";
        io.to(code).emit("room:updated", room);
      }
    }
  });
});

httpServer.listen(PORT, () => {
  console.log("====================================");
  console.log("       NIGHTSHIFT GAME SERVER");
  console.log("====================================");
  console.log(`http://localhost:${PORT}`);
  console.log("Socket.IO bereit");
  console.log("====================================");
});
