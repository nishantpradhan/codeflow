import Database from 'better-sqlite3'
import type { VectorStore, VectorSearchResult } from './vectorStore'

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

export class SQLiteVectorStore implements VectorStore {
  private db: Database.Database

  constructor(db: Database.Database) {
    this.db = db
  }

  async upsert(nodeId: string, model: string, vector: number[]): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO embeddings (node_id, model, vector, indexed_at)
      VALUES (?, ?, ?, ?)
    `)
    stmt.run(nodeId, model, JSON.stringify(vector), new Date().toISOString())
  }

  async search(queryVector: number[], topK: number): Promise<VectorSearchResult[]> {
    const rows = this.db.prepare('SELECT node_id, vector FROM embeddings').all() as any[]

    return rows
      .map(row => ({
        nodeId: row.node_id,
        score: cosineSimilarity(queryVector, JSON.parse(row.vector))
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
  }

  async delete(nodeId: string): Promise<void> {
    this.db.prepare('DELETE FROM embeddings WHERE node_id = ?').run(nodeId)
  }

  async has(nodeId: string): Promise<boolean> {
    const row = this.db.prepare('SELECT 1 FROM embeddings WHERE node_id = ?').get(nodeId)
    return row !== undefined
  }

  async count(): Promise<number> {
    const row = this.db.prepare('SELECT COUNT(*) as n FROM embeddings').get() as any
    return row.n
  }
}
