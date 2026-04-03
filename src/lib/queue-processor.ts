/**
 * Queue Processor
 * Background processor that handles channel sync queue.
 * Queue state is PERSISTED to the database so it survives server restarts.
 * An in-memory mirror (SyncQueueDb) provides fast reads during request handling.
 */

import { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { YouTubeService } from '@/services/youtube'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from './youtube-transcript'
import { cleanExcerpt, truncate, uniqueSlug } from './utils'
import type { QueueItem, QueueStatus } from './queue-types'

const youtubeService = new YouTubeService()
const minimaxService = new MiniMaxService()

const MAX_NEW_VIDEOS = 5
const VIDEOS_TO_CHECK = 50
const MAX_VIDEOS_PER_CHANNEL = 50
const PROCESS_INTERVAL = 5000 // Check queue every 5 seconds

let processorInterval: NodeJS.Timeout | null = null

// ---------------------------------------------------------------------------
// Database operations (raw SQL — works without re-generating Prisma client)
// ---------------------------------------------------------------------------

function rowToQueueItem(row: Record<string, unknown>): QueueItem {
  return {
    id: row.id as string,
    channelId: row.channelId as string,
    channelName: row.channelName as string,
    channelThumbnail: (row.channelThumbnail as string) || '',
    status: row.status as QueueItem['status'],
    addedAt: (row.addedAt as Date).toISOString(),
    startedAt: row.startedAt ? (row.startedAt as Date).toISOString() : undefined,
    completedAt: row.completedAt ? (row.completedAt as Date).toISOString() : undefined,
    progress: {
      current: row.progressCurrent as number,
      total: row.progressTotal as number,
      currentVideoTitle: (row.currentVideoTitle as string) || undefined,
    },
    result: row.resultNewVideos != null
      ? {
          newVideos: row.resultNewVideos as number,
          blogsGenerated: row.resultBlogsGenerated as number,
          skipped: row.resultSkipped as number,
          errors: row.resultErrors ? JSON.parse(row.resultErrors as string) : [],
        }
      : undefined,
    error: (row.error as string) || undefined,
  }
}

async function dbGetAllQueueItems(): Promise<QueueItem[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM SyncQueue
    ORDER BY
      CASE status
        WHEN 'processing' THEN 0
        WHEN 'pending'     THEN 1
        WHEN 'failed'      THEN 2
        WHEN 'completed'   THEN 3
      END,
      addedAt ASC
  `
  return rows.map(rowToQueueItem)
}

async function dbGetQueueItem(id: string): Promise<QueueItem | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM SyncQueue WHERE id = ${id}
  `
  return rows[0] ? rowToQueueItem(rows[0]) : null
}

async function dbGetPendingItem(): Promise<QueueItem | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM SyncQueue WHERE status = 'pending' ORDER BY addedAt ASC LIMIT 1
  `
  return rows[0] ? rowToQueueItem(rows[0]) : null
}

async function dbInsertQueueItem(item: QueueItem): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO SyncQueue (id, channelId, channelName, channelThumbnail, status, addedAt, progressCurrent, progressTotal)
    VALUES (
      ${item.id},
      ${item.channelId},
      ${item.channelName},
      ${item.channelThumbnail},
      ${item.status},
      ${new Date(item.addedAt)},
      ${item.progress.current},
      ${item.progress.total}
    )
  `
}

async function dbUpdateQueueItem(
  id: string,
  updates: Partial<QueueItem>
): Promise<void> {
  const sets: string[] = []
  const values: unknown[] = []

  if (updates.status !== undefined) {
    sets.push('status = ?')
    values.push(updates.status)
  }
  if (updates.startedAt !== undefined) {
    sets.push('startedAt = ?')
    values.push(new Date(updates.startedAt))
  }
  if (updates.completedAt !== undefined) {
    sets.push('completedAt = ?')
    values.push(new Date(updates.completedAt))
  }
  if (updates.progress !== undefined) {
    sets.push('progressCurrent = ?', 'progressTotal = ?', 'currentVideoTitle = ?')
    values.push(updates.progress.current, updates.progress.total, updates.progress.currentVideoTitle || null)
  }
  if (updates.result !== undefined) {
    sets.push('resultNewVideos = ?', 'resultBlogsGenerated = ?', 'resultSkipped = ?', 'resultErrors = ?')
    values.push(
      updates.result.newVideos,
      updates.result.blogsGenerated,
      updates.result.skipped,
      JSON.stringify(updates.result.errors)
    )
  }
  if (updates.error !== undefined) {
    sets.push('error = ?')
    values.push(updates.error)
  }

  if (sets.length === 0) return

  values.push(id)
  await prisma.$executeRawUnsafe(
    `UPDATE SyncQueue SET ${sets.join(', ')} WHERE id = ?`,
    ...values
  )
}

