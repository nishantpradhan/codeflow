// ============================================================
// shared/types.ts
// Phase 1 — Core types only. No AI types yet.
// ============================================================

// ------------------------------------------------------------
// ENUMS — strict, no magic strings
// ------------------------------------------------------------

export type NodeType =
  | 'project'     // one per repo
  | 'module'      // top level domain folder
  | 'folder'      // subdirectory
  | 'file'        // source file
  | 'function'    // function or method

// V1 edges only — extend in V2
export type EdgeType =
  | 'CONTAINS'    // structural hierarchy
  | 'IMPORTS'     // file imports file
  | 'CALLS'       // function calls function
  | 'EXTENDS'     // class extends class

export type Language =
  | 'javascript'
  | 'typescript'
  | 'unknown'

export type NodeLevel = 1 | 2 | 3 | 4 | 5

// ------------------------------------------------------------
// ID HELPER
// Deterministic — never UUID
// format: "path:name:lineStart"
// example: "src/auth/middleware/authenticate.js:authenticateMiddleware:12"
// For project/module/folder — no line number needed
// format: "path:type"
// example: "src/auth:module"
// ------------------------------------------------------------

export type NodeId = string  // enforced by convention, not runtime

export function makeNodeId(
  path: string,
  name: string,
  lineStart?: number
): NodeId {
  return lineStart !== undefined
    ? `${path}:${name}:${lineStart}`
    : `${path}:${name}`
}

// ------------------------------------------------------------
// CORE NODES
// Structural data only — from parser
// No AI generated fields here
// ------------------------------------------------------------

interface BaseNode {
  id: NodeId
  type: NodeType
  label: string       // human readable name
  path: string        // absolute or relative filesystem path
  hash: string        // file/folder hash — for cache invalidation
  level: NodeLevel
  visited: boolean    // has user expanded this node in UI
  createdAt: Date
  updatedAt: Date
}

// Level 1 — one per repository
export interface ProjectNode extends BaseNode {
  type: 'project'
  level: 1
  name: string
  language: Language
  entryPoint: string        // e.g. "src/app.js"
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'unknown'
  dependencies: string[]    // from package.json — npm package names
  devDependencies: string[]
  scripts: Record<string, string>  // from package.json scripts
}

// Level 2 — top level domain folders
export interface ModuleNode extends BaseNode {
  type: 'module'
  level: 2
  parentId: NodeId          // ProjectNode id
  folderCount: number
  fileCount: number
}

// Level 3 — subdirectories inside a module
export interface FolderNode extends BaseNode {
  type: 'folder'
  level: 3
  parentId: NodeId          // ModuleNode id
  fileCount: number
}

// Level 4 — source files
export interface FileNode extends BaseNode {
  type: 'file'
  level: 4
  parentId: NodeId          // FolderNode or ModuleNode id
  language: Language
  lineCount: number
  imports: string[]         // raw import paths from source
  exports: string[]         // exported names from source
  isEntryPoint: boolean
  isTest: boolean
  isConfig: boolean
}

// Level 5 — functions and methods inside files
export interface FunctionNode extends BaseNode {
  type: 'function'
  level: 5
  parentId: NodeId          // FileNode id
  // NO calledBy — derived from graph via CALLS edge
  params: FunctionParam[]
  returnType: string        // raw string from AST — "void", "Promise<User>" etc
  isAsync: boolean
  isExported: boolean
  isMethod: boolean         // true if inside a class
  className?: string        // if isMethod — which class
  lineStart: number
  lineEnd: number
}

export interface FunctionParam {
  name: string
  type?: string             // from TypeScript AST or JSDoc
}

// Union type — use this when node type is unknown
export type GraphNode =
  | ProjectNode
  | ModuleNode
  | FolderNode
  | FileNode
  | FunctionNode

// ------------------------------------------------------------
// EDGES
// V1 — 4 types only
// No redundant reverse edges — query graph for direction
// ------------------------------------------------------------

export interface GraphEdge {
  id: string                // `${source}::${type}::${target}`
  source: NodeId
  target: NodeId
  type: EdgeType
  label: string             // human readable — "imports", "calls"
  weight: number            // 1-10 — connection strength
  lineNumber?: number       // where in source this relationship exists
  createdAt: Date
}

