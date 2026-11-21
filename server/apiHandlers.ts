import type { IncomingMessage, ServerResponse } from 'http';
import {
  getShopifyProductDetails,
  lookupShopifyCatalogByUrl,
  searchShopifyCatalog,
} from './shopifyMcp';
import { renderProductInRoom } from './geminiRender';
import { runContextFitAnalysis } from './contextFitAgent';
import { MERCHANT_CHAIRS } from '../src/data/merchantCatalog';
import type { MerchantChair, UserMeasurements } from '../src/types/contextFit';
import type { LightingMood, PlacementOption } from '../src/types/studio';
import { LIGHTING_MOODS, PLACEMENT_OPTIONS } from '../src/types/studio';

export interface ApiRequest extends IncomingMessage {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}

export interface ApiResponse extends ServerResponse {
  status?: (code: number) => ApiResponse;
  json?: (payload: unknown) => void;
  send?: (payload: unknown) => void;
}

function sendJson(res: ApiResponse, statusCode: number, payload: unknown): void {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    const nextRes = res.status(statusCode);
    if (typeof nextRes.json === 'function') {
      nextRes.json(payload);
      return;
    }
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: ApiRequest): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body as Record<string, unknown>;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  // Fallback raw stream reader for non-Express Node/Vercel runtimes
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function formatApiError(err: unknown): { status: number; message: string } {
  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  if (/API_KEY_INVALID|PERMISSION_DENIED|403/i.test(message)) {
    return {
      status: 403,
      message:
        'Gemini API key was rejected. Please verify GEMINI_API_KEY in your environment variables.',
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(message)) {
    return {
      status: 429,
      message: 'Gemini quota exceeded. Please check billing on your GEMINI_API_KEY.',
    };
  }
  if (/required|invalid|missing/i.test(message)) {
    return { status: 400, message };
  }
  return { status: 500, message };
}

function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function handleHealth(_req: ApiRequest, res: ApiResponse): void {
  sendJson(res, 200, {
    ok: true,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
    analysisModel: 'gemini-4-hydrogen',
    renderModel: 'gemini-3.1-flash-lite-image',
  });
}

export async function handleContextFitAnalyze(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const roomImageBase64 = typeof body.roomImageBase64 === 'string' ? body.roomImageBase64 : '';
    const userGoal = typeof body.userGoal === 'string' ? body.userGoal.trim() : '';
    const catalog: MerchantChair[] =
      Array.isArray(body.catalog) && body.catalog.length > 0
        ? (body.catalog as MerchantChair[])
        : MERCHANT_CHAIRS;
    const currentChairId = typeof body.currentChairId === 'string' ? body.currentChairId : '';
    const currentChair =
      catalog.find((c) => c.id === currentChairId) ??
      (body.currentChair && typeof body.currentChair === 'object'
        ? (body.currentChair as MerchantChair)
        : null);

    if (!roomImageBase64) {
      sendJson(res, 400, { error: 'Upload a room photo before running fit analysis.' });
      return;
    }
    if (!userGoal) {
      sendJson(res, 400, { error: 'Describe your shopping goal or constraint.' });
      return;
    }
    if (!currentChair) {
      sendJson(res, 400, {
        error: 'Selected product could not be found in the merchant catalog.',
      });
      return;
    }

    const measurements: UserMeasurements =
      body.measurements && typeof body.measurements === 'object'
        ? (body.measurements as UserMeasurements)
        : {};

    const result = await runContextFitAnalysis({
      roomImageBase64,
      roomMimeType: typeof body.roomMimeType === 'string' ? body.roomMimeType : undefined,
      currentChair,
      catalog,
      userGoal,
      measurements,
      turnNumber: 1,
    });

    sendJson(res, 200, result);
  } catch (err) {
    const { status, message } = formatApiError(err);
    sendJson(res, status, { error: message });
  }
}

