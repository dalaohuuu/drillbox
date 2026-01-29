import dotenv from "dotenv";
dotenv.config();

import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import multipart from "@fastify/multipart";
import path from "path";
import { fileURLToPath } from "url";

import { openDb } from "./db.js";
import { nowIso, newId, safeJsonParse, grade, decodeTextSmart } from "./utils.js";
import { importQuestionsFromCsvText } from "./import_lib.js";

const PORT = Number(process.env.PORT || 3000);
const PASSCODE = String(process.env.APP_PASSCODE || "change-me");

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "../public");

const app = Fastify({ logger: true });
const db = openDb();

// 静态站点
app.register(fastifyStatic, { root: publicDir, prefix: "/" });

// 上传（CSV）
app.register(multipart, {
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB
  }
});

// --- Auth ---
app.post("/api/auth/login", async (req, reply) => {
  const { passcode } = req.body || {};
  if (String(passcode || "") !== PASSCODE) {
    return reply.code(401).send({ ok: false, error: "Invalid passcode" });
  }

  const userId = newId("u");
  const token = newId("s");

  db.prepare("INSERT INTO users (id, created_at) VALUES (?, ?)").run(userId, nowIso());
  db.prepare("INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)").run(token, userId, nowIso());

  return { ok: true, token };
});

