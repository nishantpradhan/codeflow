import type { VectorStore, VectorSearchResult } from './vectorStore'
import { embedText } from './embedder'

export interface SemanticSearchResult {
  nodeId: string
  score: number
}

export class SemanticSearch {
  private store: VectorStore

  constructor(store: VectorStore) {
    this.store = store
  }

  async search(query: string, topK: number = 10): Promise<SemanticSearchResult[]> {
    const count = await this.store.count()
    if (count === 0) return []

    const queryVector = await embedText(query)
    const results = await this.store.search(queryVector, topK)

    return results.filter(r => r.score > 0.3)
  }

  async indexedCount(): Promise<number> {
    return this.store.count()
  }
}
