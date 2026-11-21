import type {
  AlternativeRecommendation,
  ConflictItem,
  ContextFitAnalysis,
  MerchantChair,
  ParsedConstraint,
  UserMeasurements,
} from '../types/contextFit';

/**
 * Deterministic hard-constraint evaluation backed strictly by verified catalog fields
 * and user-supplied numeric measurements. Never fabricates unmeasured dimensions.
 */
export function evaluateDeterministicConstraints(
  chair: MerchantChair,
  measurements: UserMeasurements
): {
  conflicts: ConflictItem[];
  confirmedFacts: string[];
} {
  const conflicts: ConflictItem[] = [];
  const confirmedFacts: string[] = [
    `Dimensions: H ${chair.dimensions.heightCm} × W ${chair.dimensions.widthCm} × D ${chair.dimensions.depthCm} cm (${chair.backProfile}, ${chair.visualWeight}).`,
    `Price: ${chair.price} (${chair.availability}).`,
  ];

  if (!chair.inStock) {
    conflicts.push({
      title: 'Inventory constraint',
      claim: `${chair.name} is currently out of stock.`,
      productFact: `Catalog availability: ${chair.availability}.`,
      status: 'confirmed_conflict',
      missingData: [],
    });
  }

  if (
    typeof measurements.maxBudgetUsd === 'number' &&
    Number.isFinite(measurements.maxBudgetUsd) &&
    measurements.maxBudgetUsd > 0
  ) {
    if (chair.priceNumeric > measurements.maxBudgetUsd) {
      const overBy = Math.round(chair.priceNumeric - measurements.maxBudgetUsd);
      conflicts.push({
        title: 'Budget ceiling exceeded',
        claim: `${chair.name} (${chair.price}) exceeds your $${measurements.maxBudgetUsd} budget ceiling by $${overBy}.`,
        productFact: `Verified catalog price: ${chair.price}.`,
        status: 'confirmed_conflict',
        missingData: [],
      });
    } else {
      confirmedFacts.push(
        `Budget check passed: ${chair.price} is within your $${measurements.maxBudgetUsd} ceiling.`
      );
    }
  }

  if (
    typeof measurements.windowSillHeightCm === 'number' &&
    Number.isFinite(measurements.windowSillHeightCm) &&
    measurements.windowSillHeightCm > 0
  ) {
    if (chair.dimensions.backHeightCm > measurements.windowSillHeightCm) {
      const overlapCm = Math.round(
        chair.dimensions.backHeightCm - measurements.windowSillHeightCm
      );
      conflicts.push({
        title: 'Confirmed window sill overlap',
        claim: `If placed directly in front of the window, the ${chair.dimensions.backHeightCm} cm backrest rises ${overlapCm} cm above your ${measurements.windowSillHeightCm} cm window sill.`,
        productFact: `Verified back height: ${chair.dimensions.backHeightCm} cm (${chair.visualWeight}).`,
        status: 'confirmed_conflict',
        missingData: ['Exact distance from window frame to planned placement'],
      });
    } else {
      confirmedFacts.push(
        `Window sill clearance confirmed: ${chair.dimensions.backHeightCm} cm backrest sits below your ${measurements.windowSillHeightCm} cm sill.`
      );
    }
  }

  if (
    typeof measurements.availableWidthCm === 'number' &&
    Number.isFinite(measurements.availableWidthCm) &&
    measurements.availableWidthCm > 0
  ) {
    if (chair.dimensions.widthCm > measurements.availableWidthCm) {
      const overCm = Math.round(chair.dimensions.widthCm - measurements.availableWidthCm);
      conflicts.push({
        title: 'Confirmed width clearance conflict',
        claim: `Chair width (${chair.dimensions.widthCm} cm) exceeds your available ${measurements.availableWidthCm} cm space by ${overCm} cm.`,
        productFact: `Verified product width: ${chair.dimensions.widthCm} cm.`,
        status: 'confirmed_conflict',
        missingData: [],
      });
    } else {
      const margin = Math.round(measurements.availableWidthCm - chair.dimensions.widthCm);
      confirmedFacts.push(
        `Width clearance confirmed: ${chair.dimensions.widthCm} cm chair leaves ${margin} cm horizontal margin in your ${measurements.availableWidthCm} cm space.`
      );
    }
  }

  return { conflicts, confirmedFacts };
}

