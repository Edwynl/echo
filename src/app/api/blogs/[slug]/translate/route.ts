/**
 * Blog Translation API Route
 *
 * POST /api/blogs/[slug]/translate
 * Translates a blog post to the specified language
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { translationService, TargetLanguage } from '@/services/translation';
import { getCacheStats } from '@/lib/translation-cache';

// Request body type
interface TranslateRequestBody {
  language: 'zh' | 'en';
  saveToDb?: boolean; // Optional: whether to save translation to database
}

// Response type
interface TranslateResponse {
  title: string;
  content: string;
  language: TargetLanguage;
  cached: boolean;
  originalLanguage: string;
  saved?: boolean;
  error?: string;
}

/**
 * GET /api/blogs/[slug]/translate - Get translation status
 * GET /api/blogs/[slug]/translate?stats=true - Get cache statistics
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { searchParams } = new URL(request.url);
    const includeStats = searchParams.get('stats') === 'true';

    // Get blog post
    const blog = await prisma.blogPost.findUnique({
      where: { slug }
    });

    if (!blog) {
      return NextResponse.json(
        { error: 'Blog not found' },
        { status: 404 }
      );
    }

    const response: {
      slug: string;
      title: string;
      language: string;
      hasTranslatedZh: boolean;
      hasTranslatedEn: boolean;
      cacheStats?: ReturnType<typeof getCacheStats>;
    } = {
      slug,
      title: blog.title,
      language: blog.language,
      hasTranslatedZh: !!blog.translatedZh,
      hasTranslatedEn: !!blog.translatedEn
    };

    if (includeStats) {
      response.cacheStats = getCacheStats();
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching translation status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch translation status' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/blogs/[slug]/translate
 * Body: { language: 'zh' | 'en', saveToDb?: boolean }
 * Response: { title: string, content: string, language: 'zh' | 'en', cached: boolean, ... }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const body: TranslateRequestBody = await request.json();

    // Validate language parameter
    const { language } = body;
    if (!language || !['zh', 'en'].includes(language)) {
      return NextResponse.json(
        { error: 'Invalid language. Must be "zh" or "en"' },
        { status: 400 }
      );
    }

    const targetLang = language as TargetLanguage;
    const saveToDb = body.saveToDb ?? false;

    console.log(`[TranslateAPI] Translating blog "${slug}" to ${targetLang}`);

    // Get blog post from database
    const blog = await prisma.blogPost.findUnique({
      where: { slug }
    });

    if (!blog) {
      return NextResponse.json(
        { error: 'Blog not found' },
        { status: 404 }
      );
    }

    // Determine source content and title
    let sourceContent: string;
    let sourceTitle: string;
    let originalLanguage: string;

    // Check if we already have a translation for the requested language
    if (targetLang === 'zh' && blog.translatedZh) {
      sourceContent = blog.translatedZh;
      sourceTitle = blog.titleZh || blog.title;
      originalLanguage = 'zh';
    } else if (targetLang === 'en' && blog.translatedEn) {
      sourceContent = blog.translatedEn;
      sourceTitle = blog.titleEn || blog.title;
      originalLanguage = 'en';
    } else {
      // Use original content
      sourceContent = blog.content;
      sourceTitle = blog.title;
      originalLanguage = blog.language || 'zh';
    }

    // Check if translation is needed (skip if already requesting original language)
    if (originalLanguage === targetLang) {
      console.log(`[TranslateAPI] Blog is already in ${targetLang}, returning original`);
      return NextResponse.json({
        title: sourceTitle,
        content: sourceContent,
        language: targetLang as TargetLanguage,
        cached: false,
        originalLanguage,
        saved: false,
        alreadyTranslated: true
      } as TranslateResponse & { alreadyTranslated: boolean });
    }

    // Perform translation
    const startTime = Date.now();
    const translated = await translationService.translateBlogPost(
      sourceContent,
      sourceTitle,
      targetLang
    );
    const translationTime = Date.now() - startTime;

    console.log(`[TranslateAPI] Translation completed in ${translationTime}ms`);

    // Check if result was from cache (by comparing with saved translations)
    let cached = false;
    if (targetLang === 'zh' && blog.translatedZh === translated.content) {
      cached = true;
    } else if (targetLang === 'en' && blog.translatedEn === translated.content) {
      cached = true;
    }

    const response: TranslateResponse = {
      title: translated.title,
      content: translated.content,
      language: targetLang,
      cached,
      originalLanguage,
      error: undefined
    };

    // Optionally save to database
    if (saveToDb) {
      try {
        const updateData: {
          language: string;
          translatedZh?: string | null;
          translatedEn?: string | null;
          titleZh?: string | null;
          titleEn?: string | null;
        } = {
          language: 'bilingual'
        };

        if (targetLang === 'zh') {
          updateData.translatedZh = translated.content;
          updateData.titleZh = translated.title;
        } else {
          updateData.translatedEn = translated.content;
          updateData.titleEn = translated.title;
        }

        await prisma.blogPost.update({
          where: { slug },
          data: updateData
        });

        response.saved = true;
        console.log(`[TranslateAPI] Translation saved to database for ${slug}`);
      } catch (dbError) {
        console.error('[TranslateAPI] Failed to save translation to database:', dbError);
        response.saved = false;
        response.error = 'Translation completed but failed to save to database';
      }
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error('[TranslateAPI] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to translate blog',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
