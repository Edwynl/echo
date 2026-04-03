// Retry utility with exponential backoff
// Used for handling transient failures in API calls

interface RetryOptions {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  shouldRetry?: (error: any) => boolean
}

const defaultShouldRetry = (error: any): boolean => {
  // Retry on network errors or rate limiting
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') {
    return true
  }

  // Retry on HTTP 429 (Too Many Requests) or 5xx errors
  if (error?.status === 429 || (error?.status >= 500 && error?.status < 600)) {
    return true
  }

  return false
}

/**
 * Execute a function with exponential backoff retry
 * @param fn The async function to execute
 * @param options Retry configuration
 * @returns The result of the function
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    shouldRetry = defaultShouldRetry
  } = options

  let lastError: any

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // Don't retry if we've exhausted attempts
      if (attempt === maxRetries) {
        break
      }

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      )

      // Add jitter to avoid thundering herd
      const jitter = delay * 0.1 * Math.random()
      const totalDelay = delay + jitter

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(totalDelay)}ms`)

      await new Promise(resolve => setTimeout(resolve, totalDelay))
    }
  }

  throw lastError
}

/**
 * Execute multiple functions in parallel with shared retry budget
 * @param fns Array of functions to execute
 * @param options Retry configuration
 * @returns Array of results
 */
export async function withParallelRetry<T>(
  fns: Array<() => Promise<T>>,
  options: RetryOptions & { concurrency?: number } = {}
): Promise<T[]> {
  const { concurrency = 3, ...retryOptions } = options

  const results: T[] = []
  const errors: any[] = []

  // Process in batches
  for (let i = 0; i < fns.length; i += concurrency) {
    const batch = fns.slice(i, i + concurrency)

    const batchResults = await Promise.allSettled(
      batch.map(fn => withRetry(fn, retryOptions))
    )

    batchResults.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value)
      } else {
        errors.push(result.reason)
        results.push(undefined as any)
      }
    })
  }

  return results
}

// Rate limiter for API calls
export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per second

  constructor(maxTokens: number, refillRate: number) {
    this.maxTokens = maxTokens
    this.refillRate = refillRate
    this.tokens = maxTokens
    this.lastRefill = Date.now()
  }

  private refill(): void {
    const now = Date.now()
    const timePassed = (now - this.lastRefill) / 1000
    const newTokens = timePassed * this.refillRate

    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens)
    this.lastRefill = now
  }

  async acquire(tokens: number = 1): Promise<void> {
    this.refill()

    if (this.tokens >= tokens) {
      this.tokens -= tokens
      return
    }

    // Calculate wait time
    const waitTime = ((tokens - this.tokens) / this.refillRate) * 1000
    await new Promise(resolve => setTimeout(resolve, waitTime))

    this.refill()
    this.tokens -= tokens
  }
}

// Simple in-memory rate limiter for YouTube API
export const youtubeRateLimiter = new RateLimiter(50, 10) // 50 requests, refills at 10/second

// Simple in-memory rate limiter for GitHub API
export const githubRateLimiter = new RateLimiter(30, 2) // 30 requests, refills at 2/second
