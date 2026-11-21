import { GoogleGenAI, Type } from '@google/genai';
import type {
  AlternativeRecommendation,
  ConflictItem,
  ContextFitAnalysis,
  MerchantChair,
  ParsedConstraint,
  RoomObservation,
  UserMeasurements,
} from '../src/types/contextFit';
import {
  ensureParsedConstraints,
  ensureSpatialConflictFallback,
  evaluateDeterministicConstraints,
  groundAlternativesInCatalog,
  humanizeMissingDataLabel,
  mergeDeterministicAndModelConflicts,
  parseMeasurementsFromText,
} from '../src/utils/contextFitLogic.js';
import { redactSecrets } from './redactSecrets.js';

export const ANALYSIS_MODEL = 'gemini-4-hydrogen';
export const FALLBACK_ANALYSIS_MODEL = 'gemini-3.8-flash';

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseModelJson(raw: string): Record<string, unknown> {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Model JSON was not an object.');
    }
    return parsed as Record<string, unknown>;
  } catch (err) {
    const detail = redactSecrets(err instanceof Error ? err.message : 'invalid JSON').slice(0, 200);
    console.error('[contextfit] model response was not JSON', { detail });
    throw Object.assign(
      new Error('ContextFit analysis model returned a response that was not valid JSON.'),
      { status: 502 }
    );
  }
}

function stripDataUrlPrefix(input: string): { base64: string; mimeType: string } {
  const match = input.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { mimeType: 'image/jpeg', base64: input };
}

function formatCatalogForPrompt(catalog: MerchantChair[], currentChairId: string): string {
  return catalog
    .map((c) => {
      const marker = c.id === currentChairId ? ' [CURRENTLY VIEWED PRODUCT]' : '';
      return [
        `- productId: "${c.id}"${marker}`,
        `  name: ${c.name} | price: ${c.price} ($${c.priceNumeric}) | inStock: ${c.inStock}`,
        `  dimensions: H ${c.dimensions.heightCm} cm × W ${c.dimensions.widthCm} cm × D ${c.dimensions.depthCm} cm (seat H ${c.dimensions.seatHeightCm} cm, back H ${c.dimensions.backHeightCm} cm)`,
        `  profile: ${c.backProfile} | visualWeight: ${c.visualWeight} | material: ${c.material}`,
        `  notes: ${c.description}`,
      ].join('\n');
    })
    .join('\n');
}

