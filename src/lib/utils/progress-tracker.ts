/**
 * 진행률 추적 및 타임아웃 관리 유틸리티
 */

export type PipelineStage =
  | 'FILES_READING'        // 파일 읽는 중 (0~10%)
  | 'ZIP_EXTRACT'          // ZIP 압축 해제 (10~25%)
  | 'XBRL_PARSE'           // XBRL 인스턴스 선택 + XBRL 파싱 (25~55%)
  | 'PDF_PARSE'            // PDF 텍스트/근거 파싱 (55~80%)
  | 'BUILD_ANALYSIS'       // 결합(표준화/단위/기간 선택/팩트 스코어링) (80~95%)
  | 'DONE'                 // Step 결과 생성 + 화면 전환 (95~100%)
  | 'ERROR'                // 오류

export interface StageProgress {
  stage: PipelineStage
  percentage: number
  message: string
  startTime: number
  elapsedMs?: number
  lastFile?: string
}

export interface StageConfig {
  minPercentage: number
  maxPercentage: number
  timeoutMs: number
  label: string
}

export const STAGE_CONFIGS: Record<PipelineStage, StageConfig> = {
  // 파싱 단계 (0~30%)
  FILES_READING: {
    minPercentage: 0,
    maxPercentage: 5,
    timeoutMs: 60000, // 60초
    label: '파일 읽는 중',
  },
  ZIP_EXTRACT: {
    minPercentage: 5,
    maxPercentage: 10,
    timeoutMs: 120000, // 120초
    label: '압축 파일 해제 중',
  },
  XBRL_PARSE: {
    minPercentage: 10,
    maxPercentage: 20,
    timeoutMs: 180000, // 180초
    label: '재무 데이터 추출 중',
  },
  PDF_PARSE: {
    minPercentage: 20,
    maxPercentage: 30,
    timeoutMs: 120000, // 120초
    label: '보고서 텍스트 파싱 중',
  },
  // 분석 단계 (30~90%)
  BUILD_ANALYSIS: {
    minPercentage: 30,
    maxPercentage: 90,
    timeoutMs: 180000, // 180초
    label: '데이터 결합 및 분석 중',
  },
  // 렌더 준비/요약 (90~100%)
  DONE: {
    minPercentage: 90,
    maxPercentage: 100,
    timeoutMs: 0,
    label: '리포트 생성 완료',
  },
  ERROR: {
    minPercentage: 0,
    maxPercentage: 0,
    timeoutMs: 0,
    label: '오류',
  },
}

/**
 * UI 업데이트를 위한 yield 함수
 */
export function tick(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

/**
 * 단계별 타임아웃이 있는 Promise 래퍼
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  stage: PipelineStage
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      const elapsedMs = Date.now()
      reject(new Error(
        `[${stage}] 타임아웃: ${timeoutMs}ms 동안 응답이 없습니다. 단계: ${STAGE_CONFIGS[stage].label}`
      ))
    }, timeoutMs)
  })

  return Promise.race([promise, timeoutPromise])
}

/**
 * 진행률 업데이트 헬퍼
 */
export function calculateStageProgress(
  stage: PipelineStage,
  subProgress: number = 0 // 0-1 사이의 값 (해당 단계 내 진행률)
): number {
  const config = STAGE_CONFIGS[stage]
  const range = config.maxPercentage - config.minPercentage
  return config.minPercentage + range * subProgress
}

/**
 * 단계 전환 로깅
 */
export function logStageTransition(
  fromStage: PipelineStage | null,
  toStage: PipelineStage,
  startTime: number
): void {
  if (fromStage) {
    const elapsed = Date.now() - startTime
    console.timeEnd(`[${fromStage}] ${STAGE_CONFIGS[fromStage].label}`)
    console.log(`[Progress] ${fromStage} → ${toStage} (소요: ${elapsed}ms)`)
  }
  
  console.time(`[${toStage}] ${STAGE_CONFIGS[toStage].label}`)
  console.log(`[Progress] 단계 전환: ${toStage} - ${STAGE_CONFIGS[toStage].label}`)
}
