import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { YouTubeService } from '@/services/youtube'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { cleanExcerpt, decodeHtmlEntities, processBlogContent, truncate, uniqueSlug } from '@/lib/utils'

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
      decodeHtmlEntities(video.title),
      decodeHtmlEntities(video.description || ''),
      transcript,
      channelName,
      youtubeUrl,
      video.thumbnail || ''
    )

    // Process content (extract summary and clean marks)
    const { content: finalContent, excerpt: finalExcerptFromContent } = processBlogContent(blogContent)
    
    // Use extracted excerpt or fallback to description
    const finalExcerpt = finalExcerptFromContent || truncate(cleanExcerpt(decodeHtmlEntities(video.description || video.title)), 160)

    const baseSlug = uniqueSlug(video.title)

    const existingBlog = await prisma.blogPost.findFirst({
      where: { videoId: video.id }
    })

    if (existingBlog) {
      await prisma.blogPost.update({
        where: { id: existingBlog.id },
        data: {
          title: video.title,
          content: finalContent,
          excerpt: finalExcerpt,
          coverImage: video.thumbnail,
          status: 'published'
        }
      })
    } else {
      await prisma.blogPost.create({
        data: {
          title: video.title,
          slug: `${baseSlug}-${Date.now()}`,
          content: finalContent,
          excerpt: finalExcerpt,
          coverImage: video.thumbnail,
          status: 'published',
          videoId: video.id,
          sourceUrl: youtubeUrl,
          publishedAt: new Date()
        }
      })
    }

    return { status: 'generated', title: video.title }
  } catch (e) {
    console.error('Error generating blog:', e)
    return { status: 'error', reason: String(e) }
  }
}

// POST /api/videos/fetch - Fetch videos from all active channels and generate blogs
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const generateBlogs = searchParams.get('generate') !== 'false'

    // Get all active channels
    const channels = await prisma.channel.findMany({
      where: { isActive: true }
    })

    if (channels.length === 0) {
      return NextResponse.json(
        { error: 'No active channels to fetch' },
        { status: 400 }
      )
    }

    const MAX_NEW_VIDEOS = 5
    const VIDEOS_TO_CHECK = 50 // Check up to 50 recent videos
    const MAX_VIDEOS_PER_CHANNEL = 50 // Keep only latest 50 videos per channel
    const results = {
      channelsProcessed: 0,
      newVideos: 0,
      blogsGenerated: 0,
      blogs: [] as { title: string; status: string }[]
    }

    let totalNewVideosFound = 0

    for (const channel of channels) {
      if (totalNewVideosFound >= MAX_NEW_VIDEOS) break

      try {
        // Fetch latest videos from channel
        const { videos } = await youtubeService.getChannelVideos(
          channel.youtubeId,
          VIDEOS_TO_CHECK
        )

        for (const video of videos) {
          if (totalNewVideosFound >= MAX_NEW_VIDEOS) break

          // Check if video already exists
          const existingVideo = await prisma.video.findUnique({
            where: { youtubeId: video.youtubeId }
          })

          if (!existingVideo) {
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

            totalNewVideosFound++

            // Create new video
            const newVideo = await prisma.video.create({
              data: {
                youtubeId: video.youtubeId,
                channelId: channel.id,
                title: decodeHtmlEntities(video.title),
                description: decodeHtmlEntities(video.description),
                thumbnail: video.thumbnail,
                duration: video.duration || 0,
                viewCount: video.viewCount || 0,
                publishedAt: new Date(video.publishedAt)
              }
            })

            results.newVideos++

            // Generate blog if requested
            if (generateBlogs) {
              const blogResult = await generateBlogForVideo(newVideo, channel.name)
              results.blogs.push({
                title: video.title,
                status: blogResult.status
              })
              if (blogResult.status === 'generated') {
                results.blogsGenerated++
              }

              // Wait to avoid rate limiting
              await new Promise(resolve => setTimeout(resolve, 2000))
            }
          }
        }

        // Update channel last fetched time
        await prisma.channel.update({
          where: { id: channel.id },
          data: { lastFetched: new Date() }
        })

        results.channelsProcessed++
      } catch (error) {
        console.error(`Error fetching videos from channel ${channel.name}:`, error)
      }
    }

    return NextResponse.json({
      success: true,
      ...results,
      message: `Processed ${results.channelsProcessed} channels, ${results.newVideos} new videos, ${results.blogsGenerated} blogs generated`
    })
  } catch (error) {
    console.error('Error fetching videos:', error)
    return NextResponse.json(
      { error: 'Failed to fetch videos' },
      { status: 500 }
    )
  }
}

// GET /api/videos/fetch?channelId=xxx - Fetch videos from a specific channel
export async function GET(request: NextRequest) {
  return POST(request)
}