const CONTEXTFIT_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    userGoal: {
      type: Type.STRING,
      description: 'Concise 1-sentence summary of the shopper goal.',
    },
    verdictHeadline: {
      type: Type.STRING,
      description:
        'Crisp, non-alarmist editorial headline summarizing the main potential conflict or fit verdict (max 14 words).',
    },
    planRevisionSummary: {
      type: Type.STRING,
      description:
        'Only when revising a previous turn: concise 1-2 sentence explanation of how the plan adapted to the shopper preference change. Empty string on Turn 1.',
    },
    roomObservations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          claim: { type: Type.STRING },
          status: {
            type: Type.STRING,
            description: 'Always "visual_inference" for claims inferred from a single room photo.',
          },
        },
        required: ['claim', 'status'],
      },
    },
    constraints: {
      type: Type.ARRAY,
      description: '2 to 4 structured constraints extracted from the shopper goal and measurements.',
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, description: '"hard", "spatial", or "soft"' },
          name: { type: Type.STRING },
          detail: { type: Type.STRING },
          priority: { type: Type.STRING, description: '"high", "medium", or "low"' },
        },
        required: ['type', 'name', 'detail', 'priority'],
      },
    },
    potentialConflicts: {
      type: Type.ARRAY,
      description:
        '1 to 3 potential spatial, visual, or hard-constraint conflicts. On photo-only analysis without user measurements, still flag likely conflicts using status "unverified_spatial_inference" and list exact missing measurements in missingData.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          claim: { type: Type.STRING },
          productFact: { type: Type.STRING },
          status: {
            type: Type.STRING,
            description:
              'Use "unverified_spatial_inference" or "needs_measurement" for photo-only spatial hypotheses; use "confirmed_conflict" only when grounded in explicit numbers.',
          },
          missingData: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ['title', 'claim', 'productFact', 'status', 'missingData'],
      },
    },
    initialPlacementHint: {
      type: Type.STRING,
      description:
        'Concrete 1-sentence floor placement direction honoring the shopper goal inside this exact room photo, anchored to real visible landmarks (walls, doors, windows, floor edges) and explicitly keeping all existing objects untouched.',
    },
    placementStrategy: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        gained: { type: Type.STRING },
        tradeoff: { type: Type.STRING },
        renderHint: {
          type: Type.STRING,
          description:
            'Concrete 1-sentence visual floor placement instruction for the revised spot anchored to exact visible landmarks in this room photo, specifying orientation and keeping all existing objects untouched.',
        },
      },
      required: ['title', 'description', 'gained', 'tradeoff', 'renderHint'],
    },
    alternatives: {
      type: Type.ARRAY,
      description: 'Exactly 2 alternative products strictly chosen from the provided merchant catalog productIds (never the currently viewed productId).',
      items: {
        type: Type.OBJECT,
        properties: {
          productId: { type: Type.STRING },
          headline: { type: Type.STRING },
          reason: { type: Type.STRING },
          gained: { type: Type.STRING },
          tradeoff: { type: Type.STRING },
        },
        required: ['productId', 'headline', 'reason', 'gained', 'tradeoff'],
      },
    },
    clarifyingQuestion: {
      type: Type.STRING,
      description: 'One focused, practical question asking for the single most helpful missing measurement or placement choice.',
    },
    clarifyingFieldHint: {
      type: Type.STRING,
      description: 'One of: "windowSillHeightCm", "availableWidthCm", "maxBudgetUsd", or "placement".',
    },
  },
  required: [
    'userGoal',
    'verdictHeadline',
    'roomObservations',
    'constraints',
    'potentialConflicts',
    'initialPlacementHint',
    'placementStrategy',
    'alternatives',
    'clarifyingQuestion',
  ],
};

export interface AnalyzeContextFitInput {
  roomImageBase64: string;
  roomMimeType?: string;
  currentChair: MerchantChair;
  catalog: MerchantChair[];
  userGoal: string;
  measurements?: UserMeasurements;
  turnNumber?: number;
  previousTurnsSummary?: string[];
  followUpMessage?: string;
}

