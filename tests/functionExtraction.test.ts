import { describe, it, expect } from 'vitest'
import { parseFile } from '../src/parser/treeSitter'
import { resolve } from 'path'

const root = resolve(__dirname, '..')

describe('Parser Integration — Parse Output', () => {
  it('each source file produces functions and imports greater than 0', () => {
    const files = [
      'src/cli/index.ts',
      'src/cli/scanner.ts',
      'src/parser/treeSitter.ts',
      'src/parser/hashFile.ts',
      'src/query/queryEngine.ts',
      'src/storage/neo4j.ts'
    ]

    for (const file of files) {
      const { functions, imports } = parseFile(resolve(root, file))
      expect(functions.length, `${file} should have functions`).toBeGreaterThan(0)
      expect(imports.length, `${file} should have imports`).toBeGreaterThan(0)
    }
  })
})

describe('Parser Integration — Function Name Extraction', () => {
  describe('src/cli/index.ts', () => {
    it('extracts real function names', () => {
      const { functions } = parseFile(resolve(root, 'src/cli/index.ts'))
      const names = functions.map(f => f.name)
      expect(names).toContain('runScan')
      expect(names).toContain('getAllFiles')
      expect(names).toContain('printSummary')
    })

    it('never extracts modifier keywords as function names', () => {
      const { functions } = parseFile(resolve(root, 'src/cli/index.ts'))
      const names = functions.map(f => f.name)
      expect(names).not.toContain('async')
      expect(names).not.toContain('export')
    })

    it('never extracts parameter names as function names', () => {
      const { functions } = parseFile(resolve(root, 'src/cli/index.ts'))
      const names = functions.map(f => f.name)
      expect(names).not.toContain('options')
      expect(names).not.toContain('nodeId')
      expect(names).not.toContain('config')
    })

    it('marks runScan as async', () => {
      const { functions } = parseFile(resolve(root, 'src/cli/index.ts'))
      const runScan = functions.find(f => f.name === 'runScan')
      expect(runScan).toBeDefined()
      expect(runScan!.isAsync).toBe(true)
    })

    it('getAllFiles calls itself recursively', () => {
      const { functions } = parseFile(resolve(root, 'src/cli/index.ts'))
      const getAllFiles = functions.find(f => f.name === 'getAllFiles')
      expect(getAllFiles).toBeDefined()
      expect(getAllFiles!.calls.map(c => c.name)).toContain('getAllFiles')
    })

    it('runScan calls internal functions', () => {
      const { functions } = parseFile(resolve(root, 'src/cli/index.ts'))
      const runScan = functions.find(f => f.name === 'runScan')!
      const callNames = runScan.calls.map(c => c.name)
      expect(callNames).toContain('scan')
      expect(callNames).toContain('parseFile')
    })
  })

  describe('src/query/queryEngine.ts (class methods)', () => {
    it('extracts class methods', () => {
      const { functions } = parseFile(resolve(root, 'src/query/queryEngine.ts'))
      const names = functions.map(f => f.name)
      expect(names).toContain('getSubgraph')
      expect(names).toContain('getNode')
      expect(names).toContain('getDependencies')
      expect(names).toContain('getNodeRelations')
    })

    it('does not extract class properties as functions', () => {
      const { functions } = parseFile(resolve(root, 'src/query/queryEngine.ts'))
      const names = functions.map(f => f.name)
      expect(names).not.toContain('neo4j')
      expect(names).not.toContain('sqlite')
    })

    it('does not extract parameter names as function names', () => {
      const { functions } = parseFile(resolve(root, 'src/query/queryEngine.ts'))
      const names = functions.map(f => f.name)
      expect(names).not.toContain('options')
      expect(names).not.toContain('functionId')
      expect(names).not.toContain('nodeId')
      expect(names).not.toContain('fileId')
    })
  })

  describe('src/storage/neo4j.ts (private/async methods)', () => {
    it('extracts methods despite modifiers', () => {
      const { functions } = parseFile(resolve(root, 'src/storage/neo4j.ts'))
      const names = functions.map(f => f.name)
      expect(names).toContain('createNode')
      expect(names).toContain('getNode')
      expect(names).toContain('getSubgraph')
    })

    it('does not confuse modifiers for function names', () => {
      const { functions } = parseFile(resolve(root, 'src/storage/neo4j.ts'))
      const names = functions.map(f => f.name)
      expect(names).not.toContain('private')
      expect(names).not.toContain('async')
    })
  })

  describe('src/parser/hashFile.ts (recursive functions)', () => {
    it('extracts hashFile, hashFolder, walkDir', () => {
      const { functions } = parseFile(resolve(root, 'src/parser/hashFile.ts'))
      const names = functions.map(f => f.name)
      expect(names).toContain('hashFile')
      expect(names).toContain('hashFolder')
      expect(names).toContain('walkDir')
    })

    it('walkDir calls itself recursively', () => {
      const { functions } = parseFile(resolve(root, 'src/parser/hashFile.ts'))
      const walkDir = functions.find(f => f.name === 'walkDir')
      expect(walkDir).toBeDefined()
      expect(walkDir!.calls.map(c => c.name)).toContain('walkDir')
    })
  })
})
