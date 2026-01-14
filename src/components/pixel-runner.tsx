"use client"

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'

interface PixelRunnerProps {
  className?: string
}

/**
 * 레트로 픽셀 스타일 달리는 캐릭터 애니메이션
 * 진행 바 상단에 배치하여 시스템이 활발히 작동 중임을 시각적으로 표현
 */
export function PixelRunner({ className }: PixelRunnerProps) {
  return (
    <div className={cn("relative w-full h-12 overflow-hidden", className)}>
      {/* 달리는 캐릭터 */}
      <motion.div
        className="absolute bottom-0"
        initial={{ x: '-100%' }}
        animate={{ x: '100%' }}
        transition={{
          duration: 3,
          repeat: Infinity,
          ease: "linear",
        }}
      >
        {/* 8비트 스타일 달리는 캐릭터 (16x16 픽셀) */}
        <div className="grid grid-cols-4 gap-0.5 w-16 h-16">
          {Array.from({ length: 16 }).map((_, i) => {
            const row = Math.floor(i / 4)
            const col = i % 4
            
            // 달리는 캐릭터 패턴
            const isActive = 
              (row === 0 && col === 1) || // 머리
              (row === 1 && col >= 0 && col <= 2) || // 몸통 상단
              (row === 2 && (col === 0 || col === 2)) || // 팔
              (row === 3 && col === 1) || // 다리
              (row === 2 && col === 3) // 꼬리/움직임
            
            return (
              <motion.div
                key={i}
                className={cn(
                  "w-3 h-3",
                  isActive ? "bg-primary" : "bg-transparent"
                )}
                animate={
                  isActive && (row === 2 || row === 3)
                    ? {
                        y: [0, -2, 0],
                      }
                    : {}
                }
                transition={{
                  duration: 0.3,
                  repeat: Infinity,
                  delay: row * 0.1,
                  ease: "easeInOut",
                }}
              />
            )
          })}
        </div>
      </motion.div>

      {/* 배경 픽셀 효과 (데이터 흐름) */}
      <div className="absolute inset-0 flex items-center gap-1 opacity-20">
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={i}
            className="w-1 h-1 bg-primary rounded-full"
            animate={{
              x: [0, 100],
              opacity: [0, 1, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.1,
              ease: "linear",
            }}
            style={{
              left: `${(i * 5)}%`,
            }}
          />
        ))}
      </div>
    </div>
  )
}
