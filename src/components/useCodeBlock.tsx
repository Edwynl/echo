import { useState, useEffect, useCallback } from 'react'

// Custom hook for code block state (mermaid + copy)
export function useCodeBlock(value: string, isMermaid: boolean) {
  const [copied, setCopied] = useState(false)
  const [mermaidSvg, setMermaidSvg] = useState<string | null>(null)

  useEffect(() => {
    if (isMermaid) {
      const renderMermaid = async () => {
        try {
          const mermaidLib = (await import('mermaid')).default
          mermaidLib.initialize({
            startOnLoad: false,
            theme: 'neutral',
            securityLevel: 'loose',
            fontFamily: 'inherit',
            htmlLabels: false,
          })
          const id = `mermaid-${Math.random().toString(36).substr(2, 9)}`
          const { svg } = await mermaidLib.render(id, value)
          setMermaidSvg(svg)
        } catch {
          // Silently handle mermaid errors
        }
      }
      renderMermaid()
    }
  }, [isMermaid, value])

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [value])

  return { copied, mermaidSvg, handleCopy }
}