export async function handleContextFitRevise(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const roomImageBase64 = typeof body.roomImageBase64 === 'string' ? body.roomImageBase64 : '';
    const userGoal = typeof body.userGoal === 'string' ? body.userGoal.trim() : '';
    const followUpMessage =
      typeof body.followUpMessage === 'string' ? body.followUpMessage.trim() : '';
    const catalog: MerchantChair[] =
      Array.isArray(body.catalog) && body.catalog.length > 0
        ? (body.catalog as MerchantChair[])
        : MERCHANT_CHAIRS;
    const currentChairId = typeof body.currentChairId === 'string' ? body.currentChairId : '';
    const currentChair =
      catalog.find((c) => c.id === currentChairId) ??
      (body.currentChair && typeof body.currentChair === 'object'
        ? (body.currentChair as MerchantChair)
        : null);

    if (!roomImageBase64) {
      sendJson(res, 400, { error: 'Room photo is required to revise the plan.' });
      return;
    }
    if (!followUpMessage) {
      sendJson(res, 400, {
        error: 'Enter a preference update or measurement to revise the plan.',
      });
      return;
    }
    if (!currentChair) {
      sendJson(res, 400, {
        error: 'Selected product could not be found in the merchant catalog.',
      });
      return;
    }

    const measurements: UserMeasurements =
      body.measurements && typeof body.measurements === 'object'
        ? (body.measurements as UserMeasurements)
        : {};
    const previousTurnsSummary = Array.isArray(body.previousTurnsSummary)
      ? body.previousTurnsSummary.map(String)
      : [];
    const turnNumber =
      typeof body.turnNumber === 'number' && body.turnNumber >= 2 ? body.turnNumber : 2;

    const result = await runContextFitAnalysis({
      roomImageBase64,
      roomMimeType: typeof body.roomMimeType === 'string' ? body.roomMimeType : undefined,
      currentChair,
      catalog,
      userGoal: userGoal || followUpMessage,
      measurements,
      turnNumber,
      previousTurnsSummary,
      followUpMessage,
    });

    sendJson(res, 200, result);
  } catch (err) {
    const { status, message } = formatApiError(err);
    sendJson(res, status, { error: message });
  }
}

export async function handleSceneRender(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method && req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
    return;
  }
  try {
    const body = await readJsonBody(req);
    const roomImageBase64 = typeof body.roomImageBase64 === 'string' ? body.roomImageBase64 : '';
    const productName = typeof body.productName === 'string' ? body.productName.trim() : '';
    const placement: PlacementOption = PLACEMENT_OPTIONS.includes(body.placement as PlacementOption)
      ? (body.placement as PlacementOption)
      : 'Smart Auto';
    const validMoods = LIGHTING_MOODS.map((m) => m.value);
    const lightingMood: LightingMood = validMoods.includes(body.lightingMood as LightingMood)
      ? (body.lightingMood as LightingMood)
      : 'Match Room';

    if (!roomImageBase64) {
      sendJson(res, 400, { error: 'Room photo is required before rendering.' });
      return;
    }
    if (!productName) {
      sendJson(res, 400, { error: 'Product name is required before rendering.' });
      return;
    }

    const rawPin = body.placementPin as Record<string, unknown> | undefined;
    const placementPin =
      rawPin &&
      typeof rawPin === 'object' &&
      typeof rawPin.xPercent === 'number' &&
      typeof rawPin.yPercent === 'number' &&
      Number.isFinite(rawPin.xPercent) &&
      Number.isFinite(rawPin.yPercent)
        ? { xPercent: rawPin.xPercent, yPercent: rawPin.yPercent }
        : undefined;

    const rawDims = body.dimensionsCm as Record<string, unknown> | undefined;
    const dimensionsCm =
      rawDims &&
      typeof rawDims === 'object' &&
      typeof rawDims.heightCm === 'number' &&
      typeof rawDims.widthCm === 'number' &&
      typeof rawDims.depthCm === 'number' &&
      Number.isFinite(rawDims.heightCm) &&
      Number.isFinite(rawDims.widthCm) &&
      Number.isFinite(rawDims.depthCm)
        ? {
            heightCm: rawDims.heightCm,
            widthCm: rawDims.widthCm,
            depthCm: rawDims.depthCm,
          }
        : undefined;

    const result = await renderProductInRoom({
      roomImageBase64,
      roomMimeType: typeof body.roomMimeType === 'string' ? body.roomMimeType : undefined,
      roomWidth: typeof body.roomWidth === 'number' ? body.roomWidth : undefined,
      roomHeight: typeof body.roomHeight === 'number' ? body.roomHeight : undefined,
      productImageBase64:
        typeof body.productImageBase64 === 'string' ? body.productImageBase64 : undefined,
      productImageUrl:
        typeof body.productImageUrl === 'string' ? body.productImageUrl : undefined,
      productMimeType:
        typeof body.productMimeType === 'string' ? body.productMimeType : undefined,
      productName,
      productBrand: typeof body.productBrand === 'string' ? body.productBrand : undefined,
      variantLabel: typeof body.variantLabel === 'string' ? body.variantLabel : undefined,
      placement,
      lightingMood,
      customNotes: typeof body.customNotes === 'string' ? body.customNotes : undefined,
      placementPin,
      dimensionsCm,
    });

    sendJson(res, 200, result);
  } catch (err) {
    const { status, message } = formatApiError(err);
    sendJson(res, status, { error: message });
  }
}

