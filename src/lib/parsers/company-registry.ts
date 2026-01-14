/**
 * 공시대상회사 고유번호 레지스트리
 * DART API에서 회사 리스트를 다운로드하고 캐시 관리
 */

import { getDARTClient, type CompanyInfo, type CompanyListResponse, dartRateLimiter } from './dart-client';
import { supabase } from '@/lib/supabase/client';

/**
 * 회사 검색 결과
 */
export interface CompanySearchResult {
  /** 회사 고유번호 */
  corp_code: string;
  
  /** 종목코드 */
  stock_code: string;
  
  /** 회사명 */
  corp_name: string;
  
  /** 매칭 타입 */
  matchType: 'exact' | 'partial' | 'code';
}

/**
 * 초기화 진행률 콜백
 */
export type InitializationProgressCallback = (progress: {
  stage: 'checking' | 'downloading' | 'saving' | 'complete';
  percentage: number;
  message: string;
}) => void;

/**
 * 회사 레지스트리 관리자
 */
export class CompanyRegistry {
  private static readonly CACHE_KEY = 'dart_company_list';
  private static readonly UPDATE_INTERVAL_DAYS = 7; // 주 1회
  private initializationPromise: Promise<CompanyInfo[]> | null = null;
  private isInitialized = false;

  /**
   * DART API에서 전체 회사 리스트 다운로드
   */
  async downloadCompanyList(): Promise<CompanyInfo[]> {
    const client = getDARTClient();
    
    try {
      // DART API의 company.json 엔드포인트 호출 (큐 기반 순차 처리)
      const response = await dartRateLimiter.enqueue(() =>
        client.getCompanyList()
      );

      if (response.status !== '000' || !response.list) {
        throw new Error(`DART API 오류: ${response.message} (상태: ${response.status})`);
      }

      return response.list;
    } catch (error) {
      throw new Error(
        `회사 리스트 다운로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      );
    }
  }

  /**
   * 로컬 스토리지에 회사 리스트 저장 (Fallback)
   */
  private saveToLocalStorage(companies: CompanyInfo[]): void {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.setItem(
        CompanyRegistry.CACHE_KEY,
        JSON.stringify({
          companies,
          lastUpdated: new Date().toISOString(),
        })
      );
    } catch (error) {
      console.warn('로컬 스토리지 저장 실패:', error);
    }
  }

  /**
   * 로컬 스토리지에서 회사 리스트 로드 (Fallback)
   */
  private loadFromLocalStorage(): CompanyInfo[] | null {
    if (typeof window === 'undefined') return null;
    
    try {
      const cached = localStorage.getItem(CompanyRegistry.CACHE_KEY);
      if (!cached) return null;
      
      const data = JSON.parse(cached);
      return data.companies || null;
    } catch {
      return null;
    }
  }

  /**
   * Supabase에 회사 리스트 저장
   */
  async saveToSupabase(companies: CompanyInfo[]): Promise<void> {
    // Supabase가 없으면 로컬 스토리지에 저장
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('[CompanyRegistry] Supabase 환경 변수가 없어 로컬 스토리지에 저장합니다.');
      this.saveToLocalStorage(companies);
      return;
    }
    
    // Supabase 클라이언트가 제대로 초기화되었는지 확인
    if (!supabase) {
      console.warn('[CompanyRegistry] Supabase 클라이언트가 초기화되지 않아 로컬 스토리지에 저장합니다.');
      this.saveToLocalStorage(companies);
      return;
    }

    try {
      // 기존 데이터 삭제 (전체 교체)
      const { error: deleteError } = await supabase
        .from('dart_companies')
        .delete()
        .neq('corp_code', ''); // 모든 레코드 삭제

      if (deleteError) {
        console.warn('기존 데이터 삭제 실패:', deleteError);
      }

      // 새 데이터 삽입 (배치 처리)
      const batchSize = 1000;
      for (let i = 0; i < companies.length; i += batchSize) {
        const batch = companies.slice(i, i + batchSize);
        
        const { error: insertError } = await supabase
          .from('dart_companies')
          .insert(batch);

        if (insertError) {
          throw new Error(`데이터 삽입 실패: ${insertError.message}`);
        }
      }

      // 마지막 업데이트 시간 저장 (환경변수 체크 및 테이블 존재 여부 확인)
      const ENABLE_METADATA = process.env.NEXT_PUBLIC_ENABLE_COMPANYLIST_METADATA === 'true';
      if (ENABLE_METADATA && CompanyRegistry.metadataTableExists !== false && CompanyRegistry.metadataAvailable !== false) {
        try {
          const { error: metadataError } = await supabase
            .from('dart_company_list_metadata')
            .upsert({
              id: 'last_update',
              last_updated: new Date().toISOString(),
              total_companies: companies.length,
            }, {
              onConflict: 'id' // id가 primary key이므로 onConflict 지정
            });

          if (metadataError) {
            // 404/401/403 에러는 조용히 처리
            const errorCode = (metadataError as any)?.code || (metadataError as any)?.status;
            const isTableMissing = 
              errorCode === '42P01' ||
              metadataError.message?.includes('does not exist') ||
              (metadataError as any)?.status === 404 ||
              errorCode === 404;

            if (isTableMissing) {
              CompanyRegistry.metadataTableExists = false;
              CompanyRegistry.metadataAvailable = false;
              // 테이블이 없으면 메타데이터 저장을 스킵하고 계속 진행 (회사 리스트 저장은 이미 완료)
              // 로그 출력 안 함 (조용히 처리)
            } else {
              // 그 외 에러는 기능 비활성화만 수행 (로그 출력 안 함)
              CompanyRegistry.metadataTableExists = false;
              CompanyRegistry.metadataAvailable = false;
            }
          } else {
            // 성공 시 테이블 존재 플래그 및 기능 활성화 플래그 설정
            CompanyRegistry.metadataTableExists = true;
            CompanyRegistry.metadataAvailable = true;
          }
        } catch (metadataException) {
          // 예외 발생 시 기능 비활성화 및 조용히 처리 (로그 출력 안 함)
          CompanyRegistry.metadataTableExists = false;
          CompanyRegistry.metadataAvailable = false;
        }
      }
    } catch (error) {
      throw new Error(
        `Supabase 저장 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      );
    }
  }