async function dbDeleteQueueItem(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM SyncQueue WHERE id = ${id}`
}

async function dbClearCompleted(): Promise<void> {
  await prisma.$executeRaw`DELETE FROM SyncQueue WHERE status = 'completed'`
}

async function dbIsChannelInQueue(channelId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT id FROM SyncQueue WHERE channelId = ${channelId} AND status != 'completed' LIMIT 1
  `
  return rows.length > 0
}

async function dbGetQueueStatus(): Promise<QueueStatus> {
  const all = await dbGetAllQueueItems()
  const pending = all.filter(i => i.status === 'pending')
  const failed = all.filter(i => i.status === 'failed')
  const processing = all.find(i => i.status === 'processing') || null

  let estimatedTimeRemaining: number | undefined
  if (processing) {
    const elapsed = Date.now() - new Date(processing.startedAt!).getTime()
    const avgPerVideo = elapsed / Math.max(processing.progress.current, 1)
    const remaining = (processing.progress.total - processing.progress.current) * avgPerVideo
    estimatedTimeRemaining = Math.ceil(remaining / 60000)
  } else if (pending.length > 0) {
    estimatedTimeRemaining = pending.length * 3
  }

  return {
    isProcessing: processing !== null,
    currentItem: processing,
    queue: all,
    stats: {
      totalProcessed: all.filter(i => i.status === 'completed').length,
      totalPending: pending.length,
      totalFailed: failed.length,
    },
    estimatedTimeRemaining,
  }
}

// ---------------------------------------------------------------------------
// Queue Processor
// ---------------------------------------------------------------------------

/**
 * Start the queue processor (idempotent).
 * Wakes up any items still in 'processing' state from a crashed server
 * and resumes them.
 */
export function startQueueProcessor(): void {
  if (processorInterval) return

  // Recover any stale 'processing' items from a previous crash
  recoverStaleItems()

  console.log('[Queue] Starting queue processor')
  processorInterval = setInterval(processQueue, PROCESS_INTERVAL)
  processQueue()
}

async function recoverStaleItems(): Promise<void> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT * FROM SyncQueue WHERE status = 'processing'
  `
  for (const row of rows) {
    await prisma.$executeRaw`
      UPDATE SyncQueue SET status = 'pending', startedAt = NULL
      WHERE id = ${row.id as string}
    `
    console.log(`[Queue] Recovered stale item: ${row.channelName}`)
  }
}

export function stopQueueProcessor(): void {
  if (processorInterval) {
    clearInterval(processorInterval)
    processorInterval = null
    console.log('[Queue] Stopped queue processor')
  }
}

async function processQueue(): Promise<void> {
  const pending = await dbGetPendingItem()
  if (!pending) return

  const processing = await dbGetPendingItem()
  if (!processing) return

  // Re-check: is another processor already handling this?
  const current = await dbGetQueueItem(processing.id)
  if (!current || current.status !== 'pending') return

  console.log(`[Queue] Processing: ${processing.channelName}`)

  await dbUpdateQueueItem(processing.id, {
    status: 'processing',
    startedAt: new Date().toISOString(),
  })

  try {
    const result = await syncChannel(processing)

    await dbUpdateQueueItem(processing.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: {
        newVideos: result.newVideos,
        blogsGenerated: result.blogsGenerated,
        skipped: result.skipped,
        errors: result.errors,
      },
    })

    console.log(`[Queue] Completed: ${processing.channelName} — ${result.blogsGenerated} blogs generated`)
  } catch (error) {
    console.error(`[Queue] Failed: ${processing.channelName}`, error)

    await dbUpdateQueueItem(processing.id, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

async function syncChannel(queueItem: QueueItem): Promise<{
  newVideos: number
  blogsGenerated: number
  skipped: number
  errors: string[]
}> {
  const results = { newVideos: 0, blogsGenerated: 0, skipped: 0, errors: [] as string[] }

  const channel = await prisma.channel.findUnique({ where: { id: queueItem.channelId } })
  if (!channel) throw new Error('Channel not found')

  const { videos } = await youtubeService.getChannelVideos(channel.youtubeId, VIDEOS_TO_CHECK)
  const sortedVideos = videos.sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  )

  for (const video of sortedVideos) {
    if (results.newVideos >= MAX_NEW_VIDEOS) break

    try {
      const existingVideo = await prisma.video.findUnique({ where: { youtubeId: video.youtubeId } })
      if (existingVideo) { results.skipped++; continue }

      const videoCount = await prisma.video.count({ where: { channelId: channel.id } })
      if (videoCount >= MAX_VIDEOS_PER_CHANNEL) {
        const oldest = await prisma.video.findMany({
          where: { channelId: channel.id },
          orderBy: { publishedAt: 'asc' },
          take: videoCount - MAX_VIDEOS_PER_CHANNEL + 1,
        })
        await Promise.all(oldest.map(v => prisma.video.delete({ where: { id: v.id } })))
      }

      const newVideo = await prisma.video.create({
        data: {
          youtubeId: video.youtubeId,
          channelId: channel.id,
          title: video.title,
          description: video.description,
          thumbnail: video.thumbnail,
          duration: video.duration || 0,
          viewCount: video.viewCount || 0,
          publishedAt: new Date(video.publishedAt),
        },
      })

      results.newVideos++

      await dbUpdateQueueItem(queueItem.id, {
        progress: { current: results.newVideos, total: MAX_NEW_VIDEOS, currentVideoTitle: video.title },
      })

      const blogResult = await generateBlogForVideo(newVideo, channel.name)
      if (blogResult.status === 'generated') results.blogsGenerated++
      else if (blogResult.error) results.errors.push(`${video.title}: ${blogResult.error}`)

      await new Promise(resolve => setTimeout(resolve, 3000))
    } catch (error) {
      console.error(`[Queue] Error processing video ${video.title}:`, error)
      results.errors.push(`${video.title}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return results
}

