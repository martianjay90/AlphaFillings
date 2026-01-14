"use client"

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import type { AnalysisInput, DiscountRateEstimate, MaintenanceCapexRange } from '@/types/analysis'
import type { CountryCode, IndustryType } from '@/types/industry'
import { INDUSTRY_NAMES } from '@/types/industry'
import { getDefaultDiscountRateRange } from '@/lib/utils/currency'

interface ControlPanelProps {
  onSubmit: (input: AnalysisInput) => void
  isLoading?: boolean
}

export function ControlPanel({ onSubmit, isLoading = false }: ControlPanelProps) {
  const [companyNameOrTicker, setCompanyNameOrTicker] = useState<string>('')
  const [country, setCountry] = useState<CountryCode>('KR')
  const [industry, setIndustry] = useState<IndustryType>('other')
  const [discountRate, setDiscountRate] = useState<DiscountRateEstimate>(() => 
    getDefaultDiscountRateRange('KR')
  )
  const [growthRate, setGrowthRate] = useState<string>('5')
  const [maintenanceCapexMin, setMaintenanceCapexMin] = useState<string>('0')
  const [maintenanceCapexMax, setMaintenanceCapexMax] = useState<string>('10')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const input: AnalysisInput = {
      companyNameOrTicker: companyNameOrTicker.trim(),
      country,
      industry,
      discountRate: {
        conservative: discountRate.conservative / 100,
        base: discountRate.base / 100,
        optimistic: discountRate.optimistic / 100,
      },
      growthRate: parseFloat(growthRate) / 100,
      maintenanceCapex: {
        min: parseFloat(maintenanceCapexMin),
        max: parseFloat(maintenanceCapexMax),
      },
    }

    onSubmit(input)
  }

  const handleCountryChange = (value: CountryCode) => {
    setCountry(value)
    // 국가 변경 시 기본 할인율 업데이트
    const defaultRates = getDefaultDiscountRateRange(value)
    setDiscountRate(defaultRates)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>분석 제어판</CardTitle>
        <CardDescription>
          기업 정보 및 분석 파라미터를 입력하세요
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 기업명/티커 검색 */}
          <div className="space-y-2">
            <Label htmlFor="company">기업명 또는 티커</Label>
            <Input
              id="company"
              type="text"
              placeholder="예: 삼성전자 또는 005930"
              value={companyNameOrTicker}
              onChange={(e) => setCompanyNameOrTicker(e.target.value)}
              required
            />
          </div>

          {/* 국가 선택 */}
          <div className="space-y-2">
            <Label htmlFor="country">국가</Label>
            <Select value={country} onValueChange={handleCountryChange}>
              <SelectTrigger id="country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="KR">한국 (KRW, IFRS)</SelectItem>
                <SelectItem value="US">미국 (USD, GAAP)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 산업군 선택 */}
          <div className="space-y-2">
            <Label htmlFor="industry">산업군</Label>
            <Select value={industry} onValueChange={(value) => setIndustry(value as IndustryType)}>
              <SelectTrigger id="industry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(INDUSTRY_NAMES).map(([key, name]) => (
                  <SelectItem key={key} value={key}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 할인율 3점 추정 */}
          <div className="space-y-4">
            <Label>할인율 추정 (%)</Label>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="discount-conservative" className="text-xs text-muted-foreground">
                  보수적
                </Label>
                <Input
                  id="discount-conservative"
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={discountRate.conservative}
                  onChange={(e) => setDiscountRate({
                    ...discountRate,
                    conservative: parseFloat(e.target.value) || 0
                  })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount-base" className="text-xs text-muted-foreground">
                  기본
                </Label>
                <Input
                  id="discount-base"
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={discountRate.base}
                  onChange={(e) => setDiscountRate({
                    ...discountRate,
                    base: parseFloat(e.target.value) || 0
                  })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="discount-optimistic" className="text-xs text-muted-foreground">
                  상방
                </Label>
                <Input
                  id="discount-optimistic"
                  type="number"
                  step="0.1"
                  min="0"
                  max="50"
                  value={discountRate.optimistic}
                  onChange={(e) => setDiscountRate({
                    ...discountRate,
                    optimistic: parseFloat(e.target.value) || 0
                  })}
                  required
                />
              </div>
            </div>
          </div>

          {/* 성장률 */}
          <div className="space-y-2">
            <Label htmlFor="growth-rate">성장률 (%)</Label>
            <Input
              id="growth-rate"
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={growthRate}
              onChange={(e) => setGrowthRate(e.target.value)}
              required
            />
          </div>

          {/* 유지보수 CAPEX 범위 */}
          <div className="space-y-4">
            <Label>유지보수 CAPEX 범위 (%)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="capex-min" className="text-xs text-muted-foreground">
                  최소값
                </Label>
                <Input
                  id="capex-min"
                  type="number"
                  step="0.1"
                  min="0"
                  value={maintenanceCapexMin}
                  onChange={(e) => setMaintenanceCapexMin(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="capex-max" className="text-xs text-muted-foreground">
                  최대값
                </Label>
                <Input
                  id="capex-max"
                  type="number"
                  step="0.1"
                  min="0"
                  value={maintenanceCapexMax}
                  onChange={(e) => setMaintenanceCapexMax(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* 제출 버튼 */}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? '분석 중...' : '분석 시작'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
