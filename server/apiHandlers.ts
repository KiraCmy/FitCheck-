import type { IncomingMessage, ServerResponse } from 'http';
import {
  getShopifyProductDetails,
  lookupShopifyCatalogByUrl,
  searchShopifyCatalog,
} from './shopifyMcp.js';
import { RENDER_MODEL, renderProductInRoom } from './geminiRender.js';
import { ANALYSIS_MODEL, runContextFitAnalysis } from './contextFitAgent.js';
import { MERCHANT_CHAIRS } from '../src/data/merchantCatalog.js';
import type { MerchantChair, UserMeasurements } from '../src/types/contextFit';
import type { LightingMood, PlacementOption } from '../src/types/studio';
import { LIGHTING_MOODS, PLACEMENT_OPTIONS } from '../src/types/studio.js';
import { redactSecrets } from './redactSecrets.js';

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

function readHttpStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const record = err as { status?: unknown; statusCode?: unknown };
  for (const value of [record.status, record.statusCode]) {
    if (typeof value === 'number' && value >= 400 && value <= 599) return value;
  }
  return undefined;
}

export function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : 'Unexpected server error.';
  const message = redactSecrets(raw);
  let upstream = readHttpStatus(err);

  if (/GEMINI_API_KEY is not configured/i.test(message)) {
    return {
      status: 503,
      message:
        'GEMINI_API_KEY is not configured on the server. Add it in Vercel → Settings → Environment Variables for Production, then redeploy.',
    };
  }

  if (upstream === undefined) {
    if (/API_KEY_INVALID|PERMISSION_DENIED|UNAUTHENTICATED|\b401\b|\b403\b/i.test(message)) {
      upstream = 403;
    } else if (/RESOURCE_EXHAUSTED|\b429\b/i.test(message)) {
      upstream = 429;
    } else if (/NOT_FOUND|is not found|not supported for generateContent/i.test(message)) {
      upstream = 404;
    } else if (/INVALID_ARGUMENT|Invalid JSON|\brequired\b|\bmissing\b/i.test(message)) {
      upstream = 400;
    }
  }

  if (upstream === 401 || upstream === 403) {
    return {
      status: 403,
      message:
        'Gemini API key was rejected. Verify GEMINI_API_KEY in the Vercel project environment variables.',
    };
  }
  if (upstream === 429) {
    return {
      status: 429,
      message: 'Gemini quota exceeded. Check rate limits and billing for this API key.',
    };
  }
  if (upstream === 404) {
    return {
      status: 502,
      message: 'The configured Gemini model was not found or does not support this request.',
    };
  }
  if (upstream === 400) {
    return { status: 400, message };
  }
  if (upstream && upstream >= 400 && upstream < 500) {
    return { status: upstream, message };
  }
  if (upstream && upstream >= 500) {
    const looksLikeUpstreamDump =
      /got status:|\{"error"|generativelanguage\.googleapis/i.test(message);
    if (looksLikeUpstreamDump) {
      return {
        status: 502,
        message: 'The Gemini request failed. The redacted error was written to the server logs.',
      };
    }
    return { status: upstream, message };
  }
  return { status: 500, message };
}

function logApiFailure(route: string, err: unknown, status: number): void {
  const detail = redactSecrets(
    err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  ).slice(0, 1000);
  console.error(`[api] ${route} failed`, {
    status,
    detail,
    hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
  });
}

function fail(res: ApiResponse, route: string, err: unknown): void {
  const { status, message } = formatApiError(err);
  logApiFailure(route, err, status);
  sendJson(res, status, { error: message, status });
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
    analysisModel: ANALYSIS_MODEL,
    renderModel: RENDER_MODEL,
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
    fail(res, 'contextfit/analyze', err);
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
    fail(res, 'contextfit/revise', err);
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
    });

    sendJson(res, 200, result);
  } catch (err) {
    fail(res, 'scene/render', err);
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
  } catch (err) {
    logApiFailure('image-proxy', err, 502);
    sendJson(res, 502, { error: 'Failed to proxy external image.', status: 502 });
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
    logApiFailure('shopify/search', err, 502);
    const message = redactSecrets(
      err instanceof Error ? err.message : 'Shopify catalog search failed.'
    );
    sendJson(res, 502, { error: message, status: 502 });
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
    logApiFailure('shopify/lookup', err, 502);
    const message = redactSecrets(err instanceof Error ? err.message : 'Shopify URL lookup failed.');
    sendJson(res, 502, { error: message, status: 502 });
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
    logApiFailure('shopify/product', err, 502);
    const message = redactSecrets(
      err instanceof Error ? err.message : 'Failed to fetch Shopify product details.'
    );
    sendJson(res, 502, { error: message, status: 502 });
  }
}
