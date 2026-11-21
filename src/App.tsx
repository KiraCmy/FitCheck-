import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CartItem,
  ContextFitAnalysis,
  MerchantChair,
  UserMeasurements,
  VisualPreviewRender,
} from './types/contextFit';
import type { PlacementPin, RoomPhoto, SupportedAspectRatio } from './types/studio';
import {
  APARTMENT_WINDOW_ROOM,
  INITIAL_GOAL_PROMPTS,
  MERCHANT_CHAIRS,
} from './data/merchantCatalog';
import { summarizeAnalysisForHistory } from './utils/contextFitLogic';
import {
  imageUrlToDataUrl,
  optimizeRoomImageFile,
  optimizeRoomImageFromSource,
} from './utils/canvasTools';
import { StorefrontHeader } from './components/StorefrontHeader';
import { ProductDetailHero } from './components/ProductDetailHero';
import { ContextFitWorkspace } from './components/ContextFitWorkspace';
import { CatalogGrid } from './components/CatalogGrid';
import { CartDrawer } from './components/CartDrawer';

async function parseJsonResponse<T>(res: Response, fallbackLabel: string): Promise<T> {
  const raw = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    parsed = null;
  }

  if (!res.ok) {
    const serverMsg =
      parsed && typeof parsed.error === 'string' && parsed.error.trim() ? parsed.error.trim() : '';
    if (serverMsg) {
      throw new Error(serverMsg);
    }
    if (res.status === 404) {
      throw new Error(
        `${fallbackLabel} endpoint was not found (HTTP 404). Make sure the /api backend is deployed and GEMINI_API_KEY is configured.`
      );
    }
    if (res.status === 413) {
      throw new Error('Image payload was too large. Try uploading a smaller room photo.');
    }
    if (res.status === 504) {
      throw new Error(`${fallbackLabel} timed out on the server. Please try again.`);
    }
    throw new Error(`${fallbackLabel} failed (HTTP ${res.status}).`);
  }

  if (!parsed) {
    throw new Error(
      `${fallbackLabel} returned an unexpected non-JSON response. Please check that the /api backend is running.`
    );
  }

  return parsed as T;
}

function getInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem('contextfit-theme');
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // ignore storage errors
  }
  return 'light';
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [catalog] = useState<MerchantChair[]>(MERCHANT_CHAIRS);
  const [selectedChairId, setSelectedChairId] = useState<string>(MERCHANT_CHAIRS[0].id);
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Room photo (HTML canvas resized to max 1400px) & optional exact placement pin
  const [roomPhoto, setRoomPhoto] = useState<RoomPhoto | null>(null);
  const [placementPin, setPlacementPin] = useState<PlacementPin | null>(null);
  const [isProcessingRoom, setIsProcessingRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  // ContextFit decision loop state
  const [userGoal, setUserGoal] = useState<string>(INITIAL_GOAL_PROMPTS[0]);
  const [measurements, setMeasurements] = useState<UserMeasurements>({});
  const [turns, setTurns] = useState<ContextFitAnalysis[]>([]);
  const [activeTurnIndex, setActiveTurnIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Photorealistic room visualization renders (gemini-3.1-flash-lite-image)
  const [visualRenders, setVisualRenders] = useState<Record<string, VisualPreviewRender>>({});
  const [activePreviewKey, setActivePreviewKey] = useState<string>('');

  // Merchant shopping bag state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  const sampleRoomBooted = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('contextfit-theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const loadSampleApartmentRoom = useCallback(async () => {
    setIsProcessingRoom(true);
    setRoomError(null);
    try {
      const optimized = await optimizeRoomImageFromSource(
        APARTMENT_WINDOW_ROOM.url,
        APARTMENT_WINDOW_ROOM.name
      );
      setRoomPhoto(optimized);
      setPlacementPin(null);
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Unable to load sample apartment photo.');
    } finally {
      setIsProcessingRoom(false);
    }
  }, []);

  useEffect(() => {
    if (sampleRoomBooted.current) return;
    sampleRoomBooted.current = true;
    loadSampleApartmentRoom();
  }, [loadSampleApartmentRoom]);

  const selectedChairIndex = Math.max(
    0,
    catalog.findIndex((c) => c.id === selectedChairId)
  );
  const currentChair = catalog[selectedChairIndex] ?? catalog[0];

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((chair) => {
      if (activeCategory === 'High-Back' && chair.backProfile !== 'High-Back') return false;
      if (activeCategory === 'Low-Back' && chair.backProfile !== 'Low-Back') return false;
      if (activeCategory === 'Open / Airy' && chair.visualWeight !== 'Open / Airy') return false;
      if (q) {
        const hay = `${chair.name} ${chair.designer} ${chair.material} ${chair.backProfile} ${chair.visualWeight} ${chair.price}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalog, activeCategory, searchQuery]);

  const handleSelectChair = (chairId: string) => {
    if (chairId === selectedChairId) return;
    setSelectedChairId(chairId);
    setTurns([]);
    setActiveTurnIndex(0);
    setAnalysisError(null);
    setVisualRenders({});
    setActivePreviewKey('');
    document.getElementById('product-view')?.scrollIntoView({ behavior: 'smooth' });
  };

  const handlePrevChair = () => {
    const prevIdx = (selectedChairIndex - 1 + catalog.length) % catalog.length;
    handleSelectChair(catalog[prevIdx].id);
  };

  const handleNextChair = () => {
    const nextIdx = (selectedChairIndex + 1) % catalog.length;
    handleSelectChair(catalog[nextIdx].id);
  };

  const handleUploadRoomFile = async (file: File) => {
    setIsProcessingRoom(true);
    setRoomError(null);
    try {
      const optimized = await optimizeRoomImageFile(file);
      setRoomPhoto(optimized);
      setPlacementPin(null);
      setTurns([]);
      setActiveTurnIndex(0);
      setVisualRenders({});
      setActivePreviewKey('');
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Unable to process room photo.');
    } finally {
      setIsProcessingRoom(false);
    }
  };

  const handleVisualizeInRoom = useCallback(
    async (
      key: string,
      chair: MerchantChair,
      options?: {
        customPlacementHint?: string;
        isPrimaryCheck?: boolean;
        usePinnedSpot?: boolean;
      }
    ) => {
      if (!roomPhoto) return;
      const isPrimaryCheck = Boolean(options?.isPrimaryCheck);
      const customPlacementHint = options?.customPlacementHint?.trim();
      const usePinnedSpot = options?.usePinnedSpot !== false;
      const activePin = usePinnedSpot ? placementPin : null;

      const label = isPrimaryCheck
        ? `${chair.name} in Your Room`
        : !usePinnedSpot && customPlacementHint
          ? `${chair.shortTitle} (Repositioned)`
          : `${chair.shortTitle} (${chair.dimensions.heightCm} cm H)`;

      setActivePreviewKey(key);
      if (!isPrimaryCheck) {
        setTimeout(() => {
          document
            .getElementById('room-scene-preview')
            ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 60);
      }
      setVisualRenders((prev) => ({
        ...prev,
        [key]: { status: 'rendering', label },
      }));

      try {
        const productImageBase64 = await imageUrlToDataUrl(chair.imageUrl);
        const notes = activePin
          ? `Place the ${chair.name} standing firmly on the floor right at the pinned coordinate, angled naturally into the space. Shopper intent: "${userGoal.trim()}". Keep every existing wall, door, window, floor surface, person, bag, and furniture piece in Image 1 completely unchanged.`
          : customPlacementHint
            ? `${customPlacementHint} Shopper intent: "${userGoal.trim()}". Keep every existing wall, door, window, floor surface, person, bag, and furniture piece in Image 1 completely unchanged.`
            : `Shopper intent: "${userGoal.trim()}". Place the ${chair.name} standing firmly on a clear, unobstructed floor area matching the shopper intent without moving or altering any existing objects in Image 1.`;

        const res = await fetch('/api/scene/render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomImageBase64: roomPhoto.dataUrl,
            roomMimeType: roomPhoto.mimeType,
            roomWidth: roomPhoto.resizedWidth,
            roomHeight: roomPhoto.resizedHeight,
            productImageBase64,
            productImageUrl: chair.imageUrl,
            productName: chair.name,
            productBrand: chair.designer,
            variantLabel: `${chair.finish} · ${chair.backProfile}`,
            placement: 'Floor / Corner',
            lightingMood: 'Match Room',
            customNotes: notes,
            placementPin: activePin ?? undefined,
            dimensionsCm: {
              heightCm: chair.dimensions.heightCm,
              widthCm: chair.dimensions.widthCm,
              depthCm: chair.dimensions.depthCm,
            },
          }),
        });
        const data = await parseJsonResponse<{
          imageDataUrl: string;
          aspectRatio: SupportedAspectRatio;
          renderTimeMs: number;
        }>(res, 'Room scene preview');

        setVisualRenders((prev) => ({
          ...prev,
          [key]: {
            status: 'done',
            imageDataUrl: data.imageDataUrl,
            aspectRatio: data.aspectRatio,
            renderTimeMs: data.renderTimeMs,
            label,
          },
        }));
      } catch (err) {
        setVisualRenders((prev) => ({
          ...prev,
          [key]: {
            status: 'error',
            error: err instanceof Error ? err.message : 'Room scene preview failed.',
            label,
          },
        }));
      }
    },
    [roomPhoto, userGoal, placementPin]
  );

  const handleRunAnalysis = async () => {
    if (!roomPhoto || !userGoal.trim()) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    const primaryKey = `primary-${currentChair.id}`;
    // If the user pinned an exact floor spot, start rendering immediately in parallel.
    // Otherwise, wait for ContextFit analysis to identify exact room landmarks first so placement is grounded, not random.
    const startedEarlyRender = Boolean(placementPin);
    if (startedEarlyRender) {
      void handleVisualizeInRoom(primaryKey, currentChair, {
        isPrimaryCheck: true,
        usePinnedSpot: true,
      });
    }

    try {
      const res = await fetch('/api/contextfit/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomImageBase64: roomPhoto.dataUrl,
          roomMimeType: roomPhoto.mimeType,
          currentChairId: currentChair.id,
          currentChair,
          catalog,
          userGoal: userGoal.trim(),
          measurements,
        }),
      });
      const data = await parseJsonResponse<{
        analysis: ContextFitAnalysis;
        resolvedMeasurements?: UserMeasurements;
      }>(res, 'Fit analysis');

      if (data.resolvedMeasurements) {
        setMeasurements(data.resolvedMeasurements);
      }
      setTurns([data.analysis]);
      setActiveTurnIndex(0);

      if (!startedEarlyRender) {
        void handleVisualizeInRoom(primaryKey, currentChair, {
          customPlacementHint: data.analysis.initialPlacementHint || userGoal.trim(),
          isPrimaryCheck: true,
          usePinnedSpot: false,
        });
      }
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Could not complete fit analysis.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleRunRevision = async (
    followUpMessage: string,
    measurementPatch?: Partial<UserMeasurements>
  ) => {
    if (!roomPhoto || !followUpMessage.trim()) return;
    const nextMeasurements: UserMeasurements = {
      ...measurements,
      ...(measurementPatch ?? {}),
    };
    if (measurementPatch) {
      setMeasurements(nextMeasurements);
    }

    setIsAnalyzing(true);
    setAnalysisError(null);
    try {
      const previousTurnsSummary = turns.map(summarizeAnalysisForHistory);
      const nextTurnNumber = turns.length + 1;

      const res = await fetch('/api/contextfit/revise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomImageBase64: roomPhoto.dataUrl,
          roomMimeType: roomPhoto.mimeType,
          currentChairId: currentChair.id,
          currentChair,
          catalog,
          userGoal: userGoal.trim(),
          followUpMessage: followUpMessage.trim(),
          measurements: nextMeasurements,
          previousTurnsSummary,
          turnNumber: nextTurnNumber,
        }),
      });
      const data = await parseJsonResponse<{
        analysis: ContextFitAnalysis;
        resolvedMeasurements?: UserMeasurements;
      }>(res, 'Plan revision');

      if (data.resolvedMeasurements) {
        setMeasurements(data.resolvedMeasurements);
      }
      const revisedAnalysis = data.analysis;
      setTurns((prev) => {
        const updated = [...prev, revisedAnalysis];
        setActiveTurnIndex(updated.length - 1);
        return updated;
      });
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Could not revise plan.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAddToCart = (chair: MerchantChair) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.chair.id === chair.id);
      if (existing) {
        return prev.map((i) =>
          i.chair.id === chair.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { chair, quantity: 1 }];
    });
    setIsCartOpen(true);
  };

  const handleUpdateCartQty = (chairId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.chair.id === chairId ? { ...item, quantity: item.quantity + delta } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const handleRemoveCartItem = (chairId: string) => {
    setCart((prev) => prev.filter((item) => item.chair.id !== chairId));
  };

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div
      id="top"
      className="min-h-screen flex flex-col bg-white dark:bg-[#111111] text-[#0E0E0E] dark:text-[#F2F2F2]"
    >
      <StorefrontHeader
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        cartCount={cartCount}
        onOpenCart={() => setIsCartOpen(true)}
        activeCategory={activeCategory}
        onSelectCategory={(cat) => {
          setActiveCategory(cat);
          document.getElementById('merchant-catalog')?.scrollIntoView({ behavior: 'smooth' });
        }}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchSubmit={() =>
          document.getElementById('merchant-catalog')?.scrollIntoView({ behavior: 'smooth' })
        }
      />

      <main className="flex-1">
        {/* Screen 1: Swiss Architectural Merchant PDP */}
        <ProductDetailHero
          chair={currentChair}
          chairIndex={selectedChairIndex}
          totalChairs={catalog.length}
          onPrevChair={handlePrevChair}
          onNextChair={handleNextChair}
          onLaunchContextFit={() =>
            document.getElementById('contextfit')?.scrollIntoView({ behavior: 'smooth' })
          }
          onAddToCart={handleAddToCart}
        />

        {/* Screens 2–5: Embedded ContextFit Constraint-Aware Decision Agent */}
        <ContextFitWorkspace
          currentChair={currentChair}
          catalog={catalog}
          roomPhoto={roomPhoto}
          placementPin={placementPin}
          isProcessingRoom={isProcessingRoom}
          roomError={roomError}
          userGoal={userGoal}
          measurements={measurements}
          turns={turns}
          activeTurnIndex={activeTurnIndex}
          isAnalyzing={isAnalyzing}
          analysisError={analysisError}
          visualRenders={visualRenders}
          activePreviewKey={activePreviewKey}
          onSelectPreviewKey={setActivePreviewKey}
          onChangePlacementPin={setPlacementPin}
          onUploadRoomFile={handleUploadRoomFile}
          onUseSampleRoom={loadSampleApartmentRoom}
          onChangeGoal={setUserGoal}
          onChangeMeasurements={(patch) =>
            setMeasurements((prev) => ({ ...prev, ...patch }))
          }
          onRunAnalysis={handleRunAnalysis}
          onRunRevision={handleRunRevision}
          onSelectTurn={setActiveTurnIndex}
          onResetSession={() => {
            setTurns([]);
            setActiveTurnIndex(0);
            setAnalysisError(null);
            setMeasurements({});
            setVisualRenders({});
            setActivePreviewKey('');
          }}
          onSelectChair={handleSelectChair}
          onAddToCart={handleAddToCart}
          onVisualizeInRoom={handleVisualizeInRoom}
        />

        {/* Merchant Same-Store Catalog Grid */}
        <CatalogGrid
          chairs={filteredCatalog}
          selectedChairId={currentChair.id}
          activeCategory={activeCategory}
          searchQuery={searchQuery}
          onSelectChair={handleSelectChair}
          onClearFilters={() => {
            setActiveCategory('All');
            setSearchQuery('');
          }}
        />
      </main>

      {/* ECC-inspired Stark Editorial Footer */}
      <footer className="border-t-4 border-[#0E0E0E] dark:border-[#F2F2F2]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 py-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[#666666] dark:text-[#9CA3AF]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-[#0E0E0E] dark:text-[#F2F2F2]">FORMA</span>
            <span aria-hidden="true">·</span>
            <span>ContextFit Decision Agent — Find what fits. Understand what doesn&apos;t.</span>
          </div>
          <div className="flex items-center gap-6">
            <a href="#product-view" className="hover:text-[#0E0E0E] dark:hover:text-white">
              Product
            </a>
            <a href="#contextfit" className="hover:text-[#0E0E0E] dark:hover:text-white">
              ContextFit
            </a>
            <a href="#compare-matrix" className="hover:text-[#0E0E0E] dark:hover:text-white">
              Compare
            </a>
            <a href="#merchant-catalog" className="hover:text-[#0E0E0E] dark:hover:text-white">
              Catalog
            </a>
          </div>
        </div>
      </footer>

      <CartDrawer
        isOpen={isCartOpen}
        items={cart}
        onClose={() => setIsCartOpen(false)}
        onUpdateQty={handleUpdateCartQty}
        onRemoveItem={handleRemoveCartItem}
        onClearCart={() => setCart([])}
      />
    </div>
  );
}
