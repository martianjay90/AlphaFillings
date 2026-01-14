/**
 * DART 클라이언트 사용 예시
 * 참고용 파일 (실제 사용 시 삭제 가능)
 */

import { getDARTClient, createDARTClient } from './dart-client';

/**
 * 예시 1: 환경 변수에서 API 키 자동 로드
 */
export async function example1() {
  // .env.local의 NEXT_PUBLIC_DART_API_KEY 또는 DART_API_KEY 자동 사용
  const client = getDARTClient();
  
  // 공시 목록 조회
  const disclosureList = await client.getDisclosureList({
    corp_code: '00126380', // 삼성전자 회사 코드
    bgn_de: '20240101',
    end_de: '20241231',
    page_no: 1,
    page_count: 10,
  });
  
  console.log('공시 목록:', disclosureList.list);
}

/**
 * 예시 2: API 키 직접 제공
 */
export async function example2() {
  const client = createDARTClient('your-api-key-here');
  
  // XBRL 다운로드
  const xbrlXml = await client.downloadXBRL('20240101000001');
  console.log('XBRL 데이터:', xbrlXml);
}

/**
 * 예시 3: PDF URL 추출
 */
export async function example3() {
  const client = getDARTClient();
  
  // PDF URL 가져오기
  const pdfUrl = await client.getPDFURL('20240101000001');
  console.log('PDF URL:', pdfUrl);
  
  // 또는 직접 다운로드 URL 생성
  const downloadUrl = client.getPDFDownloadURL('20240101000001');
  console.log('다운로드 URL:', downloadUrl);
}

/**
 * 예시 4: 최근 재무제표 조회
 */
export async function example4() {
  const client = getDARTClient();
  
  // 최근 재무제표 공시 조회
  const reports = await client.getRecentFinancialReports(
    '00126380', // 삼성전자
    '사업보고서',
    5
  );
  
  console.log('최근 재무제표:', reports);
  
  // 각 보고서의 PDF URL 가져오기
  for (const report of reports) {
    const pdfUrl = await client.getPDFURL(report.rcept_no);
    console.log(`${report.report_nm}: ${pdfUrl}`);
  }
}

/**
 * 예시 5: 뷰어 정보 조회
 */
export async function example5() {
  const client = getDARTClient();
  
  const viewerInfo = await client.getViewerInfo('20240101000001');
  
  if (viewerInfo.report?.pdf_url) {
    console.log('PDF URL:', viewerInfo.report.pdf_url);
  }
  
  if (viewerInfo.report?.attachments) {
    console.log('첨부파일:', viewerInfo.report.attachments);
  }
}
