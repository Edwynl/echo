// API Route: Get Knowledge Sources
// Handles fetching sources with filters

import { NextRequest, NextResponse } from 'next/server'
import { knowledgeSourceService } from '@/services/knowledge-source'
import { sourceListCache, withCache, ApiCache } from '@/lib/api-cache'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const sourceType = searchParams.get('sourceType') as 'YOUTUBE' | 'GITHUB' | 'WEB' | null
    const status = searchParams.get('status') as 'pending' | 'processing' | 'completed' | 'failed' | null
    const projectGroupId = searchParams.get('projectGroupId')
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')

    const cacheKey = ApiCache.makeKey('sources', { sourceType, status, projectGroupId, limit, offset })
    const result = await withCache(sourceListCache, cacheKey, async () =>
      knowledgeSourceService.getSources({
        sourceType: sourceType || undefined,
        status: status || undefined,
        projectGroupId: projectGroupId || undefined,
        limit,
        offset
      })
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching sources:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sources' },
      { status: 500 }
    )
  }
}
