/**
 * Sync Queue Workflow
 * Durable workflow for processing channel sync queue
 * Replaces the setInterval-based queue processor that doesn't work in Serverless
 */

import { PrismaClient } from '@prisma/client'
import { YouTubeService } from '@/services/youtube'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { uniqueSlug, cleanExcerpt, truncate } from '@/lib/utils'

const MAX_NEW_VIDEOS = 5
const VIDEOS_TO_CHECK = 50
const MAX_VIDEOS_PER_CHANNEL = 50

// Prisma client for workflow steps
function getPrisma(): PrismaClient {
  const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClient | undefined
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient()
  }
  return globalForPrisma.prisma
}

// ============================================================================
// STEP FUNCTIONS - Full Node.js access, auto-retry, cached results
// ============================================================================

async function stepGetPendingQueueItem(): Promise<{
  id: string
  channelId: string
  channelName: string
  channelThumbnail: string
} | null> {
  'use step'

  const prisma = getPrisma()
  const rows = await prisma.$queryRaw<Array<{
    id: string
    channelId: string
    channelName: string
    channelThumbnail: string
  }>>`
    SELECT id, "channelId", "channelName", "channelThumbnail"
    FROM "SyncQueue"
    WHERE status = 'pending'
    ORDER BY "addedAt" ASC
    LIMIT 1
  `

  if (rows.length === 0) return null
  return {
    id: rows[0].id,
    channelId: rows[0].channelId,
    channelName: rows[0].channelName,
    channelThumbnail: rows[0].channelThumbnail || ''
  }
}

async function stepUpdateQueueStatus(
  id: string,
  status: string,
  startedAt?: string,
  completedAt?: string,
  progressCurrent?: number,
  progressTotal?: number,
  currentVideoTitle?: string,
  resultNewVideos?: number,
  resultBlogsGenerated?: number,
  resultSkipped?: number,
  resultErrors?: string[],
  error?: string
): Promise<void> {
  'use step'

  const prisma = getPrisma()
  const data: Record<string, unknown> = { status }

  if (startedAt) data.startedAt = new Date(startedAt)
  if (completedAt) data.completedAt = new Date(completedAt)
  if (progressCurrent !== undefined) data.progressCurrent = progressCurrent
  if (progressTotal !== undefined) data.progressTotal = progressTotal
  if (currentVideoTitle !== undefined) data.currentVideoTitle = currentVideoTitle || null
  if (resultNewVideos !== undefined) data.resultNewVideos = resultNewVideos
  if (resultBlogsGenerated !== undefined) data.resultBlogsGenerated = resultBlogsGenerated
  if (resultSkipped !== undefined) data.resultSkipped = resultSkipped
  if (resultErrors !== undefined) data.resultErrors = JSON.stringify(resultErrors)
  if (error !== undefined) data.error = error

  await prisma.syncQueue.update({ where: { id }, data })
}

async function stepGetChannel(channelId: string): Promise<{
  id: string
  youtubeId: string
  name: string
} | null> {
  'use step'

  const prisma = getPrisma()
  const channel = await prisma.channel.findUnique({ where: { id: channelId } })
  if (!channel) return null
  return { id: channel.id, youtubeId: channel.youtubeId, name: channel.name }
}

async function stepFetchChannelVideos(
  youtubeId: string
): Promise<Array<{
  youtubeId: string
  title: string
  description: string
  thumbnail: string
  duration: number
  viewCount: number
  publishedAt: string
}>> {
  'use step'

  const youtubeService = new YouTubeService()
  const { videos } = await youtubeService.getChannelVideos(youtubeId, VIDEOS_TO_CHECK)

  // Sort by date descending
  return videos
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .map(v => ({
      youtubeId: v.youtubeId,
      title: v.title,
      description: v.description || '',
      thumbnail: v.thumbnail || '',
      duration: v.duration || 0,
      viewCount: v.viewCount || 0,
      publishedAt: v.publishedAt
    }))
}

