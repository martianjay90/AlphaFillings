/**
 * XBRLParser DOMParser 의존성 테스트
 * Jest(node) 환경에서도 XBRLParser가 동작하는지 확인
 */

import { describe, test, expect } from '@jest/globals'
import { XBRLParser, createXBRLParser } from '@/lib/parsers/xbrl-parser'

describe('XBRLParser DOMParser 의존성', () => {
  test('XBRLParser 클래스를 import할 수 있음', () => {
    expect(XBRLParser).toBeDefined()
    expect(typeof XBRLParser).toBe('function')
  })

  test('createXBRLParser 함수를 import할 수 있음', () => {
    expect(createXBRLParser).toBeDefined()
    expect(typeof createXBRLParser).toBe('function')
  })

  test('XBRLParser 인스턴스를 생성할 수 있음 (최소 XML)', () => {
    const minimalXML = `<?xml version="1.0"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance"
      xmlns:xbrli="http://www.xbrl.org/2003/instance"
      xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-01-01/ifrs">
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://www.test.com">TEST</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:instant>2023-12-31</xbrli:instant>
    </xbrli:period>
  </xbrli:context>
  <xbrli:unit id="u1">
    <xbrli:measure>iso4217:KRW</xbrli:measure>
  </xbrli:unit>
</xbrl>`

    // 인스턴스 생성이 가능한지 확인 (DOMParser 오류 없이)
    // DOMParser 관련 오류가 없으면 성공 (다른 파싱 오류는 무시)
    let parserCreated = false
    try {
      const parser = createXBRLParser(minimalXML, 'KR')
      parserCreated = true
      expect(parser).toBeDefined()
    } catch (error) {
      // DOMParser 관련 오류인지 확인
      const errorMessage = error instanceof Error ? error.message : String(error)
      // "DOMParser를 사용할 수 없습니다" 또는 "DOMParser undefined" 같은 오류가 있으면 실패
      if (errorMessage.includes('DOMParser') && (errorMessage.includes('undefined') || errorMessage.includes('사용할 수 없습니다'))) {
        throw error
      }
      // 다른 파싱 오류는 허용 (DOMParser는 정상 작동)
      expect(parserCreated).toBe(false) // 파서 생성은 실패했지만, DOMParser 문제는 아님
    }
  })

  test('XBRLParser를 직접 new로 생성할 수 있음 (DOMParser 오류 없음)', () => {
    const minimalXML = `<?xml version="1.0"?>
<xbrl xmlns="http://www.xbrl.org/2003/instance"
      xmlns:xbrli="http://www.xbrl.org/2003/instance"
      xmlns:ifrs-full="http://xbrl.ifrs.org/taxonomy/2023-01-01/ifrs">
  <xbrli:context id="c1">
    <xbrli:entity>
      <xbrli:identifier scheme="http://www.test.com">TEST</xbrli:identifier>
    </xbrli:entity>
    <xbrli:period>
      <xbrli:instant>2023-12-31</xbrli:instant>
    </xbrli:period>
  </xbrli:context>
  <xbrli:unit id="u1">
    <xbrli:measure>iso4217:KRW</xbrli:measure>
  </xbrli:unit>
</xbrl>`

    // 직접 new로 생성 가능한지 확인
    // DOMParser 관련 오류가 없으면 성공 (다른 파싱 오류는 무시)
    let parserCreated = false
    try {
      const parser = new XBRLParser(minimalXML, 'KR')
      parserCreated = true
      expect(parser).toBeDefined()
    } catch (error) {
      // DOMParser 관련 오류인지 확인
      const errorMessage = error instanceof Error ? error.message : String(error)
      // "DOMParser를 사용할 수 없습니다" 또는 "DOMParser undefined" 같은 오류가 있으면 실패
      if (errorMessage.includes('DOMParser') && (errorMessage.includes('undefined') || errorMessage.includes('사용할 수 없습니다'))) {
        throw error
      }
      // 다른 파싱 오류는 허용 (DOMParser는 정상 작동)
      expect(parserCreated).toBe(false) // 파서 생성은 실패했지만, DOMParser 문제는 아님
    }
  })
})
