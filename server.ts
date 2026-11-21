import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  getShopifyProductDetails,
  lookupShopifyCatalogByUrl,
  searchShopifyCatalog,
} from './server/shopifyMcp';
import { renderProductInRoom } from './server/geminiRender';
import { runContextFitAnalysis } from './server/contextFitAgent';
import { MERCHANT_CHAIRS } from './src/data/merchantCatalog';
import type { MerchantChair, UserMeasurements } from './src/types/contextFit';
import type { LightingMood, PlacementOption } from './src/types/studio';
import { LIGHTING_MOODS, PLACEMENT_OPTIONS } from './src/types/studio';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

function formatApiError(err: unknown): { status: number; message: string } {
  const message = err instanceof Error ? err.message : 'Unexpected server error.';
  if (/API_KEY_INVALID|PERMISSION_DENIED|403/i.test(message)) {
    return {
      status: 403,
      message: 'Gemini API key was rejected. Please verify your API key in Settings > Secrets.',
    };
  }
  if (/RESOURCE_EXHAUSTED|429/i.test(message)) {
    return {
      status: 429,
      message:
        'Gemini quota exceeded. Please check your billing-enabled API key in Settings > Secrets.',
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

async function startServer() {
  const app = express();

  // Required 15mb JSON body limit for room & product multimodal image payloads
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      analysisModel: 'gemini-4-hydrogen',
      renderModel: 'gemini-3.1-flash-lite-image',
    });
  });

  // ContextFit Multimodal Constraint Analysis (Turn 1)
  app.post('/api/contextfit/analyze', async (req, res) => {
    try {
      const body = req.body ?? {};
      const roomImageBase64 = typeof body.roomImageBase64 === 'string' ? body.roomImageBase64 : '';
      const userGoal = typeof body.userGoal === 'string' ? body.userGoal.trim() : '';
      const catalog: MerchantChair[] =
        Array.isArray(body.catalog) && body.catalog.length > 0 ? body.catalog : MERCHANT_CHAIRS;
      const currentChairId = typeof body.currentChairId === 'string' ? body.currentChairId : '';
      const currentChair =
        catalog.find((c) => c.id === currentChairId) ??
        (body.currentChair && typeof body.currentChair === 'object' ? body.currentChair : null);

      if (!roomImageBase64) {
        res.status(400).json({ error: 'Upload a room photo before running ContextFit analysis.' });
        return;
      }
      if (!userGoal) {
        res.status(400).json({ error: 'Describe your shopping goal or constraint.' });
        return;
      }
      if (!currentChair) {
        res.status(400).json({ error: 'Selected product could not be found in the merchant catalog.' });
        return;
      }

      const measurements: UserMeasurements =
        body.measurements && typeof body.measurements === 'object' ? body.measurements : {};

      const result = await runContextFitAnalysis({
        roomImageBase64,
        roomMimeType: typeof body.roomMimeType === 'string' ? body.roomMimeType : undefined,
        currentChair,
        catalog,
        userGoal,
        measurements,
        turnNumber: 1,
      });

      res.json(result);
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // ContextFit Multi-Turn Preference Revision (Turn 2+)
  app.post('/api/contextfit/revise', async (req, res) => {
    try {
      const body = req.body ?? {};
      const roomImageBase64 = typeof body.roomImageBase64 === 'string' ? body.roomImageBase64 : '';
      const userGoal = typeof body.userGoal === 'string' ? body.userGoal.trim() : '';
      const followUpMessage =
        typeof body.followUpMessage === 'string' ? body.followUpMessage.trim() : '';
      const catalog: MerchantChair[] =
        Array.isArray(body.catalog) && body.catalog.length > 0 ? body.catalog : MERCHANT_CHAIRS;
      const currentChairId = typeof body.currentChairId === 'string' ? body.currentChairId : '';
      const currentChair =
        catalog.find((c) => c.id === currentChairId) ??
        (body.currentChair && typeof body.currentChair === 'object' ? body.currentChair : null);

      if (!roomImageBase64) {
        res.status(400).json({ error: 'Room photo is required to revise the plan.' });
        return;
      }
      if (!followUpMessage) {
        res.status(400).json({ error: 'Enter a preference update or measurement to revise the plan.' });
        return;
      }
      if (!currentChair) {
        res.status(400).json({ error: 'Selected product could not be found in the merchant catalog.' });
        return;
      }

      const measurements: UserMeasurements =
        body.measurements && typeof body.measurements === 'object' ? body.measurements : {};
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

      res.json(result);
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Shopify Shop MCP: search_catalog
  app.post('/api/shopify/search', async (req, res) => {
    try {
      const query = typeof req.body?.query === 'string' ? req.body.query : '';
      const limit = typeof req.body?.limit === 'number' ? Math.min(Math.max(req.body.limit, 1), 16) : 8;
      const products = await searchShopifyCatalog(query, limit);
      res.json({ products });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Shopify catalog search failed.';
      res.status(502).json({ error: message });
    }
  });

  // Shopify Shop MCP: lookup_catalog
  app.post('/api/shopify/lookup', async (req, res) => {
    try {
      const queryOrUrl =
        typeof req.body?.url === 'string' && req.body.url.trim()
          ? req.body.url
          : typeof req.body?.query === 'string'
            ? req.body.query
            : '';
      const products = await lookupShopifyCatalogByUrl(queryOrUrl);
      res.json({ products });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Shopify URL lookup failed.';
      res.status(502).json({ error: message });
    }
  });

  // Shopify Shop MCP: get_product
  app.post('/api/shopify/product', async (req, res) => {
    try {
      const productId = typeof req.body?.productId === 'string' ? req.body.productId : undefined;
      const url = typeof req.body?.url === 'string' ? req.body.url : undefined;
      const product = await getShopifyProductDetails({ productId, url });
      if (!product) {
        res.status(404).json({ error: 'Product details could not be found.' });
        return;
      }
      res.json({ product });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch Shopify product details.';
      res.status(502).json({ error: message });
    }
  });

  // Same-origin image proxy for clean PNG canvas export of external Shopify product photos
  app.get('/api/image-proxy', async (req, res) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    if (!rawUrl || !isSafeExternalUrl(rawUrl)) {
      res.status(400).json({ error: 'Valid external image URL required.' });
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
        res.status(502).json({ error: `Upstream image returned ${upstream.status}` });
        return;
      }
      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        res.status(400).json({ error: 'URL does not point to an image.' });
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(buf);
    } catch {
      res.status(502).json({ error: 'Failed to proxy external image.' });
    } finally {
      clearTimeout(timer);
    }
  });

  // Multimodal Room Render API (gemini-3.1-flash-lite-image)
  app.post('/api/scene/render', async (req, res) => {
    try {
      const body = req.body ?? {};
      const roomImageBase64 = typeof body.roomImageBase64 === 'string' ? body.roomImageBase64 : '';
      const productName = typeof body.productName === 'string' ? body.productName.trim() : '';
      const placement: PlacementOption = PLACEMENT_OPTIONS.includes(body.placement)
        ? body.placement
        : 'Smart Auto';
      const validMoods = LIGHTING_MOODS.map((m) => m.value);
      const lightingMood: LightingMood = validMoods.includes(body.lightingMood)
        ? body.lightingMood
        : 'Match Room';

      if (!roomImageBase64) {
        res.status(400).json({ error: 'Room photo is required before rendering.' });
        return;
      }
      if (!productName) {
        res.status(400).json({ error: 'Product name is required before rendering.' });
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

      res.json(result);
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  if (!IS_PROD) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`RoomCheck server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RoomCheck server:', err);
  process.exit(1);
});
