/**
 * 데이터 파이프라인
 * DART API 연동 및 실시간 데이터 수집
 */

import { getDARTClient, type DisclosureInfo } from './dart-client';
import { createXBRLParser } from './xbrl-parser';
import type { FinancialStatement } from '@/types/financial';
import type { CountryCode } from '@/types/industry';
import { CalculationError, InsufficientDataError } from '@/lib/utils/errors';
import { validateFinancialStatement } from './validation';
import { resolveCorpCode } from './corp-code-resolver';

/**
 * 보고서 정보
 */
export interface ReportInfo {
  /** 공시번호 */
  rceptNo: string;
  
  /** 보고서명 */
  reportName: string;
  
  /** 접수일자 */
  rceptDate: string;
  
  /** PDF URL */
  pdfUrl: string;
  
  /** XBRL XML */
  xbrlXml?: string;
  
  /** 재무제표 데이터 */
  financialStatement?: FinancialStatement;
}

/**
 * 데이터 파이프라인 결과
 */
export interface PipelineResult {
  /** 성공 여부 */
  success: boolean;
  
  /** 보고서 목록 (최근 3개년) */
  reports: ReportInfo[];
  
  /** 에러 메시지 */
  error?: string;
  
  /** 데이터 무결성 검증 결과 */
  validationErrors?: string[];
}

/**
 * 데이터 파이프라인
 */
export class DataPipeline {
  private client = getDARTClient();

  /**
   * 회사 코드로 최근 3개년 보고서 조회
   */
  async fetchRecentReports(
    corpCode: string,
    reportType: '사업보고서' | '분기보고서' = '사업보고서'
  ): Promise<DisclosureInfo[]> {
    const currentYear = new Date().getFullYear();
    const reports: DisclosureInfo[] = [];
    
    // 최근 3개년 조회
    for (let year = currentYear; year >= currentYear - 2; year--) {
      const yearReports = await this.client.getRecentFinancialReports(
        corpCode,
        reportType,
        10
      );
      
      // 해당 연도 보고서 필터링
      const yearFiltered = yearReports.filter((report) => {
        const reportYear = parseInt(report.rcept_dt.substring(0, 4));
        return reportYear === year;
      });
      
      reports.push(...yearFiltered);
    }
    
    // 중복 제거 및 정렬 (최신순)
    const uniqueReports = Array.from(
      new Map(reports.map(r => [r.rcept_no, r])).values()
    ).sort((a, b) => b.rcept_dt.localeCompare(a.rcept_dt));
    
    return uniqueReports.slice(0, 10); // 최대 10개
  }

