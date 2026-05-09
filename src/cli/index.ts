#!/usr/bin/env node

import { Command } from 'commander'
import { resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'
import chalk from 'chalk'
import ora from 'ora'
import dotenv from 'dotenv'
import { scan } from './scanner'
import { parseFile } from '../parser/treeSitter'
import { extractPatterns } from '../parser/astGrep'
import { Neo4jDB } from '../storage/neo4j'
import { SQLiteDB } from '../storage/sqlite'
import { QueryEngine } from '../query/queryEngine'
import { FileWatcher } from './watcher'
import { makeNodeId, makeEdgeId } from '../../shared/types'
import type {
  GraphNode,
  ProjectNode,
  ModuleNode,
  FolderNode,
  FileNode,
  FunctionNode,
  CLISummary
} from '../../shared/types'

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

    // Parse files and store in Neo4j
    spinner = ora('Parsing files...').start()
    let parsedCount = 0
    let functionCount = 0

    for (const module of scanResult.modules) {
      for (const file of getAllFiles(module)) {
        const filePath = resolve(projectRoot, file.path)
        if (existsSync(filePath)) {
          const parsed = parseFile(filePath)
          sqlite.storeASTCache(parsed)

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

    // Create module, folder, and file nodes
    for (const module of scanResult.modules) {
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
        parentId: projectNode.id,
        folderCount: module.folders.length,
        fileCount: module.files.length
      }
      await neo4j.createNode(moduleNode)
      nodeCount++

      // CONTAINS edge from project to module
      const moduleEdgeId = makeEdgeId(projectNode.id, 'CONTAINS', moduleId)
      await neo4j.createEdge({
        id: moduleEdgeId,
        source: projectNode.id,
        target: moduleId,
        type: 'CONTAINS',
        label: 'contains',
        weight: 1,
        createdAt: new Date()
      })
      edgeCount++

      // Process files and folders
      for (const folder of module.folders) {
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
        for (const file of folder.files) {
          const fileId = makeNodeId(file.path, 'file')
          const parsed = sqlite.getASTCache(file.path)
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

          // Create function nodes
          if (parsed) {
            for (const fn of parsed.functions) {
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

              // CALLS edges
              for (const call of fn.calls) {
                const targetId = makeNodeId(file.path, call.name)
                try {
                  const callEdgeId = makeEdgeId(fnId, 'CALLS', targetId)
                  await neo4j.createEdge({
                    id: callEdgeId,
                    source: fnId,
                    target: targetId,
                    type: 'CALLS',
                    label: 'calls',
                    weight: 1,
                    lineNumber: call.lineNumber,
                    createdAt: new Date()
                  })
                  edgeCount++
                } catch {
                  // Target function might not exist yet
                }
              }
            }
          }
        }
      }

      // Process files directly in module
      for (const file of module.files) {
        const fileId = makeNodeId(file.path, 'file')
        const parsed = sqlite.getASTCache(file.path)
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
      }
    }

    spinner.succeed(chalk.green(`✓ Created ${nodeCount} nodes and ${edgeCount} edges`))

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
