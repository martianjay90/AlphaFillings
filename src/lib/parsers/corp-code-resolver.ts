/**
 * 회사 고유번호(corp_code) 해석기
 * 기업명 또는 종목코드로 corp_code를 찾는 유틸리티
 */

import { getCompanyRegistry } from './company-registry';
import type { CompanySearchResult } from './company-registry';
import { directLookup, fastLookupFromCache } from './direct-lookup';

/**
 * 회사 고유번호 해석 결과
 */
export interface CorpCodeResolution {
  /** 성공 여부 */
  success: boolean;
  
  /** 회사 고유번호 */
  corp_code?: string;
  
  /** 회사 정보 */
  companyInfo?: CompanySearchResult;
  
  /** 에러 메시지 */
  error?: string;
  
  /** 검색 결과 후보 목록 */
  candidates?: CompanySearchResult[];
}

/**
 * 기업명 또는 종목코드로 회사 고유번호 해석 (Direct Lookup 우선)
 */
export async function resolveCorpCode(
  companyNameOrTicker: string,
  onProgress?: (progress: { stage: string; percentage: number; message: string }) => void
): Promise<CorpCodeResolution> {
  try {
    console.log(`[DEBUG] Direct Lookup Mode: ${companyNameOrTicker}`);
    onProgress?.({
      stage: 'direct_lookup',
      percentage: 10,
      message: '기업 고유번호 확인 중...',
    });

    // 1단계: 로컬 캐시에서 빠른 검색 시도
    const cacheResult = await fastLookupFromCache(companyNameOrTicker);
    if (cacheResult?.success) {
      console.log(`[DEBUG] 캐시에서 발견: ${companyNameOrTicker} → ${cacheResult.corp_code}`);
      // corp_code를 찾으면 즉시 30%로 점프
      onProgress?.({
        stage: 'resolved',
        percentage: 30,
        message: '기업 고유번호 확인 완료',
      });
      return {
        success: true,
        corp_code: cacheResult.corp_code,
        companyInfo: cacheResult.companyInfo,
      };
    }

    // 2단계: DART API Direct Lookup (로컬 DB 거치지 않고 직접 호출, 1초 내 완료 목표)
    console.log(`[DEBUG] DART API Direct Fetch 실행: ${companyNameOrTicker}`);
    const directResult = await directLookup(companyNameOrTicker, onProgress);
    
    if (directResult.success) {
      // corp_code를 찾으면 즉시 30%로 점프하고 공시 목록 수집으로 넘어감
      console.log(`전체 리스트 대기 생략 및 개별 기업 직접 조회 성공`);
      onProgress?.({
        stage: 'resolved',
        percentage: 30,
        message: '기업 고유번호 확인 완료',
      });
      return {
        success: true,
        corp_code: directResult.corp_code,
        companyInfo: directResult.companyInfo,
      };
    }

    // 3단계: Fallback - 레지스트리에서 검색 (백그라운드 업데이트를 기다리지 않음)
    console.log(`[DEBUG] Fallback 검색 실행: ${companyNameOrTicker}`);
    const registry = getCompanyRegistry();
    // searchCompany는 이제 백그라운드 업데이트를 기다리지 않음
    const results = await registry.searchCompany(companyNameOrTicker, onProgress);
    
    if (results.length > 0) {
      // corp_code를 찾으면 즉시 30%로 점프
      onProgress?.({
        stage: 'resolved',
        percentage: 30,
        message: '기업 고유번호 확인 완료',
      });
    }
    
    if (results.length === 0) {
      return {
        success: false,
        error: directResult.error || `"${companyNameOrTicker}"에 해당하는 회사를 찾을 수 없습니다.`,
        candidates: [],
      };
    }

    // 가장 우선순위가 높은 결과 사용
    const bestMatch = results[0];
    
    return {
      success: true,
      corp_code: bestMatch.corp_code,
      companyInfo: bestMatch,
      candidates: results.length > 1 ? results.slice(1) : undefined,
    };
  } catch (error) {
    console.error(`[CorpCodeResolver] 오류: ${companyNameOrTicker}`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류',
      candidates: [],
    };
  }
}

/**
 * 회사 고유번호로 회사 정보 조회
 */
export async function getCompanyByCorpCode(
  corpCode: string
): Promise<CompanySearchResult | null> {
  try {
    const registry = getCompanyRegistry();
    const company = await registry.getCompanyByCorpCode(corpCode);
    
    if (!company) {
      return null;
    }

    return {
      ...company,
      matchType: 'exact',
    };
  } catch {
    return null;
  }
}
