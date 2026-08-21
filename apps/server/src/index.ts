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
type LocationId = "HQ" | "VELVET" | "HOTEL";

interface Player { id:string; name:string; host:boolean; role:PlayerRole; ready:boolean; }
interface GameRoom { code:string; players:Player[]; status:GameStatus; chapter:number; solved:boolean; attempts:number; notes:string[]; clues:string[]; unlockedLocations:LocationId[]; }
interface SecretCase { plate:string; linkedPerson:string; company:string; cctvSecond:number; variant:number; }

const rooms = new Map<string, GameRoom>();
const secrets = new Map<string, SecretCase>();

const variants: SecretCase[] = [
  { plate:"B-VE 814", linkedPerson:"Leo Hartmann", company:"Hartmann Consulting GmbH", cctvSecond:7, variant:1 },
  { plate:"R-KN 307", linkedPerson:"Mila Novak", company:"Novak Eventservice", cctvSecond:8, variant:2 },
  { plate:"B-DK 221", linkedPerson:"Daniel Krüger", company:"Privatfahrzeug", cctvSecond:6, variant:3 }
];

function createRoomCode(){ const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; let code=""; do{code=Array.from({length:6},()=>chars[Math.floor(Math.random()*chars.length)]).join("")}while(rooms.has(code)); return code; }
function broadcast(code:string,event="room:updated"){const room=rooms.get(code);if(room)io.to(code).emit(event,room)}
function roleView(code:string, role:PlayerRole){
  const secret=secrets.get(code); if(!secret) return null;
  const people=[
    {name:"Leo Hartmann",detail:"Unternehmer. Stammgast im VELVET. Behauptet, den Club vor Mitternacht verlassen zu haben."},
    {name:"Mila Novak",detail:"Barkeeperin. Freundin von Vanessa. Ihre Aussage zur letzten Begegnung ist auffällig knapp."},
    {name:"Daniel Krüger",detail:"Kriminalbeamter. Taucht in internen Kontaktlisten des Clubs auf, offiziell jedoch ohne Bezug zum VELVET."}
  ];
  if(role==="INSIDER") return { role, people, witness:["23:48 — Türsteher sieht Vanessa Richtung Hinterhof gehen.","00:17 — Streit hinter der VIP-Tür, Stimmen nicht zuzuordnen.","00:26 — Mila sagt: 'Der Wagen ist noch da.'"], plate:null, registry:null, cctvSecond:secret.cctvSecond };
  return { role, people:null, witness:null, plate:secret.plate, registry:[
    {plate:"B-VE 814",owner:"Hartmann Consulting GmbH",person:"Leo Hartmann"},
    {plate:"R-KN 307",owner:"Novak Eventservice",person:"Mila Novak"},
    {plate:"B-DK 221",owner:"Privatfahrzeug",person:"Daniel Krüger"}
  ], cctvSecond:secret.cctvSecond };
}

app.get("/",(_req,res)=>res.json({game:"NIGHTSHIFT",version:"0.3.0",status:"online",playersOnline:io.engine.clientsCount,activeRooms:rooms.size}));

io.on("connection",socket=>{
  socket.on("room:create",(playerName:string)=>{const name=playerName?.trim();if(!name)return socket.emit("room:error","Bitte gib einen Codenamen ein.");const code=createRoomCode();const room:GameRoom={code,status:"LOBBY",chapter:0,solved:false,attempts:0,notes:[],clues:[],unlockedLocations:["HQ","VELVET"],players:[{id:socket.id,name,host:true,role:"INSIDER",ready:false}]};rooms.set(code,room);secrets.set(code,variants[Math.floor(Math.random()*variants.length)]);socket.join(code);socket.emit("room:created",room)});
  socket.on("room:join",(data:{code:string;playerName:string})=>{const code=data.code?.trim().toUpperCase();const name=data.playerName?.trim();const room=rooms.get(code);if(!name)return socket.emit("room:error","Bitte gib einen Codenamen ein.");if(!room)return socket.emit("room:error","Dieser Raum existiert nicht.");if(room.status!=="LOBBY")return socket.emit("room:error","Dieser Fall wurde bereits gestartet.");if(room.players.length>=2)return socket.emit("room:error","Dieser Raum ist bereits voll.");room.players.push({id:socket.id,name,host:false,role:"ANALYST",ready:false});socket.join(code);broadcast(code)});
  socket.on("game:start",(code:string)=>{const room=rooms.get(code);if(!room)return;const player=room.players.find(p=>p.id===socket.id);if(!player?.host)return socket.emit("room:error","Nur der Host kann den Fall starten.");if(room.players.length!==2)return socket.emit("room:error","Der Fall benötigt genau zwei Spieler.");room.status="BRIEFING";room.chapter=1;room.players.forEach(p=>p.ready=false);broadcast(code,"game:started")});
  socket.on("briefing:ready",(code:string)=>{const room=rooms.get(code);if(!room||room.status!=="BRIEFING")return;const player=room.players.find(p=>p.id===socket.id);if(!player)return;player.ready=true;broadcast(code);if(room.players.length===2&&room.players.every(p=>p.ready)){room.status="INVESTIGATION";room.players.forEach(p=>p.ready=false);broadcast(code,"chapter:started")}});
  socket.on("case:request",(code:string)=>{const room=rooms.get(code);if(!room)return;const player=room.players.find(p=>p.id===socket.id);if(!player)return;socket.emit("case:data",roleView(code,player.role))});
  socket.on("notebook:add",(data:{code:string;note:string})=>{const room=rooms.get(data.code);const note=data.note?.trim();if(!room||!note)return;room.notes.push(note.slice(0,180));if(room.notes.length>30)room.notes.shift();broadcast(data.code)});
  socket.on("clue:found",(data:{code:string;clue:string})=>{const room=rooms.get(data.code);if(!room)return;if(!room.clues.includes(data.clue))room.clues.push(data.clue);broadcast(data.code)});
  socket.on("chapter:answer",(data:{code:string;answer:string})=>{const room=rooms.get(data.code);const secret=secrets.get(data.code);if(!room||!secret||room.status!=="INVESTIGATION"||room.solved)return;room.attempts++;const n=data.answer.trim().toLowerCase().replace(/[^a-z0-9äöüß]/g,"");const target=secret.linkedPerson.toLowerCase().replace(/[^a-z0-9äöüß]/g,"");const correct=n===target||target.includes(n)&&n.length>3;if(correct){room.solved=true;if(!room.unlockedLocations.includes("HOTEL"))room.unlockedLocations.push("HOTEL");io.to(data.code).emit("chapter:result",{correct:true,room,message:"Die Zuordnung passt. Damit habt ihr zum ersten Mal eine belastbare Verbindung — und eine neue Adresse taucht in den Daten auf."})}else socket.emit("chapter:result",{correct:false,room,message:"Noch nicht belastbar. Prüft Kennzeichen, Zeitfenster und Personenakten erneut."})});
  socket.on("disconnect",()=>{for(const[code,room]of rooms){const i=room.players.findIndex(p=>p.id===socket.id);if(i<0)continue;room.players.splice(i,1);if(!room.players.length){rooms.delete(code);secrets.delete(code)}else{room.players[0].host=true;room.players[0].role="INSIDER";broadcast(code)}}});
});

httpServer.listen(PORT,()=>console.log(`NIGHTSHIFT v0.3 // http://localhost:${PORT}`));
