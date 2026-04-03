import { NextResponse } from 'next/server'

// Debug endpoint to check environment variables
export async function GET() {
  return NextResponse.json({
    hasApiKey: !!process.env.MINIMAX_API_KEY,
    apiKeyPrefix: process.env.MINIMAX_API_KEY?.slice(0, 10) || 'none',
    baseUrl: process.env.MINIMAX_BASE_URL,
    model: process.env.MINIMAX_MODEL,
    youtubeKeyPrefix: process.env.YOUTUBE_API_KEY?.slice(0, 10) || 'none'
  })
}