  /**
   * Supabase에서 회사 리스트 로드
   */
  async loadFromSupabase(): Promise<CompanyInfo[]> {
    // Supabase가 없으면 로컬 스토리지에서 로드
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabase || !supabaseUrl) {
      const localData = this.loadFromLocalStorage();
      if (localData) {
        return localData;
      }
      throw new Error('Supabase가 설정되지 않았고 로컬 캐시도 없습니다.');
    }

    try {
      const { data, error } = await supabase
        .from('dart_companies')
        .select('*')
        .order('corp_name');

      if (error) {
        // Supabase 로드 실패 시 로컬 스토리지 fallback
        const localData = this.loadFromLocalStorage();
        if (localData) {
          console.warn('Supabase 로드 실패, 로컬 캐시 사용:', error);
          return localData;
        }
        throw new Error(`데이터 로드 실패: ${error.message}`);
      }

      return (data || []) as CompanyInfo[];
    } catch (error) {
      // 에러 발생 시 로컬 스토리지 fallback
      const localData = this.loadFromLocalStorage();
      if (localData) {
        console.warn('Supabase 로드 실패, 로컬 캐시 사용:', error);
        return localData;
      }
      throw new Error(
        `Supabase 로드 실패: ${error instanceof Error ? error.message : '알 수 없는 오류'}`
      );
    }
  }

  // 테이블 존재 여부 및 에러 반복 방지 플래그 (정적 변수로 관리)
  private static metadataTableExists: boolean | null = null; // null = 확인 안 됨, true = 존재, false = 없음
  private static lastMetadataErrorTime: number = 0; // 마지막 에러 로그 시간 (디바운스용)
  private static readonly ERROR_LOG_INTERVAL = 60000; // 1분에 1회만 로그
  private static metadataAvailable: boolean = false; // 기능 활성화 여부 (옵션 OFF 또는 테이블 없음 시 false)

  /**
   * 마지막 업데이트 시간 확인
   * 
   * 기능 활성화를 위해서는:
   * 1. 환경변수 설정: NEXT_PUBLIC_ENABLE_COMPANYLIST_METADATA=true
   * 2. Supabase 테이블 생성 (아래 SQL 참조)
   * 
   * -- 테이블 생성 SQL (Supabase SQL Editor에서 실행)
   * create table if not exists public.dart_company_list_metadata (
   *   id text primary key,
   *   last_updated timestamptz not null default now()
   * );
   * insert into public.dart_company_list_metadata (id, last_updated)
   * values ('last_update', now())
   * on conflict (id) do nothing;
   * 
   * 404/401/403 에러는 조용히 처리하여 백그라운드 기능 실패가 분석 파이프라인에 영향을 주지 않도록 함
   */
  async getLastUpdateTime(): Promise<Date | null> {
    // 환경변수 체크: 기본값 false (기능 비활성화)
    const ENABLE = process.env.NEXT_PUBLIC_ENABLE_COMPANYLIST_METADATA === 'true';
    if (!ENABLE) {
      // 기능이 비활성화되어 있으면 즉시 반환 (로그 없음, 요청 없음)
      return null;
    }

    // 기능이 활성화되어 있지만 이미 테이블이 없다고 확인된 경우 조기 반환
    if (CompanyRegistry.metadataAvailable === false || CompanyRegistry.metadataTableExists === false) {
      return null;
    }

    // Supabase에서 확인
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabase && supabaseUrl) {
      try {
        // 쿼리 문자열 버그 방지: 명시적으로 id 값 사용 (encodeURIComponent는 Supabase 클라이언트가 자동 처리)
        const { data, error } = await supabase
          .from('dart_company_list_metadata')
          .select('last_updated')
          .eq('id', 'last_update')
          .maybeSingle(); // .single() 대신 .maybeSingle() 사용 (row가 없어도 에러가 아닌 null 반환)

        if (error) {
          // 404 (테이블 없음/row 없음) / 401 (인증 실패) / 403 (권한 없음) 조용히 처리
          const errorCode = (error as any)?.code || (error as any)?.status || (error as any)?.statusCode;
          const isTableMissing = 
            errorCode === 'PGRST116' || // PostgREST: row not found
            errorCode === '42P01' || // PostgreSQL: table does not exist
            error.message?.includes('does not exist') ||
            error.message?.includes('not found') ||
            (error as any)?.status === 404 ||
            errorCode === 404;

          const isAuthError = 
            errorCode === 401 ||
            errorCode === 403 ||
            (error as any)?.status === 401 ||
            (error as any)?.status === 403;

          if (isTableMissing || isAuthError) {
            // 테이블이 없거나 권한 문제인 경우 플래그 설정 (향후 요청 방지)
            CompanyRegistry.metadataTableExists = false;
            CompanyRegistry.metadataAvailable = false; // 기능 비활성화
            
            // 최초 1회만 경고 (개발 모드에서만)
            if (CompanyRegistry.lastMetadataErrorTime === 0 && process.env.NODE_ENV !== 'production') {
              CompanyRegistry.lastMetadataErrorTime = Date.now();
              console.warn('[CompanyRegistry] dart_company_list_metadata 테이블 접근 불가 (테이블 없음/권한 없음). 기능을 비활성화합니다. 환경변수 NEXT_PUBLIC_ENABLE_COMPANYLIST_METADATA=true 및 테이블 설정이 필요합니다.');
            }
            return null; // 조용히 null 반환 (이후 재요청 방지)
          }

          // 그 외 에러는 조용히 처리 (로그 출력 안 함, 기능 비활성화)
          CompanyRegistry.metadataTableExists = false;
          CompanyRegistry.metadataAvailable = false;
          return null;
        }

        if (data && data.last_updated) {
          // 성공 시 테이블 존재 플래그 및 기능 활성화 플래그 설정
          CompanyRegistry.metadataTableExists = true;
          CompanyRegistry.metadataAvailable = true;
          return new Date(data.last_updated);
        }

        // 데이터가 없는 경우 (정상적인 경우)
        return null;
      } catch (error) {
        // 예외 발생 시 기능 비활성화 및 조용히 처리
        CompanyRegistry.metadataTableExists = false;
        CompanyRegistry.metadataAvailable = false;
        
        // 최초 1회만 경고 (개발 모드에서만)
        if (CompanyRegistry.lastMetadataErrorTime === 0 && process.env.NODE_ENV !== 'production') {
          CompanyRegistry.lastMetadataErrorTime = Date.now();
          console.warn('[CompanyRegistry] 마지막 업데이트 시간 조회 중 예외 발생. 기능을 비활성화합니다:', error instanceof Error ? error.message : '알 수 없는 오류');
        }
        // Supabase 실패 시 로컬 스토리지 확인으로 넘어감
      }
    }

    // 로컬 스토리지에서 확인 (Fallback)
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem(CompanyRegistry.CACHE_KEY);
        if (cached) {
          const data = JSON.parse(cached);
          if (data.lastUpdated) {
            return new Date(data.lastUpdated);
          }
        }
      } catch {
        // 무시
      }
    }

    return null;
  }

  /**
   * 업데이트 필요 여부 확인
   */
  async needsUpdate(): Promise<boolean> {
    const lastUpdate = await this.getLastUpdateTime();
    
    if (!lastUpdate) {
      return true; // 데이터가 없으면 업데이트 필요
    }

    const daysSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);
    return daysSinceUpdate >= CompanyRegistry.UPDATE_INTERVAL_DAYS;
  }

  /**
   * 회사 리스트 초기화 및 업데이트 (진행률 콜백 지원)
   * 분석 프로세스에 영향을 주지 않도록 백그라운드에서 실행
   */
  async initializeOrUpdate(
    onProgress?: InitializationProgressCallback
  ): Promise<CompanyInfo[]> {
    // 이미 초기화 중이면 기존 Promise 반환
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // 이미 초기화되었고 업데이트가 필요 없으면 캐시에서 로드
    if (this.isInitialized) {
      const needsUpdate = await this.needsUpdate();
      if (!needsUpdate) {
        onProgress?.({
          stage: 'complete',
          percentage: 100,
          message: '캐시에서 회사 리스트를 로드했습니다.',
        });
        return await this.loadFromSupabase();
      }
    }

    // 초기화 시작 (백그라운드에서 실행, 분석 프로세스 차단하지 않음)
    this.initializationPromise = this._doInitializeOrUpdate(onProgress);
    
    try {
      const result = await this.initializationPromise;
      this.isInitialized = true;
      return result;
    } finally {
      this.initializationPromise = null;
    }
  }

  /**
   * 실제 초기화 로직 (내부 메서드)
   */
  private async _doInitializeOrUpdate(
    onProgress?: InitializationProgressCallback
  ): Promise<CompanyInfo[]> {
    onProgress?.({
      stage: 'checking',
      percentage: 10,
      message: '업데이트 필요 여부 확인 중...',
    });

    const needsUpdate = await this.needsUpdate();
    
    if (!needsUpdate) {
      onProgress?.({
        stage: 'complete',
        percentage: 100,
        message: '캐시에서 회사 리스트를 로드했습니다.',
      });
      return await this.loadFromSupabase();
    }

    onProgress?.({
      stage: 'downloading',
      percentage: 30,
      message: 'DART API에서 회사 리스트 다운로드 중...',
    });

    // DART API에서 다운로드
    const companies = await this.downloadCompanyList();
    
    onProgress?.({
      stage: 'saving',
      percentage: 70,
      message: `회사 리스트 저장 중... (${companies.length}개)`,
    });
    
    // Supabase에 저장
    await this.saveToSupabase(companies);
    
    onProgress?.({
      stage: 'complete',
      percentage: 100,
      message: `회사 리스트 초기화 완료 (${companies.length}개)`,
    });
    
    return companies;
  }

  /**
   * 기업명 또는 종목코드로 회사 검색
   * 백그라운드 업데이트를 기다리지 않고 즉시 검색
   * 분석 프로세스에 영향을 주지 않도록 보장
   */
  async searchCompany(
    query: string,
    onProgress?: InitializationProgressCallback
  ): Promise<CompanySearchResult[]> {
    // 백그라운드 업데이트를 기다리지 않고 즉시 캐시에서 검색
    let companies: CompanyInfo[] = [];
    
    try {
      // 캐시에서 즉시 로드 시도 (업데이트 기다리지 않음)
      companies = await this.loadFromSupabase();
    } catch {
      // 캐시가 없으면 빈 배열로 시작 (백그라운드 업데이트는 별도로 진행)
      companies = [];
    }
    
    // 백그라운드 업데이트는 별도로 시작 (분석에 영향 없음, await 하지 않음)
    if (!this.initializationPromise && !this.isInitialized) {
      // 백그라운드에서 업데이트 시작 (분석 프로세스 차단하지 않음)
      this.initializeOrUpdate().catch((error) => {
        console.warn('[CompanyRegistry] 백그라운드 업데이트 실패:', error);
      });
    }
    
    const normalizedQuery = query.trim().toLowerCase();
    const results: CompanySearchResult[] = [];

    for (const company of companies) {
      const normalizedName = company.corp_name.toLowerCase();
      const normalizedCode = company.stock_code.toLowerCase();
      
      // 정확한 일치 (종목코드)
      if (normalizedCode === normalizedQuery) {
        results.push({
          ...company,
          matchType: 'code',
        });
        continue;
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

    // 우선순위 정렬: code > exact > partial
    results.sort((a, b) => {
      const priority = { code: 3, exact: 2, partial: 1 };
      return priority[b.matchType] - priority[a.matchType];
    });

    return results.slice(0, 10); // 최대 10개 반환
  }

  /**
   * 회사 고유번호로 회사 정보 조회
   * 백그라운드 업데이트를 기다리지 않고 즉시 검색
   * 분석 프로세스에 영향을 주지 않도록 보장
   */
  async getCompanyByCorpCode(
    corpCode: string,
    onProgress?: InitializationProgressCallback
  ): Promise<CompanyInfo | null> {
    // 백그라운드 업데이트를 기다리지 않고 즉시 캐시에서 검색
    let companies: CompanyInfo[] = [];
    
    try {
      // 캐시에서 즉시 로드 시도 (업데이트 기다리지 않음)
      companies = await this.loadFromSupabase();
    } catch {
      // 캐시가 없으면 빈 배열로 시작
      companies = [];
    }
    
    // 백그라운드 업데이트는 별도로 시작 (분석에 영향 없음, await 하지 않음)
    if (!this.initializationPromise && !this.isInitialized) {
      // 백그라운드에서 업데이트 시작 (분석 프로세스 차단하지 않음)
      this.initializeOrUpdate().catch((error) => {
        console.warn('[CompanyRegistry] 백그라운드 업데이트 실패:', error);
      });
    }
    
    return companies.find(c => c.corp_code === corpCode) || null;
  }
}

/**
 * 회사 레지스트리 싱글톤 인스턴스
 */
let registryInstance: CompanyRegistry | null = null;

/**
 * 회사 레지스트리 인스턴스 가져오기
 */
export function getCompanyRegistry(): CompanyRegistry {
  if (!registryInstance) {
    registryInstance = new CompanyRegistry();
  }
  return registryInstance;
}
