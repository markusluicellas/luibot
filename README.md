# LuiBot (Render ZIP-Deploy)

Minimaler Starter für deinen internen FAQ-Bot.

## 1) Upload zu Render (ohne GitHub)
- Render → New → Web Service → **Manual Deploy → Upload .zip**
- Runtime: Node 20
- Build Command: `npm install`
- Start Command: `node server.js`
- Health Check Path: `/health`
- Environment Variablen setzen (aus `.env.template`):
  - DATABASE_URL (External Database URL deiner Render-Postgres-DB)
  - OPENAI_API_KEY (von https://platform.openai.com → API Keys)
  - OPENAI_MODEL = gpt-4.1-mini
  - OPENAI_EMBED_MODEL = text-embedding-3-large
  - (optional) CONNECTEAM_API_KEY, CONNECTEAM_DEFAULT_CONVERSATION_ID

## 2) Health-Check
Öffne: `https://<DEINE-URL>/health` → sollte `{ "ok": true }` anzeigen.

## 3) Wissen einfüttern (schnellster Start)
```bash
curl -X POST https://<DEINE-URL>/ingest/text     -H "Content-Type: application/json"     -d '{
    "title": "Kasse – Tagesabschluss",
    "content": "Tagesabschluss: 1) Menü > Abschluss 2) Bargeld zählen 3) Pfand separat 4) Bericht senden."
  }'
```

## 4) Frage stellen
```bash
curl -X POST https://<DEINE-URL>/ask     -H "Content-Type: application/json"     -d '{"question":"Wie mache ich den Tagesabschluss an der Kasse?"}'
```

## 5) Optional: Antwort direkt in Connecteam posten
- Setze `CONNECTEAM_API_KEY` und `CONNECTEAM_DEFAULT_CONVERSATION_ID` in Render.
- Sende dann:
```bash
curl -X POST https://<DEINE-URL>/ask     -H "Content-Type: application/json"     -d '{"question":"Wie mache ich den Tagesabschluss an der Kasse?","postToConnecteam":true}'
```

## Hinweise
- Die Datenbanktabellen hast du bereits angelegt (pgvector installiert).
- Für echte Dokumente (PDF/DOCX) kannst du später den Ingest erweitern.
