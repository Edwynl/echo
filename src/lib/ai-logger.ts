/**
 * AI Service Logging and Monitoring
 * Tracks AI call success/failure rates and performance metrics
 */

interface AILogEntry {
  timestamp: string
  operation: string
  success: boolean
  duration: number // in milliseconds
  error?: string
  errorCode?: string
  retryCount: number
  model?: string
}

interface AIMetrics {
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  totalRetries: number
  averageDuration: number
  successRate: number
  lastCall?: AILogEntry
  recentErrors: Array<{
    timestamp: string
    operation: string
    error: string
  }>
}

/**
 * AI Service Logger
 * Singleton logger for tracking AI service calls
 */
class AIServiceLogger {
  private logs: AILogEntry[] = []
  private maxLogs: number = 1000 // Keep last 1000 entries
  private recentErrorCount: number = 10 // Keep last 10 errors

  /**
   * Log a successful AI call
   */
  logSuccess(
    operation: string,
    duration: number,
    retryCount: number = 0,
    model?: string
  ): void {
    const entry: AILogEntry = {
      timestamp: new Date().toISOString(),
      operation,
      success: true,
      duration,
      retryCount,
      model,
    }

    this.addLog(entry)
    console.log(`[AI] ${operation} succeeded in ${duration}ms (retries: ${retryCount})`)
  }

  /**
   * Log a failed AI call
   */
  logFailure(
    operation: string,
    duration: number,
    error: string,
    retryCount: number = 0,
    errorCode?: string
  ): void {
    const entry: AILogEntry = {
      timestamp: new Date().toISOString(),
      operation,
      success: false,
      duration,
      error,
      errorCode,
      retryCount,
    }

    this.addLog(entry)
    console.error(`[AI] ${operation} failed after ${duration}ms: ${error} (retries: ${retryCount})`)
  }

  /**
   * Log a retry attempt
   */
  logRetry(operation: string, attempt: number, maxAttempts: number, error?: string): void {
    console.log(`[AI] ${operation} retry ${attempt}/${maxAttempts}${error ? `: ${error}` : ''}`)
  }

  /**
   * Add log entry and maintain circular buffer
   */
  private addLog(entry: AILogEntry): void {
    this.logs.push(entry)
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): AIMetrics {
    const recentErrors = this.logs
      .filter((log) => !log.success)
      .slice(-this.recentErrorCount)
      .map((log) => ({
        timestamp: log.timestamp,
        operation: log.operation,
        error: log.error || 'Unknown error',
      }))

    const successfulCalls = this.logs.filter((log) => log.success).length
    const failedCalls = this.logs.filter((log) => !log.success).length
    const totalRetries = this.logs.reduce((sum, log) => sum + log.retryCount, 0)
    const totalDuration = this.logs.reduce((sum, log) => sum + log.duration, 0)

    return {
      totalCalls: this.logs.length,
      successfulCalls,
      failedCalls,
      totalRetries,
      averageDuration: this.logs.length > 0 ? totalDuration / this.logs.length : 0,
      successRate: this.logs.length > 0 ? successfulCalls / this.logs.length : 0,
      lastCall: this.logs[this.logs.length - 1],
      recentErrors,
    }
  }

  /**
   * Get recent logs for debugging
   */
  getRecentLogs(count: number = 20): AILogEntry[] {
    return this.logs.slice(-count)
  }

  /**
   * Clear all logs
   */
  clear(): void {
    this.logs = []
    console.log('[AI] Logs cleared')
  }

  /**
   * Get error summary
   */
  getErrorSummary(): Record<string, number> {
    const errors: Record<string, number> = {}
    for (const log of this.logs) {
      if (!log.success && log.error) {
        errors[log.error] = (errors[log.error] || 0) + 1
      }
    }
    return errors
  }
}

// Singleton instance
export const aiLogger = new AIServiceLogger()

/**
 * Create a simple wrapper that auto-logs AI calls
 */
export function withAILogging<T>(
  operation: string,
  fn: () => Promise<T>,
  options: { model?: string } = {}
): Promise<T> {
  const startTime = Date.now()
  const retryCount = 0

  return fn()
    .then((result) => {
      const duration = Date.now() - startTime
      aiLogger.logSuccess(operation, duration, retryCount, options.model)
      return result
    })
    .catch((error) => {
      const duration = Date.now() - startTime
      aiLogger.logFailure(
        operation,
        duration,
        error instanceof Error ? error.message : String(error),
        retryCount,
        error instanceof Error ? error.name : undefined
      )
      throw error
    })
}