/**
 * Ensures every recommended alternative strictly matches a real product ID in the
 * merchant's catalog and excludes the currently viewed chair.
 */
export function groundAlternativesInCatalog(
  rawAlternatives: AlternativeRecommendation[],
  currentChairId: string,
  catalog: MerchantChair[],
  measurements: UserMeasurements = {}
): AlternativeRecommendation[] {
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const valid: AlternativeRecommendation[] = [];

  for (const alt of rawAlternatives) {
    if (!alt || typeof alt.productId !== 'string') continue;
    if (alt.productId === currentChairId) continue;
    if (seen.has(alt.productId)) continue;
    const chair = catalogById.get(alt.productId);
    if (!chair || !chair.inStock) continue;
    // Enforce hard budget constraint if user explicitly specified one
    if (
      typeof measurements.maxBudgetUsd === 'number' &&
      measurements.maxBudgetUsd > 0 &&
      chair.priceNumeric > measurements.maxBudgetUsd
    ) {
      continue;
    }
    seen.add(alt.productId);
    valid.push(alt);
    if (valid.length === 2) break;
  }

  // If fewer than 2 valid catalog alternatives remained (e.g., after strict budget filter),
  // fill deterministically from eligible same-store chairs.
  if (valid.length < 2) {
    const fallbackCandidates = catalog.filter((c) => {
      if (c.id === currentChairId || seen.has(c.id) || !c.inStock) return false;
      if (
        typeof measurements.maxBudgetUsd === 'number' &&
        measurements.maxBudgetUsd > 0 &&
        c.priceNumeric > measurements.maxBudgetUsd
      ) {
        return false;
      }
      return true;
    });

    for (const candidate of fallbackCandidates) {
      if (valid.length >= 2) break;
      seen.add(candidate.id);
      valid.push({
        productId: candidate.id,
        headline: `${candidate.backProfile} · ${candidate.dimensions.heightCm} cm H × ${candidate.dimensions.widthCm} cm W`,
        reason: `Verified same-store option at ${candidate.price} with ${candidate.visualWeight.toLowerCase()} visual profile.`,
        gained: `${candidate.dimensions.heightCm} cm height and ${candidate.dimensions.widthCm} cm width for easier fit.`,
        tradeoff: `Different silhouette and upholstery (${candidate.material}).`,
      });
    }
  }

  return valid;
}

/**
 * Merges deterministic verified conflicts ahead of visual inferences while avoiding duplicates.
 */
export function mergeDeterministicAndModelConflicts(
  deterministicConflicts: ConflictItem[],
  modelConflicts: ConflictItem[]
): ConflictItem[] {
  const merged: ConflictItem[] = [...deterministicConflicts];
  const existingTitles = new Set(deterministicConflicts.map((c) => c.title.toLowerCase()));

  for (const mc of modelConflicts) {
    const key = mc.title.toLowerCase();
    // Skip vague visual window conflict if we already computed a confirmed sill overlap
    if (
      deterministicConflicts.some((dc) => dc.title.toLowerCase().includes('window sill')) &&
      key.includes('window')
    ) {
      continue;
    }
    if (
      deterministicConflicts.some((dc) => dc.title.toLowerCase().includes('budget')) &&
      key.includes('budget')
    ) {
      continue;
    }
    if (!existingTitles.has(key)) {
      existingTitles.add(key);
      merged.push(mc);
    }
  }
  return merged;
}

/**
 * Extracts explicit numeric budget or cm measurements mentioned in a natural-language user turn
 * (e.g. "under $650", "sill is 62 cm").
 */
