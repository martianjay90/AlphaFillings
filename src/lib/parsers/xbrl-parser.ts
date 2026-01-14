/**
 * XBRL 파서
 * 재무상태표, 손익계산서, 현금흐름표 핵심 태그 데이터 추출
 */

import type { FinancialStatement, IncomeStatement, BalanceSheet, CashFlowStatement } from '@/types/financial';
import { CalculationError, InsufficientDataError } from '@/lib/utils/errors';
import { dlog } from '@/lib/utils/debug';
import type { CountryCode } from '@/types/industry';
import { XBRL_TAG_MAPPINGS, logMissingTag } from './xbrl-tag-mapper';
import { findFinancialItemByStructure, extractOriginalTextSnippet } from './xbrl-structural-analyzer';
import { 
  aggregateDepreciationAndAmortization, 
  findSimilarByLabel,
  KOREAN_KEYWORDS 
} from './xbrl-semantic-parser';
import { selectBestFact } from './xbrl-fact-selector';
import { extractPeriodInfo, selectBestContextRef, findBestInstantContextRef, type PeriodInfo } from './xbrl-period-selector';

/**
 * DOMParser 생성 (환경별 분기)
 * - 브라우저: window.DOMParser 사용
 * - Node/테스트: @xmldom/xmldom의 DOMParser 사용
 */
function createDOMParserInstance(): {
  parseFromString: (xmlContent: string, mimeType: string) => Document;
} {
  // 브라우저 환경
  if (typeof window !== 'undefined' && window.DOMParser) {
    const parser = new window.DOMParser();
    return {
      parseFromString: (xmlContent: string, mimeType: string) => {
        return parser.parseFromString(xmlContent, mimeType as DOMParserSupportedType);
      }
    };
  }
  
  // Node/테스트 환경: @xmldom/xmldom 사용
  try {
    // 동적 require로 런타임에만 로드 (브라우저 번들 크기 최적화)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { DOMParser: XMLLibDOMParser } = require('@xmldom/xmldom');
    const parser = new XMLLibDOMParser();
    return {
      parseFromString: (xmlContent: string, mimeType: string) => {
        return parser.parseFromString(xmlContent, mimeType) as Document;
      }
    };
  } catch (error) {
    throw new Error('DOMParser를 사용할 수 없습니다. 브라우저 환경이 아니면 @xmldom/xmldom 패키지가 필요합니다.');
  }
}

/**
 * XBRL 네임스페이스 매핑
 */
const XBRL_NAMESPACES = {
  kr: 'http://xbrl.kasb.or.kr',
  ifrs: 'http://xbrl.ifrs.org/taxonomy/2023-01-01/ifrs',
  gaap: 'http://xbrl.us/us-gaap/2023-01-31',
};

/**
 * XBRL 값 추출
 */
interface XBRLValue {
  value: number;
  unit: string;
  contextRef?: string;
  decimals?: string;
}

/**
 * CAPEX 정책 타입
 */
export type CAPEXPolicy = 'PPE_ONLY' | 'PPE_PLUS_INTANGIBLE'

/**
 * CAPEX 정책 상수 (기본값: PPE_ONLY)
 */
export const CAPEX_POLICY: CAPEXPolicy = 'PPE_ONLY'

/**
 * 날짜 문자열의 연도를 시프트 (YYYY-MM-DD 형식)
 * @param dateStr ISO 8601 날짜 문자열 (YYYY-MM-DD)
 * @param deltaYears 이동할 연도 수 (양수: 미래, 음수: 과거)
 * @returns 시프트된 날짜 문자열 (YYYY-MM-DD), 형식이 다르거나 파싱 실패 시 undefined
 */
function shiftYear(dateStr: string, deltaYears: number): string | undefined {
  try {
    // YYYY-MM-DD 형식 검증
    const dateRegex = /^(\d{4})-(\d{2})-(\d{2})$/
    const match = dateStr.match(dateRegex)
    if (!match) {
      return undefined
    }
    
    const year = parseInt(match[1], 10)
    const month = match[2]
    const day = match[3]
    
    // 유효한 연도 범위 검증 (1900-2100)
    if (isNaN(year) || year < 1900 || year > 2100) {
      return undefined
    }
    
    const newYear = year + deltaYears
    
    // 결과 연도 범위 검증
    if (newYear < 1900 || newYear > 2100) {
      return undefined
    }
    
    return `${newYear}-${month}-${day}`
  } catch (error) {
    return undefined
  }
}

/**
 * XBRL 파서
 */
export class XBRLParser {
  private xmlDoc: Document;
  private country: CountryCode;
  private reportEndDate: string | undefined; // 보고서 기준 종료일 캐시
  private contextDimCount: Map<string, number> = new Map(); // contextRef -> 차원 수 (explicitMember 개수)

  constructor(xmlContent: string, country: CountryCode = 'KR') {
    try {
      // 환경별 DOMParser 사용 (브라우저 또는 Node/테스트)
      const parser = createDOMParserInstance();
      this.xmlDoc = parser.parseFromString(xmlContent, 'text/xml') as Document;
      
      this.country = country;
      
      // 파싱 오류 체크 (querySelector 대신 getElementsByTagName 사용: Node.js/@xmldom/xmldom 호환)
      const errs1 = this.xmlDoc.getElementsByTagName('parsererror');
      const errs2 = (this.xmlDoc as any).getElementsByTagNameNS?.('*', 'parsererror');
      const hasErr = (errs1 && errs1.length > 0) || (errs2 && errs2.length > 0);
      if (hasErr) {
        throw new Error('XBRL XML 파싱 실패');
      }

      // 보고서 기준 종료일 추출 (최신 context의 endDate 사용)
      this.reportEndDate = this.extractReportEndDate();

      // 모든 context의 차원 수를 미리 계산하여 Map에 저장
      this.buildContextDimCountMap();
    } catch (error) {
      throw new CalculationError(
        'XBRL 파싱 중 오류가 발생했습니다.',
        'xbrl_parsing',
        { error: error instanceof Error ? error.message : '알 수 없는 오류' }
      );
    }
  }

  /**
   * 모든 context의 차원 수를 미리 계산하여 Map에 저장
   * 차원 수가 적을수록 재무제표 라인아이템에 가깝고, 많을수록 주석 테이블에 가깝다
   * 네임스페이스 호환성: xbrli:context 형태도 찾을 수 있도록 getElementsByTagNameNS 사용
   */
  private buildContextDimCountMap(): void {
    try {
      // 모든 context 요소 찾기 (네임스페이스 무관)
      const allContexts = this.xmlDoc.getElementsByTagNameNS('*', 'context');
      
      for (let i = 0; i < allContexts.length; i++) {
        const contextElem = allContexts[i];
        const contextId = contextElem.getAttribute('id');
        
        if (!contextId) {
          continue;
        }

        // explicitMember 개수 계산 (차원 수)
        // getElementsByTagNameNS를 사용하여 네임스페이스 무관하게 검색
        const explicitMembers = contextElem.getElementsByTagNameNS('*', 'explicitMember');
        const typedMembers = contextElem.getElementsByTagNameNS('*', 'typedMember');
        const dimensionCount = explicitMembers.length + typedMembers.length;

        this.contextDimCount.set(contextId, dimensionCount);
      }

      if (this.contextDimCount.size > 0) {
        dlog(`[XBRL Parser] ${this.contextDimCount.size}개 context의 차원 수 계산 완료`)
      }
    } catch (error) {
      console.warn('[XBRL Parser] context 차원 수 계산 실패:', error);
      // 실패해도 계속 진행 (차원 수 기반 선택은 보너스 기능)
    }
  }

  /**
   * contextRef의 차원 수 가져오기
   */
  private getContextDimCount(contextRef: string | null): number {
    if (!contextRef) {
      return Infinity; // contextRef가 없으면 최하위 우선순위
    }
    return this.contextDimCount.get(contextRef) ?? Infinity;
  }

  /**
   * 보고서 기준 종료일 추출 (최신 context의 endDate)
   * 네임스페이스 호환성: xbrli:context, xbrli:period 형태도 찾을 수 있도록 getElementsByTagNameNS 사용
   */
  private extractReportEndDate(): string | undefined {
    try {
      // getElementsByTagNameNS 사용 (네임스페이스 무관)
      const allContexts = this.xmlDoc.getElementsByTagNameNS('*', 'context')
      const endDates: string[] = []
      
      for (let i = 0; i < allContexts.length; i++) {
        const context = allContexts[i]
        const periods = context.getElementsByTagNameNS('*', 'period')
        if (periods.length > 0) {
          const period = periods[0]
          const endDateElems = period.getElementsByTagNameNS('*', 'endDate')
          const instantElems = period.getElementsByTagNameNS('*', 'instant')
          
          if (endDateElems.length > 0) {
            const endDate = endDateElems[0].textContent?.trim()
            if (endDate) endDates.push(endDate)
          }
          
          if (instantElems.length > 0) {
            const instant = instantElems[0].textContent?.trim()
            if (instant) endDates.push(instant)
          }
        }
      }
      
      if (endDates.length > 0) {
        // 가장 최신 날짜 반환
        endDates.sort((a, b) => b.localeCompare(a))
        const latestDate = endDates[0]
        dlog(`[XBRL Parser] 보고서 기준 종료일 추출: ${latestDate}`)
        return latestDate
      }
    } catch (error) {
      console.warn('[XBRL Parser] 보고서 기준 종료일 추출 실패:', error)
    }
    return undefined
  }

  /**
   * 회사명 추출 (dart-gcd:EntityRegistrantName 우선)
   * querySelectorAll 대신 안전한 방법 사용
   */
  extractCompanyName(): string {
    try {
      // 1순위: EntityRegistrantName (Local Name으로 검색)
      const entityRegistrantElements = this.xmlDoc.getElementsByTagNameNS('*', 'EntityRegistrantName')
      for (let i = 0; i < entityRegistrantElements.length; i++) {
        const element = entityRegistrantElements[i]
        const name = element.textContent?.trim()
        if (name && name.length > 0 && name.length < 100) {
          dlog(`[XBRL Parser] 회사명 발견: ${name} (EntityRegistrantName)`)
          return name
        }
      }
      
      // name 속성으로도 검색 (일부 XBRL에서 사용)
      try {
        const allElements = this.xmlDoc.getElementsByTagName('*')
        for (let i = 0; i < allElements.length; i++) {
          const element = allElements[i]
          const nameAttr = element.getAttribute('name')
          if (nameAttr && (nameAttr.includes('EntityRegistrantName') || nameAttr.includes('entityregistrantname'))) {
            const name = element.textContent?.trim()
            if (name && name.length > 0 && name.length < 100) {
              dlog(`[XBRL Parser] 회사명 발견: ${name} (name 속성: ${nameAttr})`)
              return name
            }
          }
        }
      } catch (error) {
        // name 속성 검색 실패는 무시
      }
      
      // 2순위: 다른 회사명 관련 태그 검색
      const entityTags = ['EntityName', 'CompanyName', 'RegistrantName']
      for (const tag of entityTags) {
        try {
          const elements = this.xmlDoc.getElementsByTagNameNS('*', tag)
          for (let i = 0; i < elements.length; i++) {
            const element = elements[i]
            const name = element.textContent?.trim()
            if (name && name.length > 0 && name.length < 100) {
              dlog(`[XBRL Parser] 회사명 발견: ${name} (태그: ${tag})`)
              return name
            }
          }
        } catch (error) {
          continue
        }
      }
    } catch (error) {
      console.warn('[XBRL Parser] 회사명 추출 중 오류:', error)
    }
    
    console.warn(`[XBRL Parser] 회사명을 찾을 수 없습니다.`)
    return '기업명 미확인'
  }

  /**
   * 태그로 값 찾기 (네임스페이스 독립적 검색 로직)
   * querySelectorAll 대신 getElementsByTagName/NS를 사용하여 콜론 포함 태그도 안전하게 검색
   * @param tags 검색할 태그 목록
   * @param fieldName 필드명 (로깅용)
   * @param options 옵션 (required: 필수 여부, default false)
   */
  /**
   * 최신 기간 정보 추출 (Consolidated 기준)
   * 모든 Income/Cashflow 항목이 같은 기간을 사용하도록 보장
   */
  private extractLatestPeriodInfo(): PeriodInfo | null {
    try {
      // 모든 context에서 Consolidated 기준 최신 기간 찾기
      const allContexts = this.xmlDoc.getElementsByTagNameNS('*', 'context')
      const consolidatedPeriods: PeriodInfo[] = []
      
      for (let i = 0; i < allContexts.length; i++) {
        const context = allContexts[i]
        const contextId = context.getAttribute('id')
        if (!contextId) continue
        
        // Consolidated 체크
        const explicitMembers = context.getElementsByTagNameNS('*', 'explicitMember')
        const hasSeparate = Array.from(explicitMembers).some(m => {
          const text = (m.textContent || '').toLowerCase()
          const dim = (m.getAttribute('dimension') || '').toLowerCase()
          return text.includes('separatemember') || text.includes('separate') || 
                 dim.includes('separatemember') || dim.includes('separate')
        })
        
        // Separate가 아닌 경우 (Consolidated 또는 dimension 없음)
        if (!hasSeparate) {
          const periodInfo = extractPeriodInfo(this.xmlDoc, contextId)
          if (periodInfo && (periodInfo.endDate || periodInfo.instant)) {
            consolidatedPeriods.push(periodInfo)
          }
        }
      }
      
      if (consolidatedPeriods.length === 0) {
        return null
      }
      
      // 최신 endDate/instant 기준으로 정렬
      consolidatedPeriods.sort((a, b) => {
        const dateA = a.endDate || a.instant || ''
        const dateB = b.endDate || b.instant || ''
        return dateB.localeCompare(dateA) // 최신이 앞
      })
      
      // 최신 기간 (YTD 우선, 없으면 Q, 없으면 FY)
      const latestDate = consolidatedPeriods[0].endDate || consolidatedPeriods[0].instant
      const sameDatePeriods = consolidatedPeriods.filter(p => 
        (p.endDate || p.instant) === latestDate
      )
      
      // YTD 우선 선택: startDate가 해당 연도 01-01인 기간 찾기
      const latestYear = latestDate ? new Date(latestDate).getFullYear() : null
      const ytdPeriod = sameDatePeriods.find(p => {
        if (p.periodType === 'YTD' && p.startDate && latestYear) {
          const startYear = new Date(p.startDate).getFullYear()
          const startMonth = new Date(p.startDate).getMonth() + 1
          const startDay = new Date(p.startDate).getDate()
          // startDate가 해당 연도 01-01이면 YTD
          return startYear === latestYear && startMonth === 1 && startDay === 1
        }
        return false
      })
      
      // YTD 우선, 없으면 Q, 없으면 FY
      const preferred = ytdPeriod || 
                       sameDatePeriods.find(p => p.periodType === 'YTD') ||
                       sameDatePeriods.find(p => p.periodType === 'Q') ||
                       sameDatePeriods[0]
      
      if (preferred) {
        // anchor 기간 확정 로그 (사용자 요청: 5~10줄 상세 로그)
        dlog(`[XBRL Parser] === anchor 기간 확정 (extractLatestPeriodInfo) ===`)
        dlog(`[XBRL Parser] 최신 기간 선택: ${preferred.periodTypeLabel || preferred.periodType}`)
        if (preferred.startDate && preferred.endDate) {
          dlog(`[XBRL Parser] anchor 기간(${preferred.startDate} ~ ${preferred.endDate})`)
        } else if (preferred.endDate) {
          dlog(`[XBRL Parser] anchor 기간(endDate=${preferred.endDate})`)
        } else if (preferred.instant) {
          dlog(`[XBRL Parser] anchor 기간(instant=${preferred.instant})`)
        }
        dlog(`[XBRL Parser] periodType: ${preferred.periodType}, periodTypeLabel: ${preferred.periodTypeLabel || 'N/A'}`)
        dlog(`[XBRL Parser] isConsolidated: ${preferred.isConsolidated ? 'Yes' : preferred.isSeparate ? 'No' : 'Unknown'}`)
        if (process.env.NODE_ENV !== 'production') {
          dlog(`[XBRL Parser] 후보 기간 수: ${consolidatedPeriods.length}개, 동일 날짜 기간 수: ${sameDatePeriods.length}개`)
          dlog(`[XBRL Parser] 최신 날짜: ${latestDate}`)
        }
      }
      
      return preferred || null
    } catch (error) {
      console.warn('[XBRL Parser] 최신 기간 정보 추출 실패:', error)
      return null
    }
  }

