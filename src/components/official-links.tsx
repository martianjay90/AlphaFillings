"use client"

import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function OfficialLinks() {
  return (
    <div className="flex items-center gap-4 mt-6">
      <Button
        variant="outline"
        size="lg"
        className="flex items-center gap-2"
        onClick={() => window.open('https://dart.fss.or.kr', '_blank')}
      >
        <span className="text-sm font-semibold">DART</span>
        <ExternalLink className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="lg"
        className="flex items-center gap-2"
        onClick={() => window.open('https://www.sec.gov/edgar/search/#/category=form-cat1', '_blank')}
      >
        <span className="text-sm font-semibold">SEC</span>
        <ExternalLink className="h-4 w-4" />
      </Button>
    </div>
  )
}
