/**
 * 통합 파서
 * 국가에 따라 DART 또는 SEC 파서를 선택하여 사용
 */

import type { UnifiedParser, ParserResult } from './interfaces';
import type { CountryCode } from '@/types/industry';
import { createDARTParser } from './dart';
import { createSECParser } from './sec';

/**
 * 통합 파서 구현
 */
export class UnifiedParserImpl implements UnifiedParser {
  private dartParser?: ReturnType<typeof createDARTParser>;
  private secParser?: ReturnType<typeof createSECParser>;

  constructor(
    dartApiKey?: string,
    secUserAgent?: string
  ) {
    if (dartApiKey) {
      this.dartParser = createDARTParser(dartApiKey);
    }
    
    if (secUserAgent) {
      this.secParser = createSECParser(secUserAgent);
    }
  }

  /**
   * 국가에 따라 적절한 파서로 재무제표 조회
   */
  async fetchFinancialStatement(
    country: CountryCode,
    companyNameOrTicker: string,
    fiscalYear: number,
    quarter: number = 0
  ): Promise<ParserResult> {
    if (country === 'KR') {
      if (!this.dartParser) {
        throw new Error('DART API 키가 설정되지 않았습니다.');
      }
      return this.dartParser.fetchFinancialStatement(
        companyNameOrTicker,
        fiscalYear,
        quarter
      );
    } else if (country === 'US') {
      if (!this.secParser) {
        throw new Error('SEC 파서가 설정되지 않았습니다.');
      }
      return this.secParser.fetchFinancialStatement(
        companyNameOrTicker,
        fiscalYear,
        quarter
      );
    } else {
      throw new Error(`지원하지 않는 국가: ${country}`);
    }
  }
}

/**
 * 통합 파서 팩토리 함수
 */
export function createUnifiedParser(
  dartApiKey?: string,
  secUserAgent?: string
): UnifiedParser {
  return new UnifiedParserImpl(dartApiKey, secUserAgent);
}
