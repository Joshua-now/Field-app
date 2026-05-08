/**
 * Bob Knowledge Base
 * Chunks text → generates embeddings via OpenRouter → stores in Postgres
 * Retrieval: cosine similarity search to inject context into Bob's system prompt
 */

import axios from "axios";
import { db } from "../db";
import { bobKnowledge, bobKnowledgeChunks } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const EMBEDDING_MODEL    = "openai/text-embedding-3-small";
const CHUNK_SIZE         = 800;   // characters
const CHUNK_OVERLAP      = 100;   // characters
const TOP_K              = 5;     // chunks to retrieve per query

// ─── CHUNKING ─────────────────────────────────────────────────────────────────

function chunkText(text: string): string[] {
  const chunks: string[] = [];
  let start = 0;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  while (start < normalized.length) {
    let end = start + CHUNK_SIZE;
    // Try to break at a paragraph or sentence boundary
    if (end < normalized.length) {
      const paraBreak = normalized.lastIndexOf("\n\n", end);
      const sentBreak = normalized.lastIndexOf(". ", end);
      if (paraBreak > start + CHUNK_SIZE / 2) end = paraBreak + 2;
      else if (sentBreak > start + CHUNK_SIZE / 2) end = sentBreak + 2;
    }
    const chunk = normalized.slice(start, end).trim();
    if (chunk.length > 0) chunks.push(chunk);
    start = end - CHUNK_OVERLAP;
    if (start >= normalized.length) break;
  }
  return chunks;
}

// ─── EMBEDDINGS ───────────────────────────────────────────────────────────────

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!OPENROUTER_API_KEY) {
    console.warn("[Knowledge] No OPENROUTER_API_KEY — skipping embedding");
    return null;
  }
  try {
    const res = await axios.post(
      "https://openrouter.ai/api/v1/embeddings",
      { model: EMBEDDING_MODEL, input: text },
      {
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 15000,
      }
    );
    return res.data?.data?.[0]?.embedding ?? null;
  } catch (e: any) {
    console.error("[Knowledge] Embedding error:", e?.message);
    return null;
  }
}

async function getEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
  // Rate-limit: batch in groups of 10 with small delay
  const results: (number[] | null)[] = [];
  for (let i = 0; i < texts.length; i += 10) {
    const batch = texts.slice(i, i + 10);
    const batchResults = await Promise.all(batch.map(getEmbedding));
    results.push(...batchResults);
    if (i + 10 < texts.length) await new Promise(r => setTimeout(r, 200));
  }
  return results;
}

// ─── INGEST ───────────────────────────────────────────────────────────────────

export async function ingestKnowledge(
  tenantId: string,
  title: string,
  content: string,
  category = "general"
): Promise<{ id: number; chunkCount: number }> {
  // 1. Save the parent document
  const [doc] = await db
    .insert(bobKnowledge)
    .values({ tenantId, title, content, category })
    .returning();

  // 2. Chunk
  const chunks = chunkText(content);

  // 3. Embed
  const embeddings = await getEmbeddings(chunks);

  // 4. Store chunks
  for (let i = 0; i < chunks.length; i++) {
    const embedding = embeddings[i];
    const embeddingJson = embedding ? JSON.stringify(embedding) : null;

    await db.insert(bobKnowledgeChunks).values({
      knowledgeId: doc.id,
      tenantId,
      chunkIndex: i,
      content: chunks[i],
      embeddingJson,
    });

    // If pgvector is available, update the vector column directly
    if (embedding) {
      try {
        await db.execute(
          sql`UPDATE bob_knowledge_chunks
              SET embedding = ${`[${embedding.join(",")}]`}::vector
              WHERE knowledge_id = ${doc.id} AND chunk_index = ${i}`
        );
      } catch {
        // pgvector not enabled — embeddingJson fallback still stored
      }
    }
  }

  console.log(`[Knowledge] Ingested "${title}" → ${chunks.length} chunks`);
  return { id: doc.id, chunkCount: chunks.length };
}

// ─── RETRIEVAL ────────────────────────────────────────────────────────────────

export async function retrieveRelevantChunks(
  tenantId: string,
  query: string,
  topK = TOP_K
): Promise<string[]> {
  // Try vector similarity first
  const queryEmbedding = await getEmbedding(query);

  if (queryEmbedding) {
    try {
      const vectorStr = `[${queryEmbedding.join(",")}]`;
      const rows = await db.execute(
        sql`SELECT content
            FROM bob_knowledge_chunks bkc
            JOIN bob_knowledge bk ON bk.id = bkc.knowledge_id
            WHERE bkc.tenant_id = ${tenantId}
              AND bk.is_active = true
              AND bkc.embedding IS NOT NULL
            ORDER BY bkc.embedding <=> ${vectorStr}::vector
            LIMIT ${topK}`
      ) as any;
      if (rows.rows?.length > 0) {
        return rows.rows.map((r: any) => r.content as string);
      }
    } catch {
      // Fall through to keyword search
    }
  }

  // Fallback: Postgres full-text search
  try {
    const rows = await db.execute(
      sql`SELECT bkc.content
          FROM bob_knowledge_chunks bkc
          JOIN bob_knowledge bk ON bk.id = bkc.knowledge_id
          WHERE bkc.tenant_id = ${tenantId}
            AND bk.is_active = true
            AND to_tsvector('english', bkc.content) @@ plainto_tsquery('english', ${query})
          LIMIT ${topK}`
    ) as any;
    if (rows.rows?.length > 0) {
      return rows.rows.map((r: any) => r.content as string);
    }
  } catch {
    // If all else fails, return empty
  }

  return [];
}

// ─── CONTEXT BUILDER (called from agent.ts) ───────────────────────────────────

export async function buildKnowledgeContext(tenantId: string, userMessage: string): Promise<string> {
  const chunks = await retrieveRelevantChunks(tenantId, userMessage);
  if (chunks.length === 0) return "";

  return [
    "## Company Knowledge Base",
    "The following information from this company's knowledge base may be relevant to the question:",
    "",
    ...chunks.map((c, i) => `[${i + 1}] ${c}`),
    "",
  ].join("\n");
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function deleteKnowledge(tenantId: string, knowledgeId: number): Promise<void> {
  await db
    .delete(bobKnowledge)
    .where(and(eq(bobKnowledge.id, knowledgeId), eq(bobKnowledge.tenantId, tenantId)));
}

export { bobKnowledge, bobKnowledgeChunks };
