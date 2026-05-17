import type { LexicalSearch } from './lexicalSearch'
import type { SemanticSearch } from './semanticSearch'
import type { Neo4jDB } from '../storage/neo4j'

export interface HybridSearchResult {
  nodeId: string
  label: string
  type: string
  path: string
  score: number
  lexicalScore: number
  semanticScore: number
}

// Lexical signal weighted higher — direct name matches should win
const LEXICAL_WEIGHT = 0.65
const SEMANTIC_WEIGHT = 0.35

export class HybridSearch {
  constructor(
    private lexical: LexicalSearch,
    private semantic: SemanticSearch,
    private neo4j: Neo4jDB
  ) {}

  async search(query: string, topK: number = 10): Promise<HybridSearchResult[]> {
    const [lexResults, semResults] = await Promise.all([
      this.lexical.search(query, topK * 3),
      this.semantic.search(query, topK * 3)
    ])

    const merged = new Map<string, HybridSearchResult>()

    for (const r of lexResults) {
      merged.set(r.nodeId, {
        nodeId: r.nodeId,
        label: r.label,
        type: r.type,
        path: r.path,
        lexicalScore: r.score,
        semanticScore: 0,
        score: r.score * LEXICAL_WEIGHT
      })
    }

    for (const r of semResults) {
      const existing = merged.get(r.nodeId)
      if (existing) {
        existing.semanticScore = r.score
        existing.score = existing.lexicalScore * LEXICAL_WEIGHT + r.score * SEMANTIC_WEIGHT
      } else {
        // Semantic-only result — resolve node metadata from Neo4j
        const node = await this.neo4j.getNode(r.nodeId as any)
        if (!node) continue
        merged.set(r.nodeId, {
          nodeId: r.nodeId,
          label: node.label,
          type: node.type,
          path: node.path,
          lexicalScore: 0,
          semanticScore: r.score,
          score: r.score * SEMANTIC_WEIGHT
        })
      }
    }

    // Deduplicate by (label, path) — keep highest combined score
    const seen = new Set<string>()
    const sorted = [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .filter(r => {
        const key = `${r.label}:${r.path}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })

    if (sorted.length === 0) return []

    // Adaptive gap filter:
    // - Top has exact label match (=1.0) → very strict 0.9 threshold → only same-quality matches.
    //   e.g. "storage" → storage module dominates → path-match noise filtered out.
    // - Top has strong lexical (≥0.7) → strict 0.75 threshold → cuts semantic-only noise.
    //   e.g. "embedder" → embedder.ts dominates → runScan (semantic-only) gets filtered out.
    // - Top is semantic-only (weak lexical) → lenient 0.55 threshold → returns more results.
    //   e.g. "where is auth handled" → no lexical winner → keep more semantic matches.
    const top = sorted[0]
    const gapFactor = top.lexicalScore >= 1.0 ? 0.9 : top.lexicalScore >= 0.7 ? 0.75 : 0.55
    const threshold = top.score * gapFactor
    return sorted.filter(r => r.score >= threshold).slice(0, topK)
  }
}
