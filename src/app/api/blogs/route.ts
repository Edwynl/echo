import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { MiniMaxService } from '@/services/minimax'
import { getTranscript } from '@/lib/youtube-transcript'
import { processBlogContent, slugify } from '@/lib/utils'
import { createBlogSchema, blogQuerySchema, deleteBlogSchema, validateRequest, formatZodError } from '@/lib/validation'
import { checkRateLimit, getClientId, getRateLimitHeaders } from '@/lib/rate-limit'
import { blogListCache, withCache, ApiCache } from '@/lib/api-cache'

const minimaxService = new MiniMaxService()
const ENDPOINT = '/api/blogs'

// GET /api/blogs - List all blog posts
export async function GET(request: NextRequest) {
  try {
    // Rate limiting check for GET requests
    const clientId = getClientId(request)
    const rateLimitResult = checkRateLimit(ENDPOINT, clientId)
    const headers = getRateLimitHeaders(rateLimitResult)

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.', retryAfter },
        { status: 429, headers }
      )
    }

    const { searchParams } = new URL(request.url)

    // Validate query parameters
    const queryValidation = validateRequest(blogQuerySchema, {
      status: searchParams.get('status'),
      channelId: searchParams.get('channelId'),
      knowledgeSourceId: searchParams.get('knowledgeSourceId'),
      search: searchParams.get('search'),
      page: searchParams.get('page') || '1',
      limit: searchParams.get('limit') || '10',
    });

    if (!queryValidation.success) {
      return NextResponse.json(
        { error: formatZodError(queryValidation.error) },
        { status: 400, headers }
      )
    }

    const { status, channelId, knowledgeSourceId, search, page = 1, limit = 10 } = queryValidation.data

    // Get language filter from query params
    const languageFilter = searchParams.get('language')

    const where: any = {}
    if (status) where.status = status
    if (channelId) {
      where.video = {
        channelId
      }
    }
    // Filter by knowledge source (for GitHub/Web sources)
    if (knowledgeSourceId) {
      where.knowledgeSourceId = knowledgeSourceId
    }

    // Use the database field for language filtering (more efficient than memory)
    if (languageFilter === 'zh' || languageFilter === 'en') {
      where.language = languageFilter
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { content: { contains: search } },
        { tags: { some: { name: { contains: search } } } }
      ]
    }

    // Build cache key from query params (skip page=1 cache per-query for freshness)
    const cacheKey = ApiCache.makeKey('blogs', { status, channelId, knowledgeSourceId, search, page, limit, language: languageFilter })

    const result = await withCache(blogListCache, cacheKey, async () => {
      const [blogs, total] = await Promise.all([
        prisma.blogPost.findMany({
          where,
          orderBy: [
            { video: { publishedAt: 'desc' } },
            { generatedAt: 'desc' }
          ],
          skip: (page - 1) * limit,
          take: limit,
          include: {
            video: {
              include: {
                channel: true
              }
            },
            knowledgeSource: true
          }
        }),
        prisma.blogPost.count({ where })
      ])
      return {
        blogs,
        pagination: { total, page, pageSize: limit }
      }
    })

    return NextResponse.json({
      ...result,
      pagination: {
        ...result.pagination,
        pages: Math.ceil(result.pagination.total / limit)
      }
    }, { headers })
  } catch (error) {
    console.error('Error fetching blogs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch blogs' },
      { status: 500 }
    )
  }
}

