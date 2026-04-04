/**
 * Queue Workflow Start API
 * POST - Start the sync queue workflow (Vercel only)
 *
 * Falls back to direct processing in local development
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST() {
  // Check if we're running on Vercel (workflows available)
  const isVercel = !!process.env.VERCEL || !!process.env.AWS_REGION

  if (isVercel) {
    // Vercel production/preview - use durable workflow
    try {
      const { start } = await import('workflow')
      const { syncQueueWorkflow } = await import('@/workflows/sync-queue')

      console.log('[Workflow API] Starting sync queue workflow on Vercel')
      const run = await start(syncQueueWorkflow, [])

      console.log('[Workflow API] Workflow started:', run.runId)

      return NextResponse.json({
        success: true,
        runId: run.runId,
        message: 'Sync queue workflow started',
        environment: 'vercel'
      })
    } catch (error) {
      console.error('[Workflow API] Error starting workflow:', error)
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }, { status: 500 })
    }
  } else {
    // Local development - use direct processing
    console.log('[Workflow API] Local dev mode - using direct processing')

    const { dbGetPendingItem, dbUpdateQueueItem, queueGetStatus } = await import('@/lib/queue-processor')
    const { prisma } = await import('@/lib/prisma')
    const { YouTubeService } = await import('@/services/youtube')
    const { MiniMaxService } = await import('@/services/minimax')
    const { getTranscript } = await import('@/lib/youtube-transcript')
    const { uniqueSlug, cleanExcerpt, truncate } = await import('@/lib/utils')

    const youtubeService = new YouTubeService()
    const minimaxService = new MiniMaxService()
    const MAX_NEW_VIDEOS = 5
    const VIDEOS_TO_CHECK = 50
    const MAX_VIDEOS_PER_CHANNEL = 50

    try {
      const queueStatus = await queueGetStatus()
      let pendingItem = await dbGetPendingItem()

      if (!pendingItem) {
        return NextResponse.json({
          success: true,
          message: 'No pending items in queue',
          environment: 'local'
        })
      }

      const results = {
        processed: 0,
        newVideos: 0,
        blogsGenerated: 0,
        errors: [] as string[]
      }

      while (pendingItem) {
        console.log(`[Workflow API] Processing: ${pendingItem.channelName}`)

        await dbUpdateQueueItem(pendingItem.id, {
          status: 'processing',
          startedAt: new Date().toISOString()
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

            await dbUpdateQueueItem(pendingItem.id, {
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
              console.error(`[Workflow API] Blog error: ${video.title}`, e)
              itemErrors.push(`${video.title}: ${e}`)
            }

            await new Promise(resolve => setTimeout(resolve, 3000))

          } catch (e) {
            console.error(`[Workflow API] Video error: ${video.title}`, e)
            itemErrors.push(`${video.title}: ${e}`)
          }
        }

        await dbUpdateQueueItem(pendingItem.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          result: {
            newVideos: itemNewVideos,
            blogsGenerated: itemBlogs,
            skipped: 0,
            errors: itemErrors
          }
        })

        results.processed++
        console.log(`[Workflow API] Completed: ${channel.name}`)

        pendingItem = await dbGetPendingItem()
      }

      return NextResponse.json({
        success: true,
        ...results,
        environment: 'local'
      })

    } catch (error) {
      console.error('[Workflow API] Fatal error:', error)
      return NextResponse.json({
        success: false,
        error: error instanceof Error ? error.message : String(error)
      }, { status: 500 })
    }
  }
}
