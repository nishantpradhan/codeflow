import { describe, it, expect, vi } from 'vitest'
import { LexicalSearch } from '../src/ai/lexicalSearch'

// Lexical search is a thin scoring wrapper over Neo4j.searchNodes.
// We mock Neo4j to return controlled rows, then assert on the scoring tiers.

function mockNeo4j(rows: Array<{ id: string; label: string; type: string; path: string }>) {
  return { searchNodes: vi.fn().mockResolvedValue(rows) } as any
}

describe('LexicalSearch — scoring tiers', () => {
  it('exact label match scores 1.0', async () => {
    const search = new LexicalSearch(mockNeo4j([
      { id: 'src/storage:module', label: 'storage', type: 'module', path: 'src/storage' }
    ]))
    const results = await search.search('storage', 10)
    expect(results[0].score).toBe(1.0)
  })

  it('startsWith label match scores 0.9', async () => {
    const search = new LexicalSearch(mockNeo4j([
      { id: 'src/parser/treeSitter.ts:file', label: 'treeSitter.ts', type: 'file', path: 'src/parser/treeSitter.ts' }
    ]))
    const results = await search.search('treeSitter', 10)
    expect(results[0].score).toBe(0.9)
  })

  it('contains label match scores 0.75', async () => {
    const search = new LexicalSearch(mockNeo4j([
      { id: 'fn1', label: 'extractFunctions', type: 'function', path: 'src/parser/treeSitter.ts' }
    ]))
    const results = await search.search('function', 10)
    expect(results[0].score).toBe(0.75)
  })

  it('path-only match scores 0.25 (lowered to suppress flood)', async () => {
    // "storage" matches the PATH of neo4j.ts (src/storage/neo4j.ts), not the label.
    // This used to score 0.5 and flooded results with storage-folder functions.
    const search = new LexicalSearch(mockNeo4j([
      { id: 'fn2', label: 'propertiesToNode', type: 'function', path: 'src/storage/neo4j.ts' }
    ]))
    const results = await search.search('storage', 10)
    expect(results[0].score).toBe(0.25)
  })

  it('no match scores 0.1 (Neo4j CONTAINS still returns it, but rank it last)', async () => {
    const search = new LexicalSearch(mockNeo4j([
      { id: 'unrelated', label: 'aBc', type: 'file', path: 'x/y' }
    ]))
    const results = await search.search('zzz', 10)
    expect(results[0].score).toBe(0.1)
  })

  it('orders results by score descending', async () => {
    const search = new LexicalSearch(mockNeo4j([
      { id: 'fn-path', label: 'something', type: 'function', path: 'src/storage/x.ts' }, // path-only 0.25
      { id: 'fn-exact', label: 'storage', type: 'module', path: 'src/storage' }, // exact 1.0
      { id: 'fn-starts', label: 'storageHelper', type: 'function', path: 'src/x.ts' } // startsWith 0.9
    ]))
    const results = await search.search('storage', 10)
    expect(results.map(r => r.score)).toEqual([1.0, 0.9, 0.25])
  })

  it('respects topK slicing', async () => {
    const search = new LexicalSearch(mockNeo4j([
      { id: 'a', label: 'storage', type: 'module', path: 'src/storage' },
      { id: 'b', label: 'storageX', type: 'file', path: 'src/storage/x.ts' },
      { id: 'c', label: 'storageY', type: 'file', path: 'src/storage/y.ts' }
    ]))
    const results = await search.search('storage', 2)
    expect(results).toHaveLength(2)
  })

  it('returns [] for empty query', async () => {
    const search = new LexicalSearch(mockNeo4j([]))
    const results = await search.search('   ', 10)
    expect(results).toEqual([])
  })
})
