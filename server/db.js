import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const DB_PATH = process.env.DB_PATH || "./data/data.db";

export function openDb() {
  // 确保目录存在
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return new Database(DB_PATH);
}

export function initDb() {
  const db = openDb();
  const schema = fs.readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  db.exec(schema);
  db.close();
  console.log(`DB initialized at ${DB_PATH}`);
}

if (process.argv[2] === "init") {
  initDb();
}
