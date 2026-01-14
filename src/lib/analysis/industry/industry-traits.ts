/**
 * 산업 특성(trait) 판정 유틸리티
 * 공시 발췌 기반 근거 판정 및 업종 일반 특성 폴백 제공
 */

export type EvidenceLevel = '근거 있음' | '근거 제한' | '근거 부족'
export type TraitValue = '높음' | '보통' | '낮음' | '판단 불가'

export interface TraitResult {
  value: TraitValue
  evidenceLevel: EvidenceLevel
  note?: string // 업종 일반 특성 폴백 (근거 부족일 때만)
  evidence?: string[] // 내부 디버그/테스트용
}

export interface IndustryTraits {
  cyclical: TraitResult
  competition: TraitResult
  regulation: TraitResult
  pricingPower: TraitResult
}

/**
 * 근거 기반 trait 판정
 */
export function deriveIndustryTraits({
  industryLabel,
  evidenceTexts,
}: {
  industryLabel: string
  evidenceTexts: string[]
}): IndustryTraits {
  // 키워드 정의
  const cyclicalKeywords = ['경기', '금리', '소비', '수요 둔화', '수요 정체', '교체', '투자 감소']
  const competitionKeywords = ['가격 경쟁', '중국', '추격', '점유율', '경쟁 심화']
  const regulatoryKeywords = ['규제', '인증', '환경', '관세', '정책']
  const pricingPowerKeywords = {
    positive: ['프리미엄', '차별화', '브랜드', '가격 인상', '전가'],
    negative: ['가격 경쟁', '판가 하락', 'ASP 하락', '덤핑'],
  }

  // 키워드 매칭 함수
  const matchKeywords = (keywords: string[]): number => {
    const matchedKeywords = new Set<string>()

    for (const text of evidenceTexts) {
      const lowerText = (text || '').toLowerCase()
      for (const keyword of keywords) {
        const lowerKeyword = (keyword || '').toLowerCase()
        // 한글은 단어 경계(\\b)로 매칭이 잘 되지 않으므로 includes 기반으로 판정
        if (lowerKeyword && lowerText.includes(lowerKeyword)) {
          matchedKeywords.add(keyword)
        }
      }
    }

    return matchedKeywords.size
  }

  // evidenceLevel 판정
  const getEvidenceLevel = (matchCount: number): EvidenceLevel => {
    if (matchCount === 0) return '근거 부족'
    if (matchCount >= 2) return '근거 있음'
    return '근거 제한'
  }

  // 경기민감도
  const cyclicalMatches = matchKeywords(cyclicalKeywords)
  const cyclicalEvidenceLevel = getEvidenceLevel(cyclicalMatches)
  const cyclicalValue: TraitValue = cyclicalEvidenceLevel === '근거 부족'
    ? '판단 불가'
    : cyclicalMatches >= 2 ? '높음' : '보통'

  // 경쟁강도
  const competitionMatches = matchKeywords(competitionKeywords)
  const competitionEvidenceLevel = getEvidenceLevel(competitionMatches)
  const competitionValue: TraitValue = competitionEvidenceLevel === '근거 부족'
    ? '판단 불가'
    : competitionMatches >= 2 ? '높음' : '보통'

  // 규제강도
  const regulatoryMatches = matchKeywords(regulatoryKeywords)
  const regulatoryEvidenceLevel = getEvidenceLevel(regulatoryMatches)
  const regulatoryValue: TraitValue = regulatoryEvidenceLevel === '근거 부족'
    ? '판단 불가'
    : regulatoryMatches >= 2 ? '높음' : '보통'

  // 가격결정력
  const pricingPositiveMatches = matchKeywords(pricingPowerKeywords.positive)
  const pricingNegativeMatches = matchKeywords(pricingPowerKeywords.negative)
  const pricingMatches = pricingPositiveMatches + pricingNegativeMatches
  const pricingEvidenceLevel = getEvidenceLevel(pricingMatches)
  let pricingValue: TraitValue = '판단 불가'
  if (pricingEvidenceLevel !== '근거 부족') {
    if (pricingNegativeMatches > pricingPositiveMatches) {
      pricingValue = '낮음'
    } else if (pricingPositiveMatches >= 2) {
      pricingValue = '높음'
    } else {
      pricingValue = '보통'
    }
  }

  // 업종 일반 특성 폴백 (근거 부족일 때만)
  const getIndustryDefaultTrait = (trait: 'cyclical' | 'competition' | 'regulation' | 'pricingPower'): string | undefined => {
    // 제조업(가전/전자제품) 계열
    if (industryLabel.includes('가전') || industryLabel.includes('전자제품')) {
      const defaults: Record<string, string> = {
        cyclical: '높음',
        competition: '높음',
        regulation: '보통',
        pricingPower: '보통',
      }
      return defaults[trait]
    }
    
    // 제조업(반도체/메모리) 계열
    if (industryLabel.includes('반도체') || industryLabel.includes('메모리')) {
      const defaults: Record<string, string> = {
        cyclical: '높음',
        competition: '높음',
        regulation: '낮음',
        pricingPower: '낮음',
      }
      return defaults[trait]
    }
    
    // 제조업(디스플레이) 계열
    if (industryLabel.includes('디스플레이')) {
      const defaults: Record<string, string> = {
        cyclical: '높음',
        competition: '높음',
        regulation: '낮음',
        pricingPower: '낮음',
      }
      return defaults[trait]
    }
    
    // 기본 제조업
    if (industryLabel.includes('제조업')) {
      const defaults: Record<string, string> = {
        cyclical: '높음',
        competition: '높음',
        regulation: '보통',
        pricingPower: '보통',
      }
      return defaults[trait]
    }
    
    return undefined
  }

  // 업종 일반 특성 폴백 노트 생성 (근거 부족일 때만)
  const getNote = (trait: 'cyclical' | 'competition' | 'regulation' | 'pricingPower', evidenceLevel: EvidenceLevel): string | undefined => {
    if (evidenceLevel === '근거 부족') {
      const defaultTrait = getIndustryDefaultTrait(trait)
      return defaultTrait ? `${defaultTrait}` : undefined
    }
    return undefined
  }

  return {
    cyclical: {
      value: cyclicalValue,
      evidenceLevel: cyclicalEvidenceLevel,
      note: getNote('cyclical', cyclicalEvidenceLevel),
    },
    competition: {
      value: competitionValue,
      evidenceLevel: competitionEvidenceLevel,
      note: getNote('competition', competitionEvidenceLevel),
    },
    regulation: {
      value: regulatoryValue,
      evidenceLevel: regulatoryEvidenceLevel,
      note: getNote('regulation', regulatoryEvidenceLevel),
    },
    pricingPower: {
      value: pricingValue,
      evidenceLevel: pricingEvidenceLevel,
      note: getNote('pricingPower', pricingEvidenceLevel),
    },
  }
}
