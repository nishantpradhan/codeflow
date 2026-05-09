import Parser from 'tree-sitter'
import JavaScript from 'tree-sitter-javascript'
import TypeScript from 'tree-sitter-typescript'
import { readFileSync } from 'fs'
import type { ParsedFile, ParsedImport, ParsedExport, ParsedFunction, ParsedCall, Language } from '../../shared/types'
import { detectLanguage } from './languageDetect'
import { hashFile } from './hashFile'

const parser = new Parser()

export function parseFile(filePath: string): ParsedFile {
  const language = detectLanguage(filePath)
  const content = readFileSync(filePath, 'utf-8')
  const lineCount = content.split('\n').length
  const hash = hashFile(filePath)

  if (language === 'unknown') {
    return {
      path: filePath,
      hash,
      language,
      lineCount,
      imports: [],
      exports: [],
      functions: [],
      parsedAt: new Date()
    }
  }

  parser.setLanguage(language === 'typescript' ? TypeScript.typescript : JavaScript)
  const tree = parser.parse(content)

  const imports = extractImports(tree.rootNode, content)
  const exports = extractExports(tree.rootNode, content)
  const functions = extractFunctions(tree.rootNode, content)

  return {
    path: filePath,
    hash,
    language,
    lineCount,
    imports,
    exports,
    functions,
    parsedAt: new Date()
  }
}

function extractImports(node: Parser.SyntaxNode, content: string): ParsedImport[] {
  const imports: ParsedImport[] = []

  function visit(n: Parser.SyntaxNode) {
    if (n.type === 'import_statement') {
      const source = getStringLiteralValue(n, 'string')
      const names = extractImportNames(n)
      const isDefault = hasDefaultImport(n)
      const isExternal = !source.startsWith('.')

      imports.push({
        source,
        names,
        isDefault,
        isExternal,
        lineNumber: n.startPosition.row + 1
      })
    } else if (n.type === 'call_expression') {
      const func = n.child(0)
      if (func?.text === 'require' && n.childCount > 1) {
        const arg = n.child(1)
        if (arg?.type === 'arguments' && arg.childCount > 0) {
          const source = getStringLiteralValue(arg, 'string')
          if (source) {
            const isExternal = !source.startsWith('.')
            imports.push({
              source,
              names: [],
              isDefault: true,
              isExternal,
              lineNumber: n.startPosition.row + 1
            })
          }
        }
      }
    }

    for (let i = 0; i < n.childCount; i++) {
      visit(n.child(i)!)
    }
  }

  visit(node)
  return imports
}

function extractImportNames(node: Parser.SyntaxNode): string[] {
  const names: string[] = []

  function visit(n: Parser.SyntaxNode) {
    if (n.type === 'import_specifier' || n.type === 'import_clause') {
      const identifier = n.descendantsOfType('identifier').find(id => {
        const parent = id.parent
        return parent?.type === 'import_specifier' || parent?.type === 'identifier'
      })
      if (identifier) {
        names.push(identifier.text)
      }
    } else if (n.type === 'identifier' && node.type === 'import_statement') {
      const parent = n.parent
      if (!parent || (parent.type !== 'import_specifier' && parent.type !== 'named_imports')) {
        names.push(n.text)
      }
    }

    for (let i = 0; i < n.childCount; i++) {
      visit(n.child(i)!)
    }
  }

  visit(node)
  return Array.from(new Set(names))
}

function hasDefaultImport(node: Parser.SyntaxNode): boolean {
  const identifiers = node.descendantsOfType('identifier')
  for (const id of identifiers) {
    const prevSibling = id.previousSibling
    if (!prevSibling || prevSibling.type !== 'as') {
      const parent = id.parent
      if (parent?.type !== 'import_specifier') {
        return true
      }
    }
  }
  return false
}

function extractExports(node: Parser.SyntaxNode, content: string): ParsedExport[] {
  const exports: ParsedExport[] = []

  function visit(n: Parser.SyntaxNode) {
    if (n.type === 'export_statement') {
      const declaration = n.child(1)
      if (!declaration) return

      if (declaration.type === 'function_declaration') {
        const name = declaration.child(1)?.text
        if (name) {
          exports.push({
            name,
            type: 'function',
            lineNumber: n.startPosition.row + 1
          })
        }
      } else if (declaration.type === 'class_declaration') {
        const name = declaration.child(1)?.text
        if (name) {
          exports.push({
            name,
            type: 'class',
            lineNumber: n.startPosition.row + 1
          })
        }
      } else if (declaration.type === 'variable_declaration') {
        const identifiers = declaration.descendantsOfType('identifier')
        for (const id of identifiers) {
          exports.push({
            name: id.text,
            type: 'variable',
            lineNumber: n.startPosition.row + 1
          })
          break
        }
      }
    } else if (n.type === 'export_default_declaration') {
      exports.push({
        name: 'default',
        type: 'default',
        lineNumber: n.startPosition.row + 1
      })
    }

    for (let i = 0; i < n.childCount; i++) {
      visit(n.child(i)!)
    }
  }

  visit(node)
  return exports
}

