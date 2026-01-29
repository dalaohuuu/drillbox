PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,          -- 填空/单选/多选/判断
  section TEXT DEFAULT '',     -- 章节/题型大类
  stem TEXT NOT NULL,
  options_json TEXT DEFAULT '', -- JSON数组字符串，选择题用
  answer TEXT DEFAULT '',       -- 可为空：为空则走自评
  analysis TEXT DEFAULT ''      -- 可选
);

CREATE INDEX IF NOT EXISTS idx_questions_type ON questions(type);
CREATE INDEX IF NOT EXISTS idx_questions_section ON questions(section);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_text TEXT DEFAULT '',
  is_correct INTEGER,          -- 1/0/NULL（自评前可NULL）
  mode TEXT DEFAULT 'normal',  -- normal/wrong/starred
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(question_id) REFERENCES questions(id)
);

CREATE INDEX IF NOT EXISTS idx_attempts_user_time ON attempts(user_id, created_at);

CREATE TABLE IF NOT EXISTS marks (
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  mark_type TEXT NOT NULL,     -- wrong/starred
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, question_id, mark_type),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(question_id) REFERENCES questions(id)
);

CREATE INDEX IF NOT EXISTS idx_marks_user_type ON marks(user_id, mark_type);
