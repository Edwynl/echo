// YouTube API Service
// Handles channel info, video list, and metadata fetching

import { withRetry } from '@/lib/retry'
import { YOUTUBE_CONFIG } from '@/config'
import { HttpError } from '@/types/api'

// Response type definitions
interface YouTubeChannelSnippet {
  id: string
  snippet: {
    title: string
    description: string
    thumbnails: {
      high: { url: string }
      medium: { url: string }
    }
  }
}

interface YouTubeVideoSnippet {
  id: string
  snippet: {
    title: string
    description: string
    thumbnails: {
      high: { url: string }
      medium: { url: string }
    }
    publishedAt: string
    channelId: string
    channelTitle: string
  }
  contentDetails?: {
    duration: string
  }
  statistics?: {
    viewCount: string
  }
}

interface YouTubeSearchItem {
  id: {
    videoId?: string
    channelId?: string
  } | string
  snippet: {
    title: string
    description: string
    thumbnails: {
      high: { url: string }
      medium: { url: string }
    }
    publishedAt: string
    channelTitle: string
    channelId: string
  }
}

interface YouTubeChannelResponse {
  items: YouTubeChannelSnippet[]
}

interface YouTubeVideoResponse {
  items: YouTubeVideoSnippet[]
  nextPageToken?: string
}

interface YouTubeSearchResponse {
  items: YouTubeSearchItem[]
  nextPageToken?: string
}

// Default retry options
const DEFAULT_RETRY_OPTIONS = YOUTUBE_CONFIG.RETRY

export class YouTubeService {
  private apiKey: string

  constructor(apiKey?: string) {
    this.apiKey = apiKey || YOUTUBE_CONFIG.API_KEY || ''
  }

  /**
   * Generic fetch with retry for YouTube API
   */
  private async fetchWithRetry<T>(
    endpoint: string,
    options: { parseResponse?: boolean } = {}
  ): Promise<T> {
    const { parseResponse = true } = options

    return await withRetry(async () => {
      const response = await fetch(endpoint)

      if (!response.ok) {
        throw new HttpError(`HTTP ${response.status}`, response.status)
      }

      if (!parseResponse) {
        return {} as T
      }

      return await response.json()
    }, DEFAULT_RETRY_OPTIONS)
  }

