import type { ProductItem } from '../src/types/studio';
import { normalizeShopifyProduct, normalizeShopifySearchResponse } from '../src/utils/sceneMath';

const SHOPIFY_MCP_ENDPOINT = 'https://mcp.shop.com/';
const MCP_PROTOCOL_VERSION = '2026-07-28';

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: number | string;
  result?: {
    content?: Array<{
      type?: string;
      text?: string;
      data?: unknown;
      resource?: { text?: string };
    }>;
    structuredContent?: unknown;
    isError?: boolean;
    [key: string]: unknown;
  };
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

let cachedSessionId: string | null = null;
let rpcIdCounter = 1;

function nextRpcId(): number {
  rpcIdCounter += 1;
  return rpcIdCounter;
}

function parseSseOrJson(rawText: string, contentType: string): JsonRpcResponse {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('Empty response received from Shopify Shop MCP.');
  }

  if (contentType.includes('text/event-stream') || trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
    const lines = trimmed.split(/\r?\n/);
    const dataPayloads: string[] = [];
    for (const line of lines) {
      if (line.startsWith('data:')) {
        const chunk = line.slice(5).trim();
        if (chunk && chunk !== '[DONE]') {
          dataPayloads.push(chunk);
        }
      }
    }
    for (let i = dataPayloads.length - 1; i >= 0; i -= 1) {
      try {
        const parsed = JSON.parse(dataPayloads[i]) as JsonRpcResponse;
        if (parsed && (parsed.result !== undefined || parsed.error !== undefined)) {
          return parsed;
        }
      } catch {
        // continue scanning SSE events
      }
    }
    throw new Error('Could not parse JSON-RPC payload from Shopify MCP event stream.');
  }

  return JSON.parse(trimmed) as JsonRpcResponse;
}

async function postMcpRequest(
  body: Record<string, unknown>,
  sessionId?: string | null
): Promise<{ response: JsonRpcResponse; sessionId: string | null }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
  };
  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 14000);

  try {
    const res = await fetch(SHOPIFY_MCP_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const returnedSessionId = res.headers.get('mcp-session-id') || sessionId || null;
    const contentType = res.headers.get('content-type') || '';
    const text = await res.text();

    if (!res.ok) {
      let detail = `Shopify MCP returned HTTP ${res.status}`;
      try {
        const errJson = parseSseOrJson(text, contentType);
        if (errJson.error?.message) detail = errJson.error.message;
      } catch {
        if (text.trim()) detail = `${detail}: ${text.trim().slice(0, 180)}`;
      }
      throw new Error(detail);
    }

    const parsed = parseSseOrJson(text, contentType);
    return { response: parsed, sessionId: returnedSessionId };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error('Shopify Shop MCP request timed out. Try again or add a custom product.');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureSession(): Promise<string | null> {
  if (cachedSessionId) return cachedSessionId;
  try {
    const initPayload = {
      jsonrpc: '2.0',
      id: nextRpcId(),
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: 'RoomCheck',
          version: '1.0.0',
        },
      },
    };
    const { sessionId } = await postMcpRequest(initPayload, null);
    cachedSessionId = sessionId;
    if (sessionId) {
      // Send initialized notification (best-effort)
      postMcpRequest(
        {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
        },
        sessionId
      ).catch(() => {});
    }
    return cachedSessionId;
  } catch {
    // Some stateless MCP servers accept direct tools/call without initialize
    return null;
  }
}

function extractToolPayload(response: JsonRpcResponse): unknown {
  if (response.error) {
    throw new Error(response.error.message || 'Shopify Shop MCP tool error.');
  }
  const result = response.result;
  if (!result) return null;

  if (result.isError) {
    const errorText =
      result.content
        ?.map((c) => c.text)
        .filter(Boolean)
        .join(' ') || 'Shopify Shop MCP returned a tool error.';
    throw new Error(errorText);
  }

  if (result.structuredContent !== undefined) {
    return result.structuredContent;
  }

  if (Array.isArray(result.content)) {
    for (const part of result.content) {
      if (part.data !== undefined) return part.data;
      const rawText = part.text ?? part.resource?.text;
      if (typeof rawText === 'string' && rawText.trim()) {
        try {
          return JSON.parse(rawText);
        } catch {
          // Try extracting JSON object/array from markdown fence or text wrapper
          const match = rawText.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
          if (match) {
            try {
              return JSON.parse(match[1]);
            } catch {
              // continue
            }
          }
        }
      }
    }
  }

  return result;
}

async function callShopifyMcpTool(
  toolName: 'search_catalog' | 'lookup_catalog' | 'get_product',
  args: Record<string, unknown>
): Promise<unknown> {
  const sessionId = await ensureSession();
  const payload = {
    jsonrpc: '2.0',
    id: nextRpcId(),
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args,
    },
  };

  try {
    const { response, sessionId: newSession } = await postMcpRequest(payload, sessionId);
    if (newSession) cachedSessionId = newSession;
    return extractToolPayload(response);
  } catch (err) {
    // Retry once with a fresh session if session expired
    if (sessionId) {
      cachedSessionId = null;
      const freshSession = await ensureSession();
      const { response } = await postMcpRequest(payload, freshSession);
      return extractToolPayload(response);
    }
    throw err;
  }
}

export async function searchShopifyCatalog(
  query: string,
  limit: number = 8
): Promise<ProductItem[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Enter a search query to browse Shopify products.');
  }

  const raw = await callShopifyMcpTool('search_catalog', {
    query: trimmed,
    context: 'Shopper visually comparing home, decor, and consumer products in their room',
    limit,
  });

  return normalizeShopifySearchResponse(raw);
}

export async function lookupShopifyCatalogByUrl(urlOrQuery: string): Promise<ProductItem[]> {
  const trimmed = urlOrQuery.trim();
  if (!trimmed) {
    throw new Error('Enter a Shopify product URL or identifier to look up.');
  }

  const isUrl = /^https?:\/\//i.test(trimmed);
  try {
    const raw = await callShopifyMcpTool('lookup_catalog', isUrl ? { url: trimmed } : { query: trimmed });
    const products = normalizeShopifySearchResponse(raw);
    if (products.length > 0) return products;
  } catch (lookupErr) {
    // Fallback to get_product if URL/ID matches direct product lookup
    try {
      const rawProduct = await callShopifyMcpTool(
        'get_product',
        isUrl ? { url: trimmed } : { product_id: trimmed }
      );
      const products = normalizeShopifySearchResponse(rawProduct);
      if (products.length > 0) return products;
    } catch {
      throw lookupErr;
    }
  }
  return [];
}

export async function getShopifyProductDetails(params: {
  productId?: string;
  url?: string;
}): Promise<ProductItem | null> {
  const args: Record<string, unknown> = {};
  if (params.productId) args.product_id = params.productId;
  if (params.url) args.url = params.url;
  if (!args.product_id && !args.url) {
    throw new Error('A product ID or URL is required.');
  }

  const raw = await callShopifyMcpTool('get_product', args);
  const direct = normalizeShopifyProduct(raw);
  if (direct) return direct;
  const list = normalizeShopifySearchResponse(raw);
  return list[0] ?? null;
}
