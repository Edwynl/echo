/**
 * Unified API Response Utilities
 * Provides consistent error handling and response formatting across all API routes
 */

// Standard API response structure
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: ApiError
  meta?: {
    timestamp: string
    requestId?: string
  }
}

// API Error structure
export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
  stack?: string // Only included in development
}

// Error codes enum
export const ErrorCodes = {
  // Validation errors (400)
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Authentication errors (401)
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',

  // Not found errors (404)
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',

  // Conflict errors (409)
  DUPLICATE_ENTRY: 'DUPLICATE_ENTRY',
  CONFLICT: 'CONFLICT',

  // Rate limit errors (429)
  RATE_LIMITED: 'RATE_LIMITED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',

  // Server errors (500)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  AI_GENERATION_ERROR: 'AI_GENERATION_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',

  // Generic errors
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

/**
 * Create a success response
 */
export function successResponse<T>(data: T, requestId?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  }
}

/**
 * Create an error response
 */
export function errorResponse(
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
  requestId?: string
): ApiResponse {
  const isDev = process.env.NODE_ENV === 'development'

  return {
    success: false,
    error: {
      code,
      message,
      details,
      stack: isDev ? new Error().stack : undefined,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  }
}

/**
 * Handle known error types and return appropriate responses
 */
export function handleError(error: unknown, requestId?: string): ApiResponse {
  // Custom API errors (check before Prisma since both have 'code' property)
  if (error instanceof ApiException) {
    return errorResponse(error.code, error.message, error.details, requestId)
  }

  // Validation errors
  if (error instanceof ValidationError) {
    return errorResponse(
      ErrorCodes.VALIDATION_ERROR,
      error.message,
      error.details,
      requestId
    )
  }

  // Prisma errors
  if (isPrismaError(error)) {
    return handlePrismaError(error, requestId)
  }

  // Fetch/Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return errorResponse(
      ErrorCodes.EXTERNAL_SERVICE_ERROR,
      'Network request failed',
      { originalError: error.message },
      requestId
    )
  }

  // Timeout errors
  if (error instanceof Error && error.name === 'AbortError') {
    return errorResponse(
      ErrorCodes.TIMEOUT_ERROR,
      'Request timed out',
      undefined,
      requestId
    )
  }

  // Generic error
  const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred'
  return errorResponse(
    ErrorCodes.UNKNOWN_ERROR,
    errorMessage,
    process.env.NODE_ENV === 'development' ? { originalError: String(error) } : undefined,
    requestId
  )
}

/**
 * Check if error is a Prisma error
 */
function isPrismaError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as Record<string, unknown>).code === 'string'
  )
}

/**
 * Handle Prisma-specific errors
 */
function handlePrismaError(error: Record<string, unknown>, requestId?: string): ApiResponse {
  const prismaCode = error.code as string

  switch (prismaCode) {
    case 'P2002': // Unique constraint violation
      return errorResponse(
        ErrorCodes.DUPLICATE_ENTRY,
        'A record with this value already exists',
        { field: error.meta?.fieldName },
        requestId
      )
    case 'P2025': // Record not found
      return errorResponse(
        ErrorCodes.RESOURCE_NOT_FOUND,
        'The requested record was not found',
        undefined,
        requestId
      )
    case 'P1001': // Can't reach database
    case 'P1013': // Unknown database
      return errorResponse(
        ErrorCodes.DATABASE_ERROR,
        'Database connection error',
        undefined,
        requestId
      )
    default:
      return errorResponse(
        ErrorCodes.DATABASE_ERROR,
        'Database operation failed',
        { prismaCode },
        requestId
      )
  }
}

/**
 * Custom Validation Error class
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

/**
 * Custom API Exception class
 */
export class ApiException extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'ApiException'
  }
}

/**
 * Generate a unique request ID
 */
export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * Wrap an API handler with unified error handling
 */
export function withErrorHandling<T>(
  handler: () => Promise<ApiResponse<T>>,
  requestId?: string
): Promise<ApiResponse<T>> {
  try {
    return handler()
  } catch (error) {
    return Promise.resolve(handleError(error, requestId))
  }
}
