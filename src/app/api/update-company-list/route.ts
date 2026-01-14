/**
 * 회사 리스트 업데이트 API Route
 * 주 1회 자동 업데이트를 위한 엔드포인트
 */

import { NextResponse } from 'next/server';
import { getCompanyRegistry } from '@/lib/parsers/company-registry';

/**
 * GET: 회사 리스트 업데이트 실행
 */
export async function GET() {
  try {
    const registry = getCompanyRegistry();
    
    // 업데이트 필요 여부 확인
    const needsUpdate = await registry.needsUpdate();
    
    if (!needsUpdate) {
      return NextResponse.json({
        success: true,
        message: '업데이트가 필요하지 않습니다.',
        updated: false,
      });
    }

    // 회사 리스트 다운로드 및 저장
    const companies = await registry.initializeOrUpdate();

    return NextResponse.json({
      success: true,
      message: '회사 리스트가 성공적으로 업데이트되었습니다.',
      updated: true,
      totalCompanies: companies.length,
    });
  } catch (error) {
    console.error('[API] update-company-list GET 오류:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        ...(process.env.NODE_ENV === 'development' && { stack: errorStack }),
      },
      { status: 500 }
    );
  }
}

/**
 * POST: 강제 업데이트 실행
 */
export async function POST() {
  try {
    const registry = getCompanyRegistry();
    
    // 강제 업데이트 (needsUpdate 체크 없이)
    const companies = await registry.downloadCompanyList();
    await registry.saveToSupabase(companies);

    return NextResponse.json({
      success: true,
      message: '회사 리스트가 강제로 업데이트되었습니다.',
      totalCompanies: companies.length,
    });
  } catch (error) {
    console.error('[API] update-company-list POST 오류:', error);
    const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류';
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        ...(process.env.NODE_ENV === 'development' && { stack: errorStack }),
      },
      { status: 500 }
    );
  }
}
