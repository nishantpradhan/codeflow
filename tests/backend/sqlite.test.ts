import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SQLiteDB } from '../../src/storage/sqlite'
import type { ParsedFile, CacheRecord } from '../../shared/types'

const makeParsedFile = (path: string, hash = 'abc123'): ParsedFile => ({
  path,
  hash,
  language: 'typescript',
  lineCount: 50,
  imports: [{ source: 'express', names: ['Router'], isDefault: false, isExternal: true, lineNumber: 1 }],
  exports: [{ name: 'handler', type: 'function', lineNumber: 10 }],
  functions: [{ name: 'handler', lineStart: 10, lineEnd: 20, isExported: true, isAsync: true, isMethod: false, params: [], returnType: 'void', calls: [] }],
  parsedAt: new Date('2024-01-01T00:00:00Z')
})

const makeCacheRecord = (path: string): CacheRecord => ({
  path,
  hash: 'def456',
  nodeId: `${path}:file` as any,
  parsedAt: new Date('2024-01-01T00:00:00Z')
})

describe('SQLiteDB', () => {
  let db: SQLiteDB

  beforeEach(async () => {
    db = new SQLiteDB(':memory:')
    await db.init()
  })

  afterEach(() => {
    db.close()
  })

  // ── AST Cache ──────────────────────────────────────────────────

  describe('AST Cache', () => {
    it('stores and retrieves a parsed file', () => {
      const file = makeParsedFile('src/index.ts')
      db.storeASTCache(file)

      const result = db.getASTCache('src/index.ts')
      expect(result).not.toBeNull()
      expect(result!.path).toBe('src/index.ts')
      expect(result!.hash).toBe('abc123')
      expect(result!.language).toBe('typescript')
      expect(result!.lineCount).toBe(50)
      expect(result!.imports).toHaveLength(1)
      expect(result!.functions).toHaveLength(1)
    })

    it('returns null for a missing path', () => {
      expect(db.getASTCache('nonexistent.ts')).toBeNull()
    })

    it('overwrites an existing entry on duplicate path', () => {
      db.storeASTCache(makeParsedFile('src/index.ts', 'hash1'))
      db.storeASTCache(makeParsedFile('src/index.ts', 'hash2'))

      const result = db.getASTCache('src/index.ts')
      expect(result!.hash).toBe('hash2')
    })

    it('retrieves a cached file by hash', () => {
      db.storeASTCache(makeParsedFile('src/util.ts', 'unique-hash'))
      const result = db.getASTCacheByHash('unique-hash')
      expect(result).not.toBeNull()
      expect(result!.path).toBe('src/util.ts')
    })

    it('returns null when hash does not exist', () => {
      expect(db.getASTCacheByHash('missing-hash')).toBeNull()
    })

    it('deletes a cache entry', () => {
      db.storeASTCache(makeParsedFile('src/delete-me.ts'))
      db.deleteASTCache('src/delete-me.ts')
      expect(db.getASTCache('src/delete-me.ts')).toBeNull()
    })

    it('returns all cached paths', () => {
      db.storeASTCache(makeParsedFile('src/a.ts'))
      db.storeASTCache(makeParsedFile('src/b.ts'))
      db.storeASTCache(makeParsedFile('src/c.ts'))

      const paths = db.getAllASTCachePaths()
      expect(paths).toHaveLength(3)
      expect(paths).toContain('src/a.ts')
      expect(paths).toContain('src/c.ts')
    })

    it('preserves parsedAt as a Date', () => {
      db.storeASTCache(makeParsedFile('src/dates.ts'))
      const result = db.getASTCache('src/dates.ts')
      expect(result!.parsedAt).toBeInstanceOf(Date)
      expect(result!.parsedAt.toISOString()).toBe('2024-01-01T00:00:00.000Z')
    })
  })

  // ── Cache Records ──────────────────────────────────────────────

  describe('Cache Records', () => {
    it('stores and retrieves a cache record', () => {
      const record = makeCacheRecord('src/server.ts')
      db.storeCacheRecord(record)

      const result = db.getCacheRecord('src/server.ts')
      expect(result).not.toBeNull()
      expect(result!.path).toBe('src/server.ts')
      expect(result!.hash).toBe('def456')
      expect(result!.nodeId).toBe('src/server.ts:file')
    })

    it('returns null for a missing path', () => {
      expect(db.getCacheRecord('nonexistent.ts')).toBeNull()
    })

    it('retrieves a record by node ID', () => {
      db.storeCacheRecord(makeCacheRecord('src/auth.ts'))
      const result = db.getCacheRecordByNodeId('src/auth.ts:file' as any)
      expect(result).not.toBeNull()
      expect(result!.path).toBe('src/auth.ts')
    })

    it('returns null when node ID is missing', () => {
      expect(db.getCacheRecordByNodeId('no-such-node:file' as any)).toBeNull()
    })

    it('deletes a cache record', () => {
      db.storeCacheRecord(makeCacheRecord('src/remove.ts'))
      db.deleteCacheRecord('src/remove.ts')
      expect(db.getCacheRecord('src/remove.ts')).toBeNull()
    })

    it('returns all cache records', () => {
      db.storeCacheRecord(makeCacheRecord('src/a.ts'))
      db.storeCacheRecord(makeCacheRecord('src/b.ts'))

      const all = db.getAllCacheRecords()
      expect(all).toHaveLength(2)
      expect(all.map(r => r.path)).toContain('src/a.ts')
    })
  })

  // ── Patterns ───────────────────────────────────────────────────

  describe('Patterns', () => {
    it('stores and retrieves patterns by file', () => {
      db.storePattern('id-1', 'src/routes.ts', 'function', 'getUser', 5, 15)
      db.storePattern('id-2', 'src/routes.ts', 'function', 'createUser', 20, 35)

      const patterns = db.getPatternsByFile('src/routes.ts')
      expect(patterns).toHaveLength(2)
      expect(patterns[0].name).toBe('getUser')
      expect(patterns[0].lineStart).toBe(5)
      expect(patterns[1].name).toBe('createUser')
    })

    it('returns empty array for file with no patterns', () => {
      expect(db.getPatternsByFile('src/empty.ts')).toHaveLength(0)
    })

    it('retrieves patterns by pattern type', () => {
      db.storePattern('id-3', 'src/a.ts', 'arrow', 'handler', 1, 5)
      db.storePattern('id-4', 'src/b.ts', 'arrow', 'middleware', 1, 5)
      db.storePattern('id-5', 'src/c.ts', 'function', 'init', 1, 5)

      const arrows = db.getPatternsByName('arrow')
      expect(arrows).toHaveLength(2)
      expect(arrows.map(p => p.name)).toContain('handler')
      expect(arrows.map(p => p.name)).toContain('middleware')
    })

    it('deletes all patterns for a file', () => {
      db.storePattern('id-6', 'src/delete.ts', 'function', 'fn', 1, 10)
      db.storePattern('id-7', 'src/delete.ts', 'function', 'fn2', 11, 20)
      db.deletePatternsByFile('src/delete.ts')

      expect(db.getPatternsByFile('src/delete.ts')).toHaveLength(0)
    })
  })

  // ── Statistics ─────────────────────────────────────────────────

  describe('Statistics', () => {
    it('returns zero stats on empty db', () => {
      const ast = db.getASTCacheStats()
      expect(ast.totalRecords).toBe(0)
      expect(ast.totalBytes).toBe(0)

      const pat = db.getPatternStats()
      expect(pat.totalPatterns).toBe(0)
      expect(pat.patternTypes).toBe(0)

      const rec = db.getCacheRecordStats()
      expect(rec.totalRecords).toBe(0)
      expect(rec.lastParsedAt).toBeNull()
    })

    it('counts AST cache records and bytes', () => {
      db.storeASTCache(makeParsedFile('src/x.ts'))
      db.storeASTCache(makeParsedFile('src/y.ts'))

      const stats = db.getASTCacheStats()
      expect(stats.totalRecords).toBe(2)
      expect(stats.totalBytes).toBeGreaterThan(0)
    })

    it('counts distinct pattern types', () => {
      db.storePattern('p1', 'src/a.ts', 'function', 'fn1', 1, 5)
      db.storePattern('p2', 'src/b.ts', 'function', 'fn2', 1, 5)
      db.storePattern('p3', 'src/c.ts', 'arrow', 'fn3', 1, 5)

      const stats = db.getPatternStats()
      expect(stats.totalPatterns).toBe(3)
      expect(stats.patternTypes).toBe(2)
    })

    it('tracks last parsed timestamp in cache records', () => {
      db.storeCacheRecord(makeCacheRecord('src/a.ts'))

      const stats = db.getCacheRecordStats()
      expect(stats.totalRecords).toBe(1)
      expect(stats.lastParsedAt).not.toBeNull()
    })
  })
})
