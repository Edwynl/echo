/**
 * Simple in-memory Circuit Breaker
 * Prevents cascading failures when an external service (e.g., MiniMax API) is down.
 *
 * States:
 *   CLOSED  — Normal operation, requests pass through
 *   OPEN    — Service is failing, requests fail immediately without calling the service
 *   HALF_OPEN — After recovery timeout, allow one test request through
 */

export type CircuitState = 'closed' | 'open' | 'half_open'

interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold: number
  /** Time in ms before attempting recovery (half-open state) */
  recoveryTimeout: number
  /** Expected name for logging */
  name: string
}

export class CircuitBreaker {
  private state: CircuitState = 'closed'
  private failureCount = 0
  private lastFailureTime = 0
  private readonly opts: CircuitBreakerOptions

  constructor(opts: Partial<CircuitBreakerOptions> & { name: string }) {
    this.opts = {
      failureThreshold: 5,
      recoveryTimeout: 30_000,
      ...opts,
    }
  }

  /**
   * Execute an operation with circuit breaker protection.
   * Throws immediately if circuit is open.
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime
      if (timeSinceFailure >= this.opts.recoveryTimeout) {
        this.state = 'half_open'
        console.log(`[CircuitBreaker:${this.opts.name}] HALF_OPEN — allowing test request`)
      } else {
        throw new Error(
          `[CircuitBreaker:${this.opts.name}] Circuit is OPEN — request blocked (retry in ${Math.ceil((this.opts.recoveryTimeout - timeSinceFailure) / 1000)}s)`
        )
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    if (this.state === 'half_open') {
      console.log(`[CircuitBreaker:${this.opts.name}] HALF_OPEN → CLOSED — service recovered`)
    }
    this.failureCount = 0
    this.state = 'closed'
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.opts.failureThreshold || this.state === 'half_open') {
      this.state = 'open'
      console.warn(
        `[CircuitBreaker:${this.opts.name}] OPEN — too many failures (${this.failureCount}), circuit opened for ${this.opts.recoveryTimeout / 1000}s`
      )
    }
  }

  getStatus(): { state: CircuitState; failureCount: number } {
    return { state: this.state, failureCount: this.failureCount }
  }
}
