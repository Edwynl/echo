import { NextRequest, NextResponse } from 'next/server'
import { MiniMaxService } from '@/services/minimax'

// POST /api/translate - Translate content using MiniMax AI
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { content, targetLanguage, sourceLanguage } = body

    if (!content || !targetLanguage) {
      return NextResponse.json(
        { error: 'Content and target language are required' },
        { status: 400 }
      )
    }

    const minimax = new MiniMaxService()
    const targetLang = targetLanguage === 'en' ? 'English' : 'Chinese'
    const sourceLang = sourceLanguage
      ? (sourceLanguage === 'en' ? 'English' : 'Chinese')
      : (/[\\u4e00-\\u9fa5]/.test(content) ? 'Chinese' : 'English')

    const systemPrompt = `You are a professional technical content translator. Your task is to translate content between Chinese and English accurately.

## Translation Requirements:
1. Preserve all technical terminology accurately
2. Keep code blocks, Mermaid diagrams, and markdown formatting intact
3. Maintain the original tone and style
4. For code comments, translate them appropriately
5. Do not add or remove content - translate only
6. If the source is Chinese, translate to English; if English, translate to Chinese
7. Keep frontmatter intact (the --- delimited sections at the top)

## Important:
- Do NOT translate variable names, function names, or code
- Do NOT translate URLs
- Preserve markdown syntax (headers, lists, links, etc.)
- Keep Mermaid diagram syntax exactly as is
- Only translate the text content, not the formatting`

    const userPrompt = `Translate the following content to ${targetLang}.

**Source Language**: ${sourceLang}
**Target Language**: ${targetLang}

**Content to translate**:
${content.slice(0, 15000)}`

    const translatedContent = await minimax.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    return NextResponse.json({
      success: true,
      translatedContent,
      targetLanguage,
      sourceLanguage: sourceLang
    })
  } catch (error: any) {
    console.error('Translation error:', error)
    return NextResponse.json(
      { error: error.message || 'Translation failed' },
      { status: 500 }
    )
  }
}

// GET /api/translate - Check translation service health
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'MiniMax Translation API',
    supportedLanguages: ['en', 'zh']
  })
}
