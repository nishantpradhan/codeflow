import type { GraphNode } from '../../shared/types'

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434'
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'nomic-embed-text'

export function buildNodeText(node: GraphNode): string {
  const lines: string[] = []

  lines.push(`${node.type}: ${node.label}`)
  lines.push(`path: ${node.path}`)

  if (node.type === 'function') {
    if (node.isAsync) lines.push('async')
    if (node.isExported) lines.push('exported')
    if (node.isMethod && node.className) lines.push(`method of ${node.className}`)
    if (node.returnType) lines.push(`returns: ${node.returnType}`)
    if (node.params?.length) {
      lines.push(`params: ${node.params.map(p => p.name + (p.type ? `: ${p.type}` : '')).join(', ')}`)
    }
  }

  if (node.type === 'file') {
    if (node.language) lines.push(`language: ${node.language}`)
    if (node.lineCount) lines.push(`lines: ${node.lineCount}`)
    if (node.imports?.length) lines.push(`imports: ${node.imports.join(', ')}`)
    if (node.exports?.length) lines.push(`exports: ${node.exports.join(', ')}`)
  }

  return lines.join('\n')
}

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: text })
  })

  if (!res.ok) {
    throw new Error(`Ollama embeddings failed: ${res.status} ${await res.text()}`)
  }

  const data = await res.json() as { embedding: number[] }
  return data.embedding
}

export async function embedNode(node: GraphNode): Promise<number[]> {
  const text = buildNodeText(node)
  return embedText(text)
}

export async function isOllamaReady(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`)
    return res.ok
  } catch {
    return false
  }
}

export async function ensureModel(): Promise<void> {
  const res = await fetch(`${OLLAMA_URL}/api/tags`)
  const data = await res.json() as { models: Array<{ name: string }> }
  const pulled = data.models.some(m => m.name.startsWith(EMBEDDING_MODEL))
  if (!pulled) {
    console.log(`[embedder] Pulling ${EMBEDDING_MODEL} (first run, ~274MB)...`)
    await fetch(`${OLLAMA_URL}/api/pull`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: EMBEDDING_MODEL, stream: false })
    })
    console.log(`[embedder] ${EMBEDDING_MODEL} ready`)
  }
}
