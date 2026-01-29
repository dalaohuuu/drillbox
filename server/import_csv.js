import fs from "fs";
import dotenv from "dotenv";
import { openDb } from "./db.js";
import { parseCsv, nowIso, newId, safeJsonParse } from "./utils.js";

dotenv.config();

const csvPath = process.argv[2] || "./data/sample_questions.csv";

const text = fs.readFileSync(csvPath, "utf8");
const rows = parseCsv(text);
if (rows.length < 2) {
  console.error("CSV empty or missing header.");
  process.exit(1);
}

const header = rows[0].map(h => h.trim().toLowerCase());
const col = (name) => header.indexOf(name);

const db = openDb();

const ins = db.prepare(`
  INSERT OR REPLACE INTO questions
  (id, type, section, stem, options_json, answer, analysis)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

let count = 0;
db.transaction(() => {
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];

    const id = r[col("id")] || newId("q");
    const type = r[col("type")] || "填空";
    const section = r[col("section")] || "";
    const stem = r[col("stem")] || "";
    const optionsRaw = r[col("options")] || "";
    const answer = r[col("answer")] || "";
    const analysis = r[col("analysis")] || "";

    if (!stem) continue;

    // options: 若用户给了 JSON 数组，存回字符串；否则空
    let options_json = "";
    if (optionsRaw) {
      const parsed = safeJsonParse(optionsRaw, null);
      if (Array.isArray(parsed)) options_json = JSON.stringify(parsed);
      else options_json = ""; // 不合法则忽略
    }

    ins.run(id, type, section, stem, options_json, answer, analysis);
    count++;
  }
})();

db.close();
console.log(`Imported ${count} questions from ${csvPath} at ${nowIso()}`);
