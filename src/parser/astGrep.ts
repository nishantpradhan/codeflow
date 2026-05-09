import Parser from 'tree-sitter'
import JavaScript from 'tree-sitter-javascript'
import TypeScript from 'tree-sitter-typescript'
import { readFileSync } from 'fs'
import { Language } from '../../shared/types'
import { detectLanguage } from './languageDetect'

export interface ExtractedPattern {
  id: string
  filePath: string
  pattern: string
  name: string
  lineStart: number
  lineEnd: number
}

const parser = new Parser()

const PATTERNS = [
  { name: 'useState', regex: /useState\s*\(/ },
  { name: 'useEffect', regex: /useEffect\s*\(/ },
  { name: 'useCallback', regex: /useCallback\s*\(/ },
  { name: 'useContext', regex: /useContext\s*\(/ },
  { name: 'useReducer', regex: /useReducer\s*\(/ },
  { name: 'useMemo', regex: /useMemo\s*\(/ },
  { name: 'useRef', regex: /useRef\s*\(/ },
  { name: 'try-catch', regex: /try\s*\{[\s\S]*?\}\s*catch\s*\(/ },
  { name: 'async-await', regex: /async\s+\w+.*await/ },
  { name: 'promise-chain', regex: /\.then\s*\(/ },
  { name: 'error-throw', regex: /throw\s+new\s+\w+Error/ },
  { name: 'console-log', regex: /console\.log\s*\(/ },
  { name: 'console-error', regex: /console\.error\s*\(/ },
  { name: 'api-fetch', regex: /fetch\s*\(/ },
  { name: 'api-axios', regex: /axios\.(get|post|put|delete)\s*\(/ },
  { name: 'db-query', regex: /db\.(query|select|insert|update|delete)\s*\(/ },
  { name: 'regex-pattern', regex: /\/[^/]+\/[gimuy]*/ },
  { name: 'destructuring', regex: /\{[\w\s,]+\}\s*=/ }
]

export function extractPatterns(filePath: string): ExtractedPattern[] {
  const language = detectLanguage(filePath)
  const content = readFileSync(filePath, 'utf-8')

  if (language === 'unknown') {
    return []
  }

  parser.setLanguage(language === 'typescript' ? TypeScript.typescript : JavaScript)
  const tree = parser.parse(content)

  const patterns: ExtractedPattern[] = []
  const seenPatterns = new Set<string>()

  const lines = content.split('\n')

  function visit(node: Parser.SyntaxNode) {
    const nodeText = content.substring(node.startIndex, node.endIndex)
    const line = node.startPosition.row
    const lineText = lines[line] || ''

    for (const patternDef of PATTERNS) {
      if (patternDef.regex.test(nodeText) || patternDef.regex.test(lineText)) {
        const key = `${patternDef.name}:${node.startPosition.row}`

        if (!seenPatterns.has(key)) {
          patterns.push({
            id: `${filePath}:${patternDef.name}:${node.startPosition.row + 1}`,
            filePath,
            pattern: patternDef.name,
            name: patternDef.name,
            lineStart: node.startPosition.row + 1,
            lineEnd: node.endPosition.row + 1
          })
          seenPatterns.add(key)
        }
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      visit(node.child(i)!)
    }
  }

  visit(tree.rootNode)
  return patterns
}

export function extractPatternsByType(
  filePath: string,
  patternNames: string[]
): ExtractedPattern[] {
  const allPatterns = extractPatterns(filePath)
  return allPatterns.filter(p => patternNames.includes(p.pattern))
}
