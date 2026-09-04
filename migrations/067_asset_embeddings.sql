CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS asset_embeddings (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES team_assets(id) ON DELETE CASCADE,
  source_revision INTEGER NOT NULL CHECK (source_revision > 0),
  source_kind TEXT NOT NULL CHECK (
    source_kind IN ('metadata', 'transcription', 'ocr', 'vision')
  ),
  sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence >= 0),
  content_text TEXT NOT NULL DEFAULT '',
  input_sha256 TEXT NOT NULL CHECK (input_sha256 ~ '^[0-9a-f]{64}$'),
  provider TEXT NOT NULL CHECK (length(btrim(provider)) > 0),
  model TEXT NOT NULL CHECK (length(btrim(model)) > 0),
  dimensions INTEGER NOT NULL CHECK (dimensions > 0),
  embedding vector NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT asset_embeddings_vector_dimensions_check
    CHECK (vector_dims(embedding) = dimensions),
  CONSTRAINT asset_embeddings_source_unique
    UNIQUE (
      asset_id,
      source_revision,
      source_kind,
      sequence,
      provider,
      model
    )
);

CREATE INDEX IF NOT EXISTS asset_embeddings_asset_revision_idx
  ON asset_embeddings (asset_id, source_revision);

CREATE INDEX IF NOT EXISTS asset_embeddings_model_idx
  ON asset_embeddings (provider, model, dimensions);

-- Mixed dimensions cannot share a pgvector HNSW index. Add a model-specific
-- partial index after the production embedding model and dimensions are fixed.
