// API Route: Add Knowledge Source
// Handles adding new sources (YouTube, GitHub, Web)

import { NextRequest, NextResponse } from 'next/server'
import { knowledgeSourceService } from '@/services/knowledge-source'
import { addSourceSchema, validateRequest, formatZodError } from '@/lib/validation'
import { checkRateLimit, getClientId, getRateLimitHeaders } from '@/lib/rate-limit'

const ENDPOINT = '/api/sources/add'

export async function POST(request: NextRequest) {
  try {
    // Rate limiting check
    const clientId = getClientId(request)
    const rateLimitResult = checkRateLimit(ENDPOINT, clientId)
    const headers = getRateLimitHeaders(rateLimitResult)

    if (!rateLimitResult.allowed) {
      const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000)
      return NextResponse.json(
        {
          error: 'Too many requests. Please try again later.',
          retryAfter,
        },
        { status: 429, headers }
      )
    }

    // Parse and validate request body
    const body = await request.json()
    const validation = validateRequest(addSourceSchema, body)

    if (!validation.success) {
      return NextResponse.json(
        { error: formatZodError(validation.error) },
        { status: 400, headers }
      )
    }

    const { sourceUrl, sourceType, projectGroupId } = validation.data

    // Auto-detect source type if not provided
    const detectedType = sourceType || knowledgeSourceService.detectSourceType(sourceUrl)

    if (!detectedType) {
      return NextResponse.json(
        { error: 'Unable to detect source type from URL' },
        { status: 400, headers }
      )
    }

    // Validate URL based on source type
    if (detectedType === 'GITHUB' && !sourceUrl.includes('github.com')) {
      return NextResponse.json(
        { error: 'Invalid GitHub URL' },
        { status: 400, headers }
      )
    }

    if (detectedType === 'YOUTUBE' &&
        !sourceUrl.includes('youtube.com') &&
        !sourceUrl.includes('youtu.be')) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL' },
        { status: 400, headers }
      )
    }

    // Create the source with initial data
    const source = await knowledgeSourceService.createSource({
      sourceType: detectedType,
      sourceUrl,
      title: `New ${detectedType} Source`, // Will be updated during processing
      projectGroupId
    })

    // Start processing in background (don't wait)
    knowledgeSourceService.processSource({
      sourceId: source.id,
      generateBlog: true
    }).catch(console.error)

    return NextResponse.json({
      success: true,
      source: {
        id: source.id,
        sourceType: source.sourceType,
        sourceUrl: source.sourceUrl,
        status: source.status,
        title: source.title
      },
      message: 'Source added successfully. Processing started in background.'
    }, { headers })
  } catch (error) {
    console.error('Error adding source:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add source' },
      { status: 500 }
    )
  }
}
