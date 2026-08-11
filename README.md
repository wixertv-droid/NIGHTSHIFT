# NIGHTSHIFT

Browserbasiertes Zwei-Spieler-Crime-Rätselspiel.

## Struktur

- `apps/web` – React/Vite-Frontend
- `apps/server` – Node/Express/Socket.IO-Multiplayer-Server
- `packages/shared` – gemeinsam genutzte TypeScript-Typen
- `docs` – Story- und Game-Design-Dokumente

## Lokal starten

```bash
npm install
npm run dev:server
```

In einem zweiten Terminal:

```bash
npm run dev:web
```

Frontend: `http://localhost:5173`
Server: `http://localhost:3001`

## Aktueller Stand

- Raum erstellen
- 6-stelliger Raumcode
- Zweiter Spieler kann beitreten
- Host startet den Fall
- Rollen: Insider und Analyst
- Briefing für Fall #001
