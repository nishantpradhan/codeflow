import { describe, it, expect, vi } from 'vitest'
import { HybridSearch } from '../src/ai/hybridSearch'

// Hybrid search merges lexical + semantic scores with weights:
//   LEXICAL_WEIGHT = 0.65, SEMANTIC_WEIGHT = 0.35
// Then applies an adaptive gap filter:
//   top.lexicalScore >= 1.0 → 0.9  (exact label match — very strict)
//   top.lexicalScore >= 0.7 → 0.75 (strong lexical — strict)
//   else                     → 0.55 (semantic-only — lenient)

function mockLexical(rows: Array<{ nodeId: string; label: string; type: string; path: string; score: number }>) {
  return { search: vi.fn().mockResolvedValue(rows) } as any
}

function mockSemantic(rows: Array<{ nodeId: string; score: number }>) {
  return { search: vi.fn().mockResolvedValue(rows) } as any
}

function mockNeo4j(nodeLookup: Record<string, any> = {}) {
  return {
    getNode: vi.fn().mockImplementation(async (id: string) => nodeLookup[id] ?? null)
  } as any
}

describe('HybridSearch — score fusion', () => {
  it('combines lexical and semantic with correct weights', async () => {
    const lex = mockLexical([
      { nodeId: 'A', label: 'A', type: 'file', path: 'A', score: 1.0 }
    ])
    const sem = mockSemantic([
      { nodeId: 'A', score: 0.5 }
    ])
    const hs = new HybridSearch(lex, sem, mockNeo4j())
    const results = await hs.search('q', 10)

    // 1.0 * 0.65 + 0.5 * 0.35 = 0.825
    expect(results[0].score).toBeCloseTo(0.825, 3)
    expect(results[0].lexicalScore).toBe(1.0)
    expect(results[0].semanticScore).toBe(0.5)
  })

  it('semantic-only results resolve metadata via Neo4j', async () => {
    const lex = mockLexical([])
    const sem = mockSemantic([{ nodeId: 'B', score: 0.8 }])
    const neo4j = mockNeo4j({
      B: { label: 'bee', type: 'function', path: 'src/b.ts' }
    })
    const hs = new HybridSearch(lex, sem, neo4j)
    const results = await hs.search('q', 10)

    expect(results[0].nodeId).toBe('B')
    expect(results[0].label).toBe('bee')
    expect(results[0].score).toBeCloseTo(0.8 * 0.35, 3)
  })

  it('skips semantic-only results when Neo4j returns null (stale embeddings)', async () => {
    const lex = mockLexical([])
    const sem = mockSemantic([{ nodeId: 'missing', score: 0.9 }])
    const hs = new HybridSearch(lex, sem, mockNeo4j())
    const results = await hs.search('q', 10)
    expect(results).toEqual([])
  })
})

describe('HybridSearch — gap filter (adaptive)', () => {
  it('strict 0.9 threshold when top has exact lexical match', async () => {
    // Top = 1.0 lexical → strict filter. Only same-quality matches survive.
    const lex = mockLexical([
      { nodeId: 'top', label: 'storage', type: 'module', path: 'src/storage', score: 1.0 },
      { nodeId: 'noise', label: 'init', type: 'function', path: 'src/storage/neo4j.ts', score: 0.25 }
    ])
    const sem = mockSemantic([])
    const hs = new HybridSearch(lex, sem, mockNeo4j())
    const results = await hs.search('storage', 10)
    // Top score: 1.0 * 0.65 = 0.65 → threshold 0.65 * 0.9 = 0.585
    // Noise: 0.25 * 0.65 = 0.1625 → cut
    expect(results.map(r => r.nodeId)).toEqual(['top'])
  })

  it('strict 0.75 threshold when top has strong lexical match', async () => {
    // Top = 0.9 lexical (startsWith) → strict-ish filter.
    const lex = mockLexical([
      { nodeId: 'top', label: 'embedder.ts', type: 'file', path: 'src/ai/embedder.ts', score: 0.9 }
    ])
    const sem = mockSemantic([
      { nodeId: 'related-semantic', score: 0.7 } // pure semantic noise
    ])
    const neo4j = mockNeo4j({
      'related-semantic': { label: 'runScan', type: 'function', path: 'src/cli/index.ts' }
    })
    const hs = new HybridSearch(lex, sem, neo4j)
    const results = await hs.search('embedder', 10)
    // Top: 0.9 * 0.65 = 0.585. Threshold: 0.585 * 0.75 = 0.439
    // Semantic-only noise: 0.7 * 0.35 = 0.245 → cut
    expect(results.map(r => r.nodeId)).toEqual(['top'])
  })

  it('lenient 0.55 threshold when top has weak lexical', async () => {
    // Top is semantic-heavy (e.g. "where is auth handled" type query).
    // Keep multiple semantic matches.
    const lex = mockLexical([])
    const sem = mockSemantic([
      { nodeId: 'A', score: 0.8 },
      { nodeId: 'B', score: 0.5 }
    ])
    const neo4j = mockNeo4j({
      A: { label: 'A', type: 'function', path: 'src/a.ts' },
      B: { label: 'B', type: 'function', path: 'src/b.ts' }
    })
    const hs = new HybridSearch(lex, sem, neo4j)
    const results = await hs.search('q', 10)
    // Top: 0.8 * 0.35 = 0.28. Threshold: 0.28 * 0.55 = 0.154
    // B: 0.5 * 0.35 = 0.175 → passes
    expect(results.map(r => r.nodeId)).toEqual(['A', 'B'])
  })
})

describe('HybridSearch — dedup', () => {
  it('deduplicates by (label, path) keeping highest combined score', async () => {
    // Two function nodes with the same label+path (e.g. nested closures with same name).
    // Older bug: duplicates polluted the dropdown.
    const lex = mockLexical([
      { nodeId: 'visit-50', label: 'visit', type: 'function', path: 'src/parser/treeSitter.ts', score: 1.0 },
      { nodeId: 'visit-100', label: 'visit', type: 'function', path: 'src/parser/treeSitter.ts', score: 1.0 }
    ])
    const sem = mockSemantic([])
    const hs = new HybridSearch(lex, sem, mockNeo4j())
    const results = await hs.search('visit', 10)
    expect(results).toHaveLength(1)
  })
})

describe('HybridSearch — topK', () => {
  it('respects topK after gap filter', async () => {
    const lex = mockLexical([
      { nodeId: 'A', label: 'A', type: 'file', path: 'A', score: 0.9 },
      { nodeId: 'B', label: 'B', type: 'file', path: 'B', score: 0.9 },
      { nodeId: 'C', label: 'C', type: 'file', path: 'C', score: 0.9 }
    ])
    const sem = mockSemantic([])
    const hs = new HybridSearch(lex, sem, mockNeo4j())
    const results = await hs.search('q', 2)
    expect(results).toHaveLength(2)
  })

  it('returns [] when no results at all', async () => {
    const hs = new HybridSearch(mockLexical([]), mockSemantic([]), mockNeo4j())
    const results = await hs.search('nothing', 10)
    expect(results).toEqual([])
  })
})
