'use client'
/* eslint-disable react-hooks/rules-of-hooks */

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { ArrowLeft, Loader2, Share2, ExternalLink, Youtube, MessageCircle, Bookmark, MoreHorizontal, RefreshCw, Trash2, X, Github, Globe, AlertCircle, Languages, AlertTriangle } from 'lucide-react'
import { formatDate, decodeHtmlEntities, processBlogContent } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import LanguageSwitcher from '@/components/LanguageSwitcher'
import { useCodeBlock } from '@/components/useCodeBlock'
import remarkGfm from 'remark-gfm'

// Dynamically import ReactMarkdown to reduce initial bundle size
// Only loaded when a blog page is actually rendered
const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false })

// Translation cache interface
interface TranslationCache {
  content: string
  title: string
  timestamp: number
}

// Blog Post Skeleton Component
function BlogPostSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      {/* Header Skeleton */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg animate-pulse bg-gray-200" />
            <div className="w-32 sm:w-40 h-6 rounded animate-pulse bg-gray-200 hidden sm:block" />
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full animate-pulse bg-gray-200" />
            <div className="w-10 h-8 rounded-lg animate-pulse bg-gray-200 hidden sm:block" />
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-8 sm:py-16">
        <article className="max-w-[720px] mx-auto">
          {/* Cover Image Skeleton */}
          <div className="mb-8 sm:mb-12 rounded-2xl overflow-hidden animate-pulse bg-gray-100 h-48 sm:h-64" />

          {/* Author Meta Skeleton */}
          <div className="flex items-center gap-4 mb-6 sm:mb-10">
            <div className="w-12 h-12 bg-gray-100 rounded-full animate-pulse" />
            <div className="flex flex-col gap-2">
              <div className="h-4 w-24 rounded animate-pulse bg-gray-100" />
              <div className="h-3 w-32 rounded animate-pulse bg-gray-100" />
            </div>
          </div>

          {/* Title Skeleton */}
          <div className="space-y-3 mb-6 sm:mb-8">
            <div className="h-8 sm:h-12 w-full rounded-lg animate-pulse bg-gray-100" />
            <div className="h-8 sm:h-12 w-3/4 rounded-lg animate-pulse bg-gray-100" />
          </div>

          {/* Content Skeleton */}
          <div className="space-y-4 mt-12">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-full rounded animate-pulse bg-gray-100" />
                <div className="h-4 w-5/6 rounded animate-pulse bg-gray-100" />
                <div className="h-4 w-4/6 rounded animate-pulse bg-gray-100" />
              </div>
            ))}
          </div>
        </article>
      </main>
    </div>
  )
}

interface Blog {
  id: string
  title: string
  content: string
  slug: string
  excerpt: string
  publishedAt: string
  sourceUrl: string
  tags: string
  coverImage: string | null
  videoId: string
  video: {
    title: string
    channel: {
      name: string
    }
  }
  knowledgeSource: {
    sourceType: string
    processedContent: string | null
    updatedAt: string
  } | null
}