async function stepCheckVideoExists(youtubeId: string): Promise<boolean> {
  'use step'

  const prisma = getPrisma()
  const video = await prisma.video.findUnique({ where: { youtubeId } })
  return !!video
}

async function stepCreateVideo(data: {
  youtubeId: string
  channelId: string
  title: string
  description: string
  thumbnail: string
  duration: number
  viewCount: number
  publishedAt: Date
}): Promise<string> {
  'use step'

  const prisma = getPrisma()

  // Enforce max videos per channel
  const videoCount = await prisma.video.count({ where: { channelId: data.channelId } })
  if (videoCount >= MAX_VIDEOS_PER_CHANNEL) {
    const oldest = await prisma.video.findMany({
      where: { channelId: data.channelId },
      orderBy: { publishedAt: 'asc' },
      take: videoCount - MAX_VIDEOS_PER_CHANNEL + 1
    })
    await Promise.all(oldest.map(v => prisma.video.delete({ where: { id: v.id } })))
  }

  const video = await prisma.video.create({ data: {
    youtubeId: data.youtubeId,
    channelId: data.channelId,
    title: data.title,
    description: data.description,
    thumbnail: data.thumbnail,
    duration: data.duration,
    viewCount: data.viewCount,
    publishedAt: data.publishedAt
  }})
  return video.id
}

async function stepGetTranscript(youtubeId: string): Promise<string> {
  'use step'

  try {
    const transcriptData = await getTranscript(youtubeId)
    return transcriptData.map(t => t.text).join(' ').slice(0, 20000)
  } catch {
    return ''
  }
}

async function stepGenerateBlog(data: {
  videoId: string
  youtubeId: string
  title: string
  description: string
  thumbnail: string
  channelId: string
  channelName: string
  transcript: string
}): Promise<'generated' | 'skipped'> {
  'use step'

  const prisma = getPrisma()
  const minimaxService = new MiniMaxService()

  // Check if blog already exists
  const existing = await prisma.blogPost.findFirst({ where: { videoId: data.videoId } })
  if (existing) return 'skipped'

  if (!data.transcript) return 'skipped'

  const youtubeUrl = `https://www.youtube.com/watch?v=${data.youtubeId}`

  try {
    const blogContent = await minimaxService.generateBlogPost(
      data.title,
      data.description,
      data.transcript,
      data.channelName,
      youtubeUrl,
      data.thumbnail
    )

    let finalExcerpt = truncate(cleanExcerpt(data.description || data.title), 160)
    let finalContent = blogContent
    const summaryMatch = blogContent.match(/\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\]/)
    if (summaryMatch?.[1]) {
      finalExcerpt = summaryMatch[1].trim()
      finalContent = blogContent.replace(/\[SUMMARY_START\][\s\S]*?\[SUMMARY_END\]/, '').trim()
    }

    await prisma.blogPost.create({
      data: {
        title: data.title,
        slug: uniqueSlug(data.title),
        content: finalContent,
        excerpt: finalExcerpt,
        coverImage: data.thumbnail,
        status: 'published',
        videoId: data.videoId,
        sourceUrl: youtubeUrl,
        publishedAt: new Date()
      }
    })
    return 'generated'
  } catch (e) {
    console.error('[Workflow] Blog generation error:', e)
    return 'skipped'
  }
}

async function stepUpdateVideoWithTranscript(videoId: string, transcript: string): Promise<void> {
  'use step'

  const prisma = getPrisma()
  await prisma.video.update({
    where: { id: videoId },
    data: { hasTranscript: true, transcript }
  })
}

// ============================================================================
// WORKFLOW - Orchestration using "use workflow"
// ============================================================================

