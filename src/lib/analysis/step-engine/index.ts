/**
 * Step Engine
 * 레벨2의 Step 1~11을 웹에서 동일한 질문/구조로 실행
 */

import type { AnalysisBundle, StepOutput } from '@/types/analysis-bundle'
import { resolveChartAvailability } from '@/lib/charts/chart-availability-resolver'
import { runStep01 } from './steps/step01_industry'
import { runStep02 } from './steps/step02_business_model'
import { runStep03 } from './steps/step03_performance'
import { runStep04 } from './steps/step04_profitability'
import { runStep05 } from './steps/step05_cashflow'
import { runStep06 } from './steps/step06_financial_stability'
import { runStep07 } from './steps/step07_capital_allocation'
import { runStep08 } from './steps/step08_valuation'
import { runStep09 } from './steps/step09_risk_forensic'
import { runStep10 } from './steps/step10_catalyst_market'
import { runStep11 } from './steps/step11_decision'

/**
 * 레벨2 Step 1~11 실행
 * 각 StepOutput의 핵심 문장/경고/체크포인트는 EvidenceRef가 1개 이상 반드시 필요
 */
export function runLevel2Steps(bundle: AnalysisBundle): StepOutput[] {
  const stepOutputs: StepOutput[] = []

  // Step 1: 산업 필터
  stepOutputs.push(runStep01(bundle))

  // Step 2: BM/해자
  stepOutputs.push(runStep02(bundle))

  // Step 3: 실적/기대
  stepOutputs.push(runStep03(bundle))

  // Step 4: 수익성/ROIC
  stepOutputs.push(runStep04(bundle))

  // Step 5: 현금흐름
  stepOutputs.push(runStep05(bundle))

  // Step 6: 재무안정
  stepOutputs.push(runStep06(bundle))

  // Step 7: 자본배분
  stepOutputs.push(runStep07(bundle))

  // Step 8: 밸류에이션
  stepOutputs.push(runStep08(bundle))

  // Step 9: 리스크/포렌식
  stepOutputs.push(runStep09(bundle))

  // Step 10: 촉매/시장오버레이
  stepOutputs.push(runStep10(bundle))

  // Step 11: 매매/판정 (이전 Step 1-10 결과를 참조)
  stepOutputs.push(runStep11(bundle, stepOutputs))

  // 차트 가용성 해결 및 StepOutputs에 연결
  const chartPlans = resolveChartAvailability(bundle)
  chartPlans.forEach(plan => {
    const stepOutput = stepOutputs.find(s => s.step === plan.step)
    if (stepOutput) {
      stepOutput.chartPlan = plan
    }
  })

  return stepOutputs
}
