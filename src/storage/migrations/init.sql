-- ============================================================
-- SQLite Schema — Phase 1
-- Core parsed file data, extracted patterns, cache records
-- ============================================================

-- Raw AST and file metadata
CREATE TABLE IF NOT EXISTS ast_cache (
  path        TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  ast_json    TEXT NOT NULL,
  parsed_at   DATETIME NOT NULL,
  language    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ast_cache_hash ON ast_cache(hash);
CREATE INDEX IF NOT EXISTS idx_ast_cache_parsed_at ON ast_cache(parsed_at);

-- Extracted patterns from ast-grep
CREATE TABLE IF NOT EXISTS patterns (
  id          TEXT PRIMARY KEY,
  file_path   TEXT NOT NULL,
  pattern     TEXT NOT NULL,
  name        TEXT NOT NULL,
  line_start  INTEGER,
  line_end    INTEGER
);

CREATE INDEX IF NOT EXISTS idx_patterns_file_path ON patterns(file_path);
CREATE INDEX IF NOT EXISTS idx_patterns_pattern ON patterns(pattern);
CREATE INDEX IF NOT EXISTS idx_patterns_name ON patterns(name);

-- Cache record per node (deterministic ID + hash)
CREATE TABLE IF NOT EXISTS cache_records (
  path        TEXT PRIMARY KEY,
  hash        TEXT NOT NULL,
  node_id     TEXT NOT NULL,
  parsed_at   DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cache_records_hash ON cache_records(hash);
CREATE INDEX IF NOT EXISTS idx_cache_records_node_id ON cache_records(node_id);
CREATE INDEX IF NOT EXISTS idx_cache_records_parsed_at ON cache_records(parsed_at);