  /**
   * Build API URL with query parameters
   */
  private buildUrl(
    endpoint: string,
    params: Record<string, string | number | boolean | undefined>
  ): string {
    const queryParams = new URLSearchParams()

    // Add API key to all requests
    if (this.apiKey) {
      queryParams.append('key', this.apiKey)
    }

    // Add additional params
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        queryParams.append(key, String(value))
      }
    }

    return `${YOUTUBE_CONFIG.API_BASE}${endpoint}?${queryParams.toString()}`
  }

  /**
   * Extract channel ID from URL or handle username
   */
  async resolveChannelId(input: string): Promise<string | null> {
    // Check if input is a video URL first
    const videoId = this.extractVideoId(input)
    if (videoId) {
      const channelId = await this.getChannelIdFromVideo(videoId)
      if (channelId) return channelId
    }

    // Already a channel ID
    if (input.startsWith('UC')) {
      return input
    }

    // Handle various YouTube URL formats
    const patterns = [
      /youtube\.com\/@(\w+)/,
      /youtube\.com\/channel\/(\w+)/,
      /youtube\.com\/c\/(\w+)/,
      /youtube\.com\/user\/(\w+)/,
    ]

    for (const pattern of patterns) {
      const match = input.match(pattern)
      if (match) {
        const identifier = match[1]
        if (!identifier.startsWith('UC')) {
          const channelId = await this.getChannelIdByHandle(identifier)
          if (channelId) return channelId
        }
      }
    }

    // If input looks like a handle, try direct search
    if (input.startsWith('@')) {
      const handle = input.slice(1)
      return await this.getChannelIdByHandle(handle)
    }

    return null
  }

  /**
   * Extract video ID from various YouTube URL formats
   */
  extractVideoId(input: string): string | null {
    const patterns = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ]

    for (const pattern of patterns) {
      const match = input.match(pattern)
      if (match && match[1]) {
        return match[1]
      }
    }

    // Check if input is already a video ID (11 characters)
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
      return input
    }

    return null
  }

  /**
   * Get channel ID from video ID
   */
  async getChannelIdFromVideo(videoId: string): Promise<string | null> {
    const url = this.buildUrl('/videos', {
      part: 'snippet',
      id: videoId
    })

    const data = await this.fetchWithRetry<YouTubeVideoResponse>(url)

    if (data.items && data.items.length > 0) {
      return data.items[0].snippet.channelId
    }
    return null
  }

  /**
   * Get video details
   */
  async getVideo(videoId: string): Promise<{
    youtubeId: string
    title: string
    description: string
    thumbnail: string
    channelId: string
    channelTitle: string
    publishedAt: string
    duration?: number
    viewCount?: number
  } | null> {
    const url = this.buildUrl('/videos', {
      part: 'snippet,contentDetails,statistics',
      id: videoId
    })

    const data = await this.fetchWithRetry<YouTubeVideoResponse>(url)

    if (data.items && data.items.length > 0) {
      const item = data.items[0]
      return {
        youtubeId: item.id,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
        channelId: item.snippet.channelId,
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt,
        duration: this.parseDuration(item.contentDetails?.duration),
        viewCount: parseInt(item.statistics?.viewCount || '0', 10)
      }
    }
    return null
  }

  /**
   * Get channel ID by handle/username
   */
  private async getChannelIdByHandle(handle: string): Promise<string | null> {
    const url = this.buildUrl('/search', {
      part: 'snippet',
      type: 'channel',
      q: handle
    })

    const data = await this.fetchWithRetry<YouTubeSearchResponse>(url)

    if (data.items && data.items.length > 0) {
      const item = data.items[0]
      if (typeof item.id === 'string') {
        return item.id
      }
      return item.id?.channelId || null
    }
    return null
  }

  /**
   * Fetch channel details
   */
  async getChannel(channelId: string): Promise<{
    id: string
    name: string
    description: string
    thumbnail: string
  } | null> {
    const url = this.buildUrl('/channels', {
      part: 'snippet',
      id: channelId
    })

    const data = await this.fetchWithRetry<YouTubeChannelResponse>(url)

    if (data.items && data.items.length > 0) {
      const item = data.items[0]
      return {
        id: item.id,
        name: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || ''
      }
    }
    return null
  }

  /**
   * Fetch latest videos from a channel
   * Fixed: batch-fetch video details to avoid N+1 problem (was 1 API call per video)
   */
  async getChannelVideos(
    channelId: string,
    maxResults: number = 5,
    pageToken?: string
  ): Promise<{
    videos: Array<{
      youtubeId: string
      title: string
      description: string
      thumbnail: string
      publishedAt: string
      duration?: number
      viewCount?: number
    }>
    nextPageToken?: string
  }> {
    const params: Record<string, string | number | boolean> = {
      part: 'snippet',
      channelId,
      maxResults,
      order: 'date',
      type: 'video'
    }

    if (pageToken) {
      params.pageToken = pageToken
    }

    const url = this.buildUrl('/search', params)
    const data = await this.fetchWithRetry<YouTubeSearchResponse>(url)

    // Collect valid video IDs
    const searchItems = (data.items || []).filter((item) => {
      const id = typeof item.id === 'string' ? item.id : item.id?.videoId
      return !!id
    })

    if (searchItems.length === 0) {
      return { videos: [], nextPageToken: data.nextPageToken }
    }

    // Batch fetch video details: YouTube API allows max 50 IDs per request
    // Previously this was 1 request per video = N+1 problem
    const BATCH_SIZE = 50
    const videoIdChunks: string[][] = []
    for (let i = 0; i < searchItems.length; i += BATCH_SIZE) {
      videoIdChunks.push(searchItems.slice(i, i + BATCH_SIZE).map((item) =>
        (typeof item.id === 'string' ? item.id : item.id?.videoId)!
      ))
    }

    const batchDetails = await Promise.all(
      videoIdChunks.map((ids) =>
        this.fetchWithRetry<YouTubeVideoResponse>(
          this.buildUrl('/videos', {
            part: 'contentDetails,statistics',
            id: ids.join(','),
          })
        )
      )
    )

    // Flatten details into a map for O(1) lookup
    const detailsMap = new Map<string, { duration?: number; viewCount?: number }>()
    for (const batch of batchDetails) {
      for (const item of batch.items || []) {
        detailsMap.set(item.id, {
          duration: this.parseDuration(item.contentDetails?.duration),
          viewCount: parseInt(item.statistics?.viewCount || '0', 10),
        })
      }
    }

    // Build result array by merging search snippet + batch-fetched details
    const videos = searchItems.map((item) => {
      const videoId = (typeof item.id === 'string' ? item.id : item.id?.videoId)!
      const details = detailsMap.get(videoId) || {}
      return {
        youtubeId: videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
        publishedAt: item.snippet.publishedAt,
        duration: details.duration,
        viewCount: details.viewCount,
      }
    })

    return { videos, nextPageToken: data.nextPageToken }
  }

  /**
   * Parse ISO 8601 duration to seconds
   */
  private parseDuration(duration?: string): number | undefined {
    if (!duration) return undefined

    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    if (!match) return undefined

    const hours = parseInt(match[1] || '0', 10)
    const minutes = parseInt(match[2] || '0', 10)
    const seconds = parseInt(match[3] || '0', 10)

    return hours * 3600 + minutes * 60 + seconds
  }

  /**
   * Search videos by keyword
   */
  async searchVideos(query: string, maxResults: number = 5): Promise<Array<{
    youtubeId: string
    title: string
    description: string
    thumbnail: string
    channelTitle: string
    publishedAt: string
  }>> {
    const url = this.buildUrl('/search', {
      part: 'snippet',
      q: query,
      maxResults,
      type: 'video'
    })

    const data = await this.fetchWithRetry<YouTubeSearchResponse>(url)

    return (data.items || []).map(item => {
      const videoId = typeof item.id === 'string' ? item.id : item.id?.videoId
      // Skip items without video ID
      if (!videoId) return null
      return {
        youtubeId: videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        thumbnail: item.snippet.thumbnails.high?.url || item.snippet.thumbnails.medium?.url || '',
        channelTitle: item.snippet.channelTitle,
        publishedAt: item.snippet.publishedAt
      }
    }).filter((v): v is NonNullable<typeof v> => v !== null)
  }
}

export const youtubeService = new YouTubeService()
