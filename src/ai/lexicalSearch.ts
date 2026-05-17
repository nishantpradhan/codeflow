import type { Neo4jDB } from '../storage/neo4j'

export interface LexicalSearchResult {
  nodeId: string
  label: string
  type: string
  path: string
  score: number
}

export class LexicalSearch {
  constructor(private neo4j: Neo4jDB) {}

  async search(query: string, topK: number = 20): Promise<LexicalSearchResult[]> {
    const q = query.trim()
    if (!q) return []

    const raw = await this.neo4j.searchNodes(q, topK * 3)

    return raw
      .map(n => ({ ...n, score: this._score(n.label, n.path, q) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(n => ({ nodeId: n.id, label: n.label, type: n.type, path: n.path, score: n.score }))
  }

  private _score(label: string, path: string, query: string): number {
    const l = label.toLowerCase()
    const q = query.toLowerCase()
    if (l === q) return 1.0
    if (l.startsWith(q)) return 0.9
    if (l.includes(q)) return 0.75
    // Path-only matches lowered: "storage" matches all functions in src/storage/
    // at the same score as their parent module, causing them to flood results.
    if (path.toLowerCase().includes(q)) return 0.25
    return 0.1
  }
}
