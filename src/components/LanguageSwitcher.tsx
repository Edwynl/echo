'use client'

import { useEffect, useCallback } from 'react'
import { Globe } from 'lucide-react'
import { useI18n } from '@/lib/i18n'

interface LanguageSwitcherProps {
  variant?: 'compact' | 'full' | 'pill'
  showIcon?: boolean
  className?: string
  onLanguageChange?: (lang: 'zh' | 'en') => void
}

export default function LanguageSwitcher({
  variant = 'pill',
  showIcon = true,
  className = '',
  onLanguageChange
}: LanguageSwitcherProps) {
  const { language, setLanguage, t } = useI18n()

  const toggleLanguage = useCallback(() => {
    const newLang = language === 'zh' ? 'en' : 'zh'
    setLanguage(newLang)
    onLanguageChange?.(newLang)
  }, [language, setLanguage, onLanguageChange])

  // Keyboard shortcut: Ctrl+L or Cmd+L
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault()
        toggleLanguage()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleLanguage])

  if (variant === 'compact') {
    return (
      <button
        onClick={toggleLanguage}
        className={`flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-lg
          bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-900
          transition-all duration-200 ${className}`}
        title={`${t.switchLanguage} (Ctrl+L)`}
      >
        {showIcon && <Globe className="w-3.5 h-3.5" />}
        <span className="uppercase">{language === 'zh' ? 'EN' : '中'}</span>
      </button>
    )
  }

  if (variant === 'full') {
    return (
      <button
        onClick={toggleLanguage}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full
          bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-900
          transition-all duration-200 ${className}`}
        title={`${t.switchLanguage} (Ctrl+L)`}
      >
        {showIcon && <Globe className="w-4 h-4" />}
        <span>{language === 'zh' ? 'English' : '中文'}</span>
        <span className="ml-1 px-1.5 py-0.5 bg-white/80 rounded text-[10px] font-bold uppercase">
          {language}
        </span>
      </button>
    )
  }

  // Default: pill variant (like the blog detail page)
  return (
    <div
      className={`flex items-center bg-gray-100 rounded-full p-0.5 border border-gray-200
        transition-all duration-300 ${className}`}
    >
      {showIcon && (
        <Globe className="w-3.5 h-3.5 ml-2 mr-1 text-gray-500" />
      )}
      <button
        onClick={() => {
          setLanguage('zh')
          onLanguageChange?.('zh')
        }}
        className={`px-2 sm:px-3 py-1 text-xs font-bold rounded-full transition-all duration-200
          ${language === 'zh'
            ? 'bg-white shadow-sm text-black'
            : 'text-gray-500 hover:text-black'
          }`}
        title={language === 'en' ? '切换到中文' : 'Switch to Chinese'}
      >
        中
      </button>
      <button
        onClick={() => {
          setLanguage('en')
          onLanguageChange?.('en')
        }}
        className={`px-2 sm:px-3 py-1 text-xs font-bold rounded-full transition-all duration-200
          ${language === 'en'
            ? 'bg-white shadow-sm text-black'
            : 'text-gray-500 hover:text-black'
          }`}
        title={language === 'zh' ? 'Switch to English' : '切换到英文'}
      >
        EN
      </button>
      <span className="text-[10px] text-gray-400 mr-2 hidden sm:block">
        Ctrl+L
      </span>
    </div>
  )
}

// Hook for managing language preference with keyboard shortcuts
export function useLanguageShortcut() {
  const { language, setLanguage } = useI18n()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
        e.preventDefault()
        setLanguage(language === 'zh' ? 'en' : 'zh')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [language, setLanguage])
}
