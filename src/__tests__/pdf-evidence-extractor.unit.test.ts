/**
 * PDF 근거 추출 유틸리티 단위 테스트
 */

import { extractPDFEvidence } from '@/lib/analysis/evidence/pdf-evidence-extractor'

describe('pdf-evidence-extractor', () => {
  describe('extractPDFEvidence', () => {
    it('should include Step1 relevant sections (위험요인/규제) even when businessPages is set', () => {
      // pageMap: 1~10 페이지 (다양한 토픽의 문단 포함)
      const pageMap: Record<number, string> = {}
      
      // p1: 시장/수요 관련
      pageMap[1] = '시장 환경 섹션입니다.\n\n시장 성장률이 둔화되고 있으며, 수요 전망이 불확실합니다. 시장 점유율 확대를 위한 전략이 필요합니다. 고객 니즈 변화에 빠르게 대응해야 합니다.'
      
      // p2: 사업구조/가격 관련 문단 (더 풍부한 키워드, 여러 문단)
      pageMap[2] = '사업의 내용 섹션입니다.\n\n주요 제품은 가전제품과 모바일 기기입니다. 제품 포트폴리오를 다양화하고 고객에게 차별화된 가치를 제공하고 있습니다. 가격 경쟁이 치열하고 판가 하락 압력이 지속되고 있습니다. 원가 절감과 마진 개선이 중요한 과제입니다. 비용 구조를 개선하여 경쟁력을 강화하고 있습니다.\n\n사업 부문별 매출 구성이 다양화되고 있으며, 각 세그먼트에서 경쟁력을 확보하고 있습니다. 고객 니즈에 맞춘 제품 개발과 마케팅 전략을 추진하고 있습니다.'
      
      // p3: 경쟁 관련
      pageMap[3] = '경쟁 현황 섹션입니다.\n\n경쟁이 치열해지고 있으며, 중국 업체들의 추격이 거세지고 있습니다. 시장 점유율 확보를 위한 차별화 전략이 필요합니다. 경쟁사 대비 경쟁력을 강화해야 합니다.'
      
      // p4: 가격/원가 관련 (여러 문단)
      pageMap[4] = '가격 정책 섹션입니다.\n\n가격 인상 여력이 제한적이며, 판가 하락 압력이 지속됩니다. 원가 절감을 통한 마진 개선이 핵심 과제입니다. 비용 구조 최적화가 필요합니다.\n\nASP 하락 추세가 지속되고 있으며, 가격 경쟁이 치열합니다. 원가 절감 노력을 통해 마진을 개선하고 있습니다.'
      
      // p5: 생산/공급망 관련 (여러 문단)
      pageMap[5] = '생산 현황 섹션입니다.\n\n공장 가동률을 높이고 생산 능력을 확대하고 있습니다. 공급망 안정화를 위해 부품 조달 다각화를 추진하고 있습니다. 물류 체계를 개선하여 효율성을 높이고 있습니다.\n\n원자재 가격 변동에 대응하기 위해 조달 다각화를 추진하고 있으며, 재고 관리 효율화를 통해 비용을 절감하고 있습니다.'
      
      // p6: 시장/수요 관련 (여러 문단)
      pageMap[6] = '시장 전망 섹션입니다.\n\n시장 성장 전망이 긍정적이며, 수요 증가가 예상됩니다. 교체 수요와 신규 투자가 시장을 견인할 것으로 전망됩니다.\n\n시장 환경 변화에 빠르게 대응하고 있으며, 고객 니즈 변화를 반영한 제품 개발을 추진하고 있습니다.'
      
      // p7: 경쟁 관련 (여러 문단)
      pageMap[7] = '경쟁 환경 섹션입니다.\n\n경쟁 강도가 높아지고 있으며, 점유율 경쟁이 치열합니다. 가격 경쟁을 피하고 차별화된 제품으로 경쟁력을 확보해야 합니다.\n\n경쟁사 대비 경쟁력을 강화하기 위해 기술 개발과 마케팅에 투자하고 있으며, 시장 점유율 확대를 추진하고 있습니다.'
      
      // p8: 규제/리스크 관련 문단 (더 풍부한 키워드, 여러 문단)
      pageMap[8] = '위험요인 섹션입니다.\n\n환경 규제 및 인증 절차가 강화되고 있습니다. 각국 정부의 환경 정책 변화에 따라 제품 인증 요건이 복잡해지고 있습니다. 관세 정책 변화로 인한 리스크가 증가하고 있으며, 환율 변동이 수익성에 큰 영향을 미칩니다. 소송 및 제재 위험도 존재하며, 이러한 위험요인을 지속적으로 모니터링하고 대응 방안을 마련하고 있습니다.\n\n환경 규제 강화에 대응하기 위해 친환경 제품 개발에 투자하고 있으며, 인증 절차를 준수하고 있습니다. 환율 변동 리스크를 관리하기 위해 헤징 전략을 수립하고 있습니다.'
      
      // p9: 규제/리스크 관련 (여러 문단)
      pageMap[9] = '규제 환경 섹션입니다.\n\n환경 규제가 강화되고 있으며, 인증 절차가 복잡해지고 있습니다. 관세 정책 변화에 대비해야 하며, 정책 리스크를 관리해야 합니다.\n\n각국 정부의 규제 정책 변화에 대응하기 위해 지속적으로 모니터링하고 있으며, 규제 준수를 위한 내부 시스템을 강화하고 있습니다.'
      
      // p10: 기타
      pageMap[10] = '기타 섹션입니다.\n\n회사는 지속적인 성장을 위해 다양한 노력을 기울이고 있습니다. 재고 관리와 물류 효율화를 통해 경쟁력을 강화하고 있습니다.'
      
      // businessPages: [2,3]
      const businessPages = [2, 3]
      
      // sectionMap/headingMap (더 많은 페이지에 Step1 관련 섹션 추가)
      const sectionMap: Record<number, string> = {
        2: '사업의 내용',
        4: '가격 정책', // 가격 관련
        6: '시장 전망', // 시장 관련
        7: '경쟁 환경', // 경쟁 관련
        8: '위험요인',
        9: '규제 환경', // 규제 관련
      }
      
      const headingMap: Record<number, string> = {
        2: '주요 제품',
        4: '가격 및 원가',
        6: '시장 및 수요',
        7: '경쟁 현황',
        8: '환경 규제 및 인증',
        9: '규제 및 리스크',
      }
      
      const result = extractPDFEvidence({
        pageMap,
        sectionMap,
        headingMap,
        businessPages,
      })
      
      // 1. 결과에 page=8이 포함되어야 함 (Step1 관련 섹션)
      const page8Evidence = result.find(ev => ev.sourceInfo.page === 8)
      expect(page8Evidence).toBeDefined()
      
      // 2. page=8의 evidence.topic이 '규제/리스크'로 분류되어야 함
      expect(page8Evidence?.topic).toBe('규제/리스크')
      
      // 3. 결과 길이가 9 이상이어야 함 (maxTotal=40, maxPerTopic=8로 상향 조정됨, 실제 결과는 9개)
      expect(result.length).toBeGreaterThanOrEqual(9)
      
      // 4. businessPages(2,3)도 포함되어야 함
      const page2Evidence = result.find(ev => ev.sourceInfo.page === 2)
      const page3Evidence = result.find(ev => ev.sourceInfo.page === 3)
      expect(page2Evidence).toBeDefined()
      expect(page3Evidence).toBeDefined()
    })
    
    it('should fallback to all pages when no businessPages and no Step1 relevant sections', () => {
      const pageMap: Record<number, string> = {
        1: '페이지 1 내용입니다.\n\n회사는 전자제품 제조 및 판매를 주요 사업으로 영위하고 있습니다. 주요 제품으로는 가전제품, 모바일 기기, 디스플레이 등이 있으며, 국내외 시장에서 경쟁력을 확보하고 있습니다. 최근에는 신기술 개발과 디지털 전환에 투자하여 성장 동력을 강화하고 있습니다.',
        2: '페이지 2 내용입니다.\n\n시장 환경이 급변하고 있으며, 경쟁이 치열해지고 있습니다. 고객 니즈에 빠르게 대응하고 차별화된 제품을 제공하는 것이 중요합니다. 제품 포트폴리오를 다양화하고 고객에게 차별화된 가치를 제공하고 있습니다.',
      }
      
      const result = extractPDFEvidence({
        pageMap,
      })
      
      // businessPages와 Step1 관련 섹션이 없으면 전체 페이지 처리
      expect(result.length).toBeGreaterThan(0)
    })
    
    it('should merge short paragraphs (MIN_LEN=140) for cyclical/regulation topics', () => {
      // 규제/경기 관련 문장이 2~3개 짧은 문단으로 끊겨 있는 케이스
      // 각 문단이 약 50-60자 정도로 짧게 구성하여 병합이 필요하도록 함
      const pageMap: Record<number, string> = {
        1: '시장 환경 악화로 수요 둔화가 나타날 수 있습니다. 소비 심리 위축과 구매력 약화가 지속되고 있습니다.\n\n금리 변동에 따라 소비 심리가 위축될 수 있습니다. 경기 변동성 증가로 인해 불확실성이 높아지고 있습니다.\n\n경기 회복 전망이 불확실하며, 업황이 악화될 가능성이 있습니다. 수요 부진이 지속될 경우 실적에 부정적 영향을 미칠 수 있습니다.',
        2: '환경 규제 강화로 인해 제품 인증 요건이 복잡해지고 있습니다. 각국 정부의 환경 정책 변화에 따라 대응이 필요합니다.\n\n에너지 효율 인증 절차가 변경되어 비용이 증가할 수 있습니다. 인증 요건 준수를 위한 추가 투자가 필요할 수 있습니다.\n\n탄소 배출 규제가 강화되면서 제조 과정에 추가 비용이 발생할 수 있습니다. 온실가스 배출권 비용 증가로 인해 원가 부담이 커질 수 있습니다.',
      }
      
      const sectionMap: Record<number, string> = {
        1: '시장 전망',
        2: '위험요인',
      }
      
      const headingMap: Record<number, string> = {
        1: '시장 환경',
        2: '환경 규제',
      }
      
      const result = extractPDFEvidence({
        pageMap,
        sectionMap,
        headingMap,
      })
      
      // 1. page=1에서 시장/수요 관련 evidence가 하나로 병합되었는지 확인
      const page1Evidences = result.filter(ev => ev.sourceInfo.page === 1)
      const mergedCyclicalEvidence = page1Evidences.find(ev => 
        ev.text.includes('시장 환경 악화') && 
        ev.text.includes('금리 변동') &&
        ev.text.includes('경기 회복')
      )
      expect(mergedCyclicalEvidence).toBeDefined()
      
      // 2. 병합된 evidence.text 길이가 MIN_LEN(140) 이상인지 확인
      if (mergedCyclicalEvidence) {
        expect(mergedCyclicalEvidence.text.length).toBeGreaterThanOrEqual(140)
      }
      
      // 3. page=2에서 규제/리스크 관련 evidence가 하나로 병합되었는지 확인
      const page2Evidences = result.filter(ev => ev.sourceInfo.page === 2)
      const mergedRegulationEvidence = page2Evidences.find(ev => 
        ev.text.includes('환경 규제 강화') && 
        ev.text.includes('에너지 효율 인증') &&
        ev.text.includes('탄소 배출 규제')
      )
      expect(mergedRegulationEvidence).toBeDefined()
      
      // 4. 병합된 evidence.text 길이가 MIN_LEN(140) 이상인지 확인
      if (mergedRegulationEvidence) {
        expect(mergedRegulationEvidence.text.length).toBeGreaterThanOrEqual(140)
      }
    })
  })
})
