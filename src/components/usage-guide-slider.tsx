"use client"

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, FileText, Upload, CheckCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils/cn'

interface GuideStep {
  step: number
  title: string
  description: string
  icon: React.ReactNode
}

const guideSteps: GuideStep[] = [
  {
    step: 1,
    title: "파일 준비",
    description: "분석할 재무제표 파일을 준비하세요. PDF 또는 XBRL 형식을 지원합니다.",
    icon: <FileText className="h-8 w-8 text-primary" />,
  },
  {
    step: 2,
    title: "업로드",
    description: "파일을 드롭존에 드래그하거나 클릭하여 업로드하세요. 여러 파일을 동시에 업로드할 수 있습니다.",
    icon: <Upload className="h-8 w-8 text-primary" />,
  },
  {
    step: 3,
    title: "결과 확인",
    description: "분석이 완료되면 차트와 인사이트 카드를 통해 결과를 확인하세요.",
    icon: <CheckCircle className="h-8 w-8 text-primary" />,
  },
]

export function UsageGuideSlider() {
  const [currentStep, setCurrentStep] = useState(0)

  const nextStep = () => {
    setCurrentStep((prev) => (prev + 1) % guideSteps.length)
  }

  const prevStep = () => {
    setCurrentStep((prev) => (prev - 1 + guideSteps.length) % guideSteps.length)
  }

  const goToStep = (step: number) => {
    setCurrentStep(step)
  }

  return (
    <Card className={cn(
      "glass-dark border-border/50",
      "backdrop-blur-xl bg-card/40",
      "shadow-[0_8px_32px_0_rgba(0,0,0,0.12),0_2px_8px_0_rgba(0,0,0,0.08)]",
      "hover:shadow-[0_16px_64px_0_rgba(0,0,0,0.20),0_4px_16px_0_rgba(0,0,0,0.12)]",
      "transition-all duration-300",
      "rounded-2xl overflow-hidden",
      "border border-white/5"
    )}>
      <CardHeader>
        <CardTitle className="text-xl font-semibold tracking-tight">
          사용 가이드
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground/80">
          간단한 3단계로 시작하세요
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* 슬라이더 컨테이너 */}
        <div className="relative h-64 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -100 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 30,
              }}
              className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
            >
              <div className="mb-6 p-4 rounded-2xl bg-primary/10">
                {guideSteps[currentStep].icon}
              </div>
              <h3 className="text-2xl font-semibold mb-3 tracking-tight">
                {guideSteps[currentStep].title}
              </h3>
              <p className="text-sm text-muted-foreground/80 leading-relaxed max-w-md">
                {guideSteps[currentStep].description}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 네비게이션 컨트롤 */}
        <div className="flex items-center justify-between mt-6">
          <Button
            variant="ghost"
            size="sm"
            onClick={prevStep}
            className="rounded-full"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* 스텝 인디케이터 */}
          <div className="flex items-center gap-2">
            {guideSteps.map((_, index) => (
              <button
                key={index}
                onClick={() => goToStep(index)}
                className={cn(
                  "w-2 h-2 rounded-full transition-all duration-300",
                  index === currentStep
                    ? "w-8 bg-primary"
                    : "bg-muted-foreground/30 hover:bg-muted-foreground/50"
                )}
                aria-label={`Step ${index + 1}`}
              />
            ))}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={nextStep}
            className="rounded-full"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
