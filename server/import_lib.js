import { parseCsv, safeJsonParse } from "./utils.js";

/**
 * DrillBox CSV 期望表头：
 * id,type,section,stem,options,answer,analysis
 *
 * options: 选择题用 JSON 数组字符串，如 ["A.xxx","B.yyy"]
 */
export function importQuestionsFromCsvText(db, csvText, { defaultSection = "导入题库" } = {}) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { inserted: 0, skipped: 0, failed: 0, errors: [{ row: 0, error: "CSV 为空或无数据行" }] };
  }

  const header = rows[0].map((x) => String(x || "").trim());
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));

  const required = ["id", "type", "stem"];
  for (const k of required) {
    if (!(k in idx)) {
      return { inserted: 0, skipped: 0, failed: 0, errors: [{ row: 0, error: `缺少表头字段：${k}` }] };
    }
  }

  const ins = db.prepare(`
    INSERT OR IGNORE INTO questions (id, type, section, stem, options_json, answer, analysis)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  db.transaction(() => {
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const get = (k) => (idx[k] != null ? row[idx[k]] : "");

      const id = String(get("id") || "").trim();
      const type = String(get("type") || "").trim();
      const section = String(get("section") || "").trim() || defaultSection;
      const stem = String(get("stem") || "").trim();
      const optionsRaw = String(get("options") || "").trim();
      const answer = String(get("answer") || "").trim();
      const analysis = String(get("analysis") || "").trim();

      if (!id || !type || !stem) {
        failed++;
        errors.push({ row: r + 1, error: "id/type/stem 不能为空" });
        continue;
      }

      // options 规范化：空 -> ""
      // 如果是 JSON 字符串 -> 确保是数组
      let options_json = "";
      if (optionsRaw) {
        const parsed = safeJsonParse(optionsRaw, null);
        if (Array.isArray(parsed)) {
          options_json = JSON.stringify(parsed);
        } else {
          failed++;
          errors.push({ row: r + 1, error: "options 必须是 JSON 数组字符串，如 [\"A...\",\"B...\"]" });
          continue;
        }
      } else {
        options_json = "";
      }

      try {
        const info = ins.run(id, type, section, stem, options_json, answer, analysis);
        if (info.changes === 1) inserted++;
        else skipped++;
      } catch (e) {
        failed++;
        errors.push({ row: r + 1, error: `写入失败：${e.message}` });
      }
    }
  })();

  return { inserted, skipped, failed, errors: errors.slice(0, 20) };
}