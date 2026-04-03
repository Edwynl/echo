// Cron job for automatic video fetching and blog generation
// This endpoint should be called by an external cron service (e.g., Vercel Cron)

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { YouTubeService } from '@/services/youtube'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { uniqueSlug } from '@/lib/utils'

const youtubeService = new YouTubeService()
const minimaxService = new MiniMaxService()

// POST /api/cron/sync - Run sync job
export async function POST(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const results = {
      channelsProcessed: 0,
      newVideos: 0,
      blogsGenerated: 0,
      errors: [] as string[]
    }

    // Step 1: Fetch new videos from all active channels
    const channels = await prisma.channel.findMany({
      where: { isActive: true }
    })

    for (const channel of channels) {
      try {
        const { videos } = await youtubeService.getChannelVideos(
          channel.youtubeId,
          5
        )

        for (const video of videos) {
          // Check if video already exists
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

    // Step 2: Generate blogs for new videos (limit to avoid rate limiting)
    const recentVideos = await prisma.video.findMany({
      where: {
        hasTranscript: false,
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      take: 3,
      orderBy: { publishedAt: 'desc' }
    })

    for (const video of recentVideos) {
      try {
        // Check if blog already exists
        const existingBlog = await prisma.blogPost.findFirst({
          where: { videoId: video.id }
        })

        if (existingBlog) continue

        // Get channel info
        const channel = await prisma.channel.findUnique({
          where: { id: video.channelId }
        })

        if (!channel) continue

        // Get transcript
        let transcript = video.transcript || ''

        if (!transcript) {
          try {
            const transcriptData = await getTranscript(video.youtubeId)
            transcript = transcriptData.map(t => t.text).join(' ')
            transcript = transcript.slice(0, 20000)

            await prisma.video.update({
              where: { id: video.id },
              data: { hasTranscript: true, transcript }
            })
          } catch (e) {
            console.error('Error getting transcript:', e)
            continue
          }
        }

        if (!transcript) continue

        // Generate blog
        const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`

        const blogContent = await minimaxService.generateBlogPost(
          video.title,
          video.description || '',
          transcript,
          channel.name,
          youtubeUrl,
          video.thumbnail || ''
        )

        const slug = uniqueSlug(video.title)

        await prisma.blogPost.create({
          data: {
            title: video.title,
            slug,
            content: blogContent,
            excerpt: video.description?.slice(0, 150) || video.title,
            coverImage: video.thumbnail,
            status: 'published',
            videoId: video.id,
            sourceUrl: youtubeUrl,
            publishedAt: new Date()
          }
        })

        results.blogsGenerated++

        // Wait a bit to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000))
      } catch (error) {
        console.error(`Error generating blog for video ${video.id}:`, error)
        results.errors.push(`Blog ${video.id}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      message: `Processed ${results.channelsProcessed} channels, ${results.newVideos} new videos, ${results.blogsGenerated} blogs generated`
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