  /**
   * 보고서의 XBRL 및 PDF 정보 수집
   */
  async collectReportData(
    disclosure: DisclosureInfo,
    companyName: string,
    ticker: string,
    country: CountryCode = 'KR'
  ): Promise<ReportInfo> {
    const reportInfo: ReportInfo = {
      rceptNo: disclosure.rcept_no,
      reportName: disclosure.report_nm,
      rceptDate: disclosure.rcept_dt,
      pdfUrl: '',
    };

    try {
      // PDF URL 추출
      reportInfo.pdfUrl = await this.client.getPDFURL(disclosure.rcept_no);
      
      // XBRL 다운로드
      try {
        reportInfo.xbrlXml = await this.client.downloadXBRL(disclosure.rcept_no);
        
        // XBRL 파싱
        if (reportInfo.xbrlXml) {
          const parser = createXBRLParser(reportInfo.xbrlXml, country);
          const fiscalYear = parseInt(disclosure.rcept_dt.substring(0, 4));
          const quarter = disclosure.report_nm.includes('분기') ? 
            parseInt(disclosure.report_nm.match(/제(\d)분기/)?.[1] || '0') : 0;
          
          const missingFields: string[] = [];
          reportInfo.financialStatement = parser.parseFinancialStatement(
            companyName,
            ticker,
            fiscalYear,
            quarter,
            missingFields // 누락 필드 목록 누적
          );
          
          // 데이터 검증
          const validation = validateFinancialStatement(reportInfo.financialStatement);
          if (!validation.valid) {
            throw new CalculationError(
              '재무제표 검증 실패',
              'financial_statement_validation',
              { errors: validation.errors }
            );
          }
        }
      } catch (xbrlError) {
        // XBRL 파싱 실패는 경고로 처리 (PDF는 여전히 사용 가능)
        console.warn('XBRL 파싱 실패:', xbrlError);
      }
    } catch (error) {
      throw new Error(
        `보고서 데이터 수집 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      );
    }

    return reportInfo;
  }

  /**
   * 기업명 또는 종목코드로 회사 고유번호 해석
   */
  async resolveCompanyCode(
    companyNameOrTicker: string,
    onProgress?: (progress: { stage: string; percentage: number; message: string }) => void
  ): Promise<{ corpCode: string; companyName: string; ticker: string }> {
    console.log(`[DataPipeline] 회사 코드 해석 시작: ${companyNameOrTicker}`);
    const resolution = await resolveCorpCode(companyNameOrTicker, onProgress);
    
    if (!resolution.success || !resolution.corp_code) {
      throw new Error(
        resolution.error || `"${companyNameOrTicker}"에 해당하는 회사를 찾을 수 없습니다.`
      );
    }

    return {
      corpCode: resolution.corp_code,
      companyName: resolution.companyInfo?.corp_name || companyNameOrTicker,
      ticker: resolution.companyInfo?.stock_code || '',
    };
  }

  /**
   * 기업 검색 및 최근 3개년 보고서 수집
   */
  async fetchCompanyReports(
    companyNameOrTicker: string,
    country: CountryCode = 'KR',
    onProgress?: (progress: { stage: string; percentage: number; message: string }) => void
  ): Promise<PipelineResult> {
    console.log(`[DataPipeline] 보고서 수집 시작: ${companyNameOrTicker} (${country})`);
    
      // 기업명/종목코드로 회사 고유번호 해석 (Direct Lookup - 백그라운드 업데이트 기다리지 않음)
      onProgress?.({
        stage: 'resolving',
        percentage: 10,
        message: '기업 고유번호 확인 중...',
      });
      console.log(`[DEBUG] Direct Lookup Mode: ${companyNameOrTicker}`);
      const { corpCode, companyName, ticker } = await this.resolveCompanyCode(companyNameOrTicker, onProgress);
      console.log(`[DataPipeline] 회사 코드 해석 완료: ${corpCode} (${companyName})`);
      
      // corp_code를 찾으면 즉시 30%로 점프 (이미 resolveCorpCode에서 처리됨)
      // 추가 확인: 만약 아직 30%가 아니면 강제로 30%로 설정
      onProgress?.({
        stage: 'resolved',
        percentage: 30,
        message: '최근 3개년 공시 리스트 수집 중...',
      });
    const validationErrors: string[] = [];
    
    try {
      // 최근 3개년 보고서 조회
      onProgress?.({
        stage: 'fetching',
        percentage: 30,
        message: '최근 3개년 공시 리스트 수집 중...',
      });
      console.log(`[DataPipeline] 최근 보고서 조회 시작: ${corpCode}`);
      const disclosures = await this.fetchRecentReports(corpCode, '사업보고서');
      console.log(`[DataPipeline] 보고서 조회 완료: ${disclosures.length}개`);
      
      if (disclosures.length === 0) {
        return {
          success: false,
          reports: [],
          error: '최근 3개년 보고서를 찾을 수 없습니다.',
        };
      }

      // 각 보고서 데이터 수집 (XBRL 및 PDF 파싱)
      const reports: ReportInfo[] = [];
      const totalReports = disclosures.length;
      for (let i = 0; i < disclosures.length; i++) {
        const disclosure = disclosures[i];
        try {
          onProgress?.({
            stage: 'parsing',
            percentage: 50 + (i / totalReports) * 30,
            message: `재무제표(XBRL) 및 주석(PDF) 파싱 중... (${i + 1}/${totalReports})`,
          });
          console.log(`[DataPipeline] 보고서 데이터 수집: ${disclosure.report_nm} (${i + 1}/${totalReports})`);
          const reportInfo = await this.collectReportData(
            disclosure,
            companyName,
            ticker || companyNameOrTicker,
            country
          );
          reports.push(reportInfo);
          console.log(`[DataPipeline] 보고서 데이터 수집 완료: ${disclosure.report_nm}`);
          
          // 데이터 무결성 검증
          if (reportInfo.financialStatement) {
            const validation = validateFinancialStatement(reportInfo.financialStatement);
            if (!validation.valid) {
              validationErrors.push(
                `${reportInfo.reportName}: ${validation.errors.join(', ')}`
              );
            }
          }
        } catch (error) {
          validationErrors.push(
            `${disclosure.report_nm}: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
          );
        }
      }

      // 데이터 무결성 오류가 있으면 분석 보류
      if (validationErrors.length > 0) {
        return {
          success: false,
          reports,
          error: '데이터 신뢰성 부족으로 분석 보류',
          validationErrors,
        };
      }

      return {
        success: true,
        reports,
      };
    } catch (error) {
      return {
        success: false,
        reports: [],
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      };
    }
  }
}

/**
 * 데이터 파이프라인 인스턴스
 */
let pipelineInstance: DataPipeline | null = null;

/**
 * 데이터 파이프라인 인스턴스 가져오기
 */
export function getDataPipeline(): DataPipeline {
  if (!pipelineInstance) {
    pipelineInstance = new DataPipeline();
  }
  return pipelineInstance;
}