export async function handleImageProxy(req: ApiRequest, res: ApiResponse): Promise<void> {
  let rawUrl = '';
  if (req.query && typeof req.query.url === 'string') {
    rawUrl = req.query.url;
  } else if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      rawUrl = parsed.searchParams.get('url') || '';
    } catch {
      rawUrl = '';
    }
  }

  if (!rawUrl || !isSafeExternalUrl(rawUrl)) {
    sendJson(res, 400, { error: 'Valid external image URL required.' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const upstream = await fetch(rawUrl, {
      signal: controller.signal,
      headers: { Accept: 'image/*' },
    });
    if (!upstream.ok) {
      sendJson(res, 502, { error: `Upstream image returned ${upstream.status}` });
      return;
    }
    const contentType = upstream.headers.get('content-type') || 'image/jpeg';
    if (!contentType.startsWith('image/')) {
      sendJson(res, 400, { error: 'URL does not point to an image.' });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (typeof res.send === 'function') {
      res.send(buf);
    } else {
      res.statusCode = 200;
      res.end(buf);
    }
  } catch {
    sendJson(res, 502, { error: 'Failed to proxy external image.' });
  } finally {
    clearTimeout(timer);
  }
}

export async function handleShopifySearch(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const query = typeof body.query === 'string' ? body.query : '';
    const limit =
      typeof body.limit === 'number' ? Math.min(Math.max(body.limit, 1), 16) : 8;
    const products = await searchShopifyCatalog(query, limit);
    sendJson(res, 200, { products });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Shopify catalog search failed.';
    sendJson(res, 502, { error: message });
  }
}

export async function handleShopifyLookup(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const queryOrUrl =
      typeof body.url === 'string' && body.url.trim()
        ? body.url
        : typeof body.query === 'string'
          ? body.query
          : '';
    const products = await lookupShopifyCatalogByUrl(queryOrUrl);
    sendJson(res, 200, { products });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Shopify URL lookup failed.';
    sendJson(res, 502, { error: message });
  }
}

export async function handleShopifyProduct(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const body = await readJsonBody(req);
    const productId = typeof body.productId === 'string' ? body.productId : undefined;
    const url = typeof body.url === 'string' ? body.url : undefined;
    const product = await getShopifyProductDetails({ productId, url });
    if (!product) {
      sendJson(res, 404, { error: 'Product details could not be found.' });
      return;
    }
    sendJson(res, 200, { product });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Shopify product details.';
    sendJson(res, 502, { error: message });
  }
}
