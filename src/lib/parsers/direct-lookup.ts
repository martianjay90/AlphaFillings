/**
 * Direct Lookup: 즉시 기업 검색
 * 전체 리스트를 기다리지 않고 DART API에서 직접 검색
 */

import { getDARTClient, type CompanyInfo } from './dart-client';
import { dartRateLimiter } from './dart-client';
import type { CompanySearchResult } from './company-registry';

/**
 * Direct Lookup 결과
 */
export interface DirectLookupResult {
  /** 성공 여부 */
  success: boolean;
  
  /** 회사 고유번호 */
  corp_code?: string;
  
  /** 회사 정보 */
  companyInfo?: CompanySearchResult;
  
  /** 에러 메시지 */
  error?: string;
  
  /** 검색 소요 시간 (ms) */
  duration?: number;
}

/**
 * 타임아웃이 있는 fetch 래퍼 (3초 타임아웃)
 */
async function fetchWithTimeout(
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
      console.error('[DirectLookup] 타임아웃 발생:', {
        url,
        timeoutMs,
        timestamp: new Date().toISOString(),
      });
      throw new Error('일시적 네트워크 오류: DART 서버 응답 지연 (3초 타임아웃)');
    }
    console.error('[DirectLookup] Fetch 오류:', {
      url,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}

/**
 * DART API에서 직접 기업 검색 (1초 내 완료 목표)
 * 로컬 데이터베이스를 거치지 않고 DART API를 직접 호출하여 corp_code 확보
 * 타임아웃: 3초 (무한 대기 방지)
 */
export async function directLookup(
  companyNameOrTicker: string,
  onProgress?: (progress: { stage: string; percentage: number; message: string }) => void
): Promise<DirectLookupResult> {
  const startTime = Date.now();
  console.log(`[DEBUG] Direct Lookup Mode: ${companyNameOrTicker}`);
  
  // 즉시 진행률 15% 업데이트
  onProgress?.({
    stage: 'direct_lookup',
    percentage: 15,
    message: 'DART 서버 연결 시도 중...',
  });
  
  try {
    const client = getDARTClient();
    
    // DART API에서 전체 회사 리스트 가져오기 (로컬 DB 거치지 않고 직접 호출)
    // 전체 리스트 대기 생략 및 개별 기업 직접 조회
    // 타임아웃 3초로 제한하여 무한 대기 방지
    let response;
    try {
      response = await dartRateLimiter.enqueue(async () => {
        return client.getCompanyList();
      });
    } catch (apiError) {
      const errorMessage = apiError instanceof Error ? apiError.message : '알 수 없는 오류';
      console.error('[DirectLookup] DART API 요청 실패:', {
        companyNameOrTicker,
        error: errorMessage,
        stack: apiError instanceof Error ? apiError.stack : undefined,
        timestamp: new Date().toISOString(),
      });
      throw new Error(`DART API 요청 실패: ${errorMessage}`);
    }

    if (!response) {
      const error = new Error('DART API 응답이 없습니다.');
      console.error('[DirectLookup] DART API 응답 없음:', {
        companyNameOrTicker,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    if (response.status !== '000' || !response.list) {
      const error = new Error(`DART API 오류: ${response.message} (상태: ${response.status})`);
      console.error('[DirectLookup] DART API 오류 응답:', {
        companyNameOrTicker,
        status: response.status,
        message: response.message,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }

    const companies = response.list;
    const normalizedQuery = companyNameOrTicker.trim().toLowerCase();
    
    // 즉시 검색 (전체 리스트를 순회하되 첫 매칭에서 반환)
    const results: CompanySearchResult[] = [];

    for (const company of companies) {
      const normalizedName = company.corp_name.toLowerCase();
      const normalizedCode = company.stock_code.toLowerCase();
      
      // 정확한 일치 (종목코드) - 최우선
      if (normalizedCode === normalizedQuery) {
        const result: CompanySearchResult = {
          ...company,
          matchType: 'code',
        };
        const duration = Date.now() - startTime;
        console.log(`전체 리스트 대기 생략 및 개별 기업 직접 조회 성공: ${companyNameOrTicker} → ${company.corp_name} (${duration}ms)`);
        return {
          success: true,
          corp_code: company.corp_code,
          companyInfo: result,
          duration,
        };
      }

      // 정확한 일치 (회사명)
      if (normalizedName === normalizedQuery) {
        results.push({
          ...company,
          matchType: 'exact',
        });
        continue;
      }

      // 부분 일치 (회사명)
      if (normalizedName.includes(normalizedQuery)) {
        results.push({
          ...company,
          matchType: 'partial',
        });
      }
    }

    // 우선순위 정렬: exact > partial
    results.sort((a, b) => {
      const priority: Record<'exact' | 'partial' | 'code', number> = { exact: 2, partial: 1, code: 0 };
      return (priority[b.matchType] || 0) - (priority[a.matchType] || 0);
    });

    if (results.length > 0) {
      const bestMatch = results[0];
      const duration = Date.now() - startTime;
      console.log(`전체 리스트 대기 생략 및 개별 기업 직접 조회 성공: ${companyNameOrTicker} → ${bestMatch.corp_name} (${duration}ms)`);
      return {
        success: true,
        corp_code: bestMatch.corp_code,
        companyInfo: bestMatch,
        duration,
      };
    }

    const duration = Date.now() - startTime;
    console.log(`[DEBUG] Direct Lookup 실패: ${companyNameOrTicker} (${duration}ms)`);
    return {
      success: false,
      error: `"${companyNameOrTicker}"에 해당하는 회사를 찾을 수 없습니다.`,
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    
    // 상세 에러 로깅
    console.error('[DirectLookup] 오류 발생:', {
      companyNameOrTicker,
      error: errorMessage,
      duration,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    
    // 타임아웃 에러인 경우 특별 처리
    if (errorMessage.includes('타임아웃') || errorMessage.includes('응답 지연') || errorMessage.includes('네트워크 오류')) {
      return {
        success: false,
        error: '일시적 네트워크 오류: DART 서버 응답 지연',
        duration,
      };
    }
    
    return {
      success: false,
      error: errorMessage,
      duration,
    };
  }
}

/**
 * 로컬 캐시에서 빠른 검색 (백그라운드 업데이트와 독립적)
 */
export async function fastLookupFromCache(
  companyNameOrTicker: string
): Promise<DirectLookupResult | null> {
  try {
    // 로컬 스토리지에서 검색
    if (typeof window === 'undefined') {
      return null;
    }

    const cached = localStorage.getItem('dart_company_list');
    if (!cached) {
      return null;
    }

    const data = JSON.parse(cached);
    const companies: CompanyInfo[] = data.companies || [];
    
    if (companies.length === 0) {
      return null;
    }

    const normalizedQuery = companyNameOrTicker.trim().toLowerCase();
    const results: CompanySearchResult[] = [];

    for (const company of companies) {
      const normalizedName = company.corp_name.toLowerCase();
      const normalizedCode = company.stock_code.toLowerCase();
      
      if (normalizedCode === normalizedQuery) {
        return {
          success: true,
          corp_code: company.corp_code,
          companyInfo: {
            ...company,
            matchType: 'code',
          },
          duration: 0,
        };
      }

      if (normalizedName === normalizedQuery) {
        results.push({
          ...company,
          matchType: 'exact',
        });
      } else if (normalizedName.includes(normalizedQuery)) {
        results.push({
          ...company,
          matchType: 'partial',
        });
      }
    }

    if (results.length > 0) {
      results.sort((a, b) => {
        const priority: Record<'exact' | 'partial' | 'code', number> = { exact: 2, partial: 1, code: 0 };
        return (priority[b.matchType] || 0) - (priority[a.matchType] || 0);
      });

      return {
        success: true,
        corp_code: results[0].corp_code,
        companyInfo: results[0],
        duration: 0,
      };
    }

    return null;
  } catch {
    return null;
  }
}
