export interface VectorSearchResult {
  nodeId: string
  score: number
}

export interface VectorStore {
  upsert(nodeId: string, model: string, vector: number[]): Promise<void>
  search(queryVector: number[], topK: number): Promise<VectorSearchResult[]>
  delete(nodeId: string): Promise<void>
  has(nodeId: string): Promise<boolean>
  count(): Promise<number>
}