export default function BlogPost({ params }: { params: { slug: string } }) {
  const { t, language: i18nLanguage, setLanguage: setI18nLanguage } = useI18n()
  const [blog, setBlog] = useState<Blog | null>(null)
  const [loading, setLoading] = useState(true)
  const [language, setLanguage] = useState<'zh' | 'en'>(i18nLanguage)
  const [hasEnglish, setHasEnglish] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [error, setError] = useState<string>('')
  const [showErrorToast, setShowErrorToast] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)

  // Translation state
  const [isTranslating, setIsTranslating] = useState(false)
  const [translationError, setTranslationError] = useState<string>('')
  const [showTranslationError, setShowTranslationError] = useState(false)
  const [translatedContent, setTranslatedContent] = useState<string | null>(null)
  const [translatedTitle, setTranslatedTitle] = useState<string | null>(null)
  const [translationCache, setTranslationCache] = useState<Map<string, TranslationCache>>(new Map())

  // Detect if content is Chinese
  const detectLanguage = (content: string): 'zh' | 'en' => {
    const chineseRegex = /[\u4e00-\u9fa5]/
    return chineseRegex.test(content) ? 'zh' : 'en'
  }

  // Get cached translation
  const getCachedTranslation = useCallback((blogId: string, targetLang: string): TranslationCache | null => {
    const cacheKey = `${blogId}-${targetLang}`
    const cached = translationCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) { // 30 minutes cache
      return cached
    }
    return null
  }, [translationCache])

  // Translate content using API
  const translateContent = useCallback(async (content: string, targetLang: 'zh' | 'en', sourceLang: 'zh' | 'en') => {
    if (!content) return null

    setIsTranslating(true)
    setTranslationError('')
    setShowTranslationError(false)

    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, targetLanguage: targetLang, sourceLanguage: sourceLang })
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Translation failed')
      }

      const data = await res.json()
      return data.translatedContent
    } catch (err: any) {
      console.error('Translation error:', err)
      setTranslationError(err.message || (language === 'zh' ? '翻译失败，请重试' : 'Translation failed, please retry'))
      setShowTranslationError(true)
      return null
    } finally {
      setIsTranslating(false)
    }
  }, [language])

  // Handle translation when language changes
  useEffect(() => {
    const translateAndCache = async () => {
      if (!blog || !hasEnglish) return

      const contentLanguage = detectLanguage(blog.content)
      const targetLang = language === 'zh' ? 'en' : 'zh'

      // If content is already in the target language, no need to translate
      if (contentLanguage === targetLang) {
        setTranslatedContent(null)
        setTranslatedTitle(null)
        return
      }

      // Check cache first
      const cached = getCachedTranslation(blog.id, targetLang)
      if (cached) {
        setTranslatedContent(cached.content)
        setTranslatedTitle(cached.title)
        return
      }

      // Translate content
      const translated = await translateContent(blog.content, targetLang, contentLanguage)
      if (translated) {
        // Extract title from translated content if it's in frontmatter
        const titleMatch = translated.match(/title:\s*["'](.+?)["']/i)
        const title = titleMatch ? titleMatch[1] : null

        // Cache the translation
        const cacheKey = `${blog.id}-${targetLang}`
        setTranslationCache(prev => {
          const newCache = new Map(prev)
          newCache.set(cacheKey, { content: translated, title: title || '', timestamp: Date.now() })
          return newCache
        })

        setTranslatedContent(translated)
        setTranslatedTitle(title)
      }
    }

    translateAndCache()
  }, [blog, language, hasEnglish, translateContent, getCachedTranslation])

  // Retry translation
  const retryTranslation = async () => {
    if (!blog) return
    setShowTranslationError(false)
    setTranslationError('')

    const contentLanguage = detectLanguage(blog.content)
    const targetLang = language === 'zh' ? 'en' : 'zh'

    // Clear cache for this translation
    const cacheKey = `${blog.id}-${targetLang}`
    setTranslationCache(prev => {
      const newCache = new Map(prev)
      newCache.delete(cacheKey)
      return newCache
    })

    const translated = await translateContent(blog.content, targetLang, contentLanguage)
    if (translated) {
      const titleMatch = translated.match(/title:\s*["'](.+?)["']/i)
      const title = titleMatch ? titleMatch[1] : null

      const cacheKey = `${blog.id}-${targetLang}`
      setTranslationCache(prev => {
        const newCache = new Map(prev)
        newCache.set(cacheKey, { content: translated, title: title || '', timestamp: Date.now() })
        return newCache
      })

      setTranslatedContent(translated)
      setTranslatedTitle(title)
    }
  }

  // Keyboard shortcut for language toggle (Ctrl+L or Cmd+L)
  const handleLanguageToggle = useCallback(() => {
    setIsAnimating(true)
    const newLang = language === 'zh' ? 'en' : 'zh'
    setLanguage(newLang)
    setI18nLanguage(newLang)
    setTimeout(() => setIsAnimating(false), 300)
  }, [language, setI18nLanguage])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault()
        if (hasEnglish) {
          handleLanguageToggle()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasEnglish, handleLanguageToggle])

  useEffect(() => {
    setLanguage(i18nLanguage)
  }, [i18nLanguage])

  useEffect(() => {
    if (params?.slug) {
      fetchBlog(params.slug)
    }
  }, [params])

  const fetchBlog = async (slug: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/blogs/${slug}`)

      if (res.status === 404) {
        setBlog(null)
        setLoading(false)
        return
      }

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`)
      }

      const data = await res.json()
      setBlog(data)
      if (data.content && data.content.includes('---ENGLISH_SECTION---')) {
        setHasEnglish(true)
      }
    } catch (err: any) {
      console.error('Error fetching blog:', err)
      setError(err.message || (language === 'zh' ? '加载失败，请检查网络连接' : 'Failed to load. Please check your connection.'))
      setShowErrorToast(true)
    } finally {
      setLoading(false)
    }
  }

  const deleteBlog = async () => {
    if (!confirm(t.confirmDeleteArticle)) return
    
    setLoading(true)
    try {
      const res = await fetch(`/api/blogs/${params.slug}`, { method: 'DELETE' })
      if (res.ok) {
        window.location.href = '/blogs?deleted=true'
      } else {
        const data = await res.json()
        throw new Error(data.error || t.deleteFailed)
      }
    } catch (err: any) {
      setLoading(false)
      alert(`删除失败: ${err.message}`)
    }
  }

  const shareBlog = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: blog?.title,
          url: window.location.href
        })
      } catch (err) {
        console.log('Share cancelled')
      }
    } else {
      navigator.clipboard.writeText(window.location.href)
      alert(t.copyLinkSuccess)
    }
  }

  // Clean content
  const getContent = (content: string): string => {
    if (!content) return ''

    // Use translated content if available and language matches
    const contentToProcess = translatedContent && !isTranslating ? translatedContent : content

    // Use the robust processing logic first to strip markers and extract if needed
    const { content: processedContent } = processBlogContent(contentToProcess)
    let cleaned = processedContent

    cleaned = cleaned.replace(/^---[\s\S]*?---\n*/, '')
    cleaned = cleaned.replace(/^```markdown\s*/i, '')
    cleaned = cleaned.replace(/```$/i, '')

    // Remove English section if present
    if (cleaned.includes('---ENGLISH_SECTION---')) {
      const parts = cleaned.split('---ENGLISH_SECTION---')
      cleaned = parts[0].trim()
    }

    return cleaned
  }

  // Get display title (translated if available)
  const getDisplayTitle = (): string => {
    if (!blog) return ''
    if (translatedTitle && !isTranslating && !showTranslationError) {
      return decodeHtmlEntities(translatedTitle)
    }
    return decodeHtmlEntities(blog.title)
  }

  if (loading) {
    return <BlogPostSkeleton />
  }

  if (!blog) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white text-[#191919] px-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-gray-400" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-serif font-bold mb-4">{t.articleNotFound}</h1>
          {error && (
            <p className="text-muted mb-4 text-sm sm:text-base">{error}</p>
          )}
          <Link href="/blogs" className="inline-flex items-center gap-2 text-accent hover:underline">
            <ArrowLeft className="w-4 h-4" />
            {t.backToList}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-[#191919]">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100 font-sans">
        <div className="max-w-7xl mx-auto px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
            <button 
              onClick={() => window.history.back()}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors mr-1 shrink-0"
              title={t.backToList}
            >
              <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            <Link href="/blogs" className="font-serif text-lg sm:text-xl font-bold tracking-tight shrink-0">
               {t.youtubeKnowledgeBase}
            </Link>
            <span className="text-gray-300 hidden md:block shrink-0">/</span>
            <span className="text-sm text-muted hidden md:block line-clamp-1 max-w-[300px] truncate">{blog.title}</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
             {hasEnglish && (
               <div className={`flex items-center bg-gray-100 rounded-full p-0.5 sm:p-1 border border-gray-200 transition-all duration-300 ${isAnimating ? 'scale-105' : ''}`}>
                 <button
                   onClick={() => { setLanguage('zh'); setI18nLanguage('zh'); }}
                   className={`px-2 sm:px-3 py-1 text-xs font-bold rounded-full transition-all duration-200 transform ${language === 'zh' ? 'bg-white shadow-sm text-black scale-100' : 'text-gray-500 hover:text-black scale-95'}`}
                 >
                   中
                 </button>
                 <button
                   onClick={() => { setLanguage('en'); setI18nLanguage('en'); }}
                   className={`px-2 sm:px-3 py-1 text-xs font-bold rounded-full transition-all duration-200 transform ${language === 'en' ? 'bg-white shadow-sm text-black scale-100' : 'text-gray-500 hover:text-black scale-95'}`}
                 >
                   EN
                 </button>
                 <span className="text-[10px] text-gray-400 mr-1.5 hidden sm:inline opacity-60">
                   Ctrl+L
                 </span>
               </div>
             )}
             {/* Translation loading/error indicator */}
             {isTranslating && (
               <div className="flex items-center gap-1.5 px-2 py-1 bg-accent/10 rounded-full">
                 <Loader2 className="w-3 h-3 animate-spin text-accent" />
                 <span className="text-[10px] text-accent font-medium hidden sm:inline">{t.blogTranslating}</span>
               </div>
             )}
             {showTranslationError && (
               <div className="flex items-center gap-1.5 px-2 py-1 bg-red-50 rounded-full">
                 <AlertTriangle className="w-3 h-3 text-red-500" />
                 <button
                   onClick={retryTranslation}
                   className="text-[10px] text-red-600 font-medium hover:underline"
                 >
                   {t.blogRetryTranslation}
                 </button>
               </div>
             )}
             <button onClick={shareBlog} className="p-2 hover:bg-gray-50 rounded-full transition-colors" title={language === 'zh' ? '分享' : 'Share'}>
               <Share2 className="w-4 h-4 sm:w-5 sm:h-5 text-muted" />
             </button>
             <Link href="/dashboard" className="medium-button-primary text-xs sm:text-sm py-1 sm:py-1.5 px-2 sm:px-4 hidden md:block">
               {t.footerDashboard}
             </Link>
          </div>
        </div>
      </header>

      <main className="max-w-screen-xl mx-auto px-4 py-8 sm:py-16">
        <article className="max-w-[720px] mx-auto">
          {/* Cover Image */}
          {blog.coverImage && (
            <div className="mb-8 sm:mb-12 rounded-2xl overflow-hidden shadow-xl border border-gray-100">
              <Image
                src={blog.coverImage}
                alt={blog.title}
                width={720}
                height={400}
                className="w-full h-auto object-cover max-h-[300px] sm:max-h-[400px]"
                priority
              />
            </div>
          )}

          {/* Author Meta */}
          <div className="flex items-center gap-3 sm:gap-4 mb-6 sm:mb-10 overflow-hidden">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-100 rounded-full flex items-center justify-center shrink-0">
               {blog.knowledgeSource?.sourceType === 'GITHUB' ? (
                 <Github className="w-5 h-5 sm:w-6 sm:h-6 text-gray-900" />
               ) : blog.knowledgeSource?.sourceType === 'WEB' ? (
                 <Globe className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" />
               ) : (
                 <Youtube className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
               )}
            </div>
            <div className="flex flex-col min-w-0">
               <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                 <span className="font-bold truncate max-w-[150px] sm:max-w-none">
                   {blog.video?.channel?.name || (blog.knowledgeSource?.sourceType === 'GITHUB' ? 'GitHub' : blog.knowledgeSource?.sourceType === 'WEB' ? 'Web' : 'YouTube')}
                 </span>
                 <span className="shrink-0">·</span>
                 <span className="text-muted shrink-0">{formatDate(blog.publishedAt)}</span>
               </div>
               <p className="text-[10px] sm:text-xs text-muted mt-0.5">{t.aiAssistantProductivity}</p>
            </div>
          </div>

          {/* Title */}
            <div className="relative">
              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-serif font-bold text-[#191919] leading-tight mb-6 sm:mb-8">
                {isTranslating ? (
                  <span className="opacity-50">{t.blogTranslating}</span>
                ) : (
                  getDisplayTitle()
                )}
              </h1>
              {translatedContent && !isTranslating && !showTranslationError && (
                <div className="absolute -top-6 right-0 flex items-center gap-1.5 px-2 py-1 bg-emerald-50 rounded-full">
                  <Languages className="w-3 h-3 text-emerald-600" />
                  <span className="text-[10px] text-emerald-700 font-medium">{t.blogTranslated}</span>
                </div>
              )}
            </div>

          {/* Version Info for GitHub */}
          {blog.knowledgeSource?.sourceType === 'GITHUB' && blog.knowledgeSource.processedContent && (
            (() => {
              try {
                const parsed = JSON.parse(blog.knowledgeSource.processedContent)
                const latestRelease = parsed.releases?.[0]
                if (latestRelease) {
                  return (
                    <div className="mb-8 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center justify-between group hover:bg-emerald-100/50 transition-all duration-300">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
                           <Bookmark className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                             <span className="text-sm font-black text-emerald-800 uppercase tracking-wider">{t.latestVersion}</span>
                             <span className="px-2 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full animate-pulse">LIVE</span>
                          </div>
                          <p className="text-emerald-700 font-bold text-lg">
                            {latestRelease.tag_name} 
                            <span className="mx-2 text-emerald-300 font-normal">|</span>
                            {latestRelease.name || t.officialRelease}
                          </p>
                        </div>
                      </div>
                      <div className="text-right hidden sm:block">
                        <p className="text-[10px] text-emerald-600 font-black uppercase tracking-widest mb-1">{t.publishedAtLabel}</p>
                        <p className="text-sm text-emerald-700 font-medium">
                          {formatDate(latestRelease.published_at)}
                        </p>
                      </div>
                    </div>
                  )
                }
              } catch (e) {
                return null
              }
              return null
            })()
          )}

          {/* Action Bar */}
          <div className="flex items-center gap-3 sm:gap-6 border-y border-gray-100 py-3 sm:py-4 mb-8 sm:mb-12 text-muted">
             <div className="flex items-center gap-2 text-xs sm:text-sm hover:text-black cursor-pointer">
                <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>0</span>
             </div>
             <div className="flex-1" />
             <button
               onClick={() => {
                 if (confirm(t.confirmRegenerate)) {
                   setLoading(true)
                   const toast = document.createElement('div')
                   toast.id = 'update-toast'
                   toast.className = 'fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#191919] text-white px-6 py-3 rounded-full shadow-2xl z-[100] flex items-center gap-3 animate-pulse'
                   toast.innerHTML = `<div class="w-2 h-2 bg-accent rounded-full animate-ping"></div><span class="text-sm font-medium">${t.aiRegenerating}</span>`
                   document.body.appendChild(toast)

                   fetch('/api/blogs', {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({ videoId: blog.videoId, forceRegenerate: true })
                   })
                   .then(async (res) => {
                     const data = await res.json()
                     if (res.ok && data.slug) {
                       window.location.href = `/blogs/${data.slug}?updated=true`
                     } else {
                       throw new Error(data.error || (language === 'zh' ? '更新失败' : 'Update failed'))
                     }
                   })
                   .catch((err) => {
                     setLoading(false)
                     document.getElementById('update-toast')?.remove()
                     setError(err.message || (language === 'zh' ? '网络请求超时或服务端繁忙' : 'Network timeout or server busy'))
                     setShowErrorToast(true)
                   })
                 }
               }}
               disabled={loading}
               className={`flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium px-2 sm:px-4 py-1.5 rounded-full transition-all ${loading ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'hover:text-accent hover:bg-accent/5 text-muted'}`}
               title={t.regenerateBlog}
             >
               {loading ? (
                 <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 animate-spin" />
               ) : (
                 <RefreshCw className="w-3 h-3 sm:w-4 sm:h-4 text-accent" />
               )}
               <span className="hidden sm:inline">{loading ? t.regenerating : t.regenerateBlog}</span>
               {loading && <span className="sm:hidden">...</span>}
             </button>
              <Bookmark className="w-4 h-4 sm:w-5 sm:h-5 hover:text-black cursor-pointer" />
             <div className="relative">
               <button
                 onClick={() => setShowMenu(!showMenu)}
                 className="p-1 hover:bg-gray-50 rounded-full transition-colors"
               >
                 <MoreHorizontal className="w-4 h-4 sm:w-5 sm:h-5 text-muted hover:text-black" />
               </button>

               {showMenu && (
                 <>
                   <div
                     className="fixed inset-0 z-[60]"
                     onClick={() => setShowMenu(false)}
                   />
                   <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-2xl border border-gray-100 py-2 z-[70] animate-in fade-in zoom-in duration-200 origin-top-right">
                     <button
                       onClick={() => {
                         setShowMenu(false)
                         deleteBlog()
                       }}
                       className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-3 transition-colors"
                     >
                       <Trash2 className="w-4 h-4" />
                       <span>{t.deleteArticle}</span>
                     </button>
                   </div>
                 </>
               )}
             </div>
           </div>

          {/* Translation Error Banner */}
          {showTranslationError && (
            <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-700 font-medium">{t.blogTranslationFailed}</p>
                <p className="text-xs text-red-600 mt-1">{translationError}</p>
              </div>
              <button
                onClick={retryTranslation}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-700 text-xs font-medium rounded-full transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                {t.blogRetryTranslation}
              </button>
            </div>
          )}

          {/* Content */}
          <div className="markdown-content prose prose-stone max-w-none
            prose-headings:font-serif prose-headings:font-bold
            prose-h2:text-xl sm:text-2xl prose-h2:mt-12 sm:mt-16 prose-h2:mb-4 sm:mb-8 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-100 prose-h2:flex prose-h2:items-center prose-h2:gap-3
            prose-h2:before:content-[''] prose-h2:before:w-1 prose-h2:before:h-5 sm:before:h-6 prose-h2:before:bg-accent prose-h2:before:rounded-full
            prose-h3:text-lg sm:text-xl prose-h3:mt-8 sm:mt-10 prose-h3:mb-3 sm:mb-4 prose-h3:text-[#333]
            prose-p:leading-relaxed prose-p:text-[#292929] prose-p:text-base sm:text-lg prose-p:mb-4 sm:prose-p:mb-6
            prose-strong:text-black prose-strong:font-bold
            prose-code:text-sm sm:prose-code:text-base
            prose-pre:p-4 sm:prose-pre:p-8">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '')
                  const value = String(children).replace(/\n$/, '')
                  const isMermaid = !inline && className === 'language-mermaid'
                  const { copied, mermaidSvg, handleCopy } = useCodeBlock(value, isMermaid)

                  if (isMermaid) {
                    return (
                      <div className="my-10 flex flex-col items-center w-full">
                        <div
                          className="w-full overflow-x-auto p-8 bg-white rounded-[32px] border border-slate-100 shadow-lg shadow-slate-200/40 min-h-[300px] flex justify-center"
                          dangerouslySetInnerHTML={{ __html: mermaidSvg || '<div class="animate-pulse flex items-center gap-2 text-slate-400 font-black tracking-widest text-xs uppercase"><div class="w-2 h-2 bg-accent rounded-full animate-ping"></div> Rendering Architecture...</div>' }}
                        />
                        <div className="mt-6 flex items-center gap-3">
                           <div className="h-px w-10 bg-slate-100" />
                           <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t.techDiagram}</span>
                           <div className="h-px w-10 bg-slate-100" />
                        </div>
                      </div>
                    )
                  }

                  if (!inline) {
                    return (
                      <div className="my-8 relative group">
                        <div className="absolute top-0 right-0 p-3 flex items-center gap-2 z-10">
                          <span className="text-[10px] uppercase font-black text-slate-400 group-hover:text-accent transition-colors tracking-[0.2em]">
                            {match ? match[1] : 'code'}
                          </span>
                          <button 
                            onClick={handleCopy}
                            className="p-1.5 rounded-lg bg-white border border-slate-200 hover:border-accent hover:text-accent transition-all text-slate-400 shadow-sm"
                            title={t.copyCode}
                          >
                            {copied ? <div className="text-[10px] text-green-500 font-black tracking-widest uppercase px-1">{t.copied}</div> : <Share2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <pre className="bg-white p-8 rounded-[32px] overflow-x-auto leading-relaxed font-mono text-sm border border-purple-100 shadow-xl shadow-purple-50/50">
                          <code className={`${className} !text-purple-600 font-medium`} {...props}>
                            {children}
                          </code>
                        </pre>
                      </div>
                    )
                  }
                  
                  return (
                    <code className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg text-sm font-bold border border-purple-100/50" {...props}>
                      {children}
                    </code>
                  )
                }
              }}
            >
              {getContent(blog.content)}
            </ReactMarkdown>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-2 sm:gap-3 mt-12 sm:mt-20 mb-10 sm:mb-16">
            {blog.tags && blog.tags.split(',').map(tag => (
              <span key={tag} className="px-3 sm:px-5 py-2 sm:py-2.5 bg-gray-50 rounded-full text-xs sm:text-sm text-[#191919] hover:bg-gray-100 transition-colors cursor-pointer border border-gray-100">
                {tag.trim()}
              </span>
            ))}
          </div>

          {/* Bottom CTA - Different based on source type */}
          {blog.sourceUrl && (
            <div className="mt-10 sm:mt-16 pt-6 sm:pt-10 border-t border-gray-100 text-center md:text-left">
              {blog.knowledgeSource?.sourceType === 'GITHUB' ? (
                <a
                  href={blog.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 sm:gap-3 text-muted hover:text-accent font-medium group transition-all text-sm sm:text-base"
                >
                  <Github className="w-5 h-5 sm:w-6 sm:h-6" />
                  <span className="border-b border-transparent group-hover:border-accent">{t.visitGithub}</span>
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                </a>
              ) : blog.knowledgeSource?.sourceType === 'WEB' ? (
                <a
                  href={blog.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 sm:gap-3 text-muted hover:text-accent font-medium group transition-all text-sm sm:text-base"
                >
                  <Globe className="w-5 h-5 sm:w-6 sm:h-6 text-blue-500" />
                  <span className="border-b border-transparent group-hover:border-accent">{t.visitWeb}</span>
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                </a>
              ) : (
                <a
                  href={blog.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 sm:gap-3 text-muted hover:text-accent font-medium group transition-all text-sm sm:text-base"
                >
                  <Youtube className="w-5 h-5 sm:w-6 sm:h-6 text-red-600" />
                  <span className="border-b border-transparent group-hover:border-accent">{t.visitYoutube}</span>
                  <ExternalLink className="w-3 h-3 sm:w-4 sm:h-4" />
                </a>
              )}
            </div>
          )}
        </article>
      </main>

      {/* Modern Footer */}
      <footer className="border-t border-gray-100 py-12 sm:py-20 bg-white">
        <div className="max-w-[720px] mx-auto px-4 flex flex-col items-center text-center">
            <Link href="/" className="font-serif text-xl sm:text-2xl font-bold mb-4 sm:mb-6">{t.youtubeKnowledgeBase}</Link>
            <p className="text-muted text-sm sm:text-lg mb-6 sm:mb-8 leading-relaxed max-w-[500px] px-4">
               {t.footerDesc}
            </p>
            <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-8 text-xs sm:text-sm text-muted font-medium px-4">
               <Link href="/blogs" className="hover:text-black transition-colors">{t.footerArticles}</Link>
               <Link href="/dashboard" className="hover:text-black transition-colors">{t.footerDashboard}</Link>
               <span className="hover:text-black transition-colors cursor-pointer">{t.footerAbout}</span>
            </div>
            <div className="mt-8 sm:mt-12 text-[10px] sm:text-xs text-gray-300 uppercase tracking-widest">
               © 2026 YT Knowledge Base. Crafted for Elegance.
            </div>
        </div>
      </footer>
    </div>
  )
}
