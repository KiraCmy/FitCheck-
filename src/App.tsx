import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CartItem,
  ContextFitAnalysis,
  MerchantChair,
  UserMeasurements,
  VisualPreviewRender,
} from './types/contextFit';
import type { RoomPhoto } from './types/studio';
import {
  APARTMENT_WINDOW_ROOM,
  INITIAL_GOAL_PROMPTS,
  MERCHANT_CHAIRS,
} from './data/merchantCatalog';
import { summarizeAnalysisForHistory } from './utils/contextFitLogic';
import { optimizeRoomImageFile, optimizeRoomImageFromSource } from './utils/canvasTools';
import { StorefrontHeader } from './components/StorefrontHeader';
import { ProductDetailHero } from './components/ProductDetailHero';
import { ContextFitWorkspace } from './components/ContextFitWorkspace';
import { CatalogGrid } from './components/CatalogGrid';
import { CartDrawer } from './components/CartDrawer';

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

  // Room photo (HTML canvas resized to max 1400px)
  const [roomPhoto, setRoomPhoto] = useState<RoomPhoto | null>(null);
  const [isProcessingRoom, setIsProcessingRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);

  // ContextFit decision loop state
  const [userGoal, setUserGoal] = useState<string>(INITIAL_GOAL_PROMPTS[0]);
  const [measurements, setMeasurements] = useState<UserMeasurements>({});
  const [turns, setTurns] = useState<ContextFitAnalysis[]>([]);
  const [activeTurnIndex, setActiveTurnIndex] = useState<number>(0);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Optional room visualization renders (gemini-3.1-flash-lite-image)
  const [visualRenders, setVisualRenders] = useState<Record<string, VisualPreviewRender>>({});

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
      setTurns([]);
      setActiveTurnIndex(0);
      setVisualRenders({});
    } catch (err) {
      setRoomError(err instanceof Error ? err.message : 'Unable to process room photo.');
    } finally {
      setIsProcessingRoom(false);
    }
  };

  const handleRunAnalysis = async () => {
    if (!roomPhoto || !userGoal.trim()) return;
    setIsAnalyzing(true);
    setAnalysisError(null);
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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `ContextFit analysis failed (HTTP ${res.status}).`);
      }
      if (data.resolvedMeasurements) {
        setMeasurements(data.resolvedMeasurements);
      }
      setTurns([data.analysis as ContextFitAnalysis]);
      setActiveTurnIndex(0);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Could not complete ContextFit analysis.'
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
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Preference revision failed (HTTP ${res.status}).`);
      }
      if (data.resolvedMeasurements) {
        setMeasurements(data.resolvedMeasurements);
      }
      const revisedAnalysis = data.analysis as ContextFitAnalysis;
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

  const handleVisualizeInRoom = async (
    key: string,
    chair: MerchantChair,
    customPlacementHint?: string
  ) => {
    if (!roomPhoto) return;
    const label = customPlacementHint
      ? `${chair.shortTitle} (Revised Placement)`
      : `${chair.shortTitle} (${chair.dimensions.heightCm} cm H)`;

    setVisualRenders((prev) => ({
      ...prev,
      [key]: { status: 'rendering', label },
    }));

    try {
      const res = await fetch('/api/scene/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomImageBase64: roomPhoto.dataUrl,
          roomMimeType: roomPhoto.mimeType,
          roomWidth: roomPhoto.resizedWidth,
          roomHeight: roomPhoto.resizedHeight,
          productImageUrl: chair.imageUrl,
          productName: chair.name,
          productBrand: chair.designer,
          variantLabel: `${chair.finish} · ${chair.backProfile}`,
          placement: 'Floor / Corner',
          lightingMood: 'Natural Light',
          customNotes:
            customPlacementHint ||
            `Place this ${chair.backProfile.toLowerCase()} chair naturally in the empty reading corner on the oak floor near the window and plaster wall, matching realistic apartment chair scale.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Visual preview failed.');
      }
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
          error: err instanceof Error ? err.message : 'Visual preview failed.',
          label,
        },
      }));
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
          isProcessingRoom={isProcessingRoom}
          roomError={roomError}
          userGoal={userGoal}
          measurements={measurements}
          turns={turns}
          activeTurnIndex={activeTurnIndex}
          isAnalyzing={isAnalyzing}
          analysisError={analysisError}
          visualRenders={visualRenders}
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
