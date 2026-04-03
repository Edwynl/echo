import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { YouTubeService } from '@/services/youtube'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { cleanExcerpt, truncate, uniqueSlug } from '@/lib/utils'

const youtubeService = new YouTubeService()
const minimaxService = new MiniMaxService()

// Helper function to generate blog for a video
async function generateBlogForVideo(video: {
  id: string
  youtubeId: string
  title: string
  description: string | null
  thumbnail: string | null
  channelId: string
}, channelName: string) {
  // Check if blog already exists
  const existingBlog = await prisma.blogPost.findFirst({
    where: { videoId: video.id }
  })

  if (existingBlog) {
    return { status: 'skipped', reason: 'already_exists' }
  }

  // Get transcript
  let transcript = ''
  try {
    const transcriptData = await getTranscript(video.youtubeId)
    transcript = transcriptData.map(t => t.text).join(' ')
    transcript = transcript.slice(0, 20000)

    // Save transcript
    await prisma.video.update({
      where: { id: video.id },
      data: { hasTranscript: true, transcript }
    })
  } catch (e) {
    console.error('Error getting transcript:', e)
    transcript = video.description || ''
  }

  if (!transcript) {
    return { status: 'skipped', reason: 'no_transcript' }
  }

  // Generate blog
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

    // Extract summary if present
    let finalExcerpt = truncate(cleanExcerpt(video.description || video.title), 160)
    let finalContent = blogContent

    const summaryMatch = blogContent.match(/\[SUMMARY_START\]([\s\S]*?)\[SUMMARY_END\]/)
    if (summaryMatch && summaryMatch[1]) {
      finalExcerpt = summaryMatch[1].trim()
      // Remove summary block from final content
      finalContent = blogContent.replace(/\[SUMMARY_START\][\s\S]*?\[SUMMARY_END\]/, '').trim()
    }

    const slug = uniqueSlug(video.title)

    await prisma.blogPost.create({
      data: {
        title: video.title,
        slug,
        content: finalContent,
        excerpt: finalExcerpt,
        coverImage: video.thumbnail,
        status: 'published',
        videoId: video.id,
        sourceUrl: youtubeUrl,
        publishedAt: new Date()
      }
    })

    return { status: 'generated', title: video.title }
  } catch (e) {
    console.error('Error generating blog:', e)
    return { status: 'error', reason: String(e) }
  }
}

// POST /api/channels/sync - Sync videos from a specific channel
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')
    const generateBlog = searchParams.get('generate') !== 'false'

    if (!channelId) {
      return NextResponse.json(
        { error: 'Channel ID is required' },
        { status: 400 }
      )
    }

    // Get channel
    const channel = await prisma.channel.findUnique({
      where: { id: channelId }
    })

    if (!channel) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      )
    }

    const MAX_NEW_VIDEOS = 5
    const VIDEOS_TO_CHECK = 50
    const MAX_VIDEOS_PER_CHANNEL = 50
    const results = {
      newVideos: 0,
      blogsGenerated: 0,
      skipped: 0,
      errors: [] as string[]
    }

    try {
      // Fetch latest videos from channel
      const { videos } = await youtubeService.getChannelVideos(
        channel.youtubeId,
        VIDEOS_TO_CHECK
      )

      for (const video of videos) {
        if (results.newVideos >= MAX_NEW_VIDEOS) break

        try {
          // Check if video already exists
          const existingVideo = await prisma.video.findUnique({
            where: { youtubeId: video.youtubeId }
          })

          if (existingVideo) {
            results.skipped++
            continue
          }

          // Check current video count for this channel
          const videoCount = await prisma.video.count({
            where: { channelId: channel.id }
          })

          // If at limit, delete oldest videos
          if (videoCount >= MAX_VIDEOS_PER_CHANNEL) {
            const oldestVideos = await prisma.video.findMany({
              where: { channelId: channel.id },
              orderBy: { publishedAt: 'asc' },
              take: videoCount - MAX_VIDEOS_PER_CHANNEL + 1
            })

            for (const oldVideo of oldestVideos) {
              await prisma.video.delete({ where: { id: oldVideo.id } })
            }
          }

          // Create new video
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

          results.newVideos++

          // Generate blog if requested
          if (generateBlog) {
            const blogResult = await generateBlogForVideo(newVideo, channel.name)
            if (blogResult.status === 'generated') {
              results.blogsGenerated++
            }

            // Wait to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        } catch (error) {
          console.error(`Error processing video ${video.title}:`, error)
          results.errors.push(`Error processing video: ${video.title}`)
        }
      }

      // Update channel last fetched time
      await prisma.channel.update({
        where: { id: channel.id },
        data: { lastFetched: new Date() }
      })

      return NextResponse.json({
        success: true,
        channelName: channel.name,
        ...results,
        message: `Synced ${results.newVideos} new videos, ${results.blogsGenerated} blogs generated`
      })
    } catch (error) {
      console.error(`Error fetching videos from channel ${channel.name}:`, error)
      return NextResponse.json(
        { error: 'Failed to fetch videos from YouTube' },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Error syncing channel:', error)
    return NextResponse.json(
      { error: 'Failed to sync channel' },
      { status: 500 }
    )
  }
}
