/**
 * Step 01: 산업 필터
 * 산업/경기민감/사이클/규제/경쟁구도 분석
 */

import type { AnalysisBundle, StepOutput, EvidenceRef } from '@/types/analysis-bundle'
import { createFinding, createCheckpoint } from '@/lib/analysis/evidence/assert-evidence'
import { STEP_TITLES, STEP_DESCRIPTIONS, STEP1_TEXT, STEP1_CHECKPOINT_TEMPLATES } from '@/ui/labels/analysisSteps.ko'
import { deriveIndustryTraits } from '@/lib/analysis/industry/industry-traits'
import { pickBestParagraph, summarizeDeterministic, sanitizeText } from '@/lib/analysis/industry/industry-evidence-selector'
import type { TraitType } from '@/lib/analysis/industry/industry-evidence-selector'
import { isStep1EvidenceAuditEnabled } from '@/lib/config/featureFlags'

export function runStep01(bundle: AnalysisBundle): StepOutput {
  const findings: StepOutput['findings'] = []
  const checkpoints: StepOutput['checkpoints'] = []
  const summaryCards: StepOutput['summaryCards'] = []

  // EvidenceRef 생성 (요구사항 D-3: company.industry.evidence 우선 사용)
  let stepEvidence: EvidenceRef[] = []
  
  if (bundle.company.industry?.evidence && bundle.company.industry.evidence.length > 0) {
    // company.industry.evidence를 EvidenceRef로 변환
    stepEvidence = bundle.company.industry.evidence
      .filter(e => e.excerpt || e.text)
      .map(e => {
        // sourceInfo에서 페이지 번호 추출
        const pageNum = e.sourceInfo?.page
        
        // excerpt 또는 text 사용
        const excerpt = e.text || e.excerpt || ''
        
        // EvidenceRef 형식으로 변환
        return {
          sourceType: 'PDF' as const,
          fileId: 'pdf',
          locator: {
            page: pageNum,
            lineHint: excerpt,
          },
          quote: excerpt,
        } as EvidenceRef
      })
      .slice(0, 3) // 최대 3개
  } else {
    // 폴백: 기존 로직
    stepEvidence = bundle.allEvidence.length > 0
      ? [bundle.allEvidence[0]]
      : []
  }
  
  const defaultEvidence = stepEvidence

  // 산업 분류 정보 처리
  if (bundle.company.industry) {
    const industry = bundle.company.industry
    const confidence = industry.confidence || 0

    // 카드1: 산업 분류
    summaryCards.push({
      label: '산업 분류',
      value: industry.label,
      evidence: defaultEvidence,
    })

    // 카드2: 확신도
    summaryCards.push({
      label: '확신도',
      value: `${Math.round(confidence * 100)}%`,
      evidence: defaultEvidence,
    })

    // 확신도가 낮으면 경고 추가
    if (confidence < 0.6) {
      const finding = createFinding(
        'step01-low-confidence',
        'Risk',
        'warn',
        '산업 분류 확신도 낮음 → 사업 내용/세그먼트로 재검증 필요',
        defaultEvidence,
        'warn'
      )
      if (finding) findings.push(finding)
    }
  } else {
    // 산업 정보가 없으면 미확인으로 표시
    summaryCards.push({
      label: '산업 분류',
      value: '미확인',
      note: '근거 필요',
    })
  }

  // 4개 trait 고정 findings 생성
  const industryEvidence = bundle.company.industry?.evidence || []
  
  // Trait별 한글명
  const traitLabels: Record<TraitType, string> = {
    cyclical: STEP1_TEXT.cyclicalSensitivity,
    competition: STEP1_TEXT.competitionIntensity,
    pricingPower: STEP1_TEXT.pricingPower,
    regulation: STEP1_TEXT.regulatoryIntensity,
  }
  
  // Trait별 시사점
  const traitImplications: Record<TraitType, string> = {
    cyclical: STEP1_TEXT.implicationCyclical,
    competition: STEP1_TEXT.implicationCompetition,
    pricingPower: STEP1_TEXT.implicationPricingPower,
    regulation: STEP1_TEXT.implicationRegulation,
  }
  
  // 4개 trait 고정 순서로 생성
  const traitList: TraitType[] = [
    'cyclical',
    'competition',
    'pricingPower',
    'regulation',
  ]
  
  // Audit 플래그 확인
  const enableAudit = isStep1EvidenceAuditEnabled()
  console.log('[AUDIT_FLAG]', {
    enabled: enableAudit,
    NEXT_PUBLIC_FEATURE_STEP1_EVIDENCE_AUDIT: process.env.NEXT_PUBLIC_FEATURE_STEP1_EVIDENCE_AUDIT,
    FEATURE_STEP1_EVIDENCE_AUDIT: process.env.FEATURE_STEP1_EVIDENCE_AUDIT,
  })
  const traitAudit: Record<string, any> = {}
  
  for (const trait of traitList) {
    // B2: selector 기반 최적 문단 선택
    const selectionResult = pickBestParagraph(trait, industryEvidence, enableAudit)
    const selectedEvidence = selectionResult.best
    const score = selectionResult.score
    const reasonCode = selectionResult.reasonCode
    
    // Audit 정보 수집
    if (enableAudit && selectionResult.devAudit) {
      traitAudit[trait] = selectionResult.devAudit
    }
    
    // Finding 생성
    if (selectedEvidence && score >= 20) {
      // 선택 성공 (점수 >= 20): 일반 finding 생성
      const rawText = selectedEvidence.text || selectedEvidence.excerpt || ''
      
      // section/heading을 lineHint로 짧게 합친 문자열 생성 (없으면 빈값)
      const section = selectedEvidence.sourceInfo?.section || ''
      const heading = selectedEvidence.sourceInfo?.heading || ''
      const lineHint = section || heading ? `${section}${heading ? ' | ' + heading : ''}` : undefined
      
      const evidenceRef: EvidenceRef = {
        sourceType: 'PDF' as const,
        fileId: 'pdf',
        locator: {
          page: selectedEvidence.sourceInfo?.page,
          section: selectedEvidence.sourceInfo?.section,
          heading: selectedEvidence.sourceInfo?.heading,
          lineHint: lineHint,
        },
        quote: rawText,  // 원문 저장 (표시용 요약/정리는 step1-report-text에서 처리)
      }
      
      // 관찰: 요지 1문장 추출 (페이지/섹션 문구 삽입 금지)
      const paragraphText = selectedEvidence.text || selectedEvidence.excerpt || ''
      const sanitizedText = sanitizeText(paragraphText)
      const observation = summarizeDeterministic(sanitizedText)
      
      // 근거: placeholder 사용 (상세 정보는 finding.evidence에만 저장)
      const evidencePlaceholder = STEP1_TEXT.findingEvidencePlaceholder
      
      // 시사점: trait implication
      const implication = traitImplications[trait] || ''
      
      // Finding.text 생성: "관찰: ... 근거: ... 시사점: ..."
      let findingText = `${STEP1_TEXT.findingObservationLabel}: ${observation} ${STEP1_TEXT.findingEvidenceLabel}: ${evidencePlaceholder} ${STEP1_TEXT.findingImplicationLabel}: ${implication}`
      
      // 줄바꿈 제거, 공백 정리, 500자 초과 시 절단
      findingText = findingText.replace(/\s+/g, ' ').trim()
      if (findingText.length > 500) {
        findingText = findingText.substring(0, 497) + '...'
      }
      
      const finding = createFinding(
        `step01-finding-${trait}`,
        'Risk',
        'info',
        findingText,
        [evidenceRef],
        'skip'
      )
      if (finding) {
        // reasonCode가 있으면 설정 (예: TOPIC_MISMATCH)
        if (reasonCode) {
          finding.reasonCode = `FINDING_${reasonCode}_${trait.toUpperCase()}`
        }
        findings.push(finding)
      }
    } else {
      // 선택 실패 또는 점수 < 20: hold 텍스트 생성
      const traitLabel = traitLabels[trait] || trait
      
      // reasonCode에 따른 finalReasonCode 설정 (내부 구분용, 사용자 문구와 무관)
      let finalReasonCode = `FINDING_INSUFFICIENT_EVIDENCE_${trait.toUpperCase()}`
      
      if (reasonCode === 'EVIDENCE_INSUFFICIENT') {
        finalReasonCode = `FINDING_EVIDENCE_INSUFFICIENT_${trait.toUpperCase()}`
      } else if (reasonCode === 'EVIDENCE_LOW_QUALITY') {
        finalReasonCode = `FINDING_EVIDENCE_LOW_QUALITY_${trait.toUpperCase()}`
      } else if (reasonCode === 'TOPIC_MISMATCH') {
        finalReasonCode = `FINDING_TOPIC_MISMATCH_${trait.toUpperCase()}`
      }
      
      // 표준 보류 문구 사용 (reasonCode와 무관하게 항상 동일)
      const holdText = `${STEP1_TEXT.findingObservationLabel}: ${STEP1_TEXT.findingHoldPrefix} - ${traitLabel} ${STEP1_TEXT.holdObservationSuffix} ${STEP1_TEXT.findingEvidenceLabel}: ${STEP1_TEXT.findingHoldEvidence} ${STEP1_TEXT.findingImplicationLabel}: ${STEP1_TEXT.holdImplicationDefault}`
      
      const finding = createFinding(
        `step01-finding-${trait}-hold`,
        'Risk',
        'warn',
        holdText.replace(/\s+/g, ' ').trim(),
        defaultEvidence.length > 0 ? defaultEvidence : [{ sourceType: 'PDF' as const, fileId: 'pdf', locator: {}, quote: '' }],
        'warn'
      )
      if (finding) {
        finding.reasonCode = finalReasonCode
        findings.push(finding)
      }
    }
  }
  
  // 보류된 findings 기반 체크포인트 생성
  // findings 중 reasonCode가 존재하는 trait별로 체크포인트 1개씩 생성
  
  // reasonCode에서 trait 추출하는 헬퍼 함수
  const extractTraitFromReasonCode = (reasonCode: string | undefined): TraitType | null => {
    if (!reasonCode) return null
    
    // 패턴: FINDING_INSUFFICIENT_EVIDENCE_CYCLICAL, FINDING_EVIDENCE_LOW_QUALITY_COMPETITION 등
    const match = reasonCode.match(/_(CYCLICAL|COMPETITION|PRICINGPOWER|REGULATION)$/)
    if (!match) return null
    
    const traitUpper = match[1]
    // CYCLICAL -> cyclical, COMPETITION -> competition 등
    const traitMap: Record<string, TraitType> = {
      'CYCLICAL': 'cyclical',
      'COMPETITION': 'competition',
      'PRICINGPOWER': 'pricingPower',
      'REGULATION': 'regulation',
    }
    
    return traitMap[traitUpper] || null
  }
  
  // 보류된 findings 추출 (reasonCode가 있는 finding)
  const pendingFindings = findings.filter(f => f.reasonCode)
  
  if (pendingFindings.length > 0) {
    const coreCategory = bundle.company.industry?.coreCategories?.[0] || ''
    
    // 템플릿 선택 (코어카테고리별 또는 default)
    const templates = STEP1_CHECKPOINT_TEMPLATES[coreCategory as keyof typeof STEP1_CHECKPOINT_TEMPLATES] 
      || STEP1_CHECKPOINT_TEMPLATES.default
    
    // trait별로 1개씩만 생성 (중복 방지)
    const processedTraits = new Set<TraitType>()
    
    for (const finding of pendingFindings) {
      const trait = extractTraitFromReasonCode(finding.reasonCode)
      if (!trait || processedTraits.has(trait)) continue
      
      // 템플릿에서 해당 trait 템플릿 찾기
      const template = templates[trait]
      if (!template) continue
      
      processedTraits.add(trait)
      
      // 체크포인트 생성
      const checkpoint = createCheckpoint(
        `step01-checkpoint-${trait}-${processedTraits.size}`,
        '', // title은 비워두고 UI에서 표시하지 않음
        template.whatToWatch,
        '', // whyItMatters 제거 (2줄만 출력)
        template.checkLocation, // nextQuarterAction에 checkLocation 사용
        finding.evidence.length > 0 ? finding.evidence : defaultEvidence,
        'warn'
      )
      
      if (checkpoint) {
        // confirmQuestion 필드 세팅
        checkpoint.confirmQuestion = template.confirmQuestion
        checkpoints.push(checkpoint)
      }
      
      // 최대 4개까지만 생성
      if (checkpoints.length >= 4) break
    }
  }

  // Audit 출력 (플래그 ON일 때만)
  if (enableAudit && Object.keys(traitAudit).length > 0) {
    const companyName = bundle.company.name || bundle.company.ticker || 'Unknown'
    const extractedEvidenceTotal = industryEvidence.length
    
    // pagesToProcessCount는 PDF extractor 내부 정보이므로 접근 불가
    // 대신 extractedEvidenceTotal만 사용
    const auditData = {
      company: companyName,
      extractedEvidenceTotal,
      traitAudit,
    }
    
    console.log('STEP1_EVIDENCE_AUDIT', JSON.stringify(auditData, null, 2))
  } else if (enableAudit) {
    // 플래그는 ON이지만 traitAudit이 비어있는 경우
    console.log('[AUDIT_FLAG] enableAudit=true but traitAudit is empty. traitAudit keys:', Object.keys(traitAudit))
  }

  return {
    step: 1,
    title: STEP_TITLES[1],
    summaryCards,
    findings,
    checkpoints,
  }
}
