/**
 * Translation Service
 *
 * Provides translation functionality using MiniMax API with caching support.
 * Supports Chinese <-> English translation for blog content.
 */

import { MiniMaxService } from './minimax';
import {
  getCachedTranslation,
  setCachedTranslation,
  getCachedTitle,
  setCachedTitle,
  getCachedBatch,
  setCachedBatch
} from '@/lib/translation-cache';

export type TargetLanguage = 'zh' | 'en';

interface TranslationResult {
  content: string;
  title: string;
}

interface BatchItem {
  content: string;
  title: string;
}

export class TranslationService {
  private miniMax: MiniMaxService;

  constructor() {
    this.miniMax = new MiniMaxService();
  }

  /**
   * Get system prompt for translation based on target language
   */
  private getTranslationPrompt(targetLang: TargetLanguage): string {
    if (targetLang === 'en') {
      return `You are a professional technical translator specializing in Chinese to English translation.

## Translation Requirements:
1. Maintain the original formatting (Markdown, code blocks, etc.)
2. Preserve technical terms - use standard English translations for programming concepts
3. Keep code blocks and examples exactly as-is (only translate comments if necessary)
4. Technical terminology should be accurate and follow industry standards
5. Maintain the tone and style of the original content
6. Do NOT add explanations or notes - only translate the content
7. Preserve all frontmatter (if any) at the beginning of the document

## Frontmatter handling:
- If the content has frontmatter (YAML between ---), translate only the values, not the keys
- Example: "title: 技术博客" -> "title: Technical Blog"
- Keys like "title", "date", "author" should remain in English`;
    } else {
      return `你是专业的技术翻译，擅长将英文内容翻译为中文。

## 翻译要求：
1. 保持原文格式（Markdown、代码块等）
2. 技术术语要准确，使用标准中文翻译
3. 代码块和示例保持原样（仅在必要时翻译注释）
4. 保持原文的语气和风格
5. 不要添加解释或注释 - 只翻译内容
6. 保留文章开头的所有前置数据（frontmatter）

## Frontmatter处理：
- 如果内容有frontmatter（---之间的YAML），只翻译值，不翻译键
- 例如："title: Technical Blog" -> "title: 技术博客"
- 键如"title", "date", "author"保持英文`;
    }
  }

  /**
   * Translate blog content to target language
   * @param content Markdown content to translate
   * @param targetLang Target language ('zh' or 'en')
   * @returns Translated content
   */
  async translateBlog(content: string, targetLang: TargetLanguage): Promise<string> {
    // Check cache first
    const cached = getCachedTranslation(content, targetLang);
    if (cached) {
      console.log(`[TranslationService] Cache hit for content translation (${targetLang})`);
      return cached;
    }

    console.log(`[TranslationService] Translating content to ${targetLang}...`);

    const targetLangName = targetLang === 'en' ? 'English' : 'Chinese';
    const sourceLangName = targetLang === 'en' ? 'Chinese' : 'English';

    const messages = [
      { role: 'system' as const, content: this.getTranslationPrompt(targetLang) },
      {
        role: 'user' as const,
        content: `Translate the following ${sourceLangName} content to ${targetLangName}:

${content}`
      }
    ];

    try {
      const translated = await this.miniMax.chat(messages);
      const result = translated.trim();

      // Cache the result
      setCachedTranslation(content, targetLang, result);

      return result;
    } catch (error) {
      console.error(`[TranslationService] Translation error:`, error);
      throw new Error(`Failed to translate content to ${targetLang}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Translate title to target language
   * @param title Title to translate
   * @param targetLang Target language ('zh' or 'en')
   * @returns Translated title
   */
  async translateTitle(title: string, targetLang: TargetLanguage): Promise<string> {
    // Check cache first
    const cached = getCachedTitle(title, targetLang);
    if (cached) {
      console.log(`[TranslationService] Cache hit for title translation (${targetLang})`);
      return cached;
    }

    console.log(`[TranslationService] Translating title to ${targetLang}...`);

    const targetLangName = targetLang === 'en' ? 'English' : 'Chinese';
    const sourceLangName = targetLang === 'en' ? 'Chinese' : 'English';

    const messages = [
      { role: 'system' as const, content: `You are a professional translator. Translate the following ${sourceLangName} title to ${targetLangName}. Only output the translated title, nothing else. Keep it concise.` },
      { role: 'user' as const, content: title }
    ];

    try {
      const translated = await this.miniMax.chat(messages);
      const result = translated.trim();

      // Cache the result
      setCachedTitle(title, targetLang, result);

      return result;
    } catch (error) {
      console.error(`[TranslationService] Title translation error:`, error);
      throw new Error(`Failed to translate title to ${targetLang}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Batch translate multiple items
   * @param items Array of items with content and title
   * @param targetLang Target language ('zh' or 'en')
   * @returns Array of translated items
   */
  async translateBatch(
    items: BatchItem[],
    targetLang: TargetLanguage
  ): Promise<TranslationResult[]> {
    if (items.length === 0) {
      return [];
    }

    console.log(`[TranslationService] Batch translating ${items.length} items to ${targetLang}...`);

    const results: TranslationResult[] = [];
    const uncachedItems: Array<{ original: BatchItem; index: number }> = [];

    // Check cache for each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const cachedContent = getCachedTranslation(item.content, targetLang);
      const cachedTitle = getCachedTitle(item.title, targetLang);

      if (cachedContent && cachedTitle) {
        results[i] = { content: cachedContent, title: cachedTitle };
      } else {
        uncachedItems.push({ original: item, index: i });
      }
    }

    // If all items are cached, return early
    if (uncachedItems.length === 0) {
      console.log(`[TranslationService] All ${items.length} items found in cache`);
      return results;
    }

    console.log(`[TranslationService] ${uncachedItems.length} items need translation`);

    // Translate uncached items one by one to avoid token limits
    for (const { original, index } of uncachedItems) {
      try {
        const [content, title] = await Promise.all([
          this.translateBlog(original.content, targetLang),
          this.translateTitle(original.title, targetLang)
        ]);

        results[index] = { content, title };
      } catch (error) {
        console.error(`[TranslationService] Error translating item ${index}:`, error);
        // On error, keep original content
        results[index] = { content: original.content, title: original.title };
      }
    }

    return results;
  }

  /**
   * Translate full blog post (content + title) to target language
   * @param content Blog content (Markdown)
   * @param title Blog title
   * @param targetLang Target language ('zh' or 'en')
   * @returns Translated content and title
   */
  async translateBlogPost(
    content: string,
    title: string,
    targetLang: TargetLanguage
  ): Promise<TranslationResult> {
    const [translatedContent, translatedTitle] = await Promise.all([
      this.translateBlog(content, targetLang),
      this.translateTitle(title, targetLang)
    ]);

    return {
      content: translatedContent,
      title: translatedTitle
    };
  }

  /**
   * Detect language of content (simple heuristic)
   * @param content Text to analyze
   * @returns 'zh' or 'en' based on character analysis
   */
  detectLanguage(content: string): TargetLanguage {
    // Count Chinese characters vs English words
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;

    // Simple heuristic: if more Chinese chars than English words, likely Chinese
    return chineseChars > englishWords ? 'zh' : 'en';
  }
}

// Export singleton instance
export const translationService = new TranslationService();

export default translationService;
