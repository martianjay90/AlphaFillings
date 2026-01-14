"use client"

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'

interface PixelLoaderProps {
  className?: string
}

/**
 * 레트로 픽셀 스타일 로딩 애니메이션
 */
export function PixelLoader({ className }: PixelLoaderProps) {
  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div className="relative">
        {/* 픽셀 캐릭터 */}
        <motion.div
          className="relative"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          {/* 픽셀 아이콘 (8x8 그리드) */}
          <div className="grid grid-cols-8 gap-0.5 w-16 h-16">
            {/* 데이터 수집 중 애니메이션 */}
            {Array.from({ length: 64 }).map((_, i) => {
              const row = Math.floor(i / 8)
              const col = i % 8
              
              // 픽셀 패턴 생성 (데이터 수집 아이콘 모양 - 폴더/문서)
              const isActive = 
                (row === 0 && col >= 2 && col <= 5) || // 상단
                (row === 1 && col >= 1 && col <= 6) || // 상단 확장
                (row === 2 && (col === 1 || col === 6)) || // 양쪽
                (row === 3 && (col === 1 || col === 6)) || // 양쪽
                (row === 4 && (col === 1 || col === 6)) || // 양쪽
                (row === 5 && col >= 2 && col <= 5) || // 하단
                (row === 6 && col >= 3 && col <= 4) || // 중앙
                (row === 7 && col >= 2 && col <= 5) // 하단
              
              return (
                <motion.div
                  key={i}
                  className={cn(
                    "w-1.5 h-1.5 rounded-sm",
                    isActive ? "bg-primary" : "bg-muted/20"
                  )}
                  animate={
                    isActive
                      ? {
                          opacity: [0.5, 1, 0.5],
                          scale: [1, 1.2, 1],
                        }
                      : {}
                  }
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    delay: (i % 8) * 0.05,
                    ease: "easeInOut",
                  }}
                />
              )
            })}
          </div>
        </motion.div>

        {/* 데이터 흐름 애니메이션 */}
        <motion.div
          className="absolute -top-2 left-1/2 -translate-x-1/2"
          animate={{
            y: [0, 4, 0],
            opacity: [0.3, 1, 0.3],
          }}
          transition={{
            duration: 1,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <div className="flex gap-0.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <motion.div
                key={i}
                className="w-1 h-1 bg-primary rounded-full"
                animate={{
                  scale: [0.8, 1.2, 0.8],
                }}
                transition={{
                  duration: 0.8,
                  repeat: Infinity,
                  delay: i * 0.2,
                  ease: "easeInOut",
                }}
              />
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
