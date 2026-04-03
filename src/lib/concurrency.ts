// Concurrency Control Utility
// Provides limited concurrent execution for batch operations

import pLimit from 'p-limit'

// Default concurrency limits
export const DEFAULT_CONCURRENCY = {
  VIDEO_PROCESSING: 3,
  BLOG_GENERATION: 3,
  GITHUB_API: 3,
  YOUTUBE_API: 3,
  DEFAULT: 5
}

// Create a limited concurrency function
export function createLimitedConcurrency<T>(
  limit: number = DEFAULT_CONCURRENCY.DEFAULT
) {
  const limiter = pLimit(limit)
  return limiter
}

// Result type for batch operations
export interface BatchResult<T, E = Error> {
  item: T
  success: boolean
  data?: unknown
  error?: string
}

// Process items with limited concurrency
export async function processWithConcurrencyLimit<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<unknown>,
  options: {
    limit?: number
    onProgress?: (completed: number, total: number) => void
    stopOnError?: boolean
  } = {}
): Promise<BatchResult<T>[]> {
  const {
    limit = DEFAULT_CONCURRENCY.DEFAULT,
    onProgress,
    stopOnError = false
  } = options

  const limiter = pLimit(limit)
  const results: BatchResult<T>[] = []
  let completed = 0

  // Create promises with concurrency control
  const promises = items.map((item, index) =>
    limiter(async () => {
      try {
        const data = await processor(item, index)
        results.push({ item, success: true, data })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        results.push({ item, success: false, error: errorMessage })

        if (stopOnError) {
          throw error
        }
      } finally {
        completed++
        onProgress?.(completed, items.length)
      }
    })
  )

  // Wait for all to complete (or stop on error if configured)
  await Promise.all(promises)

  return results
}

// Process items sequentially with delay between each
export async function processWithDelay<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<unknown>,
  options: {
    delayMs?: number
    onProgress?: (completed: number, total: number) => void
  } = {}
): Promise<BatchResult<T>[]> {
  const { delayMs = 1000, onProgress } = options
  const results: BatchResult<T>[] = []

  for (let i = 0; i < items.length; i++) {
    try {
      const data = await processor(items[i], i)
      results.push({ item: items[i], success: true, data })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      results.push({ item: items[i], success: false, error: errorMessage })
    } finally {
      onProgress?.(i + 1, items.length)
    }

    // Add delay between items (except after the last one)
    if (i < items.length - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  return results
}

// Combined approach: concurrent with rate limiting
export async function processWithRateLimit<T>(
  items: T[],
  processor: (item: T, index: number) => Promise<unknown>,
  options: {
    concurrency?: number
    delayMs?: number
    onProgress?: (completed: number, total: number) => void
  } = {}
): Promise<BatchResult<T>[]> {
  const { concurrency = 3, delayMs = 2000, onProgress } = options

  // Use p-limit for concurrency
  const limiter = pLimit(concurrency)
  const results: BatchResult<T>[] = []
  let completed = 0
  let lastExecutionTime = 0

  const processWithRateControl = async (item: T, index: number): Promise<void> => {
    const now = Date.now()
    const timeSinceLastExecution = now - lastExecutionTime

    // Rate limit: ensure minimum delay between executions
    if (timeSinceLastExecution < delayMs) {
      await new Promise(resolve => setTimeout(resolve, delayMs - timeSinceLastExecution))
    }

    lastExecutionTime = Date.now()

    try {
      const data = await processor(item, index)
      results.push({ item, success: true, data })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      results.push({ item, success: false, error: errorMessage })
    } finally {
      completed++
      onProgress?.(completed, items.length)
    }
  }

  // Process all items with concurrency control
  const promises = items.map((item, index) => limiter(() => processWithRateControl(item, index)))
  await Promise.all(promises)

  return results
}

// Summarize batch results
export function summarizeResults<T>(results: BatchResult<T>[]): {
  total: number
  successful: number
  failed: number
  successRate: number
  errors: Array<{ item: T; error: string }>
} {
  const successful = results.filter(r => r.success).length
  const failed = results.filter(r => !r.success).length
  const errors = results
    .filter(r => !r.success)
    .map(r => ({ item: r.item, error: r.error || 'Unknown error' }))

  return {
    total: results.length,
    successful,
    failed,
    successRate: results.length > 0 ? Math.round((successful / results.length) * 100) : 0,
    errors
  }
}

// Pre-configured batch processors
export const batchProcessors = {
  // For video processing (syncing from YouTube)
  video: <T>(items: T[], processor: (item: T, index: number) => Promise<unknown>) =>
    processWithRateLimit(items, processor, {
      concurrency: DEFAULT_CONCURRENCY.VIDEO_PROCESSING,
      delayMs: 2000 // 2 seconds between API calls
    }),

  // For blog generation (using MiniMax API)
  blog: <T>(items: T[], processor: (item: T, index: number) => Promise<unknown>) =>
    processWithRateLimit(items, processor, {
      concurrency: DEFAULT_CONCURRENCY.BLOG_GENERATION,
      delayMs: 3000 // 3 seconds between API calls
    }),

  // For GitHub API calls
  github: <T>(items: T[], processor: (item: T, index: number) => Promise<unknown>) =>
    processWithRateLimit(items, processor, {
      concurrency: DEFAULT_CONCURRENCY.GITHUB_API,
      delayMs: 1000 // 1 second between API calls
    }),

  // General purpose
  default: <T>(items: T[], processor: (item: T, index: number) => Promise<unknown>) =>
    processWithConcurrencyLimit(items, processor, {
      limit: DEFAULT_CONCURRENCY.DEFAULT
    })
}

export default {
  DEFAULT_CONCURRENCY,
  createLimitedConcurrency,
  processWithConcurrencyLimit,
  processWithDelay,
  processWithRateLimit,
  summarizeResults,
  batchProcessors
}
