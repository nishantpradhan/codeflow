import { extname } from 'path'
import { Language } from '../../shared/types'

export function detectLanguage(filePath: string): Language {
  const ext = extname(filePath).toLowerCase()

  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'typescript'
    case '.js':
    case '.jsx':
    case '.mjs':
    case '.cjs':
      return 'javascript'
    default:
      return 'unknown'
  }
}
