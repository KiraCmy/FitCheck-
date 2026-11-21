import { Plus, Trash2, RefreshCw, Loader2, Award, Image as ImageIcon } from 'lucide-react';
import type { ProductItem, RenderState } from '../types/studio';
import { MAX_SHORTLIST_ITEMS } from '../types/studio';
import { getActiveVariant, getEffectivePrice, getReferenceImageUrl } from '../utils/sceneMath';
import { SafeImage } from './SafeImage';

interface ShortlistBarProps {
  products: ProductItem[];
  renders: Record<string, RenderState>;
  winnerId: string | null;
  hasRoomPhoto: boolean;
  onOpenAddModal: () => void;
  onRemoveProduct: (id: string) => void;
  onSelectImage: (productId: string, imageIndex: number) => void;
  onSelectVariant: (productId: string, variantId: string) => void;
  onRenderSingle: (productId: string) => void;
  onLoadSampleStudio: () => void;
}

export function ShortlistBar({
  products,
  renders,
  winnerId,
  hasRoomPhoto,
  onOpenAddModal,
  onRemoveProduct,
  onSelectImage,
  onSelectVariant,
  onRenderSingle,
  onLoadSampleStudio,
}: ShortlistBarProps) {
  const canAddMore = products.length < MAX_SHORTLIST_ITEMS;

  return (
    <section id="shortlist" aria-labelledby="shortlist-heading" className="scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-medium text-[#666666] dark:text-[#9CA3AF] mb-1">
            Step 1 of 3 · {products.length} of {MAX_SHORTLIST_ITEMS} shortlisted
          </p>
          <h2
            id="shortlist-heading"
            className="text-xl sm:text-2xl font-semibold tracking-tight text-[#1A1A1A] dark:text-[#F1F1F1]"
          >
            Product Shortlist
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {products.length === 0 && (
            <button
              type="button"
              onClick={onLoadSampleStudio}
              className="h-10 px-4 text-sm font-medium rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#1A1A1A] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] transition-colors whitespace-nowrap shrink-0"
            >
              Load Sample Comparison
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAddModal}
            disabled={!canAddMore}
            className="h-10 px-4 inline-flex items-center gap-2 text-sm font-semibold rounded-lg border border-[#1A1A1A] dark:border-[#F1F1F1] bg-[#1A1A1A] dark:bg-[#F1F1F1] text-white dark:text-[#141414] hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            <span>Add Product</span>
          </button>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="border border-dashed border-[#D4D4D4] dark:border-[#2E2E2E] rounded-xl bg-[#F7F7F8] dark:bg-[#1A1A1A] px-6 py-12 text-center">
          <p className="text-base font-medium text-[#1A1A1A] dark:text-[#F1F1F1] mb-1.5">
            Build your comparison tray with 2 to 4 competing products
          </p>
          <p className="text-sm text-[#666666] dark:text-[#A1A1AA] max-w-lg mx-auto mb-6">
            Search live Shopify catalogs, look up a direct product URL, or upload any custom product
            photo from any store.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenAddModal}
              className="h-10 px-5 rounded-lg text-sm font-semibold text-white bg-[#5433EB] hover:bg-[#4424D6] transition-colors whitespace-nowrap"
            >
              Search Shopify or Add Custom
            </button>
            <button
              type="button"
              onClick={onLoadSampleStudio}
              className="h-10 px-5 rounded-lg text-sm font-medium border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#BDBDBD] dark:hover:border-[#4A4A4A] transition-colors whitespace-nowrap"
            >
              Try Curated Lamp Comparison
            </button>
          </div>
        </div>
      ) : (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
          data-testid="shortlist-grid"
        >
          {products.map((product, index) => {
            const renderState = renders[product.id];
            const isRendering = renderState?.status === 'rendering';
            const isRendered = renderState?.status === 'done' && !!renderState.imageDataUrl;
            const isWinner = winnerId === product.id;
            const activeVariant = getActiveVariant(product);
            const effectivePrice = getEffectivePrice(product);
            const refImageUrl = getReferenceImageUrl(product);
            const letter = String.fromCharCode(65 + index);

            return (
              <article
                key={product.id}
                className={`flex flex-col rounded-xl border transition-colors bg-white dark:bg-[#1A1A1A] overflow-hidden ${
                  isWinner
                    ? 'border-[#5433EB] ring-1 ring-[#5433EB]/30'
                    : 'border-[#E5E5E5] dark:border-[#2E2E2E]'
                }`}
              >
                {/* Reference Photo */}
                <div className="relative aspect-[4/3] bg-[#F7F7F8] dark:bg-[#141414] border-b border-[#E5E5E5] dark:border-[#2E2E2E] overflow-hidden">
                  <SafeImage
                    src={refImageUrl}
                    alt={`${product.title} reference view`}
                    className="w-full h-full object-cover"
                    fallbackLabel={product.title}
                  />
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-white/92 dark:bg-[#141414]/90 backdrop-blur-xs px-2 py-0.5 rounded text-xs font-mono font-medium text-[#1A1A1A] dark:text-[#F1F1F1] border border-[#E5E5E5] dark:border-[#2E2E2E]">
                    <span>Option {letter}</span>
                    {isWinner && (
                      <>
                        <span aria-hidden="true">·</span>
                        <Award className="w-3.5 h-3.5 text-[#5433EB]" />
                        <span className="text-[#5433EB] dark:text-[#A594FF]">Winner</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveProduct(product.id)}
                    aria-label={`Remove ${product.title} from shortlist`}
                    className="absolute top-2.5 right-2.5 w-8 h-8 inline-flex items-center justify-center rounded-md bg-white/92 dark:bg-[#141414]/90 text-[#525252] dark:text-[#A1A1AA] hover:text-red-600 dark:hover:text-red-400 border border-[#E5E5E5] dark:border-[#2E2E2E] transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Gallery Angle Picker (shown when multiple images exist) */}
                {product.images.length > 1 && (
                  <div className="px-3.5 pt-2.5 flex items-center gap-1.5 overflow-x-auto">
                    <span className="text-[11px] text-[#666666] dark:text-[#9CA3AF] shrink-0 mr-0.5 flex items-center gap-1">
                      <ImageIcon className="w-3 h-3" />
                      Angle
                    </span>
                    {product.images.slice(0, 6).map((imgUrl, imgIdx) => {
                      const active = imgIdx === product.selectedImageIndex;
                      return (
                        <button
                          key={`${product.id}-img-${imgIdx}`}
                          type="button"
                          onClick={() => onSelectImage(product.id, imgIdx)}
                          aria-label={`Use photo ${imgIdx + 1} for ${product.title}`}
                          aria-pressed={active}
                          className={`w-8 h-8 rounded overflow-hidden border shrink-0 transition-all ${
                            active
                              ? 'border-[#5433EB] ring-1 ring-[#5433EB]'
                              : 'border-[#E5E5E5] dark:border-[#2E2E2E] opacity-70 hover:opacity-100'
                          }`}
                        >
                          <SafeImage
                            src={imgUrl}
                            alt={`${product.title} thumbnail ${imgIdx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Details */}
                <div className="p-4 flex flex-col flex-1 gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-xs text-[#666666] dark:text-[#A1A1AA] mb-1 truncate">
                      <span className="truncate">{product.brand}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums font-medium text-[#1A1A1A] dark:text-[#F1F1F1]">
                        {effectivePrice.display}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] leading-snug line-clamp-2 min-h-[2.5rem]">
                      {product.title}
                    </h3>
                  </div>

                  {/* Variant / SKU selector */}
                  {product.variants.length > 1 && (
                    <div>
                      <label
                        htmlFor={`variant-${product.id}`}
                        className="block text-[11px] font-medium text-[#666666] dark:text-[#A1A1AA] mb-1"
                      >
                        Variant / Finish
                      </label>
                      <select
                        id={`variant-${product.id}`}
                        value={activeVariant?.id ?? ''}
                        onChange={(e) => onSelectVariant(product.id, e.target.value)}
                        className="w-full h-9 px-2.5 text-xs rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] focus:outline-none focus:border-[#5433EB]"
                      >
                        {product.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {variant.title} ({variant.price}
                            {variant.available ? '' : ' · Sold out'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Per-item render status & action */}
                  <div className="mt-auto pt-2 border-t border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-between gap-2">
                    <span className="text-xs text-[#666666] dark:text-[#A1A1AA] truncate">
                      {isRendering
                        ? 'Rendering room…'
                        : renderState?.status === 'error'
                          ? 'Render failed'
                          : isRendered
                            ? `Rendered (${((renderState.renderTimeMs ?? 0) / 1000).toFixed(1)}s)`
                            : 'Not rendered yet'}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRenderSingle(product.id)}
                      disabled={!hasRoomPhoto || isRendering}
                      aria-label={`${isRendered ? 'Re-render' : 'Render'} ${product.title} in room`}
                      className="h-8 px-2.5 inline-flex items-center gap-1.5 text-xs font-medium rounded-md border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] hover:text-[#5433EB] dark:hover:text-[#A594FF] disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
                    >
                      {isRendering ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5" />
                      )}
                      <span>{isRendered ? 'Re-render' : 'Render'}</span>
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {/* Open Add Slot if fewer than 4 products */}
          {canAddMore && (
            <button
              type="button"
              onClick={onOpenAddModal}
              className="min-h-[260px] rounded-xl border border-dashed border-[#D4D4D4] dark:border-[#2E2E2E] bg-[#F7F7F8]/60 dark:bg-[#1A1A1A]/50 hover:border-[#5433EB] hover:bg-[#F7F7F8] dark:hover:bg-[#1A1A1A] transition-colors flex flex-col items-center justify-center p-6 text-center group"
            >
              <div className="w-10 h-10 rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#141414] flex items-center justify-center mb-3 text-[#525252] dark:text-[#A1A1AA] group-hover:text-[#5433EB] group-hover:border-[#5433EB] transition-colors">
                <Plus className="w-5 h-5" />
              </div>
              <span className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F1F1F1]">
                Add Product {String.fromCharCode(65 + products.length)}
              </span>
              <span className="text-xs text-[#666666] dark:text-[#A1A1AA] mt-1">
                Shopify search, URL lookup, or custom photo
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
