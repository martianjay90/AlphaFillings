/**
 * XBRL 태그 매퍼
 * DART/SEC XBRL 구조 분석 및 핵심 계정명 정확한 매핑
 */

/**
 * DART/SEC XBRL 핵심 계정명 매핑
 */
export const XBRL_TAG_MAPPINGS = {
  // IFRS (한국 DART)
  ifrs: {
    // 손익계산서 (Income Statement)
    revenue: [
      'ifrs-full:Revenue',
      'ifrs-full:RevenueFromContractsWithCustomers', // 추가: 계약 고객으로부터의 매출
      'ifrs:Revenue',
      'kasb:Revenue',
      'Revenue',
      '매출액',
    ],
    operatingIncome: [
      'ifrs-full:OperatingProfitLoss',
      'ifrs-full:ProfitLossFromOperatingActivities',
      'dart:OperatingProfitLoss',
      'dart:OperatingIncomeLoss', // 추가: LG전자 DART IFRS에서 사용하는 태그
      'dart_OperatingProfitLoss',
      'dart_OperatingIncomeLoss', // 추가: 언더스코어 폴백 버전
      'ifrs:OperatingIncome',
      'kasb:OperatingIncome',
      'kasb:OperatingProfitLoss',
      'OperatingIncome',
      'OperatingProfitLoss',
      'OperatingIncomeLoss', // 추가: 로컬네임 폴백
      '영업이익',
      '영업손익',
    ],
    // EPS 분리: 계속영업/총계/중단영업 (스코프 고정을 위해 분리)
    epsContinuing: [
      // 계속영업 기준 EPS (최우선)
      'ifrs-full:BasicEarningsLossPerShareFromContinuingOperations',
      'ifrs-full:DilutedEarningsLossPerShareFromContinuingOperations',
      'BasicEarningsLossPerShareFromContinuingOperations',
      'DilutedEarningsLossPerShareFromContinuingOperations',
    ],
    epsTotal: [
      // 총계 EPS (계속영업 + 중단영업)
      'ifrs-full:BasicEarningsLossPerShare', // LG전자 등에서 사용
      'ifrs-full:DilutedEarningsLossPerShare',
      'ifrs-full:EarningsPerShare', // 구버전 태그
      'ifrs:EPS',
      'kasb:EPS',
      'EPS',
      'BasicEarningsLossPerShare',
      'DilutedEarningsLossPerShare',
      'EarningsPerShare',
      '주당순이익',
    ],
    epsDiscontinued: [
      // 중단영업 기준 EPS (선택적)
      'ifrs-full:BasicEarningsLossPerShareFromDiscontinuedOperations',
      'ifrs-full:DilutedEarningsLossPerShareFromDiscontinuedOperations',
      'BasicEarningsLossPerShareFromDiscontinuedOperations',
      'DilutedEarningsLossPerShareFromDiscontinuedOperations',
    ],
    // 순이익 분리: 계속영업/총계/중단영업 (EPS와 동일 스코프 유지)
    netIncomeContinuing: [
      // 계속영업 기준 순이익 (최우선)
      'ifrs-full:ProfitLossFromContinuingOperations',
      'ifrs-full:ProfitLossFromContinuingOperationsAttributableToOwnersOfParent',
      'dart:ProfitLossFromContinuingOperations',
      'dart_ProfitLossFromContinuingOperations',
      'ProfitLossFromContinuingOperations',
      '계속영업순이익',
      '계속영업당기순이익',
    ],
    netIncomeTotal: [
      // 총계 순이익 (계속영업 + 중단영업)
      'ifrs-full:ProfitLoss',
      'ifrs-full:ProfitLossAttributableToOwnersOfParent', // 지배주주 귀속 당기순이익
      'ifrs-full:ProfitLossAttributableToOwnersOfParentAndNoncontrollingInterests', // 지배주주 및 비지배주주 귀속 당기순이익
      'dart:ProfitLoss',
      'dart:ProfitLossAttributableToOwnersOfParent',
      'dart:ProfitLossAttributableToOwnersOfParentAndNoncontrollingInterests',
      'dart_ProfitLoss',
      'dart_ProfitLossAttributableToOwnersOfParent',
      'dart_ProfitLossAttributableToOwnersOfParentAndNoncontrollingInterests',
      'ifrs:NetIncome',
      'kasb:NetIncome',
      'NetIncome',
      'ProfitLoss',
      'ProfitLossAttributableToOwnersOfParent',
      'ProfitLossAttributableToOwnersOfParentAndNoncontrollingInterests',
      '당기순이익',
      '지배주주귀속당기순이익',
    ],
    netIncomeDiscontinued: [
      // 중단영업 기준 순이익 (선택적)
      'ifrs-full:ProfitLossFromDiscontinuedOperations',
      'ifrs-full:ProfitLossFromDiscontinuedOperationsAttributableToOwnersOfParent',
      'ProfitLossFromDiscontinuedOperations',
    ],
    // 하위 호환성: eps는 epsTotal로 매핑 (기존 코드 호환)
    eps: [
      // 하위 호환성 유지 (사용 안 함, epsContinuing/epsTotal 사용 권장)
      'ifrs-full:BasicEarningsLossPerShare',
      'ifrs-full:EarningsPerShare',
      'EPS',
      '주당순이익',
    ],
    // 하위 호환성: netIncome는 netIncomeTotal로 매핑 (기존 코드 호환)
    netIncome: [
      // 하위 호환성 유지 (사용 안 함, netIncomeContinuing/netIncomeTotal 사용 권장)
      'ifrs-full:ProfitLoss',
      'ifrs-full:ProfitLossAttributableToOwnersOfParent',
      'NetIncome',
      '당기순이익',
    ],
    depreciationAndAmortization: [
      // 선택적 필드: 찾지 못해도 파이프라인 실패하지 않음
      'ifrs-full:DepreciationAndAmortisationExpense', // 최우선: UK spelling (LG전자 등에서 사용)
      'ifrs-full:DepreciationAndAmortizationExpense', // US spelling
      'ifrs-full:AdjustmentsForDepreciationExpense',
      'ifrs-full:AdjustmentsForAmortisationExpense', // UK spelling
      'ifrs-full:AdjustmentsForAmortizationExpense', // US spelling
      'ifrs-full:DepreciationPropertyPlantAndEquipment',
      'ifrs-full:DepreciationRightofuseAssets',
      'ifrs-full:AmortisationIntangibleAssetsOtherThanGoodwill', // UK spelling
      'ifrs-full:AmortizationIntangibleAssetsOtherThanGoodwill', // US spelling
      'ifrs-full:DepreciationAmortizationExpense',
      'ifrs:DepreciationAndAmortization',
      'kasb:DepreciationAndAmortization',
      'DepreciationAndAmortisationExpense', // localName 후보 (UK spelling)
      'DepreciationAndAmortizationExpense', // localName 후보 (US spelling)
      'DepreciationAndAmortization',
      '감가상각비',
    ],

    // 재무상태표 (Balance Sheet)
    totalAssets: [
      'ifrs-full:Assets',
      'ifrs:TotalAssets',
      'kasb:TotalAssets',
      'TotalAssets',
      '자산총계',
    ],
    totalLiabilities: [
      'ifrs-full:Liabilities',
      'ifrs:TotalLiabilities',
      'kasb:TotalLiabilities',
      'TotalLiabilities',
      '부채총계',
    ],
    totalEquity: [
      'ifrs-full:Equity',
      'ifrs:TotalEquity',
      'kasb:TotalEquity',
      'TotalEquity',
      '자본총계',
    ],
    operatingAssets: [
      'ifrs-full:PropertyPlantAndEquipment',
      'ifrs:PropertyPlantAndEquipment',
      'kasb:PropertyPlantAndEquipment',
      'PPE',
      '유형자산',
    ],
    nonInterestBearingLiabilities: [
      // 최우선: 단일 태그 (엔티티 taxonomy 포함)
      'ifrs-full:TradeAndOtherPayables', // IFRS 표준 태그
      'ifrs-full:TradePayables',
      'ifrs-full:OtherPayables',
      'dart:TradeAndOtherPayables', // DART 확장
      'dart:NonInterestBearingLiabilities', // DART 확장 (있는 경우)
      'ifrs:TradePayables',
      'kasb:TradePayables',
      'TradePayables',
      'TradeAndOtherPayables',
      'NonInterestBearingLiabilities',
      '매입채무',
      '기타채무',
    ],
    // 비이자발생부채 대체 계산용 (합산 항목)
    operatingLiabilitiesComponents: [
      // 매입채무/기타채무
      'ifrs-full:TradeAndOtherPayables',
      'ifrs-full:TradePayables',
      'ifrs-full:OtherPayables',
      'TradePayables',
      '매입채무',
      '기타채무',
      // 선수금/계약부채
      'ifrs-full:ContractLiabilities',
      'ifrs-full:AdvancesReceived',
      'ContractLiabilities',
      '선수금',
      '계약부채',
      // 미지급비용/기타유동부채
      'ifrs-full:AccruedLiabilities',
      'ifrs-full:OtherCurrentLiabilities',
      'AccruedLiabilities',
      'OtherCurrentLiabilities',
      '미지급비용',
      '기타유동부채',
      // 충당부채
      'ifrs-full:Provisions',
      'ifrs-full:ProvisionsCurrent',
      'Provisions',
      '충당부채',
    ],
    accountsReceivable: [
      'ifrs-full:TradeAndOtherReceivables',
      'ifrs:TradeReceivables',
      'kasb:TradeReceivables',
      'TradeReceivables',
      '매출채권',
    ],
    inventory: [
      'ifrs-full:Inventories',
      'ifrs:Inventory',
      'kasb:Inventory',
      'Inventory',
      '재고자산',
    ],
    // ROIC 계산용 항목 (간이 계산: Equity + InterestBearingDebt - Cash)
    cash: [
      'ifrs-full:CashAndCashEquivalents',
      'ifrs-full:Cash',
      'ifrs:CashAndCashEquivalents',
      'kasb:CashAndCashEquivalents',
      'CashAndCashEquivalents',
      'Cash',
      '현금및현금성자산',
      '현금',
    ],
    interestBearingDebt: [
      // 단기차입금
      'ifrs-full:Borrowings',
      'ifrs-full:CurrentBorrowings',
      'ifrs-full:ShortTermBorrowings',
      // 장기차입금
      'ifrs-full:NonCurrentBorrowings',
      'ifrs-full:LongTermBorrowings',
      // 사채/회사채
      'ifrs-full:DebtSecurities',
      'ifrs-full:BondsPayable',
      // 통합 태그
      'dart:InterestBearingDebt',
      'dart:TotalBorrowings',
      // 로컬네임 후보
      'Borrowings',
      'CurrentBorrowings',
      'NonCurrentBorrowings',
      'ShortTermBorrowings',
      'LongTermBorrowings',
      'DebtSecurities',
      'BondsPayable',
      'InterestBearingDebt',
      '이자발생부채',
      '차입금',
      '단기차입금',
      '장기차입금',
      '사채',
      '회사채',
    ],
    // 이자발생부채 합산용 컴포넌트
    interestBearingDebtComponents: [
      // 단기차입금
      'ifrs-full:CurrentBorrowings',
      'ifrs-full:ShortTermBorrowings',
      'ifrs-full:BorrowingsCurrent',
      // 장기차입금
      'ifrs-full:NonCurrentBorrowings',
      'ifrs-full:LongTermBorrowings',
      'ifrs-full:BorrowingsNoncurrent',
      // 사채/회사채
      'ifrs-full:DebtSecurities',
      'ifrs-full:BondsPayable',
      'ifrs-full:DebtSecuritiesCurrent',
      'ifrs-full:DebtSecuritiesNoncurrent',
      // LoansReceived 계열 (삼성전자 케이스)
      'ifrs-full:CurrentLoansReceivedOfCurrentLiabilities',
      'ifrs-full:NoncurrentPortionOfNoncurrentLoansReceived',
      'ifrs-full:CurrentLoansReceived',
      'ifrs-full:NoncurrentLoansReceived',
      'ifrs-full:LoansReceived',
      // 로컬네임
      'CurrentBorrowings',
      'NonCurrentBorrowings',
      'ShortTermBorrowings',
      'LongTermBorrowings',
      'DebtSecurities',
      'BondsPayable',
      'CurrentLoansReceivedOfCurrentLiabilities',
      'NoncurrentPortionOfNoncurrentLoansReceived',
      'CurrentLoansReceived',
      'NoncurrentLoansReceived',
      'LoansReceived',
      '단기차입금',
      '장기차입금',
      '사채',
      '회사채',
    ],

    // 현금흐름표 (Cash Flow Statement)
    operatingCashFlow: [
      'ifrs-full:CashFlowsFromUsedInOperatingActivities',
      'ifrs:OperatingCashFlow',
      'kasb:OperatingCashFlow',
      'OperatingCashFlow',
      '영업현금흐름',
    ],
    investingCashFlow: [
      'ifrs-full:CashFlowsFromUsedInInvestingActivities',
      'ifrs:InvestingCashFlow',
      'kasb:InvestingCashFlow',
      'InvestingCashFlow',
      '투자현금흐름',
    ],
    financingCashFlow: [
      'ifrs-full:CashFlowsFromUsedInFinancingActivities',
      'ifrs:FinancingCashFlow',
      'kasb:FinancingCashFlow',
      'FinancingCashFlow',
      '재무현금흐름',
    ],
    // CAPEX PPE (유형자산 자본적지출)
    capexPPE: [
      // 최우선: IFRS 표준 태그
      'ifrs-full:PaymentsToAcquirePropertyPlantAndEquipment', // IFRS 표준 태그 (최우선)
      'ifrs-full:PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities', // IFRS 확장 태그
      'ifrs-full:AcquisitionsOfPropertyPlantAndEquipment', // IFRS 확장 태그
      'ifrs-full:PurchaseOfPropertyPlantAndEquipment', // IFRS 표준 태그 (후순위)
      // 엔티티 확장 taxonomy (localName 기반)
      'ifrs:CapitalExpenditure',
      'kasb:CapitalExpenditure',
      // localName 후보 (PropertyPlantAndEquipment + Purchase/Payments/Acquisition 조합)
      'PurchaseOfPropertyPlantAndEquipment',
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'AcquisitionsOfPropertyPlantAndEquipment',
      'PropertyPlantAndEquipmentPurchase',
      'PropertyPlantAndEquipmentPayments',
      'PropertyPlantAndEquipmentAcquisitions',
      'CAPEX',
      '자본적지출',
    ],
    // CAPEX Intangible (무형자산 자본적지출)
    capexIntangible: [
      // 최우선: IFRS 표준 태그
      'ifrs-full:PaymentsToAcquireIntangibleAssets', // IFRS 표준 태그 (최우선)
      'ifrs-full:PurchaseOfIntangibleAssetsClassifiedAsInvestingActivities', // IFRS 확장 태그
      'ifrs-full:AcquisitionsOfIntangibleAssets', // IFRS 확장 태그
      // 엔티티 확장 taxonomy (localName 기반)
      'PurchaseOfIntangibleAssets',
      'PaymentsToAcquireIntangibleAssets',
      'AcquisitionsOfIntangibleAssets',
      'IntangibleAssetsPurchase',
      'IntangibleAssetsPayments',
      'IntangibleAssetsAcquisitions',
      '무형자산구매',
      '무형자산취득',
    ],
    // capitalExpenditure는 정책 결과로만 사용 (합산 로직 전용, 직접 매핑 사용 안 함)
    capitalExpenditure: [],
  },

  // US GAAP (SEC EDGAR)
  gaap: {
    revenue: [
      'us-gaap:Revenues',
      'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax',
      'Revenue',
    ],
    operatingIncome: [
      'us-gaap:OperatingIncomeLoss',
      'us-gaap:IncomeFromOperations',
      'OperatingIncome',
    ],
    // EPS 분리: 계속영업/총계/중단영업 (스코프 고정을 위해 분리)
    epsContinuing: [
      // 계속영업 기준 EPS (최우선)
      'us-gaap:EarningsPerShareBasicFromContinuingOperations',
      'us-gaap:EarningsPerShareDilutedFromContinuingOperations',
      'EarningsPerShareBasicFromContinuingOperations',
      'EarningsPerShareDilutedFromContinuingOperations',
    ],
    epsTotal: [
      // 총계 EPS (계속영업 + 중단영업)
      'us-gaap:EarningsPerShareBasic',
      'us-gaap:EarningsPerShareDiluted',
      'EarningsPerShareBasic',
      'EarningsPerShareDiluted',
      'EPS',
    ],
    epsDiscontinued: [
      // 중단영업 기준 EPS (선택적)
      'us-gaap:EarningsPerShareBasicFromDiscontinuedOperations',
      'us-gaap:EarningsPerShareDilutedFromDiscontinuedOperations',
      'EarningsPerShareBasicFromDiscontinuedOperations',
      'EarningsPerShareDilutedFromDiscontinuedOperations',
    ],
    // 순이익 분리: 계속영업/총계/중단영업 (EPS와 동일 스코프 유지)
    netIncomeContinuing: [
      // 계속영업 기준 순이익 (최우선)
      'us-gaap:IncomeFromContinuingOperations',
      'us-gaap:IncomeFromContinuingOperationsAttributableToParent',
      'IncomeFromContinuingOperations',
    ],
    netIncomeTotal: [
      // 총계 순이익 (계속영업 + 중단영업)
      'us-gaap:NetIncomeLoss',
      'us-gaap:ProfitLoss',
      'NetIncomeLoss',
      'NetIncome',
      'ProfitLoss',
    ],
    netIncomeDiscontinued: [
      // 중단영업 기준 순이익 (선택적)
      'us-gaap:IncomeFromDiscontinuedOperations',
      'us-gaap:IncomeFromDiscontinuedOperationsAttributableToParent',
      'IncomeFromDiscontinuedOperations',
    ],
    // 하위 호환성: eps는 epsTotal로 매핑 (기존 코드 호환)
    eps: [
      // 하위 호환성 유지 (사용 안 함, epsContinuing/epsTotal 사용 권장)
      'us-gaap:EarningsPerShareBasic',
      'us-gaap:EarningsPerShareDiluted',
      'EPS',
    ],
    // 하위 호환성: netIncome는 netIncomeTotal로 매핑 (기존 코드 호환)
    netIncome: [
      // 하위 호환성 유지 (사용 안 함, netIncomeContinuing/netIncomeTotal 사용 권장)
      'us-gaap:NetIncomeLoss',
      'us-gaap:ProfitLoss',
      'NetIncome',
    ],
    depreciationAndAmortization: [
      'us-gaap:DepreciationAndAmortization',
      'us-gaap:DepreciationDepletionAndAmortization',
      'DepreciationAndAmortization',
    ],
    totalAssets: [
      'us-gaap:Assets',
      'us-gaap:AssetsTotal',
      'TotalAssets',
    ],
    totalLiabilities: [
      'us-gaap:Liabilities',
      'us-gaap:LiabilitiesTotal',
      'TotalLiabilities',
    ],
    totalEquity: [
      'us-gaap:Equity',
      'us-gaap:StockholdersEquity',
      'TotalEquity',
    ],
    operatingAssets: [
      'us-gaap:PropertyPlantAndEquipmentNet',
      'us-gaap:PropertyPlantAndEquipment',
      'PPE',
    ],
    nonInterestBearingLiabilities: [
      // 최우선: 단일 태그 (엔티티 taxonomy 포함)
      'us-gaap:AccountsPayableCurrent',
      'us-gaap:TradePayables',
      'us-gaap:AccountsPayableAndAccruedLiabilitiesCurrent',
      'us-gaap:OtherPayablesAndAccruedLiabilitiesCurrent',
      'TradePayables',
      'AccountsPayableCurrent',
    ],
    // 비이자발생부채 대체 계산용 (합산 항목)
    operatingLiabilitiesComponents: [
      // 매입채무/기타채무
      'us-gaap:AccountsPayableCurrent',
      'us-gaap:TradePayables',
      'us-gaap:AccountsPayableAndAccruedLiabilitiesCurrent',
      'us-gaap:OtherPayablesAndAccruedLiabilitiesCurrent',
      'AccountsPayableCurrent',
      'TradePayables',
      // 선수금/계약부채
      'us-gaap:ContractWithCustomerLiability',
      'us-gaap:ContractWithCustomerLiabilityCurrent',
      'us-gaap:DeferredRevenueCurrent',
      'ContractWithCustomerLiability',
      'DeferredRevenueCurrent',
      // 미지급비용/기타유동부채
      'us-gaap:AccruedLiabilitiesCurrent',
      'us-gaap:OtherAccruedLiabilitiesCurrent',
      'us-gaap:OtherLiabilitiesCurrent',
      'AccruedLiabilitiesCurrent',
      'OtherCurrentLiabilities',
      // 충당부채
      'us-gaap:AccruedWagesAndSalariesCurrent',
      'us-gaap:AccruedEmployeeBenefitsCurrent',
      'AccruedWagesAndSalariesCurrent',
    ],
    accountsReceivable: [
      'us-gaap:AccountsReceivableNetCurrent',
      'us-gaap:TradeReceivables',
      'AccountsReceivable',
    ],
    inventory: [
      'us-gaap:InventoryNet',
      'us-gaap:Inventory',
      'Inventory',
    ],
    // ROIC 계산용 항목 (간이 계산: Equity + InterestBearingDebt - Cash)
    cash: [
      'us-gaap:CashAndCashEquivalentsAtCarryingValue',
      'us-gaap:CashCashEquivalentsAndShortTermInvestments',
      'us-gaap:Cash',
      'CashAndCashEquivalents',
      'Cash',
      '현금및현금성자산',
      '현금',
    ],
    interestBearingDebt: [
      // 단기차입금
      'us-gaap:ShortTermDebt',
      'us-gaap:CommercialPaper',
      'us-gaap:CurrentPortionOfLongTermDebt',
      // 장기차입금
      'us-gaap:LongTermDebt',
      'us-gaap:LongTermDebtNoncurrent',
      // 사채/회사채
      'us-gaap:DebtSecurities',
      'us-gaap:BondsPayable',
      // 통합 태그
      'us-gaap:DebtCurrentAndNoncurrent',
      // 로컬네임
      'ShortTermDebt',
      'LongTermDebt',
      'CurrentPortionOfLongTermDebt',
      'DebtSecurities',
      'BondsPayable',
      'InterestBearingDebt',
      '이자발생부채',
      '차입금',
    ],
    // 이자발생부채 합산용 컴포넌트
    interestBearingDebtComponents: [
      // 단기차입금
      'us-gaap:ShortTermDebt',
      'us-gaap:CommercialPaper',
      'us-gaap:CurrentPortionOfLongTermDebt',
      // 장기차입금
      'us-gaap:LongTermDebt',
      'us-gaap:LongTermDebtNoncurrent',
      // 사채/회사채
      'us-gaap:DebtSecurities',
      'us-gaap:BondsPayable',
      // 로컬네임
      'ShortTermDebt',
      'LongTermDebt',
      'CurrentPortionOfLongTermDebt',
      'DebtSecurities',
      'BondsPayable',
    ],
    operatingCashFlow: [
      'us-gaap:NetCashProvidedByUsedInOperatingActivities',
      'us-gaap:OperatingCashFlow',
      'OperatingCashFlow',
    ],
    investingCashFlow: [
      'us-gaap:NetCashProvidedByUsedInInvestingActivities',
      'us-gaap:InvestingCashFlow',
      'InvestingCashFlow',
    ],
    financingCashFlow: [
      'us-gaap:NetCashProvidedByUsedInFinancingActivities',
      'us-gaap:FinancingCashFlow',
      'FinancingCashFlow',
    ],
    // CAPEX PPE (유형자산 자본적지출)
    capexPPE: [
      // 최우선: US GAAP 표준 태그
      'us-gaap:PaymentsToAcquirePropertyPlantAndEquipment', // US GAAP 표준 태그 (최우선)
      'us-gaap:PurchasesOfPropertyPlantAndEquipment',
      'us-gaap:CapitalExpenditure',
      // 엔티티 확장 taxonomy (localName 기반)
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'PurchasesOfPropertyPlantAndEquipment',
      'PropertyPlantAndEquipmentPurchase',
      'PropertyPlantAndEquipmentPayments',
      'CAPEX',
    ],
    // CAPEX Intangible (무형자산 자본적지출)
    capexIntangible: [
      // 최우선: US GAAP 표준 태그
      'us-gaap:PaymentsToAcquireIntangibleAssets', // US GAAP 표준 태그 (최우선)
      'us-gaap:PurchasesOfIntangibleAssets',
      // 엔티티 확장 taxonomy (localName 기반)
      'PaymentsToAcquireIntangibleAssets',
      'PurchasesOfIntangibleAssets',
      'IntangibleAssetsPurchase',
      'IntangibleAssetsPayments',
    ],
    // capitalExpenditure는 정책 결과로만 사용 (합산 로직 전용, 직접 매핑 사용 안 함)
    capitalExpenditure: [],
  },
}

