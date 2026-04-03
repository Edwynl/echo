/**
 * AI Service Retry Mechanism
 * Provides automatic retry with exponential backoff for AI API calls
 */

import { aiLogger } from './ai-logger'

export interface RetryOptions {
  maxRetries: number
  initialDelay: number // in milliseconds
  maxDelay: number // in milliseconds
  backoffMultiplier: number
  retryableErrors?: string[] // Error codes/messages that should trigger retry
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 2,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
  retryableErrors: [
    'network',
    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'timeout',
    'aborted',
    'status_code: 429', // Rate limit
    'status_code: 500', // Internal server error
    'status_code: 502', // Bad gateway
    'status_code: 503', // Service unavailable
    'status_code: 504', // Gateway timeout
  ],
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown, retryableErrors: string[]): boolean {
  const errorString = String(error).toLowerCase()

  for (const pattern of retryableErrors) {
    if (errorString.includes(pattern.toLowerCase())) {
      return true
    }
  }

  return false
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(
  attempt: number,
  options: RetryOptions
): number {
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt)
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay)
  // Add jitter (±25%) to prevent thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1)
  return Math.floor(cappedDelay + jitter)
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  operation: string,
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: unknown

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const startTime = Date.now()
      const result = await fn()
      const duration = Date.now() - startTime

      if (attempt > 0) {
        aiLogger.logSuccess(operation, duration, attempt)
      }

      return result
    } catch (error) {
      lastError = error
      const duration = Date.now() - Date.now() // This is 0, but we log the attempt

      // Check if we should retry
      const shouldRetry = attempt < opts.maxRetries && isRetryableError(error, opts.retryableErrors!)

      if (shouldRetry) {
        const delay = calculateDelay(attempt, opts)
        aiLogger.logRetry(operation, attempt + 1, opts.maxRetries + 1, error instanceof Error ? error.message : String(error))

        await sleep(delay)
      } else {
        // Log failure without retry
        aiLogger.logFailure(
          operation,
          0,
          error instanceof Error ? error.message : String(error),
          attempt
        )
        break
      }
    }
  }

  throw lastError
}

/**
 * Validate AI generated content
 */
export function validateContent(content: unknown): { valid: boolean; error?: string } {
  // Check if content exists
  if (content === null || content === undefined) {
    return { valid: false, error: 'Content is null or undefined' }
  }

  // Check if content is a string
  if (typeof content !== 'string') {
    return { valid: false, error: 'Content is not a string' }
  }

  // Check minimum length (prevent empty or near-empty responses)
  if (content.trim().length < 50) {
    return { valid: false, error: 'Content is too short (less than 50 characters)' }
  }

  // Check for obvious AI failure patterns
  const failurePatterns = [
    /^I'm sorry, I can't/,
    /^I cannot/,
    /^Sorry, but/,
    /^I don't know/,
    /^As an AI/,
    /^I wasn't able/,
  ]

  for (const pattern of failurePatterns) {
    if (pattern.test(content.trim())) {
      return { valid: false, error: 'Content appears to be an error message or refusal' }
    }
  }

  return { valid: true }
}

/**
 * Content validation with retry - regenerates if validation fails
 */
export async function withContentValidation<T>(
  operation: string,
  fn: () => Promise<T>,
  options: {
    maxValidationRetries?: number
    retryOptions?: Partial<RetryOptions>
    contentExtractor?: (result: T) => string
  } = {}
): Promise<T> {
  const { maxValidationRetries = 2, retryOptions = {}, contentExtractor } = options

  for (let attempt = 0; attempt <= maxValidationRetries; attempt++) {
    const result = await withRetry(
      `${operation}${attempt > 0 ? ` (attempt ${attempt + 1})` : ''}`,
      fn,
      retryOptions
    )

    // If no content extractor provided, assume the result is the content
    const content = contentExtractor ? contentExtractor(result) : (result as unknown as string)

    const validation = validateContent(content)

    if (validation.valid) {
      return result
    }

    console.warn(`[AI] Content validation failed (attempt ${attempt + 1}): ${validation.error}`)

    if (attempt >= maxValidationRetries) {
      // Return the last result anyway, but log the warning
      console.error(`[AI] Max validation retries reached for ${operation}, using last result`)
      return result
    }
  }

  // This should never be reached, but TypeScript needs it
  return fn()
}
