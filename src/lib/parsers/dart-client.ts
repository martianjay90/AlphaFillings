/**
 * DART API 클라이언트
 * 공시 목록 조회, XBRL 다운로드, 보고서 PDF URL 추출
 */

import { dartRateLimiter } from '@/lib/utils/rate-limiter';

/**
 * DART API 기본 URL
 */
const DART_API_BASE_URL = 'https://opendart.fss.or.kr/api';

/**
 * DART Rate Limiter export (다른 모듈에서 사용 가능)
 */
export { dartRateLimiter };

/**
 * DART API 응답 기본 구조
 */
interface DARTAPIResponse {
  status: string;
  message: string;
}

/**
 * 공시 목록 조회 파라미터
 */
export interface DisclosureListParams {
  /** 회사 코드 (8자리) */
  corp_code: string;
  
  /** 시작일 (YYYYMMDD) */
  bgn_de?: string;
  
  /** 종료일 (YYYYMMDD) */
  end_de?: string;
  
  /** 페이지 번호 (기본값: 1) */
  page_no?: number;
  
  /** 페이지당 건수 (기본값: 100, 최대: 100) */
  page_count?: number;
}

/**
 * 공시 정보
 */
export interface DisclosureInfo {
  /** 공시번호 */
  rcept_no: string;
  
  /** 종목코드 */
  stock_code: string;
  
  /** 법인명 */
  corp_name: string;
  
  /** 공시제목 */
  report_nm: string;
  
  /** 접수일자 */
  rcept_dt: string;
  
  /** 공시 유형 */
  flr_nm?: string;
  
  /** 공시 상세 유형 */
  rm?: string;
}

/**
 * 공시 목록 조회 응답
 */
export interface DisclosureListResponse extends DARTAPIResponse {
  /** 총 건수 */
  total_count?: number;
  
  /** 총 페이지 수 */
  total_page?: number;
  
  /** 공시 목록 */
  list?: DisclosureInfo[];
}

/**
 * 문서 다운로드 파라미터
 */
export interface DocumentDownloadParams {
  /** 공시번호 */
  rcept_no: string;
  
  /** 문서 타입 (기본값: xml) */
  type?: 'xml' | 'pdf';
}

/**
 * 뷰어 정보 조회 파라미터
 */
export interface ViewerInfoParams {
  /** 공시번호 */
  rcept_no: string;
}

/**
 * 뷰어 정보 응답
 */
export interface ViewerInfoResponse extends DARTAPIResponse {
  /** 보고서 정보 */
  report?: {
    /** 공시번호 */
    rcept_no: string;
    
    /** 보고서명 */
    report_nm: string;
    
    /** PDF URL */
    pdf_url?: string;
    
    /** HTML URL */
    html_url?: string;
    
    /** 첨부파일 목록 */
    attachments?: Array<{
      /** 파일명 */
      file_nm: string;
      
      /** 파일 URL */
      file_url: string;
    }>;
  };
}

/**
 * 회사 정보 (공시대상회사 리스트용)
 */
export interface CompanyInfo {
  /** 회사 고유번호 (corp_code) */
  corp_code: string;
  
  /** 종목코드 */
  stock_code: string;
  
  /** 회사명 */
  corp_name: string;
  
  /** 수정일자 */
  modify_date: string;
}

/**
 * 회사 리스트 응답
 */
export interface CompanyListResponse extends DARTAPIResponse {
  /** 회사 리스트 */
  list?: CompanyInfo[];
}

/**
 * DART API 클라이언트
 */
export class DARTClient {
  private apiKey: string;

  constructor(apiKey?: string) {
    // 환경 변수에서 API 키 로드
    // 우선순위: 1) 직접 전달된 키, 2) NEXT_PUBLIC_DART_API_KEY, 3) DART_API_KEY
    const envApiKey = 
      process.env.NEXT_PUBLIC_DART_API_KEY || 
      process.env.DART_API_KEY || 
      '';
    
    this.apiKey = apiKey || envApiKey;
    
    if (!this.apiKey) {
      // 디버깅을 위해 시도한 모든 변수명 포함
      const attemptedVars = [
        'NEXT_PUBLIC_DART_API_KEY',
        'DART_API_KEY'
      ];
      
      const availableVars = attemptedVars.filter(varName => {
        const value = process.env[varName];
        return value !== undefined && value !== null;
      });
      
      throw new Error(
        `DART API 키를 찾을 수 없습니다. ` +
        `시도한 환경 변수: ${attemptedVars.join(', ')}. ` +
        `사용 가능한 변수: ${availableVars.length > 0 ? availableVars.join(', ') : '없음'}. ` +
        `.env.local 파일에 NEXT_PUBLIC_DART_API_KEY 또는 DART_API_KEY를 설정해주세요.`
      );
    }
  }

