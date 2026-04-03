'use client'

// Skeleton loading animation styles
const shimmerClass = 'animate-pulse bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 bg-[length:200%_100%]'

// Blog Card Skeleton
export function BlogCardSkeleton() {
  return (
    <div className="group relative border-b border-gray-100 py-10 first:pt-0">
      <div className="flex flex-col sm:flex-row justify-between gap-6 sm:gap-8 md:gap-12">
        {/* Text Content */}
        <div className="flex-1 min-w-0">
          <div className={`h-7 sm:h-8 w-4/5 sm:w-full rounded-lg mb-3 ${shimmerClass}`} />
          <div className={`h-7 w-3/4 rounded-lg mb-4 ${shimmerClass}`} />
          <div className={`h-5 w-full rounded mb-2 hidden sm:block ${shimmerClass}`} />
          <div className={`h-5 w-4/5 rounded mb-4 hidden sm:block ${shimmerClass}`} />
          <div className="flex items-center gap-3">
            <div className={`h-3 w-20 rounded ${shimmerClass}`} />
            <div className={`h-3 w-3 rounded-full bg-gray-200`} />
            <div className={`h-3 w-24 rounded hidden sm:block ${shimmerClass}`} />
          </div>
        </div>

        {/* Image and Button */}
        <div className="flex flex-row sm:flex-col items-center gap-4 w-auto sm:w-40 flex-shrink-0">
          <div className={`w-24 sm:w-full h-24 sm:h-28 rounded-sm ${shimmerClass}`} />
          <div className={`w-20 sm:w-full h-7 rounded-full ${shimmerClass}`} />
        </div>
      </div>
    </div>
  )
}

// Blog List Skeleton
export function BlogListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }).map((_, i) => (
        <BlogCardSkeleton key={i} />
      ))}
    </div>
  )
}

// Source Card Skeleton
export function SourceCardSkeleton() {
  return (
    <div className="p-6 border-b border-gray-50 last:border-0">
      <div className="flex items-start gap-4">
        <div className={`w-16 h-16 rounded-lg flex-shrink-0 ${shimmerClass}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-5 w-16 rounded ${shimmerClass}`} />
            <div className={`h-5 w-20 rounded ${shimmerClass}`} />
          </div>
          <div className={`h-6 w-3/4 rounded-lg mb-2 ${shimmerClass}`} />
          <div className={`h-4 w-full rounded mb-1 ${shimmerClass}`} />
          <div className={`h-4 w-2/3 rounded mb-3 ${shimmerClass}`} />
          <div className="flex items-center gap-4">
            <div className={`h-3 w-20 rounded ${shimmerClass}`} />
            <div className={`h-3 w-24 rounded ${shimmerClass}`} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <div className={`w-8 h-8 rounded-full ${shimmerClass}`} />
          <div className={`w-8 h-8 rounded-full ${shimmerClass}`} />
        </div>
      </div>
    </div>
  )
}

// Source List Skeleton
export function SourceListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <SourceCardSkeleton key={i} />
      ))}
    </div>
  )
}

// Stats Card Skeleton
export function StatsCardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-5 h-5 rounded ${shimmerClass}`} />
        <div className={`h-4 w-16 rounded ${shimmerClass}`} />
      </div>
      <div className={`h-8 w-12 rounded ${shimmerClass}`} />
    </div>
  )
}

// Progress Bar Component
interface ProgressBarProps {
  progress: number
  label?: string
  showPercentage?: boolean
}

export function ProgressBar({ progress, label, showPercentage = true }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress))

  return (
    <div className="w-full">
      {label && (
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm text-muted">{label}</span>
          {showPercentage && (
            <span className="text-sm font-medium text-accent">{Math.round(clampedProgress)}%</span>
          )}
        </div>
      )}
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-accent to-emerald-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  )
}

// Processing Status Card
interface ProcessingStatusCardProps {
  sourceType: string
  title: string
  status: string
  progress?: number
}

export function ProcessingStatusCard({ sourceType, title, status, progress }: ProcessingStatusCardProps) {
  return (
    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
        <span className="text-sm font-medium text-blue-700 uppercase tracking-wide">
          {status}
        </span>
      </div>
      <p className="text-sm text-blue-600 font-medium truncate">{title}</p>
      {progress !== undefined && (
        <div className="mt-3">
          <ProgressBar progress={progress} showPercentage={true} />
        </div>
      )}
    </div>
  )
}

// Enhanced Error Alert with suggestions
interface ErrorAlertProps {
  title: string
  message: string
  suggestions?: string[]
  onRetry?: () => void
}

export function ErrorAlert({ title, message, suggestions, onRetry }: ErrorAlertProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
      <div className="flex items-start gap-3">
        <div className="w-5 h-5 mt-0.5">
          <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="flex-1">
          <h4 className="text-sm font-bold text-red-800 mb-1">{title}</h4>
          <p className="text-sm text-red-600 mb-2">{message}</p>
          {suggestions && suggestions.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-medium text-red-700 mb-1">建议 / Suggestions:</p>
              <ul className="text-xs text-red-600 space-y-1">
                {suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start gap-1">
                    <span className="text-red-400 mt-1">•</span>
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-3 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-lg transition-colors"
            >
              重试 / Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// Toast Component (for inline use)
interface ToastInlineProps {
  message: string
  type: 'success' | 'error' | 'info'
  onClose: () => void
}

export function ToastInline({ message, type, onClose }: ToastInlineProps) {
  const bgColor = {
    success: 'bg-emerald-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  }[type]

  const icon = {
    success: (
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    info: (
      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  }[type]

  return (
    <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-5 py-3 rounded-full shadow-xl flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300 ${bgColor}`}>
      {icon}
      <p className="text-sm font-medium text-white">{message}</p>
      <button
        onClick={onClose}
        className="ml-2 p-1 hover:bg-white/20 rounded-full transition-colors"
      >
        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