/**
 * 누락된 태그 로깅 (출력 제한 및 localName 중심)
 */
export function logMissingTag(
  tagName: string,
  attemptedTags: string[],
  xmlDoc: Document
): void {
  // 유사한 태그 찾기 (localName 중심으로 요약)
  // querySelectorAll 대신 getElementsByTagName 사용 (Node.js/@xmldom/xmldom 호환)
  const allElements: Element[] = []
  try {
    // getElementsByTagName('*')는 모든 요소를 반환 (브라우저/Node.js 모두 지원)
    const allNodes = xmlDoc.getElementsByTagName('*')
    for (let i = 0; i < allNodes.length; i++) {
      allElements.push(allNodes[i] as Element)
    }
  } catch (error) {
    // getElementsByTagName('*')가 실패하면 빈 배열 반환 (로그 스킵)
    return
  }
  const localNameMap = new Map<string, number>()
  
  for (const element of allElements) {
    const localName = element.localName || element.tagName.split(':').pop() || element.tagName
    localNameMap.set(localName, (localNameMap.get(localName) || 0) + 1)
  }
  
  // 유사한 localName 찾기 (시도한 태그의 localName과 유사한 것)
  const attemptedLocalNames = attemptedTags.map(tag => {
    const parts = tag.split(':')
    return parts.length > 1 ? parts[parts.length - 1] : tag
  })
  
  const similarLocalNames: string[] = []
  for (const attemptedLocalName of attemptedLocalNames) {
    const lowerAttempted = attemptedLocalName.toLowerCase()
    for (const [localName, count] of localNameMap.entries()) {
      const lowerLocalName = localName.toLowerCase()
      if (
        lowerLocalName.includes(lowerAttempted) ||
        lowerAttempted.includes(lowerLocalName) ||
        (lowerAttempted.includes('earnings') && lowerLocalName.includes('earnings')) ||
        (lowerAttempted.includes('depreciation') && lowerLocalName.includes('depreciation')) ||
        (lowerAttempted.includes('amortisation') && lowerLocalName.includes('amortisation')) ||
        (lowerAttempted.includes('amortization') && lowerLocalName.includes('amortization'))
      ) {
        if (!similarLocalNames.includes(localName)) {
          similarLocalNames.push(localName)
        }
      }
    }
  }
  
  // operatingIncome 관련 필드의 경우 Operating* 계열 태그 추가 검색
  if (tagName.toLowerCase().includes('operating') || tagName.toLowerCase().includes('영업이익')) {
    for (const [localName, count] of localNameMap.entries()) {
      const lowerLocalName = localName.toLowerCase()
      // Operating으로 시작하는 태그 찾기 (Income, Profit, Loss 포함)
      if (
        lowerLocalName.startsWith('operating') &&
        (lowerLocalName.includes('income') || 
         lowerLocalName.includes('profit') || 
         lowerLocalName.includes('loss'))
      ) {
        if (!similarLocalNames.includes(localName)) {
          similarLocalNames.push(localName)
        }
      }
    }
  }
  
  // 최대 30개로 제한
  const limitedSimilarNames = similarLocalNames.slice(0, 30)
  
  if (limitedSimilarNames.length > 0) {
    console.warn(`[XBRL Parser] ${tagName} 태그를 찾을 수 없습니다. 유사한 localName:`, limitedSimilarNames)
  } else {
    // 유사한 것이 없으면 모든 localName 샘플 (최대 30개)
    const sampleLocalNames = Array.from(localNameMap.keys()).slice(0, 30)
    console.warn(`[XBRL Parser] ${tagName} 태그를 찾을 수 없습니다. 문서 내 localName 샘플:`, sampleLocalNames)
  }
  
  // 시도한 태그 목록은 최대 10개만 출력
  const limitedAttemptedTags = attemptedTags.slice(0, 10)
  if (attemptedTags.length > 10) {
    console.warn(`[XBRL Parser] 시도한 태그 목록 (일부):`, limitedAttemptedTags, `... (총 ${attemptedTags.length}개)`)
  } else {
    console.warn(`[XBRL Parser] 시도한 태그 목록:`, limitedAttemptedTags)
  }
}
