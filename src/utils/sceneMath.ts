import type {
  LightingMood,
  PlacementOption,
  PlacementPin,
  ProductDimensionsCm,
  ProductItem,
  ProductVariant,
  SceneSettings,
  SupportedAspectRatio,
} from '../types/studio';
import { MAX_ROOM_IMAGE_SIDE, MAX_SHORTLIST_ITEMS } from '../types/studio.js';

const ASPECT_RATIO_CANDIDATES: ReadonlyArray<{
  label: SupportedAspectRatio;
  ratio: number;
}> = [
  { label: '1:1', ratio: 1 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '9:16', ratio: 9 / 16 },
  { label: '16:9', ratio: 16 / 9 },
];

/**
 * Matches an image's width & height to the nearest Gemini-supported aspect ratio.
 */
export function chooseNearestAspectRatio(
  width: number,
  height: number
): SupportedAspectRatio {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '4:3';
  }
  const actual = width / height;
  let best: SupportedAspectRatio = '4:3';
  let minDiff = Number.POSITIVE_INFINITY;

  for (const candidate of ASPECT_RATIO_CANDIDATES) {
    // Compare in log-space so portrait/landscape ratios are symmetrically weighed
    const diff = Math.abs(Math.log(actual / candidate.ratio));
    if (diff < minDiff) {
      minDiff = diff;
      best = candidate.label;
    }
  }
  return best;
}

/**
 * Computes proportional resized dimensions so the longest side is at most maxSide (1400px),
 * without ever upscaling smaller images.
 */
export function computeResizedDimensions(
  originalWidth: number,
  originalHeight: number,
  maxSide: number = MAX_ROOM_IMAGE_SIDE
): { width: number; height: number; wasResized: boolean } {
  const safeW = Math.max(1, Math.round(originalWidth));
  const safeH = Math.max(1, Math.round(originalHeight));
  const longest = Math.max(safeW, safeH);

  if (longest <= maxSide) {
    return { width: safeW, height: safeH, wasResized: false };
  }

  const scale = maxSide / longest;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
    wasResized: true,
  };
}

/**
 * Parses a price string or numeric value into a finite number or null.
 */
export function parsePriceNumeric(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value && typeof value === 'object') {
    const rec = value as Record<string, unknown>;
    if ('amount' in rec) return parsePriceNumeric(rec.amount);
    if ('min' in rec) return parsePriceNumeric(rec.min);
    if ('value' in rec) return parsePriceNumeric(rec.value);
  }
  return null;
}

