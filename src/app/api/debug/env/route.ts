import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Debug endpoint to check environment variables and database
export async function GET() {
  const envInfo = {
    hasApiKey: !!process.env.MINIMAX_API_KEY,
    apiKeyPrefix: process.env.MINIMAX_API_KEY?.slice(0, 10) || 'none',
    baseUrl: process.env.MINIMAX_BASE_URL,
    model: process.env.MINIMAX_MODEL,
    youtubeKeyPrefix: process.env.YOUTUBE_API_KEY?.slice(0, 10) || 'none',
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    databaseUrlHost: process.env.DATABASE_URL?.split('@')[1]?.split('/')[0] || 'none'
  }

  let dbInfo = { error: 'not tested' }
  try {
    const channels = await prisma.channel.count()
    const syncQueue = await prisma.syncQueue.count()
    dbInfo = { channels, syncQueue }
  } catch (error) {
    dbInfo = { error: error instanceof Error ? error.message : String(error) }
  }

  return NextResponse.json({ env: envInfo, db: dbInfo })
}
