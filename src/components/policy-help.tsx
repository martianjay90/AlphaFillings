"use client"

import { useState, useRef, useEffect } from 'react'
import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface PolicyHelpProps {
  /** 정책 제목 (예: "CAPEX: PPE_ONLY") */
  title: string
  /** 설명 문구 배열 */
  lines: string[]
  /** 추가 클래스명 */
  className?: string
}

/**
 * 정책 설명 도움말 컴포넌트
 * ? 아이콘 클릭 시 설명 팝오버 표시
 */
export function PolicyHelp({ title, lines, className }: PolicyHelpProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    // ESC 키로 닫기
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  return (
    <div className={cn("inline-flex items-center relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center justify-center w-4 h-4 ml-1 rounded-full hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary transition-colors"
        aria-label={`${title} 설명 보기`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
      </button>

      {isOpen && (
        <>
          {/* 백드롭 (모바일 대응) */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div
            ref={containerRef}
            role="dialog"
            aria-labelledby="policy-help-title"
            className="absolute bottom-full left-0 mb-2 z-50 w-64 p-3 bg-popover border border-border rounded-md shadow-lg text-xs"
            style={{ minWidth: '16rem', maxWidth: '20rem' }}
          >
            <div id="policy-help-title" className="font-semibold mb-2 text-sm text-foreground">
              {title}
            </div>
            <ul className="space-y-1.5 text-muted-foreground">
              {lines.map((line, index) => (
                <li key={index} className="leading-relaxed">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
