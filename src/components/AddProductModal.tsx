import { useState, useRef } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { X, Search, Link2, Upload, Plus, Loader2, Check, ExternalLink } from 'lucide-react';
import type { ProductItem } from '../types/studio';
import { formatPrice, parsePriceNumeric } from '../utils/sceneMath';
import { optimizeProductImageFile } from '../utils/canvasTools';
import { SafeImage } from './SafeImage';

interface AddProductModalProps {
  isOpen: boolean;
  existingIds: string[];
  remainingSlots: number;
  onClose: () => void;
  onAddProduct: (product: ProductItem) => void;
}

type ModalTab = 'shopify' | 'manual';
type ShopifySubMode = 'search' | 'url';

export function AddProductModal({
  isOpen,
  existingIds,
  remainingSlots,
  onClose,
  onAddProduct,
}: AddProductModalProps) {
  const [activeTab, setActiveTab] = useState<ModalTab>('shopify');
  const [shopifyMode, setShopifyMode] = useState<ShopifySubMode>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [lookupUrl, setLookupUrl] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [shopifyError, setShopifyError] = useState<string | null>(null);
  const [results, setResults] = useState<ProductItem[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  // Manual product form state
  const [manualName, setManualName] = useState('');
  const [manualPrice, setManualPrice] = useState('');
  const [manualBrand, setManualBrand] = useState('');
  const [manualUrl, setManualUrl] = useState('');
  const [manualSpecs, setManualSpecs] = useState('');
  const [manualVariant, setManualVariant] = useState('');
  const [manualPhotos, setManualPhotos] = useState<string[]>([]);
  const [manualPhotoName, setManualPhotoName] = useState<string>('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [isReadingManualPhoto, setIsReadingManualPhoto] = useState(false);
  const manualFileRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleShopifySubmit = async (e: FormEvent) => {
    e.preventDefault();
    setShopifyError(null);

    if (shopifyMode === 'search') {
      const q = searchQuery.trim();
      if (!q) {
        setShopifyError('Enter a product keyword to search Shopify stores.');
        return;
      }
      setIsSearching(true);
      setHasSearched(true);
      try {
        const res = await fetch('/api/shopify/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q, limit: 8 }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Shopify search returned an error.');
        }
        setResults(Array.isArray(data.products) ? data.products : []);
      } catch (err) {
        setResults([]);
        setShopifyError(
          err instanceof Error
            ? err.message
            : 'Unable to reach Shopify Shop MCP right now. You can add any product using the Custom Entry tab.'
        );
      } finally {
        setIsSearching(false);
      }
    } else {
      const target = lookupUrl.trim();
      if (!target) {
        setShopifyError('Paste a Shopify product URL or product ID to look up.');
        return;
      }
      setIsSearching(true);
      setHasSearched(true);
      try {
        const res = await fetch('/api/shopify/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: target }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Shopify URL lookup failed.');
        }
        setResults(Array.isArray(data.products) ? data.products : []);
      } catch (err) {
        setResults([]);
        setShopifyError(
          err instanceof Error
            ? err.message
            : 'Unable to look up that Shopify product URL. Try the Custom Entry tab.'
        );
      } finally {
        setIsSearching(false);
      }
    }
  };

  const handleAddShopifyResult = async (item: ProductItem) => {
    if (remainingSlots <= 0) return;

    // Fetch enriched product details (variants / gallery images) via get_product when available
    if (item.variants.length <= 1 && (item.id || item.url)) {
      setLoadingDetailId(item.id);
      try {
        const res = await fetch('/api/shopify/product', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: item.id, url: item.url }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.product) {
            onAddProduct(data.product as ProductItem);
            setLoadingDetailId(null);
            return;
          }
        }
      } catch {
        // Fall back to search result item cleanly
      } finally {
        setLoadingDetailId(null);
      }
    }

    onAddProduct(item);
  };

  const handleManualPhotoChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 4);
    if (files.length === 0) return;
    setManualError(null);
    setIsReadingManualPhoto(true);
    try {
      const processed = await Promise.all(files.map((f) => optimizeProductImageFile(f)));
      setManualPhotos(processed);
      setManualPhotoName(
        files.length === 1 ? files[0].name : `${files.length} product angles selected`
      );
    } catch (err) {
      setManualError(err instanceof Error ? err.message : 'Could not read product image.');
    } finally {
      setIsReadingManualPhoto(false);
      e.target.value = '';
    }
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    setManualError(null);

    const name = manualName.trim();
    const brand = manualBrand.trim();
    if (manualPhotos.length === 0) {
      setManualError('Upload a product photo so RoomCheck can composite it into your room.');
      return;
    }
    if (!name) {
      setManualError('Enter a product name.');
      return;
    }
    if (!brand) {
      setManualError('Enter a brand or store name.');
      return;
    }

    const priceNumeric = parsePriceNumeric(manualPrice);
    const priceDisplay =
      priceNumeric !== null
        ? formatPrice(priceNumeric, 'USD')
        : manualPrice.trim() || 'Price not listed';

    const features = manualSpecs
      .split(/\r?\n|,/)
      .map((s) => s.trim())
      .filter(Boolean);

    const cleanUrl = manualUrl.trim();
    const validUrl =
      cleanUrl && /^https?:\/\//i.test(cleanUrl)
        ? cleanUrl
        : cleanUrl
          ? `https://${cleanUrl}`
          : undefined;

    const variantLabel = manualVariant.trim() || 'Standard';
    const newId = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const item: ProductItem = {
      id: newId,
      source: 'manual',
      title: name,
      brand,
      store: brand,
      price: priceDisplay,
      priceNumeric,
      currency: 'USD',
      availability: 'In Stock',
      rating: null,
      reviewCount: null,
      url: validUrl,
      features,
      images: manualPhotos,
      selectedImageIndex: 0,
      variants: [
        {
          id: `${newId}-v1`,
          title: variantLabel,
          price: priceDisplay,
          priceNumeric,
          currency: 'USD',
          available: true,
          imageUrl: manualPhotos[0],
        },
      ],
      selectedVariantId: `${newId}-v1`,
    };

    onAddProduct(item);
    setManualName('');
    setManualPrice('');
    setManualBrand('');
    setManualUrl('');
    setManualSpecs('');
    setManualVariant('');
    setManualPhotos([]);
    setManualPhotoName('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-product-modal-title"
    >
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-xl border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#1A1A1A] shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-between gap-4">
          <div>
            <h2
              id="add-product-modal-title"
              className="text-lg font-semibold text-[#1A1A1A] dark:text-[#F1F1F1]"
            >
              Add Product to Shortlist
            </h2>
            <p className="text-xs text-[#666666] dark:text-[#A1A1AA]">
              {remainingSlots} slot{remainingSlots === 1 ? '' : 's'} remaining (compare 2–4
              products)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close add product dialog"
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#525252] dark:text-[#A1A1AA] hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="px-6 pt-4 border-b border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center gap-6">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'shopify'}
            onClick={() => setActiveTab('shopify')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'shopify'
                ? 'border-[#5433EB] text-[#5433EB] dark:text-[#A594FF]'
                : 'border-transparent text-[#666666] dark:text-[#A1A1AA] hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1]'
            }`}
          >
            Shopify Search &amp; URL Lookup
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'manual'}
            onClick={() => setActiveTab('manual')}
            className={`pb-3 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'manual'
                ? 'border-[#5433EB] text-[#5433EB] dark:text-[#A594FF]'
                : 'border-transparent text-[#666666] dark:text-[#A1A1AA] hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1]'
            }`}
          >
            Custom Product Entry
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'shopify' ? (
            <div className="space-y-5">
              {/* Sub-mode switcher: Catalog Search vs Direct URL */}
              <div className="inline-flex p-1 rounded-lg bg-[#F7F7F8] dark:bg-[#141414] border border-[#E5E5E5] dark:border-[#2E2E2E]">
                <button
                  type="button"
                  onClick={() => {
                    setShopifyMode('search');
                    setShopifyError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    shopifyMode === 'search'
                      ? 'bg-white dark:bg-[#242424] text-[#1A1A1A] dark:text-[#F1F1F1] shadow-xs'
                      : 'text-[#666666] dark:text-[#A1A1AA]'
                  }`}
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search Catalog</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShopifyMode('url');
                    setShopifyError(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                    shopifyMode === 'url'
                      ? 'bg-white dark:bg-[#242424] text-[#1A1A1A] dark:text-[#F1F1F1] shadow-xs'
                      : 'text-[#666666] dark:text-[#A1A1AA]'
                  }`}
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>Product URL Lookup</span>
                </button>
              </div>

              <form onSubmit={handleShopifySubmit} className="flex flex-col sm:flex-row gap-2.5">
                {shopifyMode === 'search' ? (
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search live Shopify stores (e.g., ceramic table lamp, walnut desk chair)..."
                    aria-label="Shopify catalog search query"
                    className="flex-1 h-11 px-3.5 text-sm rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#5433EB]"
                  />
                ) : (
                  <input
                    type="url"
                    value={lookupUrl}
                    onChange={(e) => setLookupUrl(e.target.value)}
                    placeholder="https://store.example.com/products/brass-table-lamp"
                    aria-label="Shopify product URL"
                    className="flex-1 h-11 px-3.5 text-sm rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#5433EB]"
                  />
                )}
                <button
                  type="submit"
                  disabled={isSearching}
                  className="h-11 px-5 rounded-lg text-sm font-semibold text-white bg-[#5433EB] hover:bg-[#4424D6] disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Searching…</span>
                    </>
                  ) : (
                    <span>{shopifyMode === 'search' ? 'Search Shopify' : 'Look Up URL'}</span>
                  )}
                </button>
              </form>

              {shopifyError && (
                <div
                  role="alert"
                  className="p-4 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <span>{shopifyError}</span>
                  <button
                    type="button"
                    onClick={() => setActiveTab('manual')}
                    className="text-xs font-semibold underline underline-offset-2 whitespace-nowrap shrink-0"
                  >
                    Switch to Custom Entry
                  </button>
                </div>
              )}

              {results.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {results.map((item) => {
                    const alreadyAdded = existingIds.includes(item.id);
                    const isFetchingDetails = loadingDetailId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="flex gap-3.5 p-3.5 rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8]/60 dark:bg-[#141414]"
                      >
                        <div className="w-20 h-20 rounded-md overflow-hidden border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#1A1A1A] shrink-0">
                          <SafeImage
                            src={item.images[0]}
                            alt={item.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col justify-between">
                          <div>
                            <div className="text-xs text-[#666666] dark:text-[#A1A1AA] truncate">
                              {item.store} ·{' '}
                              <span className="font-mono tabular-nums text-[#1A1A1A] dark:text-[#F1F1F1] font-medium">
                                {item.price}
                              </span>
                            </div>
                            <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] line-clamp-2 leading-snug mt-0.5">
                              {item.title}
                            </h3>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-2">
                            {item.url ? (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs text-[#666666] dark:text-[#A1A1AA] hover:text-[#5433EB] inline-flex items-center gap-1"
                              >
                                <span>Store</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-xs text-[#666666] dark:text-[#A1A1AA]">
                                {item.variants.length > 1
                                  ? `${item.variants.length} variants`
                                  : item.availability}
                              </span>
                            )}
                            <button
                              type="button"
                              disabled={alreadyAdded || remainingSlots <= 0 || isFetchingDetails}
                              onClick={() => handleAddShopifyResult(item)}
                              className="h-8 px-3 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 bg-[#1A1A1A] dark:bg-[#F1F1F1] text-white dark:text-[#141414] hover:opacity-90 disabled:opacity-45 transition-opacity whitespace-nowrap"
                            >
                              {alreadyAdded ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Added</span>
                                </>
                              ) : isFetchingDetails ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Loading…</span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Add</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : hasSearched && !isSearching && !shopifyError ? (
                <div className="py-10 text-center text-sm text-[#666666] dark:text-[#A1A1AA]">
                  No matching Shopify products were found. Try broader keywords or use Custom
                  Product Entry.
                </div>
              ) : !hasSearched ? (
                <div className="py-8 text-center text-xs text-[#666666] dark:text-[#A1A1AA] border border-dashed border-[#E5E5E5] dark:border-[#2E2E2E] rounded-lg">
                  Powered by Shopify Shop MCP (protocol 2026-07-28). Search live catalogs by
                  keyword or paste any Shopify product URL to pull gallery photos and variants.
                </div>
              ) : null}
            </div>
          ) : (
            /* Manual / Custom Product Entry */
            <form onSubmit={handleManualSubmit} className="space-y-5" noValidate>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
                {/* Product Photo Upload */}
                <div className="sm:col-span-5">
                  <span className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] mb-2">
                    Product Reference Photo *
                  </span>
                  <input
                    ref={manualFileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleManualPhotoChange}
                    aria-label="Upload custom product photo"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => manualFileRef.current?.click()}
                    className="w-full aspect-[4/3] rounded-lg border border-dashed border-[#D4D4D4] dark:border-[#3A3A3A] bg-[#F7F7F8] dark:bg-[#141414] hover:border-[#5433EB] transition-colors overflow-hidden flex flex-col items-center justify-center p-4 text-center"
                  >
                    {manualPhotos.length > 0 ? (
                      <img
                        src={manualPhotos[0]}
                        alt="Uploaded custom product preview"
                        className="w-full h-full object-contain"
                      />
                    ) : isReadingManualPhoto ? (
                      <Loader2 className="w-6 h-6 text-[#5433EB] animate-spin" />
                    ) : (
                      <>
                        <Upload className="w-6 h-6 text-[#666666] dark:text-[#A1A1AA] mb-2" strokeWidth={1.5} />
                        <span className="text-xs font-medium text-[#1A1A1A] dark:text-[#F1F1F1]">
                          Upload product photo(s)
                        </span>
                        <span className="text-[11px] text-[#666666] dark:text-[#A1A1AA] mt-1">
                          Select 1–4 angles · Studio shot works best
                        </span>
                      </>
                    )}
                  </button>
                  {manualPhotoName && (
                    <p className="text-[11px] text-[#666666] dark:text-[#A1A1AA] mt-1.5 truncate">
                      {manualPhotoName}
                    </p>
                  )}
                </div>

                {/* Product Fields */}
                <div className="sm:col-span-7 space-y-3.5">
                  <div>
                    <label
                      htmlFor="manual-product-name"
                      className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] mb-1"
                    >
                      Product Name *
                    </label>
                    <input
                      id="manual-product-name"
                      type="text"
                      required
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="e.g., Arco Marble Floor Lamp"
                      className="w-full h-10 px-3 text-sm rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] focus:outline-none focus:border-[#5433EB]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="manual-product-brand"
                        className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] mb-1"
                      >
                        Brand / Store *
                      </label>
                      <input
                        id="manual-product-brand"
                        type="text"
                        required
                        value={manualBrand}
                        onChange={(e) => setManualBrand(e.target.value)}
                        placeholder="e.g., Flos"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] focus:outline-none focus:border-[#5433EB]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="manual-product-price"
                        className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] mb-1"
                      >
                        Price (USD)
                      </label>
                      <input
                        id="manual-product-price"
                        type="text"
                        value={manualPrice}
                        onChange={(e) => setManualPrice(e.target.value)}
                        placeholder="e.g., $275"
                        className="w-full h-10 px-3 text-sm font-mono tabular-nums rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] focus:outline-none focus:border-[#5433EB]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="manual-product-variant"
                        className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] mb-1"
                      >
                        Finish / Variant
                      </label>
                      <input
                        id="manual-product-variant"
                        type="text"
                        value={manualVariant}
                        onChange={(e) => setManualVariant(e.target.value)}
                        placeholder="e.g., Brushed Brass"
                        className="w-full h-10 px-3 text-sm rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] focus:outline-none focus:border-[#5433EB]"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="manual-product-url"
                        className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] mb-1"
                      >
                        Product Link (Optional)
                      </label>
                      <input
                        id="manual-product-url"
                        type="url"
                        value={manualUrl}
                        onChange={(e) => setManualUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full h-10 px-3 text-sm rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] focus:outline-none focus:border-[#5433EB]"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="manual-product-specs"
                      className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] mb-1"
                    >
                      Key Specs / Features (one per line or comma-separated)
                    </label>
                    <textarea
                      id="manual-product-specs"
                      rows={2}
                      value={manualSpecs}
                      onChange={(e) => setManualSpecs(e.target.value)}
                      placeholder="18 in tall, Solid walnut base, Dimmable LED"
                      className="w-full px-3 py-2 text-sm rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] focus:outline-none focus:border-[#5433EB] resize-none"
                    />
                  </div>
                </div>
              </div>

              {manualError && (
                <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                  {manualError}
                </p>
              )}

              <div className="pt-3 border-t border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="h-10 px-4 text-sm font-medium rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#1A1A1A] dark:text-[#F1F1F1] hover:bg-[#F7F7F8] dark:hover:bg-[#242424] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={remainingSlots <= 0}
                  className="h-10 px-5 text-sm font-semibold rounded-lg text-white bg-[#5433EB] hover:bg-[#4424D6] disabled:opacity-45 transition-colors"
                >
                  Add to Shortlist
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
