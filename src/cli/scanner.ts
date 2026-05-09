import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { resolve, relative, basename } from 'path'
import {
  ScanResult,
  ScannedModule,
  ScannedFolder,
  ScannedFile,
  PackageJson,
  Language,
  CodeflowConfig,
  DEFAULT_IGNORE
} from '../../shared/types'
import { hashFile } from '../parser/hashFile'
import { detectLanguage } from '../parser/languageDetect'

export function scan(projectRoot: string): ScanResult {
  const configPath = resolve(projectRoot, 'codeflow.config.json')
  let config: Partial<CodeflowConfig> = { root: './src' }

  if (existsSync(configPath)) {
    const raw = readFileSync(configPath, 'utf-8')
    config = JSON.parse(raw)
  }

  const scanRoot = resolve(projectRoot, config.root || './src')
  const ignore = new Set([...DEFAULT_IGNORE, ...(config.ignore || [])])

  const packageJsonPath = resolve(projectRoot, 'package.json')
  let packageJson: PackageJson | null = null

  if (existsSync(packageJsonPath)) {
    const raw = readFileSync(packageJsonPath, 'utf-8')
    packageJson = JSON.parse(raw)
  }

  const projectName = packageJson?.name || basename(projectRoot)
  const entryPoint = packageJson?.main || 'index.js'
  const projectLanguage = detectLanguage(entryPoint)

  const modules: ScannedModule[] = []
  let totalFiles = 0

  function shouldIgnore(name: string): boolean {
    return ignore.has(name)
  }

  function scanFolder(
    folderPath: string,
    baseLevel: number
  ): { folders: ScannedFolder[]; files: ScannedFile[] } {
    const entries = readdirSync(folderPath, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))

    const folders: ScannedFolder[] = []
    const files: ScannedFile[] = []

    for (const entry of entries) {
      if (shouldIgnore(entry.name)) continue

      const fullPath = resolve(folderPath, entry.name)
      const relativePath = relative(projectRoot, fullPath)

      if (entry.isDirectory()) {
        const { folders: subFolders, files: subFiles } = scanFolder(
          fullPath,
          baseLevel + 1
        )

        if (subFiles.length > 0 || subFolders.length > 0) {
          folders.push({
            path: relativePath,
            name: entry.name,
            files: subFiles
          })

          files.push(...subFiles)

          for (const subFolder of subFolders) {
            files.push(...subFolder.files)
          }
        }
      } else if (entry.isFile()) {
        const language = detectLanguage(entry.name)
        if (language !== 'unknown') {
          const stats = statSync(fullPath)
          const file: ScannedFile = {
            path: relativePath,
            name: entry.name,
            language,
            sizeBytes: stats.size,
            hash: hashFile(fullPath)
          }
          files.push(file)
          totalFiles++
        }
      }
    }

    return { folders, files }
  }

  if (existsSync(scanRoot)) {
    const entries = readdirSync(scanRoot, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      if (shouldIgnore(entry.name) || !entry.isDirectory()) continue

      const modulePath = resolve(scanRoot, entry.name)
      const moduleRelativePath = relative(projectRoot, modulePath)

      const { folders, files: moduleFiles } = scanFolder(modulePath, 1)

      if (moduleFiles.length > 0) {
        modules.push({
          path: moduleRelativePath,
          name: entry.name,
          folders,
          files: moduleFiles.filter(f => !folders.some(folder =>
            folder.files.some(ff => ff.path === f.path)
          ))
        })
      }
    }
  }

  return {
    projectPath: projectRoot,
    projectName,
    language: projectLanguage,
    entryPoint,
    packageJson,
    modules,
    scannedAt: new Date(),
    totalFiles
  }
}
