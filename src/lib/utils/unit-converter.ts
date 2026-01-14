/**
 * 단위 변환 유틸리티
 * 표준 단위 상수 고정 및 변환 함수
 */

// 표준 단위 상수 (고정)
export const UNIT_CONSTANTS = {
  /** 1억원 = 100,000,000 원 */
  ONE_HUNDRED_MILLION: 100_000_000, // 1e8
  
  /** 1조원 = 1,000,000,000,000 원 */
  ONE_TRILLION: 1_000_000_000_000, // 1e12
  
  /** 1만원 = 10,000 원 */
  TEN_THOUSAND: 10_000, // 1e4
  
  /** 1천원 = 1,000 원 */
  ONE_THOUSAND: 1_000, // 1e3
} as const

/**
 * 원 단위 금액을 억/조 단위로 변환하여 표시
 * 조/억 변환: 1조 = 10,000억 (수학적으로 일치)
 * @param amount 원 단위 금액 (정규화된 KRW 원 단위)
 * @param options 옵션
 * @returns 포맷된 문자열 (예: "65.35조 (653,500억)", "21.87억")
 */
export function formatKRWAmount(
  amount: number,
  options: {
    /** 소수점 자릿수 (기본값: 2) */
    decimals?: number
    /** 항상 억 단위로 표시 (조 사용 안 함) */
    forceEok?: boolean
    /** 이중 표기 사용 여부 (조 + 괄호 억, 기본값: true) */
    showDualFormat?: boolean
  } = {}
): string {
  const { decimals = 2, forceEok = false, showDualFormat = true } = options
  
  if (isNaN(amount) || amount === 0) {
    return '0원'
  }
  
  // 절대값으로 계산 (부호는 나중에 표시)
  const absAmount = Math.abs(amount)
  const isNegative = amount < 0
  const signPrefix = isNegative ? '-' : ''
  
  // 1조 이상이면 조 단위 사용 (forceEok가 false일 때만)
  if (!forceEok && absAmount >= UNIT_CONSTANTS.ONE_TRILLION) {
    // 조 단위로 변환 (원본에서 직접 계산)
    const trillions = absAmount / UNIT_CONSTANTS.ONE_TRILLION
    const trillionsFormatted = trillions.toFixed(decimals)
    const trillionsDisplay = parseFloat(trillionsFormatted) // 반올림된 조 표기값
    
    // 동일한 원본을 억 단위로 변환 (1조 = 10,000억)
    const eok = absAmount / UNIT_CONSTANTS.ONE_HUNDRED_MILLION
    const decimalsEok = 1 // 억 단위는 항상 소수점 1자리
    const eokFormatted = eok.toFixed(decimalsEok)
    const eokDisplay = parseFloat(eokFormatted) // 반올림된 억 표기값
    
    // 개발 모드에서 반올림 허용 오차 기반 불일치 검증 (진짜 논리 오류만 감지)
    if (process.env.NODE_ENV !== 'production') {
      // 조 표기값을 억으로 재변환 (반올림된 값 기반)
      const impliedEokFromTrillionDisplay = trillionsDisplay * 10000 // 1조 = 10,000억
      
      // 표기된 값끼리 비교
      const diff = Math.abs(eokDisplay - impliedEokFromTrillionDisplay)
      
      // 반올림 허용 오차 계산
      // decimalsTrillion(조)의 최대 반올림 오차: ±0.5 * 10^(-decimalsTrillion) 조
      // 이를 억 단위로 변환: ±0.5 * 10^(-decimalsTrillion) * 10000 억
      const halfStepTrillionInEok = 0.5 * Math.pow(10, -decimals) * 10000
      
      // decimalsEok(억)의 최대 반올림 오차: ±0.5 * 10^(-decimalsEok) 억
      const halfStepEok = 0.5 * Math.pow(10, -decimalsEok)
      
      // 전체 허용 오차 = 조 반올림 오차 + 억 반올림 오차 + 부동소수점 오차
      const tolerance = halfStepTrillionInEok + halfStepEok + 1e-6
      
      // 진짜 논리 오류(단위 스케일 오류, 원본 혼용 등) 감지
      if (diff > tolerance) {
        // tolerance를 현저히 초과하는 경우에만 console.error (스케일 오류 가능성)
        if (diff > tolerance * 5) {
          console.error(
            `[UnitConverter] 금액 표기 불일치 (스케일 오류 의심): ` +
            `원본=${absAmount.toLocaleString()}원, ` +
            `조=${trillionsFormatted}조, ` +
            `억=${eokFormatted}억, ` +
            `조→억 변환=${impliedEokFromTrillionDisplay.toFixed(1)}억, ` +
            `차이=${diff.toFixed(1)}억 (허용 오차: ${tolerance.toFixed(2)}억)`
          )
        } else {
          // 약간 초과하는 경우는 품질 경고로만 처리
          console.warn(
            `[UnitConverter] 금액 표기 불일치 (경미): ` +
            `원본=${absAmount.toLocaleString()}원, ` +
            `조=${trillionsFormatted}조, ` +
            `억=${eokFormatted}억, ` +
            `차이=${diff.toFixed(1)}억 (허용 오차: ${tolerance.toFixed(2)}억)`
          )
        }
      }
    }
    
    // 이중 표기: 조 + 괄호 억
    if (showDualFormat) {
      // 천 단위 구분자 추가 (억 단위)
      const eokWithCommas = eokFormatted.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
      return `${signPrefix}${trillionsFormatted}조 (${eokWithCommas}억)`
    } else {
      return `${signPrefix}${trillionsFormatted}조`
    }
  }
  
  // 그 외는 억 단위 사용
  const eok = absAmount / UNIT_CONSTANTS.ONE_HUNDRED_MILLION
  return `${signPrefix}${eok.toFixed(decimals)}억`
}

