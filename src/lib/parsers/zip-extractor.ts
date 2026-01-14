/**
 * ZIP 파일 추출 유틸리티
 * XBRL 파일이 ZIP으로 압축된 경우 메모리에서 즉시 압축 해제
 */

import JSZip from 'jszip'
import { dlog } from '@/lib/utils/debug'

/**
 * ZIP 파일에서 인스턴스 XBRL 파일 추출
 * 파일명 기반 1차 필터 + 내용 기반 2차 판별로 정확한 인스턴스 파일 선택
 */

interface CandidateFile {
  name: string
  entry: JSZip.JSZipObject
  nameScore: number // 파일명 기반 점수
  contentScore?: number // 내용 기반 점수 (상위 후보만 계산)
  contentLength?: number // 실제 바이트 길이
  metrics?: {
    rootType: 'xbrl' | 'linkbase' | 'unknown'
    contextCount: number
    unitCount: number
    factLikeCount: number // contextRef 속성 출현 횟수
    prefixes: string[] // 발견된 네임스페이스 prefix 샘플
  }
}

/**
 * ZIP 파일에서 인스턴스 XBRL 파일 추출
 */
export async function extractXBRLFromZip(file: File): Promise<File | null> {
  try {
    // 메모리에서 ZIP 파일 즉시 압축 해제
    const arrayBuffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)

    // ZIP 내부에서 XBRL/XML 파일 찾기
    const candidates: CandidateFile[] = []
    
    zip.forEach((relativePath, zipEntry) => {
      // 디렉토리는 제외
      if (zipEntry.dir) return
      
      // .xml 또는 .xbrl 확장자만 선택
      const lowerName = relativePath.toLowerCase()
      if (lowerName.endsWith('.xml') || lowerName.endsWith('.xbrl')) {
        // 파일명 기반 점수 계산
        let nameScore = 0
        
        // 감점: 라벨/링크베이스/스키마 파일 제외
        const excludeKeywords = ['label', 'lab', 'presentation', 'pre', 'calculation', 'cal', 
                                'definition', 'def', 'linkbase', 'schema', 'role', 'arc', 'xsd']
        const hasExcludeKeyword = excludeKeywords.some(keyword => lowerName.includes(keyword))
        if (hasExcludeKeyword) {
          nameScore -= 1000 // 강하게 제외
        }
        
        // 가점: 확장자 .xbrl
        if (lowerName.endsWith('.xbrl')) {
          nameScore += 50
        }
        
        // 가점: 파일명에 report/fin/fn/ifrs/gaap 포함
        const includeKeywords = ['report', 'fin', 'fn', 'ifrs', 'gaap', 'instance', 'inst']
        const includeCount = includeKeywords.filter(keyword => lowerName.includes(keyword)).length
        nameScore += includeCount * 10
        
        candidates.push({
          name: relativePath,
          entry: zipEntry,
          nameScore,
        })
      }
    })

    if (candidates.length === 0) {
      console.warn('[ZIP Extractor] ZIP 내부에 XBRL/XML 파일을 찾을 수 없습니다.')
      return null
    }

    // 후보 파일 리스트 로깅 (최대 30개)
    const candidateNames = candidates.map(c => c.name).slice(0, 30)
    dlog(`[ZIP Extractor] ZIP 내 후보 파일 리스트 (${candidates.length}개, 최대 30개 표시):`, candidateNames)

    // 파일명 점수로 정렬 (상위 후보만 내용 검사)
    candidates.sort((a, b) => b.nameScore - a.nameScore)
    
    // 상위 후보만 내용 검사 (성능 고려: 최대 5개)
    const topCandidates = candidates.slice(0, 5)
    
    for (const candidate of topCandidates) {
      try {
        // 내용 읽기
        const content = await candidate.entry.async('string')
        const contentBytes = await candidate.entry.async('uint8array')
        candidate.contentLength = contentBytes.length
        
        // 내용 기반 인스턴스 스코어 계산
        let contentScore = 0
        const metrics: CandidateFile['metrics'] = {
          rootType: 'unknown',
          contextCount: 0,
          unitCount: 0,
          factLikeCount: 0,
          prefixes: [],
        }
        
        // 루트 요소 확인
        const rootMatch = content.match(/<(\w+:?)(xbrl|linkbase)/i)
        if (rootMatch) {
          const rootTag = rootMatch[2].toLowerCase()
          if (rootTag === 'xbrl') {
            metrics.rootType = 'xbrl'
            contentScore += 1000 // 큰 가점
          } else if (rootTag === 'linkbase') {
            metrics.rootType = 'linkbase'
            contentScore -= 1000 // 큰 감점
          }
        }
        
        // context 요소 개수 (네임스페이스 무관)
        const contextMatches = content.match(/<(\w+:)?context[>\s]/gi)
        if (contextMatches) {
          metrics.contextCount = contextMatches.length
          contentScore += metrics.contextCount * 10
        }
        
        // unit 요소 개수 (네임스페이스 무관)
        const unitMatches = content.match(/<(\w+:)?unit[>\s]/gi)
        if (unitMatches) {
          metrics.unitCount = unitMatches.length
          contentScore += metrics.unitCount * 5
        }
        
        // contextRef 속성 출현 횟수 (팩트 수 proxy)
        const contextRefMatches = content.match(/contextRef\s*=\s*["'][^"']+["']/gi)
        if (contextRefMatches) {
          metrics.factLikeCount = contextRefMatches.length
          contentScore += metrics.factLikeCount * 2
        }
        
        // 네임스페이스 prefix 샘플 추출
        const prefixMatches = content.match(/(\w+):\w+\s*[>=]/g)
        if (prefixMatches) {
          const prefixSet = new Set<string>()
          for (const match of prefixMatches.slice(0, 20)) { // 최대 20개 샘플
            const prefix = match.split(':')[0]
            if (prefix && prefix.length < 20) { // 합리적인 길이
              prefixSet.add(prefix)
            }
          }
          metrics.prefixes = Array.from(prefixSet).slice(0, 10) // 최대 10개
          
          // ifrs-full, us-gaap 등 재무제표 관련 prefix 발견 시 가점
          const financialPrefixes = ['ifrs', 'gaap', 'dart', 'kasb']
          const hasFinancialPrefix = metrics.prefixes.some(p => 
            financialPrefixes.some(fp => p.toLowerCase().includes(fp))
          )
          if (hasFinancialPrefix) {
            contentScore += 50
          }
        }
        
        candidate.contentScore = contentScore
        candidate.metrics = metrics
      } catch (error) {
        console.warn(`[ZIP Extractor] 후보 파일 ${candidate.name} 내용 검사 실패:`, error)
        // 내용 검사 실패는 점수 0으로 유지
      }
    }
    
    // 최종 선택: contentScore 우선, 동점이면 nameScore, 그것도 동점이면 contentLength
    candidates.sort((a, b) => {
      const scoreA = (a.contentScore ?? -Infinity) + a.nameScore
      const scoreB = (b.contentScore ?? -Infinity) + b.nameScore
      
      if (Math.abs(scoreA - scoreB) > 10) {
        return scoreB - scoreA // 점수 차이가 크면 점수 우선
      }
      
      // 점수가 비슷하면 파일 크기 우선
      const sizeA = a.contentLength ?? 0
      const sizeB = b.contentLength ?? 0
      return sizeB - sizeA
    })
    
    const selectedFile = candidates[0]
    
    // 선택 결과 로깅
    dlog(`[ZIP Extractor] === 인스턴스 파일 선택 결과 ===`)
    dlog(`[ZIP Extractor] 최종 선택 파일명: ${selectedFile.name}`)
    if (selectedFile.metrics) {
      dlog(`[ZIP Extractor] 인스턴스 판별 메트릭:`)
      dlog(`[ZIP Extractor]   - rootType: ${selectedFile.metrics.rootType}`)
      dlog(`[ZIP Extractor]   - contextCount: ${selectedFile.metrics.contextCount}`)
      dlog(`[ZIP Extractor]   - unitCount: ${selectedFile.metrics.unitCount}`)
      dlog(`[ZIP Extractor]   - factLikeCount: ${selectedFile.metrics.factLikeCount}`)
      if (selectedFile.metrics.prefixes.length > 0) {
        dlog(`[ZIP Extractor]   - 발견된 prefix 샘플: ${selectedFile.metrics.prefixes.join(', ')}`)
      }
    }
    dlog(`[ZIP Extractor] 파일명 점수: ${selectedFile.nameScore}, 내용 점수: ${selectedFile.contentScore ?? 'N/A'}`)
    
    // 인스턴스 판별 실패 체크
    if (selectedFile.metrics) {
      const { rootType, contextCount, unitCount, factLikeCount } = selectedFile.metrics
      if (rootType === 'linkbase' || (rootType !== 'xbrl' && contextCount === 0 && unitCount === 0 && factLikeCount === 0)) {
        const candidateNamesList = candidates.slice(0, 10).map(c => c.name).join(', ')
        throw new Error(
          `올바른 인스턴스 XBRL을 찾지 못했습니다. ` +
          `선택된 파일: ${selectedFile.name}, ` +
          `rootType: ${rootType}, contextCount: ${contextCount}, ` +
          `unitCount: ${unitCount}, factLikeCount: ${factLikeCount}. ` +
          `ZIP 내 후보 파일 (일부): ${candidateNamesList}`
        )
      }
    }

    // 인스턴스 파일 추출
    const content = await selectedFile.entry.async('string')
    
    // Blob을 File 객체로 변환
    const blob = new Blob([content], { type: 'application/xml' })
    const extractedFile = new File([blob], selectedFile.name, { 
      type: 'application/xml',
      lastModified: Date.now(),
    })

    dlog(`[ZIP Extractor] 파일 타입을 xbrl로 강제 지정: ${selectedFile.name}`)
    
    return extractedFile
  } catch (error) {
    console.error('[ZIP Extractor] ZIP 파일 추출 실패:', error)
    if (error instanceof Error) {
      console.error('[ZIP Extractor] 에러 상세:', error.message, error.stack)
    }
    return null
  }
}
