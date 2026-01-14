"use client"

import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'

interface LoadingAnimationProps {
  message?: string
  percentage?: number
}

export function LoadingAnimation({ message = '분석 중...', percentage }: LoadingAnimationProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-4">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      >
        <Loader2 className="h-12 w-12 text-primary" />
      </motion.div>
      
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="text-center space-y-2"
      >
        <p className="text-sm font-medium text-foreground">{message}</p>
        {percentage !== undefined && (
          <p className="text-xs text-muted-foreground">{percentage}%</p>
        )}
      </motion.div>

      {/* 진행률 바 */}
      {percentage !== undefined && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: 0.3 }}
          className="w-64 h-1 bg-muted rounded-full overflow-hidden"
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-full bg-primary rounded-full"
          />
        </motion.div>
      )}
    </div>
  )
}
