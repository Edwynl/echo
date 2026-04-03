'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { zh } from './locales/zh'
import { en } from './locales/en'

export type Language = 'zh' | 'en'

// Re-export translations so existing consumers work without import changes
export type Translations = typeof zh

const translations: Record<Language, Translations> = { zh, en }

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: Translations
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>('zh')

  useEffect(() => {
    const saved = localStorage.getItem('language') as Language
    if (saved && (saved === 'zh' || saved === 'en')) {
      setLanguage(saved)
    }
  }, [])

  const handleSetLanguage = (lang: Language) => {
    setLanguage(lang)
    localStorage.setItem('language', lang)
  }

  return (
    <I18nContext.Provider value={{ language, setLanguage: handleSetLanguage, t: translations[language] }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