function extractFunctions(node: Parser.SyntaxNode, content: string): ParsedFunction[] {
  const functions: ParsedFunction[] = []
  const classContextStack: string[] = []

  function visit(n: Parser.SyntaxNode) {
    if (n.type === 'class_declaration' || n.type === 'class') {
      const className = n.child(1)?.text
      if (className) {
        classContextStack.push(className)
      }

      for (let i = 0; i < n.childCount; i++) {
        visit(n.child(i)!)
      }

      if (className) {
        classContextStack.pop()
      }
    } else if (
      n.type === 'function_declaration' ||
      n.type === 'method_definition' ||
      (n.type === 'variable_declarator' && isFunctionLike(n))
    ) {
      const fn = parseFunctionNode(n, content, classContextStack[classContextStack.length - 1])
      if (fn) {
        functions.push(fn)
      }

      for (let i = 0; i < n.childCount; i++) {
        visit(n.child(i)!)
      }
    } else {
      for (let i = 0; i < n.childCount; i++) {
        visit(n.child(i)!)
      }
    }
  }

  visit(node)
  return functions
}

function isFunctionLike(node: Parser.SyntaxNode): boolean {
  const value = node.child(node.childCount - 1)
  return value?.type === 'arrow_function' || value?.type === 'function_expression'
}

function parseFunctionNode(
  node: Parser.SyntaxNode,
  content: string,
  className?: string
): ParsedFunction | null {
  let name = ''
  let paramsNode: Parser.SyntaxNode | null = null
  let returnTypeNode: Parser.SyntaxNode | null = null
  let funcBodyStart = 0

  if (node.type === 'function_declaration') {
    name = node.child(1)?.text || ''
    paramsNode = node.descendantsOfType('formal_parameters')[0]
    returnTypeNode = node.descendantsOfType('type_annotation')[0]
    const body = node.descendantsOfType('statement_block')[0]
    funcBodyStart = body?.startIndex || node.startIndex
  } else if (node.type === 'method_definition') {
    name = node.child(0)?.text || ''
    paramsNode = node.descendantsOfType('formal_parameters')[0]
    returnTypeNode = node.descendantsOfType('type_annotation')[0]
    const body = node.descendantsOfType('statement_block')[0]
    funcBodyStart = body?.startIndex || node.startIndex
  } else if (node.type === 'variable_declarator') {
    name = node.child(0)?.text || ''
    const value = node.child(node.childCount - 1)
    if (value?.type === 'arrow_function') {
      paramsNode = value.descendantsOfType('formal_parameters')[0] || value.child(0)
      returnTypeNode = value.descendantsOfType('type_annotation')[0]
      funcBodyStart = value.startIndex
    } else if (value?.type === 'function_expression') {
      paramsNode = value.descendantsOfType('formal_parameters')[0]
      returnTypeNode = value.descendantsOfType('type_annotation')[0]
      funcBodyStart = value.startIndex
    }
  }

  if (!name) return null

  const params = extractParameters(paramsNode)
  const returnType = extractReturnType(returnTypeNode, node)
  const isAsync = node.text.includes('async')
  const isExported = node.parent?.type === 'export_statement'
  const isMethod = !!className
  const calls = extractFunctionCalls(node, content)

  return {
    name,
    params,
    returnType,
    isAsync,
    isExported,
    isMethod,
    className,
    lineStart: node.startPosition.row + 1,
    lineEnd: node.endPosition.row + 1,
    calls
  }
}

function extractParameters(paramsNode: Parser.SyntaxNode | null | undefined) {
  const params: Array<{ name: string; type?: string }> = []

  if (!paramsNode) return params

  const identifiers = paramsNode.descendantsOfType('identifier')
  for (const id of identifiers) {
    const typeAnnotation = id.nextSibling?.nextSibling
    const type = typeAnnotation?.child(1)?.text

    params.push({
      name: id.text,
      type
    })
  }

  return params
}

function extractReturnType(typeNode: Parser.SyntaxNode | null | undefined, funcNode: Parser.SyntaxNode): string {
  if (typeNode) {
    return typeNode.child(1)?.text || ''
  }

  const text = funcNode.text
  const arrowIdx = text.indexOf('=>')
  if (arrowIdx > -1) {
    const beforeArrow = text.substring(0, arrowIdx).trim()
    const lastColon = beforeArrow.lastIndexOf(':')
    if (lastColon > -1) {
      return beforeArrow.substring(lastColon + 1).trim()
    }
  }

  return ''
}

function extractFunctionCalls(node: Parser.SyntaxNode, content: string): ParsedCall[] {
  const calls: ParsedCall[] = []
  const seenCalls = new Set<string>()

  function visit(n: Parser.SyntaxNode) {
    if (n.type === 'call_expression') {
      const func = n.child(0)
      if (func?.type === 'identifier') {
        const callName = func.text
        if (callName !== 'require' && !seenCalls.has(callName)) {
          calls.push({
            name: callName,
            lineNumber: n.startPosition.row + 1,
            isExternal: false
          })
          seenCalls.add(callName)
        }
      }
    }

    for (let i = 0; i < n.childCount; i++) {
      visit(n.child(i)!)
    }
  }

  visit(node)
  return calls
}

function getStringLiteralValue(node: Parser.SyntaxNode, type: string): string {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i)
    if (child?.type === type) {
      return child.text.slice(1, -1)
    }
    if (child?.childCount) {
      const result = getStringLiteralValue(child, type)
      if (result) return result
    }
  }
  return ''
}
