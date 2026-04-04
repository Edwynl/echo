/**
 * Queue Add API
 * POST - Add a channel to the sync queue and auto-start processing
 * DELETE - Remove an item from the queue
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { queueAddItem, queueGetStatus, queueRemoveItem, queueIsChannelInQueue, dbGetPendingItem, dbUpdateQueueItem } from '@/lib/queue-processor'
import type { QueueItem } from '@/lib/queue-types'
import { YouTubeService } from '@/services/youtube'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { uniqueSlug, cleanExcerpt, truncate } from '@/lib/utils'

const youtubeService = new YouTubeService()
const minimaxService = new MiniMaxService()
const MAX_NEW_VIDEOS = 5
const VIDEOS_TO_CHECK = 50
const MAX_VIDEOS_PER_CHANNEL = 50

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { channelId } = await request.json()

    if (!channelId) {
      return NextResponse.json({ success: false, error: 'Channel ID is required' }, { status: 400 })
    }

    const channel = await prisma.channel.findUnique({ where: { id: channelId } })
    if (!channel) {
      return NextResponse.json({ success: false, error: 'Channel not found' }, { status: 404 })
    }

    // Check if already in queue (and not completed)
    if (await queueIsChannelInQueue(channelId)) {
      const status = await queueGetStatus()
      const existingItem = status.queue.find(item => item.channelId === channelId)

      return NextResponse.json({
        success: false,
        error: 'Channel is already in queue',
        queuePosition: existingItem ? status.queue.indexOf(existingItem) + 1 : undefined,
        status: existingItem?.status,
      }, { status: 409 })
    }

    // Build queue item
    const queueItem: QueueItem = {
      id: `queue_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      channelId,
      channelName: channel.name,
      channelThumbnail: channel.thumbnail || '',
      status: 'pending',
      addedAt: new Date().toISOString(),
      progress: { current: 0, total: 5 },
    }

    // Persist to database
    await queueAddItem(queueItem)

    const status = await queueGetStatus()
    const queuePosition = status.queue.findIndex(i => i.id === queueItem.id) + 1

    // ============================================================================
    // Auto-start processing based on environment
    // ============================================================================
    const isVercel = !!process.env.VERCEL || !!process.env.AWS_REGION

    if (isVercel) {
      // Vercel - start durable workflow
      try {
        const { start } = await import('workflow')
        const { syncQueueWorkflow } = await import('@/workflows/sync-queue')

        console.log('[Queue Add] Starting workflow on Vercel')
        const run = await start(syncQueueWorkflow, [])

        console.log('[Queue Add] Workflow started:', run.runId)

        return NextResponse.json({
          success: true,
          message: 'Channel added. Sync workflow started automatically.',
          queueId: queueItem.id,
          queuePosition,
          runId: run.runId,
          environment: 'vercel',
          note: 'Processing in background via Vercel Workflows'
        })
      } catch (error) {
        console.error('[Queue Add] Failed to start workflow:', error)
        // Queue item added but workflow failed - user can manually trigger later
        return NextResponse.json({
          success: true,
          message: 'Channel added to queue. Auto-start failed - use the Play button to process.',
          queueId: queueItem.id,
          queuePosition,
          error: error instanceof Error ? error.message : String(error),
          environment: 'vercel'
        })
      }
    } else {
      // Local development - process directly in this request
      // Start processing immediately, return response when done
      console.log('[Queue Add] Starting direct processing in local mode')

      // Process the queue item directly
      const processResult = await processQueueItem(queueItem, channel)

      return NextResponse.json({
        success: true,
        message: processResult.blogsGenerated > 0
          ? `Added and processed! Generated ${processResult.blogsGenerated} blogs.`
          : 'Added to queue. No new videos found.',
        queueId: queueItem.id,
        queuePosition,
        results: processResult,
        environment: 'local'
      })
    }

  } catch (error) {
    console.error('Error adding to queue:', error)
    return NextResponse.json({ success: false, error: 'Failed to add channel to queue' }, { status: 500 })
  }
}

// Process a queue item directly (for local development)
async function processQueueItem(
  queueItem: QueueItem,
  channel: { id: string; youtubeId: string; name: string }
): Promise<{ newVideos: number; blogsGenerated: number; errors: string[] }> {
  const results = { newVideos: 0, blogsGenerated: 0, errors: [] as string[] }

  try {
    await dbUpdateQueueItem(queueItem.id, {
      status: 'processing',
      startedAt: new Date().toISOString()
    })

    const { videos } = await youtubeService.getChannelVideos(channel.youtubeId, VIDEOS_TO_CHECK)
    const sortedVideos = videos.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )

    let itemNewVideos = 0
    let itemBlogs = 0
    const itemErrors: string[] = []

    for (const video of sortedVideos) {
      if (itemNewVideos >= MAX_NEW_VIDEOS) break

      try {
        const existingVideo = await prisma.video.findUnique({
          where: { youtubeId: video.youtubeId }
        })
        if (existingVideo) continue

        const videoCount = await prisma.video.count({
          where: { channelId: channel.id }
        })

        if (videoCount >= MAX_VIDEOS_PER_CHANNEL) {
          const oldest = await prisma.video.findMany({
            where: { channelId: channel.id },
            orderBy: { publishedAt: 'asc' },
            take: videoCount - MAX_VIDEOS_PER_CHANNEL + 1
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
            publishedAt: new Date(video.publishedAt)
          }
        })

        itemNewVideos++
        results.newVideos++

        await dbUpdateQueueItem(queueItem.id, {
          progress: {
            current: itemNewVideos,
            total: MAX_NEW_VIDEOS,
            currentVideoTitle: video.title
          }
        })

        // Get transcript
        let transcript = ''
        try {
          const transcriptData = await getTranscript(video.youtubeId)
          transcript = transcriptData.map(t => t.text).join(' ').slice(0, 20000)
          await prisma.video.update({
            where: { id: newVideo.id },
            data: { hasTranscript: true, transcript }
          })
        } catch {
          transcript = video.description || ''
        }

        if (!transcript) continue

        const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`

        try {
          const blogContent = await minimaxService.generateBlogPost(
            video.title,
            video.description || '',
            transcript,
            channel.name,
            youtubeUrl,
            video.thumbnail || ''
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
              videoId: newVideo.id,
              sourceUrl: youtubeUrl,
              publishedAt: new Date()
            }
          })

          itemBlogs++
          results.blogsGenerated++
        } catch (e) {
          console.error(`[Queue Add] Blog error: ${video.title}`, e)
          itemErrors.push(`${video.title}: ${e}`)
        }

        // Rate limit delay
        await new Promise(resolve => setTimeout(resolve, 3000))

      } catch (e) {
        console.error(`[Queue Add] Video error: ${video.title}`, e)
        itemErrors.push(`${video.title}: ${e}`)
      }
    }

    await dbUpdateQueueItem(queueItem.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: {
        newVideos: itemNewVideos,
        blogsGenerated: itemBlogs,
        skipped: 0,
        errors: itemErrors
      }
    })

    results.errors = itemErrors
    console.log(`[Queue Add] Completed: ${channel.name} — ${itemBlogs} blogs`)

  } catch (error) {
    console.error('[Queue Add] Processing error:', error)
    await dbUpdateQueueItem(queueItem.id, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error)
    })
    results.errors.push(String(error))
  }

  return results
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const queueId = searchParams.get('queueId')

    if (!queueId) {
      return NextResponse.json({ success: false, error: 'Queue ID is required' }, { status: 400 })
    }

    const status = await queueGetStatus()
    const item = status.queue.find(i => i.id === queueId)

    if (!item) {
      return NextResponse.json({ success: false, error: 'Queue item not found' }, { status: 404 })
    }

    if (item.status === 'processing') {
      return NextResponse.json({ success: false, error: 'Cannot remove item currently being processed' }, { status: 400 })
    }

    await queueRemoveItem(queueId)

    return NextResponse.json({ success: true, message: 'Removed from queue' })
  } catch (error) {
    console.error('Error removing from queue:', error)
    return NextResponse.json({ success: false, error: 'Failed to remove from queue' }, { status: 500 })
  }
}
