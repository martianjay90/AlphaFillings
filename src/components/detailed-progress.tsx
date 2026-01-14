"use client"

import { motion, AnimatePresence } from 'framer-motion'
import { PixelLoader } from './pixel-loader'
import { PixelRunner } from './pixel-runner'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import type { FileParseStatus } from '@/lib/parsers/file-parser'
import { cn } from '@/lib/utils/cn'
import { UI_TEXT } from '@/ui/labels/analysisSteps.ko'

interface DetailedProgressProps {
  currentMessage: string
  percentage: number
  fileStatuses?: FileParseStatus[]
  missingYears?: number[]
  dataWarning?: string
  className?: string
}

export function DetailedProgress({
  currentMessage,
  percentage,
  fileStatuses = [],
  missingYears = [],
  dataWarning,
  className
}: DetailedProgressProps) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* 메인 진행 상태 */}
      <div className="bg-card border border-border rounded-2xl p-6">
        {/* 레트로 픽셀 로더 */}
        <div className="flex items-center justify-center mb-4">
          <PixelLoader />
        </div>

        {/* 달리는 픽셀 캐릭터 (진행 바 상단) */}
        <div className="mb-4">
          <PixelRunner />
        </div>

        {/* 현재 작업 메시지 */}
        <div className="text-center mb-4">
          <motion.p
            key={currentMessage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="text-lg font-medium text-foreground"
          >
            {currentMessage}
          </motion.p>
          <p className="text-sm text-muted-foreground mt-1">
            {percentage.toFixed(0)}% 완료
          </p>
        </div>

        {/* 진행률 바 */}
        <div className="w-full bg-muted rounded-full h-3 overflow-hidden relative">
          <motion.div
            className="bg-primary h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>

        {/* 누락된 연도 경고 메시지 */}
        {(missingYears.length > 0 || dataWarning) && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20"
          >
            <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">
              {dataWarning || UI_TEXT.insufficientDataDescription}
            </p>
          </motion.div>
        )}
      </div>

      {/* 파일별 진행 상태 */}
      {fileStatuses.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 space-y-2 max-h-64 overflow-y-auto">
          <h3 className="text-sm font-medium mb-3">파일별 진행 상태</h3>
          <AnimatePresence>
            {fileStatuses.map((status, index) => (
              <motion.div
                key={status.fileName}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30 transition-colors"
              >
                {/* 상태 아이콘 */}
                <div className="flex-shrink-0">
                  {status.status === 'completed' && (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  )}
                  {status.status === 'error' && (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                  {status.status === 'parsing' && (
                    <Loader2 className="h-4 w-4 text-primary animate-spin" />
                  )}
                  {status.status === 'pending' && (
                    <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                  )}
                </div>

                {/* 파일 정보 */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{status.fileName}</p>
                  <p className="text-xs text-muted-foreground">{status.message}</p>
                </div>

                {/* 진행률 */}
                {status.status === 'parsing' && (
                  <div className="flex-shrink-0 w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-primary rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 1, repeat: Infinity, ease: "easeInOut" }}
                    />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
