import { nanoid } from "nanoid";

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix = "") {
  return prefix ? `${prefix}_${nanoid(10)}` : nanoid(12);
}

export function safeJsonParse(s, fallback) {
  try {
    return JSON.parse(s);
  } catch {
    return fallback;
  }
}

// 简单 CSV 解析：支持逗号分隔 + 双引号包裹（够用版）
export function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const rows = [];
  for (const line of lines) {
    const row = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        row.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    row.push(cur);
    rows.push(row.map((v) => v.trim()));
  }
  return rows;
}

function normText(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function splitBlanks(s) {
  // 支持：； ; ， , | / 空格（多空填空题）
  const raw = String(s ?? "").trim();
  if (!raw) return [];
  return raw
    .split(/[；;，,|/]+|\s{2,}/g)
    .map((x) => normText(x))
    .filter(Boolean);
}

// 判分：
// - 判断题：answer = true/false 或 "对/错"
// - 单选：answer = "A" 或 "B"
// - 多选：answer = "A,B"（忽略顺序）
// - 填空：支持多空，用分隔符拆分，逐空对比（顺序一致）
// - 文字题：默认严格对比（可后续扩展）
export function grade(type, userAnswer, correctAnswer) {
  const uRaw = String(userAnswer ?? "").trim();
  const cRaw = String(correctAnswer ?? "").trim();

  if (!cRaw) return null; // 无标准答案：自评模式

  if (type === "判断") {
    const toBool = (x) => {
      const s = String(x).trim().toLowerCase();
      if (s === "true" || s === "对" || s === "正确" || s === "t" || s === "1") return true;
      if (s === "false" || s === "错" || s === "错误" || s === "f" || s === "0") return false;
      return null;
    };
    const ub = toBool(uRaw);
    const cb = toBool(cRaw);
    if (ub === null || cb === null) return null;
    return ub === cb;
  }

  if (type === "单选") {
    return uRaw.toUpperCase() === cRaw.toUpperCase();
  }

  if (type === "多选") {
    const norm = (s) =>
      String(s)
        .toUpperCase()
        .split(/[,\s，；;]+/)
        .filter(Boolean)
        .sort()
        .join(",");
    return norm(uRaw) === norm(cRaw);
  }

  if (type === "填空") {
    const uParts = splitBlanks(uRaw);
    const cParts = splitBlanks(cRaw);

    // 单空：允许用户直接输入，不一定写分隔符
    if (cParts.length <= 1) {
      return normText(uRaw) === normText(cRaw);
    }

    // 多空：逐空对比（顺序一致）
    if (uParts.length !== cParts.length) return false;
    for (let i = 0; i < cParts.length; i++) {
      if (uParts[i] !== cParts[i]) return false;
    }
    return true;
  }

  // 其他题型：严格（忽略大小写与多空格）
  return normText(uRaw) === normText(cRaw);
}
