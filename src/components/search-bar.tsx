"use client"

import { useState } from 'react'
import { Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

interface SearchBarProps {
  onSearch: (query: string) => void
  isLoading?: boolean
  placeholder?: string
  className?: string
}

export function SearchBar({ 
  onSearch, 
  isLoading = false,
  placeholder = "기업명 또는 티커를 입력하세요 (예: 삼성전자, 005930, AAPL)",
  className 
}: SearchBarProps) {
  const [query, setQuery] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (query.trim()) {
      onSearch(query.trim())
    }
  }

  return (
    <form onSubmit={handleSubmit} className={cn("w-full", className)}>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="h-14 pl-12 pr-32 text-lg bg-card/50 border-border/50 focus:border-primary focus:ring-primary/20"
          disabled={isLoading}
        />
        <Button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-6 bg-primary hover:bg-primary/90"
        >
          {isLoading ? '분석 중...' : '분석 시작'}
        </Button>
      </div>
    </form>
  )
}
