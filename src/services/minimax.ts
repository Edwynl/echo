// MiniMax API Service
// Handles text generation, summarization, and brainstorming

import { withRetry, validateContent, withContentValidation, DEFAULT_RETRY_OPTIONS } from '@/lib/ai-retry'
import { aiLogger } from '@/lib/ai-logger'
import { slugify } from '@/lib/utils'
import { CircuitBreaker } from '@/lib/circuit-breaker'

/** Circuit breaker for MiniMax API — opens after 5 consecutive failures */
const minimaxCircuit = new CircuitBreaker({ name: 'MiniMax', failureThreshold: 5, recoveryTimeout: 30_000 })

interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface MiniMaxRequest {
  model: string
  messages: MiniMaxMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

interface MiniMaxResponse {
  choices: Array<{
    message: {
      content: string
    }
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  base_resp?: {
    status_code: number
    status_msg: string
  }
}

export class MiniMaxService {
  private apiKey: string
  private baseUrl: string
  private model: string

  constructor() {
    this.apiKey = process.env.MINIMAX_API_KEY || ''
    this.baseUrl = process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1'
    this.model = process.env.MINIMAX_MODEL || 'MiniMax-M2.7'
  }

  /**
   * Send a chat completion request with circuit breaker + retry logic.
   * Circuit breaker prevents cascading failures when MiniMax API is down.
   */
  async chat(messages: MiniMaxMessage[]): Promise<string> {
    return minimaxCircuit.execute(() =>
      withRetry('MiniMax.chat', async () => {
        return this.executeChat(messages)
      }, {
        maxRetries: 2,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffMultiplier: 2,
      })
    )
  }

  /**
   * Execute the actual chat request
   */
  private async executeChat(messages: MiniMaxMessage[]): Promise<string> {
    if (!this.apiKey) {
      throw new Error('MiniMax API key not configured')
    }

    const model = this.model
    const startTime = Date.now()

    console.log(`[MiniMax] Using model: ${model}`)

    const request: MiniMaxRequest = {
      model,
      messages,
      temperature: 0.3,
      max_tokens: 4000
    }

    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120000) // 120 second timeout for long content

    try {
      const response = await fetch(`${this.baseUrl}/text/chatcompletion_v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(request),
        signal: controller.signal
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json() as MiniMaxResponse

      // Check for API errors
      if (data.base_resp && data.base_resp.status_code !== 0) {
        throw new Error(`MiniMax API Error: ${data.base_resp.status_msg}`)
      }

      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from MiniMax API')
      }

      const duration = Date.now() - startTime
      if (data.usage) {
        console.log(`[MiniMax] Success in ${duration}ms | tokens: ${data.usage.total_tokens} (prompt: ${data.usage.prompt_tokens}, completion: ${data.usage.completion_tokens})`)
      } else {
        console.log(`[MiniMax] Success in ${duration}ms`)
      }

      return data.choices[0].message.content
    } catch (error) {
      clearTimeout(timeoutId)
      const duration = Date.now() - startTime

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`MiniMax API timeout after ${duration}ms`)
      }

      throw error
    }
  }

  /**
   * Generate blog post with content validation
   */
  async generateBlogPostWithValidation(
    videoTitle: string,
    videoDescription: string,
    transcript: string,
    channelName: string,
    youtubeUrl: string,
    thumbnail: string,
    sourceType: 'youtube' | 'github' | 'web' = 'youtube'
  ): Promise<string> {
    return withContentValidation(
      'MiniMax.generateBlogPost',
      async () => {
        return this.generateBlogPost(videoTitle, videoDescription, transcript, channelName, youtubeUrl, thumbnail, sourceType)
      },
      {
        maxValidationRetries: 1,
        retryOptions: DEFAULT_RETRY_OPTIONS,
      }
    )
  }

  // Summarize YouTube video content
  async summarizeVideo(
    videoTitle: string,
    videoDescription: string,
    transcript: string,
    channelName: string
  ): Promise<{
    summary: string
    keyPoints: string[]
    tags: string[]
  }> {
    const systemPrompt = `你是一位专业的技术博客作家和内容编辑。你的任务是将YouTube视频内容转化为高质量的技术博客文章。

## 输出要求：
1. 用中文撰写（除非原内容是英文）
2. 技术术语要准确
3. 代码示例要完整可运行
4. 段落简洁有力
5. 结构清晰，有层次
6. **禁止输出不完整的命令行**（如只有 'pip install' 而没有包名）。如果原文未提及具体指令，请使用描述性文字（如“通过 pip 安装”）代替代码块。

## 博客结构：
- 标题：简洁有力
- 摘要：100字以内
- 核心要点：3-5个关键点
- 详细内容：深入浅出地讲解
- 相关资源：提供扩展阅读链接`

    const userPrompt = `请分析以下YouTube视频内容，并写成技术博客：

**频道**: ${channelName}
**标题**: ${videoTitle}
**描述**: ${videoDescription}

**视频字幕/内容**:
${transcript.slice(0, 10000)}

请按以下JSON格式输出：
{
  "summary": "摘要，不超过100字",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "tags": ["标签1", "标签2", "标签3"]
}`

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    try {
      // Try to parse JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          summary: parsed.summary || '',
          keyPoints: parsed.keyPoints || [],
          tags: parsed.tags || []
        }
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e)
    }

    // Fallback: return raw response
    return {
      summary: response.slice(0, 200),
      keyPoints: [],
      tags: []
    }
  }

  // Brainstorm related content
  async brainstorm(
    topic: string,
    videoTitle: string
  ): Promise<{
    useCases: string[]
    bestPractices: string[]
    relatedTopics: string[]
    interviewQuestions: string[]
  }> {
    const systemPrompt = `你是一位技术顾问和布道师，擅长发散思维，将单一技术点扩展为完整的知识图谱。`

    const userPrompt = `基于以下视频主题，进行头脑风暴，生成相关内容：

**主题**: ${topic}
**视频标题**: ${videoTitle}

请按以下JSON格式输出：
{
  "useCases": ["应用场景1", "应用场景2", "应用场景3"],
  "bestPractices": ["最佳实践1", "最佳实践2", "最佳实践3"],
  "relatedTopics": ["相关主题1", "相关主题2", "相关主题3"],
  "interviewQuestions": ["面试题1", "面试题2", "面试题3"]
}`

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return {
          useCases: parsed.useCases || [],
          bestPractices: parsed.bestPractices || [],
          relatedTopics: parsed.relatedTopics || [],
          interviewQuestions: parsed.interviewQuestions || []
        }
      }
    } catch (e) {
      console.error('Failed to parse JSON:', e)
    }

    return {
      useCases: [],
      bestPractices: [],
      relatedTopics: [],
      interviewQuestions: []
    }
  }

  // Generate full blog post
  async generateBlogPost(
    videoTitle: string,
    videoDescription: string,
    transcript: string,
    channelName: string,
    youtubeUrl: string,
    thumbnail: string,
    sourceType: 'youtube' | 'github' | 'web' = 'youtube'
  ): Promise<string> {
    const systemPrompt = `你是专业的技术博客作家。你的任务是将输入内容转化为深度技术文章。

## 写作核心要求：
- **[架构图自动生成] (Crucial)**：如果内容涉及系统设计、工作流、组件关系等，请务必在文章内包含一个或多个 Mermaid 流程图 (mermaid.js)。请确保 Mermaid 语法准确，不包含 HTML 标签。
- **[成本与方案]**：必须包含 [成本分析] 模块，分析相关技术或 API 使用的潜在费用，并给出优化建议。
- **[价值挖掘]**：包含 [核心优势] 和 [扩展应用] 方案。
- **[命令完整性] (Essential)**：禁止输出不完整的命令行指令（如只有 \`pip install\` 而没有具体的包名）。如果原文或参考内容中不包含确切的包名，请使用描述性文字（如“使用 pip 命令进行安装”）代替代码块。
- **风格**：专业、硬核、直接、禁止使用 Emoji，输出中文。`

    const sourceContext = sourceType === 'github' ? 'GitHub 仓库代码逻辑' : (sourceType === 'web' ? '网页技术文档' : '视频字幕内容');

    const userPrompt = `根据以下${sourceContext}，直接输出深度技术博客。

**标题**: ${videoTitle}
**来源**: ${youtubeUrl}

**参考内容**：
${transcript.slice(0, 10000)}

**必须包含的模块**：
1. **[引言]与[核心解析]**
2. **[技术架构]** (务必包含适当的 Mermaid 流程图)
3. **[代码实现/逻辑分析]** (提供核心逻辑的深度拆解)
4. **[成本分析与免费建议]** (分析相关技术成本)
5. **[方案好处与扩展应用]**
6. **[总结]**
7. [SUMMARY_START]一句话总结[SUMMARY_END]`

    let response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    // Clean response: remove <think> tags or other meta-talk if they still appear
    response = response.replace(/<think>[\s\S]*?<\/think>/gi, '')
    // Remove naked pip/npm install commands (common AI artifacts)
    response = response.replace(/`(pip|npm|yarn|pnpm|bun) install\s*`/gi, '通过包管理器安装')
    response = response.replace(/```\n(pip|npm|yarn|pnpm|bun) install\s*\n```/gi, '通过包管理器安装')
    
    response = response.replace(/^(let me|i will|i need to|ok|sure|here is)[\s\S]*?\n\n/gi, '')
    response = response.trim()

    // Add frontmatter
    const frontmatter = `---
title: "${videoTitle}"
channel: "${channelName}"
date: "${new Date().toISOString().split('T')[0]}"
description: "${videoDescription?.slice(0, 150) || videoTitle}"
coverImage: "${thumbnail}"
sourceUrl: "${youtubeUrl}"
---

`

    return frontmatter + response
  }

  // Summarize MD file content
  async summarizeContent(
    content: string,
    title: string,
    sourceUrl: string
  ): Promise<string> {
    const systemPrompt = `你是一位专业的技术博客作家和内容编辑。你的任务是将Markdown内容转化为高质量的技术博客文章。

## 输出要求：
1. 用中文撰写（除非原内容是英文）
2. 技术术语要准确
3. 代码示例要完整可运行
4. 段落简洁有力
5. 结构清晰，有层次
6. 保留原有的格式和结构
7. **禁止输出不完整的命令行**（如只有 'pip install' 而没有包名）。如果原文未提及具体指令，请使用描述性文字代替代码块。

## 博客结构：
- 标题：简洁有力
- 摘要：100字以内
- 核心要点：3-5个关键点
- 详细内容：深入浅出地讲解
- 相关资源：提供扩展阅读链接`

    const userPrompt = `请分析以下Markdown内容，并优化成技术博客：

**标题**: ${title}
**来源**: ${sourceUrl}

**内容**:
${content.slice(0, 10000)}

请生成一篇结构清晰、技术深度充足的技术博客文章。`

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    // Add frontmatter
    const frontmatter = `---
title: "${title}"
date: "${new Date().toISOString().split('T')[0]}"
sourceUrl: "${sourceUrl}"
---

`

    return frontmatter + response
  }

  // Summarize web content
  async summarizeWebContent(
    content: string,
    sourceUrl: string
  ): Promise<string> {
    const systemPrompt = `你是一位专业的技术博客作家和内容编辑。你的任务是从网页内容中提取关键信息，转化为高质量的技术博客文章。

## 输出要求：
1. 用中文撰写（除非原内容是英文）
2. 技术术语要准确
3. 段落简洁有力
4. 结构清晰，有层次
5. 去除广告、导航等无关内容
6. **禁止输出不完整的命令行**（如只有 'pip install' 而没有包名）。

## 博客结构：
- 标题：从内容中提取或生成
- 摘要：100字以内
- 核心要点：3-5个关键点
- 详细内容：深入浅出地讲解
- 相关资源：提供原始链接
- 摘要提取：在文章最后，提供一个 100-150 字的纯文本精炼摘要（中文），并将其包裹在 [SUMMARY_START] 和 [SUMMARY_END] 标记之间。`

    const userPrompt = `请分析以下网页内容，并写成技术博客：

**来源**: ${sourceUrl}

**内容**:
${content.slice(0, 10000)}

请生成一篇结构清晰、技术深度充足的技术博客文章。`

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    // Add frontmatter
    const frontmatter = `---
date: "${new Date().toISOString().split('T')[0]}"
sourceUrl: "${sourceUrl}"
---

`

    return frontmatter + response
  }

  /**
   * Generate a strictly one-sentence summary for a blog post
   */
  async generateOneSentenceSummary(content: string): Promise<string> {
    const systemPrompt = `你是一位极简主义的技术内容编辑。你的任务是将长篇文章缩减为一句精华总结。

## 要求：
1. 必须只有一句话。
2. 长度在 60-100 字左右。
3. 语气专业、客观、吸引人。
4. 严禁包含：链接、推广内容、Emoji、日期、作者信息。
5. 仅输出摘要正文，不要包含任何标签或前缀。`

    const userPrompt = `请为以下技术博客内容写一句精准的总结：

${content.slice(0, 10000)}`

    const response = await this.chat([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ])

    return response.trim().replace(/^摘要[:：]/, '').replace(/[\[\]]/g, '')
  }
}

export const minimaxService = new MiniMaxService()
