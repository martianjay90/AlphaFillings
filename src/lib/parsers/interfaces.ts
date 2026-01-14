/**
 * 데이터 파서 인터페이스 정의
 * DART와 SEC 데이터 수집을 위한 공통 인터페이스
 */

import type { FinancialStatement } from '@/types/financial';
import type { CountryCode } from '@/types/industry';

/**
 * 파서 결과
 */
export interface ParserResult {
  /** 성공 여부 */
  success: boolean;
  
  /** 재무제표 데이터 */
  financialStatement?: FinancialStatement;
  
  /** 에러 메시지 */
  error?: string;
  
  /** 원본 데이터 출처 */
  source: 'DART' | 'SEC';
  
  /** 파싱 일시 */
  timestamp: string;
}

/**
 * DART 파서 인터페이스
 */
export interface DARTParser {
  /**
   * 기업 정보로 재무제표 조회
   * @param companyNameOrTicker 기업명 또는 티커
   * @param fiscalYear 회계연도
   * @param quarter 분기 (0 = 연간)
   */
  fetchFinancialStatement(
    companyNameOrTicker: string,
    fiscalYear: number,
    quarter?: number
  ): Promise<ParserResult>;
  
  /**
   * XBRL 데이터 파싱
   * @param xbrlData XBRL 원본 데이터
   */
  parseXBRL(xbrlData: unknown): Promise<FinancialStatement>;
}

/**
 * SEC 파서 인터페이스
 */
export interface SECParser {
  /**
   * 기업 정보로 재무제표 조회
   * @param ticker 티커 심볼
   * @param fiscalYear 회계연도
   * @param quarter 분기 (0 = 연간)
   */
  fetchFinancialStatement(
    ticker: string,
    fiscalYear: number,
    quarter?: number
  ): Promise<ParserResult>;
  
  /**
   * XBRL 데이터 파싱
   * @param xbrlData XBRL 원본 데이터
   */
  parseXBRL(xbrlData: unknown): Promise<FinancialStatement>;
}

/**
 * 통합 파서 인터페이스
 */
export interface UnifiedParser {
  /**
   * 국가에 따라 적절한 파서로 재무제표 조회
   * @param country 국가 코드
   * @param companyNameOrTicker 기업명 또는 티커
   * @param fiscalYear 회계연도
   * @param quarter 분기
   */
  fetchFinancialStatement(
    country: CountryCode,
    companyNameOrTicker: string,
    fiscalYear: number,
    quarter?: number
  ): Promise<ParserResult>;
}