  /**
   * 타임아웃이 있는 fetch 래퍼 (3초 타임아웃, 캐시 무력화)
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs: number = 3000
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        cache: 'no-store', // 캐시 무력화
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[DARTClient] 타임아웃 발생:', {
          url,
          timeoutMs,
          timestamp: new Date().toISOString(),
        });
        throw new Error('일시적 네트워크 오류: DART 서버 응답 지연 (3초 타임아웃)');
      }
      console.error('[DARTClient] Fetch 오류:', {
        url,
        error: error instanceof Error ? error.message : '알 수 없는 오류',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * API 요청 공통 메서드
   */
  private async request<T extends DARTAPIResponse>(
    endpoint: string,
    params: Record<string, string | number | undefined>,
    useRateLimit: boolean = true
  ): Promise<T> {
    // API 키 추가
    const queryParams = new URLSearchParams({
      crtfc_key: this.apiKey,
      ...Object.fromEntries(
        Object.entries(params)
          .filter(([_, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)])
      )
    });

    const url = `${DART_API_BASE_URL}/${endpoint}?${queryParams.toString()}`;

    // Rate Limit 적용 (큐 기반 순차 처리)
    if (useRateLimit) {
      return dartRateLimiter.enqueue(async () => {
        try {
          const response = await this.fetchWithTimeout(
            url,
            {
              method: 'GET',
              headers: {
                'Accept': 'application/json',
              },
            },
            3000 // 3초 타임아웃
          );

          if (!response.ok) {
            const error = new Error(`HTTP error! status: ${response.status}`);
            console.error('[DARTClient] HTTP 오류:', {
              url,
              status: response.status,
              statusText: response.statusText,
              timestamp: new Date().toISOString(),
            });
            throw error;
          }

          let data: T;
          try {
            data = await response.json() as T;
          } catch (jsonError) {
            console.error('[DARTClient] JSON 파싱 오류:', {
              url,
              error: jsonError instanceof Error ? jsonError.message : '알 수 없는 오류',
              timestamp: new Date().toISOString(),
            });
            throw new Error('DART API 응답 파싱 실패');
          }

          // DART API 에러 체크
          if (data.status === '000') {
            return data;
          } else {
            const error = new Error(`DART API 오류: ${data.message} (상태: ${data.status})`);
            console.error('[DARTClient] DART API 오류 응답:', {
              url,
              status: data.status,
              message: data.message,
              timestamp: new Date().toISOString(),
            });
            throw error;
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
          console.error('[DARTClient] API 요청 실패:', {
            url,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
          });
          if (error instanceof Error) {
            throw new Error(`DART API 요청 실패: ${errorMessage}`);
          }
          throw new Error('DART API 요청 중 알 수 없는 오류가 발생했습니다.');
        }
      });
    }

    // Rate Limit 없이 직접 실행
    try {
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        },
        3000 // 3초 타임아웃
      );

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        console.error('[DARTClient] HTTP 오류:', {
          url,
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
        });
        throw error;
      }

      let data: T;
      try {
        data = await response.json() as T;
      } catch (jsonError) {
        console.error('[DARTClient] JSON 파싱 오류:', {
          url,
          error: jsonError instanceof Error ? jsonError.message : '알 수 없는 오류',
          timestamp: new Date().toISOString(),
        });
        throw new Error('DART API 응답 파싱 실패');
      }