export async function runContextFitAnalysis(
  input: AnalyzeContextFitInput
): Promise<{
  analysis: ContextFitAnalysis;
  resolvedMeasurements: UserMeasurements;
}> {
  const ai = getGeminiClient();
  const roomImg = stripDataUrlPrefix(input.roomImageBase64);
  if (!roomImg.base64) {
    throw new Error('A room photograph is required for ContextFit spatial analysis.');
  }

  const turnNumber = input.turnNumber ?? 1;
  const activeUserText = input.followUpMessage?.trim() || input.userGoal.trim();
  const mergedMeasurements = parseMeasurementsFromText(
    `${input.userGoal} ${input.followUpMessage ?? ''}`,
    input.measurements ?? {}
  );

  const deterministic = evaluateDeterministicConstraints(input.currentChair, mergedMeasurements);

  const systemInstruction = [
    'You are ContextFit, a constraint-aware shopping decision agent embedded inside a single Shopify furniture merchant storefront.',
    'Your job is NOT to invent fit scores or write long essays. Answer two clear, calm questions: "Is It Fit?" and "How to Make It Work".',
    'STRICT TRUST & CONCISENESS RULES:',
    '1. Never invent dimensions, prices, materials, or stock. Use ONLY the verified catalog fields provided.',
    '2. A single room photograph CANNOT establish real-world measurements. Always treat spatial observations from the photo as "visual_inference" or "unverified_spatial_inference" and list exact missing measurements in plain human English (e.g., "Window sill height (cm)" — NEVER camelCase variable names).',
    '3. Never collapse reasoning into a numeric fit score.',
    '4. KEEP COPY CRISP AND SCANNABLE (never text-heavy):',
    '   - verdictHeadline: <= 10 words, direct and balanced.',
    '   - roomObservations: 2–3 short bullet phrases (<= 12 words each).',
    '   - constraints: 2–3 concise tags ("name" 2–3 words, "detail" <= 10 words).',
    '   - potentialConflicts: 1–2 highest-impact items ("title" <= 6 words, "claim" <= 16 words, "productFact" concise metric like "H 106 cm · Solid back"). Never leave empty if your verdictHeadline flags a fit risk.',
    '   - placementStrategy & alternatives: 1 short sentence for description/reason (<= 16 words), punchy "gained" (<= 10 words), punchy "tradeoff" (<= 10 words).',
    '   - planRevisionSummary: 1 clear sentence (<= 22 words) explaining what changed.',
    '5. Recommend EXACTLY 2 alternative products strictly using valid "productId" values from the provided merchant catalog (excluding the currently viewed productId).',
    '6. When the shopper provides a follow-up preference shift (e.g. "But I really love the high-back design"), genuinely revise your strategy while explaining the trade-off.',
    '7. For "initialPlacementHint" and "placementStrategy.renderHint", name the EXACT open floor patch and adjacent visible landmarks in the photo (e.g., wall, doorway, window, rug edge, corridor floor) plus natural chair facing angle, and explicitly state not to move or remove existing room objects.',
    '8. Write in calm, editorial English.',
  ].join('\n');

  const measurementLines: string[] = [];
  if (mergedMeasurements.maxBudgetUsd) {
    measurementLines.push(`- Max budget: $${mergedMeasurements.maxBudgetUsd}`);
  }
  if (mergedMeasurements.windowSillHeightCm) {
    measurementLines.push(`- Window sill height (user measured): ${mergedMeasurements.windowSillHeightCm} cm`);
  }
  if (mergedMeasurements.availableWidthCm) {
    measurementLines.push(`- Available corner/wall width (user measured): ${mergedMeasurements.availableWidthCm} cm`);
  }

  const promptParts: string[] = [
    `CURRENTLY VIEWED PRODUCT: ${input.currentChair.name} (productId: "${input.currentChair.id}")`,
    `MERCHANT CATALOG (ONLY recommend from these IDs):\n${formatCatalogForPrompt(input.catalog, input.currentChair.id)}`,
    `INITIAL SHOPPER GOAL: "${input.userGoal.trim()}"`,
  ];

  if (measurementLines.length > 0) {
    promptParts.push(`USER-SUPPLIED VERIFIED MEASUREMENTS / HARD CONSTRAINTS:\n${measurementLines.join('\n')}`);
  } else {
    promptParts.push(
      'USER-SUPPLIED MEASUREMENTS: None provided yet. Still list 1–2 concrete potential spatial conflicts in "potentialConflicts" (using status "unverified_spatial_inference" and listing exact missing cm measurements in "missingData"), and list 2–3 parsed goals in "constraints".'
    );
  }

  if (deterministic.conflicts.length > 0) {
    promptParts.push(
      `DETERMINISTIC HARD-CONSTRAINT CHECKS ALREADY TRIGGERED:\n${deterministic.conflicts
        .map((c) => `- ${c.title}: ${c.claim}`)
        .join('\n')}`
    );
  }

  if (turnNumber > 1 && input.previousTurnsSummary?.length && input.followUpMessage) {
    promptParts.push(
      `PREVIOUS SESSION TURNS:\n${input.previousTurnsSummary.join('\n')}\n\nNEW SHOPPER FOLLOW-UP (Turn ${turnNumber}): "${input.followUpMessage.trim()}"\nAdapt the plan directly to this follow-up. Explain in "planRevisionSummary" specifically what changed compared to Turn ${turnNumber - 1}. Do not merely repeat the previous recommendations if the shopper changed priorities.`
    );
  }

  let activeModelUsed = ANALYSIS_MODEL;
  let response;
  try {
    response = await ai.models.generateContent({
      model: ANALYSIS_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: roomImg.base64,
              mimeType: roomImg.mimeType,
            },
          },
          {
            text: promptParts.join('\n\n'),
          },
        ],
      },
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: CONTEXTFIT_RESPONSE_SCHEMA,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/404|NOT_FOUND|not found|not supported/i.test(msg)) {
      console.error('[contextfit] analysis model unavailable, trying fallback', {
        from: ANALYSIS_MODEL,
        to: FALLBACK_ANALYSIS_MODEL,
        detail: redactSecrets(msg).slice(0, 500),
      });
      activeModelUsed = FALLBACK_ANALYSIS_MODEL;
      response = await ai.models.generateContent({
        model: FALLBACK_ANALYSIS_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                data: roomImg.base64,
                mimeType: roomImg.mimeType,
              },
            },
            {
              text: promptParts.join('\n\n'),
            },
          ],
        },
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: CONTEXTFIT_RESPONSE_SCHEMA,
        },
      });
    } else {
      throw err;
    }
  }

  const rawJson = (response.text ?? '').trim();
  if (!rawJson) {
    throw Object.assign(new Error('ContextFit analysis model returned an empty response.'), {
      status: 502,
    });
  }

  const parsed = parseModelJson(rawJson);

  const rawObs = Array.isArray(parsed.roomObservations) ? parsed.roomObservations : [];
  const roomObservations: RoomObservation[] = rawObs
    .filter((o): o is Record<string, unknown> => Boolean(o && typeof o === 'object'))
    .map((o) => ({
      claim: String(o.claim ?? '').trim(),
      status: (o.status === 'confirmed_fact'
        ? 'confirmed_fact'
        : 'visual_inference') as RoomObservation['status'],
    }))
    .filter((o) => o.claim.length > 0)
    .slice(0, 4);

  const rawConstraints = Array.isArray(parsed.constraints) ? parsed.constraints : [];
  const modelConstraints: ParsedConstraint[] = rawConstraints
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c) => ({
      type: (c.type === 'hard' || c.type === 'spatial' || c.type === 'soft'
        ? c.type
        : 'spatial') as ParsedConstraint['type'],
      name: String(c.name ?? 'Constraint').trim(),
      detail: String(c.detail ?? '').trim(),
      priority: (c.priority === 'high' || c.priority === 'medium' || c.priority === 'low'
        ? c.priority
        : 'medium') as ParsedConstraint['priority'],
    }))
    .filter((c) => c.detail.length > 0)
    .slice(0, 5);

  const constraints = ensureParsedConstraints(
    modelConstraints,
    `${input.userGoal} ${input.followUpMessage ?? ''}`.trim(),
    mergedMeasurements
  );

  const rawConflicts = Array.isArray(parsed.potentialConflicts) ? parsed.potentialConflicts : [];
  const modelConflicts: ConflictItem[] = rawConflicts
    .filter((c): c is Record<string, unknown> => Boolean(c && typeof c === 'object'))
    .map((c) => {
      const validStatuses: ConflictItem['status'][] = [
        'confirmed_fact',
        'confirmed_conflict',
        'visual_inference',
        'unverified_spatial_inference',
        'needs_measurement',
      ];
      const rawStatus = String(c.status ?? 'unverified_spatial_inference') as ConflictItem['status'];
      return {
        title: String(c.title ?? 'Potential spatial conflict').trim(),
        claim: String(c.claim ?? '').trim(),
        productFact: String(c.productFact ?? '').trim(),
        status: validStatuses.includes(rawStatus) ? rawStatus : 'unverified_spatial_inference',
        missingData: Array.isArray(c.missingData)
          ? c.missingData.map((m) => humanizeMissingDataLabel(String(m))).filter(Boolean)
          : [],
      };
    })
    .filter((c) => c.claim.length > 0)
    .slice(0, 4);

  const mergedConflicts = ensureSpatialConflictFallback(
    mergeDeterministicAndModelConflicts(deterministic.conflicts, modelConflicts),
    input.currentChair,
    `${input.userGoal} ${input.followUpMessage ?? ''}`.trim(),
    mergedMeasurements
  );

  const rawAlts = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
  const parsedAlts: AlternativeRecommendation[] = rawAlts
    .filter((a): a is Record<string, unknown> => Boolean(a && typeof a === 'object'))
    .map((a) => ({
      productId: String(a.productId ?? '').trim(),
      headline: String(a.headline ?? '').trim(),
      reason: String(a.reason ?? '').trim(),
      gained: String(a.gained ?? '').trim(),
      tradeoff: String(a.tradeoff ?? '').trim(),
    }));

  const groundedAlternatives = groundAlternativesInCatalog(
    parsedAlts,
    input.currentChair.id,
    input.catalog,
    mergedMeasurements
  );

  const rawPlacement = (
    parsed.placementStrategy && typeof parsed.placementStrategy === 'object'
      ? parsed.placementStrategy
      : {}
  ) as Record<string, unknown>;

  const validFieldHints = ['windowSillHeightCm', 'availableWidthCm', 'maxBudgetUsd', 'placement'] as const;
  const rawHint = String(parsed.clarifyingFieldHint ?? '');
  const clarifyingFieldHint = (validFieldHints as readonly string[]).includes(rawHint)
    ? (rawHint as ContextFitAnalysis['clarifyingFieldHint'])
    : 'windowSillHeightCm';

  const analysis: ContextFitAnalysis = {
    turnNumber,
    userPrompt: activeUserText,
    planRevisionSummary:
      turnNumber > 1 && typeof parsed.planRevisionSummary === 'string' && parsed.planRevisionSummary.trim()
        ? parsed.planRevisionSummary.trim()
        : undefined,
    userGoal:
      typeof parsed.userGoal === 'string' && parsed.userGoal.trim()
        ? parsed.userGoal.trim()
        : input.userGoal.trim(),
    verdictHeadline:
      typeof parsed.verdictHeadline === 'string' && parsed.verdictHeadline.trim()
        ? parsed.verdictHeadline.trim()
        : 'Potential spatial trade-offs identified — verify key dimensions.',
    roomObservations,
    constraints,
    potentialConflicts: mergedConflicts,
    initialPlacementHint:
      typeof parsed.initialPlacementHint === 'string' && parsed.initialPlacementHint.trim()
        ? parsed.initialPlacementHint.trim()
        : undefined,
    placementStrategy: {
      title: String(rawPlacement.title ?? 'Angle chair along the solid wall'),
      description: String(
        rawPlacement.description ??
          `Keep ${input.currentChair.name} by shifting it against the solid wall perpendicular to the window, facing inward toward the light.`
      ),
      gained: String(
        rawPlacement.gained ?? 'Preserves your preferred chair silhouette and keeps the window sill unobstructed.'
      ),
      tradeoff: String(
        rawPlacement.tradeoff ?? 'Reduces open wall clearance near adjacent furniture; verify corner width.'
      ),
      renderHint: String(
        rawPlacement.renderHint ??
          'Place the chair standing firmly on the open floor near the solid side wall, angled 25 degrees inward without moving any existing furniture or decor.'
      ),
    },
    alternatives: groundedAlternatives,
    clarifyingQuestion:
      typeof parsed.clarifyingQuestion === 'string' && parsed.clarifyingQuestion.trim()
        ? parsed.clarifyingQuestion.trim()
        : 'What is the height of your window sill (in cm), or how wide is the solid wall next to the window?',
    clarifyingFieldHint,
    modelUsed: activeModelUsed,
    analyzedAt: Date.now(),
  };

  return { analysis, resolvedMeasurements: mergedMeasurements };
}