export function parseMeasurementsFromText(
  text: string,
  existing: UserMeasurements = {}
): UserMeasurements {
  const next: UserMeasurements = { ...existing };

  const budgetMatch = text.match(/(?:under|below|max(?:imum)?|budget(?:\s+of)?)\s*\$?\s*(\d{3,4})/i);
  if (budgetMatch) {
    const val = Number(budgetMatch[1]);
    if (Number.isFinite(val) && val >= 100 && val <= 20000) {
      next.maxBudgetUsd = val;
    }
  }

  const sillMatch = text.match(/sill(?:\s+height)?(?:\s+is)?\s*(\d{2,3})\s*cm/i);
  if (sillMatch) {
    const val = Number(sillMatch[1]);
    if (Number.isFinite(val) && val >= 20 && val <= 200) {
      next.windowSillHeightCm = val;
    }
  }

  const widthMatch = text.match(/(?:wall|corner|space|width)(?:\s+width)?(?:\s+is)?\s*(\d{2,3})\s*cm/i);
  if (widthMatch) {
    const val = Number(widthMatch[1]);
    if (Number.isFinite(val) && val >= 40 && val <= 500) {
      next.availableWidthCm = val;
    }
  }

  return next;
}

export function ensureParsedConstraints(
  modelConstraints: ParsedConstraint[],
  userGoal: string,
  measurements: UserMeasurements = {}
): ParsedConstraint[] {
  if (modelConstraints.length > 0) {
    return modelConstraints;
  }

  const parsed: ParsedConstraint[] = [];
  const lower = userGoal.toLowerCase();

  if (/(window|light|daylight|view|block|sightline)/i.test(lower)) {
    parsed.push({
      type: 'spatial',
      name: 'Window sightline & daylight',
      detail: 'Avoid obstructing the window glass or incoming daylight.',
      priority: 'high',
    });
  }

  if (/(small|compact|tight|corner|cramped|space|narrow)/i.test(lower)) {
    parsed.push({
      type: 'spatial',
      name: 'Compact footprint',
      detail: 'Preserve open floor clearance and circulation in a compact room.',
      priority: 'high',
    });
  }

  if (/(high[- ]?back|headrest|wing)/i.test(lower)) {
    parsed.push({
      type: 'soft',
      name: 'High-back preference',
      detail: 'Retain high-back silhouette and upper-back support if feasible.',
      priority: 'high',
    });
  } else if (/(read|reading|lounge|comfort)/i.test(lower)) {
    parsed.push({
      type: 'soft',
      name: 'Reading comfort',
      detail: 'Provide comfortable upright or angled seating for reading.',
      priority: 'medium',
    });
  }

  if (typeof measurements.maxBudgetUsd === 'number' && measurements.maxBudgetUsd > 0) {
    parsed.push({
      type: 'hard',
      name: 'Budget ceiling',
      detail: `Stay at or below $${measurements.maxBudgetUsd}.`,
      priority: 'high',
    });
  }

  if (typeof measurements.windowSillHeightCm === 'number' && measurements.windowSillHeightCm > 0) {
    parsed.push({
      type: 'hard',
      name: 'Verified window sill height',
      detail: `User-measured sill height: ${measurements.windowSillHeightCm} cm.`,
      priority: 'high',
    });
  }

  if (typeof measurements.availableWidthCm === 'number' && measurements.availableWidthCm > 0) {
    parsed.push({
      type: 'hard',
      name: 'Verified available width',
      detail: `User-measured wall/corner width: ${measurements.availableWidthCm} cm.`,
      priority: 'high',
    });
  }

  if (parsed.length === 0 && userGoal.trim()) {
    parsed.push({
      type: 'soft',
      name: 'Primary shopping goal',
      detail: userGoal.trim(),
      priority: 'high',
    });
  }

  return parsed.slice(0, 5);
}

/**
 * Safety net for photo-only Turn 1 responses: if the LLM produced a conflict verdict
 * but omitted potentialConflicts entries, synthesize an honest, catalog-grounded
 * unverified_spatial_inference item ONLY when a genuine height/weight/width tension exists.
 */
