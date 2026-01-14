-- DART 공시대상회사 리스트 테이블
CREATE TABLE IF NOT EXISTS dart_companies (
  corp_code TEXT PRIMARY KEY,
  stock_code TEXT,
  corp_name TEXT NOT NULL,
  modify_date TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성 (검색 성능 향상)
CREATE INDEX IF NOT EXISTS idx_dart_companies_stock_code ON dart_companies(stock_code);
CREATE INDEX IF NOT EXISTS idx_dart_companies_corp_name ON dart_companies(corp_name);
CREATE INDEX IF NOT EXISTS idx_dart_companies_corp_name_trgm ON dart_companies USING gin(corp_name gin_trgm_ops);

-- 메타데이터 테이블
CREATE TABLE IF NOT EXISTS dart_company_list_metadata (
  id TEXT PRIMARY KEY DEFAULT 'last_update',
  last_updated TIMESTAMP WITH TIME ZONE NOT NULL,
  total_companies INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
CREATE TRIGGER update_dart_companies_updated_at
  BEFORE UPDATE ON dart_companies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dart_company_list_metadata_updated_at
  BEFORE UPDATE ON dart_company_list_metadata
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
