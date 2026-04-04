/**
 * Queue Process API
 * POST - Manually trigger queue processing (bypasses cron)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { YouTubeService } from '@/services/youtube'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { uniqueSlug, cleanExcerpt, truncate } from '@/lib/utils'
import { dbGetPendingItem, dbUpdateQueueItem, queueGetStatus } from '@/lib/queue-processor'

const youtubeService = new YouTubeService()
const minimaxService = new MiniMaxService()

const MAX_NEW_VIDEOS = 5
const VIDEOS_TO_CHECK = 50
const MAX_VIDEOS_PER_CHANNEL = 50

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  console.log('[Queue Process] Starting manual queue processing')

  try {
    const queueStatus = await queueGetStatus()
    console.log('[Queue Process] Current queue status:', JSON.stringify(queueStatus, null, 2))

    let pendingItem = await dbGetPendingItem()
    if (!pendingItem) {
      console.log('[Queue Process] No pending items')
      return NextResponse.json({
        success: true,
        message: 'No pending items in queue',
        queueStatus
      })
    }

    console.log(`[Queue Process] Processing: ${pendingItem.channelName} (${pendingItem.channelId})`)

    await dbUpdateQueueItem(pendingItem.id, {
      status: 'processing',
      startedAt: new Date().toISOString(),
    })

    const channel = await prisma.channel.findUnique({
      where: { id: pendingItem.channelId }
    })

    if (!channel) {
      console.error('[Queue Process] Channel not found:', pendingItem.channelId)
      await dbUpdateQueueItem(pendingItem.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: 'Channel not found'
      })
      return NextResponse.json({
        success: false,
        error: 'Channel not found',
        channelId: pendingItem.channelId
      }, { status: 404 })
    }

    console.log(`[Queue Process] Fetching videos for channel: ${channel.name}`)

    const { videos } = await youtubeService.getChannelVideos(channel.youtubeId, VIDEOS_TO_CHECK)
    console.log(`[Queue Process] Got ${videos.length} videos from YouTube`)

    const sortedVideos = videos.sort(
      (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
    )

    let newVideosCount = 0
    let blogsCount = 0
    const errors: string[] = []

    for (const video of sortedVideos) {
      if (newVideosCount >= MAX_NEW_VIDEOS) break

      try {
        const existingVideo = await prisma.video.findUnique({
          where: { youtubeId: video.youtubeId }
        })

        if (existingVideo) {
          console.log(`[Queue Process] Video already exists: ${video.title}`)
          continue
        }

        const videoCount = await prisma.video.count({
          where: { channelId: channel.id }
        })

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

        newVideosCount++
        console.log(`[Queue Process] Created video: ${video.title}`)

        await dbUpdateQueueItem(pendingItem.id, {
          progress: {
            current: newVideosCount,
            total: MAX_NEW_VIDEOS,
            currentVideoTitle: video.title
          }
        })

        const blogResult = await generateBlogForVideo(newVideo, channel.name)
        if (blogResult === 'generated') {
          blogsCount++
          console.log(`[Queue Process] Generated blog for: ${video.title}`)
        }

        await new Promise(resolve => setTimeout(resolve, 3000))
      } catch (e) {
        console.error(`[Queue Process] Error processing video ${video.title}:`, e)
        errors.push(`${video.title}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    await dbUpdateQueueItem(pendingItem.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      result: {
        newVideos: newVideosCount,
        blogsGenerated: blogsCount,
        skipped: 0,
        errors
      }
    })

    console.log(`[Queue Process] Completed: ${channel.name} — ${blogsCount} blogs generated`)

    return NextResponse.json({
      success: true,
      message: `Processed ${channel.name}`,
      results: {
        newVideos: newVideosCount,
        blogsGenerated: blogsCount,
        errors
      }
    })
  } catch (error) {
    console.error('[Queue Process] Fatal error:', error)
    console.error('[Queue Process] Stack:', error instanceof Error ? error.stack : '')
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 })
  }
}

async function generateBlogForVideo(
  video: { id: string; youtubeId: string; title: string; description: string | null; thumbnail: string | null; channelId: string },
  channelName: string
): Promise<'generated' | 'skipped'> {
  const existingBlog = await prisma.blogPost.findFirst({ where: { videoId: video.id } })
  if (existingBlog) return 'skipped'

  let transcript = ''
  try {
    const transcriptData = await getTranscript(video.youtubeId)
    transcript = transcriptData.map(t => t.text).join(' ').slice(0, 20000)
    await prisma.video.update({ where: { id: video.id }, data: { hasTranscript: true, transcript } })
  } catch (e) {
    console.error('[Queue Process] Error getting transcript:', e)
    transcript = video.description || ''
  }

  if (!transcript) return 'skipped'

  const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`

  try {
    const blogContent = await minimaxService.generateBlogPost(
      video.title,
      video.description || '',
      transcript,
      channelName,
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
        videoId: video.id,
        sourceUrl: youtubeUrl,
        publishedAt: new Date(),
      },
    })

    return 'generated'
  } catch (e) {
    console.error('[Queue Process] Error generating blog:', e)
    return 'skipped'
  }
}
