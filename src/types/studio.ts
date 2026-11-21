export type SupportedAspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';

export type PlacementOption =
  | 'Smart Auto'
  | 'Desk / Table'
  | 'Coffee Table'
  | 'Floor / Corner'
  | 'Shelf / Bookcase'
  | 'Nightstand'
  | 'Countertop'
  | 'Wall Mounted';

export type LightingMood = 'Match Room' | 'Warm Lamp' | 'Natural Light';

export type CompareMode = 'grid' | 'split' | 'focus';
export type SingleViewMode = 'rendered' | 'split' | 'original';

export interface ProductVariant {
  id: string;
  title: string;
  sku?: string;
  price: string;
  priceNumeric: number | null;
  currency: string;
  available: boolean;
  imageUrl?: string;
  options?: Record<string, string>;
}

export interface ProductItem {
  id: string;
  source: 'shopify' | 'manual' | 'sample';
  title: string;
  brand: string;
  store: string;
  price: string;
  priceNumeric: number | null;
  currency: string;
  availability: string;
  rating: number | null;
  reviewCount: number | null;
  url?: string;
  description?: string;
  features: string[];
  images: string[];
  selectedImageIndex: number;
  variants: ProductVariant[];
  selectedVariantId?: string;
}

export interface RoomPhoto {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  resizedWidth: number;
  resizedHeight: number;
  wasResized: boolean;
  aspectRatio: SupportedAspectRatio;
}

export interface SceneSettings {
  placement: PlacementOption;
  lightingMood: LightingMood;
  customNotes: string;
}

export interface RenderState {
  status: 'idle' | 'rendering' | 'done' | 'error';
  imageDataUrl?: string;
  aspectRatio?: SupportedAspectRatio;
  renderedAt?: number;
  renderTimeMs?: number;
  error?: string;
  settingsSignature?: string;
}

export const PLACEMENT_OPTIONS: readonly PlacementOption[] = [
  'Smart Auto',
  'Desk / Table',
  'Coffee Table',
  'Floor / Corner',
  'Shelf / Bookcase',
  'Nightstand',
  'Countertop',
  'Wall Mounted',
] as const;

export const LIGHTING_MOODS: ReadonlyArray<{
  value: LightingMood;
  label: string;
  detail: string;
}> = [
  {
    value: 'Match Room',
    label: 'Match Room',
    detail: 'Preserve existing room ambience',
  },
  {
    value: 'Warm Lamp',
    label: 'Warm Lamp',
    detail: '2700K cozy interior glow',
  },
  {
    value: 'Natural Light',
    label: 'Natural Light',
    detail: 'Soft window daylight',
  },
] as const;

export const QUICK_NOTE_CHIPS: readonly string[] = [
  'Center on the main surface',
  'Replace existing item in that spot',
  'Keep power cord tucked out of sight',
  'Angle slightly toward the camera',
  'Keep natural scale relative to nearby furniture',
  'Cast subtle contact shadow on surface',
] as const;

export const MAX_SHORTLIST_ITEMS = 4;
export const MIN_COMPARE_ITEMS = 2;
export const MAX_ROOM_IMAGE_SIDE = 1400;
