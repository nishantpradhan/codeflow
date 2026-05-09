import Database from 'better-sqlite3'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { ParsedFile, CacheRecord, NodeId } from '../../shared/types'

export class SQLiteDB {
  private db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
  }

  init(): void {
    const initSql = readFileSync(
      resolve(__dirname, '../storage/migrations/init.sql'),
      'utf-8'
    )
    this.db.exec(initSql)
  }

  close(): void {
    this.db.close()
  }

  // ============================================================
  // AST Cache operations
  // ============================================================

  storeASTCache(parsed: ParsedFile): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO ast_cache (path, hash, ast_json, parsed_at, language)
      VALUES (?, ?, ?, ?, ?)
    `)

    stmt.run(
      parsed.path,
      parsed.hash,
      JSON.stringify({
        imports: parsed.imports,
        exports: parsed.exports,
        functions: parsed.functions,
        lineCount: parsed.lineCount
      }),
      parsed.parsedAt.toISOString(),
      parsed.language
    )
  }

  getASTCache(filePath: string): ParsedFile | null {
    const stmt = this.db.prepare(`
      SELECT path, hash, ast_json, parsed_at, language
      FROM ast_cache
      WHERE path = ?
    `)

    const row = stmt.get(filePath) as any
    if (!row) return null

    const astData = JSON.parse(row.ast_json)
    return {
      path: row.path,
      hash: row.hash,
      language: row.language,
      lineCount: astData.lineCount,
      imports: astData.imports,
      exports: astData.exports,
      functions: astData.functions,
      parsedAt: new Date(row.parsed_at)
    }
  }

  getASTCacheByHash(hash: string): ParsedFile | null {
    const stmt = this.db.prepare(`
      SELECT path, hash, ast_json, parsed_at, language
      FROM ast_cache
      WHERE hash = ?
    `)

    const row = stmt.get(hash) as any
    if (!row) return null

    const astData = JSON.parse(row.ast_json)
    return {
      path: row.path,
      hash: row.hash,
      language: row.language,
      lineCount: astData.lineCount,
      imports: astData.imports,
      exports: astData.exports,
      functions: astData.functions,
      parsedAt: new Date(row.parsed_at)
    }
  }

  deleteASTCache(filePath: string): void {
    const stmt = this.db.prepare('DELETE FROM ast_cache WHERE path = ?')
    stmt.run(filePath)
  }

  getAllASTCachePaths(): string[] {
    const stmt = this.db.prepare('SELECT path FROM ast_cache')
    return stmt.all().map((row: any) => row.path)
  }

  // ============================================================
  // Cache Record operations
  // ============================================================

  storeCacheRecord(record: CacheRecord): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache_records (path, hash, node_id, parsed_at)
      VALUES (?, ?, ?, ?)
    `)

    stmt.run(
      record.path,
      record.hash,
      record.nodeId,
      record.parsedAt.toISOString()
    )
  }

  getCacheRecord(filePath: string): CacheRecord | null {
    const stmt = this.db.prepare(`
      SELECT path, hash, node_id, parsed_at
      FROM cache_records
      WHERE path = ?
    `)

    const row = stmt.get(filePath) as any
    if (!row) return null

    return {
      path: row.path,
      hash: row.hash,
      nodeId: row.node_id as NodeId,
      parsedAt: new Date(row.parsed_at)
    }
  }

  getCacheRecordByNodeId(nodeId: NodeId): CacheRecord | null {
    const stmt = this.db.prepare(`
      SELECT path, hash, node_id, parsed_at
      FROM cache_records
      WHERE node_id = ?
    `)

    const row = stmt.get(nodeId) as any
    if (!row) return null

    return {
      path: row.path,
      hash: row.hash,
      nodeId: row.node_id as NodeId,
      parsedAt: new Date(row.parsed_at)
    }
  }

  deleteCacheRecord(filePath: string): void {
    const stmt = this.db.prepare('DELETE FROM cache_records WHERE path = ?')
    stmt.run(filePath)
  }

  getAllCacheRecords(): CacheRecord[] {
    const stmt = this.db.prepare(`
      SELECT path, hash, node_id, parsed_at
      FROM cache_records
    `)

    return stmt.all().map((row: any) => ({
      path: row.path,
      hash: row.hash,
      nodeId: row.node_id as NodeId,
      parsedAt: new Date(row.parsed_at)
    }))
  }

  // ============================================================
  // Pattern operations
  // ============================================================

  storePattern(
    id: string,
    filePath: string,
    pattern: string,
    name: string,
    lineStart: number,
    lineEnd: number
  ): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO patterns (id, file_path, pattern, name, line_start, line_end)
      VALUES (?, ?, ?, ?, ?, ?)
    `)

    stmt.run(id, filePath, pattern, name, lineStart, lineEnd)
  }

  getPatternsByFile(filePath: string): Array<{
    id: string
    pattern: string
    name: string
    lineStart: number
    lineEnd: number
  }> {
    const stmt = this.db.prepare(`
      SELECT id, pattern, name, line_start, line_end
      FROM patterns
      WHERE file_path = ?
    `)

    return stmt.all(filePath).map((row: any) => ({
      id: row.id,
      pattern: row.pattern,
      name: row.name,
      lineStart: row.line_start,
      lineEnd: row.line_end
    }))
  }

  getPatternsByName(patternName: string): Array<{
    id: string
    filePath: string
    name: string
    lineStart: number
    lineEnd: number
  }> {
    const stmt = this.db.prepare(`
      SELECT id, file_path, name, line_start, line_end
      FROM patterns
      WHERE pattern = ?
    `)

    return stmt.all(patternName).map((row: any) => ({
      id: row.id,
      filePath: row.file_path,
      name: row.name,
      lineStart: row.line_start,
      lineEnd: row.line_end
    }))
  }

  deletePatternsByFile(filePath: string): void {
    const stmt = this.db.prepare('DELETE FROM patterns WHERE file_path = ?')
    stmt.run(filePath)
  }

  // ============================================================
  // Statistics
  // ============================================================

  getASTCacheStats(): { totalRecords: number; totalBytes: number } {
    const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM ast_cache')
    const sizeStmt = this.db.prepare(
      'SELECT SUM(LENGTH(ast_json)) as bytes FROM ast_cache'
    )

    const count = (countStmt.get() as any).count || 0
    const bytes = (sizeStmt.get() as any).bytes || 0

    return { totalRecords: count, totalBytes: bytes }
  }

  getCacheRecordStats(): { totalRecords: number; lastParsedAt: string | null } {
    const countStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM cache_records'
    )
    const latestStmt = this.db.prepare(
      'SELECT MAX(parsed_at) as latest FROM cache_records'
    )

    const count = (countStmt.get() as any).count || 0
    const latest = (latestStmt.get() as any).latest

    return { totalRecords: count, lastParsedAt: latest }
  }

  getPatternStats(): { totalPatterns: number; patternTypes: number } {
    const countStmt = this.db.prepare(
      'SELECT COUNT(*) as count FROM patterns'
    )
    const typesStmt = this.db.prepare(
      'SELECT COUNT(DISTINCT pattern) as types FROM patterns'
    )

    const count = (countStmt.get() as any).count || 0
    const types = (typesStmt.get() as any).types || 0

    return { totalPatterns: count, patternTypes: types }
  }
}
