"use client"

import { motion } from 'framer-motion'
import { FileText, BarChart3, Sparkles, Zap } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  delay?: number
}

function FeatureCard({ icon, title, description, delay = 0 }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="h-full"
    >
      <Card className={cn(
        "h-full glass-dark border-border/50",
        "backdrop-blur-xl bg-card/40",
        "shadow-[0_8px_32px_0_rgba(0,0,0,0.12),0_2px_8px_0_rgba(0,0,0,0.08)]",
        "hover:shadow-[0_16px_64px_0_rgba(0,0,0,0.20),0_4px_16px_0_rgba(0,0,0,0.12)]",
        "transition-all duration-300",
        "rounded-2xl",
        "border border-white/5"
      )}>
        <CardHeader>
          <div className="mb-4 p-3 rounded-xl bg-primary/10 w-fit">
            {icon}
          </div>
          <CardTitle className="text-xl font-semibold tracking-tight">
            {title}
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed text-muted-foreground/80">
            {description}
          </CardDescription>
        </CardHeader>
      </Card>
    </motion.div>
  )
}

export function FeatureCards() {
  const features = [
    {
      icon: <FileText className="h-6 w-6 text-primary" />,
      title: "파일 업로드",
      description: "PDF 및 XBRL 파일을 간편하게 드래그 앤 드롭으로 업로드하세요.",
    },
    {
      icon: <BarChart3 className="h-6 w-6 text-primary" />,
      title: "자동 분석",
      description: "AI가 재무제표를 분석하여 핵심 인사이트를 추출합니다.",
    },
    {
      icon: <Sparkles className="h-6 w-6 text-primary" />,
      title: "인사이트 카드",
      description: "경영진의 핵심 언어와 회계적 모순점을 한눈에 확인하세요.",
    },
    {
      icon: <Zap className="h-6 w-6 text-primary" />,
      title: "실시간 시각화",
      description: "재무제표 데이터를 아름다운 차트로 실시간 변환합니다.",
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
      {features.map((feature, index) => (
        <FeatureCard
          key={index}
          icon={feature.icon}
          title={feature.title}
          description={feature.description}
          delay={index * 0.1}
        />
      ))}
    </div>
  )
}
