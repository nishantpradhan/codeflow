import { createHash } from 'crypto'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

export function hashFile(filePath: string): string {
  const content = readFileSync(filePath, 'utf-8')
  return createHash('sha256').update(content).digest('hex')
}

export function hashFolder(folderPath: string): string {
  const fileHashes: string[] = []

  function walkDir(dirPath: string) {
    const entries = readdirSync(dirPath, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name)
      if (entry.isFile()) {
        const fileHash = hashFile(fullPath)
        fileHashes.push(fileHash)
      } else if (entry.isDirectory()) {
        walkDir(fullPath)
      }
    }
  }

  walkDir(folderPath)
  const combined = fileHashes.join('')
  return createHash('sha256').update(combined).digest('hex')
}