async function generateBlogForVideo(
  video: { id: string; youtubeId: string; title: string; description: string | null; thumbnail: string | null; channelId: string },
  channelName: string
): Promise<{ status: 'generated' | 'skipped' | 'error'; error?: string }> {
  const existingBlog = await prisma.blogPost.findFirst({ where: { videoId: video.id } })
  if (existingBlog) return { status: 'skipped' }

  let transcript = ''
  try {
    const transcriptData = await getTranscript(video.youtubeId)
    transcript = transcriptData.map(t => t.text).join(' ').slice(0, 20000)
    await prisma.video.update({ where: { id: video.id }, data: { hasTranscript: true, transcript } })
  } catch (e) {
    console.error('[Queue] Error getting transcript:', e)
    transcript = video.description || ''
  }

  if (!transcript) return { status: 'skipped', error: 'No transcript available' }

  const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`

  try {
    const blogContent = await minimaxService.generateBlogPost(
      video.title, video.description || '', transcript, channelName, youtubeUrl, video.thumbnail || ''
    )

    let finalExcerpt = truncate(cleanExcerpt(video.description || video.title), 160)
    let finalContent = blogContent
    const summaryMatch = blogContent.match(/\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\]/)
    if (summaryMatch?.[1]) {
      finalExcerpt = summaryMatch[1].trim()
      finalContent = blogContent.replace(/\[SUMMARY_START\][\s\S]*?\[SUMMARY_END\]/, '').trim()
    }

    await prisma.blogPost.create({
      data: {
        title: video.title,
        slug: uniqueSlug(video.title),
        content: finalContent,
        excerpt: finalExcerpt,
        coverImage: video.thumbnail,
        status: 'published',
        videoId: video.id,
        sourceUrl: youtubeUrl,
        publishedAt: new Date(),
      },
    })

    return { status: 'generated' }
  } catch (e) {
    console.error('[Queue] Error generating blog:', e)
    return { status: 'error', error: e instanceof Error ? e.message : String(e) }
  }
}

// ---------------------------------------------------------------------------
// Public API helpers (used by API routes)
// ---------------------------------------------------------------------------

export async function queueGetStatus(): Promise<QueueStatus> {
  return dbGetQueueStatus()
}

export async function queueAddItem(item: QueueItem): Promise<void> {
  await dbInsertQueueItem(item)
}

export async function queueRemoveItem(id: string): Promise<void> {
  await dbDeleteQueueItem(id)
}

export async function queueIsChannelInQueue(channelId: string): Promise<boolean> {
  return dbIsChannelInQueue(channelId)
}

export async function queueClearCompleted(): Promise<void> {
  await dbClearCompleted()
}