export function formatPrice(
  amount: number | null,
  currency: string = 'USD',
  fallback: string = 'Price unavailable'
): string {
  if (amount === null || !Number.isFinite(amount)) {
    return fallback;
  }
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(amount % 1 === 0 ? 0 : 2)}`;
  }
}

export function getActiveVariant(product: ProductItem): ProductVariant | undefined {
  if (!product.variants.length) return undefined;
  if (product.selectedVariantId) {
    const found = product.variants.find((v) => v.id === product.selectedVariantId);
    if (found) return found;
  }
  return product.variants[0];
}

export function getEffectivePrice(product: ProductItem): {
  display: string;
  numeric: number | null;
} {
  const variant = getActiveVariant(product);
  if (variant && variant.priceNumeric !== null) {
    return { display: variant.price, numeric: variant.priceNumeric };
  }
  return { display: product.price, numeric: product.priceNumeric };
}

export function getReferenceImageUrl(product: ProductItem): string {
  const idx = Math.max(0, Math.min(product.selectedImageIndex, product.images.length - 1));
  return product.images[idx] ?? product.images[0] ?? '';
}

export function findLowestPriceId(products: ProductItem[]): string | null {
  let lowestId: string | null = null;
  let lowestVal = Number.POSITIVE_INFINITY;
  let pricedCount = 0;

  for (const product of products) {
    const { numeric } = getEffectivePrice(product);
    if (numeric !== null && numeric > 0) {
      pricedCount += 1;
      if (numeric < lowestVal) {
        lowestVal = numeric;
        lowestId = product.id;
      }
    }
  }
  return pricedCount >= 2 ? lowestId : null;
}

export function canAddProduct(currentCount: number): boolean {
  return currentCount < MAX_SHORTLIST_ITEMS;
}

export function createSettingsSignature(
  settings: SceneSettings,
  roomId: string,
  imageUrl: string,
  variantId?: string
): string {
  return [
    roomId,
    imageUrl,
    variantId ?? '',
    settings.placement,
    settings.lightingMood,
    settings.customNotes.trim(),
  ].join('|');
}

export function appendQuickNote(current: string, chip: string): string {
  const trimmed = current.trim();
  if (!trimmed) return chip;
  if (trimmed.toLowerCase().includes(chip.toLowerCase())) {
    return trimmed;
  }
  const sep = /[.!?]$/.test(trimmed) ? ' ' : '. ';
  return `${trimmed}${sep}${chip}`;
}

function dedupeUrls(urls: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('data:image/')) {
      seen.add(trimmed);
      out.push(trimmed);
    }
  }
  return out;
}

function extractImageUrlFromUnknown(item: unknown): string | undefined {
  if (typeof item === 'string') return item;
  if (item && typeof item === 'object') {
    const rec = item as Record<string, unknown>;
    const candidate = rec.url ?? rec.src ?? rec.originalSrc ?? rec.transformedSrc ?? rec.image_url ?? rec.imageUrl;
    if (typeof candidate === 'string') return candidate;
  }
  return undefined;
}

/**
 * Normalizes a raw Shopify Shop MCP product payload (search_catalog, lookup_catalog, or get_product)
 * into our unified ProductItem shape.
 */
export function normalizeShopifyProduct(raw: unknown, fallbackIndex: number = 0): ProductItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;

  const title =
    (typeof rec.title === 'string' && rec.title.trim()) ||
    (typeof rec.name === 'string' && rec.name.trim()) ||
    '';
  if (!title) return null;

  const id = String(
    rec.product_id ?? rec.id ?? rec.upid ?? rec.gid ?? `shopify-${fallbackIndex}-${Date.now()}`
  );

  const shopObj = (rec.shop && typeof rec.shop === 'object' ? rec.shop : {}) as Record<string, unknown>;
  const store =
    (typeof shopObj.name === 'string' && shopObj.name.trim()) ||
    (typeof rec.shop_name === 'string' && rec.shop_name.trim()) ||
    (typeof rec.store === 'string' && rec.store.trim()) ||
    (typeof rec.vendor === 'string' && rec.vendor.trim()) ||
    'Shopify Store';

  const brand =
    (typeof rec.brand === 'string' && rec.brand.trim()) ||
    (typeof rec.vendor === 'string' && rec.vendor.trim()) ||
    store;

  const priceRange = (rec.price_range && typeof rec.price_range === 'object'
    ? rec.price_range
    : rec.priceRange && typeof rec.priceRange === 'object'
      ? rec.priceRange
      : {}) as Record<string, unknown>;

  const currency =
    (typeof rec.currency === 'string' && rec.currency) ||
    (typeof priceRange.currency === 'string' && priceRange.currency) ||
    (typeof (priceRange.min as Record<string, unknown> | undefined)?.currency === 'string'
      ? String((priceRange.min as Record<string, unknown>).currency)
      : 'USD');

  const rawPrice =
    rec.price ??
    priceRange.min ??
    (priceRange.minVariantPrice as Record<string, unknown> | undefined)?.amount ??
    rec.min_price;
  const priceNumeric = parsePriceNumeric(rawPrice);
  const priceDisplay =
    priceNumeric !== null
      ? formatPrice(priceNumeric, currency)
      : typeof rawPrice === 'string' && rawPrice.trim()
        ? rawPrice.trim()
        : 'Price unavailable';

  const rawImages: Array<string | undefined> = [];
  if (Array.isArray(rec.media)) {
    for (const m of rec.media) rawImages.push(extractImageUrlFromUnknown(m));
  }
  if (Array.isArray(rec.images)) {
    for (const img of rec.images) rawImages.push(extractImageUrlFromUnknown(img));
  }
  rawImages.push(
    extractImageUrlFromUnknown(rec.image),
    extractImageUrlFromUnknown(rec.featured_image),
    extractImageUrlFromUnknown(rec.featuredImage),
    extractImageUrlFromUnknown(rec.image_url),
    extractImageUrlFromUnknown(rec.thumbnail)
  );

  const variants: ProductVariant[] = [];
  const rawVariants = Array.isArray(rec.variants) ? rec.variants : [];
  rawVariants.forEach((v, idx) => {
    if (!v || typeof v !== 'object') return;
    const vRec = v as Record<string, unknown>;
    const vId = String(vRec.id ?? vRec.variant_id ?? `${id}-v${idx}`);
    const vTitle =
      (typeof vRec.title === 'string' && vRec.title.trim()) ||
      (typeof vRec.display_name === 'string' && vRec.display_name.trim()) ||
      (typeof vRec.name === 'string' && vRec.name.trim()) ||
      `Option ${idx + 1}`;
    const vPriceNum = parsePriceNumeric(vRec.price ?? vRec.amount ?? priceNumeric);
    const vCurrency = (typeof vRec.currency === 'string' && vRec.currency) || currency;
    const vImg =
      extractImageUrlFromUnknown(vRec.image) ??
      extractImageUrlFromUnknown(vRec.image_url) ??
      extractImageUrlFromUnknown(vRec.media);
    if (vImg) rawImages.push(vImg);

    const options: Record<string, string> = {};
    if (Array.isArray(vRec.options)) {
      vRec.options.forEach((opt) => {
        if (opt && typeof opt === 'object') {
          const o = opt as Record<string, unknown>;
          if (typeof o.name === 'string' && typeof o.value === 'string') {
            options[o.name] = o.value;
          }
        }
      });
    } else if (vRec.options && typeof vRec.options === 'object') {
      for (const [k, val] of Object.entries(vRec.options as Record<string, unknown>)) {
        if (typeof val === 'string') options[k] = val;
      }
    }

    const available =
      typeof vRec.available === 'boolean'
        ? vRec.available
        : typeof vRec.available_for_sale === 'boolean'
          ? vRec.available_for_sale
          : typeof vRec.in_stock === 'boolean'
            ? vRec.in_stock
            : true;

    variants.push({
      id: vId,
      title: vTitle,
      sku: typeof vRec.sku === 'string' ? vRec.sku : undefined,
      price: formatPrice(vPriceNum, vCurrency, priceDisplay),
      priceNumeric: vPriceNum,
      currency: vCurrency,
      available,
      imageUrl: vImg,
      options: Object.keys(options).length ? options : undefined,
    });
  });

  const images = dedupeUrls(rawImages);

  const ratingObj = (rec.rating && typeof rec.rating === 'object' ? rec.rating : {}) as Record<
    string,
    unknown
  >;
  const ratingVal =
    typeof rec.rating === 'number'
      ? rec.rating
      : typeof ratingObj.rating === 'number'
        ? ratingObj.rating
        : typeof ratingObj.average === 'number'
          ? ratingObj.average
          : typeof rec.average_rating === 'number'
            ? rec.average_rating
            : null;
  const reviewCountVal =
    typeof ratingObj.count === 'number'
      ? ratingObj.count
      : typeof rec.review_count === 'number'
        ? rec.review_count
        : typeof rec.reviews_count === 'number'
          ? rec.reviews_count
          : null;

  const availableFlag =
    typeof rec.available === 'boolean'
      ? rec.available
      : typeof rec.available_for_sale === 'boolean'
        ? rec.available_for_sale
        : variants.length > 0
          ? variants.some((v) => v.available)
          : true;

  const availability =
    typeof rec.availability === 'string' && rec.availability.trim()
      ? rec.availability.trim()
      : availableFlag
        ? 'In Stock'
        : 'Out of Stock';

  const features: string[] = [];
  if (Array.isArray(rec.features)) {
    for (const f of rec.features) {
      if (typeof f === 'string' && f.trim()) features.push(f.trim());
    }
  } else if (Array.isArray(rec.tags)) {
    for (const t of rec.tags.slice(0, 5)) {
      if (typeof t === 'string' && t.trim()) features.push(t.trim());
    }
  }
  const description =
    typeof rec.description === 'string'
      ? rec.description.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      : undefined;

  if (features.length === 0 && description) {
    const sentences = description
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 12 && s.length <= 120)
      .slice(0, 3);
    features.push(...sentences);
  }

  const url =
    (typeof rec.url === 'string' && rec.url) ||
    (typeof rec.product_url === 'string' && rec.product_url) ||
    (typeof rec.online_store_url === 'string' && rec.online_store_url) ||
    (typeof shopObj.url === 'string' && shopObj.url) ||
    undefined;

  return {
    id,
    source: 'shopify',
    title,
    brand,
    store,
    price: priceDisplay,
    priceNumeric,
    currency,
    availability,
    rating: ratingVal !== null ? Math.round(ratingVal * 10) / 10 : null,
    reviewCount: reviewCountVal,
    url,
    description,
    features,
    images,
    selectedImageIndex: 0,
    variants,
    selectedVariantId: variants[0]?.id,
  };
}

/**
 * Extracts an array of normalized ProductItem objects from various Shopify MCP JSON payloads.
 */
export function normalizeShopifySearchResponse(payload: unknown): ProductItem[] {
  if (!payload) return [];
  let candidates: unknown[] = [];

  if (Array.isArray(payload)) {
    candidates = payload;
  } else if (typeof payload === 'object') {
    const rec = payload as Record<string, unknown>;
    if (Array.isArray(rec.products)) candidates = rec.products;
    else if (Array.isArray(rec.offers)) candidates = rec.offers;
    else if (Array.isArray(rec.items)) candidates = rec.items;
    else if (Array.isArray(rec.results)) candidates = rec.results;
    else if (rec.product && typeof rec.product === 'object') candidates = [rec.product];
    else if (typeof rec.title === 'string' || typeof rec.name === 'string') candidates = [rec];
  }

  const items: ProductItem[] = [];
  candidates.forEach((entry, idx) => {
    const normalized = normalizeShopifyProduct(entry, idx);
    if (normalized) items.push(normalized);
  });
  return items;
}

export function clampPlacementPin(pin: PlacementPin): PlacementPin {
  const safeX = Number.isFinite(pin.xPercent) ? pin.xPercent : 50;
  const safeY = Number.isFinite(pin.yPercent) ? pin.yPercent : 72;
  return {
    xPercent: Math.round(Math.max(4, Math.min(96, safeX))),
    yPercent: Math.round(Math.max(10, Math.min(96, safeY))),
  };
}

export function describePlacementPin(pin: PlacementPin): string {
  const clamped = clampPlacementPin(pin);
  const horiz =
    clamped.xPercent < 28
      ? 'far left'
      : clamped.xPercent < 44
        ? 'left-center'
        : clamped.xPercent <= 56
          ? 'horizontal center'
          : clamped.xPercent <= 72
            ? 'right-center'
            : 'far right';

  const vert =
    clamped.yPercent < 45
      ? 'upper-mid depth'
      : clamped.yPercent < 68
        ? 'midground floor'
        : 'foreground floor';

  return `x=${clamped.xPercent}% from left edge, y=${clamped.yPercent}% from top edge (${horiz}, ${vert})`;
}

export interface RoomRenderPromptParams {
  productName: string;
  productBrand?: string;
  variantLabel?: string;
  placement: PlacementOption;
  lightingMood: LightingMood;
  customNotes?: string;
  placementPin?: PlacementPin | null;
  dimensionsCm?: ProductDimensionsCm | null;
}

/**
 * Constructs a strict interior photo-editing & compositing prompt for gemini-3.1-flash-lite-image.
 * Enforces pixel-faithful background preservation (zero scene drift) and physically grounded placement.
 */
export function buildRoomRenderPrompt(params: RoomRenderPromptParams): string {
  const lightingInstruction: Record<LightingMood, string> = {
    'Match Room':
      'Match the exact existing ambient lighting, color temperature, shadow direction, shadow softness, exposure, and camera sensor grain of Image 1. Do NOT re-light or color-grade the room.',
    'Warm Lamp':
      'Apply a warm 2700K cozy interior glow around the inserted product and immediate floor surface, casting soft amber highlights and realistic warm shadows while keeping the rest of Image 1 unchanged.',
    'Natural Light':
      'Illuminate the inserted product with soft natural window daylight matching Image 1’s window direction, with soft-edged contact shadows while keeping the rest of Image 1 unchanged.',
  };

  const placementInstruction: Record<PlacementOption, string> = {
    'Smart Auto':
      'Place the product on the clearest unobstructed open floor area that matches the user’s stated spot in Image 1. NEVER move, erase, or replace existing furniture, bags, doors, people, or fixtures.',
    'Desk / Table':
      'Place the product neatly on the desk or table surface visible in Image 1, grounded with accurate perspective and scale.',
    'Coffee Table':
      'Place the product naturally on the coffee table surface in the foreground of Image 1, grounded with accurate scale and realistic contact shadow.',
    'Floor / Corner':
      'Place the product standing firmly on the open floor in the indicated corner or corridor area of Image 1, with all legs resting flat on the floor plane and angled naturally into the room.',
    'Shelf / Bookcase':
      'Place the product neatly on a visible shelf, sideboard, console, or bookcase ledge in Image 1.',
    Nightstand:
      'Place the product neatly on the nightstand or side table surface in Image 1 with natural proportions.',
    Countertop:
      'Place the product neatly on the countertop or console surface in Image 1 with accurate reflections and grounding.',
    'Wall Mounted':
      'Mount the product cleanly on the main visible wall in Image 1 at realistic eye-level height with subtle wall shadows.',
  };

  const productDescriptor = [
    params.productBrand ? `${params.productBrand} ` : '',
    params.productName,
    params.variantLabel ? ` (${params.variantLabel})` : '',
  ]
    .join('')
    .trim();

  const lines = [
    'You are a precision photographic retoucher performing strict in-place object insertion.',
    'IMAGE 1 is the LOCKED base room photograph. IMAGE 2 is the studio product reference of the exact item to insert.',
    `TASK: Insert ONLY the single "${productDescriptor}" from Image 2 into Image 1 as a seamless, physically accurate photographic edit.`,
    '',
    'NON-NEGOTIABLE BACKGROUND LOCK (ZERO SCENE DRIFT):',
    '1. Treat Image 1 as a locked camera photograph. Preserve the EXACT framing, crop, lens focal length, camera angle, horizon line, and aspect ratio of Image 1 — do NOT zoom, pan, tilt, or recompose.',
    '2. Keep EVERY pixel outside the inserted product and its immediate contact shadow IDENTICAL to Image 1: do NOT alter, redraw, repaint, move, or remove any walls, doors, windows, floor planks/tiles, rugs, signs, curtains, furniture, bags, stanchions, clutter, or people visible in Image 1.',
    '3. Keep Image 1’s exact white balance, exposure, contrast, and background sharpness completely unchanged.',
    '',
    'PRODUCT FIDELITY:',
    `4. Faithfully reproduce the exact silhouette, proportions, leg geometry, upholstery/wood texture, color, and finish of "${productDescriptor}" from Image 2. Do not invent extra decor, pillows, lamps, or rugs.`,
    '',
    'EXACT PLACEMENT & 3D GROUNDING:',
  ];

  if (params.placementPin) {
    const pinDesc = describePlacementPin(params.placementPin);
    lines.push(
      `5. EXACT TARGET ANCHOR: Place the base/floor-contact center of "${productDescriptor}" directly at ${pinDesc} in Image 1. All legs/base points MUST rest firmly on the real floor plane at that exact anchor (never floating, never pushed into a wall, never relocated to another part of the room).`
    );
  } else {
    lines.push(`5. PLACEMENT ZONE: ${placementInstruction[params.placement]}`);
  }

  if (
    params.dimensionsCm &&
    params.dimensionsCm.heightCm > 0 &&
    params.dimensionsCm.widthCm > 0
  ) {
    lines.push(
      `6. REAL-WORLD PHYSICAL SCALE: The exact product dimensions are Height ${params.dimensionsCm.heightCm} cm × Width ${params.dimensionsCm.widthCm} cm × Depth ${params.dimensionsCm.depthCm} cm. Calibrate its rendered size accurately against real architectural cues in Image 1 (standard interior door ≈ 205 cm tall, window sill ≈ 65–85 cm, table ≈ 74 cm, baseboard ≈ 10–12 cm) so it is neither oversized nor miniature.`
    );
  } else {
    lines.push(
      '6. REAL-WORLD PHYSICAL SCALE: Calibrate the product’s size accurately against doors, baseboards, window sills, and adjacent furniture in Image 1.'
    );
  }

  lines.push(
    '7. PERSPECTIVE, CONTACT SHADOWS & OCCLUSION: Align the chair seat and legs with the 3D floor vanishing lines of Image 1. Ground every floor-touching leg with crisp dark ambient occlusion directly beneath the feet plus a soft directional cast shadow matching existing shadows in Image 1. If any foreground element in Image 1 (e.g., stanchion, table edge, wall corner, foreground furniture) sits closer to the camera than the placement spot, keep that foreground element cleanly in front of (occluding) the chair.',
    `8. LIGHTING MATCH: ${lightingInstruction[params.lightingMood]}`
  );

  if (params.customNotes && params.customNotes.trim()) {
    lines.push(`9. ROOM-SPECIFIC PLACEMENT DIRECTION: ${params.customNotes.trim()}`);
  }

  lines.push(
    '',
    'Output ONLY the edited photograph matching Image 1 with no text, markers, pins, borders, or watermarks.'
  );
  return lines.join('\n');
}
