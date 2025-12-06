/**
 * Vector Similarity Functions
 *
 * Pure cosine similarity implementation for vector search.
 */

/**
 * Calculate cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite).
 *
 * Normalized embeddings (like from OpenAI/Transformers.js) simplify to dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * Find top-k most similar vectors to a query vector.
 * Returns indices and similarity scores sorted by similarity (descending).
 */
export function topKSimilar(
  queryVector: number[],
  vectors: number[][],
  k: number
): Array<{ index: number; similarity: number }> {
  const similarities = vectors.map((vector, index) => ({
    index,
    similarity: cosineSimilarity(queryVector, vector),
  }));

  // Sort by similarity descending
  similarities.sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, k);
}

/**
 * Convert similarity score (0-1) to a normalized relevance score.
 * Applies a threshold and rescales for better UX.
 */
export function normalizeScore(
  similarity: number,
  threshold: number = 0.3
): number {
  if (similarity < threshold) {
    return 0;
  }
  // Rescale from [threshold, 1] to [0, 1]
  return (similarity - threshold) / (1 - threshold);
}
