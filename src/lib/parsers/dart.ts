/**
 * DART (Data Analysis, Retrieval and Transfer) 파서
 * 한국 공시 데이터 수집 및 파싱
 */

import type { DARTParser, ParserResult } from './interfaces';
import type { FinancialStatement } from '@/types/financial';
import {
  CalculationError,
  InsufficientDataError
} from '@/lib/utils/errors';
import { validateFinancialStatement } from './validation';
import { getDARTClient, type DisclosureInfo } from './dart-client';

/**
 * DART 파서 구현
 */
export class DARTParserImpl implements DARTParser {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('DART API 키가 필요합니다.');
    }
    this.apiKey = apiKey;
  }

  /**
   * 기업 정보로 재무제표 조회
   */
  async fetchFinancialStatement(
    companyNameOrTicker: string,
    fiscalYear: number,
    quarter: number = 0
  ): Promise<ParserResult> {
    try {
      // TODO: 실제 DART API 호출 구현
      // 현재는 인터페이스만 제공
      
      // 티커로 회사 코드 조회
      const corpCode = await this.getCorpCode(companyNameOrTicker);
      
      // 재무제표 조회
      const xbrlData = await this.fetchXBRLData(corpCode, fiscalYear, quarter);
      
      // XBRL 파싱
      const financialStatement = await this.parseXBRL(xbrlData);
      
      // 데이터 검증
      const validation = validateFinancialStatement(financialStatement);
      
      if (!validation.valid) {
        throw new CalculationError(
          '재무제표 검증 실패',
          'financial_statement_validation',
          { errors: validation.errors }
        );
      }
      
      return {
        success: true,
        financialStatement,
        source: 'DART',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
        source: 'DART',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * XBRL 데이터 파싱
   */
  async parseXBRL(xbrlData: unknown): Promise<FinancialStatement> {
    // TODO: 실제 XBRL 파싱 로직 구현
    // 현재는 타입 정의만 제공
    
    throw new Error('XBRL 파싱 로직이 아직 구현되지 않았습니다.');
  }

  /**
   * 회사 코드 조회 (티커 또는 회사명으로)
   * DART API의 company.json 엔드포인트 사용
   */
  private async getCorpCode(companyNameOrTicker: string): Promise<string> {
    const client = getDARTClient();
    
    // TODO: DART API의 company.json 엔드포인트를 사용하여 회사 코드 조회
    // 현재는 티커나 회사명으로 직접 조회하는 API가 제한적이므로
    // 공시 목록 조회를 통해 역추적하거나 별도 회사 코드 DB가 필요할 수 있음
    
    throw new Error('회사 코드 조회 로직이 아직 구현되지 않았습니다. 회사 코드를 직접 제공해주세요.');
  }

  /**
   * XBRL 데이터 조회
   */
  private async fetchXBRLData(
    corpCode: string,
    fiscalYear: number,
    quarter: number
  ): Promise<unknown> {
    const client = getDARTClient();
    
    // 재무제표 보고서 찾기
    const reports = await client.getRecentFinancialReports(
      corpCode,
      quarter === 0 ? '사업보고서' : '분기보고서',
      10
    );
    
    // 해당 연도/분기의 보고서 찾기
    const targetReport = reports.find((report) => {
      const reportYear = parseInt(report.rcept_dt.substring(0, 4));
      return reportYear === fiscalYear;
    });
    
    if (!targetReport) {
      throw new Error(`해당 연도(${fiscalYear})의 재무제표를 찾을 수 없습니다.`);
    }
    
    // XBRL 다운로드
    const xbrlData = await client.downloadXBRL(targetReport.rcept_no);
    
    return xbrlData;
  }
}

/**
 * DART 파서 팩토리 함수
 */
export function createDARTParser(apiKey: string): DARTParser {
  return new DARTParserImpl(apiKey);
}
