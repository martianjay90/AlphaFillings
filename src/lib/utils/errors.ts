/**
 * 에러 처리 및 로깅 유틸리티
 * 분석 불가 상태 처리 및 안전장치
 */

/**
 * 분석 결과 상태
 */
export type AnalysisStatus = 
  | 'success'           // 분석 성공
  | 'insufficient_data' // 데이터 불충분
  | 'calculation_error' // 계산 오류
  | 'logic_conflict'    // 로직 충돌
  | 'validation_error'  // 검증 오류
  | 'unknown_error';    // 알 수 없는 오류

/**
 * 분석 오류 타입
 */
export class AnalysisError extends Error {
  constructor(
    public readonly status: AnalysisStatus,
    message: string,
    public readonly details?: Record<string, unknown>,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'AnalysisError';
    
    // Error 객체의 stack trace 유지
    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
  }
}

/**
 * 데이터 불충분 오류
 */
export class InsufficientDataError extends AnalysisError {
  constructor(
    message: string,
    public readonly missingFields: string[],
    details?: Record<string, unknown>
  ) {
    super('insufficient_data', message, { ...details, missingFields }, undefined);
    this.name = 'InsufficientDataError';
  }
}

/**
 * 계산 오류
 */
export class CalculationError extends AnalysisError {
  constructor(
    message: string,
    public readonly calculationType: string,
    details?: Record<string, unknown>,
    originalError?: Error
  ) {
    super('calculation_error', message, { ...details, calculationType }, originalError);
    this.name = 'CalculationError';
  }
}

/**
 * 로직 충돌 오류
 */
export class LogicConflictError extends AnalysisError {
  constructor(
    message: string,
    public readonly conflictingRules: string[],
    details?: Record<string, unknown>
  ) {
    super('logic_conflict', message, { ...details, conflictingRules }, undefined);
    this.name = 'LogicConflictError';
  }
}

/**
 * 에러 로거 인터페이스
 */
export interface ErrorLogger {
  log(error: AnalysisError, context?: Record<string, unknown>): void;
  logError(error: Error, context?: Record<string, unknown>): void;
}

/**
 * 콘솔 에러 로거 (기본 구현)
 * 프로덕션에서는 외부 로깅 서비스로 교체 가능
 */
export class ConsoleErrorLogger implements ErrorLogger {
  log(error: AnalysisError, context?: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      status: error.status,
      message: error.message,
      details: error.details,
      context,
      stack: error.stack
    };

    console.error('[Analysis Error]', JSON.stringify(logEntry, null, 2));
  }

  logError(error: Error, context?: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message: error.message,
      context,
      stack: error.stack
    };

    console.error('[Error]', JSON.stringify(logEntry, null, 2));
  }
}

/**
 * 전역 에러 로거 인스턴스
 */
let globalLogger: ErrorLogger = new ConsoleErrorLogger();

/**
 * 에러 로거 설정
 */
export function setErrorLogger(logger: ErrorLogger): void {
  globalLogger = logger;
}

/**
 * 에러 로거 조회
 */
export function getErrorLogger(): ErrorLogger {
  return globalLogger;
}

/**
 * 안전한 분석 실행 래퍼
 * 오류 발생 시 적절한 상태 반환
 */
export async function safeAnalysis<T>(
  analysisFn: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<{
  status: AnalysisStatus;
  data?: T;
  error?: AnalysisError;
}> {
  try {
    const data = await analysisFn();
    return {
      status: 'success',
      data
    };
  } catch (error) {
    let analysisError: AnalysisError;

    if (error instanceof AnalysisError) {
      analysisError = error;
    } else if (error instanceof Error) {
      analysisError = new AnalysisError(
        'unknown_error',
        error.message,
        { originalError: error.name },
        error
      );
    } else {
      analysisError = new AnalysisError(
        'unknown_error',
        'Unknown error occurred',
        { error }
      );
    }

    // 에러 로깅
    globalLogger.log(analysisError, context);

    return {
      status: analysisError.status,
      error: analysisError
    };
  }
}

/**
 * 데이터 검증 헬퍼
 */
export function validateRequiredFields<T extends Record<string, unknown>>(
  data: Partial<T>,
  requiredFields: (keyof T)[]
): void {
  const missingFields: string[] = [];

  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missingFields.push(String(field));
    }
  }

  if (missingFields.length > 0) {
    throw new InsufficientDataError(
      `Required fields are missing: ${missingFields.join(', ')}`,
      missingFields
    );
  }
}

/**
 * 숫자 범위 검증
 */
export function validateNumberRange(
  value: number,
  min: number,
  max: number,
  fieldName: string
): void {
  if (value < min || value > max) {
    throw new AnalysisError(
      'validation_error',
      `${fieldName} must be between ${min} and ${max}, got ${value}`,
      { fieldName, value, min, max }
    );
  }
}
