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
    rows.push(row.map(v => v.trim()));
  }
  return rows;
}

// 判分：
// - 判断题：answer = true/false 或 "对/错"
// - 单选：answer = "A" 或 "B"
// - 多选：answer = "A,B" 之类（忽略顺序）
// - 填空：默认严格匹配；你也可以后续扩展模糊匹配
export function grade(type, userAnswer, correctAnswer) {
  const u = (userAnswer ?? "").trim();
  const c = (correctAnswer ?? "").trim();

  if (!c) return null; // 无标准答案：自评模式

  if (type === "判断") {
    const toBool = (x) => {
      const s = String(x).trim().toLowerCase();
      if (s === "true" || s === "对" || s === "正确" || s === "t" || s === "1") return true;
      if (s === "false" || s === "错" || s === "错误" || s === "f" || s === "0") return false;
      return null;
    };
    const ub = toBool(u);
    const cb = toBool(c);
    if (ub === null || cb === null) return null;
    return ub === cb;
  }

  if (type === "单选") {
    return u.toUpperCase() === c.toUpperCase();
  }

  if (type === "多选") {
    const norm = (s) =>
      s.toUpperCase()
        .split(/[,\s，；;]+/)
        .filter(Boolean)
        .sort()
        .join(",");
    return norm(u) === norm(c);
  }

  // 填空/其他：严格相等（后续可升级为分隔符集合对比）
  return u === c;
}
