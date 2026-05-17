#!/usr/bin/env node

import { Command } from 'commander'
import { resolve, relative, dirname } from 'path'
import { existsSync, mkdirSync } from 'fs'
import chalk from 'chalk'
import ora from 'ora'
import dotenv from 'dotenv'
import { scan } from './scanner'
import { parseFile } from '../parser/treeSitter'
import { extractPatterns } from '../parser/astGrep'
import { Neo4jDB } from '../storage/neo4j'
import { SQLiteDB } from '../storage/sqlite'
import { FileWatcher } from './watcher'
import { makeNodeId, makeEdgeId } from '../../shared/types'
import type {
  ProjectNode,
  ModuleNode,
  FolderNode,
  FileNode,
  FunctionNode,
  CLISummary
} from '../../shared/types'
import { SQLiteVectorStore } from '../ai/sqliteVectorStore'
import { embedNode, ensureModel, isOllamaReady } from '../ai/embedder'

dotenv.config()

const program = new Command()

program
  .name('codeflow')
  .description('Local CLI tool for analyzing JavaScript/TypeScript codebases')
  .version('0.1.0')

program
  .command('scan [projectRoot]')
  .description('Scan and build the codebase graph')
  .option('-w, --watch', 'Watch for changes after scanning')
  .option('--no-watch', 'Disable watching')
  .action(async (projectRoot: string | undefined, options: any) => {
    try {
      const root = projectRoot ? resolve(projectRoot) : process.cwd()
      await runScan(root, options.watch !== false)
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message)
      process.exit(1)
    }
  })

program
  .command('watch [projectRoot]')
  .description('Watch for file changes')
  .action(async (projectRoot: string | undefined) => {
    try {
      const root = projectRoot ? resolve(projectRoot) : process.cwd()
      await runWatch(root)
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message)
      process.exit(1)
    }
  })

program.parse(process.argv)

// ============================================================
// Main Scan Function
// ============================================================

