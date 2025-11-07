import express from "express";
import fetch from "node-fetch";
import pkg from "pg";
const { Pool } = pkg;

const app = express();
app.use(express.json({ limit: "5mb" }));

// --- ENV ---
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const OPENAI_EMBED = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-large";
const CONNECTEAM_API_KEY = process.env.CONNECTEAM_API_KEY;
const CONNECTEAM_CONV = process.env.CONNECTEAM_DEFAULT_CONVERSATION_ID;

const pool = new Pool({ connectionString: DATABASE_URL });

// --- Helpers ---
async function embed(text) {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const r = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: OPENAI_EMBED, input: text })
  }).then(r => r.json());
  if (!r.data || !r.data[0]) throw new Error("Embedding failed");
  return r.data[0].embedding;
}

function chunkText(t, size = 1000, overlap = 200) {
  const words = t.split(/\s+/);
  const out = [];
  for (let i = 0; i < words.length; i += (size - overlap)) {
    out.push(words.slice(i, i + size).join(" "));
  }
  return out;
}

// --- Routes ---
app.get("/health", (_, res) => res.json({ ok: true }));

// Ingest simpler Text (für den Start)
app.post("/ingest/text", async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) return res.status(400).json({ error: "title & content required" });

    const client = await pool.connect();
    try {
      const doc = await client.query(
        `INSERT INTO documents (title, source, source_type) VALUES ($1,$2,$3) RETURNING id`,
        [title, "manual", "txt"]
      );
      const docId = doc.rows[0].id;

      const chunks = chunkText(content);
      let idx = 0;
      for (const c of chunks) {
        const v = await embed(c);
        const vec = "[" + v.join(",") + "]"; // pgvector cast
        await client.query(
          `INSERT INTO chunks (document_id, chunk_index, content, embedding, meta)
           VALUES ($1,$2,$3,$4::vector,$5)`,
          [docId, idx++, c, vec, JSON.stringify({ source: "manual" })]
        );
      }
      res.json({ ok: true, chunks: chunks.length });
    } finally {
      client.release();
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ingest failed", details: e.message });
  }
});

// Frage beantworten
app.post("/ask", async (req, res) => {
  try {
    const { question, postToConnecteam } = req.body;
    if (!question) return res.status(400).json({ error: "question required" });

    const qEmb = await embed(question);
    const vec = "[" + qEmb.join(",") + "]";

    const client = await pool.connect();
    const hits = await client.query(
      `SELECT c.content, d.title, d.source, 1 - (c.embedding <=> $1::vector) AS score
       FROM chunks c JOIN documents d ON d.id = c.document_id
       ORDER BY c.embedding <-> $1::vector
       LIMIT 6`, [vec]
    );
    client.release();

    const context = hits.rows.map((h, i) => `### Quelle ${i+1} — ${h.title}\n${h.content}`).join("\n\n");

    const body = {
      model: OPENAI_MODEL,
      temperature: 0.2,
      messages: [
        { role: "system", content: "Du bist LuiBot, der interne FAQ-Bot. Antworte kurz, in DU-Form, mit konkreten Schritten. Wenn unsicher: sag es. Füge am Ende 1–3 Quellen (Titel) an." },
        { role: "user", content: "Frage: \"\"\"" + question + "\"\"\"\n\nNutze NUR diese Informationen:\n" + context }
      ]
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(r => r.json());

    const answer = r.choices?.[0]?.message?.content?.trim() || "Dazu habe ich gerade keine sichere Info.";

    // Optional: direkt in Connecteam posten
    if (postToConnecteam && CONNECTEAM_API_KEY && CONNECTEAM_CONV) {
      await fetch(`https://api.connecteam.com/chat/v1/conversations/${CONNECTEAM_CONV}/message`, {
        method: "POST",
        headers: { Authorization: `Bearer ${CONNECTEAM_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: answer })
      }).then(r => r.text()).catch(e => console.error("Connecteam post failed", e));
    }

    res.json({ answer });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "ask failed", details: e.message });
  }
});

app.listen(PORT, () => console.log(`LuiBot up on :${PORT}`));
