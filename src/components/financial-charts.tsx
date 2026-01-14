"use client"

import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { FinancialStatement } from '@/types/financial'

interface FinancialChartsProps {
  financialStatement?: FinancialStatement
  financialStatements?: FinancialStatement[] // 5개년 데이터
  className?: string
}

export function FinancialCharts({ financialStatement, financialStatements, className }: FinancialChartsProps) {
  if (!financialStatement) return null

  // 가변적 추세 데이터 준비 (2개 이상일 경우만, 시계열 순)
  // 데이터가 없는 연도는 차트에서 제외
  const trendData = financialStatements && financialStatements.length >= 2
    ? financialStatements
        .sort((a, b) => {
          // 연도 기준 정렬
          if (a.fiscalYear !== b.fiscalYear) {
            return (a.fiscalYear || 0) - (b.fiscalYear || 0)
          }
          // 같은 연도면 분기 순서 (1분기 < 2분기 < 3분기 < 4분기 < 연간)
          return (a.quarter || 0) - (b.quarter || 0)
        })
        .filter(fs => {
          // 유효한 데이터가 있는 경우만 포함 (원본 데이터와 1원 단위까지 일치)
          const hasRevenue = fs.incomeStatement.revenue.value > 0
          const hasAssets = fs.balanceSheet.totalAssets.value > 0
          return hasRevenue || hasAssets
        })
        .map(fs => {
          const year = fs.fiscalYear || new Date().getFullYear()
          const quarter = fs.quarter || 0
          const label = quarter > 0 ? `${year}년 ${quarter}분기` : `${year}년`
          
          // 원본 데이터 그대로 사용 (1원 단위까지 일치, 임의 계산 금지)
          return {
            label,
            year,
            quarter,
            revenue: fs.incomeStatement.revenue.value / 100_000_000, // 억원 단위 변환 (1억 = 1e8)
            operatingIncome: fs.incomeStatement.operatingIncome.value / 100_000_000,
            netIncome: fs.incomeStatement.netIncome.value / 100_000_000,
            totalAssets: fs.balanceSheet.totalAssets.value / 100_000_000,
          }
        })
    : []

  // 차트 데이터 준비 (FinancialItem.value 사용) - 억원 단위 변환 (1억 = 1e8)
  const incomeData = [
    {
      name: '매출액',
      value: financialStatement.incomeStatement.revenue.value / 100_000_000, // 억원 단위
    },
    {
      name: '영업이익',
      value: financialStatement.incomeStatement.operatingIncome.value / 100_000_000,
    },
    {
      name: '당기순이익',
      value: financialStatement.incomeStatement.netIncome.value / 100_000_000,
    },
  ]

  const balanceData = [
    {
      name: '자산',
      value: financialStatement.balanceSheet.totalAssets.value / 100_000_000,
    },
    {
      name: '부채',
      value: financialStatement.balanceSheet.totalLiabilities.value / 100_000_000,
    },
    {
      name: '자본',
      value: financialStatement.balanceSheet.totalEquity.value / 100_000_000,
    },
  ]

  return (
    <div className={className}>
      {/* 가변적 추세 차트 (2개 이상일 경우만) */}
      {trendData.length >= 2 && (
        <Card className="glass-dark border-border/50 mb-6">
          <CardHeader>
            <CardTitle>재무 추이 분석</CardTitle>
            <CardDescription>
              {trendData.length}개 기간의 시계열 재무 지표 추이 (억원)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart 
                data={trendData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis 
                  dataKey="label" 
                  stroke="hsl(var(--muted-foreground))"
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis 
                  stroke="hsl(var(--muted-foreground))"
                  domain={['auto', 'auto']} // 데이터가 있는 구간만 자동 설정
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  name="매출액"
                  dot={{ r: 4 }}
                  connectNulls={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="operatingIncome" 
                  stroke="#00BFFF" 
                  strokeWidth={2}
                  name="영업이익"
                  dot={{ r: 4 }}
                  connectNulls={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="netIncome" 
                  stroke="#00FF7F" 
                  strokeWidth={2}
                  name="당기순이익"
                  dot={{ r: 4 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 손익계산서 차트 */}
        <Card className="glass-dark border-border/50">
          <CardHeader>
            <CardTitle>손익계산서</CardTitle>
            <CardDescription>주요 손익 항목 (억원)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={incomeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 재무상태표 차트 */}
        <Card className="glass-dark border-border/50">
          <CardHeader>
            <CardTitle>재무상태표</CardTitle>
            <CardDescription>자산, 부채, 자본 (억원)</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={balanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