  private findValueByTags(
    tags: string[],
    fieldName: string,
    options: { 
      required?: boolean
      targetPeriod?: { startDate?: string; endDate?: string; instant?: string }
      anchorContextRef?: string // 동일 contextRef 우선 사용 (revenue에서 확정된 contextRef)
    } = {}
  ): XBRLValue | null {
    const { required = false, targetPeriod, anchorContextRef } = options
    const candidates: Array<{ element: Element; contextRef: string | null; value: number; unit: string }> = []
    const seenElements = new Set<Element>(); // 중복 방지용 Set
    
    // 1단계: 전체 태그명으로 검색 (getElementsByTagName 사용 - 콜론 포함 태그도 안전)
    for (const tag of tags) {
      try {
        // 태그명에서 localName 추출
        const tagParts = tag.split(':');
        const localName = tagParts.length > 1 ? tagParts[tagParts.length - 1] : tag;
        
        // getElementsByTagNameNS로 모든 네임스페이스에서 검색
        // 첫 번째 인자 '*'는 모든 네임스페이스를 의미
        const elements = this.xmlDoc.getElementsByTagNameNS('*', localName);
        
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          
          // 전체 태그명과 일치하는지 확인 (네임스페이스 포함)
          const elementTagName = element.tagName;
          if (tag === elementTagName || 
              elementTagName.endsWith(`:${localName}`) || 
              elementTagName === localName) {
            
            // 중복 체크
            if (seenElements.has(element)) {
              continue;
            }
            seenElements.add(element);
            
            // name 속성으로도 확인 (일부 XBRL에서 사용)
            const nameAttr = element.getAttribute('name');
            if (nameAttr && nameAttr !== tag && !nameAttr.endsWith(`:${localName}`)) {
              continue;
            }
            
            try {
              const value = this.extractValue(element);
              // 0값 제외 제거: 0도 유효한 값일 수 있음
              // nil/empty만 제외
              if (value !== null) {
                // xsi:nil 속성 체크
                const isNil = element.getAttribute('xsi:nil') === 'true' || 
                              element.getAttribute('nil') === 'true';
                if (!isNil) {
                  const contextRef = element.getAttribute('contextRef');
                  candidates.push({
                    element,
                    contextRef,
                    value: value.value,
                    unit: value.unit,
                  });
                }
              }
            } catch (error) {
              // extractValue 실패는 무시하고 계속 진행
              continue;
            }
          }
        }
      } catch (error) {
        // getElementsByTagNameNS 실패는 무시하고 계속 진행
        console.warn(`[XBRL Parser] 태그 ${tag} 검색 중 오류 (무시하고 계속):`, error);
        continue;
      }
    }

    // 2단계: Local Name만으로 검색 (네임스페이스 독립적) - 후보 추가 수집
    const localNames = tags.map(tag => {
      const parts = tag.split(':');
      return parts.length > 1 ? parts[parts.length - 1] : tag;
    }).filter((name, index, self) => self.indexOf(name) === index); // 중복 제거

