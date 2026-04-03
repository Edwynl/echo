import { describe, it, expect, vi, beforeEach } from 'vitest'
import { withRetry, validateContent, withContentValidation, DEFAULT_RETRY_OPTIONS } from '../ai-retry'
import { aiLogger } from '../ai-logger'

describe('withRetry', () => {
  beforeEach(() => {
    aiLogger.clear()
  })

  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success')

    const result = await withRetry('test', fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on retryable error', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce('success')

    const result = await withRetry('test', fn, { maxRetries: 2 })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should throw after max retries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ECONNRESET'))

    await expect(withRetry('test', fn, { maxRetries: 2 })).rejects.toThrow('ECONNRESET')
    expect(fn).toHaveBeenCalledTimes(3) // Initial + 2 retries
  })

  it('should not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('Validation error'))

    await expect(withRetry('test', fn, { maxRetries: 2 })).rejects.toThrow('Validation error')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry on rate limit errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('status_code: 429 Too Many Requests'))
      .mockResolvedValueOnce('success')

    const result = await withRetry('test', fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should retry on server errors', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('status_code: 500 Internal Server Error'))
      .mockRejectedValueOnce(new Error('status_code: 502 Bad Gateway'))
      .mockResolvedValueOnce('success')

    const result = await withRetry('test', fn)

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})

describe('validateContent', () => {
  it('should validate good content', () => {
    const result = validateContent('This is a valid content with enough length to pass validation.')

    expect(result.valid).toBe(true)
    expect(result.error).toBeUndefined()
  })

  it('should reject null content', () => {
    const result = validateContent(null)

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Content is null or undefined')
  })

  it('should reject undefined content', () => {
    const result = validateContent(undefined as unknown as string)

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Content is null or undefined')
  })

  it('should reject non-string content', () => {
    const result = validateContent(123)

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Content is not a string')
  })

  it('should reject too short content', () => {
    const result = validateContent('Too short')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Content is too short (less than 50 characters)')
  })

  it('should reject AI apology patterns', () => {
    const result = validateContent("I'm sorry, I can't help with that. This is a longer message that explains why.")

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Content appears to be an error message or refusal')
  })

  it('should reject AI denial patterns', () => {
    const result = validateContent('I cannot process this request because it violates our policy. Here is more detail about the rejection.')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Content appears to be an error message or refusal')
  })

  it('should reject AI self-reference patterns', () => {
    const result = validateContent('As an AI language model, I am not able to provide this information. This is a detailed explanation.')

    expect(result.valid).toBe(false)
    expect(result.error).toBe('Content appears to be an error message or refusal')
  })

  it('should accept Chinese content', () => {
    // Chinese characters count as single characters, need more to pass 50 char threshold
    const result = validateContent('这是一段有效的中文内容，包含足够的长度来通过验证。这是更多内容以确保超过五十个字符的要求，至少需要超过五十个字符的内容。')

    expect(result.valid).toBe(true)
  })
})

describe('withContentValidation', () => {
  it('should return result if validation passes', async () => {
    const fn = vi.fn().mockResolvedValue('This is valid content that should pass validation.')

    const result = await withContentValidation('test', fn)

    expect(result).toBe('This is valid content that should pass validation.')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('should retry if validation fails', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce('Too short')
      .mockResolvedValueOnce('This is valid content that should pass.')

    const result = await withContentValidation('test', fn, { maxValidationRetries: 1 })

    expect(result).toBe('This is valid content that should pass.')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('should return last result after max validation retries', async () => {
    // Note: withContentValidation returns last result even after max retries, not throw
    const fn = vi.fn().mockResolvedValue('short content')

    const result = await withContentValidation('test', fn, { maxValidationRetries: 0 })
    // The function returns the last result instead of throwing
    expect(result).toBe('short content')
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('DEFAULT_RETRY_OPTIONS', () => {
  it('should have reasonable defaults', () => {
    expect(DEFAULT_RETRY_OPTIONS.maxRetries).toBe(2)
    expect(DEFAULT_RETRY_OPTIONS.initialDelay).toBe(1000)
    expect(DEFAULT_RETRY_OPTIONS.maxDelay).toBe(10000)
    expect(DEFAULT_RETRY_OPTIONS.backoffMultiplier).toBe(2)
    expect(DEFAULT_RETRY_OPTIONS.retryableErrors).toBeDefined()
    expect(DEFAULT_RETRY_OPTIONS.retryableErrors.length).toBeGreaterThan(0)
  })
})
