"use client"

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils/cn'

interface PixelRobotProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * 귀여운 레트로 픽셀 로봇 캐릭터
 * 색감이 잘 배치된 픽셀 아트 스타일
 */
export function PixelRobot({ className, size = 'lg' }: PixelRobotProps) {
  const sizeClasses = {
    sm: 'w-20 h-20',
    md: 'w-28 h-28',
    lg: 'w-36 h-36',
  }

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <motion.div
        className={cn("relative", sizeClasses[size])}
        initial={{ opacity: 0, scale: 0.8, y: -20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* 로봇 몸체 */}
        <div className="relative w-full h-full">
          {/* 안테나 (상단) */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            <motion.div
              className="w-1.5 h-3 bg-[#FF6B9D] rounded-full"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <motion.div
              className="w-1.5 h-3 bg-[#4ECDC4] rounded-full"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.3,
              }}
            />
          </div>

          {/* 머리 (상단) - 파란색 배경 */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/5 h-2/5 bg-[#4A90E2] rounded-t-lg">
            <div className="relative w-full h-full p-1.5">
              {/* 눈 (깜빡임 애니메이션) */}
              <div className="flex justify-center gap-2 mt-1">
                <motion.div
                  className="w-2 h-2 bg-white rounded-sm"
                  animate={{
                    scaleY: [1, 0.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatDelay: 3,
                  }}
                />
                <motion.div
                  className="w-2 h-2 bg-white rounded-sm"
                  animate={{
                    scaleY: [1, 0.1, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    repeatDelay: 3,
                    delay: 0.1,
                  }}
                />
              </div>
              {/* 입 (중앙 하단) */}
              <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-1 bg-[#FF6B9D] rounded-sm" />
            </div>
          </div>

          {/* 목 (연결부) */}
          <div className="absolute top-[40%] left-1/2 -translate-x-1/2 w-1/3 h-[3%] bg-[#4A90E2] rounded-sm" />

          {/* 몸체 (중앙) - 주황색 배경 */}
          <div className="absolute top-[43%] left-1/2 -translate-x-1/2 w-4/5 h-2/5 bg-[#FFA07A] rounded-lg">
            <div className="relative w-full h-full p-1.5">
              {/* 가슴 패턴 (하트 모양) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                <div className="grid grid-cols-3 gap-0.5 w-4 h-4">
                  <div className="col-span-1" />
                  <div className="col-span-1 bg-[#FF6B9D] rounded-sm" />
                  <div className="col-span-1" />
                  <div className="col-span-1 bg-[#FF6B9D] rounded-sm" />
                  <div className="col-span-1 bg-[#FF6B9D] rounded-sm" />
                  <div className="col-span-1 bg-[#FF6B9D] rounded-sm" />
                  <div className="col-span-1" />
                  <div className="col-span-1 bg-[#FF6B9D] rounded-sm" />
                  <div className="col-span-1" />
                </div>
              </div>
            </div>
          </div>

          {/* 팔 (양쪽) */}
          <div className="absolute top-[45%] -left-[8%] w-[12%] h-[15%] bg-[#4ECDC4] rounded-l-lg" />
          <div className="absolute top-[45%] -right-[8%] w-[12%] h-[15%] bg-[#4ECDC4] rounded-r-lg" />

          {/* 다리 (하단) */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-1/5 flex gap-2">
            {/* 왼쪽 다리 */}
            <motion.div
              className="flex-1 bg-[#4A90E2] rounded-b-lg"
              animate={{
                y: [0, -3, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            {/* 오른쪽 다리 */}
            <motion.div
              className="flex-1 bg-[#4A90E2] rounded-b-lg"
              animate={{
                y: [0, -3, 0],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.75,
              }}
            />
          </div>

          {/* 발 (다리 하단) */}
          <div className="absolute -bottom-1 left-[20%] w-[12%] h-1.5 bg-[#FF6B9D] rounded-full" />
          <div className="absolute -bottom-1 right-[20%] w-[12%] h-1.5 bg-[#FF6B9D] rounded-full" />
        </div>

        {/* 반짝이는 효과 */}
        <motion.div
          className="absolute top-1/4 left-1/4 w-2 h-2 bg-white/60 rounded-full blur-sm pointer-events-none"
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0.8, 1.2, 0.8],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      </motion.div>
    </div>
  )
}
