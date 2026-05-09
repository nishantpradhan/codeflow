import chokidar from 'chokidar'
import { resolve, relative } from 'path'
import { existsSync, statSync } from 'fs'
import { ParsedFile, DEFAULT_IGNORE, Language } from '../../shared/types'
import { parseFile } from '../parser/treeSitter'
import { extractPatterns } from '../parser/astGrep'
import { detectLanguage } from '../parser/languageDetect'
import { hashFile } from '../parser/hashFile'
import { Neo4jDB } from '../storage/neo4j'
import { SQLiteDB } from '../storage/sqlite'
import chalk from 'chalk'
import ora from 'ora'

export interface WatcherOptions {
  projectRoot: string
  ignore?: string[]
  onFileChange?: (event: 'add' | 'change' | 'unlink', filePath: string) => void
  onError?: (error: Error) => void
}

export class FileWatcher {
  private watcher: chokidar.FSWatcher | null = null
  private projectRoot: string
  private ignore: Set<string>
  private neo4j: Neo4jDB
  private sqlite: SQLiteDB
  private onFileChange?: (event: 'add' | 'change' | 'unlink', filePath: string) => void
  private onError?: (error: Error) => void
  private spinner: any = null

  constructor(
    projectRoot: string,
    neo4j: Neo4jDB,
    sqlite: SQLiteDB,
    options?: Partial<WatcherOptions>
  ) {
    this.projectRoot = projectRoot
    this.ignore = new Set([...DEFAULT_IGNORE, ...(options?.ignore || [])])
    this.neo4j = neo4j
    this.sqlite = sqlite
    this.onFileChange = options?.onFileChange
    this.onError = options?.onError
  }

  start(scanRoot: string): void {
    const ignoredPatterns = Array.from(this.ignore).map(
      pattern => `**/${pattern}`
    )

    this.watcher = chokidar.watch(scanRoot, {
      ignored: ignoredPatterns,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 100
      }
    })

    this.watcher.on('add', path => this._handleFileAdd(path))
    this.watcher.on('change', path => this._handleFileChange(path))
    this.watcher.on('unlink', path => this._handleFileDelete(path))
    this.watcher.on('error', error => this._handleError(error))

    console.log(
      chalk.blue('👁️  Watching for changes...') +
        chalk.gray(` (${scanRoot})`)
    )
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      console.log(chalk.gray('Watcher stopped'))
    }
  }

  // ============================================================
  // File Event Handlers
  // ============================================================

  private async _handleFileAdd(filePath: string): Promise<void> {
    const language = detectLanguage(filePath)
    if (language === 'unknown') return

    this.spinner = ora('Processing new file...').start()

    try {
      await this._processFile(filePath)
      this.spinner.succeed(chalk.green(`✓ Added: ${relative(this.projectRoot, filePath)}`))
      this.onFileChange?.('add', filePath)
    } catch (error) {
      this.spinner.fail(chalk.red(`✗ Failed to add: ${filePath}`))
      this._handleError(error as Error)
    }
  }

  private async _handleFileChange(filePath: string): Promise<void> {
    const language = detectLanguage(filePath)
    if (language === 'unknown') return

    this.spinner = ora('Processing changed file...').start()

    try {
      // Remove old data
      await this._removeFileData(filePath)

      // Re-process file
      await this._processFile(filePath)

      this.spinner.succeed(chalk.green(`✓ Changed: ${relative(this.projectRoot, filePath)}`))
      this.onFileChange?.('change', filePath)
    } catch (error) {
      this.spinner.fail(chalk.red(`✗ Failed to update: ${filePath}`))
      this._handleError(error as Error)
    }
  }

  private async _handleFileDelete(filePath: string): Promise<void> {
    this.spinner = ora('Processing deleted file...').start()

    try {
      await this._removeFileData(filePath)
      this.spinner.succeed(chalk.gray(`✗ Removed: ${relative(this.projectRoot, filePath)}`))
      this.onFileChange?.('unlink', filePath)
    } catch (error) {
      this.spinner.fail(chalk.red(`✗ Failed to remove: ${filePath}`))
      this._handleError(error as Error)
    }
  }

  private _handleError(error: Error): void {
    if (this.spinner) {
      this.spinner.stop()
    }
    console.error(chalk.red('Watcher error:'), error.message)
    this.onError?.(error)
  }

  // ============================================================
  // Processing Methods
  // ============================================================

  private async _processFile(filePath: string): Promise<void> {
    if (!existsSync(filePath)) return

    const relativePath = relative(this.projectRoot, filePath)

    // Parse file
    const parsed = parseFile(filePath)

    // Store in SQLite
    this.sqlite.storeASTCache(parsed)

    // Extract patterns
    const patterns = extractPatterns(filePath)
    this.sqlite.deletePatternsByFile(relativePath)
    for (const pattern of patterns) {
      this.sqlite.storePattern(
        pattern.id,
        relativePath,
        pattern.pattern,
        pattern.name,
        pattern.lineStart,
        pattern.lineEnd
      )
    }

    // Update Neo4j if file node exists
    // (Full node updates handled by main CLI during rebuilds)
  }

  private async _removeFileData(filePath: string): Promise<void> {
    const relativePath = relative(this.projectRoot, filePath)

    // Remove from SQLite
    this.sqlite.deleteASTCache(relativePath)
    this.sqlite.deletePatternsByFile(relativePath)
    this.sqlite.deleteCacheRecord(relativePath)

    // Note: Neo4j node deletion is handled by the main CLI
    // to maintain graph integrity (delete node + relationships)
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  isIgnored(filePath: string): boolean {
    for (const pattern of this.ignore) {
      if (filePath.includes(pattern)) {
        return true
      }
    }
    return false
  }

  getWatchedPaths(): string[] {
    if (!this.watcher) return []
    return Object.keys(this.watcher.getWatched())
  }

  getStats(): {
    isWatching: boolean
    watchedFileCount: number
  } {
    return {
      isWatching: this.watcher !== null,
      watchedFileCount: this.watcher ? Object.keys(this.watcher.getWatched()).length : 0
    }
  }
}