      // DART API 에러 체크
      if (data.status === '000') {
        return data;
      } else {
        const error = new Error(`DART API 오류: ${data.message} (상태: ${data.status})`);
        console.error('[DARTClient] DART API 오류 응답:', {
          url,
          status: data.status,
          message: data.message,
          timestamp: new Date().toISOString(),
        });
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error('[DARTClient] API 요청 실패:', {
        url,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      if (error instanceof Error) {
        throw new Error(`DART API 요청 실패: ${errorMessage}`);
      }
      throw new Error('DART API 요청 중 알 수 없는 오류가 발생했습니다.');
    }
  }

  /**
   * 공시 목록 조회
   * @param params 조회 파라미터
   */
  async getDisclosureList(
    params: DisclosureListParams
  ): Promise<DisclosureListResponse> {
    const queryParams: Record<string, string | number> = {
      corp_code: params.corp_code,
    };

    if (params.bgn_de) {
      queryParams.bgn_de = params.bgn_de;
    }
    if (params.end_de) {
      queryParams.end_de = params.end_de;
    }
    if (params.page_no) {
      queryParams.page_no = params.page_no;
    }
    if (params.page_count) {
      queryParams.page_count = params.page_count;
    }

    return this.request<DisclosureListResponse>('list.json', queryParams);
  }

  /**
   * XBRL 문서 다운로드
   * @param rceptNo 공시번호
   * @returns XBRL XML 문자열
   */
  async downloadXBRL(rceptNo: string, useRateLimit: boolean = true): Promise<string> {
    const url = `${DART_API_BASE_URL}/document.xml?${new URLSearchParams({
      crtfc_key: this.apiKey,
      rcept_no: rceptNo,
    }).toString()}`;

    // Rate Limit 적용 (큐 기반 순차 처리)
    if (useRateLimit) {
      return dartRateLimiter.enqueue(async () => {
        try {
          const response = await this.fetchWithTimeout(
            url,
            {
              method: 'GET',
              headers: {
                'Accept': 'application/xml, text/xml',
              },
            },
            3000 // 3초 타임아웃
          );

          if (!response.ok) {
            const error = new Error(`HTTP error! status: ${response.status}`);
            console.error('[DARTClient] XBRL 다운로드 HTTP 오류:', {
              url,
              status: response.status,
              statusText: response.statusText,
              timestamp: new Date().toISOString(),
            });
            throw error;
          }

          const xmlText = await response.text();
          return xmlText;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
          console.error('[DARTClient] XBRL 다운로드 실패:', {
            url,
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            timestamp: new Date().toISOString(),
          });
          if (error instanceof Error) {
            throw new Error(`XBRL 다운로드 실패: ${errorMessage}`);
          }
          throw new Error('XBRL 다운로드 중 알 수 없는 오류가 발생했습니다.');
        }
      });
    }

    // Rate Limit 없이 직접 실행
    try {
      const response = await this.fetchWithTimeout(
        url,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/xml, text/xml',
          },
        },
        3000 // 3초 타임아웃
      );

      if (!response.ok) {
        const error = new Error(`HTTP error! status: ${response.status}`);
        console.error('[DARTClient] XBRL 다운로드 HTTP 오류:', {
          url,
          status: response.status,
          statusText: response.statusText,
          timestamp: new Date().toISOString(),
        });
        throw error;
      }

      const xmlText = await response.text();
      return xmlText;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
      console.error('[DARTClient] XBRL 다운로드 실패:', {
        url,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      if (error instanceof Error) {
        throw new Error(`XBRL 다운로드 실패: ${errorMessage}`);
      }
      throw new Error('XBRL 다운로드 중 알 수 없는 오류가 발생했습니다.');
    }
  }

  /**
   * PDF 문서 다운로드 URL 생성
   * @param rceptNo 공시번호
   * @returns PDF 다운로드 URL
   */
  getPDFDownloadURL(rceptNo: string): string {
    return `${DART_API_BASE_URL}/document.pdf?${new URLSearchParams({
      crtfc_key: this.apiKey,
      rcept_no: rceptNo,
    }).toString()}`;
  }

  /**
   * 보고서 뷰어 정보 조회 (PDF URL 포함)
   * @param rceptNo 공시번호
   */
  async getViewerInfo(rceptNo: string): Promise<ViewerInfoResponse> {
    return this.request<ViewerInfoResponse>('viewer.json', {
      rcept_no: rceptNo,
    });
  }

  /**
   * 보고서 PDF URL 추출
   * @param rceptNo 공시번호
   * @returns PDF URL (뷰어 정보에서 추출, 없으면 다운로드 URL 반환)
   */
  async getPDFURL(rceptNo: string): Promise<string> {
    try {
      const viewerInfo = await this.getViewerInfo(rceptNo);
      
      // 뷰어 정보에서 PDF URL 추출
      if (viewerInfo.report?.pdf_url) {
        return viewerInfo.report.pdf_url;
      }
      
      // PDF URL이 없으면 다운로드 URL 반환
      return this.getPDFDownloadURL(rceptNo);
    } catch (error) {
      // 뷰어 정보 조회 실패 시 다운로드 URL 반환
      return this.getPDFDownloadURL(rceptNo);
    }
  }

  /**
   * 공시대상회사 전체 리스트 조회
   * @returns 회사 정보 리스트
   */
  async getCompanyList(): Promise<CompanyListResponse> {
    return this.request<CompanyListResponse>('company.json', {});
  }

  /**
   * 특정 기업의 최근 재무제표 공시 조회
   * @param corpCode 회사 코드
   * @param reportType 보고서 유형 (예: '사업보고서', '분기보고서')
   * @param limit 최대 조회 건수 (기본값: 10)
   */
  async getRecentFinancialReports(
    corpCode: string,
    reportType?: string,
    limit: number = 10
  ): Promise<DisclosureInfo[]> {
    const response = await this.getDisclosureList({
      corp_code: corpCode,
      page_count: limit,
    });

    if (!response.list) {
      return [];
    }

    // 보고서 유형 필터링
    if (reportType) {
      return response.list.filter(
        (item) => item.report_nm.includes(reportType)
      );
    }

    // 재무제표 관련 보고서만 필터링
    const financialReportKeywords = [
      '사업보고서',
      '분기보고서',
      '반기보고서',
      '연결재무제표',
      '재무제표',
    ];

    return response.list.filter((item) =>
      financialReportKeywords.some((keyword) =>
        item.report_nm.includes(keyword)
      )
    );
  }
}

/**
 * DART 클라이언트 싱글톤 인스턴스 생성
 * 환경 변수에서 API 키 자동 로드
 */
let dartClientInstance: DARTClient | null = null;

/**
 * DART 클라이언트 인스턴스 가져오기
 */
export function getDARTClient(apiKey?: string): DARTClient {
  if (!dartClientInstance) {
    dartClientInstance = new DARTClient(apiKey);
  }
  return dartClientInstance;
}

/**
 * DART 클라이언트 인스턴스 초기화 (테스트용)
 */
export function createDARTClient(apiKey: string): DARTClient {
  return new DARTClient(apiKey);
}