async function runScan(projectRoot: string, shouldWatch: boolean): Promise<void> {
  const startTime = Date.now()
  let spinner: any

  try {
    // Initialize databases
    const neo4jUrl = process.env.NEO4J_URL || 'bolt://localhost:7687'
    const neo4jUser = process.env.NEO4J_USER || 'neo4j'
    const neo4jPassword = process.env.NEO4J_PASSWORD || 'password'
    const sqlitePath = process.env.SQLITE_PATH || resolve(projectRoot, 'data/codeflow.db')

    // Create data directory if needed
    const dataDir = resolve(projectRoot, 'data')
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }

    const neo4j = new Neo4jDB(neo4jUrl, neo4jUser, neo4jPassword)
    const sqlite = new SQLiteDB(sqlitePath)

    spinner = ora('Initializing databases...').start()
    await neo4j.init()
    sqlite.init()
    spinner.succeed(chalk.green('✓ Databases initialized'))

    // Scan filesystem
    spinner = ora('Scanning project structure...').start()
    const scanResult = await Promise.resolve(scan(projectRoot))
    spinner.succeed(
      chalk.green(`✓ Scanned ${scanResult.totalFiles} files in ${scanResult.modules.length} modules`)
    )
    console.log('[scan debug] rootFiles:', scanResult.rootFiles.length, scanResult.rootFiles.map(f => f.path))
    console.log('[scan debug] modules:', scanResult.modules.map(m => ({ name: m.name, files: m.files.length })))

    // Parse files and store in Neo4j
    spinner = ora('Parsing files...').start()
    let parsedCount = 0
    let functionCount = 0

    // Map of relative file path → parsed data, built during parse
    const parsedCache = new Map<string, ReturnType<typeof parseFile>>()

    for (const file of scanResult.rootFiles) {
      const filePath = resolve(projectRoot, file.path)
      if (existsSync(filePath)) {
        const parsed = parseFile(filePath)
        sqlite.storeASTCache(parsed)
        parsedCache.set(file.path, parsed)
        functionCount += parsed.functions.length
        parsedCount++
      }
    }

    for (const module of scanResult.modules) {
      for (const file of getAllFiles(module)) {
        const filePath = resolve(projectRoot, file.path)
        if (existsSync(filePath)) {
          const parsed = parseFile(filePath)
          sqlite.storeASTCache(parsed)
          parsedCache.set(file.path, parsed)

          functionCount += parsed.functions.length
          parsedCount++

          // Extract patterns
          const patterns = extractPatterns(filePath)
          for (const pattern of patterns) {
            sqlite.storePattern(
              pattern.id,
              file.path,
              pattern.pattern,
              pattern.name,
              pattern.lineStart,
              pattern.lineEnd
            )
          }
        }
      }
    }
    spinner.succeed(chalk.green(`✓ Parsed ${parsedCount} files, found ${functionCount} functions`))
    console.log('[parse debug] parsedCache size:', parsedCache.size)
    console.log('[parse debug] parsedCache keys:', [...parsedCache.keys()])
    const sample = [...parsedCache.values()][0]
    console.log('[parse debug] sample parsed file:', sample)
    console.log('[parse debug] sample functions:', sample?.functions?.length)
    console.log('[BEFORE NODE CREATION] parsedCache size:', parsedCache.size, 'first 3 keys:', [...parsedCache.keys()].slice(0, 3))

    // Store graph in Neo4j
    spinner = ora('Building graph in Neo4j...').start()
    let nodeCount = 0
    let edgeCount = 0

    // Create project node
    const projectNode: ProjectNode = {
      id: makeNodeId(projectRoot, 'project'),
      type: 'project',
      level: 1,
      label: scanResult.projectName,
      path: projectRoot,
      hash: '',
      visited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      name: scanResult.projectName,
      language: scanResult.language,
      entryPoint: scanResult.entryPoint,
      packageManager: scanResult.packageJson?.name ? 'npm' : 'unknown',
      dependencies: Object.keys(scanResult.packageJson?.dependencies || {}),
      devDependencies: Object.keys(scanResult.packageJson?.devDependencies || {}),
      scripts: scanResult.packageJson?.scripts || {}
    }
    await neo4j.createNode(projectNode)
    nodeCount++

    // Registries used for second passes (IMPORTS + CALLS)
    const fileRegistry: Array<{ filePath: string; fileId: string; importSources: string[] }> = []
    const functionRegistry: Array<{ fileId: string; fnId: string; fnName: string; calls: Array<{ name: string; lineNumber?: number }> }> = []

    // Create file nodes for files directly in scanRoot (e.g. src/index.js)
    for (const file of scanResult.rootFiles) {
      const fileId = makeNodeId(file.path, 'file')
      const parsed = parsedCache.get(file.path)
      fileRegistry.push({ filePath: file.path, fileId, importSources: parsed?.imports.map(i => i.source) ?? [] })
      const fileNode: FileNode = {
        id: fileId,
        type: 'file',
        level: 4,
        label: file.name,
        path: file.path,
        hash: file.hash,
        visited: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        parentId: projectNode.id,
        language: file.language,
        lineCount: parsed?.lineCount || 0,
        imports: parsed?.imports.map(i => i.source) || [],
        exports: parsed?.exports.map(e => e.name) || [],
        isEntryPoint: file.path === scanResult.entryPoint,
        isTest: file.name.includes('.test.') || file.name.includes('.spec.'),
        isConfig: file.name.includes('.config.') || file.name === 'package.json'
      }
      await neo4j.createNode(fileNode)
      nodeCount++

      const edgeId = makeEdgeId(projectNode.id, 'CONTAINS', fileId)
      await neo4j.createEdge({
        id: edgeId,
        source: projectNode.id,
        target: fileId,
        type: 'CONTAINS',
        label: 'contains',
        weight: 1,
        createdAt: new Date()
      })
      edgeCount++
    }

    // Create src folder node — bridges project→modules in the graph and is searchable
    const srcFolderId = makeNodeId('src', 'folder')
    const srcFolderNode: FolderNode = {
      id: srcFolderId,
      type: 'folder',
      level: 3,
      label: 'src',
      path: 'src',
      hash: '',
      visited: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      parentId: projectNode.id,
      fileCount: 0
    }
    await neo4j.createNode(srcFolderNode)
    await neo4j.createEdge({
      id: makeEdgeId(projectNode.id, 'CONTAINS', srcFolderId),
      source: projectNode.id,
      target: srcFolderId,
      type: 'CONTAINS',
      label: 'contains',
      weight: 1,
      createdAt: new Date()
    })
    nodeCount++
    edgeCount++

    // Create module, folder, and file nodes
    console.log('[MODULES LOOP] About to process', scanResult.modules.length, 'modules')
    for (const module of scanResult.modules) {
      console.log('[MODULE]', module.name, 'with', module.files.length, 'files and', module.folders.length, 'folders')
      const moduleId = makeNodeId(module.path, 'module')
      const moduleNode: ModuleNode = {
        id: moduleId,
        type: 'module',
        level: 2,
        label: module.name,
        path: module.path,
        hash: '',
        visited: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        parentId: srcFolderId,
        folderCount: module.folders.length,
        fileCount: module.files.length
      }
      await neo4j.createNode(moduleNode)
      nodeCount++

      // CONTAINS edge from src:folder to module
      const moduleEdgeId = makeEdgeId(srcFolderId, 'CONTAINS', moduleId)
      await neo4j.createEdge({
        id: moduleEdgeId,
        source: srcFolderId,
        target: moduleId,
        type: 'CONTAINS',
        label: 'contains',
        weight: 1,
        createdAt: new Date()
      })
      edgeCount++

      // Process files and folders
      console.log('[FOLDERS LOOP]', module.name, 'has', module.folders.length, 'folders')
      for (const folder of module.folders) {
        console.log('[FOLDER]', folder.name, 'has', folder.files.length, 'files')
        const folderId = makeNodeId(folder.path, 'folder')
        const folderNode: FolderNode = {
          id: folderId,
          type: 'folder',
          level: 3,
          label: folder.name,
          path: folder.path,
          hash: '',
          visited: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          parentId: moduleId,
          fileCount: folder.files.length
        }
        await neo4j.createNode(folderNode)
        nodeCount++

        // CONTAINS edge from module to folder
        const folderEdgeId = makeEdgeId(moduleId, 'CONTAINS', folderId)
        await neo4j.createEdge({
          id: folderEdgeId,
          source: moduleId,
          target: folderId,
          type: 'CONTAINS',
          label: 'contains',
          weight: 1,
          createdAt: new Date()
        })
        edgeCount++

        // Create file nodes
        console.log('[FOLDER FILES] folder', folder.name, 'has', folder.files.length, 'files')
        for (const file of folder.files) {
          const fileId = makeNodeId(file.path, 'file')
          const parsed = parsedCache.get(file.path)
          console.log('[FILE CHECK]', file.path, '— in cache:', !!parsed)
          fileRegistry.push({ filePath: file.path, fileId, importSources: parsed?.imports.map(i => i.source) ?? [] })
          const fileNode: FileNode = {
            id: fileId,
            type: 'file',
            level: 4,
            label: file.name,
            path: file.path,
            hash: file.hash,
            visited: false,
            createdAt: new Date(),
            updatedAt: new Date(),
            parentId: folderId,
            language: file.language,
            lineCount: parsed?.lineCount || 0,
            imports: parsed?.imports.map(i => i.source) || [],
            exports: parsed?.exports.map(e => e.name) || [],
            isEntryPoint: file.path === scanResult.entryPoint,
            isTest: file.name.includes('.test.') || file.name.includes('.spec.'),
            isConfig: file.name.includes('.config.') || file.name === 'package.json'
          }
          await neo4j.createNode(fileNode)
          nodeCount++

          // CONTAINS edge from folder to file
          const fileEdgeId = makeEdgeId(folderId, 'CONTAINS', fileId)
          await neo4j.createEdge({
            id: fileEdgeId,
            source: folderId,
            target: fileId,
            type: 'CONTAINS',
            label: 'contains',
            weight: 1,
            createdAt: new Date()
          })
          edgeCount++

          // Create function nodes — deduplicate by name within each file
          if (parsed && parsed.functions.length > 0) {
            const seenFnNames = new Set<string>()
            for (const fn of parsed.functions) {
              if (seenFnNames.has(fn.name)) continue
              seenFnNames.add(fn.name)
              const fnId = makeNodeId(file.path, fn.name, fn.lineStart)
              const fnNode: FunctionNode = {
                id: fnId,
                type: 'function',
                level: 5,
                label: fn.name,
                path: file.path,
                hash: file.hash,
                visited: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                parentId: fileId,
                params: fn.params,
                returnType: fn.returnType,
                isAsync: fn.isAsync,
                isExported: fn.isExported,
                isMethod: fn.isMethod,
                className: fn.className,
                lineStart: fn.lineStart,
                lineEnd: fn.lineEnd
              }
              await neo4j.createNode(fnNode)
              nodeCount++

              // CONTAINS edge from file to function
              const fnEdgeId = makeEdgeId(fileId, 'CONTAINS', fnId)
              await neo4j.createEdge({
                id: fnEdgeId,
                source: fileId,
                target: fnId,
                type: 'CONTAINS',
                label: 'contains',
                weight: 1,
                createdAt: new Date()
              })
              edgeCount++

              // Collect for CALLS second pass
              functionRegistry.push({
                fileId,
                fnId,
                fnName: fn.name,
                calls: fn.calls
              })
            }
          }
        }
      }

      // Process files directly in module
      for (const file of module.files) {
        const fileId = makeNodeId(file.path, 'file')
        const parsed = parsedCache.get(file.path) ?? null
        fileRegistry.push({ filePath: file.path, fileId, importSources: parsedCache.get(file.path)?.imports.map(i => i.source) ?? [] })
        const fileNode: FileNode = {
          id: fileId,
          type: 'file',
          level: 4,
          label: file.name,
          path: file.path,
          hash: file.hash,
          visited: false,
          createdAt: new Date(),
          updatedAt: new Date(),
          parentId: moduleId,
          language: file.language,
          lineCount: parsed?.lineCount || 0,
          imports: parsed?.imports.map(i => i.source) || [],
          exports: parsed?.exports.map(e => e.name) || [],
          isEntryPoint: file.path === scanResult.entryPoint,
          isTest: file.name.includes('.test.') || file.name.includes('.spec.'),
          isConfig: file.name.includes('.config.') || file.name === 'package.json'
        }
        await neo4j.createNode(fileNode)
        nodeCount++

        // CONTAINS edge from module to file
        const fileEdgeId = makeEdgeId(moduleId, 'CONTAINS', fileId)
        await neo4j.createEdge({
          id: fileEdgeId,
          source: moduleId,
          target: fileId,
          type: 'CONTAINS',
          label: 'contains',
          weight: 1,
          createdAt: new Date()
        })
        edgeCount++

        // Create function nodes — deduplicate by name within each file
        if (parsed && parsed.functions.length > 0) {
          const seenFnNames = new Set<string>()
          for (const fn of parsed.functions) {
            if (seenFnNames.has(fn.name)) continue
            seenFnNames.add(fn.name)
            const fnId = makeNodeId(file.path, fn.name, fn.lineStart)
            const fnNode: FunctionNode = {
              id: fnId,
              type: 'function',
              level: 5,
              label: fn.name,
              path: file.path,
              hash: file.hash,
              visited: false,
              createdAt: new Date(),
              updatedAt: new Date(),
              parentId: fileId,
              params: fn.params,
              returnType: fn.returnType,
              isAsync: fn.isAsync,
              isExported: fn.isExported,
              isMethod: fn.isMethod,
              className: fn.className,
              lineStart: fn.lineStart,
              lineEnd: fn.lineEnd
            }
            await neo4j.createNode(fnNode)
            nodeCount++

            // CONTAINS edge from file to function
            const fnEdgeId = makeEdgeId(fileId, 'CONTAINS', fnId)
            await neo4j.createEdge({
              id: fnEdgeId,
              source: fileId,
              target: fnId,
              type: 'CONTAINS',
              label: 'contains',
              weight: 1,
              createdAt: new Date()
            })
            edgeCount++

            // Collect for CALLS second pass
            functionRegistry.push({
              fileId,
              fnId,
              fnName: fn.name,
              calls: fn.calls
            })
          }
        }
      }
    }

    spinner.succeed(chalk.green(`✓ Created ${nodeCount} nodes and ${edgeCount} edges`))

    // Second pass: create IMPORTS edges between file nodes
    spinner = ora('Building import graph...').start()
    let importEdgeCount = 0

    // Build lookup: path (with and without extension) → fileId
    const pathIndex = new Map<string, string>()
    for (const { filePath, fileId } of fileRegistry) {
      pathIndex.set(filePath, fileId)
      pathIndex.set(filePath.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, ''), fileId)
    }

    for (const { filePath, fileId: sourceId, importSources } of fileRegistry) {
      const fileDir = dirname(resolve(projectRoot, filePath))
      for (const src of importSources) {
        if (!src.startsWith('.')) continue // skip npm packages
        const abs = resolve(fileDir, src)
        const rel = relative(projectRoot, abs)
        const candidates = [rel, `${rel}.ts`, `${rel}.tsx`, `${rel}.js`, `${rel}.jsx`, `${rel}/index.ts`, `${rel}/index.js`]
        const targetId = candidates.map(c => pathIndex.get(c)).find(Boolean)
        if (targetId && targetId !== sourceId) {
          try {
            await neo4j.createEdge({
              id: makeEdgeId(sourceId, 'IMPORTS', targetId),
              source: sourceId,
              target: targetId,
              type: 'IMPORTS',
              label: 'imports',
              weight: 1,
              createdAt: new Date()
            })
            importEdgeCount++
          } catch { /* duplicate */ }
        }
      }
    }
    spinner.succeed(chalk.green(`✓ Created ${importEdgeCount} import edges`))

    // Third pass: create CALLS edges between function nodes
    spinner = ora('Building call graph...').start()
    let callEdgeCount = 0

    // Build lookup: name → [fnId, ...] (global across all files)
    const fnNameIndex = new Map<string, string[]>()
    for (const { fnId, fnName } of functionRegistry) {
      if (!fnNameIndex.has(fnName)) fnNameIndex.set(fnName, [])
      fnNameIndex.get(fnName)!.push(fnId)
    }

    for (const { fnId: sourceId, fileId: sourceFileId, calls } of functionRegistry) {
      for (const call of calls) {
        const candidates = fnNameIndex.get(call.name) ?? []
        // Prefer same-file candidates first (inner functions share names across files)
        // sourceFileId = "src/parser/astGrep.ts:file" — strip ":file" to get the bare path prefix
        const sourcePath = sourceFileId.split(':')[0]
        const sameFileCandidates = candidates.filter(id => id.startsWith(sourcePath + ':'))
        const sameFile = sameFileCandidates.filter(id => id !== sourceId)
        const otherFile = candidates.filter(id => !id.startsWith(sourcePath + ':') && id !== sourceId)
        // Only fall back to other files when there are NO same-file candidates at all.
        // If same-file candidates exist but are all self, it's a recursive call —
        // don't wire it to another file's function of the same name.
        const targetId = sameFile[0] ?? (sameFileCandidates.length === 0 ? otherFile[0] : undefined)
        if (targetId) {
          try {
            await neo4j.createEdge({
              id: makeEdgeId(sourceId, 'CALLS', targetId),
              source: sourceId,
              target: targetId,
              type: 'CALLS',
              label: 'calls',
              weight: 1,
              ...(call.lineNumber && { lineNumber: call.lineNumber }),
              createdAt: new Date()
            })
            callEdgeCount++
          } catch { /* duplicate */ }
        }
      }
    }
    spinner.succeed(chalk.green(`✓ Created ${callEdgeCount} call edges`))

    // Fourth pass: embed all file + function nodes for semantic search
    const ollamaReady = await isOllamaReady()
    if (ollamaReady) {
      spinner = ora('Embedding nodes for semantic search...').start()
      const vectorStore = new SQLiteVectorStore(sqlite.getDb())
      await ensureModel()

      const nodesToEmbed = await neo4j.getNodesByType('file')
        .then(files => neo4j.getNodesByType('function').then(fns => [...files, ...fns]))

      let embedCount = 0
      for (const node of nodesToEmbed) {
        const already = await vectorStore.has(node.id)
        if (already) continue
        try {
          const vector = await embedNode(node)
          await vectorStore.upsert(node.id, process.env.EMBEDDING_MODEL || 'nomic-embed-text', vector)
          embedCount++
        } catch { /* skip node if embedding fails */ }
      }
      spinner.succeed(chalk.green(`✓ Embedded ${embedCount} nodes`))
    } else {
      console.log(chalk.yellow('⚠  Ollama not available — skipping embeddings. Start Ollama to enable semantic search.'))
    }

    const duration = Date.now() - startTime
    const summary: CLISummary = {
      projectName: scanResult.projectName,
      totalFiles: scanResult.totalFiles,
      totalFunctions: functionCount,
      totalNodes: nodeCount,
      totalEdges: edgeCount,
      cacheHits: 0,
      cacheMisses: scanResult.totalFiles,
      durationMs: duration
    }

    printSummary(summary)

    // Start watcher if requested
    if (shouldWatch) {
      const watcher = new FileWatcher(projectRoot, neo4j, sqlite)
      watcher.start(resolve(projectRoot, './src'))

      // Keep process alive
      process.on('SIGINT', () => {
        watcher.stop()
        neo4j.close()
        sqlite.close()
        process.exit(0)
      })
    } else {
      neo4j.close()
      sqlite.close()
    }
  } catch (error) {
    if (spinner) {
      spinner.fail(chalk.red('Error: ' + (error as Error).message))
    }
    throw error
  }
}

