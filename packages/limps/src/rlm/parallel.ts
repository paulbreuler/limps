/**
 * Parallel execution utilities for RLM sub-calls.
 * Provides concurrency control, timeout handling, and failure isolation.
 */

/**
 * Options for parallel execution.
 */
export interface ParallelOptions {
  /** Maximum number of concurrent operations */
  concurrency: number;
  /** Per-item timeout in milliseconds */
  timeout?: number;
}

/**
 * Result type for parallel map operations.
 * Each result is either a success with a value or a failure with an error message.
 */
export type ParallelResult<T> = { success: true; value: T } | { success: false; error: string };

/**
 * Execute a function on each item in parallel with concurrency control.
 *
 * Uses Promise.allSettled for failure isolation - one failure doesn't abort others.
 * Results are returned in the same order as input items.
 *
 * @param items - Array of items to process
 * @param fn - Async function to execute on each item
 * @param options - Parallel execution options
 * @returns Array of results in input order (success or failure per item)
 *
 * @example
 * const results = await parallelMap(
 *   [1, 2, 3],
 *   async (n) => n * 2,
 *   { concurrency: 2 }
 * );
 * // [{ success: true, value: 2 }, { success: true, value: 4 }, { success: true, value: 6 }]
 */
export async function parallelMap<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: ParallelOptions
): Promise<ParallelResult<R>[]> {
  const { concurrency, timeout } = options;

  if (items.length === 0) {
    return [];
  }

  // Process items in batches to respect concurrency limit
  const results: ParallelResult<R>[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchIndices = batch.map((_, batchIdx) => i + batchIdx);

    // Create promises for this batch
    const batchPromises = batch.map(async (item, batchIdx): Promise<ParallelResult<R>> => {
      const index = batchIndices[batchIdx];

      try {
        // Create a promise that either resolves with the result or times out
        let resultPromise = fn(item, index);

        // Apply timeout if specified
        if (timeout !== undefined && timeout > 0) {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Operation timed out after ${timeout}ms`));
            }, timeout);
          });

          resultPromise = Promise.race([resultPromise, timeoutPromise]);
        }

        const value = await resultPromise;
        return { success: true, value };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return { success: false, error: errorMessage };
      }
    });

    // Wait for all items in this batch to complete (using allSettled for isolation)
    const batchResults = await Promise.allSettled(batchPromises);

    // Process batch results - allSettled guarantees all promises are settled
    for (const settled of batchResults) {
      if (settled.status === 'fulfilled') {
        results.push(settled.value);
      } else {
        // This shouldn't happen since batchPromises already handle errors,
        // but handle it defensively
        results.push({
          success: false,
          error: settled.reason instanceof Error ? settled.reason.message : String(settled.reason),
        });
      }
    }
  }

  return results;
}
