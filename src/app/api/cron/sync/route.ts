// Cron job for automatic video fetching and blog generation
// Processes both channel sync queue AND generates blogs for new videos
// This endpoint is called by Vercel Cron daily at 6:00 AM UTC

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { YouTubeService } from '@/services/youtube'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { uniqueSlug, cleanExcerpt, truncate } from '@/lib/utils'
import { dbGetPendingItem, dbUpdateQueueItem } from '@/lib/queue-processor'

const youtubeService = new YouTubeService()
const minimaxService = new MiniMaxService()

const VIDEOS_TO_CHECK = 50
const MAX_VIDEOS_PER_CHANNEL = 50
const MAX_NEW_VIDEOS = 5

// POST /api/cron/sync - Run sync job
export async function POST(request: NextRequest) {
  // Verify cron secret (recommended for security)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = {
      queueItemsProcessed: 0,
      channelsProcessed: 0,
      newVideos: 0,
      blogsGenerated: 0,
      errors: [] as string[]
    }

    // Step 1: Process pending queue items (channel sync requests)
    await processQueueItems(results)

    // Step 2: Fetch new videos from all active channels (if not already done via queue)
    const channels = await prisma.channel.findMany({
      where: { isActive: true }
    })

    for (const channel of channels) {
      try {
        const { videos } = await youtubeService.getChannelVideos(
          channel.youtubeId,
          VIDEOS_TO_CHECK
        )

        for (const video of videos) {
          // Limit new videos to avoid rate limiting
          if (results.newVideos >= MAX_NEW_VIDEOS) break

          const existingVideo = await prisma.video.findUnique({
            where: { youtubeId: video.youtubeId }
          })

          if (!existingVideo) {
            await prisma.video.create({
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
            results.newVideos++
          }
        }

        await prisma.channel.update({
          where: { id: channel.id },
          data: { lastFetched: new Date() }
        })

        results.channelsProcessed++
      } catch (error) {
        console.error(`Error processing channel ${channel.name}:`, error)
        results.errors.push(`Channel ${channel.name}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    // Step 3: Generate blogs for recent videos without blog posts
    await generateMissingBlogs(results)

    return NextResponse.json({
      success: true,
      ...results,
      message: `Queue: ${results.queueItemsProcessed} items | Channels: ${results.channelsProcessed} | New videos: ${results.newVideos} | Blogs: ${results.blogsGenerated}`
    })
  } catch (error) {
    console.error('Error in cron job:', error)
    return NextResponse.json(
      { error: 'Cron job failed' },
      { status: 500 }
    )
  }
}

// Also allow GET for simple testing
export async function GET(request: NextRequest) {
  return POST(request)
}

// Process pending queue items
async function processQueueItems(results: {
  queueItemsProcessed: number
  newVideos: number
  blogsGenerated: number
  errors: string[]
}): Promise<void> {
  let pendingItem = await dbGetPendingItem()

  while (pendingItem) {
    try {
      console.log(`[Cron] Processing queue item: ${pendingItem.channelName}`)

      await dbUpdateQueueItem(pendingItem.id, {
        status: 'processing',
        startedAt: new Date().toISOString(),
      })

      const channel = await prisma.channel.findUnique({
        where: { id: pendingItem.channelId }
      })

      if (!channel) {
        await dbUpdateQueueItem(pendingItem.id, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: 'Channel not found'
        })
        pendingItem = await dbGetPendingItem()
        continue
      }

      const { videos } = await youtubeService.getChannelVideos(channel.youtubeId, VIDEOS_TO_CHECK)
      const sortedVideos = videos.sort(
        (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
      )

      let newVideosCount = 0
      let blogsCount = 0

      for (const video of sortedVideos) {
        if (newVideosCount >= MAX_NEW_VIDEOS) break

        try {
          const existingVideo = await prisma.video.findUnique({
            where: { youtubeId: video.youtubeId }
          })

          if (existingVideo) continue

          // Enforce max videos per channel
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

          await dbUpdateQueueItem(pendingItem.id, {
            progress: {
              current: newVideosCount,
              total: MAX_NEW_VIDEOS,
              currentVideoTitle: video.title
            }
          })

          // Try to generate blog
          const blogResult = await generateBlogForVideo(newVideo, channel.name)
          if (blogResult === 'generated') blogsCount++
          else if (blogResult === 'skipped') { /* no transcript */ }

          await new Promise(resolve => setTimeout(resolve, 3000))
        } catch (e) {
          console.error(`[Cron] Error processing video ${video.title}:`, e)
        }
      }

      await dbUpdateQueueItem(pendingItem.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        result: {
          newVideos: newVideosCount,
          blogsGenerated: blogsCount,
          skipped: 0,
          errors: []
        }
      })

      results.queueItemsProcessed++
      results.newVideos += newVideosCount
      results.blogsGenerated += blogsCount

      console.log(`[Cron] Completed: ${pendingItem.channelName} — ${blogsCount} blogs generated`)
    } catch (error) {
      console.error(`[Cron] Failed queue item ${pendingItem.id}:`, error)
      await dbUpdateQueueItem(pendingItem.id, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      results.errors.push(error instanceof Error ? error.message : 'Unknown error')
    }

    pendingItem = await dbGetPendingItem()
  }
}

// Generate blog for a single video
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
    console.error('[Cron] Error getting transcript:', e)
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
    console.error('[Cron] Error generating blog:', e)
    return 'skipped'
  }
}

// Generate blogs for videos that don't have one
async function generateMissingBlogs(results: {
  blogsGenerated: number
  errors: string[]
}): Promise<void> {
  const recentVideos = await prisma.video.findMany({
    where: {
      hasTranscript: false,
      publishedAt: {
        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      }
    },
    take: 3,
    orderBy: { publishedAt: 'desc' }
  })

  for (const video of recentVideos) {
    try {
      const existingBlog = await prisma.blogPost.findFirst({
        where: { videoId: video.id }
      })

      if (existingBlog) continue

      const channel = await prisma.channel.findUnique({
        where: { id: video.channelId }
      })

      if (!channel) continue

      const result = await generateBlogForVideo(video, channel.name)
      if (result === 'generated') results.blogsGenerated++

      await new Promise(resolve => setTimeout(resolve, 2000))
    } catch (error) {
      console.error(`[Cron] Error generating blog for video ${video.id}:`, error)
      results.errors.push(`Blog ${video.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
}
