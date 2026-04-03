import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn()
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn()
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // Return a simple functional component that renders an img element
    const { src, alt, ...rest } = props
    return { type: 'img', props: { src, alt, ...rest } }
  }
}))

// Mock process.env for tests
Object.defineProperty(process, 'env', {
  value: {
    ...process.env,
    NODE_ENV: 'test',
    GITHUB_TOKEN: 'test-token',
    GITHUB_API_BASE: 'https://api.github.com'
  },
  writable: true
})

// Suppress console.error in tests unless explicitly needed
const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  // Filter out expected warnings
  const message = args[0]?.toString?.() || ''
  if (
    message.includes('Warning:') ||
    message.includes('React') ||
    message.includes('Not implemented')
  ) {
    return
  }
  originalConsoleError(...args)
}

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
})