// POST /api/blogs - Generate a new blog post
export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const clientId = getClientId(request)
    const rateLimitResult = checkRateLimit(ENDPOINT, clientId)
    const headers = getRateLimitHeaders(rateLimitResult)

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.', retryAfter },
        { status: 429, headers }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = validateRequest(createBlogSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error) },
        { status: 400, headers }
      )
    }

    const { videoId, forceRegenerate } = validation.data

    // Get video with channel info
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { channel: true }
    })

    if (!video) {
      return NextResponse.json(
        { error: 'Video not found' },
        { status: 404, headers }
      )
    }

    // Check if blog already exists
    if (!forceRegenerate) {
      const existingBlog = await prisma.blogPost.findFirst({
        where: { videoId }
      })

      if (existingBlog) {
        return NextResponse.json(
          { error: 'Blog already exists for this video', blog: existingBlog },
          { status: 409, headers }
        )
      }
    }

    // Get transcript
    let transcript = video.transcript || ''

    if (!transcript) {
      try {
        const transcriptData = await getTranscript(video.youtubeId)
        transcript = transcriptData.map(t => t.text).join(' ')
        transcript = transcript.slice(0, 20000) // Limit transcript length

        // Save transcript to video
        await prisma.video.update({
          where: { id: videoId },
          data: {
            hasTranscript: true,
            transcript
          }
        })
      } catch (error) {
        console.error('Error getting transcript:', error)
        transcript = video.description || ''
      }
    }

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript available for this video' },
        { status: 400, headers }
      )
    }

    // Generate blog content using MiniMax
    const youtubeUrl = `https://www.youtube.com/watch?v=${video.youtubeId}`

    const blogContent = await minimaxService.generateBlogPost(
      video.title,
      video.description || '',
      transcript,
      video.channel.name,
      youtubeUrl,
      video.thumbnail || ''
    )

    // Extract tags from content
    const tagsMatch = blogContent.match(/tags:?\s*\[(.*?)\]/i)
    const tags = tagsMatch ? tagsMatch[1] : ''

    // Process content (extract summary and clean marks)
    const { content: finalContent, excerpt: finalExcerpt } = processBlogContent(blogContent)

    // Generate a stable slug base
    const baseSlug = slugify(video.title)

    // Check if blog already exists - using findFirst as backup to unique lookup
    const existingBlog = await prisma.blogPost.findFirst({
      where: { videoId: video.id }
    })

    let blog
    if (existingBlog) {
      // Update existing blog
      blog = await prisma.blogPost.update({
        where: { id: existingBlog.id },
        data: {
          title: video.title,
          content: finalContent,
          excerpt: finalExcerpt || video.description?.slice(0, 150) || video.title,
          coverImage: video.thumbnail,
          status: 'published',
          tags: {
            set: [], // Clear existing relations
            connectOrCreate: tags.split(',').filter(t => t.trim()).map(tag => ({
              where: { name: tag.trim() },
              create: { name: tag.trim() }
            }))
          }
        }
      })
    } else {
      // Create new blog
      blog = await prisma.blogPost.create({
        data: {
          title: video.title,
          slug: `${baseSlug}-${Date.now()}`,
          content: finalContent,
          excerpt: finalExcerpt || video.description?.slice(0, 150) || video.title,
          coverImage: video.thumbnail,
          status: 'published',
          videoId: video.id,
          sourceUrl: youtubeUrl,
          tags: {
            connectOrCreate: tags.split(',').filter(t => t.trim()).map(tag => ({
              where: { name: tag.trim() },
              create: { name: tag.trim() }
            }))
          }
        }
      })
    }

    return NextResponse.json(blog, { status: 201, headers })
  } catch (error) {
    console.error('Error generating blog:', error)
    return NextResponse.json(
      { error: 'Failed to generate blog' },
      { status: 500 }
    )
  }
}

// DELETE /api/blogs - Delete a blog post or batch delete
export async function DELETE(request: NextRequest) {
  try {
    // Rate limiting check for DELETE requests
    const clientId = getClientId(request)
    const rateLimitResult = checkRateLimit(ENDPOINT, clientId)
    const headers = getRateLimitHeaders(rateLimitResult)

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.', retryAfter },
        { status: 429, headers }
      )
    }

    const { searchParams } = new URL(request.url)

    // Validate query parameters
    const queryValidation = validateRequest(deleteBlogSchema, {
      id: searchParams.get('id'),
      deleteAll: searchParams.get('deleteAll'),
      channelId: searchParams.get('channelId'),
    });

    if (!queryValidation.success) {
      return NextResponse.json(
        { error: formatZodError(queryValidation.error) },
        { status: 400, headers }
      )
    }

    const { id, deleteAll, channelId } = queryValidation.data

    // Batch delete all blogs
    if (deleteAll === 'true') {
      const where: Record<string, unknown> = {}
      if (channelId) {
        where.video = {
          channelId
        }
      }

      const result = await prisma.blogPost.deleteMany({
        where
      })

      return NextResponse.json({
        success: true,
        deletedCount: result.count
      }, { headers })
    }

    // Single blog delete
    if (!id) {
      return NextResponse.json(
        { error: 'Blog ID is required' },
        { status: 400, headers }
      )
    }

    await prisma.blogPost.delete({
      where: { id }
    })

    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    console.error('Error deleting blog:', error)
    return NextResponse.json(
      { error: 'Failed to delete blog' },
      { status: 500 }
    )
  }
}
