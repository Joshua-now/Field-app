-- Migration: Bob Knowledge Base (pgvector + tables)
-- Run in Railway Postgres console BEFORE deploying

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Knowledge documents (one per uploaded article/policy/manual)
CREATE TABLE IF NOT EXISTS bob_knowledge (
  id          serial PRIMARY KEY,
  tenant_id   varchar NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title       text NOT NULL,
  content     text NOT NULL,
  category    text NOT NULL DEFAULT 'general',
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamp DEFAULT now(),
  updated_at  timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bob_knowledge_tenant ON bob_knowledge(tenant_id);

-- 3. Chunks with vector embeddings (1536-dim for text-embedding-3-small)
CREATE TABLE IF NOT EXISTS bob_knowledge_chunks (
  id            serial PRIMARY KEY,
  knowledge_id  integer NOT NULL REFERENCES bob_knowledge(id) ON DELETE CASCADE,
  tenant_id     varchar NOT NULL,
  chunk_index   integer NOT NULL,
  content       text NOT NULL,
  embedding     vector(1536),
  embedding_json text,
  created_at    timestamp DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bob_chunks_knowledge ON bob_knowledge_chunks(knowledge_id);
CREATE INDEX IF NOT EXISTS idx_bob_chunks_tenant    ON bob_knowledge_chunks(tenant_id);

-- 4. IVFFlat index for fast similarity search (build after first data load)
-- CREATE INDEX ON bob_knowledge_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