    for (const localName of localNames) {
      try {
        // getElementsByTagNameNS로 모든 네임스페이스에서 localName 검색
        const elements = this.xmlDoc.getElementsByTagNameNS('*', localName);
        
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          
          // 중복 체크
          if (seenElements.has(element)) {
            continue;
          }
          
          const elementLocalName = element.localName || element.tagName.split(':').pop() || element.tagName;
          
          // 정확한 일치 또는 부분 일치 확인
          if (elementLocalName.toLowerCase() === localName.toLowerCase() ||
              elementLocalName.toLowerCase().includes(localName.toLowerCase()) ||
              localName.toLowerCase().includes(elementLocalName.toLowerCase())) {
            
            seenElements.add(element);
            
            try {
              const value = this.extractValue(element);
              // 0값 제외 제거: 0도 유효한 값일 수 있음
              // nil/empty만 제외
              if (value !== null) {
                // xsi:nil 속성 체크
                const isNil = element.getAttribute('xsi:nil') === 'true' || 
                              element.getAttribute('nil') === 'true';
                if (!isNil) {
                  const contextRef = element.getAttribute('contextRef');
                  candidates.push({
                    element,
                    contextRef,
                    value: value.value,
                    unit: value.unit,
                  });
                }
              }
            } catch (error) {
              continue;
            }
          }
        }
      } catch (error) {
        console.warn(`[XBRL Parser] Local Name ${localName} 검색 중 오류 (무시하고 계속):`, error);
        continue;
      }
    }

    // 3단계: 구조적 위치 분석으로 역추적 (후보 추가)
    if (candidates.length === 0) {
      const structuralHints = this.getStructuralHints(fieldName)
      const structuralElement = findFinancialItemByStructure(
        this.xmlDoc,
        fieldName,
        structuralHints
      )

      if (structuralElement) {
        const value = this.extractValue(structuralElement)
        if (value !== null) {
          const contextRef = structuralElement.getAttribute('contextRef')
          candidates.push({
            element: structuralElement,
            contextRef,
            value: value.value,
            unit: value.unit,
          })
        }
      }
    }

    // 4단계: 유사도 기반 매핑 (Label 필드 분석) - 후보 추가
    if (candidates.length === 0) {
      const targetKeywords = this.getTargetKeywords(fieldName)
      if (targetKeywords.length > 0) {
        const similarityMatch = findSimilarByLabel(this.xmlDoc, targetKeywords, fieldName)
        if (similarityMatch) {
          const value = this.extractValue(similarityMatch.element)
          if (value !== null) {
            const contextRef = similarityMatch.element.getAttribute('contextRef')
            candidates.push({
              element: similarityMatch.element,
              contextRef,
              value: value.value,
              unit: value.unit,
            })
          }
        }
      }
    }
    
    // 5단계: 기간 필터링 (targetPeriod가 지정된 경우) - 엄격한 매칭
    let filteredCandidates = candidates
    if (targetPeriod && candidates.length > 0) {
      // anchor 기간 정보 추출 (연도 확인용)
      const targetEndDate = targetPeriod.endDate || targetPeriod.instant
      const targetYear = targetEndDate ? new Date(targetEndDate).getFullYear() : null
      
      filteredCandidates = candidates.filter(candidate => {
        if (!candidate.contextRef) return false
        
        const periodInfo = extractPeriodInfo(this.xmlDoc, candidate.contextRef)
        if (!periodInfo) return false
        
        // PFY(전기) 제외: endDate/instant의 연도가 targetYear보다 작으면 제외
        const candidateEndDate = periodInfo.endDate || periodInfo.instant
        if (targetYear && candidateEndDate) {
          const candidateYear = new Date(candidateEndDate).getFullYear()
          if (candidateYear < targetYear) {
            // 전기(PFY) 컨텍스트 제외
            return false
          }
        }
        
        // anchor 기간과 정확히 일치하는 후보만 선택
        // 1) endDate/instant 일치 확인
        if (targetEndDate && candidateEndDate !== targetEndDate) {
          return false // endDate가 일치하지 않으면 제외
        }
        
        // 2) Income/Cashflow는 startDate도 정확히 일치해야 함
        // Balance는 instant만 확인 (startDate가 있어도 instant 우선)
        if (targetPeriod.instant) {
          // Balance: instant만 확인
          if (!periodInfo.instant || periodInfo.instant !== targetPeriod.instant) {
            return false
          }
        } else if (targetPeriod.startDate) {
          // Income/Cashflow: startDate도 정확히 일치해야 함
          if (!periodInfo.startDate || periodInfo.startDate !== targetPeriod.startDate) {
            return false // startDate가 없거나 일치하지 않으면 제외
          }
        }
        
        return true
      })
      
      // 필터링 결과 로깅 (PFY 제거 개수 포함)
      const removedCandidates = candidates.filter(c => !filteredCandidates.includes(c))
      const removedPFYCandidates = removedCandidates.filter(c => {
        if (!c.contextRef) return false
        const periodInfo = extractPeriodInfo(this.xmlDoc, c.contextRef)
        if (!periodInfo) return false
        const candidateEndDate = periodInfo.endDate || periodInfo.instant
        if (targetYear && candidateEndDate) {
          const candidateYear = new Date(candidateEndDate).getFullYear()
          return candidateYear < targetYear
        }
        return false
      })
      const examplePFYContextRef = removedPFYCandidates.length > 0 ? removedPFYCandidates[0].contextRef : undefined
      
      if (filteredCandidates.length === 0 && candidates.length > 0) {
        // anchor 기간 후보가 전혀 없으면 경고 (fallback 사용하지 않음)
        console.error(`[XBRL Parser] ${fieldName}: anchor 기간(${targetPeriod.startDate || 'N/A'} ~ ${targetPeriod.endDate || targetPeriod.instant || 'N/A'})와 일치하는 후보가 없습니다.`)
        console.error(`[XBRL Parser] ${fieldName}: totalCandidates=${candidates.length}, afterAnchorFilter=0, removedPFYCount=${removedPFYCandidates.length}, removedOtherCount=${removedCandidates.length - removedPFYCandidates.length}`)
        if (examplePFYContextRef) {
          console.error(`[XBRL Parser] ${fieldName}: examplePFYContextRef=${examplePFYContextRef}`)
        }
        // 필수 필드인 경우 null 반환 (fallback 사용하지 않음)
        if (required) {
          return null
        }
        // 선택적 필드인 경우에만 빈 배열로 진행 (나중에 null 반환)
        filteredCandidates = []
      } else if (filteredCandidates.length < candidates.length) {
        const excludedCount = candidates.length - filteredCandidates.length
        dlog(`[XBRL Parser] ${fieldName}: 기간 필터링 적용 - totalCandidates=${candidates.length}, afterAnchorFilter=${filteredCandidates.length}, removedPFYCount=${removedPFYCandidates.length}, removedOtherCount=${excludedCount - removedPFYCandidates.length}`)
        dlog(`[XBRL Parser] ${fieldName}: anchor 기간(${targetPeriod.startDate || 'N/A'} ~ ${targetPeriod.endDate || targetPeriod.instant || 'N/A'})과 일치하는 후보만 남았습니다.`)
        if (examplePFYContextRef && removedPFYCandidates.length > 0) {
          dlog(`[XBRL Parser] ${fieldName}: examplePFYContextRef=${examplePFYContextRef}`)
        }
      } else if (filteredCandidates.length === candidates.length && targetPeriod) {
        dlog(`[XBRL Parser] ${fieldName}: 모든 후보(${candidates.length}개)가 anchor 기간과 일치합니다. (PFY 없음)`)
      }
    }
    
    // 6단계: 최적 Fact 선택 (스코어링 기반, 차원 수 고려)
    if (filteredCandidates.length > 0) {
      // 차원 수가 적은 후보를 우선 선택하도록 보너스 점수 추가
      const candidatesWithDimScore = filteredCandidates.map(candidate => {
        const dimCount = this.getContextDimCount(candidate.contextRef);
        // 차원 수가 적을수록 높은 보너스 (0차원 = +100, 1차원 = +50, 2차원 = +25, 3차원 이상 = 감점)
        const dimBonus = dimCount === 0 ? 100 : dimCount === 1 ? 50 : dimCount === 2 ? 25 : -10 * (dimCount - 2);
        
        return {
          ...candidate,
          dimCount,
          dimBonus,
        };
      });

      // 차원 수 보너스를 반영하여 정렬 (차원 수가 적은 것이 우선)
      candidatesWithDimScore.sort((a, b) => {
        // 먼저 차원 수로 정렬 (적은 것이 우선)
        if (a.dimCount !== b.dimCount) {
          return a.dimCount - b.dimCount;
        }
        // 차원 수가 같으면 값이 큰 것이 우선 (재무제표 라인아이템은 보통 큰 값)
        return Math.abs(b.value) - Math.abs(a.value);
      });

      // anchorContextRef가 지정된 경우, 동일 contextRef를 가진 후보만 채택 (다르면 폐기)
      let topCandidates = candidatesWithDimScore
      if (anchorContextRef) {
        const anchorCandidates = candidatesWithDimScore.filter(c => c.contextRef === anchorContextRef)
        if (anchorCandidates.length > 0) {
          dlog(`[XBRL Parser] ${fieldName}: anchorContextRef(${anchorContextRef})와 일치하는 후보 ${anchorCandidates.length}개 발견. 우선 사용합니다.`)
          topCandidates = anchorCandidates
          // anchor contextRef가 있으면 차원 수와 관계없이 우선 사용
        } else {
          // anchorContextRef가 지정되었는데 일치하는 후보가 없으면 폐기 (fallback 금지)
          dlog(`[XBRL Parser] ${fieldName}: anchorContextRef(${anchorContextRef})와 일치하는 후보가 없습니다. null 반환 (fallback 금지).`)
          // null 반환을 위해 빈 배열로 설정 (나중에 null 반환)
          topCandidates = []
        }
      } else {
        // 차원 수가 가장 적은 후보들을 우선 선택
        const minDimCount = candidatesWithDimScore[0].dimCount;
        topCandidates = candidatesWithDimScore.filter(c => c.dimCount === minDimCount);
      }
      
      // 차원 수 분포 로깅 (검증용)
      const dimDistribution = new Map<number, number>();
      candidatesWithDimScore.forEach(c => {
        dimDistribution.set(c.dimCount, (dimDistribution.get(c.dimCount) || 0) + 1);
      });
      dlog(`[XBRL Parser] ${fieldName} 후보 차원 수 분포:`, Object.fromEntries(dimDistribution), `-> 최종 후보 ${topCandidates.length}개`)
      
      // 차원 수가 가장 적은 후보들에 대해 기존 selectBestFact 로직 적용
      const bestFact = selectBestFact(topCandidates, this.xmlDoc, this.contextDimCount)
      if (bestFact) {
        // 기간 선택: 최신 CFY 우선
        let finalContextRef = bestFact.contextRef
        if (finalContextRef) {
          // 필드 타입에 따라 기간 선택 (topCandidates 사용 - bestFact와 같은 최소 차원수 후보군에서만 선택)
          const fieldType = this.getFieldType(fieldName)
          const contextRefs = topCandidates
            .map(c => c.contextRef)
            .filter((ref): ref is string => ref !== null)
          
          if (contextRefs.length > 1) {
            // targetPeriod가 지정된 경우, 이미 필터링된 후보들이므로 anchor 기간과 일치하는 것만 있음
            // 하지만 추가로 점수화하여 최적 선택
            // 중요: IncomeStatement는 anchor 기간(YTD)을 강제하므로, preferredPeriodType도 일치시켜야 함
            let preferredPeriodType: 'Q' | 'YTD' | 'FY' | undefined
            if (targetPeriod && targetPeriod.startDate) {
              // targetPeriod가 지정된 경우, 해당 기간 타입 사용
              // startDate가 해당 연도 01-01이면 YTD
              const targetYear = targetPeriod.endDate ? new Date(targetPeriod.endDate).getFullYear() : null
              const startYear = new Date(targetPeriod.startDate).getFullYear()
              const startMonth = new Date(targetPeriod.startDate).getMonth() + 1
              const startDay = new Date(targetPeriod.startDate).getDate()
              if (targetYear && startYear === targetYear && startMonth === 1 && startDay === 1) {
                preferredPeriodType = 'YTD' // anchor 기간이 YTD인 경우
              } else {
                preferredPeriodType = 'Q' // 분기 기간
              }
            } else if (fieldType === 'income') {
              // targetPeriod가 없는 경우에만 기본값 사용
              // 손익계산서: 기본적으로 YTD 우선 (요구사항 변경: 분기보고서도 누적값 표시)
              preferredPeriodType = 'YTD'
            } else if (fieldType === 'cashflow') {
              // 현금흐름표: 누적(YTD) 우선 (요구사항: 누적 기준 명시)
              preferredPeriodType = 'YTD'
            } else {
              // 재무상태표: 연간(FY)
              preferredPeriodType = 'FY'
            }
            
            const bestContextRef = selectBestContextRef(
              contextRefs, 
              this.xmlDoc, 
              fieldType,
              preferredPeriodType,
              targetPeriod?.endDate || targetPeriod?.instant || this.reportEndDate
            )
            if (bestContextRef) {
              // 최적 contextRef에 해당하는 후보 찾기 (topCandidates에서 - bestFact와 같은 최소 차원수 후보군)
              const bestCandidate = topCandidates.find(c => c.contextRef === bestContextRef)
              if (bestCandidate) {
                // periodInfo 추출하여 검증 (KPI 디버깅용)
                const periodInfo = extractPeriodInfo(this.xmlDoc, bestContextRef)
                const dimCount = this.getContextDimCount(bestContextRef);
                const periodStr = periodInfo ? `${periodInfo.periodTypeLabel || periodInfo.periodType} (start=${periodInfo.startDate || 'N/A'}, end=${periodInfo.endDate || periodInfo.instant || 'N/A'})` : 'N/A'
                const consolidatedStr = periodInfo?.isConsolidated ? 'Consolidated' : periodInfo?.isSeparate ? 'Separate' : 'Unknown'
                
                // 최종 컨텍스트가 확정되면 반드시 해당 컨텍스트의 fact 반환 (역전 방지)
                // 다만, 값이 비정상이거나 명백한 오류(DiscontinuedOperationsMember 등)인 경우만 예외
                const isValueAbnormal = bestCandidate.value === 0
                const hasExcludedMember = bestContextRef && (
                  bestContextRef.toLowerCase().includes('discontinuedoperations') || 
                  bestContextRef.toLowerCase().includes('noncontrollinginterests')
                )
                const hasSegmentOrAxis = periodInfo?.hasSegmentOrAxis === true
                const hasHighDimCount = dimCount > 2
                
                // anchor 기간과 일치 여부 확인
                let periodMismatch = false
                if (targetPeriod && periodInfo) {
                  const candidateEndDate = periodInfo.endDate || periodInfo.instant
                  const targetEndDate = targetPeriod.endDate || targetPeriod.instant
                  const candidateStartDate = periodInfo.startDate
                  const targetStartDate = targetPeriod.startDate
                  
                  periodMismatch = Boolean(
                    (targetEndDate && candidateEndDate && candidateEndDate !== targetEndDate) ||
                    (targetStartDate && candidateStartDate && candidateStartDate !== targetStartDate)
                  )
                }
                
                // 최종 컨텍스트가 확정된 경우, 예외 상황이 아니면 반드시 bestCandidate 반환 (역전 방지)
                if (isValueAbnormal || hasExcludedMember || hasSegmentOrAxis || hasHighDimCount || periodMismatch) {
                  // 예외 상황: 값이 비정상이거나 명백한 오류인 경우만 bestFact 유지
                  console.warn(`[XBRL Parser] ⚠️ ${fieldName}: selectBestContextRef가 선택한 후보에 문제가 있습니다. bestFact를 유지합니다.`)
                  console.warn(`[XBRL Parser] ${fieldName}: bestContextRef=${bestContextRef}, value=${bestCandidate.value.toLocaleString()}`)
                  console.warn(`[XBRL Parser] ${fieldName}: 문제 사유 - isValueAbnormal=${isValueAbnormal}, hasExcludedMember=${hasExcludedMember}, hasSegmentOrAxis=${hasSegmentOrAxis}, hasHighDimCount=${hasHighDimCount}, periodMismatch=${periodMismatch}`)
                  dlog(`[XBRL Parser] ${fieldName}: bestFact 유지 - contextRef=${bestFact.contextRef}, value=${bestFact.value.toLocaleString()}`)
                  return {
                    value: bestFact.value,
                    unit: bestFact.unit,
                    contextRef: bestFact.contextRef || undefined,
                    decimals: bestFact.element.getAttribute('decimals') || undefined,
                  }
                } else {
                  // 정상: 최종 컨텍스트 확정 → 반드시 해당 컨텍스트의 fact 반환 (역전 방지)
                  dlog(`[XBRL Parser] ${fieldName} 최종 컨텍스트 확정: contextRef=${bestContextRef}, value=${bestCandidate.value.toLocaleString()}, 기간=${periodStr}, 차원수=${dimCount !== Infinity ? dimCount : 'unknown'}, ${consolidatedStr}`)
                  if (targetPeriod && periodInfo && process.env.NODE_ENV !== 'production') {
                    dlog(`[XBRL Parser] ✓ ${fieldName}: 선택된 컨텍스트가 anchor 기간과 일치합니다.`)
                  }
                  return {
                    value: bestCandidate.value,
                    unit: bestCandidate.unit,
                    contextRef: bestContextRef,
                    decimals: bestCandidate.element.getAttribute('decimals') || undefined,
                  }
                }
              } else {
                // bestContextRef가 topCandidates에 없는 경우 (논리적으로 발생하지 않아야 함)
                console.warn(`[XBRL Parser] ${fieldName}: selectBestContextRef가 반환한 contextRef(${bestContextRef})가 topCandidates에 없습니다. bestFact를 유지합니다.`)
              }
            }
          }
        }
        
        // bestFact가 anchor 기간과 일치하는지 검증 (하드 가드, 필수)
        const bestDimCount = bestFact.contextRef ? this.getContextDimCount(bestFact.contextRef) : Infinity;
        const bestPeriodInfo = bestFact.contextRef ? extractPeriodInfo(this.xmlDoc, bestFact.contextRef) : null
        
        // targetPeriod가 지정된 경우, 반드시 기간 일치 검증
        if (targetPeriod && bestPeriodInfo && bestFact.contextRef) {
          const candidateEndDate = bestPeriodInfo.endDate || bestPeriodInfo.instant
          const targetEndDate = targetPeriod.endDate || targetPeriod.instant
          const candidateStartDate = bestPeriodInfo.startDate
          const targetStartDate = targetPeriod.startDate
          
          // 기간 불일치 체크 (하드 가드)
          const periodMismatch: boolean = Boolean(
            (targetEndDate && candidateEndDate && candidateEndDate !== targetEndDate) ||
            (targetStartDate && candidateStartDate && candidateStartDate !== targetStartDate)
          )
          
          if (periodMismatch) {
            console.error(`[XBRL Parser] ⚠️ ${fieldName}: selectBestFact가 선택한 Fact의 기간이 anchor 기간과 불일치합니다!`)
            console.error(`[XBRL Parser] ${fieldName}: anchor 기간 (start=${targetStartDate || 'N/A'}, end=${targetEndDate || 'N/A'})`)
            console.error(`[XBRL Parser] ${fieldName}: 선택된 기간 (start=${candidateStartDate || 'N/A'}, end=${candidateEndDate || 'N/A'})`)
            console.error(`[XBRL Parser] ${fieldName}: 기간 혼입 방지를 위해 filteredCandidates에서 anchor 기간과 일치하는 다른 후보를 선택합니다.`)
            
            // filteredCandidates에서 anchor 기간과 일치하는 후보만 다시 필터링하여 선택
            const validCandidates = filteredCandidates.filter(c => {
              if (!c.contextRef) return false
              const pInfo = extractPeriodInfo(this.xmlDoc, c.contextRef)
              if (!pInfo) return false
              
              const cEndDate = pInfo.endDate || pInfo.instant
              const cStartDate = pInfo.startDate
              
              const endMatch = !targetEndDate || !cEndDate || cEndDate === targetEndDate
              const startMatch = !targetStartDate || !cStartDate || cStartDate === targetStartDate
              
              return endMatch && startMatch
            })
            
            if (validCandidates.length > 0) {
              dlog(`[XBRL Parser] ${fieldName}: anchor 기간과 일치하는 후보 ${validCandidates.length}개를 찾았습니다. 재선택합니다.`)
              // validCandidates에서 다시 선택 (차원 수가 적은 것 우선)
              const validWithDimScore = validCandidates.map(c => ({
                ...c,
                dimCount: this.getContextDimCount(c.contextRef),
              }))
              validWithDimScore.sort((a, b) => {
                if (a.dimCount !== b.dimCount) return a.dimCount - b.dimCount
                return Math.abs(b.value) - Math.abs(a.value)
              })
              const bestValid = validWithDimScore[0]
              const bestValidPeriodInfo = bestValid.contextRef ? extractPeriodInfo(this.xmlDoc, bestValid.contextRef) : null
              
              const bestValidPeriodStr = bestValidPeriodInfo ? `${bestValidPeriodInfo.periodTypeLabel || bestValidPeriodInfo.periodType} (start=${bestValidPeriodInfo.startDate || 'N/A'}, end=${bestValidPeriodInfo.endDate || bestValidPeriodInfo.instant || 'N/A'})` : 'N/A'
              dlog(`[XBRL Parser] ${fieldName} 재선택: contextRef=${bestValid.contextRef || 'N/A'}, value=${bestValid.value.toLocaleString()}, 기간=${bestValidPeriodStr}`)
              
              return {
                value: bestValid.value,
                unit: bestValid.unit,
                contextRef: bestValid.contextRef || undefined,
                decimals: bestValid.element.getAttribute('decimals') || undefined,
              }
            } else {
              console.error(`[XBRL Parser] ${fieldName}: anchor 기간과 일치하는 다른 후보가 없습니다. 필수 필드인 경우 null을 반환합니다.`)
              if (required) {
                return null
              }
              // 선택적 필드는 bestFact를 반환하되 경고
            }
          }
        }
        
        const bestPeriodStr = bestPeriodInfo ? `${bestPeriodInfo.periodTypeLabel || bestPeriodInfo.periodType} (start=${bestPeriodInfo.startDate || 'N/A'}, end=${bestPeriodInfo.endDate || bestPeriodInfo.instant || 'N/A'})` : 'N/A'
        const bestConsolidatedStr = bestPeriodInfo?.isConsolidated ? 'Consolidated' : bestPeriodInfo?.isSeparate ? 'Separate' : 'Unknown'
        dlog(`[XBRL Parser] ${fieldName} 최종 Fact 선택 (bestFact): contextRef=${bestFact.contextRef || 'N/A'}, value=${bestFact.value.toLocaleString()}, 기간=${bestPeriodStr}, 차원수=${bestDimCount !== Infinity ? bestDimCount : 'unknown'}, ${bestConsolidatedStr}`)
        
        // anchor 기간과 일치 확인 (하드 가드, 필수)
        if (targetPeriod && bestPeriodInfo && bestFact.contextRef) {
          const candidateEndDate = bestPeriodInfo.endDate || bestPeriodInfo.instant
          const targetEndDate = targetPeriod.endDate || targetPeriod.instant
          const candidateStartDate = bestPeriodInfo.startDate
          const targetStartDate = targetPeriod.startDate
          
          const periodMatch = 
            (!targetEndDate || !candidateEndDate || candidateEndDate === targetEndDate) &&
            (!targetStartDate || !candidateStartDate || candidateStartDate === targetStartDate)
          
          if (periodMatch) {
            if (process.env.NODE_ENV !== 'production') {
              dlog(`[XBRL Parser] ✓ ${fieldName}: 최종 선택된 Fact가 anchor 기간과 일치합니다.`)
            }
          } else {
            console.error(`[XBRL Parser] ⚠️ ${fieldName}: 최종 선택된 Fact의 기간이 anchor 기간과 불일치합니다!`)
            console.error(`[XBRL Parser] ${fieldName}: anchor 기간 (start=${targetStartDate || 'N/A'}, end=${targetEndDate || 'N/A'})`)
            console.error(`[XBRL Parser] ${fieldName}: 선택된 기간 (start=${candidateStartDate || 'N/A'}, end=${candidateEndDate || 'N/A'})`)
          }
        }
        
        // 차원 수가 3 이상이면 경고 (주석 테이블 가능성)
        if (bestDimCount >= 3) {
          console.warn(`[XBRL Parser] WARNING: ${fieldName} 선택된 Fact의 차원 수가 많습니다 (${bestDimCount}). 주석 테이블 값일 가능성이 있으므로 값(${bestFact.value.toLocaleString()}) 확인이 필요합니다.`)
        }
        
        // DiscontinuedOperationsMember, NoncontrollingInterestsMember 체크
        if (bestFact.contextRef && (bestFact.contextRef.toLowerCase().includes('discontinuedoperations') || bestFact.contextRef.toLowerCase().includes('noncontrollinginterests'))) {
          console.error(`[XBRL Parser] ⚠️ ${fieldName}: 최종 선택된 Fact의 컨텍스트에 DiscontinuedOperationsMember/NoncontrollingInterestsMember가 포함되어 있습니다! contextRef=${bestFact.contextRef}`)
        }
        
        return {
          value: bestFact.value,
          unit: bestFact.unit,
          contextRef: bestFact.contextRef || undefined,
          decimals: bestFact.element.getAttribute('decimals') || undefined,
        }
      }
    }

    // 태그를 찾지 못한 경우 로깅
    if (required) {
      // 필수 필드: console.error (하지만 throw는 호출 측에서 처리, 여기서는 null 반환)
      console.error(`[XBRL Parser] 필수 필드 ${fieldName} 태그를 찾을 수 없습니다.`)
      logMissingTag(fieldName, tags, this.xmlDoc)
    } else {
      // 선택적 필드: console.warn (분석 계속 진행)
      console.warn(`[XBRL Parser] 선택적 필드 ${fieldName} 태그를 찾을 수 없습니다. 분석은 계속 진행됩니다.`)
      logMissingTag(fieldName, tags, this.xmlDoc)
    }
    
    return null
  }

  /**
   * 필드명에 따른 구조적 힌트 생성
   */
  private getStructuralHints(fieldName: string): {
    parentTags?: string[]
    siblingTags?: string[]
    contextPatterns?: string[]
  } {
    const hints: {
      parentTags?: string[]
      siblingTags?: string[]
      contextPatterns?: string[]
    } = {}

    // 손익계산서 항목
    if (['revenue', 'operatingIncome', 'netIncome', '매출액', '영업이익', '당기순이익'].includes(fieldName)) {
      hints.parentTags = ['incomeStatement', 'statement', 'financial']
      hints.siblingTags = ['revenue', 'operatingIncome', 'netIncome', 'profit', 'loss']
      hints.contextPatterns = ['CurrentYear', 'Instant', 'Duration']
    }

    // 재무상태표 항목
    if (['totalAssets', 'totalLiabilities', 'totalEquity', '자산총계', '부채총계', '자본총계'].includes(fieldName)) {
      hints.parentTags = ['balanceSheet', 'statement', 'financial']
      hints.siblingTags = ['assets', 'liabilities', 'equity']
      hints.contextPatterns = ['CurrentYear', 'Instant']
    }

    // 현금흐름표 항목
    if (['operatingCashFlow', 'investingCashFlow', 'financingCashFlow', '영업현금흐름'].includes(fieldName)) {
      hints.parentTags = ['cashFlowStatement', 'statement', 'financial']
      hints.siblingTags = ['operating', 'investing', 'financing', 'cash']
      hints.contextPatterns = ['CurrentYear', 'Duration']
    }

    return hints
  }

  /**
   * 필드명에 따른 검색 키워드 생성 (유사도 기반 매핑용)
   */
  private getTargetKeywords(fieldName: string): string[] {
    const keywordMap: Record<string, string[]> = {
      revenue: KOREAN_KEYWORDS.revenue,
      operatingIncome: KOREAN_KEYWORDS.operatingIncome,
      netIncome: KOREAN_KEYWORDS.netIncome,
      totalAssets: KOREAN_KEYWORDS.totalAssets,
      totalLiabilities: KOREAN_KEYWORDS.totalLiabilities,
      totalEquity: KOREAN_KEYWORDS.totalEquity,
    }

    return keywordMap[fieldName] || []
  }

  /**
   * 필드명에 따른 필드 타입 반환 (기간 선택용)
   */
  private getFieldType(fieldName: string): 'income' | 'cashflow' | 'balance' {
    // 손익계산서 항목
    if (['revenue', 'operatingIncome', 'netIncome', 'eps', 'depreciationAndAmortization'].includes(fieldName)) {
      return 'income'
    }
    
    // 현금흐름표 항목
    if (['operatingCashFlow', 'investingCashFlow', 'financingCashFlow', 'capitalExpenditure', 'capexPPE', 'capexIntangible', 'freeCashFlow'].includes(fieldName)) {
      return 'cashflow'
    }
    
    // 재무상태표 항목 (기본값)
    return 'balance'
  }

  /**
   * 요소에서 값 추출 (원본 데이터와 1원 단위까지 일치)
   * 임의의 근거 없는 계산 절대 금지
   */
  private extractValue(element: Element): XBRLValue | null {
    const textContent = element.textContent?.trim();
    if (!textContent) return null;

    // 원본 텍스트 그대로 사용 (임의 변환 금지)
    const cleanedText = textContent.replace(/,/g, '').replace(/\s/g, '');
    
    // 숫자 추출 (음수, 소수점 처리) - 원본 데이터 그대로
    const numericValue = parseFloat(cleanedText);
    if (isNaN(numericValue)) return null;

    // 단위 추출
    const unitRef = element.getAttribute('unitRef');
    const unit = this.extractUnit(unitRef || '');

    // 원본 데이터와 1원 단위까지 일치 보장
    // decimals는 메타정보로만 보관, 숫자에 곱하지 않음
    const decimals = element.getAttribute('decimals');

    return {
      value: numericValue, // parseFloat로만 해석 (decimals 기반 스케일 곱셈 제거)
      unit,
      contextRef: element.getAttribute('contextRef') || undefined,
      decimals: decimals || undefined, // 메타정보로만 보관
    };
  }

  /**
   * 단위 추출 (안전한 방법 사용, 네임스페이스 호환성 강화)
   * 네임스페이스 호환성: xbrli:unit, xbrli:measure 형태도 찾을 수 있도록 getElementsByTagNameNS 사용
   */
  private extractUnit(unitRef: string): string {
    if (!unitRef) return 'KRW';
    
    try {
      // getElementsByTagNameNS로 unit 요소 찾기 (네임스페이스 무관)
      const allUnits = this.xmlDoc.getElementsByTagNameNS('*', 'unit');
      for (let i = 0; i < allUnits.length; i++) {
        const unitElem = allUnits[i];
        if (unitElem.getAttribute('id') === unitRef) {
          const measures = unitElem.getElementsByTagNameNS('*', 'measure');
          if (measures.length > 0) {
            const measureText = measures[0].textContent || '';
            if (measureText.includes('USD')) return 'USD';
            if (measureText.includes('KRW')) return 'KRW';
          }
          break;
        }
      }
    } catch (error) {
      // 단위 추출 실패는 기본값 사용
      console.warn('[XBRL Parser] 단위 추출 실패:', error);
    }
    
    return this.country === 'KR' ? 'KRW' : 'USD';
  }

  /**
   * FinancialItem 생성 헬퍼
   */
  private createFinancialItem(
    name: string,
    originalName: string,
    value: number,
    unit: string
  ): any {
    return {
      name,
      originalName,
      source: 'DART' as const,
      standard: this.country === 'KR' ? 'IFRS' : 'GAAP',
      value,
      unit,
    };
  }

  /**
   * 손익계산서 파싱
   * 모든 Income 항목을 동일한 기간(최신 CFY)으로 선택하여 기간 혼입 방지
   * @param missingFields 누락 필드 목록을 누적할 배열 (옵션)
   */
  parseIncomeStatement(missingFields: string[] = []): IncomeStatement {
    // 표준에 따라 태그 매핑 선택
    const tagMapping = this.country === 'KR' ? XBRL_TAG_MAPPINGS.ifrs : XBRL_TAG_MAPPINGS.gaap

    // 1단계: 최신 기간 확정 (Consolidated 기준 최신 endDate)
    const latestPeriodInfo = this.extractLatestPeriodInfo()
    const targetPeriod = latestPeriodInfo ? {
      startDate: latestPeriodInfo.startDate,
      endDate: latestPeriodInfo.endDate || latestPeriodInfo.instant,
      instant: latestPeriodInfo.instant,
    } : undefined
    
    if (latestPeriodInfo && targetPeriod) {
      // anchor 기간 확정 로그 (사용자 요청: "anchor 기간(2025-01-01 ~ 2025-09-30)" 형식)
      dlog(`[XBRL Parser] === 손익계산서 anchor 기간 확정 ===`)
      dlog(`[XBRL Parser] 최신 기간 선택: ${latestPeriodInfo.periodTypeLabel || latestPeriodInfo.periodType}`)
      if (targetPeriod.startDate && targetPeriod.endDate) {
        dlog(`[XBRL Parser] anchor 기간(${targetPeriod.startDate} ~ ${targetPeriod.endDate})`)
      } else if (targetPeriod.endDate) {
        dlog(`[XBRL Parser] anchor 기간(endDate=${targetPeriod.endDate})`)
      } else if (targetPeriod.instant) {
        dlog(`[XBRL Parser] anchor 기간(instant=${targetPeriod.instant})`)
      }
      dlog(`[XBRL Parser] periodType: ${latestPeriodInfo.periodType}, periodTypeLabel: ${latestPeriodInfo.periodTypeLabel || 'N/A'}`)
    } else {
      console.warn('[XBRL Parser] 최신 기간 정보 추출 실패. 기존 로직으로 진행합니다.')
    }

    // 2단계: revenue를 먼저 선택하여 anchorContextRef 확정
    const revenue = this.findValueByTags(tagMapping.revenue, 'revenue', { required: true, targetPeriod });
    
    // 2-1단계: 작년 같은 기간 매출 추출 (YoY 성장률 계산용)
    let revenuePrevYear: XBRLValue | null = null
    if (targetPeriod && targetPeriod.startDate && targetPeriod.endDate) {
      const prevStartDate = shiftYear(targetPeriod.startDate, -1)
      const prevEndDate = shiftYear(targetPeriod.endDate, -1)
      if (prevStartDate && prevEndDate) {
        const found = this.findValueByTags(tagMapping.revenue, 'revenuePrevYear', {
          required: false,
          targetPeriod: { startDate: prevStartDate, endDate: prevEndDate }
        })
        // unit 일치 검증: 현재 값과 동일한 unit만 채택
        if (found && revenue && found.unit === revenue.unit) {
          revenuePrevYear = found
        }
      }
    }
    
    // 3단계: revenue에서 확정된 contextRef를 anchor로 사용하여 operatingIncome/netIncome도 동일 contextRef 우선 사용
    const anchorContextRef = revenue?.contextRef
    if (anchorContextRef && process.env.NODE_ENV !== 'production') {
      dlog(`[XBRL Parser] revenue에서 확정된 anchorContextRef: ${anchorContextRef}`)
    }
    
    const operatingIncome = this.findValueByTags(tagMapping.operatingIncome, 'operatingIncome', { required: true, targetPeriod, anchorContextRef });
    
    // 2-2단계: 작년 같은 기간 영업이익 추출 (YoY 비교용)
    let operatingIncomePrevYear: XBRLValue | null = null
    if (targetPeriod && targetPeriod.startDate && targetPeriod.endDate) {
      const prevStartDate = shiftYear(targetPeriod.startDate, -1)
      const prevEndDate = shiftYear(targetPeriod.endDate, -1)
      if (prevStartDate && prevEndDate) {
        const found = this.findValueByTags(tagMapping.operatingIncome, 'operatingIncomePrevYear', {
          required: false,
          targetPeriod: { startDate: prevStartDate, endDate: prevEndDate }
        })
        // unit 일치 검증: 현재 값과 동일한 unit만 채택
        if (found && operatingIncome && found.unit === operatingIncome.unit) {
          operatingIncomePrevYear = found
        }
      }
    }
    
    // EPS 스코프 결정: 계속영업 우선, 없으면 총계
    const epsContinuing = (Array.isArray((tagMapping as any).epsContinuing) && (tagMapping as any).epsContinuing.length > 0) 
      ? this.findValueByTags((tagMapping as any).epsContinuing, 'epsContinuing', { required: false, targetPeriod, anchorContextRef }) 
      : null;
    const epsTotal = (Array.isArray((tagMapping as any).epsTotal) && (tagMapping as any).epsTotal.length > 0)
      ? this.findValueByTags((tagMapping as any).epsTotal, 'epsTotal', { required: false, targetPeriod, anchorContextRef })
      : null;
    const epsDiscontinued = (Array.isArray((tagMapping as any).epsDiscontinued) && (tagMapping as any).epsDiscontinued.length > 0)
      ? this.findValueByTags((tagMapping as any).epsDiscontinued, 'epsDiscontinued', { required: false, targetPeriod, anchorContextRef })
      : null;
    
    // EPS 선택: 계속영업 우선, 없으면 총계
    const eps = epsContinuing || epsTotal;
    const epsScope = epsContinuing ? 'continuing' : (epsTotal ? 'total' : null);
    
    // netIncome 스코프 결정: EPS와 동일 스코프 사용
    let netIncome: XBRLValue | null = null;
    let netIncomeDiscontinued: XBRLValue | null = null;
    
    if (epsScope === 'continuing') {
      // EPS가 계속영업이면 netIncome도 계속영업 사용
      netIncome = (Array.isArray((tagMapping as any).netIncomeContinuing) && (tagMapping as any).netIncomeContinuing.length > 0)
        ? this.findValueByTags((tagMapping as any).netIncomeContinuing, 'netIncomeContinuing', { required: true, targetPeriod, anchorContextRef })
        : null;
      netIncomeDiscontinued = (Array.isArray((tagMapping as any).netIncomeDiscontinued) && (tagMapping as any).netIncomeDiscontinued.length > 0)
        ? this.findValueByTags((tagMapping as any).netIncomeDiscontinued, 'netIncomeDiscontinued', { required: false, targetPeriod, anchorContextRef })
        : null;
      // 계속영업이 없으면 총계로 폴백
      if (!netIncome && Array.isArray((tagMapping as any).netIncomeTotal) && (tagMapping as any).netIncomeTotal.length > 0) {
        netIncome = this.findValueByTags((tagMapping as any).netIncomeTotal, 'netIncomeTotal', { required: true, targetPeriod, anchorContextRef });
      }
    } else if (epsScope === 'total') {
      // EPS가 총계이면 netIncome도 총계 사용
      netIncome = (Array.isArray((tagMapping as any).netIncomeTotal) && (tagMapping as any).netIncomeTotal.length > 0)
        ? this.findValueByTags((tagMapping as any).netIncomeTotal, 'netIncomeTotal', { required: true, targetPeriod, anchorContextRef })
        : null;
      netIncomeDiscontinued = (Array.isArray((tagMapping as any).netIncomeDiscontinued) && (tagMapping as any).netIncomeDiscontinued.length > 0)
        ? this.findValueByTags((tagMapping as any).netIncomeDiscontinued, 'netIncomeDiscontinued', { required: false, targetPeriod, anchorContextRef })
        : null;
      // 총계가 없으면 계속영업으로 폴백
      if (!netIncome && Array.isArray((tagMapping as any).netIncomeContinuing) && (tagMapping as any).netIncomeContinuing.length > 0) {
        netIncome = this.findValueByTags((tagMapping as any).netIncomeContinuing, 'netIncomeContinuing', { required: true, targetPeriod, anchorContextRef });
      }
    } else {
      // EPS가 없으면 총계 우선, 없으면 계속영업
      netIncome = (Array.isArray((tagMapping as any).netIncomeTotal) && (tagMapping as any).netIncomeTotal.length > 0)
        ? this.findValueByTags((tagMapping as any).netIncomeTotal, 'netIncomeTotal', { required: true, targetPeriod, anchorContextRef })
        : null;
      if (!netIncome && Array.isArray((tagMapping as any).netIncomeContinuing) && (tagMapping as any).netIncomeContinuing.length > 0) {
        netIncome = this.findValueByTags((tagMapping as any).netIncomeContinuing, 'netIncomeContinuing', { required: true, targetPeriod, anchorContextRef });
      }
      netIncomeDiscontinued = (Array.isArray((tagMapping as any).netIncomeDiscontinued) && (tagMapping as any).netIncomeDiscontinued.length > 0)
        ? this.findValueByTags((tagMapping as any).netIncomeDiscontinued, 'netIncomeDiscontinued', { required: false, targetPeriod, anchorContextRef })
        : null;
    }
    
    // 2-3단계: 작년 같은 기간 당기순이익 추출 (YoY 비교용, EPS 스코프와 동일)
    let netIncomePrevYear: XBRLValue | null = null
    if (targetPeriod && targetPeriod.startDate && targetPeriod.endDate && netIncome) {
      const prevStartDate = shiftYear(targetPeriod.startDate, -1)
      const prevEndDate = shiftYear(targetPeriod.endDate, -1)
      if (prevStartDate && prevEndDate) {
        // EPS 스코프와 동일한 로직으로 netIncomePrevYear 추출
        const prevYearTargetPeriod = { startDate: prevStartDate, endDate: prevEndDate }
        let foundNetIncomePrevYear: XBRLValue | null = null
        // anchorContextRef를 제거하여 전년동기 contextRef(PFY...)가 필터링되지 않도록 수정
        // targetPeriod(prevYearTargetPeriod)만으로 기간 매칭 + scoreFact로 최적 fact 선택
        if (epsScope === 'continuing') {
          foundNetIncomePrevYear = (Array.isArray((tagMapping as any).netIncomeContinuing) && (tagMapping as any).netIncomeContinuing.length > 0)
            ? this.findValueByTags((tagMapping as any).netIncomeContinuing, 'netIncomeContinuingPrevYear', { required: false, targetPeriod: prevYearTargetPeriod })
            : null;
          if (!foundNetIncomePrevYear && Array.isArray((tagMapping as any).netIncomeTotal) && (tagMapping as any).netIncomeTotal.length > 0) {
            foundNetIncomePrevYear = this.findValueByTags((tagMapping as any).netIncomeTotal, 'netIncomeTotalPrevYear', { required: false, targetPeriod: prevYearTargetPeriod });
          }
        } else if (epsScope === 'total') {
          foundNetIncomePrevYear = (Array.isArray((tagMapping as any).netIncomeTotal) && (tagMapping as any).netIncomeTotal.length > 0)
            ? this.findValueByTags((tagMapping as any).netIncomeTotal, 'netIncomeTotalPrevYear', { required: false, targetPeriod: prevYearTargetPeriod })
            : null;
          if (!foundNetIncomePrevYear && Array.isArray((tagMapping as any).netIncomeContinuing) && (tagMapping as any).netIncomeContinuing.length > 0) {
            foundNetIncomePrevYear = this.findValueByTags((tagMapping as any).netIncomeContinuing, 'netIncomeContinuingPrevYear', { required: false, targetPeriod: prevYearTargetPeriod });
          }
        } else {
          foundNetIncomePrevYear = (Array.isArray((tagMapping as any).netIncomeTotal) && (tagMapping as any).netIncomeTotal.length > 0)
            ? this.findValueByTags((tagMapping as any).netIncomeTotal, 'netIncomeTotalPrevYear', { required: false, targetPeriod: prevYearTargetPeriod })
            : null;
          if (!foundNetIncomePrevYear && Array.isArray((tagMapping as any).netIncomeContinuing) && (tagMapping as any).netIncomeContinuing.length > 0) {
            foundNetIncomePrevYear = this.findValueByTags((tagMapping as any).netIncomeContinuing, 'netIncomeContinuingPrevYear', { required: false, targetPeriod: prevYearTargetPeriod });
          }
        }
        // unit 일치 검증: 현재 값과 동일한 unit만 채택
        if (foundNetIncomePrevYear && netIncome && foundNetIncomePrevYear.unit === netIncome.unit) {
          netIncomePrevYear = foundNetIncomePrevYear
        }
      }
    }
    
    // 기간 일관성 검증 및 영업이익률 계산 시 기간 일치 검증 (하드 가드)
    if (revenue && operatingIncome && netIncome) {
      const revenuePeriod = revenue.contextRef ? extractPeriodInfo(this.xmlDoc, revenue.contextRef) : null
      const operatingIncomePeriod = operatingIncome.contextRef ? extractPeriodInfo(this.xmlDoc, operatingIncome.contextRef) : null
      const netIncomePeriod = netIncome.contextRef ? extractPeriodInfo(this.xmlDoc, netIncome.contextRef) : null
      
      // 최종 선택된 fact 정보 로깅 (개발 모드, 필수)
      if (process.env.NODE_ENV !== 'production') {
        dlog(`[XBRL Parser] === 최종 선택된 fact 정보 ===`)
        const revenueTag = Array.isArray(tagMapping.revenue) ? tagMapping.revenue[0] : tagMapping.revenue
        const operatingIncomeTag = Array.isArray(tagMapping.operatingIncome) ? tagMapping.operatingIncome[0] : tagMapping.operatingIncome
        const netIncomeTag = (tagMapping as any).netIncome 
          ? (Array.isArray((tagMapping as any).netIncome) ? (tagMapping as any).netIncome[0] : (tagMapping as any).netIncome)
          : 'N/A (using netIncomeContinuing/netIncomeTotal)'
        dlog(`[XBRL Parser] revenue: tag=${revenueTag || 'N/A'}, value=${revenue.value.toLocaleString()}, contextRef=${revenue.contextRef || 'N/A'}, startDate=${revenuePeriod?.startDate || 'N/A'}, endDate=${revenuePeriod?.endDate || revenuePeriod?.instant || 'N/A'}, consolidated=${revenuePeriod?.isConsolidated ? 'Yes' : revenuePeriod?.isSeparate ? 'No' : 'Unknown'}`)
        dlog(`[XBRL Parser] operatingIncome: tag=${operatingIncomeTag || 'N/A'}, value=${operatingIncome.value.toLocaleString()}, contextRef=${operatingIncome.contextRef || 'N/A'}, startDate=${operatingIncomePeriod?.startDate || 'N/A'}, endDate=${operatingIncomePeriod?.endDate || operatingIncomePeriod?.instant || 'N/A'}, consolidated=${operatingIncomePeriod?.isConsolidated ? 'Yes' : operatingIncomePeriod?.isSeparate ? 'No' : 'Unknown'}`)
        dlog(`[XBRL Parser] netIncome: tag=${netIncomeTag || 'N/A'}, value=${netIncome.value.toLocaleString()}, contextRef=${netIncome.contextRef || 'N/A'}, startDate=${netIncomePeriod?.startDate || 'N/A'}, endDate=${netIncomePeriod?.endDate || netIncomePeriod?.instant || 'N/A'}, consolidated=${netIncomePeriod?.isConsolidated ? 'Yes' : netIncomePeriod?.isSeparate ? 'No' : 'Unknown'}`)
      }
      
      // 영업이익률 계산용 기간 일치 검증 (하드 가드, 추정 금지)
      if (revenuePeriod && operatingIncomePeriod) {
        const revenueEndDate = revenuePeriod.endDate || revenuePeriod.instant
        const operatingIncomeEndDate = operatingIncomePeriod.endDate || operatingIncomePeriod.instant
        const revenueStartDate = revenuePeriod.startDate
        const operatingIncomeStartDate = operatingIncomePeriod.startDate
        
        // 기간 불일치 체크 (하드 가드)
        const periodMismatch = 
          (revenueEndDate && operatingIncomeEndDate && revenueEndDate !== operatingIncomeEndDate) ||
          (revenueStartDate && operatingIncomeStartDate && revenueStartDate !== operatingIncomeStartDate)
        
        if (periodMismatch) {
          console.error(`[XBRL Parser] ⚠️ 영업이익률 계산 불가(기간 불일치): 매출과 영업이익이 서로 다른 기간을 사용합니다!`)
          console.error(`[XBRL Parser] 매출 contextRef=${revenue.contextRef}, 기간=${revenuePeriod.periodTypeLabel || revenuePeriod.periodType} (start=${revenueStartDate || 'N/A'}, end=${revenueEndDate || 'N/A'})`)
          console.error(`[XBRL Parser] 영업이익 contextRef=${operatingIncome.contextRef}, 기간=${operatingIncomePeriod.periodTypeLabel || operatingIncomePeriod.periodType} (start=${operatingIncomeStartDate || 'N/A'}, end=${operatingIncomeEndDate || 'N/A'})`)
          console.error(`[XBRL Parser] 기간 혼입 방지를 위해 영업이익률 계산을 건너뜁니다. (추정 금지)`)
        } else {
          // 기간 일치 확인 및 영업이익률 계산값 로깅
          dlog(`[XBRL Parser] ✓ 영업이익률 계산 가능: 매출과 영업이익이 같은 기간을 사용합니다 (endDate=${revenueEndDate || 'N/A'}, startDate=${revenueStartDate || 'N/A'})`)
          const calculatedOpm = (operatingIncome.value / revenue.value) * 100
          dlog(`[XBRL Parser] 영업이익률 계산값: ${calculatedOpm.toFixed(2)}% (영업이익=${operatingIncome.value.toLocaleString()}, 매출=${revenue.value.toLocaleString()})`)
          dlog(`[XBRL Parser] 영업이익률 반올림: ${calculatedOpm.toFixed(1)}%`)
        }
      } else {
        console.warn(`[XBRL Parser] WARNING: revenue 또는 operatingIncome의 기간 정보를 추출할 수 없습니다. 영업이익률 계산을 건너뜁니다.`)
        if (!revenuePeriod) console.warn(`[XBRL Parser] revenue periodInfo가 null입니다. contextRef=${revenue.contextRef}`)
        if (!operatingIncomePeriod) console.warn(`[XBRL Parser] operatingIncome periodInfo가 null입니다. contextRef=${operatingIncome.contextRef}`)
      }
      
      // 전체 항목 간 기간 일관성 검증 (개발 모드)
      if (process.env.NODE_ENV !== 'production') {
        const periods = [revenuePeriod, operatingIncomePeriod, netIncomePeriod].filter(p => p !== null)
        if (periods.length > 0) {
          const endDates = periods.map(p => p!.endDate || p!.instant).filter(d => d)
          const startDates = periods.map(p => p!.startDate).filter(d => d)
          
          // anchor 기간과의 일치 확인
          if (targetPeriod) {
            dlog(`[XBRL Parser] === 손익계산서 항목 간 기간 일관성 확인 ===`)
            dlog(`[XBRL Parser] anchor 기간: ${targetPeriod.startDate || 'N/A'} ~ ${targetPeriod.endDate || targetPeriod.instant || 'N/A'}`)
            const allSameEndDate = endDates.length > 0 && endDates.every(d => d === endDates[0])
            const allSameStartDate = startDates.length === periods.length && startDates.every(d => d === startDates[0])
            
            if (!allSameEndDate || !allSameStartDate) {
              console.error(`[XBRL Parser] ERROR: 손익계산서 항목 간 기간 불일치 감지! 매출=${revenuePeriod?.endDate || revenuePeriod?.instant} (start=${revenuePeriod?.startDate || 'N/A'}), 영업이익=${operatingIncomePeriod?.endDate || operatingIncomePeriod?.instant} (start=${operatingIncomePeriod?.startDate || 'N/A'}), 순이익=${netIncomePeriod?.endDate || netIncomePeriod?.instant} (start=${netIncomePeriod?.startDate || 'N/A'})`)
            } else {
              dlog(`[XBRL Parser] ✓ 손익계산서 항목 간 기간 일관성 확인: 모든 항목이 ${endDates[0]} 기간(start=${startDates[0] || 'N/A'})을 사용합니다.`)
            }
          }
        }
      }
    }
    
    // EPS 로깅 (스코프 정보 포함)
    if (eps) {
      dlog(`[XBRL Parser] EPS 추출 성공: 스코프=${epsScope || 'unknown'}, 값=${eps.value}`);
    } else {
      missingFields.push('eps (주당순이익)');
      console.warn(`[XBRL Parser] EPS(주당순이익)를 찾을 수 없습니다. 선택적 필드로 처리하여 분석을 계속 진행합니다.`);
    }

    // 필수 항목 null 체크
    if (!revenue || !operatingIncome || !netIncome) {
      const missingFields: string[] = []
      if (!revenue) missingFields.push('revenue (매출액)')
      if (!operatingIncome) missingFields.push('operatingIncome (영업이익)')
      if (!netIncome) missingFields.push('netIncome (당기순이익)')
      
      // 디버깅 정보: context/unit 개수 확인
      const contextCount = this.xmlDoc.getElementsByTagNameNS('*', 'context').length
      const unitCount = this.xmlDoc.getElementsByTagNameNS('*', 'unit').length
      const allElements = this.xmlDoc.getElementsByTagName('*')
      const factLikeCount = Array.from(allElements).filter(el => el.getAttribute('contextRef')).length
      
      console.error(`[XBRL Parser] 손익계산서 필수 항목 누락:`, missingFields)
      console.error(`[XBRL Parser] 디버깅 정보: contextCount=${contextCount}, unitCount=${unitCount}, factLikeCount=${factLikeCount}`)
      
      throw new InsufficientDataError(
        `손익계산서 필수 항목이 누락되었습니다: ${missingFields.join(', ')}. ` +
        `인스턴스 판별 메트릭: contextCount=${contextCount}, unitCount=${unitCount}, factLikeCount=${factLikeCount}. ` +
        `올바른 인스턴스 XBRL 파일이 선택되었는지 확인해주세요.`,
        missingFields,
        {
          contextCount,
          unitCount,
          factLikeCount,
        }
      );
    }
    
    // 감가상각비: 선택적 필드로 처리, 자동 합산 로직 시도
    let depreciationAndAmortization = this.findValueByTags(
      tagMapping.depreciationAndAmortization,
      'depreciationAndAmortization',
      { required: false }
    );
    
    if (!depreciationAndAmortization) {
      // D&A를 찾을 수 없으면 폴백 로직: Depreciation + Amortization을 각각 찾아 합산
      dlog('[XBRL Parser] 감가상각비(D&A)를 찾을 수 없어 폴백 합산 로직 시도...')
      
      // 1단계: 개별 태그로 검색 (UK spelling 포함)
      const depExpense = this.findValueByTags(
        [
          'ifrs-full:AdjustmentsForDepreciationExpense',
          'ifrs-full:DepreciationPropertyPlantAndEquipment',
          'ifrs-full:DepreciationRightofuseAssets',
        ],
        'depreciationExpense',
        { required: false }
      );
      
      const amortExpense = this.findValueByTags(
        [
          'ifrs-full:AdjustmentsForAmortisationExpense', // UK spelling
          'ifrs-full:AdjustmentsForAmortizationExpense', // US spelling
          'ifrs-full:AmortisationIntangibleAssetsOtherThanGoodwill',
        ],
        'amortizationExpense',
        { required: false }
      );
      
      // 2단계: 둘 다 있으면 합산
      if (depExpense && amortExpense && depExpense.unit === amortExpense.unit) {
        dlog(`[XBRL Parser] 감가상각비 폴백 합산 성공: Depreciation(${depExpense.value}) + Amortization(${amortExpense.value}) = ${depExpense.value + Math.abs(amortExpense.value)}`)
        depreciationAndAmortization = {
          value: depExpense.value + Math.abs(amortExpense.value),
          unit: depExpense.unit,
          contextRef: undefined,
          decimals: undefined,
        }
      } else if (depExpense) {
        // Depreciation만 있는 경우
        console.warn(`[XBRL Parser] 감가상각비: Depreciation만 발견 (${depExpense.value}), Amortization 누락`)
        depreciationAndAmortization = depExpense
      } else {
        // 3단계: 기존 semantic parser 시도
        const aggregationResult = aggregateDepreciationAndAmortization(
          this.xmlDoc,
          {
            depreciation: ['Depreciation', 'DepreciationExpense', 'DepreciationProperty', '감가상각'],
            amortization: ['Amortisation', 'Amortization', 'AmortizationExpense', 'AmortisationExpense', '상각'],
          }
        )

        if (aggregationResult && aggregationResult.components.length > 0) {
          dlog(`[XBRL Parser] 감가상각비 semantic 합산 성공: ${aggregationResult.components.map(c => `${c.tag}=${c.value}`).join(' + ')} = ${aggregationResult.value}`)
          depreciationAndAmortization = {
            value: aggregationResult.value,
            unit: aggregationResult.unit,
            contextRef: undefined,
            decimals: undefined,
          }
        } else {
          // 최종 실패: 누락 필드로 기록
          missingFields.push('depreciationAndAmortization (감가상각비)');
          console.warn(`[XBRL Parser] 감가상각비(D&A)를 찾을 수 없습니다. 선택적 필드로 처리하여 분석을 계속 진행합니다.`)
        }
      }
    }

    // 필수 필드 누락 체크 (필수 필드는 throw로 분석 중단)
    const requiredMissingFields: string[] = []
    if (!revenue) {
      requiredMissingFields.push('revenue (매출액)')
    }
    if (!operatingIncome) {
      requiredMissingFields.push('operatingIncome (영업이익)')
    }
    if (!netIncome) {
      requiredMissingFields.push('netIncome (당기순이익)')
    }

    if (requiredMissingFields.length > 0) {
      console.error(`[XBRL Parser] 손익계산서 필수 항목 누락:`, requiredMissingFields)
      missingFields.push(...requiredMissingFields)
      throw new InsufficientDataError(
        `손익계산서 필수 항목이 누락되었습니다: ${requiredMissingFields.join(', ')}. XBRL 문서에서 해당 태그를 찾을 수 없습니다.`,
        requiredMissingFields
      );
    }

    // 검증 로그: 각 항목의 contextRef 저장 (개발 모드)
    if (process.env.NODE_ENV !== 'production') {
      // contextRef를 임시로 저장하여 검증 로그에 사용
      if (revenue?.contextRef) {
        (revenue as any).__contextRefForLog = revenue.contextRef
      }
      if (operatingIncome?.contextRef) {
        (operatingIncome as any).__contextRefForLog = operatingIncome.contextRef
      }
      if (netIncome?.contextRef) {
        (netIncome as any).__contextRefForLog = netIncome.contextRef
      }
    }

    return {
      revenue: this.createFinancialItem('매출액', 'Revenue', revenue.value, revenue.unit),
      revenuePrevYear: revenuePrevYear ? this.createFinancialItem('작년 같은 기간 매출', 'RevenuePrevYear', revenuePrevYear.value, revenuePrevYear.unit) : undefined,
      operatingIncome: this.createFinancialItem('영업이익', 'OperatingIncome', operatingIncome.value, operatingIncome.unit),
      operatingIncomePrevYear: operatingIncomePrevYear ? this.createFinancialItem('작년 같은 기간 영업이익', 'OperatingIncomePrevYear', operatingIncomePrevYear.value, operatingIncomePrevYear.unit) : undefined,
      netIncome: this.createFinancialItem('당기순이익', 'NetIncome', netIncome!.value, netIncome!.unit),
      netIncomePrevYear: netIncomePrevYear ? this.createFinancialItem('작년 같은 기간 당기순이익', 'NetIncomePrevYear', netIncomePrevYear.value, netIncomePrevYear.unit) : undefined,
      netIncomeDiscontinued: netIncomeDiscontinued ? this.createFinancialItem('중단영업 순이익', 'NetIncomeDiscontinued', netIncomeDiscontinued.value, netIncomeDiscontinued.unit) : undefined,
      eps: eps ? this.createFinancialItem('EPS', 'EarningsPerShare', eps.value, eps.unit) : undefined,
      depreciationAndAmortization: depreciationAndAmortization
        ? this.createFinancialItem('감가상각비', 'DepreciationAndAmortization', depreciationAndAmortization.value, depreciationAndAmortization.unit)
        : undefined, // 누락 시 undefined로 처리 (0으로 채우지 않음)
      operatingCashFlow: this.createFinancialItem('영업현금흐름', 'OperatingCashFlow', 0, revenue.unit), // 현금흐름표에서 가져옴
    };
  }

  /**
   * 재무상태표 파싱
   * 모든 Balance 항목을 동일한 기간(최신 instant=endDate)으로 선택하여 기간 혼입 방지
   */
  parseBalanceSheet(): BalanceSheet {
    const tagMapping = this.country === 'KR' ? XBRL_TAG_MAPPINGS.ifrs : XBRL_TAG_MAPPINGS.gaap

    // 최신 기간 확정 (BalanceSheet는 instant=endDate 사용)
    const latestPeriodInfo = this.extractLatestPeriodInfo()
    const targetPeriod = latestPeriodInfo ? {
      startDate: latestPeriodInfo.startDate, // priorEnd 계산에 필요
      instant: latestPeriodInfo.endDate || latestPeriodInfo.instant, // Balance는 instant만 사용
      endDate: latestPeriodInfo.endDate || latestPeriodInfo.instant,
    } : undefined
    
    if (latestPeriodInfo && targetPeriod) {
      dlog(`[XBRL Parser] 재무상태표 최신 기간 확정: instant=${targetPeriod.instant || 'N/A'}`)
    }

    const totalAssets = this.findValueByTags(tagMapping.totalAssets, 'totalAssets', { required: true, targetPeriod });
    const totalLiabilities = this.findValueByTags(tagMapping.totalLiabilities, 'totalLiabilities', { required: true, targetPeriod });
    const totalEquity = this.findValueByTags(tagMapping.totalEquity, 'totalEquity', { required: true, targetPeriod });
    const operatingAssets = this.findValueByTags(tagMapping.operatingAssets, 'operatingAssets', { required: false, targetPeriod });
    let nonInterestBearingLiabilities = this.findValueByTags(tagMapping.nonInterestBearingLiabilities, 'nonInterestBearingLiabilities', { required: false, targetPeriod });
    const accountsReceivable = this.findValueByTags(tagMapping.accountsReceivable, 'accountsReceivable', { required: false, targetPeriod });
    const inventory = this.findValueByTags(tagMapping.inventory, 'inventory', { required: false, targetPeriod });
    
    // 재무상태표 컨텍스트 앵커 고정 (totalAssets.contextRef 사용, 없으면 totalEquity.contextRef fallback)
    const balanceAnchorContextRef = totalAssets?.contextRef || totalEquity?.contextRef
    if (balanceAnchorContextRef && process.env.NODE_ENV !== 'production') {
      dlog(`[XBRL Parser] 재무상태표 컨텍스트 앵커 확정: ${balanceAnchorContextRef}`)
    }
    
    // ROIC 간이 계산용: cash, interestBearingDebt 추출 (컨텍스트 고정 적용)
    const cash = this.findValueByTags((tagMapping as any).cash || [], 'cash', { required: false, targetPeriod, anchorContextRef: balanceAnchorContextRef || undefined });
    let interestBearingDebt: XBRLValue | null = null
    
    // interestBearingDebt: components 합산을 먼저 시도 (컨텍스트 고정 적용)
    if ((tagMapping as any).interestBearingDebtComponents) {
      dlog(`[XBRL Parser] interestBearingDebt (이자발생부채) components 합산을 먼저 시도...`)
      const components = (tagMapping as any).interestBearingDebtComponents || []
      const foundComponents: Array<{ tag: string; value: XBRLValue }> = []
      let totalSum = 0
      let commonUnit = ''
      const seenContextRefs = new Set<string>()
      
      for (const componentTag of components) {
        const componentValue = this.findValueByTags([componentTag], `interestBearingDebtComponent-${componentTag}`, { required: false, targetPeriod, anchorContextRef: balanceAnchorContextRef || undefined })
        if (componentValue) {
          // 컨텍스트 고정: balanceAnchorContextRef와 다르면 폐기
          if (balanceAnchorContextRef && componentValue.contextRef !== balanceAnchorContextRef) {
            dlog(`[XBRL Parser] interestBearingDebtComponent-${componentTag}: contextRef(${componentValue.contextRef})가 balanceAnchorContextRef(${balanceAnchorContextRef})와 다릅니다. 폐기합니다.`)
            continue
          }
          const contextKey = `${componentValue.contextRef || 'unknown'}-${componentTag}`
          if (!seenContextRefs.has(contextKey)) {
            seenContextRefs.add(contextKey)
            foundComponents.push({ tag: componentTag, value: componentValue })
            if (!commonUnit) {
              commonUnit = componentValue.unit
            }
            if (componentValue.unit === commonUnit) {
              totalSum += Math.abs(componentValue.value)
            }
          }
        }
      }
      
      if (foundComponents.length >= 1 && totalSum > 0 && commonUnit) {
        dlog(`[XBRL Parser] 이자발생부채 합산 성공: ${foundComponents.map(c => `${c.tag}=${c.value.value.toLocaleString()}`).join(' + ')} = ${totalSum.toLocaleString()} ${commonUnit}`)
        interestBearingDebt = {
          value: totalSum,
          unit: commonUnit,
          contextRef: foundComponents[0]?.value.contextRef,
          decimals: undefined,
        }
      }
    }
    
    // components 합산이 안 되면 단일 태그 fallback 시도 (컨텍스트 고정 적용)
    if (!interestBearingDebt) {
      dlog(`[XBRL Parser] interestBearingDebt (이자발생부채) components 합산 실패. 단일 태그 fallback 시도...`)
      interestBearingDebt = this.findValueByTags((tagMapping as any).interestBearingDebt || [], 'interestBearingDebt', { required: false, targetPeriod, anchorContextRef: balanceAnchorContextRef || undefined });
    }

    // 누락된 필드 정확히 로깅
    const missingFields: string[] = []
    if (!totalAssets) missingFields.push('totalAssets (자산총계)')
    if (!totalLiabilities) missingFields.push('totalLiabilities (부채총계)')
    if (!totalEquity) missingFields.push('totalEquity (자본총계)')

    if (missingFields.length > 0) {
      console.error(`[XBRL Parser] 재무상태표 필수 항목 누락:`, missingFields)
      throw new InsufficientDataError(
        `재무상태표 필수 항목이 누락되었습니다: ${missingFields.join(', ')}`,
        missingFields
      );
    }

    // operatingAssets는 optional로 처리
    // 값이 없으면 undefined로 유지 (0으로 채우지 않음)
    if (!operatingAssets) {
      console.warn(`[XBRL Parser] operatingAssets (영업자산)를 찾을 수 없습니다. optional로 처리합니다.`)
    }

    // nonInterestBearingLiabilities: 단일 태그가 없으면 운영부채 합산으로 대체 계산 시도
    if (!nonInterestBearingLiabilities) {
      dlog(`[XBRL Parser] nonInterestBearingLiabilities (비이자발생부채) 단일 태그를 찾을 수 없어 운영부채 합산 로직 시도...`)
      
      // 운영부채 합산 시도: 매입채무/기타채무, 선수금/계약부채, 미지급비용/기타유동부채, 충당부채 등
      // 단, 단일 태그 검색에 사용된 태그들은 제외 (중복 방지)
      const singleTagList = tagMapping.nonInterestBearingLiabilities || []
      const operatingLiabilitiesComponents = (tagMapping.operatingLiabilitiesComponents || []).filter(
        tag => !singleTagList.includes(tag) // 단일 태그와 중복 제거
      )
      
      if (operatingLiabilitiesComponents.length > 0) {
        const foundComponents: Array<{ tag: string; value: XBRLValue }> = []
        let totalSum = 0
        let commonUnit = ''
        const seenContextRefs = new Set<string>() // 중복 contextRef 방지
        
        for (const componentTag of operatingLiabilitiesComponents) {
          const componentValue = this.findValueByTags([componentTag], `operatingLiabilitiesComponent-${componentTag}`, { required: false, targetPeriod })
          if (componentValue) {
            // 중복 체크: 같은 contextRef를 가진 다른 태그는 이미 단일 태그 검색에서 찾았을 가능성이 높음
            // 하지만 다른 태그이므로 합산 대상으로 포함 (단, 같은 contextRef의 같은 태그는 중복 제거)
            const contextKey = `${componentValue.contextRef || 'unknown'}-${componentTag}`
            if (!seenContextRefs.has(contextKey)) {
              seenContextRefs.add(contextKey)
              foundComponents.push({ tag: componentTag, value: componentValue })
              if (!commonUnit) {
                commonUnit = componentValue.unit
              }
              // 단위가 같으면 합산
              if (componentValue.unit === commonUnit) {
                totalSum += Math.abs(componentValue.value) // 부채는 절대값으로 합산
              }
            }
          }
        }
        
        // 합산 항목이 충분한지 확인
        // 합산 항목이 1개 이상이고 합계가 0보다 크면 합산값 사용 (단일 태그를 찾지 못한 경우의 대체)
        // 하지만 합산 항목이 너무 적으면(예: 1개만 있고 그것도 불확실) 가짜 정밀도를 피하기 위해 null 유지
        if (foundComponents.length >= 2 && totalSum > 0 && commonUnit) {
          // 최소 2개 이상 찾았을 때 합산값 사용 (가짜 정밀도 방지)
          dlog(`[XBRL Parser] 비이자발생부채 합산 성공: ${foundComponents.map(c => `${c.tag}=${c.value.value.toLocaleString()}`).join(' + ')} = ${totalSum.toLocaleString()} ${commonUnit}`)
          // 합산값을 nonInterestBearingLiabilities로 설정
          nonInterestBearingLiabilities = {
            value: totalSum,
            unit: commonUnit,
            contextRef: foundComponents[0]?.value.contextRef, // 첫 번째 컴포넌트의 contextRef 사용
            decimals: undefined,
          }
        } else if (foundComponents.length === 1 && totalSum > 0 && commonUnit) {
          // 1개만 있지만 값이 유의미한 경우 (예: TradeAndOtherPayables 단일 항목이 비이자발생부채의 대부분을 차지)
          // 이 경우 합산이 아니라 단일 태그로 볼 수 있으므로, 단일 태그 검색에서 이미 찾았을 가능성이 높음
          // 하지만 혹시 모르니 사용하되 경고 로그 추가
          console.warn(`[XBRL Parser] 비이자발생부채 합산 항목이 1개만 발견되었습니다. 합산값을 사용하되 가짜 정밀도 가능성에 주의하세요.`)
          console.warn(`[XBRL Parser] 찾은 항목: ${foundComponents[0].tag}=${foundComponents[0].value.value.toLocaleString()} ${commonUnit}`)
          nonInterestBearingLiabilities = {
            value: totalSum,
            unit: commonUnit,
            contextRef: foundComponents[0]?.value.contextRef,
            decimals: undefined,
          }
        } else {
          console.warn(`[XBRL Parser] nonInterestBearingLiabilities (비이자발생부채) 합산 항목이 충분하지 않습니다 (찾은 항목: ${foundComponents.length}개, 합계: ${totalSum.toLocaleString()}). null로 유지합니다.`)
          if (foundComponents.length > 0) {
            console.warn(`[XBRL Parser] 찾은 운영부채 컴포넌트:`, foundComponents.map(c => `${c.tag}=${c.value.value.toLocaleString()}`))
          }
        }
      }
    }
    
    if (!nonInterestBearingLiabilities) {
      console.warn(`[XBRL Parser] nonInterestBearingLiabilities (비이자발생부채)를 찾을 수 없습니다. optional로 처리하여 null로 유지합니다. ROIC 계산이 불가능할 수 있습니다.`)
    } else {
      dlog(`[XBRL Parser] nonInterestBearingLiabilities (비이자발생부채) 추출 성공: ${nonInterestBearingLiabilities.value.toLocaleString()} ${nonInterestBearingLiabilities.unit}`)
    }

    // TypeScript null 체크: throw 후에도 명시적 체크 필요
    if (!totalAssets || !totalLiabilities || !totalEquity) {
      throw new Error('필수 재무상태표 항목이 null입니다.')
    }

    // priorEnd 값 추출 (전기말 데이터)
    let equityPriorEnd: XBRLValue | null = null
    let cashPriorEnd: XBRLValue | null = null
    let debtPriorEnd: XBRLValue | null = null
    let totalLiabilitiesPriorEnd: XBRLValue | null = null
    let netCashPriorEnd: XBRLValue | null = null

    // priorEndDate 계산: 현재 startDate의 전날 (요구사항에 따라)
    if (targetPeriod && targetPeriod.startDate) {
      // startDate 기준으로 priorEndDate 계산 (startDate가 없으면 계산하지 않음)
      const baseDate = new Date(targetPeriod.startDate)
      const priorEndDate = new Date(baseDate)
      priorEndDate.setDate(baseDate.getDate() - 1) // 전날
      const priorEndDateStr = priorEndDate.toISOString().split('T')[0] // YYYY-MM-DD

      // findBestInstantContextRef를 사용하여 priorEnd용 contextRef 선택
      const priorEndContextRef = findBestInstantContextRef(priorEndDateStr, this.xmlDoc, balanceAnchorContextRef || undefined)
      
      if (priorEndContextRef) {
        const priorEndTargetPeriod = { instant: priorEndDateStr }

        const foundEquityPriorEnd = this.findValueByTags(tagMapping.totalEquity, 'equityPriorEnd', { required: false, targetPeriod: priorEndTargetPeriod, anchorContextRef: priorEndContextRef });
        // unit 일치 검증: 현재 값과 동일한 unit만 채택
        if (foundEquityPriorEnd && totalEquity && foundEquityPriorEnd.unit === totalEquity.unit) {
          equityPriorEnd = foundEquityPriorEnd
        }
        
        const foundCashPriorEnd = this.findValueByTags((tagMapping as any).cash || [], 'cashPriorEnd', { required: false, targetPeriod: priorEndTargetPeriod, anchorContextRef: priorEndContextRef });
        // unit 일치 검증: 현재 값과 동일한 unit만 채택
        if (foundCashPriorEnd && cash && foundCashPriorEnd.unit === cash.unit) {
          cashPriorEnd = foundCashPriorEnd
        }
        
        // totalLiabilitiesPriorEnd 추출
        // 우선 시도: priorEndContextRef(anchorContextRef)로 찾기
        let foundTotalLiabilitiesPriorEnd = this.findValueByTags(tagMapping.totalLiabilities, 'totalLiabilitiesPriorEnd', { required: false, targetPeriod: priorEndTargetPeriod, anchorContextRef: priorEndContextRef });
        
        // 실패 시 2차 시도: anchorContextRef 없이 찾기
        // 이유: 전기말 항목들이 contextRef id가 서로 달라도(예: eTQ vs eTQA) 같은 instant 날짜/동일 차원(signature)로 존재할 수 있는데, anchorContextRef strict-match 때문에 누락되는 케이스가 있음
        if (!foundTotalLiabilitiesPriorEnd) {
          foundTotalLiabilitiesPriorEnd = this.findValueByTags(tagMapping.totalLiabilities, 'totalLiabilitiesPriorEnd', { required: false, targetPeriod: priorEndTargetPeriod });
        }
        
        // unit 일치 검증: 현재 값과 동일한 unit만 채택
        if (foundTotalLiabilitiesPriorEnd && totalLiabilities && foundTotalLiabilitiesPriorEnd.unit === totalLiabilities.unit) {
          totalLiabilitiesPriorEnd = foundTotalLiabilitiesPriorEnd
        }
        
        // debtPriorEnd도 components 합산 로직 적용
        let priorEndInterestBearingDebt: XBRLValue | null = null;
        if ((tagMapping as any).interestBearingDebtComponents) {
          const components = (tagMapping as any).interestBearingDebtComponents || [];
          const foundComponents: Array<{ tag: string; value: XBRLValue }> = [];
          let totalSum = 0;
          let commonUnit = '';
          const seenContextRefs = new Set<string>();

          for (const componentTag of components) {
            const componentValue = this.findValueByTags([componentTag], `interestBearingDebtComponentPriorEnd-${componentTag}`, { required: false, targetPeriod: priorEndTargetPeriod, anchorContextRef: priorEndContextRef });
            if (componentValue) {
              // priorEndContextRef와 일치하는 것만 사용
              if (componentValue.contextRef !== priorEndContextRef) {
                continue;
              }
              const contextKey = `${componentValue.contextRef || 'unknown'}-${componentTag}`;
              if (!seenContextRefs.has(contextKey)) {
                seenContextRefs.add(contextKey);
                foundComponents.push({ tag: componentTag, value: componentValue });
                if (!commonUnit) {
                  commonUnit = componentValue.unit;
                }
                if (componentValue.unit === commonUnit) {
                  totalSum += Math.abs(componentValue.value);
                }
              }
            }
          }
          if (foundComponents.length >= 1 && totalSum > 0 && commonUnit) {
            priorEndInterestBearingDebt = {
              value: totalSum,
              unit: commonUnit,
              contextRef: foundComponents[0]?.value.contextRef,
              decimals: undefined,
            };
          }
        }
        if (!priorEndInterestBearingDebt) {
          priorEndInterestBearingDebt = this.findValueByTags((tagMapping as any).interestBearingDebt || [], 'interestBearingDebtPriorEnd', { required: false, targetPeriod: priorEndTargetPeriod, anchorContextRef: priorEndContextRef });
        }
      // unit 일치 검증: 현재 값과 동일한 unit만 채택
      if (priorEndInterestBearingDebt && interestBearingDebt && priorEndInterestBearingDebt.unit === interestBearingDebt.unit) {
        debtPriorEnd = priorEndInterestBearingDebt;
      }

        if (cashPriorEnd && debtPriorEnd && cashPriorEnd.unit === debtPriorEnd.unit) {
          netCashPriorEnd = {
            value: cashPriorEnd.value - debtPriorEnd.value,
            unit: cashPriorEnd.unit,
            contextRef: cashPriorEnd.contextRef,
            decimals: undefined,
          };
        }
      }
    }

    return {
      totalAssets: this.createFinancialItem('자산총계', 'TotalAssets', totalAssets.value, totalAssets.unit),
      totalLiabilities: this.createFinancialItem('부채총계', 'TotalLiabilities', totalLiabilities.value, totalLiabilities.unit),
      totalEquity: this.createFinancialItem('자본총계', 'TotalEquity', totalEquity.value, totalEquity.unit),
      operatingAssets: operatingAssets
        ? this.createFinancialItem('영업자산', 'OperatingAssets', operatingAssets.value, operatingAssets.unit)
        : undefined,
      nonInterestBearingLiabilities: nonInterestBearingLiabilities
        ? this.createFinancialItem(
            '비이자발생부채',
            'NonInterestBearingLiabilities',
            nonInterestBearingLiabilities.value,
            nonInterestBearingLiabilities.unit
          )
        : undefined,
      accountsReceivable: accountsReceivable
        ? this.createFinancialItem('매출채권', 'AccountsReceivable', accountsReceivable.value, accountsReceivable.unit)
        : undefined,
      inventory: inventory
        ? this.createFinancialItem('재고자산', 'Inventory', inventory.value, inventory.unit)
        : undefined,
      cash: cash
        ? this.createFinancialItem('현금및현금성자산', 'Cash', cash.value, cash.unit)
        : undefined,
      interestBearingDebt: interestBearingDebt
        ? this.createFinancialItem('이자발생부채', 'InterestBearingDebt', interestBearingDebt.value, interestBearingDebt.unit)
        : undefined,
      equityPriorEnd: equityPriorEnd
        ? this.createFinancialItem('전기말 자본총계', 'EquityPriorEnd', equityPriorEnd.value, equityPriorEnd.unit)
        : undefined,
      cashPriorEnd: cashPriorEnd
        ? this.createFinancialItem('전기말 현금 및 현금성자산', 'CashPriorEnd', cashPriorEnd.value, cashPriorEnd.unit)
        : undefined,
      debtPriorEnd: debtPriorEnd
        ? this.createFinancialItem('전기말 이자발생부채', 'DebtPriorEnd', debtPriorEnd.value, debtPriorEnd.unit)
        : undefined,
      netCashPriorEnd: netCashPriorEnd
        ? this.createFinancialItem('전기말 순현금/순차입금', 'NetCashPriorEnd', netCashPriorEnd.value, netCashPriorEnd.unit)
        : undefined,
      totalLiabilitiesPriorEnd: totalLiabilitiesPriorEnd
        ? this.createFinancialItem('전기말 부채총계', 'TotalLiabilitiesPriorEnd', totalLiabilitiesPriorEnd.value, totalLiabilitiesPriorEnd.unit)
        : undefined,
    };
  }

  /**
   * 현금흐름표 파싱
   * 모든 Cashflow 항목을 동일한 기간(최신 CFY)으로 선택하여 기간 혼입 방지
   */
  parseCashFlowStatement(): CashFlowStatement {
    const tagMapping = this.country === 'KR' ? XBRL_TAG_MAPPINGS.ifrs : XBRL_TAG_MAPPINGS.gaap

    // 최신 기간 확정 (Cashflow는 Income과 같은 기간 사용)
    const latestPeriodInfo = this.extractLatestPeriodInfo()
    const targetPeriod = latestPeriodInfo ? {
      startDate: latestPeriodInfo.startDate,
      endDate: latestPeriodInfo.endDate || latestPeriodInfo.instant,
      instant: latestPeriodInfo.instant,
    } : undefined
    
    if (latestPeriodInfo && targetPeriod) {
      dlog(`[XBRL Parser] 현금흐름표 최신 기간 확정: ${latestPeriodInfo.periodTypeLabel || latestPeriodInfo.periodType} (start=${targetPeriod.startDate || 'N/A'}, end=${targetPeriod.endDate || 'N/A'})`)
    }

    const operatingCashFlow = this.findValueByTags(tagMapping.operatingCashFlow, 'operatingCashFlow', { required: true, targetPeriod });
    
    // 2-1단계: 작년 같은 기간 영업현금흐름 추출 (YoY 비교용)
    let ocfPrevYear: XBRLValue | null = null
    let capexPrevYear: XBRLValue | null = null
    if (targetPeriod && targetPeriod.startDate && targetPeriod.endDate) {
      const prevStartDate = shiftYear(targetPeriod.startDate, -1)
      const prevEndDate = shiftYear(targetPeriod.endDate, -1)
      if (prevStartDate && prevEndDate) {
        const foundOcfPrevYear = this.findValueByTags(tagMapping.operatingCashFlow, 'ocfPrevYear', {
          required: false,
          targetPeriod: { startDate: prevStartDate, endDate: prevEndDate }
        })
        // unit 일치 검증: 현재 값과 동일한 unit만 채택
        if (foundOcfPrevYear && operatingCashFlow && foundOcfPrevYear.unit === operatingCashFlow.unit) {
          ocfPrevYear = foundOcfPrevYear
        }
        
        // CAPEX도 prevYear 추출
        const prevCapexPPE = this.findValueByTags((tagMapping as any).capexPPE || [], 'capexPPEPrevYear', { required: false, targetPeriod: { startDate: prevStartDate, endDate: prevEndDate } });
        const prevCapexIntangible = this.findValueByTags((tagMapping as any).capexIntangible || [], 'capexIntangiblePrevYear', { required: false, targetPeriod: { startDate: prevStartDate, endDate: prevEndDate } });

        // CAPEX unit 일치 검증: 현재 CAPEX와 동일한 unit만 채택
        const currentCapexPPE = this.findValueByTags((tagMapping as any).capexPPE || [], 'capexPPE', { required: false, targetPeriod });
        const currentCapexIntangible = this.findValueByTags((tagMapping as any).capexIntangible || [], 'capexIntangible', { required: false, targetPeriod });
        const currentCapexUnit = currentCapexPPE?.unit || currentCapexIntangible?.unit || (operatingCashFlow ? operatingCashFlow.unit : 'KRW');

        if (CAPEX_POLICY === 'PPE_ONLY') {
          if (prevCapexPPE && prevCapexPPE.unit === currentCapexUnit) {
            capexPrevYear = { value: Math.abs(prevCapexPPE.value), unit: prevCapexPPE.unit, contextRef: prevCapexPPE.contextRef, decimals: prevCapexPPE.decimals };
          }
        } else if (CAPEX_POLICY === 'PPE_PLUS_INTANGIBLE') {
          const ppeValue = (prevCapexPPE && prevCapexPPE.unit === currentCapexUnit) ? Math.abs(prevCapexPPE.value) : 0;
          const intangibleValue = (prevCapexIntangible && prevCapexIntangible.unit === currentCapexUnit) ? Math.abs(prevCapexIntangible.value) : 0;
          if (ppeValue > 0 || intangibleValue > 0) {
            capexPrevYear = { value: ppeValue + intangibleValue, unit: currentCapexUnit, contextRef: prevCapexPPE?.contextRef || prevCapexIntangible?.contextRef, decimals: undefined };
          }
        }
      }
    }
    
    const investingCashFlow = this.findValueByTags(tagMapping.investingCashFlow, 'investingCashFlow', { required: false, targetPeriod });
    const financingCashFlow = this.findValueByTags(tagMapping.financingCashFlow, 'financingCashFlow', { required: false, targetPeriod });
    
    // CAPEX PPE와 Intangible을 각각 추출
    const capexPPE = this.findValueByTags((tagMapping as any).capexPPE || [], 'capexPPE', { required: false, targetPeriod });
    const capexIntangible = this.findValueByTags((tagMapping as any).capexIntangible || [], 'capexIntangible', { required: false, targetPeriod });

    if (!operatingCashFlow) {
      console.error(`[XBRL Parser] 현금흐름표 필수 항목 누락: operatingCashFlow (영업현금흐름)`)
      throw new InsufficientDataError(
        '현금흐름표 필수 항목이 누락되었습니다: operatingCashFlow (영업현금흐름)',
        ['operatingCashFlow']
      );
    }

    const unit = operatingCashFlow.unit;

    // CAPEX 정책에 따라 capitalExpenditure 계산
    let capitalExpenditureValue: number | undefined = undefined
    let capitalExpenditureItem: any = undefined
    let capexPPEItem: any = undefined
    let capexIntangibleItem: any = undefined
    
    if (capexPPE) {
      const ppeValue = Math.abs(capexPPE.value)
      capexPPEItem = this.createFinancialItem('CAPEX PPE', 'CapitalExpenditurePPE', ppeValue, unit)
      dlog(`[XBRL Parser] CAPEX PPE 추출 성공: ${ppeValue.toLocaleString()} ${unit}`)
    }
    
    if (capexIntangible) {
      const intangibleValue = Math.abs(capexIntangible.value)
      capexIntangibleItem = this.createFinancialItem('CAPEX Intangible', 'CapitalExpenditureIntangible', intangibleValue, unit)
      dlog(`[XBRL Parser] CAPEX Intangible 추출 성공: ${intangibleValue.toLocaleString()} ${unit}`)
    }
    
    // CAPEX 정책에 따라 합산
    if (CAPEX_POLICY === 'PPE_ONLY') {
      if (capexPPE) {
        capitalExpenditureValue = Math.abs(capexPPE.value)
        capitalExpenditureItem = this.createFinancialItem('CAPEX', 'CapitalExpenditure', capitalExpenditureValue, unit)
          dlog(`[XBRL Parser] CAPEX (PPE_ONLY): ${capitalExpenditureValue.toLocaleString()} ${unit}`)
      }
    } else if (CAPEX_POLICY === 'PPE_PLUS_INTANGIBLE') {
      const ppeValue = capexPPE ? Math.abs(capexPPE.value) : 0
      const intangibleValue = capexIntangible ? Math.abs(capexIntangible.value) : 0
      if (ppeValue > 0 || intangibleValue > 0) {
        capitalExpenditureValue = ppeValue + intangibleValue
        capitalExpenditureItem = this.createFinancialItem('CAPEX', 'CapitalExpenditure', capitalExpenditureValue, unit)
          dlog(`[XBRL Parser] CAPEX (PPE_PLUS_INTANGIBLE): ${capitalExpenditureValue.toLocaleString()} ${unit} (PPE: ${ppeValue.toLocaleString()}, Intangible: ${intangibleValue.toLocaleString()})`)
      }
    }
    
    if (!capitalExpenditureItem) {
      console.warn(`[XBRL Parser] CAPEX(자본적지출)를 찾을 수 없습니다. 선택적 필드로 처리하여 null로 유지합니다. FCF 계산이 불가능할 수 있습니다.`)
    }

    // FCF 계산: CAPEX가 null이면 FCF도 null로 처리 (OCF와 동일 값으로 표시되는 왜곡 방지)
    let freeCashFlowItem: any = undefined
    if (capitalExpenditureValue !== undefined) {
      const fcfValue = operatingCashFlow.value - capitalExpenditureValue
      freeCashFlowItem = this.createFinancialItem('FCF', 'FreeCashFlow', fcfValue, unit)
        dlog(`[XBRL Parser] FCF 계산 완료: ${fcfValue.toLocaleString()} ${unit} (OCF: ${operatingCashFlow.value.toLocaleString()}, CAPEX: ${capitalExpenditureValue.toLocaleString()})`)
    } else {
      console.warn(`[XBRL Parser] FCF 계산 불가: CAPEX 데이터가 없어 FCF를 계산하지 않습니다.`)
    }

    return {
      operatingCashFlow: this.createFinancialItem('영업현금흐름', 'OperatingCashFlow', operatingCashFlow.value, unit),
      ocfPrevYear: ocfPrevYear ? this.createFinancialItem('작년 같은 기간 영업현금흐름', 'OCFPrevYear', ocfPrevYear.value, ocfPrevYear.unit) : undefined,
      investingCashFlow: investingCashFlow
        ? this.createFinancialItem('투자현금흐름', 'InvestingCashFlow', investingCashFlow.value, unit)
        : undefined, // 찾지 못하면 undefined (0 강제 주입 금지)
      financingCashFlow: financingCashFlow
        ? this.createFinancialItem('재무현금흐름', 'FinancingCashFlow', financingCashFlow.value, unit)
        : undefined, // 찾지 못하면 undefined (0 강제 주입 금지)
      capitalExpenditure: capitalExpenditureItem, // 정책 결과 (찾지 못하면 undefined)
      capexPPE: capexPPEItem, // 구조적 분리 (찾지 못하면 undefined)
      capexIntangible: capexIntangibleItem, // 구조적 분리 (찾지 못하면 undefined)
      capitalExpenditurePrevYear: capexPrevYear ? this.createFinancialItem('작년 같은 기간 CAPEX', 'CapitalExpenditurePrevYear', capexPrevYear.value, capexPrevYear.unit) : undefined,
      freeCashFlow: freeCashFlowItem, // CAPEX가 없으면 undefined (OCF와 동일 값 왜곡 방지)
    };
  }

  /**
   * 전체 재무제표 파싱
   * @param companyName 회사명 (폴백용, XBRL에서 추출 실패 시 사용)
   * @param ticker 티커
   * @param fiscalYear 회계연도
   * @param quarter 분기
   * @param missingFields 누락 필드 목록을 누적할 배열 (옵션)
   */
  parseFinancialStatement(
    companyName: string,
    ticker: string,
    fiscalYear: number,
    quarter: number,
    missingFields: string[] = []
  ): FinancialStatement {
    // 회사명 추출 (XBRL에서 우선 추출, 실패 시 파라미터 사용, undefined 방지)
    const extractedCompanyName = this.extractCompanyName()
    let finalCompanyName = '기업명 미확인'
    if (extractedCompanyName && extractedCompanyName !== '기업명 미확인' && extractedCompanyName.trim() !== '') {
      finalCompanyName = extractedCompanyName.trim()
    } else if (companyName && typeof companyName === 'string' && companyName.trim() !== '' && 
               companyName !== 'Unknown Company' && companyName !== 'Unknown') {
      finalCompanyName = companyName.trim()
    }
    
    // 검증 로그: 주요 항목 추출 확인
            dlog('[XBRL Parser] === 주요 항목 추출 검증 시작 ===')
    
    const incomeStatement = this.parseIncomeStatement(missingFields);
    const balanceSheet = this.parseBalanceSheet();
    const cashFlowStatement = this.parseCashFlowStatement();

    // 현금흐름표의 영업현금흐름을 손익계산서에도 반영
    incomeStatement.operatingCashFlow = cashFlowStatement.operatingCashFlow;

    // periodType 및 기간 정보 추출 (손익계산서의 최신 기간 정보 기준 - extractLatestPeriodInfo 재사용)
    // parseIncomeStatement에서 이미 extractLatestPeriodInfo를 호출했지만, 일관성을 위해 다시 호출
    let periodType: 'FY' | 'Q' | 'YTD' | undefined
    let periodTypeLabel: string | undefined
    let startDate: string | undefined
    let endDate: string | undefined
    
    const latestPeriodInfo = this.extractLatestPeriodInfo()
    if (latestPeriodInfo) {
      periodType = latestPeriodInfo.periodType
      periodTypeLabel = latestPeriodInfo.periodTypeLabel
      // anchor 기간 정보 저장 (AnalysisBundle에서 사용할 단일 진실 소스)
      startDate = latestPeriodInfo.startDate
      endDate = latestPeriodInfo.endDate || latestPeriodInfo.instant
      
      // === anchor 기간 확정 로그 (사용자 요청: 5~10줄 상세 로그) ===
      dlog(`[XBRL Parser] === anchor 기간 확정 (parseFinancialStatement) ===`)
      dlog(`[XBRL Parser] 최신 기간 선택: ${periodTypeLabel || periodType}`)
      if (startDate && endDate) {
        dlog(`[XBRL Parser] anchor 기간(${startDate} ~ ${endDate})`)
      } else if (endDate) {
        dlog(`[XBRL Parser] anchor 기간(endDate=${endDate})`)
      } else if (latestPeriodInfo.instant) {
        dlog(`[XBRL Parser] anchor 기간(instant=${latestPeriodInfo.instant})`)
      }
      dlog(`[XBRL Parser] periodType: ${periodType}, periodTypeLabel: ${periodTypeLabel || 'N/A'}`)
      if (startDate) {
        dlog(`[XBRL Parser] startDate: ${startDate}`)
      }
      if (endDate) {
        dlog(`[XBRL Parser] endDate: ${endDate}`)
      }
      if (latestPeriodInfo.instant && !endDate) {
        dlog(`[XBRL Parser] instant: ${latestPeriodInfo.instant}`)
      }
      dlog(`[XBRL Parser] === anchor 기간 확정 완료 ===`)
    } else {
      // fallback: revenue의 contextRef에서 periodInfo 추출
      if (incomeStatement.revenue && incomeStatement.revenue.value) {
        const revenueContextRef = this.findRevenueContextRef()
        if (revenueContextRef) {
          const periodInfo = extractPeriodInfo(this.xmlDoc, revenueContextRef)
          if (periodInfo) {
            periodType = periodInfo.periodType
            periodTypeLabel = periodInfo.periodTypeLabel
            startDate = periodInfo.startDate
            endDate = periodInfo.endDate || periodInfo.instant
            console.warn(`[XBRL Parser] periodType 추출 (revenue contextRef 기준, fallback): ${periodTypeLabel || periodType} (start=${startDate || 'N/A'}, end=${endDate || 'N/A'})`)
            console.warn(`[XBRL Parser] ⚠️ extractLatestPeriodInfo() 실패로 fallback 사용. anchor 기간 정보가 불완전할 수 있습니다.`)
          }
        }
      }
    }

    // === fiscalYear 및 quarter 재계산 (anchor 기간에서 계산) ===
    // anchor 기간이 확정되었으면, 파라미터로 받은 fiscalYear/quarter보다 anchor 기간 기반 계산값을 우선 사용
    let finalFiscalYear = fiscalYear
    let finalQuarter = quarter
    
    if (endDate) {
      // endDate 기준으로 fiscalYear 계산 (anchor 기간 우선)
      const endYear = new Date(endDate).getFullYear()
      if (endYear >= 2000 && endYear <= 2100) {
        finalFiscalYear = endYear
      }
      
      // endDate 기준으로 quarter 계산 (anchor 기간 우선)
      // 예: endDate=2025-09-30이면 quarter=3 (9M(YTD)는 Q3)
      const endMonth = new Date(endDate).getMonth() + 1 // 1-12
      if (endMonth >= 1 && endMonth <= 3) {
        finalQuarter = 1 // Q1: 1월~3월 종료
      } else if (endMonth >= 4 && endMonth <= 6) {
        finalQuarter = 2 // Q2: 4월~6월 종료
      } else if (endMonth >= 7 && endMonth <= 9) {
        finalQuarter = 3 // Q3: 7월~9월 종료 (9M(YTD)는 Q3)
      } else if (endMonth >= 10 && endMonth <= 12) {
        finalQuarter = 4 // Q4: 10월~12월 종료
      }
      
      if (process.env.NODE_ENV !== 'production') {
        if (finalFiscalYear !== fiscalYear || finalQuarter !== quarter) {
          dlog(`[XBRL Parser] fiscalYear/quarter 재계산 (anchor 기간 기준): fiscalYear=${fiscalYear}→${finalFiscalYear}, quarter=${quarter}→${finalQuarter} (endDate=${endDate})`)
        }
      }
    }

    // 검증 로그: 주요 항목 값 확인 (차원 수 포함)
            dlog(`[XBRL Parser] === 주요 항목 추출 검증 결과 ===`)
            dlog(`[XBRL Parser] === 손익계산서 항목 간 기간 일관성 확인 ===`)
    
    // 매출 contextRef 및 차원 수
    const revenueContextRef = incomeStatement.revenue?.value ? this.findRevenueContextRef() : null
    const revenueDimCount = revenueContextRef ? this.getContextDimCount(revenueContextRef) : Infinity
            dlog(`[XBRL Parser] 매출(Revenue): ${incomeStatement.revenue?.value?.toLocaleString() || 'N/A'} ${incomeStatement.revenue?.unit || ''} (차원수: ${revenueDimCount !== Infinity ? revenueDimCount : 'unknown'})`)
    
    // 영업이익 contextRef 및 차원 수
    const operatingIncomeContextRef = incomeStatement.operatingIncome?.value ? this.findContextRefByFieldName('operatingIncome') : null
    const operatingIncomeDimCount = operatingIncomeContextRef ? this.getContextDimCount(operatingIncomeContextRef) : Infinity
            dlog(`[XBRL Parser] 영업이익(OperatingIncomeLoss): ${incomeStatement.operatingIncome?.value?.toLocaleString() || 'N/A'} ${incomeStatement.operatingIncome?.unit || ''} (차원수: ${operatingIncomeDimCount !== Infinity ? operatingIncomeDimCount : 'unknown'})`)
    
    // OCF contextRef 및 차원 수
    const ocfContextRef = cashFlowStatement.operatingCashFlow?.value ? this.findContextRefByFieldName('operatingCashFlow') : null
    const ocfDimCount = ocfContextRef ? this.getContextDimCount(ocfContextRef) : Infinity
            dlog(`[XBRL Parser] 영업활동현금흐름(OCF): ${cashFlowStatement.operatingCashFlow?.value?.toLocaleString() || 'N/A'} ${cashFlowStatement.operatingCashFlow?.unit || ''} (차원수: ${ocfDimCount !== Infinity ? ocfDimCount : 'unknown'})`)
    
    // 자본총계 contextRef 및 차원 수
    const equityContextRef = balanceSheet.totalEquity?.value ? this.findContextRefByFieldName('totalEquity') : null
    const equityDimCount = equityContextRef ? this.getContextDimCount(equityContextRef) : Infinity
            dlog(`[XBRL Parser] 자본총계(Equity): ${balanceSheet.totalEquity?.value?.toLocaleString() || 'N/A'} ${balanceSheet.totalEquity?.unit || ''} (차원수: ${equityDimCount !== Infinity ? equityDimCount : 'unknown'})`)
            dlog(`[XBRL Parser] 회사명: ${finalCompanyName || '기업명 미확인'}`)
            dlog(`[XBRL Parser] 기간 타입: ${periodTypeLabel || periodType || 'N/A'}`)

    return {
      companyName: finalCompanyName || '기업명 미확인', // undefined 방지
      ticker,
      country: this.country,
      fiscalYear: finalFiscalYear, // anchor 기간에서 재계산된 값 (파라미터보다 우선)
      quarter: finalQuarter, // anchor 기간에서 재계산된 값 (파라미터보다 우선)
      periodType, // XBRL Parser에서 확정한 anchor 기간 타입
      periodTypeLabel, // XBRL Parser에서 확정한 anchor 기간 라벨
      startDate, // XBRL Parser에서 확정한 anchor 기간 시작일 (단일 진실 소스)
      endDate,   // XBRL Parser에서 확정한 anchor 기간 종료일 (단일 진실 소스)
      incomeStatement,
      balanceSheet,
      cashFlowStatement,
    };
  }

  /**
   * 매출액의 contextRef 찾기 (periodType 추출용)
   * querySelectorAll 대신 안전한 방법 사용
   */
  private findRevenueContextRef(): string | null {
    return this.findContextRefByFieldName('revenue')
  }

  /**
   * 필드명으로 contextRef 찾기 (헬퍼 함수)
   */
  private findContextRefByFieldName(fieldName: string): string | null {
    const tagMapping = this.country === 'KR' ? XBRL_TAG_MAPPINGS.ifrs : XBRL_TAG_MAPPINGS.gaap
    const tags = (tagMapping as any)[fieldName] || []
    
    for (const tag of tags) {
      try {
        // Local Name 추출
        const tagParts = tag.split(':');
        const localName = tagParts.length > 1 ? tagParts[tagParts.length - 1] : tag;
        
        // getElementsByTagNameNS로 검색
        const elements = this.xmlDoc.getElementsByTagNameNS('*', localName);
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          
          // 전체 태그명 확인
          const elementTagName = element.tagName;
          if (tag === elementTagName || 
              elementTagName.endsWith(`:${localName}`) || 
              elementTagName === localName) {
            
            try {
              const value = this.extractValue(element);
              // 0값 제외 제거: 0도 유효한 값일 수 있음
              // nil/empty만 제외
              if (value !== null) {
                const isNil = element.getAttribute('xsi:nil') === 'true' || 
                              element.getAttribute('nil') === 'true';
                if (!isNil) {
                  const contextRef = element.getAttribute('contextRef');
                  if (contextRef) {
                    return contextRef;
                  }
                }
              }
            } catch (error) {
              continue;
            }
          }
        }
      } catch (error) {
        // 태그 검색 실패는 무시하고 계속
        continue;
      }
    }
    return null
  }
}

/**
 * XBRL 파서 팩토리 함수
 */
export function createXBRLParser(xmlContent: string, country: CountryCode = 'KR'): XBRLParser {
  return new XBRLParser(xmlContent, country);
}
