import type { SupportedAspectRatio } from './studio';

export type EvidenceStatus =
  | 'confirmed_fact'
  | 'confirmed_conflict'
  | 'visual_inference'
  | 'unverified_spatial_inference'
  | 'needs_measurement';

export type BackProfile = 'High-Back' | 'Mid-Back' | 'Low-Back';
export type VisualWeight = 'Solid / Enclosing' | 'Medium' | 'Open / Airy';

export interface ChairDimensions {
  heightCm: number;
  widthCm: number;
  depthCm: number;
  seatHeightCm: number;
  backHeightCm: number;
}

export interface MerchantChair {
  id: string;
  sku: string;
  name: string;
  shortTitle: string;
  designer: string;
  collection: string;
  category: string;
  priceNumeric: number;
  price: string;
  currency: string;
  inStock: boolean;
  availability: string;
  backProfile: BackProfile;
  visualWeight: VisualWeight;
  material: string;
  finish: string;
  dimensions: ChairDimensions;
  description: string;
  features: string[];
  imageUrl: string;
  source: 'demo_catalog' | 'shopify';
  url?: string;
}

export interface UserMeasurements {
  maxBudgetUsd?: number;
  windowSillHeightCm?: number;
  availableWidthCm?: number;
}

export interface RoomObservation {
  claim: string;
  status: 'visual_inference' | 'confirmed_fact';
}

export interface ParsedConstraint {
  type: 'hard' | 'spatial' | 'soft';
  name: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface ConflictItem {
  title: string;
  claim: string;
  productFact: string;
  status: EvidenceStatus;
  missingData: string[];
}

export interface AlternativeRecommendation {
  productId: string;
  headline: string;
  reason: string;
  gained: string;
  tradeoff: string;
}

export interface PlacementStrategy {
  title: string;
  description: string;
  gained: string;
  tradeoff: string;
  renderHint: string;
}

export interface ContextFitAnalysis {
  turnNumber: number;
  userPrompt: string;
  planRevisionSummary?: string;
  userGoal: string;
  verdictHeadline: string;
  roomObservations: RoomObservation[];
  constraints: ParsedConstraint[];
  potentialConflicts: ConflictItem[];
  initialPlacementHint?: string;
  placementStrategy: PlacementStrategy;
  alternatives: AlternativeRecommendation[];
  clarifyingQuestion: string;
  clarifyingFieldHint?: 'windowSillHeightCm' | 'availableWidthCm' | 'maxBudgetUsd' | 'placement';
  modelUsed?: string;
  analyzedAt: number;
}

export interface CartItem {
  chair: MerchantChair;
  quantity: number;
}

export interface VisualPreviewRender {
  status: 'idle' | 'rendering' | 'done' | 'error';
  imageDataUrl?: string;
  aspectRatio?: SupportedAspectRatio;
  renderTimeMs?: number;
  error?: string;
  label?: string;
}