function parseBearerToken(req) {
  const auth = req.headers["authorization"] || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function requireUser(req, reply) {
  const token = parseBearerToken(req);
  if (!token) return reply.code(401).send({ ok: false, error: "Missing Bearer token" });

  const row = db.prepare("SELECT user_id FROM sessions WHERE token = ?").get(token);
  if (!row) return reply.code(401).send({ ok: false, error: "Invalid session" });

  req.userId = row.user_id;
  req.sessionToken = token;
}

app.post("/api/auth/logout", async (req, reply) => {
  requireUser(req, reply);
  db.prepare("DELETE FROM sessions WHERE token = ?").run(req.sessionToken);
  return { ok: true };
});

// --- 新增：CSV 导入 ---
app.post("/api/import/csv", async (req, reply) => {
  requireUser(req, reply);

  const part = await req.file();
  if (!part) return reply.code(400).send({ ok: false, error: "missing file field" });

  const filename = part.filename || "";
  const mimetype = part.mimetype || "";
  if (!filename.toLowerCase().endsWith(".csv")) {
    return reply.code(400).send({ ok: false, error: "只支持 .csv 文件" });
  }
  if (mimetype && !mimetype.includes("csv") && !mimetype.includes("text")) {
    // 有些浏览器会给 application/vnd.ms-excel，也放行
  }

  // 读入 buffer
  const chunks = [];
  for await (const chunk of part.file) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  const text = decodeTextSmart(buf);

  const result = importQuestionsFromCsvText(db, text, { defaultSection: "导入题库" });
  return { ok: true, filename, ...result };
});

// --- Meta ---
app.get("/api/meta", async (req, reply) => {
  requireUser(req, reply);
  const types = db.prepare("SELECT type, COUNT(*) as c FROM questions GROUP BY type ORDER BY c DESC").all();
  const sections = db.prepare("SELECT section, COUNT(*) as c FROM questions GROUP BY section ORDER BY c DESC").all();
  return { ok: true, types, sections };
});

// --- 获取下一题 ---
app.get("/api/questions/next", async (req, reply) => {
  requireUser(req, reply);
  const userId = req.userId;

  const mode = String(req.query.mode || "random");
  const type = req.query.type ? String(req.query.type) : null;
  const section = req.query.section ? String(req.query.section) : null;

  let where = "1=1";
  const params = [];

  if (type) {
    where += " AND type = ?";
    params.push(type);
  }
  if (section) {
    where += " AND section = ?";
    params.push(section);
  }

  let sql = `SELECT id, type, section, stem, options_json, answer, analysis FROM questions WHERE ${where} `;
  if (mode === "wrong" || mode === "starred") {
    const markType = mode === "wrong" ? "wrong" : "starred";
    sql = `
      SELECT q.id, q.type, q.section, q.stem, q.options_json, q.answer, q.analysis
      FROM questions q
      JOIN marks m ON m.question_id = q.id
      WHERE m.user_id = ? AND m.mark_type = ? AND ${where}
      ORDER BY RANDOM()
      LIMIT 1
    `;
    params.unshift(markType);
    params.unshift(userId);
  } else if (mode === "seq") {
    sql += " ORDER BY rowid ASC LIMIT 1";
  } else {
    sql += " ORDER BY RANDOM() LIMIT 1";
  }

  const q = db.prepare(sql).get(...params);
  if (!q) return { ok: true, question: null };

  const options = q.options_json ? safeJsonParse(q.options_json, []) : [];
  return {
    ok: true,
    question: {
      id: q.id,
      type: q.type,
      section: q.section,
      stem: q.stem,
      options,
      hasAnswer: Boolean(q.answer),
      answer: q.answer || "",
      analysis: q.analysis || ""
    }
  };
});

// --- 提交做题记录 ---
app.post("/api/attempts", async (req, reply) => {
  requireUser(req, reply);
  const userId = req.userId;

  const { questionId, answerText = "", selfCorrect = null, mode = "normal" } = req.body || {};
  if (!questionId) return reply.code(400).send({ ok: false, error: "questionId required" });

  const q = db.prepare("SELECT id, type, answer FROM questions WHERE id = ?").get(questionId);
  if (!q) return reply.code(404).send({ ok: false, error: "question not found" });

  let isCorrect = null;

  if (q.answer && q.answer.trim()) {
    const g = grade(q.type, answerText, q.answer);
    isCorrect = g === null ? null : g ? 1 : 0;
  } else if (selfCorrect === true || selfCorrect === false) {
    isCorrect = selfCorrect ? 1 : 0;
  }

  db.prepare(
    `
    INSERT INTO attempts (id, user_id, question_id, answer_text, is_correct, mode, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(newId("a"), userId, questionId, String(answerText || ""), isCorrect, String(mode || "normal"), nowIso());

  // wrong mark：错了加入，答对移除
  if (isCorrect === 0) {
    db.prepare(
      `
      INSERT OR REPLACE INTO marks (user_id, question_id, mark_type, updated_at)
      VALUES (?, ?, 'wrong', ?)
    `
    ).run(userId, questionId, nowIso());
  } else if (isCorrect === 1) {
    db.prepare(`DELETE FROM marks WHERE user_id = ? AND question_id = ? AND mark_type = 'wrong'`).run(
      userId,
      questionId
    );
  }

  return { ok: true, isCorrect };
});

// --- ⭐标记/取消 ---
app.post("/api/marks", async (req, reply) => {
  requireUser(req, reply);
  const userId = req.userId;

  const { questionId, markType, enabled } = req.body || {};
  if (!questionId || !markType) return reply.code(400).send({ ok: false, error: "questionId & markType required" });

  const mt = String(markType);
  if (!["starred", "wrong"].includes(mt)) return reply.code(400).send({ ok: false, error: "invalid markType" });

  if (enabled) {
    db.prepare(
      `
      INSERT OR REPLACE INTO marks (user_id, question_id, mark_type, updated_at)
      VALUES (?, ?, ?, ?)
    `
    ).run(userId, questionId, mt, nowIso());
  } else {
    db.prepare(`DELETE FROM marks WHERE user_id = ? AND question_id = ? AND mark_type = ?`).run(userId, questionId, mt);
  }

  return { ok: true };
});

// --- 统计 ---
app.get("/api/stats", async (req, reply) => {
  requireUser(req, reply);
  const userId = req.userId;

  const last = db
    .prepare(
      `
    SELECT is_correct FROM attempts
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `
    )
    .all(userId);

  const done = last.length;
  const correct = last.filter((r) => r.is_correct === 1).length;
  const wrongCount = db.prepare(`SELECT COUNT(*) as c FROM marks WHERE user_id = ? AND mark_type = 'wrong'`).get(userId).c;
  const starredCount = db.prepare(`SELECT COUNT(*) as c FROM marks WHERE user_id = ? AND mark_type = 'starred'`).get(userId).c;

  return { ok: true, last50: { done, correct }, wrongCount, starredCount };
});

// 启动
app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