/**
 * 원 단위 금액을 억/조 단위로 변환하여 숫자 반환
 * @param amount 원 단위 금액
 * @param unit 변환할 단위 ('eok' = 억, 'cho' = 조)
 * @returns 변환된 숫자
 */
export function convertKRWUnit(amount: number, unit: 'eok' | 'cho'): number {
  if (unit === 'cho') {
    return amount / UNIT_CONSTANTS.ONE_TRILLION
  }
  return amount / UNIT_CONSTANTS.ONE_HUNDRED_MILLION
}

/**
 * XBRL unitRef에서 실제 단위 스케일 추출
 * @param xmlDoc XBRL 문서
 * @param unitRef unitRef 속성 값
 * @returns 실제 단위 스케일 (1 = 원, 1e4 = 만원, 1e6 = 백만원, 1e8 = 억원 등)
 */
export function extractUnitScale(xmlDoc: Document, unitRef: string): number {
  if (!unitRef) return 1 // 기본값: 원
  
  try {
    const unitElement = xmlDoc.querySelector(`unit[id="${unitRef}"]`)
    if (!unitElement) return 1
    
    const measure = unitElement.querySelector('measure')
    if (!measure) return 1
    
    const measureText = measure.textContent || ''
    
    // XBRL 단위 패턴 분석
    // 예: "iso4217:KRW" (원), "xbrli:pure" (스케일 없음)
    // 또는 measure에 단위 정보가 명시된 경우
    
    // measure에서 단위 스케일 추출 시도
    // 일반적으로 XBRL에서는 decimals 속성으로 소수점 처리하지만,
    // 단위 자체에 스케일이 포함될 수도 있음
    
    // 기본적으로 KRW는 원 단위로 가정
    if (measureText.includes('KRW')) {
      return 1 // 원 단위
    }
    
    return 1
  } catch (error) {
    console.warn('[UnitConverter] 단위 스케일 추출 실패:', error)
    return 1
  }
}
