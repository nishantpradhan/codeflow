declare module 'tree-sitter' {
  export default class Parser {
    setLanguage(language: any): void
    parse(input: string | Buffer): Tree
  }

  export interface Tree {
    rootNode: SyntaxNode
  }

  export interface SyntaxNode {
    type: string
    text: string
    startIndex: number
    endIndex: number
    startPosition: Position
    endPosition: Position
    parent: SyntaxNode | null
    child(index: number): SyntaxNode | null
    childCount: number
    children: SyntaxNode[]
    previousSibling: SyntaxNode | null
    nextSibling: SyntaxNode | null
    descendantsOfType(type: string): SyntaxNode[]
  }

  export interface Position {
    row: number
    column: number
  }
}

declare module 'tree-sitter-javascript' {
  const language: any
  export default language
}

declare module 'tree-sitter-typescript' {
  export const typescript: any
  export const tsx: any
}
