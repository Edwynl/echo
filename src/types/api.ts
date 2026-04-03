/**
 * API Type Definitions
 * Common types used across API services
 */

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  data?: T
  error?: string
  code?: string
}

/**
 * Pagination information for list responses
 */
export interface PaginationInfo {
  page: number
  limit: number
  total: number
  pages: number
}

/**
 * Paginated API response
 */
export interface PaginatedResponse<T> extends ApiResponse<T> {
  pagination?: PaginationInfo
}

/**
 * Error response from API
 */
export interface ApiError {
  message: string
  code?: string
  status?: number
}

/**
 * HTTP Error with status code
 */
export class HttpError extends Error {
  status: number
  code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
  }
}

/**
 * Request options for API calls
 */
export interface RequestOptions extends RequestInit {
  timeout?: number
}

/**
 * Retry configuration for API calls
 */
export interface RetryConfig {
  maxRetries: number
  initialDelay: number
  maxDelay?: number
  backoffMultiplier?: number
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2
}
