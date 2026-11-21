import { useEffect, useState } from 'react';
import {
  LayoutGrid,
  Columns2,
  Maximize2,
  Download,
  RefreshCw,
  ArrowLeftRight,
  Loader2,
  Award,
  AlertCircle,
} from 'lucide-react';
import type {
  CompareMode,
  ProductItem,
  RenderState,
  RoomPhoto,
  SingleViewMode,
} from '../types/studio';
import { getEffectivePrice } from '../utils/sceneMath';
import { downloadImageAsPng } from '../utils/canvasTools';
import { SplitCompareSlider } from './SplitCompareSlider';
import { SafeImage } from './SafeImage';

interface VisualCompareWorkspaceProps {
  roomPhoto: RoomPhoto | null;
  products: ProductItem[];
  renders: Record<string, RenderState>;
  winnerId: string | null;
  onRenderSingle: (productId: string) => void;
  onRenderAll: () => void;
  isRenderingAny: boolean;
}

const ORIGINAL_LAYER_ID = '__original_room__';

export function VisualCompareWorkspace({
  roomPhoto,
  products,
  renders,
  winnerId,
  onRenderSingle,
  onRenderAll,
  isRenderingAny,
}: VisualCompareWorkspaceProps) {
  const [compareMode, setCompareMode] = useState<CompareMode>('grid');
  const [globalShowOriginal, setGlobalShowOriginal] = useState(false);
  const [cardOriginalOverride, setCardOriginalOverride] = useState<Record<string, boolean>>({});
  const [leftLayerId, setLeftLayerId] = useState<string>(ORIGINAL_LAYER_ID);
  const [rightLayerId, setRightLayerId] = useState<string>('');
  const [focusProductId, setFocusProductId] = useState<string>('');
  const [singleViewMode, setSingleViewMode] = useState<SingleViewMode>('rendered');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const renderedProducts = products.filter(
    (p) => renders[p.id]?.status === 'done' && Boolean(renders[p.id]?.imageDataUrl)
  );

  // Sync default split & focus selections when shortlist or rendered set changes
  useEffect(() => {
    if (products.length === 0) return;

    if (!focusProductId || !products.some((p) => p.id === focusProductId)) {
      setFocusProductId(renderedProducts[0]?.id ?? products[0].id);
    }

    const validIds = new Set([ORIGINAL_LAYER_ID, ...products.map((p) => p.id)]);
    if (!rightLayerId || !validIds.has(rightLayerId)) {
      if (renderedProducts.length >= 2) {
        setLeftLayerId(renderedProducts[0].id);
        setRightLayerId(renderedProducts[1].id);
      } else if (renderedProducts.length === 1) {
        setLeftLayerId(ORIGINAL_LAYER_ID);
        setRightLayerId(renderedProducts[0].id);
      } else if (products.length >= 2) {
        setLeftLayerId(ORIGINAL_LAYER_ID);
        setRightLayerId(products[0].id);
      } else {
        setLeftLayerId(ORIGINAL_LAYER_ID);
        setRightLayerId(products[0].id);
      }
    }
  }, [products, renderedProducts.length, focusProductId, rightLayerId]);

  const handleExportPng = async (product: ProductItem) => {
    const imgUrl = renders[product.id]?.imageDataUrl;
    if (!imgUrl) return;
    setExportError(null);
    setExportingId(product.id);
    try {
      await downloadImageAsPng(imgUrl, `roomcheck-${product.title}`);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Failed to export PNG.');
    } finally {
      setExportingId(null);
    }
  };

  const resolveLayer = (
    layerId: string
  ): { url: string; label: string; isRendered: boolean } | null => {
    if (!roomPhoto) return null;
    if (layerId === ORIGINAL_LAYER_ID) {
      return { url: roomPhoto.dataUrl, label: 'Original Room', isRendered: true };
    }
    const idx = products.findIndex((p) => p.id === layerId);
    const product = products[idx];
    if (!product) return null;
    const letter = String.fromCharCode(65 + idx);
    const r = renders[product.id];
    if (r?.status === 'done' && r.imageDataUrl) {
      return {
        url: r.imageDataUrl,
        label: `Option ${letter} · ${product.title}`,
        isRendered: true,
      };
    }
    return {
      url: roomPhoto.dataUrl,
      label: `Option ${letter} · ${product.title} (Not rendered yet)`,
      isRendered: false,
    };
  };

  const aspectStyle = roomPhoto
    ? `${roomPhoto.resizedWidth} / ${roomPhoto.resizedHeight}`
    : '4 / 3';

  const leftLayer = resolveLayer(leftLayerId);
  const rightLayer = resolveLayer(rightLayerId);
  const focusedProduct = products.find((p) => p.id === focusProductId) ?? products[0] ?? null;
  const focusedRender = focusedProduct ? renders[focusedProduct.id] : undefined;

  const gridColsClass =
    products.length <= 2
      ? 'grid-cols-1 md:grid-cols-2'
      : products.length === 3
        ? 'grid-cols-1 md:grid-cols-3'
        : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';

  return (
    <section id="visual-compare" aria-labelledby="visual-compare-heading" className="scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-medium text-[#666666] dark:text-[#9CA3AF] mb-1">
            Step 3 of 3 · {renderedProducts.length} of {products.length} room render
            {products.length === 1 ? '' : 's'} ready
          </p>
          <h2
            id="visual-compare-heading"
            className="text-xl sm:text-2xl font-semibold tracking-tight text-[#1A1A1A] dark:text-[#F1F1F1]"
          >
            Visual Room Comparison
          </h2>
        </div>

        {/* 3 Visual Compare Mode Switcher */}
        <div
          role="tablist"
          aria-label="Visual comparison mode"
          className="inline-flex p-1 rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#1A1A1A]"
        >
          <button
            type="button"
            role="tab"
            aria-selected={compareMode === 'grid'}
            onClick={() => setCompareMode('grid')}
            className={`h-9 px-3.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              compareMode === 'grid'
                ? 'bg-white dark:bg-[#262626] text-[#1A1A1A] dark:text-[#F1F1F1] shadow-xs'
                : 'text-[#666666] dark:text-[#A1A1AA] hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1]'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Side-by-Side Grid</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={compareMode === 'split'}
            onClick={() => setCompareMode('split')}
            className={`h-9 px-3.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              compareMode === 'split'
                ? 'bg-white dark:bg-[#262626] text-[#1A1A1A] dark:text-[#F1F1F1] shadow-xs'
                : 'text-[#666666] dark:text-[#A1A1AA] hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1]'
            }`}
          >
            <Columns2 className="w-3.5 h-3.5" />
            <span>Split Slider</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={compareMode === 'focus'}
            onClick={() => setCompareMode('focus')}
            className={`h-9 px-3.5 text-xs font-semibold rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              compareMode === 'focus'
                ? 'bg-white dark:bg-[#262626] text-[#1A1A1A] dark:text-[#F1F1F1] shadow-xs'
                : 'text-[#666666] dark:text-[#A1A1AA] hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1]'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Single Focus</span>
          </button>
        </div>
      </div>

      {exportError && (
        <p role="alert" className="mb-4 text-xs font-medium text-red-600 dark:text-red-400">
          {exportError}
        </p>
      )}

      {!roomPhoto || products.length === 0 ? (
        <div className="rounded-xl border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#1A1A1A] px-6 py-14 text-center">
          <p className="text-base font-medium text-[#1A1A1A] dark:text-[#F1F1F1] mb-1">
            Upload a room photo and add products to unlock room comparisons
          </p>
          <p className="text-sm text-[#666666] dark:text-[#A1A1AA]">
            Once rendered, inspect side-by-side grids, drag the split slider between options, or
            zoom in full width.
          </p>
        </div>
      ) : compareMode === 'grid' ? (
        /* MODE 1: SIDE-BY-SIDE ROOM GRID */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#1A1A1A]">
            <span className="text-xs text-[#666666] dark:text-[#A1A1AA]">
              Compare all shortlisted products in identical room framing.
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#666666] dark:text-[#A1A1AA]">View all as:</span>
              <div className="inline-flex p-0.5 rounded-md border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#141414]">
                <button
                  type="button"
                  onClick={() => {
                    setGlobalShowOriginal(false);
                    setCardOriginalOverride({});
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    !globalShowOriginal
                      ? 'bg-[#5433EB] text-white'
                      : 'text-[#666666] dark:text-[#A1A1AA]'
                  }`}
                >
                  Rendered
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setGlobalShowOriginal(true);
                    setCardOriginalOverride({});
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
                    globalShowOriginal
                      ? 'bg-[#5433EB] text-white'
                      : 'text-[#666666] dark:text-[#A1A1AA]'
                  }`}
                >
                  Original
                </button>
              </div>
            </div>
          </div>

          <div className={`grid ${gridColsClass} gap-5`} data-testid="side-by-side-grid">
            {products.map((product, idx) => {
              const r = renders[product.id];
              const isRendering = r?.status === 'rendering';
              const isRendered = r?.status === 'done' && Boolean(r.imageDataUrl);
              const showOriginal = cardOriginalOverride[product.id] ?? globalShowOriginal;
              const displaySrc = showOriginal || !isRendered ? roomPhoto.dataUrl : r.imageDataUrl!;
              const letter = String.fromCharCode(65 + idx);
              const price = getEffectivePrice(product);
              const isWinner = winnerId === product.id;

              return (
                <article
                  key={product.id}
                  className={`flex flex-col rounded-xl border bg-white dark:bg-[#1A1A1A] overflow-hidden ${
                    isWinner
                      ? 'border-[#5433EB] ring-1 ring-[#5433EB]/30'
                      : 'border-[#E5E5E5] dark:border-[#2E2E2E]'
                  }`}
                >
                  {/* Card Header */}
                  <div className="px-4 py-3 border-b border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs text-[#666666] dark:text-[#A1A1AA]">
                        <span className="font-mono font-medium text-[#1A1A1A] dark:text-[#F1F1F1]">
                          Option {letter}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{price.display}</span>
                        {isWinner && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="inline-flex items-center gap-0.5 font-semibold text-[#5433EB] dark:text-[#A594FF]">
                              <Award className="w-3 h-3" />
                              Winner
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] truncate mt-0.5">
                        {product.title}
                      </h3>
                    </div>

                    {isRendered && (
                      <button
                        type="button"
                        onClick={() =>
                          setCardOriginalOverride((prev) => ({
                            ...prev,
                            [product.id]: !showOriginal,
                          }))
                        }
                        className="h-7 px-2 text-[11px] font-medium rounded border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] transition-colors whitespace-nowrap shrink-0"
                      >
                        {showOriginal ? 'Show Rendered' : 'Show Original'}
                      </button>
                    )}
                  </div>

                  {/* Scene Image Area */}
                  <div
                    style={{ aspectRatio: aspectStyle }}
                    className="relative w-full bg-[#F7F7F8] dark:bg-[#141414] overflow-hidden"
                  >
                    <SafeImage
                      src={displaySrc}
                      alt={
                        isRendered && !showOriginal
                          ? `${product.title} rendered in room`
                          : `Original room preview for ${product.title}`
                      }
                      className={`w-full h-full object-cover transition-opacity duration-200 ${
                        !isRendered && !isRendering ? 'opacity-65' : 'opacity-100'
                      }`}
                    />

                    {/* Rendering Overlay */}
                    {isRendering && (
                      <div className="absolute inset-0 bg-black/55 backdrop-blur-[1px] flex flex-col items-center justify-center p-4 text-white text-center">
                        <Loader2 className="w-7 h-7 animate-spin mb-2.5" />
                        <p className="text-xs font-semibold">Compositing {product.title}…</p>
                        <p className="text-[11px] text-white/75 mt-0.5">
                          Matching room perspective &amp; lighting
                        </p>
                      </div>
                    )}

                    {/* Not Rendered Prompt Overlay */}
                    {!isRendered && !isRendering && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent flex flex-col justify-end p-4 text-white">
                        {r?.status === 'error' ? (
                          <div className="space-y-2">
                            <div className="flex items-start gap-1.5 text-xs text-red-200">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <span className="line-clamp-3">{r.error || 'Render failed.'}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => onRenderSingle(product.id)}
                              className="h-8 px-3 rounded-md text-xs font-semibold bg-white text-[#1A1A1A] hover:bg-neutral-100 transition-colors"
                            >
                              Retry Render
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs text-white/90">Ready to composite</span>
                            <button
                              type="button"
                              onClick={() => onRenderSingle(product.id)}
                              className="h-8 px-3 rounded-md text-xs font-semibold bg-[#5433EB] hover:bg-[#4424D6] text-white transition-colors whitespace-nowrap"
                            >
                              Render Option {letter}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Subtle state label when rendered */}
                    {isRendered && !isRendering && (
                      <div className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded bg-black/70 text-white text-[11px] font-medium">
                        {showOriginal ? 'Original Room' : 'Room Render'}
                      </div>
                    )}
                  </div>

                  {/* Card Action Bar */}
                  <div className="px-4 py-3 border-t border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFocusProductId(product.id);
                          setSingleViewMode(isRendered ? 'rendered' : 'original');
                          setCompareMode('focus');
                        }}
                        className="h-8 px-2.5 text-xs font-medium rounded-md border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] transition-colors whitespace-nowrap"
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        disabled={isRendering}
                        onClick={() => onRenderSingle(product.id)}
                        aria-label={`Re-render ${product.title}`}
                        className="h-8 px-2.5 text-xs font-medium rounded-md border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#525252] dark:text-[#A1A1AA] hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1] inline-flex items-center gap-1 disabled:opacity-40 transition-colors whitespace-nowrap"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Re-render</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      disabled={!isRendered || exportingId === product.id}
                      onClick={() => handleExportPng(product)}
                      aria-label={`Download PNG render of ${product.title}`}
                      className="h-8 px-2.5 text-xs font-medium rounded-md border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] disabled:opacity-35 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                    >
                      {exportingId === product.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>PNG</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      ) : compareMode === 'split' ? (
        /* MODE 2: INTERACTIVE SPLIT SLIDER */
        <div className="rounded-xl border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#1A1A1A] p-5 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="flex flex-wrap items-end gap-3 flex-1">
              <div className="min-w-[180px] flex-1 max-w-[280px]">
                <label
                  htmlFor="split-left-select"
                  className="block text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] mb-1"
                >
                  Left Scene
                </label>
                <select
                  id="split-left-select"
                  value={leftLayerId}
                  onChange={(e) => setLeftLayerId(e.target.value)}
                  className="w-full h-10 px-3 text-xs font-medium rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] focus:outline-none focus:border-[#5433EB]"
                >
                  <option value={ORIGINAL_LAYER_ID}>Original Room</option>
                  {products.map((p, idx) => (
                    <option key={p.id} value={p.id}>
                      Option {String.fromCharCode(65 + idx)} · {p.title}
                      {renders[p.id]?.status === 'done' ? '' : ' (Not rendered)'}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => {
                  const prevLeft = leftLayerId;
                  setLeftLayerId(rightLayerId);
                  setRightLayerId(prevLeft);
                }}
                aria-label="Swap left and right comparison scenes"
                className="h-10 w-10 inline-flex items-center justify-center rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] transition-colors shrink-0"
              >
                <ArrowLeftRight className="w-4 h-4" />
              </button>

              <div className="min-w-[180px] flex-1 max-w-[280px]">
                <label
                  htmlFor="split-right-select"
                  className="block text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] mb-1"
                >
                  Right Scene
                </label>
                <select
                  id="split-right-select"
                  value={rightLayerId}
                  onChange={(e) => setRightLayerId(e.target.value)}
                  className="w-full h-10 px-3 text-xs font-medium rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] focus:outline-none focus:border-[#5433EB]"
                >
                  <option value={ORIGINAL_LAYER_ID}>Original Room</option>
                  {products.map((p, idx) => (
                    <option key={p.id} value={p.id}>
                      Option {String.fromCharCode(65 + idx)} · {p.title}
                      {renders[p.id]?.status === 'done' ? '' : ' (Not rendered)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quick Split Presets */}
            <div className="flex flex-wrap items-center gap-2">
              {products.length >= 2 && (
                <button
                  type="button"
                  onClick={() => {
                    setLeftLayerId(products[0].id);
                    setRightLayerId(products[1].id);
                  }}
                  className="h-9 px-3 text-xs font-medium rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] transition-colors whitespace-nowrap"
                >
                  Product A vs. B
                </button>
              )}
              {products.length >= 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setLeftLayerId(ORIGINAL_LAYER_ID);
                    setRightLayerId(renderedProducts[0]?.id ?? products[0].id);
                  }}
                  className="h-9 px-3 text-xs font-medium rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] transition-colors whitespace-nowrap"
                >
                  Original vs. Rendered
                </button>
              )}
            </div>
          </div>

          {renderedProducts.length === 0 && (
            <div className="px-4 py-3 rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-[#666666] dark:text-[#A1A1AA]">
                Render your shortlisted products to compare real room composites across the split
                slider.
              </span>
              <button
                type="button"
                disabled={isRenderingAny}
                onClick={onRenderAll}
                className="h-8 px-3.5 rounded-md font-semibold text-white bg-[#5433EB] hover:bg-[#4424D6] disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                Render All Now
              </button>
            </div>
          )}

          {leftLayer && rightLayer && (
            <SplitCompareSlider
              leftImageUrl={leftLayer.url}
              leftLabel={leftLayer.label}
              rightImageUrl={rightLayer.url}
              rightLabel={rightLayer.label}
              aspectRatioStyle={aspectStyle}
            />
          )}
        </div>
      ) : (
        /* MODE 3: SINGLE FOCUS VIEW */
        <div className="rounded-xl border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#1A1A1A] p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Product Selector Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {products.map((p, idx) => {
                const active = focusedProduct?.id === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setFocusProductId(p.id)}
                    className={`h-9 px-3 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                      active
                        ? 'border-[#5433EB] bg-[#5433EB] text-white'
                        : 'border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#BDBDBD] dark:hover:border-[#4A4A4A]'
                    }`}
                  >
                    Option {String.fromCharCode(65 + idx)} · {p.brand}
                  </button>
                );
              })}
            </div>

            {/* Rendered / Split Compare / Original Switcher + Download PNG */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div
                role="tablist"
                aria-label="Single focus view mode"
                className="inline-flex p-0.5 rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414]"
              >
                {(['rendered', 'split', 'original'] as SingleViewMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={singleViewMode === mode}
                    onClick={() => setSingleViewMode(mode)}
                    className={`h-8 px-3 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      singleViewMode === mode
                        ? 'bg-white dark:bg-[#262626] text-[#1A1A1A] dark:text-[#F1F1F1] shadow-xs'
                        : 'text-[#666666] dark:text-[#A1A1AA]'
                    }`}
                  >
                    {mode === 'rendered'
                      ? 'Rendered'
                      : mode === 'split'
                        ? 'Split Compare'
                        : 'Original'}
                  </button>
                ))}
              </div>

              {focusedProduct && (
                <>
                  <button
                    type="button"
                    disabled={focusedRender?.status === 'rendering'}
                    onClick={() => onRenderSingle(focusedProduct.id)}
                    className="h-9 px-3 text-xs font-medium rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] inline-flex items-center gap-1.5 disabled:opacity-45 transition-colors whitespace-nowrap"
                  >
                    {focusedRender?.status === 'rendering' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3.5 h-3.5" />
                    )}
                    <span>{focusedRender?.imageDataUrl ? 'Re-render' : 'Render'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={!focusedRender?.imageDataUrl || exportingId === focusedProduct.id}
                    onClick={() => handleExportPng(focusedProduct)}
                    className="h-9 px-3.5 text-xs font-semibold rounded-lg text-white bg-[#5433EB] hover:bg-[#4424D6] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                  >
                    {exportingId === focusedProduct.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Download PNG</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {focusedProduct && (
            <div>
              {singleViewMode === 'split' ? (
                <SplitCompareSlider
                  leftImageUrl={roomPhoto.dataUrl}
                  leftLabel="Original Room"
                  rightImageUrl={focusedRender?.imageDataUrl || roomPhoto.dataUrl}
                  rightLabel={
                    focusedRender?.imageDataUrl
                      ? `${focusedProduct.title} (Rendered)`
                      : `${focusedProduct.title} (Not rendered yet)`
                  }
                  aspectRatioStyle={aspectStyle}
                />
              ) : (
                <div
                  style={{ aspectRatio: aspectStyle }}
                  className="relative w-full max-w-[920px] mx-auto rounded-xl overflow-hidden border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414]"
                >
                  <SafeImage
                    src={
                      singleViewMode === 'original' || !focusedRender?.imageDataUrl
                        ? roomPhoto.dataUrl
                        : focusedRender.imageDataUrl
                    }
                    alt={
                      singleViewMode === 'original'
                        ? 'Original room photo'
                        : `${focusedProduct.title} room render`
                    }
                    className="w-full h-full object-cover"
                  />
                  {focusedRender?.status === 'rendering' && (
                    <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center text-white">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <span className="text-sm font-medium">
                        Rendering {focusedProduct.title}…
                      </span>
                    </div>
                  )}
                  <div className="absolute bottom-3 left-3 px-2.5 py-1 rounded-md bg-black/72 text-white text-xs font-medium">
                    {singleViewMode === 'original'
                      ? 'Original Room'
                      : focusedRender?.imageDataUrl
                        ? `${focusedProduct.title} · Room Render`
                        : `${focusedProduct.title} · Original Room (click Render to composite)`}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