export function makeEdgeId(
  source: NodeId,
  type: EdgeType,
  target: NodeId
): string {
  return `${source}::${type}::${target}`
}

// ------------------------------------------------------------
// SUBGRAPH
// Returned by Query Engine — slice of full graph
// ------------------------------------------------------------

export interface SubGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  rootId: NodeId            // which node this subgraph is centered on
  depth: number             // how many hops from root
}

// ------------------------------------------------------------
// PARSE RESULT
// Raw output from Tree-sitter + ast-grep
// Stored in SQLite before going into Neo4j
// ------------------------------------------------------------

export interface ParsedFile {
  path: string
  hash: string
  language: Language
  lineCount: number
  imports: ParsedImport[]
  exports: ParsedExport[]
  functions: ParsedFunction[]
  parsedAt: Date
}

export interface ParsedImport {
  source: string            // raw import path — "./auth" or "jsonwebtoken"
  names: string[]           // named imports — ["authenticateMiddleware"]
  isDefault: boolean
  isExternal: boolean       // true if npm package
  lineNumber: number
}

export interface ParsedExport {
  name: string
  type: 'function' | 'class' | 'variable' | 'default'
  lineNumber: number
}

export interface ParsedFunction {
  name: string
  params: FunctionParam[]
  returnType: string
  isAsync: boolean
  isExported: boolean
  isMethod: boolean
  className?: string
  lineStart: number
  lineEnd: number
  calls: ParsedCall[]       // functions this calls internally
}

export interface ParsedCall {
  name: string              // function name being called
  lineNumber: number
  isExternal: boolean       // true if calling npm package function
}

// ------------------------------------------------------------
// SCAN RESULT
// Raw output from filesystem scanner
// Before any parsing happens
// ------------------------------------------------------------

export interface ScanResult {
  projectPath: string
  projectName: string
  language: Language
  entryPoint: string
  packageJson: PackageJson | null
  modules: ScannedModule[]
  scannedAt: Date
  totalFiles: number
}

export interface ScannedModule {
  path: string
  name: string              // folder name
  folders: ScannedFolder[]
  files: ScannedFile[]
}

export interface ScannedFolder {
  path: string
  name: string
  files: ScannedFile[]
}

export interface ScannedFile {
  path: string
  name: string
  language: Language
  sizeBytes: number
  hash: string
}

export interface PackageJson {
  name: string
  version: string
  main?: string
  scripts: Record<string, string>
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

// ------------------------------------------------------------
// CACHE
// SQLite stored records
// ------------------------------------------------------------

export interface CacheRecord {
  path: string
  hash: string
  parsedAt: Date
  nodeId: NodeId
}

// ------------------------------------------------------------
// CONFIG
// codeflow.config.json — optional user config
// ------------------------------------------------------------

export interface CodeflowConfig {
  root: string              // default: "./src"
  ignore: string[]          // folders to ignore beyond defaults
  maxDepth?: number         // how deep to scan — default unlimited
  language?: Language       // force language detection
}

export const DEFAULT_IGNORE = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  'coverage',
  '.cache',
  '__pycache__',
  '.turbo',
  'out',
  'tmp'
] as const

// ------------------------------------------------------------
// QUERY ENGINE TYPES
// Input/output contracts for QueryEngine
// ------------------------------------------------------------

export interface GetSubgraphOptions {
  nodeId: NodeId
  depth: number             // 1-3 recommended
  edgeTypes?: EdgeType[]    // filter by edge type — default all
}

export interface GetDependentsOptions {
  nodeId: NodeId
  depth?: number            // how many hops — default 1
}

export interface QueryResult<T> {
  data: T
  fromCache: boolean        // true if served from SQLite/Neo4j cache
  durationMs: number        // query execution time
}

// ------------------------------------------------------------
// CLI TYPES
// Terminal output and progress reporting
// ------------------------------------------------------------

export type CLIPhase =
  | 'scanning'
  | 'parsing'
  | 'storing'
  | 'indexing'
  | 'done'
  | 'error'

export interface CLIProgress {
  phase: CLIPhase
  current: number
  total: number
  message: string
  durationMs?: number
}

export interface CLISummary {
  projectName: string
  totalFiles: number
  totalFunctions: number
  totalNodes: number
  totalEdges: number
  cacheHits: number
  cacheMisses: number
  durationMs: number
}