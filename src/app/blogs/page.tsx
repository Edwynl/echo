'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Search, Loader2, Globe, Youtube, RefreshCw, Github, FolderOpen, AlertCircle, X, ChevronDown, Languages, BookOpen, Database, Zap, FileText } from 'lucide-react'
import { formatDate, truncate, cleanExcerpt, decodeHtmlEntities } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'
import { BlogListSkeleton } from '@/components/Skeleton'
import LanguageSwitcher from '@/components/LanguageSwitcher'

interface Blog {
  id: string
  title: string
  slug: string
  excerpt: string
  content?: string
  coverImage: string
  publishedAt: string
  tags: string
  knowledgeSourceId: string | null
  knowledgeSource: {
    id: string
    sourceType: string
    title: string
    sourceUrl: string
  } | null
  video: {
    id: string
    channel: {
      id: string
      name: string
      thumbnail: string
    }
  }
}

interface Channel {
  id: string
  name: string
  thumbnail: string
}

interface KnowledgeSource {
  id: string
  sourceType: string
  title: string
  sourceUrl: string
}

// Inner component that reads search params — must be wrapped in Suspense
function BlogListContent() {
  const { t, language, setLanguage } = useI18n()
  const isEnglish = language === 'en'
  const searchParams = useSearchParams()
  const router = useRouter()
  const channelId = searchParams?.get('channelId') || null
  const sourceId = searchParams?.get('sourceId') || null
  const languageFilterParam = searchParams?.get('language') || 'all'

  const [blogs, setBlogs] = useState<Blog[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [currentChannel, setCurrentChannel] = useState<Channel | null>(null)
  const [currentSource, setCurrentSource] = useState<KnowledgeSource | null>(null)
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set())
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [showErrorToast, setShowErrorToast] = useState(false)
  const [languageFilter, setLanguageFilter] = useState<'all' | 'zh' | 'en'>(
    languageFilterParam === 'zh' || languageFilterParam === 'en' ? languageFilterParam : 'all'
  )
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)

  // Debounce search input to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    fetchBlogs()
    if (channelId) {
      fetchChannelInfo()
    }
  }, [page, channelId, sourceId, search, languageFilter])

  // Reset page when search or filter changes
  useEffect(() => {
    setPage(1)
  }, [search, channelId, sourceId, languageFilter])

  const fetchChannelInfo = async () => {
    try {
      const res = await fetch('/api/channels')
      const channels = await res.json()
      const channel = channels.find((ch: Channel) => ch.id === channelId)
      if (channel) {
        setCurrentChannel(channel)
      }
    } catch (err) {
      console.error('Error fetching channel:', err)
    }
  }

  const fetchSourceInfo = async () => {
    try {
      const res = await fetch('/api/sources')
      const data = await res.json()
      const sources = data.sources || []
      const source = sources.find((s: KnowledgeSource) => s.id === sourceId)
      if (source) {
        setCurrentSource(source)
      }
    } catch (err) {
      console.error('Error fetching source:', err)
    }
  }

  const fetchBlogs = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      let url = `/api/blogs?status=published&page=${page}&limit=12`
      if (channelId) {
        url += `&channelId=${channelId}`
      }
      if (sourceId) {
        url += `&knowledgeSourceId=${sourceId}`
      }
      if (debouncedSearch) {
        url += `&search=${encodeURIComponent(debouncedSearch)}`
      }
      if (languageFilter !== 'all') {
        url += `&language=${languageFilter}`
      }
      const res = await fetch(url)

      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`)
      }

      const data = await res.json()
      setBlogs(data.blogs || [])
      setTotalPages(data.pagination?.pages || 1)
    } catch (err: any) {
      console.error('Error fetching blogs:', err)
      setErrorMessage(err.message || t.systemError)
      setShowErrorToast(true)
      setTimeout(() => setShowErrorToast(false), 5000)
    } finally {
      setLoading(false)
    }
  }

  // Fetch source info when sourceId changes
  useEffect(() => {
    if (sourceId) {
      fetchSourceInfo()
    }
  }, [sourceId])





  const updateBlog = async (videoId: string, blogId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (updatingIds.has(blogId)) return

    // Add to updating set
    setUpdatingIds(prev => new Set(prev).add(blogId))
    setErrorMessage('')

    try {
      const res = await fetch('/api/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, forceRegenerate: true })
      })

      const data = await res.json()

      if (res.ok) {
        // Refresh the list to show new content/excerpt
        await fetchBlogs()
      } else {
        // More detailed error handling
        let errorMsg = data.error || t.systemError
        if (res.status === 429) {
          errorMsg = language === 'zh'
            ? '请求过于频繁，请稍后再试'
            : 'Too many requests, please try again later'
        } else if (res.status === 500) {
          errorMsg = language === 'zh'
            ? '服务器内部错误，请稍后再试'
            : 'Server error, please try again later'
        }
        setErrorMessage(errorMsg)
        setShowErrorToast(true)
        setTimeout(() => setShowErrorToast(false), 5000)
      }
    } catch (err: any) {
      console.error('Error updating blog:', err)
      const errorMsg = language === 'zh'
        ? `网络错误: ${err.message || '请检查网络连接'}`
        : `Network error: ${err.message || 'Please check your connection'}`
      setErrorMessage(errorMsg)
      setShowErrorToast(true)
      setTimeout(() => setShowErrorToast(false), 5000)
    } finally {
      // Remove from updating set
      setUpdatingIds(prev => {
        const next = new Set(prev)
        next.delete(blogId)
        return next
      })
    }
  }

  const clearChannelFilter = () => {
    router.push('/blogs')
  }

  const clearSourceFilter = () => {
    router.push('/blogs')
  }

  const handleLanguageFilterChange = (newFilter: 'all' | 'zh' | 'en') => {
    setLanguageFilter(newFilter)
    setShowLanguageDropdown(false)

    // Update URL with language parameter
    const currentParams = new URLSearchParams()
    if (channelId) currentParams.set('channelId', channelId)
    if (sourceId) currentParams.set('sourceId', sourceId)
    if (search) currentParams.set('search', search)
    if (newFilter !== 'all') currentParams.set('language', newFilter)

    const queryString = currentParams.toString()
    router.push(`/blogs${queryString ? `?${queryString}` : ''}`)
  }

  const clearLanguageFilter = () => {
    handleLanguageFilterChange('all')
  }

  const displayBlogs = blogs

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-serif text-2xl font-bold tracking-tight">
              Echo
            </Link>
            <div className="hidden md:flex items-center relative">
              <Search className="absolute left-3 w-4 h-4 text-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="pl-10 pr-4 py-1.5 bg-gray-50 border-none rounded-full text-sm focus:ring-1 focus:ring-gray-200 w-64 transition-all"
              />
            </div>
          </div>
          <div className="flex items-center gap-4">

             <Link href="/dashboard" className="text-sm text-muted hover:text-black transition-colors">
               {t.dashboard}
             </Link>
             <Link href="/dashboard" className="medium-button-primary text-sm py-1.5">
               {t.syncVideos}
             </Link>

             <LanguageSwitcher variant="compact" />
          </div>
        </div>
      </header>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white/90 backdrop-blur-2xl border-t border-slate-100 pb-safe">
        <div className="flex items-center justify-around h-20 px-4">
          <Link href="/" className="flex flex-col items-center gap-1.5 px-3">
            <div className="p-2 rounded-2xl bg-slate-50 text-slate-400">
              <BookOpen className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 tracking-tighter uppercase">{t.knowledgeBase || (isEnglish ? 'Knowledge' : '知识库')}</span>
          </Link>
          <Link href="/sources" className="flex flex-col items-center gap-1.5 px-3">
            <div className="p-2 rounded-2xl bg-slate-50 text-slate-400">
              <Database className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 tracking-tighter uppercase">{t.sources || (isEnglish ? 'Sources' : '来源库')}</span>
          </Link>
          <Link href="/dashboard" className="flex flex-col items-center gap-1.5 -translate-y-4 px-3">
            <div className="w-16 h-16 rounded-full bg-accent text-white shadow-2xl shadow-accent/30 flex items-center justify-center border-4 border-white transition-transform active:scale-90">
              <Zap className="w-7 h-7" />
            </div>
            <span className="text-[10px] font-black text-accent tracking-tighter uppercase -mt-1">{t.dashboard || (isEnglish ? 'Dashboard' : '控制台')}</span>
          </Link>
          <Link href="/blogs" className="flex flex-col items-center gap-1.5 px-3">
            <div className="p-2 rounded-2xl bg-accent/10 text-accent">
              <FileText className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-accent tracking-tighter uppercase">{t.viewBlogs || (isEnglish ? 'Blogs' : '博文')}</span>
          </Link>
          <button 
            onClick={() => {
               const input = document.querySelector('input[type="text"]') as HTMLInputElement;
               if (input) input.focus();
            }}
            className="flex flex-col items-center gap-1.5 px-3"
          >
            <div className="p-2 rounded-2xl bg-slate-50 text-slate-400">
              <Search className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-slate-400 tracking-tighter uppercase">{isEnglish ? 'Search' : '搜索'}</span>
          </button>
        </div>
      </div>

      {/* Filter Banner - Channel or Source */}
      {(currentChannel || currentSource) && (
        <div className="bg-gray-50 border-b border-gray-100 py-3 px-4">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <span className="text-sm text-muted">{t.filteredBy}</span>

            {/* Channel Filter */}
            {currentChannel && (
              <>
                {currentChannel.thumbnail ? (
                  <div className="relative w-6 h-6 rounded-full overflow-hidden bg-slate-800 flex items-center justify-center text-white font-bold text-xs">
                    <span>{currentChannel.name.charAt(0).toUpperCase()}</span>
                    <img 
                      src={currentChannel.thumbnail} 
                      alt={currentChannel.name} 
                      className="absolute inset-0 w-full h-full object-cover z-10" 
                      onError={(e) => { e.currentTarget.style.display = 'none' }}
                    />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center">
                    <Youtube className="w-3 h-3 text-muted" />
                  </div>
                )}
                <span className="text-sm font-medium">{currentChannel.name}</span>
                <button
                  onClick={clearChannelFilter}
                  className="text-xs text-accent hover:underline"
                >
                  {t.clearFilter}
                </button>
              </>
            )}

            {/* Source Filter (GitHub/Web) */}
            {currentSource && (
              <>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${
                  currentSource.sourceType === 'GITHUB' ? 'bg-gray-900' : 'bg-blue-500'
                }`}>
                  {currentSource.sourceType === 'GITHUB' ? (
                    <Github className="w-3 h-3 text-white" />
                  ) : (
                    <Globe className="w-3 h-3 text-white" />
                  )}
                </div>
                <span className="text-sm font-medium">{currentSource.title}</span>
                <span className="text-xs text-muted">
                  {currentSource.sourceType === 'GITHUB' ? 'GitHub' : 'Web'}
                </span>
                <button
                  onClick={clearSourceFilter}
                  className="text-xs text-accent hover:underline"
                >
                  {t.clearFilter}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <main className="max-w-[1192px] mx-auto px-4 py-12">
        {/* Page Title & Filter Bar */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 border-b border-gray-100 pb-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-[#191919] mb-4 uppercase tracking-tighter italic">
              {currentChannel ? currentChannel.name : currentSource ? currentSource.title : t.allContent}
            </h1>
            <p className="text-muted text-lg max-w-2xl font-serif">
              {currentChannel ? t.channelDesc : currentSource ? t.sourceDesc : t.blogDesc}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mr-1">{t.filterByLanguage}</span>
            <div className="relative">
              <button
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl transition-all border
                  ${languageFilter !== 'all'
                    ? 'bg-accent/5 text-accent border-accent/20'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200 shadow-sm'
                  }`}
              >
                <Languages className="w-4 h-4" />
                <span>
                  {languageFilter === 'all' ? t.allLanguages : languageFilter === 'zh' ? t.chineseOnly : t.englishOnly}
                </span>
                <ChevronDown className={`w-3 h-3 transition-transform ${showLanguageDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showLanguageDropdown && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowLanguageDropdown(false)} />
                  <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-1.5 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                    <button
                      onClick={() => handleLanguageFilterChange('all')}
                      className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors ${
                        languageFilter === 'all' ? 'bg-accent/5 text-accent font-semibold' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <Globe className="w-4 h-4" />
                      {t.allLanguages}
                    </button>
                    <button
                      onClick={() => handleLanguageFilterChange('zh')}
                      className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors ${
                        languageFilter === 'zh' ? 'bg-accent/5 text-accent font-semibold' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-4 text-center text-xs font-bold">中</span>
                      {t.chineseOnly}
                    </button>
                    <button
                      onClick={() => handleLanguageFilterChange('en')}
                      className={`w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors ${
                        languageFilter === 'en' ? 'bg-accent/5 text-accent font-semibold' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="w-4 text-center text-xs font-bold">EN</span>
                      {t.englishOnly}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-20">
          {/* Main Feed */}
          <div>
            {/* Error Display */}
            {showErrorToast && errorMessage && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm text-red-700 font-medium">{errorMessage}</p>
                  <p className="text-xs text-red-600 mt-1">
                    {language === 'zh'
                      ? '建议：检查网络连接或刷新页面重试'
                      : 'Suggestion: Check your connection or refresh the page'}
                  </p>
                </div>
                <button
                  onClick={() => setShowErrorToast(false)}
                  className="text-red-400 hover:text-red-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {loading ? (
              <BlogListSkeleton count={5} />
            ) : displayBlogs.length === 0 ? (
              <div className="text-center py-20">
                <p className="text-muted text-lg font-serif">{t.noBlogsFound}</p>
                <Link href="/dashboard" className="text-accent hover:underline mt-2 inline-block">
                  {t.goToSync}
                </Link>
              </div>
            ) : (
              <div className="flex flex-col">
                {displayBlogs.map((blog) => (
                  <div
                    key={blog.id}
                    className="group relative border-b border-gray-100 py-6 md:py-10 first:pt-0 active:bg-gray-50 transition-colors"
                  >
                    <Link
                      href={`/blogs/${blog.slug}`}
                      className="block w-full h-full"
                    >
                      <div className="flex justify-between gap-4 md:gap-12">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <h2 className="font-serif font-bold text-xl md:text-2xl text-[#191919] group-hover:text-accent transition-colors line-clamp-2 leading-tight">
                              {decodeHtmlEntities(blog.title)}
                            </h2>
                            {/* Language Indicator Badge */}
                            {blog.content && blog.content.includes('---ENGLISH_SECTION---') && (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold rounded-full uppercase tracking-wide">
                                中英
                              </span>
                            )}
                          </div>

                          <p className="text-[#757575] font-serif text-base mb-4 line-clamp-2 hidden md:block">
                            {truncate(cleanExcerpt(blog.excerpt || ''), 160)}
                          </p>

                          <div className="flex items-center gap-3 text-xs text-muted">
                            <span>{formatDate(blog.publishedAt)}</span>
                            {blog.video?.channel?.name && (
                              <>
                                <span>·</span>
                                <span className="font-bold text-gray-500 uppercase tracking-tight">{blog.video.channel.name}</span>
                              </>
                            )}
                          </div>
                        </div>

                        {blog.coverImage && (
                          <div className="flex flex-col items-center gap-3 w-24 md:w-40 flex-shrink-0">
                            <div className="w-full h-24 md:h-28">
                              <img
                                src={blog.coverImage}
                                alt={blog.title}
                                className="w-full h-full object-cover rounded-xl shadow-sm"
                              />
                            </div>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                updateBlog(blog.video.id, blog.id, e);
                              }}
                              className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-full text-xs font-bold transition-all w-full
                                ${updatingIds.has(blog.id) 
                                  ? 'bg-gray-100 text-muted cursor-not-allowed' 
                                  : 'bg-accent/5 text-accent hover:bg-accent hover:text-white border border-accent/10 active:scale-95'
                                }`}
                              disabled={updatingIds.has(blog.id)}
                            >
                                {updatingIds.has(blog.id) ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                {t.update}
                              </button>
                          </div>
                        )}
                      </div>
                    </Link>
                  </div>
                ))}

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-4 mt-12 mb-16 px-4">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="flex-1 sm:flex-initial px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold shadow-sm disabled:opacity-30 active:scale-95 transition-all text-slate-600"
                    >
                      {isEnglish ? 'Prev' : '上一页'}
                    </button>
                    <span className="text-xs font-black text-slate-400 whitespace-nowrap">
                       {page} / {totalPages}
                    </span>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="flex-1 sm:flex-initial px-6 py-2.5 bg-accent text-white rounded-xl text-xs font-bold shadow-lg shadow-accent/20 disabled:opacity-30 active:scale-95 transition-all"
                    >
                      {isEnglish ? 'Next' : '下一页'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block">
            <div className="sticky top-24">
              <h3 className="text-sm font-bold uppercase tracking-widest mb-6 border-b border-gray-100 pb-2">
                {t.aiSoftware}
              </h3>
              <div className="flex flex-wrap gap-2 mb-10">
                {['claude code', 'NotebookLM', 'Antigravity', 'claude skills', 'Openclaw', 'Gemini', 'Minimax', 'Ollama', 'Claude'].map(tag => (
                  <button 
                    key={tag} 
                    onClick={() => setSearch(tag)}
                    className={`px-4 py-2 rounded-full text-sm transition-colors ${
                      search.toLowerCase() === tag.toLowerCase() 
                        ? 'bg-[#191919] text-white' 
                        : 'bg-gray-50 hover:bg-gray-100 text-[#191919]'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
                {search && (
                  <button 
                    onClick={() => setSearch('')}
                    className="px-4 py-2 border border-gray-100 hover:bg-gray-50 rounded-full text-sm text-accent transition-colors"
                  >
                    {t.clearFilter}
                  </button>
                )}
              </div>

              <div className="p-6 bg-gray-50 rounded-lg">
                 <h4 className="font-serif font-bold text-lg mb-2 text-[#191919]">
                   {t.discoverMore}
                 </h4>
                 <p className="text-sm text-muted mb-4">
                   {t.subscribeNewsletter}
                 </p>
                 <button className="medium-button-primary w-full text-sm">
                   {t.subscribeNow}
                 </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

// Wrap in Suspense to prevent crashes from useSearchParams in production
export default function BlogList() {
  return (
    <Suspense fallback={<BlogListSkeleton />}>
      <BlogListContent />
    </Suspense>
  )
}
