import fs from 'fs/promises';
import path from 'path';
import { GoogleGenAI } from '@google/genai';
import type {
  LightingMood,
  PlacementOption,
  PlacementPin,
  ProductDimensionsCm,
  SupportedAspectRatio,
} from '../src/types/studio';
import { buildRoomRenderPrompt, chooseNearestAspectRatio } from '../src/utils/sceneMath.js';

export const RENDER_MODEL = 'gemini-3.1-flash-lite-image';
const FALLBACK_RENDER_MODEL = 'gemini-2.5-flash-image';

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

function stripDataUrlPrefix(input: string): { base64: string; mimeType?: string } {
  const match = input.match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return { base64: input };
}

function inferMimeTypeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

async function resolveProductImageBytes(params: {
  productImageBase64?: string;
  productImageUrl?: string;
  productMimeType?: string;
}): Promise<{ data: string; mimeType: string }> {
  if (params.productImageBase64) {
    const parsed = stripDataUrlPrefix(params.productImageBase64);
    return {
      data: parsed.base64,
      mimeType: parsed.mimeType || params.productMimeType || 'image/png',
    };
  }

  const rawUrl = params.productImageUrl?.trim();
  if (!rawUrl) {
    throw new Error('A product reference image is required to render the room scene.');
  }

  if (rawUrl.startsWith('data:image/')) {
    const parsed = stripDataUrlPrefix(rawUrl);
    return {
      data: parsed.base64,
      mimeType: parsed.mimeType || 'image/png',
    };
  }

  // Local generated studio assets under /src/assets/images/...
  if (rawUrl.startsWith('/src/assets/')) {
    const safeRel = rawUrl.replace(/^\/+/, '');
    const resolved = path.resolve(process.cwd(), safeRel);
    const allowedRoot = path.resolve(process.cwd(), 'src', 'assets');
    if (!resolved.startsWith(allowedRoot)) {
      throw new Error('Invalid local asset path.');
    }
    const buf = await fs.readFile(resolved);
    return {
      data: buf.toString('base64'),
      mimeType: inferMimeTypeFromPath(resolved),
    };
  }

  if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(rawUrl, {
        signal: controller.signal,
        headers: { Accept: 'image/*' },
      });
      if (!res.ok) {
        throw new Error(`Could not fetch product reference image (HTTP ${res.status}).`);
      }
      const contentType = res.headers.get('content-type')?.split(';')[0]?.trim() || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        throw new Error('Product reference URL did not return a valid image.');
      }
      const arrayBuf = await res.arrayBuffer();
      return {
        data: Buffer.from(arrayBuf).toString('base64'),
        mimeType: contentType,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Unsupported product reference image format.');
}

export interface RenderRoomSceneInput {
  roomImageBase64: string;
  roomMimeType?: string;
  roomWidth?: number;
  roomHeight?: number;
  productImageBase64?: string;
  productImageUrl?: string;
  productMimeType?: string;
  productName: string;
  productBrand?: string;
  variantLabel?: string;
  placement: PlacementOption;
  lightingMood: LightingMood;
  customNotes?: string;
  placementPin?: PlacementPin;
  dimensionsCm?: ProductDimensionsCm;
}

export interface RenderRoomSceneOutput {
  imageDataUrl: string;
  mimeType: string;
  aspectRatio: SupportedAspectRatio;
  model: string;
  renderTimeMs: number;
}

export async function renderProductInRoom(
  input: RenderRoomSceneInput
): Promise<RenderRoomSceneOutput> {
  const startedAt = Date.now();
  const ai = getGeminiClient();

  const roomParsed = stripDataUrlPrefix(input.roomImageBase64);
  if (!roomParsed.base64) {
    throw new Error('Room photo image data is required.');
  }
  const roomMimeType = roomParsed.mimeType || input.roomMimeType || 'image/jpeg';

  const productBytes = await resolveProductImageBytes({
    productImageBase64: input.productImageBase64,
    productImageUrl: input.productImageUrl,
    productMimeType: input.productMimeType,
  });

  const aspectRatio = chooseNearestAspectRatio(
    input.roomWidth ?? 4,
    input.roomHeight ?? 3
  );

  const prompt = buildRoomRenderPrompt({
    productName: input.productName,
    productBrand: input.productBrand,
    variantLabel: input.variantLabel,
    placement: input.placement,
    lightingMood: input.lightingMood,
    customNotes: input.customNotes,
    placementPin: input.placementPin,
    dimensionsCm: input.dimensionsCm,
  });

  let activeModelUsed = RENDER_MODEL;
  let response;
  try {
    response = await ai.models.generateContent({
      model: RENDER_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: roomParsed.base64,
              mimeType: roomMimeType,
            },
          },
          {
            inlineData: {
              data: productBytes.data,
              mimeType: productBytes.mimeType,
            },
          },
          {
            text: prompt,
          },
        ],
      },
      config: {
        imageConfig: {
          aspectRatio,
        },
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/404|NOT_FOUND|not found|not supported/i.test(msg)) {
      activeModelUsed = FALLBACK_RENDER_MODEL;
      response = await ai.models.generateContent({
        model: FALLBACK_RENDER_MODEL,
        contents: {
          parts: [
            {
              inlineData: {
                data: roomParsed.base64,
                mimeType: roomMimeType,
              },
            },
            {
              inlineData: {
                data: productBytes.data,
                mimeType: productBytes.mimeType,
              },
            },
            {
              text: prompt,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio,
          },
        },
      });
    } else {
      throw err;
    }
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      return {
        imageDataUrl: `data:${mimeType};base64,${part.inlineData.data}`,
        mimeType,
        aspectRatio,
        model: activeModelUsed,
        renderTimeMs: Date.now() - startedAt,
      };
    }
  }

  const textReason = parts
    .map((p) => p.text)
    .filter(Boolean)
    .join(' ')
    .trim();
  throw new Error(
    textReason || 'The room render model did not return an image. Try adjusting placement or notes.'
  );
}
