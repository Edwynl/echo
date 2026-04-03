/**
 * Queue Types and Interfaces
 * Defines the structure for the sync queue system
 *
 * Queue state is persisted to the database so it survives server restarts.
 * The in-memory QueueState mirrors the database and is used for fast reads
 * during processing. On startup, state is hydrated from the database.
 */

export interface QueueItem {
  id: string
  channelId: string
  channelName: string
  channelThumbnail: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  addedAt: string
  startedAt?: string
  completedAt?: string
  progress: {
    current: number
    total: number
    currentVideoTitle?: string
  }
  result?: {
    newVideos: number
    blogsGenerated: number
    skipped: number
    errors: string[]
  }
  error?: string
}

export interface QueueStatus {
  isProcessing: boolean
  currentItem: QueueItem | null
  queue: QueueItem[]
  stats: {
    totalProcessed: number
    totalPending: number
    totalFailed: number
  }
  estimatedTimeRemaining?: number // in minutes
}
