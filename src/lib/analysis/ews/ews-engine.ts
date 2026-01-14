/**
 * EWS (Early Warning Signal) 엔진
 * 레벨2와 동일하게 "다음 분기 체크포인트"를 자동 도출
 * 
 * 원칙:
 * - 트리거(체크포인트)는 (a) 정량 신호 또는 (b) PDF 근거 키워드가 있을 때만 생성
 * - 각 체크포인트는 EvidenceRef 필수
 */

import type { AnalysisBundle, Checkpoint, EvidenceRef } from '@/types/analysis-bundle'
import { createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'

/**
 * EWS 체크포인트 생성
 * AnalysisBundle을 기반으로 Early Warning Signal 체크포인트를 도출
 */
export function generateEWSCheckpoints(bundle: AnalysisBundle): Checkpoint[] {
  const checkpoints: Checkpoint[] = []

  // 1. FCF 압박 체크
  const fcfCheckpoint = checkFCFPressure(bundle)
  if (fcfCheckpoint) checkpoints.push(fcfCheckpoint)

  // 2. CAPEX 급증 체크
  const capexCheckpoint = checkCAPEXSpike(bundle)
  if (capexCheckpoint) checkpoints.push(capexCheckpoint)

  // 3. 운전자본 경고 체크
  const workingCapitalCheckpoints = checkWorkingCapital(bundle)
  checkpoints.push(...workingCapitalCheckpoints)

  // 4. 일회성/품질 경고 (PDF 키워드 기반)
  const qualityCheckpoints = checkQualityWarnings(bundle)
  checkpoints.push(...qualityCheckpoints)

  // 5. 가이던스/전망 (PDF 키워드 기반)
  const guidanceCheckpoints = checkGuidance(bundle)
  checkpoints.push(...guidanceCheckpoints)

  return checkpoints
}

/**
 * 1. FCF 압박 체크
 * fcf<0 또는 fcfMargin 급락(가능할 때만) -> "현금창출력 점검"
 */
function checkFCFPressure(bundle: AnalysisBundle): Checkpoint | null {
  const statements = bundle.statements
  if (statements.length === 0) return null

  const latestStatement = statements[0]
  const fcfItem = latestStatement.cashflow?.freeCashFlow
  const revenueItem = latestStatement.income?.revenue

  // FCF < 0 체크
  if (fcfItem?.value !== undefined && fcfItem.value < 0 && fcfItem.evidence && fcfItem.evidence.length > 0) {
    return createCheckpoint(
      'ews-fcf-negative',
      '현금창출력 점검',
      'FCF가 음수로 전환되었습니다. 영업현금흐름과 CAPEX 구조를 확인하세요.',
      'FCF 음수는 현금 창출 능력 저하 신호로, 지속되면 자금 조달 압박으로 이어질 수 있습니다.',
      '다음 분기 FCF 전환 여부 및 영업현금흐름 회복 여부 확인',
      fcfItem.evidence,
      'skip'
    )
  }

  // FCF Margin 급락 체크 (2개 이상 데이터 있을 때)
  if (statements.length >= 2 && fcfItem?.value !== undefined && revenueItem?.value !== undefined) {
    const currentFCFMargin = (fcfItem.value / revenueItem.value) * 100
    
    const previousStatement = statements[1]
    const prevFCFItem = previousStatement.cashflow?.freeCashFlow
    const prevRevenueItem = previousStatement.income?.revenue
    
    if (prevFCFItem?.value !== undefined && prevRevenueItem?.value !== undefined) {
      const previousFCFMargin = (prevFCFItem.value / prevRevenueItem.value) * 100
      const marginDrop = previousFCFMargin - currentFCFMargin
      
      // FCF Margin이 5%p 이상 급락
      if (marginDrop >= 5 && fcfItem.evidence && fcfItem.evidence.length > 0) {
        const evidence = [
          ...(fcfItem.evidence || []),
          ...(prevFCFItem.evidence || []),
        ].filter((e, i, arr) => 
          arr.findIndex(a => a.fileId === e.fileId && a.locator.tag === e.locator.tag) === i
        )
        
        if (evidence.length > 0) {
          return createCheckpoint(
            'ews-fcf-margin-drop',
            '현금창출력 점검',
            `FCF 마진이 ${previousFCFMargin.toFixed(1)}%에서 ${currentFCFMargin.toFixed(1)}%로 급락했습니다.`,
            'FCF 마진 급락은 현금 창출 효율성 저하를 의미하며, 영업 모델의 지속 가능성에 영향을 줄 수 있습니다.',
            '다음 분기 FCF 마진 회복 여부 및 원인 분석',
            evidence,
            'skip'
          )
        }
      }
    }
  }

  return null
}

/**
 * 2. CAPEX 급증 체크
 * capex 증가 + ocf 둔화 -> "투자 vs 회수 구조 점검"
 */
function checkCAPEXSpike(bundle: AnalysisBundle): Checkpoint | null {
  const statements = bundle.statements
  if (statements.length < 2) return null

  const latestStatement = statements[0]
  const previousStatement = statements[1]

  const currentCAPEX = latestStatement.cashflow?.capitalExpenditure?.value
  const currentOCF = latestStatement.cashflow?.operatingCashFlow?.value
  const previousCAPEX = previousStatement.cashflow?.capitalExpenditure?.value
  const previousOCF = previousStatement.cashflow?.operatingCashFlow?.value

  if (currentCAPEX === undefined || currentOCF === undefined || 
      previousCAPEX === undefined || previousOCF === undefined) {
    return null
  }

  // CAPEX가 50% 이상 증가하고 OCF가 감소 또는 정체
  const capexIncrease = ((currentCAPEX - previousCAPEX) / Math.abs(previousCAPEX)) * 100
  const ocfChange = ((currentOCF - previousOCF) / Math.abs(previousOCF)) * 100

  if (capexIncrease >= 50 && ocfChange <= 0) {
    const capexEvidence = latestStatement.cashflow?.capitalExpenditure?.evidence || []
    const ocfEvidence = latestStatement.cashflow?.operatingCashFlow?.evidence || []
    const prevCapexEvidence = previousStatement.cashflow?.capitalExpenditure?.evidence || []
    const prevOcfEvidence = previousStatement.cashflow?.operatingCashFlow?.evidence || []

    const evidence = [
      ...capexEvidence,
      ...ocfEvidence,
      ...prevCapexEvidence,
      ...prevOcfEvidence,
    ].filter((e, i, arr) => 
      arr.findIndex(a => a.fileId === e.fileId && a.locator.tag === e.locator.tag) === i
    )

    if (evidence.length > 0) {
      return createCheckpoint(
        'ews-capex-spike',
        '투자 vs 회수 구조 점검',
        `CAPEX가 ${capexIncrease.toFixed(0)}% 증가했으나 OCF는 ${ocfChange >= 0 ? '정체' : '감소'}했습니다.`,
        '투자 확대에도 불구하고 현금 창출이 둔화되면 투자 회수 기간이 길어질 수 있습니다.',
        '다음 분기 OCF 회복 여부 및 신규 투자 수익성 확인',
        evidence,
        'skip'
      )
    }
  }

  return null
}

/**
 * 3. 운전자본 경고 체크
 * 재고 증가/DSO 상승/매입채무 감소(가능할 때만) -> "수요/채널 리스크"
 */
function checkWorkingCapital(bundle: AnalysisBundle): Checkpoint[] {
  const checkpoints: Checkpoint[] = []
  const statements = bundle.statements

  if (statements.length < 2) return checkpoints

  const latestStatement = statements[0]
  const previousStatement = statements[1]

  // 재고 증가 체크
  const currentInventory = latestStatement.balance?.inventory?.value
  const previousInventory = previousStatement.balance?.inventory?.value
  const currentRevenue = latestStatement.income?.revenue?.value
  const previousRevenue = previousStatement.income?.revenue?.value

  if (currentInventory !== undefined && previousInventory !== undefined &&
      currentRevenue !== undefined && previousRevenue !== undefined) {
    const inventoryIncrease = ((currentInventory - previousInventory) / Math.abs(previousInventory)) * 100
    const revenueChange = ((currentRevenue - previousRevenue) / Math.abs(previousRevenue)) * 100

    // 재고가 매출 증가율보다 빠르게 증가 (재고 회전율 악화)
    if (inventoryIncrease > revenueChange + 10 && inventoryIncrease > 20) {
      const inventoryEvidence = latestStatement.balance?.inventory?.evidence || []
      const prevInventoryEvidence = previousStatement.balance?.inventory?.evidence || []
      const revenueEvidence = latestStatement.income?.revenue?.evidence || []

      const evidence = [
        ...inventoryEvidence,
        ...prevInventoryEvidence,
        ...revenueEvidence,
      ].filter((e, i, arr) => 
        arr.findIndex(a => a.fileId === e.fileId && a.locator.tag === e.locator.tag) === i
      )

      if (evidence.length > 0) {
        const checkpoint = createCheckpoint(
          'ews-inventory-increase',
          '수요/채널 리스크',
          `재고가 ${inventoryIncrease.toFixed(0)}% 증가했으나 매출 증가율(${revenueChange.toFixed(0)}%)보다 빠릅니다.`,
          '재고 회전율 악화는 수요 둔화나 채널 문제를 시사할 수 있습니다.',
          '다음 분기 재고 회전율 개선 여부 및 판매 채널 점검',
          evidence,
          'skip'
        )
        if (checkpoint) checkpoints.push(checkpoint)
      }
    }
  }

  // DSO (매출채권 회전일수) 상승 체크
  const currentAR = latestStatement.balance?.accountsReceivable?.value
  const previousAR = previousStatement.balance?.accountsReceivable?.value

  if (currentAR !== undefined && previousAR !== undefined &&
      currentRevenue !== undefined && previousRevenue !== undefined) {
    const currentDSO = currentRevenue > 0 ? (currentAR / currentRevenue) * 365 : 0
    const previousDSO = previousRevenue > 0 ? (previousAR / previousRevenue) * 365 : 0
    const dsoIncrease = currentDSO - previousDSO

    // DSO가 10일 이상 증가
    if (dsoIncrease >= 10) {
      const arEvidence = latestStatement.balance?.accountsReceivable?.evidence || []
      const prevArEvidence = previousStatement.balance?.accountsReceivable?.evidence || []
      const revenueEvidence = latestStatement.income?.revenue?.evidence || []

      const evidence = [
        ...arEvidence,
        ...prevArEvidence,
        ...revenueEvidence,
      ].filter((e, i, arr) => 
        arr.findIndex(a => a.fileId === e.fileId && a.locator.tag === e.locator.tag) === i
      )

      if (evidence.length > 0) {
        const checkpoint = createCheckpoint(
          'ews-dso-increase',
          '수요/채널 리스크',
          `DSO가 ${previousDSO.toFixed(0)}일에서 ${currentDSO.toFixed(0)}일로 ${dsoIncrease.toFixed(0)}일 증가했습니다.`,
          'DSO 상승은 매출채권 회수 지연을 의미하며, 현금흐름에 부정적 영향을 줄 수 있습니다.',
          '다음 분기 매출채권 회수 개선 여부 및 고객 신용도 점검',
          evidence,
          'skip'
        )
        if (checkpoint) checkpoints.push(checkpoint)
      }
    }
  }

  return checkpoints
}

/**
 * 4. 일회성/품질 경고 (PDF 키워드 기반)
 * 구조조정, 손상차손, 충당부채, 회계정책 변경 키워드가 근거로 발견 -> "정상화 필요"
 */
function checkQualityWarnings(bundle: AnalysisBundle): Checkpoint[] {
  const checkpoints: Checkpoint[] = []

  // PDF에서 키워드 검색
  const qualityKeywords = [
    '구조조정', '리스트럭처링', 'restructuring',
    '손상차손', '손상', 'impairment',
    '충당부채', '충당', 'provision',
    '회계정책 변경', '회계처리 변경', 'accounting policy change',
    '일회성 비용', '특별 손실', 'extraordinary',
  ]

  const pdfEvidence = bundle.allEvidence.filter(e => 
    e.sourceType === 'PDF' && 
    e.quote && 
    qualityKeywords.some(keyword => 
      e.quote!.toLowerCase().includes(keyword.toLowerCase())
    )
  )

  if (pdfEvidence.length > 0) {
    // 키워드별로 그룹화
    const keywordGroups = new Map<string, EvidenceRef[]>()
    
    pdfEvidence.forEach(evidence => {
      const matchedKeyword = qualityKeywords.find(keyword => 
        evidence.quote!.toLowerCase().includes(keyword.toLowerCase())
      )
      if (matchedKeyword) {
        const key = matchedKeyword
        if (!keywordGroups.has(key)) {
          keywordGroups.set(key, [])
        }
        keywordGroups.get(key)!.push(evidence)
      }
    })

    keywordGroups.forEach((evidence, keyword) => {
      const checkpoint = createCheckpoint(
        `ews-quality-${keyword.replace(/\s+/g, '-')}`,
        '정상화 필요',
        `"${keyword}" 관련 내용이 보고서에서 발견되었습니다.`,
        '일회성 비용이나 회계정책 변경은 수익 품질에 영향을 줄 수 있으며, 정상화 여부를 확인해야 합니다.',
        '다음 분기 해당 항목의 정상화 여부 및 재발 방지 대책 확인',
        evidence,
        'skip'
      )
      if (checkpoint) checkpoints.push(checkpoint)
    })
  }

  return checkpoints
}

/**
 * 5. 가이던스/전망 (PDF 키워드 기반)
 * "outlook, guidance, 전망, 불확실" 등 -> "다음 분기 확인 포인트"
 */
function checkGuidance(bundle: AnalysisBundle): Checkpoint[] {
  const checkpoints: Checkpoint[] = []

  // PDF에서 키워드 검색
  const guidanceKeywords = [
    'outlook', 'guidance', '전망', '예상', '불확실', 'uncertainty',
    '예측', 'forecast', '기대', 'expectation',
  ]

  const pdfEvidence = bundle.allEvidence.filter(e => 
    e.sourceType === 'PDF' && 
    e.quote && 
    guidanceKeywords.some(keyword => 
      e.quote!.toLowerCase().includes(keyword.toLowerCase())
    )
  )

  if (pdfEvidence.length > 0) {
    // 중복 제거
    const uniqueEvidence = pdfEvidence.filter((e, i, arr) => 
      arr.findIndex(a => 
        a.fileId === e.fileId && 
        a.locator.page === e.locator.page &&
        a.quote === e.quote
      ) === i
    )

    if (uniqueEvidence.length > 0) {
      const checkpoint = createCheckpoint(
        'ews-guidance',
        '다음 분기 확인 포인트',
        '경영진의 전망/가이던스 관련 언급이 발견되었습니다.',
        '경영진의 전망은 향후 실적 방향성을 파악하는 중요한 단서입니다.',
        '다음 분기 실적이 전망과 일치하는지 확인',
        uniqueEvidence,
        'skip'
      )
      if (checkpoint) checkpoints.push(checkpoint)
    }
  }

  return checkpoints
}
