-- Tracks metadata for the single chat-history backup blob stored in R2.
-- Single-user deployment: exactly one row (id = 1) ever exists.
CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  updated_at INTEGER NOT NULL,
  size_bytes INTEGER NOT NULL
);
