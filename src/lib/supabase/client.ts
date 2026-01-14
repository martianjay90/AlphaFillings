/**
 * Supabase 클라이언트 설정
 * 환경 변수에서 설정값을 로드
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Supabase 클라이언트 생성 (환경 변수가 없어도 빈 문자열로 생성하여 오류 방지)
// 실제 사용 시에는 환경 변수 체크를 수행해야 함
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
)

// 환경 변수 체크 (경고만 출력, 오류는 발생시키지 않음)
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] 환경 변수가 설정되지 않았습니다. 일부 기능이 제한될 수 있습니다.')
  console.warn('[Supabase] NEXT_PUBLIC_SUPABASE_URL 또는 NEXT_PUBLIC_SUPABASE_ANON_KEY를 설정하세요.')
}
