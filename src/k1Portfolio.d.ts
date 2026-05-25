/**
 * TypeScript definitions for k1Portfolio.js
 */

export interface FilingDocument {
  name: string;
  pages: number;
}

export interface Filing {
  index: number;
  applicationNumber: string;
  title: string;
  confirmationNumber: string;
  patentCenterId: string;
  receivedET: string;
  documents: FilingDocument[];
  category: string;
  themes: string[];
}

export interface MismatchedFiling {
  applicationNumber: string;
  status: string;
  notes: string;
}

export interface ProvisionalsSummary {
  total: number;
  coverage: string;
  purpose: string;
}

export interface ValuationRange {
  lowUSD: number;
  highUSD: number;
  stage: string;
  openEnded?: boolean;
}

export interface ValuationRanges {
  currentPreMoney: ValuationRange;
  postMvpPilot: ValuationRange;
  earlyRevenue: ValuationRange;
  strategicFinancePaymentTraction: ValuationRange;
  strategicAcquisition: ValuationRange;
}

export interface StrategicLayer {
  layer: string;
  filings: string[];
  purpose: string;
}

export interface StrategicArchitecture {
  layers: StrategicLayer[];
}

export interface BuyerCategory {
  category: string;
  why: string;
}

export interface KeyMessaging {
  whatWeAre: string;
  whatWeDo: string;
  whyItMatters: string;
  whyIpMatters: string;
  whyFinanceAndPaymentsMatter: string;
  whyTokenizedRightsMatter: string;
}

export interface Meta {
  company: string;
  founder: string;
  founderFullName: string;
  positioning: string;
  tagline: string;
  narrativeFlow: string[];
  asOf: string;
}

export interface Counts {
  cleanNonprovisionalUtility: number;
  mismatchedDuplicateNonprovisional: number;
  provisionalsTotalStrategicallyCovered: number;
  totalNonprovisionalFilingsAttempted: number;
}

export interface PortfolioSummary {
  meta: Meta;
  counts: Counts;
  provisionals: ProvisionalsSummary;
  mismatchedFilings: MismatchedFiling[];
  cleanFilingsCount: number;
  financialFilingsCount: number;
  verticalFilingsCount: number;
  valuationRanges: ValuationRanges;
  valueDrivers: string[];
  strategicArchitecture: StrategicArchitecture;
  buyerCategories: BuyerCategory[];
  keyMessaging: KeyMessaging;
}

export const META: Meta;
export const COUNTS: Counts;
export const MISMATCHED_FILINGS: MismatchedFiling[];
export const PROVISIONALS_SUMMARY: ProvisionalsSummary;
export const CLEAN_FILINGS: Filing[];
export const VERTICAL_CATEGORIES: string[];
export const FINANCIAL_CATEGORIES: string[];
export const VALUATION_RANGES: ValuationRanges;
export const VALUE_DRIVERS: string[];
export const STRATEGIC_ARCHITECTURE: StrategicArchitecture;
export const BUYER_CATEGORIES: BuyerCategory[];
export const KEY_MESSAGING: KeyMessaging;

export function getCleanFilings(): Filing[];
export function getFinancialFilings(): Filing[];
export function getVerticalFilings(): Filing[];
export function getValuationRanges(): ValuationRanges;
export function getFilingByNumber(applicationNumber: string): Filing | null;
export function getPortfolioSummary(): PortfolioSummary;

declare const _default: {
  META: Meta;
  COUNTS: Counts;
  MISMATCHED_FILINGS: MismatchedFiling[];
  PROVISIONALS_SUMMARY: ProvisionalsSummary;
  CLEAN_FILINGS: Filing[];
  VERTICAL_CATEGORIES: string[];
  FINANCIAL_CATEGORIES: string[];
  VALUATION_RANGES: ValuationRanges;
  VALUE_DRIVERS: string[];
  STRATEGIC_ARCHITECTURE: StrategicArchitecture;
  BUYER_CATEGORIES: BuyerCategory[];
  KEY_MESSAGING: KeyMessaging;
  getCleanFilings: typeof getCleanFilings;
  getFinancialFilings: typeof getFinancialFilings;
  getVerticalFilings: typeof getVerticalFilings;
  getValuationRanges: typeof getValuationRanges;
  getFilingByNumber: typeof getFilingByNumber;
  getPortfolioSummary: typeof getPortfolioSummary;
};

export default _default;
