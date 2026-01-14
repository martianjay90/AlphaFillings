/**
 * Rate Limiter
 * API 호출 속도 제한 관리
 */

/**
 * Rate Limit 설정
 */
export interface RateLimitConfig {
  /** 최대 요청 수 */
  maxRequests: number;
  
  /** 시간 윈도우 (밀리초) */
  windowMs: number;
  
  /** 재시도 대기 시간 (밀리초) */
  retryAfterMs?: number;
}

/**
 * Rate Limit 상태
 */
export interface RateLimitStatus {
  /** 남은 요청 수 */
  remaining: number;
  
  /** 리셋 시간 (타임스탬프) */
  resetAt: number;
  
  /** 제한 초과 여부 */
  isLimited: boolean;
}

/**
 * 큐 항목
 */
interface QueueItem<T> {
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
}

/**
 * Rate Limiter 클래스
 * 큐 기반 순차 처리 지원
 */
export class RateLimiter {
  private config: RateLimitConfig;
  private requests: number[] = [];
  private queue: QueueItem<any>[] = [];
  private processing = false;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * 요청 가능 여부 확인
   */
  canMakeRequest(): boolean {
    this.cleanOldRequests();
    return this.requests.length < this.config.maxRequests;
  }

  /**
   * 요청 기록
   */
  recordRequest(): void {
    this.cleanOldRequests();
    
    if (this.requests.length >= this.config.maxRequests) {
      throw new Error('Rate limit exceeded');
    }
    
    this.requests.push(Date.now());
  }

  /**
   * 오래된 요청 제거
   */
  private cleanOldRequests(): void {
    const now = Date.now();
    this.requests = this.requests.filter(
      (timestamp) => now - timestamp < this.config.windowMs
    );
  }

  /**
   * Rate Limit 상태 조회
   */
  getStatus(): RateLimitStatus {
    this.cleanOldRequests();
    
    const remaining = Math.max(0, this.config.maxRequests - this.requests.length);
    const oldestRequest = this.requests[0];
    const resetAt = oldestRequest
      ? oldestRequest + this.config.windowMs
      : Date.now();
    
    return {
      remaining,
      resetAt,
      isLimited: remaining === 0,
    };
  }

  /**
   * 다음 요청까지 대기 시간 계산
   */
  getWaitTime(): number {
    const status = this.getStatus();
    
    if (!status.isLimited) {
      return 0;
    }
    
    return Math.max(0, status.resetAt - Date.now());
  }

  /**
   * 요청 대기 (Promise)
   */
  async waitForAvailability(): Promise<void> {
    while (!this.canMakeRequest()) {
      const waitTime = this.getWaitTime();
      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * 안전한 요청 실행 (자동 대기)
   */
  async executeWithLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.waitForAvailability();
    this.recordRequest();
    return fn();
  }

  /**
   * 큐에 추가하고 순차 처리
   */
  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ fn, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * 큐 처리 (순차 실행)
   */
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      try {
        // Rate limit 체크 및 대기
        await this.waitForAvailability();
        this.recordRequest();

        // 요청 실행
        const result = await item.fn();
        item.resolve(result);
      } catch (error) {
        item.reject(
          error instanceof Error
            ? error
            : new Error('알 수 없는 오류가 발생했습니다.')
        );
      }
    }

    this.processing = false;
  }

  /**
   * 큐 크기 조회
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * 큐 초기화
   */
  clearQueue(): void {
    this.queue.forEach((item) => {
      item.reject(new Error('큐가 초기화되었습니다.'));
    });
    this.queue = [];
  }
}

/**
 * DART API Rate Limiter (초당 10회 제한)
 */
export const dartRateLimiter = new RateLimiter({
  maxRequests: 10,
  windowMs: 1000, // 1초
  retryAfterMs: 100,
});

/**
 * 일반 API Rate Limiter (분당 60회 제한)
 */
export const generalRateLimiter = new RateLimiter({
  maxRequests: 60,
  windowMs: 60000, // 1분
  retryAfterMs: 1000,
});