export function ensureSpatialConflictFallback(
  mergedConflicts: ConflictItem[],
  chair: MerchantChair,
  userGoal: string,
  measurements: UserMeasurements = {}
): ConflictItem[] {
  if (mergedConflicts.length > 0) {
    return mergedConflicts;
  }

  const fallback: ConflictItem[] = [];
  const lower = userGoal.toLowerCase();
  const wantsWindowClearance = /(window|light|daylight|view|block|sightline)/i.test(lower);
  const sillAlreadyVerifiedSafe =
    typeof measurements.windowSillHeightCm === 'number' &&
    measurements.windowSillHeightCm > 0 &&
    chair.dimensions.backHeightCm <= measurements.windowSillHeightCm;

  if (
    wantsWindowClearance &&
    !sillAlreadyVerifiedSafe &&
    (chair.dimensions.backHeightCm >= 85 || chair.visualWeight.toLowerCase().includes('solid'))
  ) {
    fallback.push({
      title: 'Potential window & daylight obstruction',
      claim: `At ${chair.dimensions.backHeightCm} cm tall with a ${chair.visualWeight.toLowerCase()} profile, ${chair.name} may rise above the lower window sill and partially block incoming light if placed near the window.`,
      productFact: `Verified catalog height: ${chair.dimensions.heightCm} cm (${chair.backProfile}, ${chair.visualWeight}).`,
      status: 'unverified_spatial_inference',
      missingData: ['Window sill height (cm)', 'Exact placement distance from window frame'],
    });
  }

  const wantsCompactFit = /(small|compact|tight|corner|cramped|space|narrow|reading)/i.test(lower);
  const widthAlreadyVerifiedSafe =
    typeof measurements.availableWidthCm === 'number' &&
    measurements.availableWidthCm > 0 &&
    chair.dimensions.widthCm <= measurements.availableWidthCm;

  if (wantsCompactFit && !widthAlreadyVerifiedSafe && chair.dimensions.widthCm >= 78) {
    fallback.push({
      title: 'Unverified corner footprint & circulation',
      claim: `A ${chair.dimensions.widthCm} cm wide × ${chair.dimensions.depthCm} cm deep footprint may feel tight against adjacent walls or furniture in a compact corner.`,
      productFact: `Verified catalog footprint: W ${chair.dimensions.widthCm} × D ${chair.dimensions.depthCm} cm.`,
      status: 'unverified_spatial_inference',
      missingData: ['Available wall/corner width (cm)', 'Clearance to adjacent furniture'],
    });
  }

  return fallback;
}

export function humanizeMissingDataLabel(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // If already contains spaces and looks human-written, preserve capitalization cleanly
  if (/\s/.test(trimmed) && !/[a-z][A-Z]/.test(trimmed)) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  }
  const hasCmSuffix = /(?:Cm|_cm)$/i.test(trimmed);
  const withoutSuffix = hasCmSuffix ? trimmed.replace(/(?:Cm|_cm)$/i, '') : trimmed;
  const spaced = withoutSuffix
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .toLowerCase();
  if (!spaced) return trimmed;
  const formatted = spaced.charAt(0).toUpperCase() + spaced.slice(1);
  return hasCmSuffix ? `${formatted} (cm)` : formatted;
}

export function formatEvidenceLabel(status: ConflictItem['status']): string {
  switch (status) {
    case 'confirmed_fact':
      return 'Confirmed fact';
    case 'confirmed_conflict':
      return 'Confirmed conflict';
    case 'visual_inference':
      return 'Visual estimate';
    case 'unverified_spatial_inference':
      return 'Visual estimate';
    case 'needs_measurement':
      return 'Needs measurement';
    default:
      return 'Estimate';
  }
}

export function summarizeAnalysisForHistory(analysis: ContextFitAnalysis): string {
  const altIds = analysis.alternatives.map((a) => a.productId).join(', ');
  return `Turn ${analysis.turnNumber} ("${analysis.userPrompt}"): Verdict="${analysis.verdictHeadline}". Placement="${analysis.placementStrategy.title}". Recommended IDs=[${altIds}].`;
}
