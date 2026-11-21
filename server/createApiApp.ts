import 'dotenv/config';
import express from 'express';
import {
  handleContextFitAnalyze,
  handleContextFitRevise,
  handleHealth,
  handleImageProxy,
  handleSceneRender,
  handleShopifyLookup,
  handleShopifyProduct,
  handleShopifySearch,
} from './apiHandlers.js';

export function createApiApp(): express.Express {
  const app = express();

  // Required 15mb JSON body limit for room & product multimodal image payloads
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', handleHealth);
  app.post('/api/contextfit/analyze', handleContextFitAnalyze);
  app.post('/api/contextfit/revise', handleContextFitRevise);
  app.post('/api/scene/render', handleSceneRender);
  app.get('/api/image-proxy', handleImageProxy);
  app.post('/api/shopify/search', handleShopifySearch);
  app.post('/api/shopify/lookup', handleShopifyLookup);
  app.post('/api/shopify/product', handleShopifyProduct);

  return app;
}
