import { describe, it, expect, beforeEach } from 'vitest'
import {
  successResponse,
  errorResponse,
  handleError,
  ValidationError,
  ApiException,
  ErrorCodes,
  generateRequestId,
  ApiResponse,
} from '../api-response'

describe('api-response', () => {
  describe('successResponse', () => {
    it('should create a success response with data', () => {
      const data = { id: '123', name: 'test' }
      const response = successResponse(data)

      expect(response.success).toBe(true)
      expect(response.data).toEqual(data)
      expect(response.error).toBeUndefined()
      expect(response.meta?.timestamp).toBeDefined()
    })

    it('should include request ID when provided', () => {
      const response = successResponse({ foo: 'bar' }, 'req_123')

      expect(response.meta?.requestId).toBe('req_123')
    })
  })

  describe('errorResponse', () => {
    it('should create an error response', () => {
      const response = errorResponse(
        ErrorCodes.VALIDATION_ERROR,
        'Invalid input',
        { field: 'email' }
      )

      expect(response.success).toBe(false)
      expect(response.error?.code).toBe('VALIDATION_ERROR')
      expect(response.error?.message).toBe('Invalid input')
      expect(response.error?.details).toEqual({ field: 'email' })
    })

    it('should include timestamp in meta', () => {
      const response = errorResponse(ErrorCodes.NOT_FOUND, 'Not found')

      expect(response.meta?.timestamp).toBeDefined()
    })
  })

  describe('handleError', () => {
    it('should handle ValidationError', () => {
      const error = new ValidationError('Field is required', { field: 'name' })
      const response = handleError(error)

      expect(response.success).toBe(false)
      expect(response.error?.code).toBe('VALIDATION_ERROR')
    })

    it('should handle ApiException', () => {
      const error = new ApiException(
        ErrorCodes.NOT_FOUND,
        'Resource not found',
        { id: '123' }
      )
      const response = handleError(error)

      expect(response.success).toBe(false)
      expect(response.error?.code).toBe('NOT_FOUND')
      expect(response.error?.details).toEqual({ id: '123' })
    })

    it('should handle generic errors', () => {
      const error = new Error('Something went wrong')
      const response = handleError(error)

      expect(response.success).toBe(false)
      expect(response.error?.code).toBe('UNKNOWN_ERROR')
    })

    it('should handle null/undefined errors', () => {
      const response = handleError(null)
      expect(response.success).toBe(false)
      expect(response.error?.code).toBe('UNKNOWN_ERROR')
    })

    it('should handle network errors', () => {
      const error = new TypeError('Failed to fetch')
      const response = handleError(error)

      expect(response.success).toBe(false)
      expect(response.error?.code).toBe('EXTERNAL_SERVICE_ERROR')
    })
  })

  describe('ValidationError', () => {
    it('should create with message and details', () => {
      const error = new ValidationError('Invalid', { field: 'email' })

      expect(error.message).toBe('Invalid')
      expect(error.details).toEqual({ field: 'email' })
      expect(error.name).toBe('ValidationError')
    })
  })

  describe('ApiException', () => {
    it('should create with code, message and details', () => {
      const error = new ApiException(
        ErrorCodes.RATE_LIMITED,
        'Too many requests',
        { retryAfter: 60 }
      )

      expect(error.code).toBe('RATE_LIMITED')
      expect(error.message).toBe('Too many requests')
      expect(error.details).toEqual({ retryAfter: 60 })
      expect(error.name).toBe('ApiException')
    })
  })

  describe('generateRequestId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateRequestId()
      const id2 = generateRequestId()

      expect(id1).toMatch(/^req_/)
      expect(id2).toMatch(/^req_/)
      expect(id1).not.toBe(id2)
    })
  })

  describe('ErrorCodes', () => {
    it('should have all expected error codes', () => {
      expect(ErrorCodes.VALIDATION_ERROR).toBe('VALIDATION_ERROR')
      expect(ErrorCodes.NOT_FOUND).toBe('NOT_FOUND')
      expect(ErrorCodes.RATE_LIMITED).toBe('RATE_LIMITED')
      expect(ErrorCodes.INTERNAL_ERROR).toBe('INTERNAL_ERROR')
      expect(ErrorCodes.AI_GENERATION_ERROR).toBe('AI_GENERATION_ERROR')
    })
  })
})