async function runWatch(projectRoot: string): Promise<void> {
  try {
    const neo4jUrl = process.env.NEO4J_URL || 'bolt://localhost:7687'
    const neo4jUser = process.env.NEO4J_USER || 'neo4j'
    const neo4jPassword = process.env.NEO4J_PASSWORD || 'password'
    const sqlitePath = process.env.SQLITE_PATH || resolve(projectRoot, 'data/codeflow.db')

    const neo4j = new Neo4jDB(neo4jUrl, neo4jUser, neo4jPassword)
    const sqlite = new SQLiteDB(sqlitePath)

    const watcher = new FileWatcher(projectRoot, neo4j, sqlite)
    watcher.start(resolve(projectRoot, './src'))

    process.on('SIGINT', () => {
      watcher.stop()
      neo4j.close()
      sqlite.close()
      process.exit(0)
    })
  } catch (error) {
    console.error(chalk.red('Error:'), (error as Error).message)
    process.exit(1)
  }
}

// ============================================================
// Helper Functions
// ============================================================

function getAllFiles(item: any): any[] {
  const files: any[] = [...(item.files || [])]

  if (item.folders) {
    for (const folder of item.folders) {
      files.push(...getAllFiles(folder))
    }
  }

  return files
}

function printSummary(summary: CLISummary): void {
  console.log('\n' + chalk.bold.cyan('═══════════════════════════════════════════'))
  console.log(chalk.bold.cyan('  Codeflow Analysis Summary'))
  console.log(chalk.bold.cyan('═══════════════════════════════════════════'))
  console.log(chalk.white(`  Project:       ${summary.projectName}`))
  console.log(chalk.white(`  Files:         ${summary.totalFiles}`))
  console.log(chalk.white(`  Functions:     ${summary.totalFunctions}`))
  console.log(chalk.white(`  Nodes:         ${summary.totalNodes}`))
  console.log(chalk.white(`  Edges:         ${summary.totalEdges}`))
  console.log(
    chalk.white(`  Cache Hits:    ${summary.cacheHits} / ${summary.totalFiles}`)
  )
  console.log(chalk.white(`  Duration:      ${(summary.durationMs / 1000).toFixed(2)}s`))
  console.log(chalk.bold.cyan('═══════════════════════════════════════════\n'))
}
