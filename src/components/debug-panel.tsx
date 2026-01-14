"use client"

import { useEffect, useState } from 'react'
import type { PipelineStage } from '@/lib/utils/progress-tracker'

interface DebugPanelProps {
  currentStage: PipelineStage | null
  percentage: number
  lastMessage: string
  lastFile?: string
  isDevelopment?: boolean
}

export function DebugPanel({
  currentStage,
  percentage,
  lastMessage,
  lastFile,
  isDevelopment = process.env.NODE_ENV === 'development',
}: DebugPanelProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date())

  useEffect(() => {
    setLastUpdateTime(new Date())
  }, [currentStage, percentage, lastMessage])

  if (!isDevelopment) {
    return null
  }

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {!isVisible ? (
        <button
          onClick={() => setIsVisible(true)}
          className="bg-muted hover:bg-muted/80 text-muted-foreground text-xs px-2 py-1 rounded border border-border"
        >
          Debug
        </button>
      ) : (
        <div className="bg-card border border-border rounded-lg p-3 shadow-lg w-64 max-h-64 overflow-auto">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-bold text-foreground">디버그 패널</h3>
            <button
              onClick={() => setIsVisible(false)}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              ✕
            </button>
          </div>
          
          <div className="space-y-1 text-xs font-mono">
            <div>
              <span className="text-muted-foreground">단계:</span>{' '}
              <span className="text-foreground font-semibold">
                {currentStage || 'N/A'}
              </span>
            </div>
            
            <div>
              <span className="text-muted-foreground">진행률:</span>{' '}
              <span className="text-foreground font-semibold">
                {percentage.toFixed(1)}%
              </span>
            </div>
            
            <div>
              <span className="text-muted-foreground">메시지:</span>{' '}
              <span className="text-foreground text-[10px] break-words">
                {lastMessage || 'N/A'}
              </span>
            </div>
            
            {lastFile && (
              <div>
                <span className="text-muted-foreground">파일:</span>{' '}
                <span className="text-foreground text-[10px] break-words">
                  {lastFile.length > 30 ? `${lastFile.substring(0, 30)}...` : lastFile}
                </span>
              </div>
            )}
            
            <div>
              <span className="text-muted-foreground">업데이트:</span>{' '}
              <span className="text-foreground text-[10px]">
                {lastUpdateTime.toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
