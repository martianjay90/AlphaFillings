/**
 * Step1 리포트 텍스트 생성 유틸 단위 테스트
 * C1/C2 결과 검증
 */

import { buildStep1ReportText } from '@/lib/analysis/industry/step1-report-text'
import type { StepOutput, EvidenceRef, IndustryClassification } from '@/types/analysis-bundle'

describe('step1-report-text', () => {
  describe('buildStep1ReportText', () => {
    it('should not include quote in main text, only [E1] reference', () => {
      // 테스트 1: 본문에 quote가 나오지 않고 [E1]로만 표기되는지
      const industry: IndustryClassification = {
        label: '전자제품',
        confidence: 0.9,
        coreCategories: ['전자제품'],
      }

      // quote는 긴 원문
      const quoteText = '회사는 전자제품 제조 및 판매를 주요 사업으로 영위하고 있습니다. 주요 제품으로는 가전제품, 모바일 기기, 디스플레이 등이 있으며, 국내외 시장에서 경쟁력을 확보하고 있습니다. 최근에는 신기술 개발과 디지털 전환에 투자하여 성장 동력을 강화하고 있습니다.'

      const evidence: EvidenceRef = {
        sourceType: 'PDF',
        fileId: 'pdf',
        locator: { page: 5 },
        quote: quoteText
      }

      // observation은 quote의 요약 (짧은 버전)
      const step: StepOutput = {
        step: 1,
        title: '산업 및 경쟁환경',
        summaryCards: [],
        findings: [
          {
            id: 'step01-finding-cyclical',
            category: 'Risk',
            severity: 'info',
            text: '관찰: 전자제품 제조 및 판매를 주요 사업으로 영위. 근거: 근거 목록 참조 시사점: 매크로(경기·금리) 변화에 따라 수요 변동 가능성이 높아 경기 민감도가 높은 것으로 판단됨',
            evidence: [evidence]
          }
        ],
        checkpoints: []
      }

      const reportText = buildStep1ReportText(step, industry)

      // 본문(핵심 관찰 섹션) 추출
      const mainTextMatch = reportText.match(/\[핵심 관찰\]([\s\S]*?)(?=\[추가 확인\]|\[근거 목록\]|$)/)
      expect(mainTextMatch).toBeTruthy()
      const mainText = mainTextMatch![1]

      // 근거 목록 섹션 추출
      const evidenceListMatch = reportText.match(/\[근거 목록\]([\s\S]*?)(?=\n\n|$)/)
      expect(evidenceListMatch).toBeTruthy()
      const evidenceList = evidenceListMatch![1]

      // 본문에 전체 quote가 포함되지 않음 (observation의 짧은 요약만 포함)
      expect(mainText).not.toContain('주요 제품으로는 가전제품, 모바일 기기, 디스플레이')
      expect(mainText).not.toContain('국내외 시장에서 경쟁력을 확보하고 있습니다')
      expect(mainText).not.toContain('신기술 개발과 디지털 전환에 투자')

      // 본문에 [E1] 표기 포함
      expect(mainText).toMatch(/근거:\s*\[E1\]/)

      // 근거 목록에 전체 quote 포함
      expect(evidenceList).toContain('[E1]')
      expect(evidenceList).toContain('p.5')
      expect(evidenceList).toContain('"회사는 전자제품 제조')
      expect(evidenceList).toContain('주요 제품으로는 가전제품') // 근거 목록에는 포함되어야 함
    })

    it('should deduplicate evidence with same page+quote in evidence list', () => {
      // 테스트 2: evidence 중복(page+quote 동일)일 때 [근거 목록]에 1개만 남는지
      const industry: IndustryClassification = {
        label: '전자제품',
        confidence: 0.9,
        coreCategories: ['전자제품'],
      }

      const commonQuote = '회사는 전자제품 제조 및 판매를 주요 사업으로 영위하고 있습니다.'
      const commonEvidence: EvidenceRef = {
        sourceType: 'PDF',
        fileId: 'pdf',
        locator: { page: 5 },
        quote: commonQuote
      }

      const step: StepOutput = {
        step: 1,
        title: '산업 및 경쟁환경',
        summaryCards: [],
        findings: [
          {
            id: 'step01-finding-cyclical',
            category: 'Risk',
            severity: 'info',
            text: '관찰: 회사는 전자제품 제조 및 판매를 주요 사업으로 영위하고 있습니다. 근거: 근거 목록 참조 시사점: 매크로(경기·금리) 변화에 따라 수요 변동 가능성이 높아 경기 민감도가 높은 것으로 판단됨',
            evidence: [commonEvidence] // 동일한 evidence
          },
          {
            id: 'step01-finding-competition',
            category: 'Risk',
            severity: 'info',
            text: '관찰: 경쟁 강도가 높고 가격·점유율 압박 가능성이 있어 경쟁 강도가 높은 것으로 판단됨. 근거: 근거 목록 참조 시사점: 경쟁 강도가 높고 가격·점유율 압박 가능성이 있어 경쟁 강도가 높은 것으로 판단됨',
            evidence: [commonEvidence] // 동일한 evidence (page와 quote가 같음)
          }
        ],
        checkpoints: []
      }

      const reportText = buildStep1ReportText(step, industry)

      // 근거 목록 섹션 추출
      const evidenceListMatch = reportText.match(/\[근거 목록\]([\s\S]*?)(?=\n\n|$)/)
      expect(evidenceListMatch).toBeTruthy()

      const evidenceList = evidenceListMatch![1]
      
      // [E1]은 1개만 존재
      const e1Matches = evidenceList.match(/\[E1\]/g)
      expect(e1Matches).toBeTruthy()
      expect(e1Matches!.length).toBe(1)

      // [E2]는 존재하지 않음
      const e2Matches = evidenceList.match(/\[E2\]/g)
      expect(e2Matches).toBeNull()

      // 두 finding 모두 [E1] 참조
      expect(reportText).toMatch(/\[경기민감도\][\s\S]*?근거:\s*\[E1\]/)
      expect(reportText).toMatch(/\[경쟁강도\][\s\S]*?근거:\s*\[E1\]/)
    })
    
    it('should hide section label when trait-section mismatch (cyclical + competition)', () => {
      // 테스트 3: cyclical trait의 evidence가 section='경쟁'이어도, 근거 목록에서 '경쟁'이 숨겨지는지
      const industry: IndustryClassification = {
        label: '전자제품',
        confidence: 0.9,
        coreCategories: ['전자제품'],
      }
      
      const evidence: EvidenceRef = {
        sourceType: 'PDF',
        fileId: 'pdf',
        locator: {
          page: 42,
          section: '경쟁', // cyclical과 불일치
          heading: ''
        },
        quote: '차 침투율 감소로 인한 경쟁 환경 변화가 예상됩니다.'
      }
      
      const step: StepOutput = {
        step: 1,
        title: '산업 및 경쟁환경',
        summaryCards: [],
        findings: [
          {
            id: 'step01-finding-cyclical',
            category: 'Risk',
            severity: 'info',
            text: '관찰: A 근거: 근거 목록 참조 시사점: B',
            evidence: [evidence]
          }
        ],
        checkpoints: []
      }
      
      const reportText = buildStep1ReportText(step, industry)
      
      // 근거 목록 섹션 추출
      const evidenceListMatch = reportText.match(/\[근거 목록\]([\s\S]*?)(?=\n\n|$)/)
      expect(evidenceListMatch).toBeTruthy()
      const evidenceList = evidenceListMatch![1]
      
      // '[E1] p.42'는 포함되어야 함
      expect(evidenceList).toContain('[E1]')
      expect(evidenceList).toContain('p.42')
      
      // '[E1] p.42 | 경쟁 |' 패턴이 없어야 함 (섹션 라벨이 숨겨져야 함)
      expect(evidenceList).not.toMatch(/\|\s*경쟁\s*\|/)
      
      // '[E1] p.42 | "quote"' 형태로만 표시되어야 함 (섹션 없이)
      expect(evidenceList).toMatch(/\[E1\].*p\.42.*"/)
    })
    
    it('should not generate footnote for hold finding (reasonCode exists)', () => {
      // 테스트 4: finding.reasonCode가 있고 evidence가 있어도, 리포트는 footnote를 만들지 않는다
      const industry: IndustryClassification = {
        label: '전자제품',
        confidence: 0.9,
        coreCategories: ['전자제품'],
      }
      
      const evidence: EvidenceRef = {
        sourceType: 'PDF',
        fileId: 'pdf',
        locator: {
          page: 8,
          section: '주요 제품',
          heading: '주요 제품'
        },
        quote: '주 제품은 가전제품, 모바일 기기, 디스플레이 등이 있습니다.'
      }
      
      const step: StepOutput = {
        step: 1,
        title: '산업 및 경쟁환경',
        summaryCards: [],
        findings: [
          {
            id: 'step01-finding-cyclical',
            category: 'Risk',
            severity: 'warn',
            text: '관찰: 판단 보류(근거 부족) - 경기민감도 평가를 위한 공시 근거 부족 근거: 근거 목록 참조 시사점: 다음 단계에서 확인 필요',
            evidence: [evidence],
            reasonCode: 'FINDING_EVIDENCE_LOW_QUALITY_CYCLICAL'
          }
        ],
        checkpoints: []
      }
      
      const reportText = buildStep1ReportText(step, industry)
      
      // 본문(핵심 관찰 섹션) 추출
      const mainTextMatch = reportText.match(/\[핵심 관찰\]([\s\S]*?)(?=\[추가 확인\]|\[근거 목록\]|$)/)
      expect(mainTextMatch).toBeTruthy()
      const mainText = mainTextMatch![1]
      
      // 1. '진단 코드' 문구가 절대 나오지 않는다
      expect(reportText).not.toContain('진단 코드')
      expect(mainText).not.toContain('진단 코드')
      
      // 2. '근거: 데이터 부족'이 반드시 나온다
      expect(mainText).toContain('근거: 데이터 부족')
      
      // 3. [E1] 같은 footnote 키가 생성되지 않는다
      expect(reportText).not.toContain('[E1]')
      expect(mainText).not.toContain('[E1]')
      
      // 4. [근거 목록] 섹션이 출력되지 않는다 (evidenceMap이 비어있으므로)
      expect(reportText).not.toContain('[근거 목록]')
    })
  })
})