export async function syncQueueWorkflow(): Promise<{
  processed: number
  newVideos: number
  blogsGenerated: number
  errors: string[]
}> {
  'use workflow'

  // Import sleep and globalThis.fetch for HTTP calls in workflow context
  const { sleep } = await import('workflow')
  globalThis.fetch = fetch

  const results = {
    processed: 0,
    newVideos: 0,
    blogsGenerated: 0,
    errors: [] as string[]
  }

  // Process up to 10 queue items per workflow run
  for (let i = 0; i < 10; i++) {
    // Get next pending item
    const queueItem = await stepGetPendingQueueItem()
    if (!queueItem) {
      console.log('[Workflow] No more pending items')
      break
    }

    console.log(`[Workflow] Processing: ${queueItem.channelName}`)

    // Mark as processing
    await stepUpdateQueueStatus(queueItem.id, 'processing', new Date().toISOString())

    // Get channel info
    const channel = await stepGetChannel(queueItem.channelId)
    if (!channel) {
      await stepUpdateQueueStatus(queueItem.id, 'failed', undefined, new Date().toISOString(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'Channel not found')
      results.errors.push(`Channel not found: ${queueItem.channelId}`)
      continue
    }

    // Fetch videos from YouTube
    let videos: Array<{
      youtubeId: string
      title: string
      description: string
      thumbnail: string
      duration: number
      viewCount: number
      publishedAt: string
    }>

    try {
      videos = await stepFetchChannelVideos(channel.youtubeId)
    } catch (e) {
      console.error('[Workflow] Error fetching videos:', e)
      await stepUpdateQueueStatus(queueItem.id, 'failed', undefined, new Date().toISOString(), undefined, undefined, undefined, undefined, undefined, undefined, undefined, String(e))
      results.errors.push(`Failed to fetch videos for ${channel.name}: ${e}`)
      continue
    }

    let itemNewVideos = 0
    let itemBlogs = 0
    const itemErrors: string[] = []

    // Process each video
    for (const video of videos) {
      if (itemNewVideos >= MAX_NEW_VIDEOS) break

      try {
        // Check if video already exists
        const exists = await stepCheckVideoExists(video.youtubeId)
        if (exists) continue

        // Create video record
        const videoId = await stepCreateVideo({
          youtubeId: video.youtubeId,
          channelId: channel.id,
          title: video.title,
          description: video.description,
          thumbnail: video.thumbnail,
          duration: video.duration,
          viewCount: video.viewCount,
          publishedAt: new Date(video.publishedAt)
        })

        itemNewVideos++
        results.newVideos++

        // Update progress
        await stepUpdateQueueStatus(
          queueItem.id,
          'processing',
          undefined, // keep startedAt
          undefined, // clear completedAt
          itemNewVideos,
          MAX_NEW_VIDEOS,
          video.title
        )

        // Get transcript
        const transcript = await stepGetTranscript(video.youtubeId)
        if (transcript) {
          await stepUpdateVideoWithTranscript(videoId, transcript)
        }

        // Generate blog
        const blogResult = await stepGenerateBlog({
          videoId,
          youtubeId: video.youtubeId,
          title: video.title,
          description: video.description,
          thumbnail: video.thumbnail,
          channelId: channel.id,
          channelName: channel.name,
          transcript
        })

        if (blogResult === 'generated') {
          itemBlogs++
          results.blogsGenerated++
        }

        // Sleep between videos to avoid rate limiting (3 seconds)
        await sleep('3s')

      } catch (e) {
        console.error(`[Workflow] Error processing video ${video.title}:`, e)
        itemErrors.push(`${video.title}: ${e}`)
      }
    }

    // Mark as completed
    await stepUpdateQueueStatus(
      queueItem.id,
      'completed',
      undefined,
      new Date().toISOString(),
      itemNewVideos,
      MAX_NEW_VIDEOS,
      undefined,
      itemNewVideos,
      itemBlogs,
      0,
      itemErrors
    )

    results.processed++
    console.log(`[Workflow] Completed: ${channel.name} — ${itemBlogs} blogs`)

    // Sleep between channels
    await sleep('1s')
  }

  return results
}
