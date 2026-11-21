import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, FormEvent } from 'react';
import {
  Upload,
  ArrowUpRight,
  Loader2,
  Eye,
  Download,
  ShoppingBag,
  Columns2,
  LayoutGrid,
  Check,
  RotateCcw,
} from 'lucide-react';
import type {
  ContextFitAnalysis,
  MerchantChair,
  UserMeasurements,
  VisualPreviewRender,
} from '../types/contextFit';
import type { RoomPhoto } from '../types/studio';
import { INITIAL_GOAL_PROMPTS, REVISION_FOLLOWUP_CHIPS } from '../data/merchantCatalog';
import {
  evaluateDeterministicConstraints,
  formatEvidenceLabel,
} from '../utils/contextFitLogic';
import { downloadImageAsPng } from '../utils/canvasTools';
import { SafeImage } from './SafeImage';
import { SplitCompareSlider } from './SplitCompareSlider';

interface ContextFitWorkspaceProps {
  currentChair: MerchantChair;
  catalog: MerchantChair[];
  roomPhoto: RoomPhoto | null;
  isProcessingRoom: boolean;
  roomError: string | null;
  userGoal: string;
  measurements: UserMeasurements;
  turns: ContextFitAnalysis[];
  activeTurnIndex: number;
  isAnalyzing: boolean;
  analysisError: string | null;
  visualRenders: Record<string, VisualPreviewRender>;
  onUploadRoomFile: (file: File) => void;
  onUseSampleRoom: () => void;
  onChangeGoal: (goal: string) => void;
  onChangeMeasurements: (patch: Partial<UserMeasurements>) => void;
  onRunAnalysis: () => void;
  onRunRevision: (followUp: string, measurementPatch?: Partial<UserMeasurements>) => void;
  onSelectTurn: (idx: number) => void;
  onResetSession: () => void;
  onSelectChair: (chairId: string) => void;
  onAddToCart: (chair: MerchantChair) => void;
  onVisualizeInRoom: (key: string, chair: MerchantChair, customPlacementHint?: string) => void;
}

export function ContextFitWorkspace({
  currentChair,
  catalog,
  roomPhoto,
  isProcessingRoom,
  roomError,
  userGoal,
  measurements,
  turns,
  activeTurnIndex,
  isAnalyzing,
  analysisError,
  visualRenders,
  onUploadRoomFile,
  onUseSampleRoom,
  onChangeGoal,
  onChangeMeasurements,
  onRunAnalysis,
  onRunRevision,
  onSelectTurn,
  onResetSession,
  onSelectChair,
  onAddToCart,
  onVisualizeInRoom,
}: ContextFitWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [followUpInput, setFollowUpInput] = useState('');
  const [clarifyInput, setClarifyInput] = useState('');
  const [visualMode, setVisualMode] = useState<'grid' | 'split'>('split');
  const [splitLeftKey, setSplitLeftKey] = useState<string>('__original__');
  const [splitRightKey, setSplitRightKey] = useState<string>('');
  const [exportingKey, setExportingKey] = useState<string | null>(null);

  const activeAnalysis = turns[activeTurnIndex] ?? null;
  const catalogById = new Map(catalog.map((c) => [c.id, c]));

  const deterministic = evaluateDeterministicConstraints(currentChair, measurements);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadRoomFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onUploadRoomFile(file);
  };

  const handleFollowUpSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = followUpInput.trim();
    if (!trimmed || isAnalyzing) return;
    onRunRevision(trimmed);
    setFollowUpInput('');
  };

  const handleClarifySubmit = (e: FormEvent) => {
    e.preventDefault();
    const raw = clarifyInput.trim();
    if (!raw || isAnalyzing || !activeAnalysis) return;

    const num = Number.parseFloat(raw.replace(/[^0-9.]/g, ''));
    const patch: Partial<UserMeasurements> = {};
    let message = raw;

    if (Number.isFinite(num) && num > 0) {
      if (activeAnalysis.clarifyingFieldHint === 'windowSillHeightCm') {
        patch.windowSillHeightCm = Math.round(num);
        message = `My window sill height is ${Math.round(num)} cm.`;
      } else if (activeAnalysis.clarifyingFieldHint === 'availableWidthCm') {
        patch.availableWidthCm = Math.round(num);
        message = `The available wall width is ${Math.round(num)} cm.`;
      } else if (activeAnalysis.clarifyingFieldHint === 'maxBudgetUsd') {
        patch.maxBudgetUsd = Math.round(num);
        message = `My maximum budget is $${Math.round(num)}.`;
      }
    }

    onRunRevision(message, patch);
    setClarifyInput('');
  };

  const renderedEntries = Object.entries(visualRenders).filter(
    ([, val]) => val.status === 'done' && Boolean(val.imageDataUrl)
  );

  const effectiveRightKey =
    splitRightKey && visualRenders[splitRightKey]?.imageDataUrl
      ? splitRightKey
      : renderedEntries[0]?.[0] ?? '';

  const effectiveLeftUrl =
    splitLeftKey === '__original__' || !visualRenders[splitLeftKey]?.imageDataUrl
      ? roomPhoto?.dataUrl ?? ''
      : visualRenders[splitLeftKey].imageDataUrl!;

  const effectiveLeftLabel =
    splitLeftKey === '__original__' || !visualRenders[splitLeftKey]?.imageDataUrl
      ? 'Original Room'
      : visualRenders[splitLeftKey].label || 'Preview A';

  const effectiveRightUrl = effectiveRightKey
    ? visualRenders[effectiveRightKey]?.imageDataUrl ?? roomPhoto?.dataUrl ?? ''
    : roomPhoto?.dataUrl ?? '';

  const effectiveRightLabel = effectiveRightKey
    ? visualRenders[effectiveRightKey]?.label || 'Preview B'
    : 'Original Room';

  const handleExportPng = async (key: string, label: string, url: string) => {
    setExportingKey(key);
    try {
      await downloadImageAsPng(url, `contextfit-${label}`);
    } finally {
      setExportingKey(null);
    }
  };

  // Chairs to display in the verified comparison matrix (current + recommended alternatives)
  const matrixChairs: MerchantChair[] = activeAnalysis
    ? [
        currentChair,
        ...activeAnalysis.alternatives
          .map((a) => catalogById.get(a.productId))
          .filter((c): c is MerchantChair => Boolean(c)),
      ]
    : catalog.slice(0, 3);

  return (
    <section
      id="contextfit"
      aria-labelledby="contextfit-heading"
      className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 pt-2 pb-16 scroll-mt-6"
    >
      {/* Thick ECC 4px Black Section Rule */}
      <div className="border-t-4 border-[#0E0E0E] dark:border-[#F2F2F2] pt-8 pb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-[#737373] dark:text-[#9CA3AF] mb-1.5">
            ContextFit · Embedded Decision Agent
          </p>
          <h2
            id="contextfit-heading"
            className="text-3xl sm:text-5xl font-bold tracking-[-0.035em] leading-[1.05] text-[#0E0E0E] dark:text-[#F2F2F2]"
          >
            Find what fits. Understand what doesn&apos;t.
          </h2>
        </div>

        <div className="flex items-center gap-3">
          {turns.length > 0 && (
            <button
              type="button"
              onClick={onResetSession}
              className="h-9 px-3.5 text-xs font-medium border border-[#DFDFDF] dark:border-[#2C2C2C] text-[#525252] dark:text-[#A3A3A3] hover:border-[#0E0E0E] dark:hover:border-[#F2F2F2] hover:text-[#0E0E0E] dark:hover:text-white inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Session</span>
            </button>
          )}
        </div>
      </div>

      {/* PANEL A: UNDERSTAND MY SPACE (2-Column Swiss Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 border border-[#DFDFDF] dark:border-[#262626] items-stretch">
        {/* Left Cell: Room Photo Upload + Canvas 1400px Optimization */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`lg:col-span-5 p-6 lg:border-r border-b lg:border-b-0 border-[#DFDFDF] dark:border-[#262626] flex flex-col justify-between gap-4 transition-colors ${
            isDragging ? 'bg-[#F5F5F4] dark:bg-[#1A1A1A]' : 'bg-white dark:bg-[#111111]'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-[#0E0E0E] dark:text-[#F2F2F2]">
                01. Your Room Photo
              </h3>
              <p className="text-xs text-[#737373] dark:text-[#8E8E93] mt-0.5">
                Resized on canvas to max 1400px · Used for visual evidence only
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-8 px-3 text-xs font-medium border border-[#0E0E0E] dark:border-[#F2F2F2] text-[#0E0E0E] dark:text-[#F2F2F2] hover:bg-[#0E0E0E] hover:text-white dark:hover:bg-[#F2F2F2] dark:hover:text-[#111111] transition-colors whitespace-nowrap"
              >
                {roomPhoto ? 'Upload Photo' : 'Browse'}
              </button>
              {!roomPhoto && (
                <button
                  type="button"
                  onClick={onUseSampleRoom}
                  className="h-8 px-3 text-xs font-medium border border-[#DFDFDF] dark:border-[#2C2C2C] text-[#525252] dark:text-[#A3A3A3] hover:border-[#0E0E0E] transition-colors whitespace-nowrap"
                >
                  Sample Room
                </button>
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            aria-label="Upload your room photograph"
            className="hidden"
          />

          {roomPhoto ? (
            <div className="space-y-2.5">
              <div className="aspect-[4/3] w-full overflow-hidden border border-[#DFDFDF] dark:border-[#262626] bg-[#F5F5F4] dark:bg-[#181818]">
                <SafeImage
                  src={roomPhoto.dataUrl}
                  alt={`Room photo: ${roomPhoto.name}`}
                  className="w-full h-full object-cover"
                />
              </div>
              <div
                className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-[#666666] dark:text-[#9CA3AF]"
                data-testid="room-dimensions-readout"
              >
                <span className="truncate max-w-[200px]">{roomPhoto.name}</span>
                <span>
                  {roomPhoto.originalWidth}×{roomPhoto.originalHeight} → {roomPhoto.resizedWidth}×
                  {roomPhoto.resizedHeight}px · {roomPhoto.aspectRatio}
                </span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingRoom}
              className="flex-1 min-h-[240px] border border-dashed border-[#BDBDBD] dark:border-[#3A3A3A] flex flex-col items-center justify-center p-6 text-center hover:border-[#0E0E0E] dark:hover:border-[#F2F2F2] transition-colors"
            >
              {isProcessingRoom ? (
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
              ) : (
                <Upload className="w-6 h-6 mb-2 text-[#737373]" strokeWidth={1.5} />
              )}
              <span className="text-xs font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
                {isProcessingRoom ? 'Optimizing photo…' : 'Drop a room photo or click to upload'}
              </span>
            </button>
          )}

          {roomError && (
            <p role="alert" className="text-xs text-[#B91C1C]">
              {roomError}
            </p>
          )}
        </div>

        {/* Right Cell: Shopping Goal + Optional Verified Measurements + Analyze CTA */}
        <div className="lg:col-span-7 p-6 flex flex-col justify-between gap-6 bg-white dark:bg-[#111111]">
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label
                  htmlFor="contextfit-goal-input"
                  className="text-sm font-bold text-[#0E0E0E] dark:text-[#F2F2F2]"
                >
                  02. State Your Goal &amp; Constraints
                </label>
                <span className="text-[11px] font-mono text-[#737373] dark:text-[#8E8E93]">
                  Evaluating: {currentChair.name} ({currentChair.dimensions.heightCm} cm H)
                </span>
              </div>
              <textarea
                id="contextfit-goal-input"
                rows={2}
                value={userGoal}
                onChange={(e) => onChangeGoal(e.target.value)}
                placeholder="e.g., I want a reading chair here, but I don't want to block the window."
                className="w-full px-3.5 py-2.5 text-sm border border-[#0E0E0E] dark:border-[#4A4A4A] bg-white dark:bg-[#161616] text-[#0E0E0E] dark:text-[#F2F2F2] placeholder:text-[#8E8E93] focus:outline-none resize-none"
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {INITIAL_GOAL_PROMPTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => onChangeGoal(preset)}
                    className={`px-2.5 py-1 text-[11px] border transition-colors text-left ${
                      userGoal.trim() === preset
                        ? 'border-[#0E0E0E] dark:border-[#F2F2F2] bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111]'
                        : 'border-[#DFDFDF] dark:border-[#2C2C2C] text-[#525252] dark:text-[#A3A3A3] hover:border-[#0E0E0E] dark:hover:border-[#F2F2F2]'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional Verified Measurements (Deterministic Hard-Constraint Rules) */}
            <div className="pt-4 border-t border-[#DFDFDF] dark:border-[#262626]">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-xs font-bold text-[#0E0E0E] dark:text-[#F2F2F2]">
                  Optional Verified Measurements (Deterministic Checks)
                </span>
                <span className="text-[11px] text-[#737373] dark:text-[#8E8E93]">
                  Leave blank to see how ContextFit flags unknowns from a single photo
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="measure-budget"
                    className="block text-[11px] text-[#666666] dark:text-[#9CA3AF] mb-1"
                  >
                    Max Budget (USD)
                  </label>
                  <input
                    id="measure-budget"
                    type="number"
                    min={100}
                    max={10000}
                    placeholder="e.g., 750"
                    value={measurements.maxBudgetUsd ?? ''}
                    onChange={(e) =>
                      onChangeMeasurements({
                        maxBudgetUsd: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full h-9 px-3 text-xs font-mono tabular-nums border border-[#DFDFDF] dark:border-[#2C2C2C] bg-white dark:bg-[#161616] text-[#0E0E0E] dark:text-[#F2F2F2] focus:outline-none focus:border-[#0E0E0E] dark:focus:border-[#F2F2F2]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="measure-sill"
                    className="block text-[11px] text-[#666666] dark:text-[#9CA3AF] mb-1"
                  >
                    Window Sill Height (cm)
                  </label>
                  <input
                    id="measure-sill"
                    type="number"
                    min={20}
                    max={200}
                    placeholder="e.g., 65"
                    value={measurements.windowSillHeightCm ?? ''}
                    onChange={(e) =>
                      onChangeMeasurements({
                        windowSillHeightCm: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full h-9 px-3 text-xs font-mono tabular-nums border border-[#DFDFDF] dark:border-[#2C2C2C] bg-white dark:bg-[#161616] text-[#0E0E0E] dark:text-[#F2F2F2] focus:outline-none focus:border-[#0E0E0E] dark:focus:border-[#F2F2F2]"
                  />
                </div>
                <div>
                  <label
                    htmlFor="measure-width"
                    className="block text-[11px] text-[#666666] dark:text-[#9CA3AF] mb-1"
                  >
                    Available Width (cm)
                  </label>
                  <input
                    id="measure-width"
                    type="number"
                    min={40}
                    max={500}
                    placeholder="e.g., 90"
                    value={measurements.availableWidthCm ?? ''}
                    onChange={(e) =>
                      onChangeMeasurements({
                        availableWidthCm: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                    className="w-full h-9 px-3 text-xs font-mono tabular-nums border border-[#DFDFDF] dark:border-[#2C2C2C] bg-white dark:bg-[#161616] text-[#0E0E0E] dark:text-[#F2F2F2] focus:outline-none focus:border-[#0E0E0E] dark:focus:border-[#F2F2F2]"
                  />
                </div>
              </div>
            </div>
          </div>

          {analysisError && (
            <p role="alert" className="text-xs font-medium text-[#B91C1C]">
              {analysisError}
            </p>
          )}

          {/* Primary Action Footer */}
          <div className="pt-4 border-t border-[#DFDFDF] dark:border-[#262626] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-[#666666] dark:text-[#9CA3AF] flex-1">
              Separates confirmed catalog facts, visual inferences, and missing measurements—never
              an opaque fit score.
            </p>
            <button
              type="button"
              onClick={onRunAnalysis}
              disabled={!roomPhoto || !userGoal.trim() || isAnalyzing}
              className="h-11 px-6 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-85 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity whitespace-nowrap shrink-0"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Evaluating Fit…</span>
                </>
              ) : (
                <>
                  <span>Analyze Fit — Why Not This?</span>
                  <ArrowUpRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* PANEL B, C, D: EVIDENCE-BASED DECISION & REVISION LOOP */}
      {activeAnalysis && (
        <div className="mt-10 space-y-10" data-testid="contextfit-results">
          {/* Session Turn Switcher & Revision Callout */}
          <div className="border-t-2 border-[#0E0E0E] dark:border-[#F2F2F2] pt-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-xs font-mono text-[#737373] dark:text-[#9CA3AF]">
                  Why Not This Product? · Turn {activeAnalysis.turnNumber} of {turns.length}
                </p>
                <h3 className="text-2xl sm:text-3xl font-bold tracking-[-0.025em] text-[#0E0E0E] dark:text-[#F2F2F2] mt-1 [text-wrap:balance]">
                  {activeAnalysis.verdictHeadline}
                </h3>
              </div>

              {turns.length > 1 && (
                <div
                  role="tablist"
                  aria-label="Decision revision history"
                  className="inline-flex border border-[#0E0E0E] dark:border-[#F2F2F2]"
                >
                  {turns.map((turn, idx) => (
                    <button
                      key={`turn-${turn.turnNumber}-${turn.analyzedAt}`}
                      type="button"
                      role="tab"
                      aria-selected={idx === activeTurnIndex}
                      onClick={() => onSelectTurn(idx)}
                      className={`h-9 px-3.5 text-xs font-mono transition-colors whitespace-nowrap ${
                        idx === activeTurnIndex
                          ? 'bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] font-semibold'
                          : 'bg-white dark:bg-[#111111] text-[#525252] dark:text-[#A3A3A3] hover:text-[#0E0E0E] dark:hover:text-white'
                      }`}
                    >
                      Turn {turn.turnNumber}
                      {turn.turnNumber > 1 ? ' · Revised' : ' · Initial'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Revision Adaptation Summary (Hero Turn 2+ Callout) */}
            {activeAnalysis.planRevisionSummary && (
              <div
                data-testid="revision-summary-banner"
                className="mb-6 p-4 border border-[#0E0E0E] dark:border-[#F2F2F2] bg-[#FAFAFA] dark:bg-[#181818]"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-[#B91C1C] dark:text-[#F87171] mb-1">
                  <span>Plan Revised</span>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#525252] dark:text-[#A3A3A3]">
                    Response to &ldquo;{activeAnalysis.userPrompt}&rdquo;
                  </span>
                </div>
                <p className="text-sm font-medium text-[#0E0E0E] dark:text-[#F2F2F2] leading-relaxed">
                  {activeAnalysis.planRevisionSummary}
                </p>
              </div>
            )}

            {/* 3-Column Evidence Breakdown (Observation / Product Facts / Potential Conflicts & Unknowns) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 border border-[#DFDFDF] dark:border-[#262626]">
              {/* Col 1: Room Observations */}
              <div className="p-5 lg:border-r border-b lg:border-b-0 border-[#DFDFDF] dark:border-[#262626] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold tracking-[0.02em] text-[#0E0E0E] dark:text-[#F2F2F2]">
                    Room Observations
                  </h4>
                  <span className="text-[11px] font-mono text-[#737373] dark:text-[#8E8E93]">
                    Visual inference
                  </span>
                </div>
                <ul className="space-y-2.5 text-xs text-[#333333] dark:text-[#CCCCCC]">
                  {activeAnalysis.roomObservations.map((obs, idx) => (
                    <li
                      key={idx}
                      className="pb-2.5 last:pb-0 border-b last:border-b-0 border-[#EFEFEF] dark:border-[#222222] leading-relaxed"
                    >
                      <div>{obs.claim}</div>
                      <div className="text-[10px] font-mono text-[#737373] dark:text-[#8E8E93] mt-1">
                        Status: {obs.status === 'confirmed_fact' ? 'Confirmed fact' : 'Visual inference (single photo)'}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Col 2: Verified Product Facts & Parsed Constraints */}
              <div className="p-5 lg:border-r border-b lg:border-b-0 border-[#DFDFDF] dark:border-[#262626] space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold tracking-[0.02em] text-[#0E0E0E] dark:text-[#F2F2F2]">
                    Verified Product Facts
                  </h4>
                  <span className="text-[11px] font-mono text-[#0E0E0E] dark:text-[#F2F2F2]">
                    Confirmed fact
                  </span>
                </div>
                <ul className="space-y-2 text-xs text-[#333333] dark:text-[#CCCCCC]">
                  {deterministic.confirmedFacts.map((fact, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {fact}
                    </li>
                  ))}
                </ul>

                {activeAnalysis.constraints.length > 0 && (
                  <div className="pt-3 border-t border-[#EFEFEF] dark:border-[#222222] space-y-2">
                    <div className="text-[11px] font-bold text-[#0E0E0E] dark:text-[#F2F2F2]">
                      Active Constraints
                    </div>
                    <ul className="space-y-1.5 text-xs text-[#525252] dark:text-[#A3A3A3]">
                      {activeAnalysis.constraints.map((c, idx) => (
                        <li key={idx} className="leading-snug">
                          <span className="font-mono text-[11px] text-[#0E0E0E] dark:text-[#F2F2F2]">
                            [{c.type} · {c.priority}]
                          </span>{' '}
                          {c.detail}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Col 3: Potential Conflicts & Missing Data */}
              <div className="p-5 space-y-3 bg-[#FAFAFA] dark:bg-[#161616]">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold tracking-[0.02em] text-[#0E0E0E] dark:text-[#F2F2F2]">
                    Potential Conflicts &amp; Unknowns
                  </h4>
                  <span className="text-[11px] font-mono text-[#B91C1C] dark:text-[#F87171]">
                    {activeAnalysis.potentialConflicts.length} flagged
                  </span>
                </div>

                {activeAnalysis.potentialConflicts.length === 0 ? (
                  <p className="text-xs text-[#525252] dark:text-[#A3A3A3] leading-relaxed">
                    No hard or spatial conflicts detected against your stated goal and measurements.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {activeAnalysis.potentialConflicts.map((conflict, idx) => (
                      <div
                        key={idx}
                        className="pb-3 last:pb-0 border-b last:border-b-0 border-[#E5E5E5] dark:border-[#262626] space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
                            {conflict.title}
                          </span>
                          <span
                            className={`text-[10px] font-mono ${
                              conflict.status === 'confirmed_conflict'
                                ? 'text-[#B91C1C] dark:text-[#F87171] font-semibold'
                                : 'text-[#737373] dark:text-[#9CA3AF]'
                            }`}
                          >
                            {formatEvidenceLabel(conflict.status)}
                          </span>
                        </div>
                        <p className="text-xs text-[#333333] dark:text-[#CCCCCC] leading-relaxed">
                          {conflict.claim}
                        </p>
                        {conflict.productFact && (
                          <p className="text-[11px] text-[#666666] dark:text-[#9CA3AF]">
                            Catalog fact: {conflict.productFact}
                          </p>
                        )}
                        {conflict.missingData.length > 0 && (
                          <p className="text-[11px] font-mono text-[#666666] dark:text-[#9CA3AF]">
                            Unknowns: {conflict.missingData.join(' · ')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* One Focused Clarifying Question Bar */}
            <form
              onSubmit={handleClarifySubmit}
              className="border-x border-b border-[#DFDFDF] dark:border-[#262626] px-5 py-3.5 bg-white dark:bg-[#111111] flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="text-xs text-[#0E0E0E] dark:text-[#F2F2F2]">
                <span className="font-mono text-[#737373] dark:text-[#8E8E93] mr-2">
                  To verify:
                </span>
                <span className="font-medium">{activeAnalysis.clarifyingQuestion}</span>
              </div>
              <div className="flex items-stretch gap-2 shrink-0">
                <input
                  type="text"
                  value={clarifyInput}
                  onChange={(e) => setClarifyInput(e.target.value)}
                  placeholder={
                    activeAnalysis.clarifyingFieldHint === 'windowSillHeightCm'
                      ? 'e.g., 62 cm'
                      : activeAnalysis.clarifyingFieldHint === 'availableWidthCm'
                        ? 'e.g., 95 cm'
                        : 'Enter measurement or note…'
                  }
                  aria-label="Answer clarifying measurement question"
                  className="h-9 px-3 text-xs font-mono border border-[#DFDFDF] dark:border-[#2C2C2C] bg-white dark:bg-[#161616] text-[#0E0E0E] dark:text-[#F2F2F2] focus:outline-none focus:border-[#0E0E0E] dark:focus:border-[#F2F2F2] w-44"
                />
                <button
                  type="submit"
                  disabled={!clarifyInput.trim() || isAnalyzing}
                  className="h-9 px-4 border border-[#0E0E0E] dark:border-[#F2F2F2] text-xs font-semibold text-[#0E0E0E] dark:text-[#F2F2F2] hover:bg-[#0E0E0E] hover:text-white dark:hover:bg-[#F2F2F2] dark:hover:text-[#111111] disabled:opacity-40 transition-colors whitespace-nowrap"
                >
                  Verify
                </button>
              </div>
            </form>
          </div>

          {/* PANEL C: WHAT WOULD MAKE IT WORK? (Keep + Change Placement vs. 2 Same-Store Alternatives) */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-mono text-[#737373] dark:text-[#9CA3AF]">
                What Would Make It Work? · Minimum-Change Resolutions
              </p>
              <h3 className="text-xl sm:text-2xl font-bold tracking-[-0.02em] text-[#0E0E0E] dark:text-[#F2F2F2] mt-0.5">
                Keep Your Chair with New Placement, or Compare Two Same-Store Alternatives
              </h3>
            </div>

            <div
              className="grid grid-cols-1 lg:grid-cols-3 border border-[#DFDFDF] dark:border-[#262626]"
              data-testid="resolution-grid"
            >
              {/* Card 1: Keep Original Product, Change Placement */}
              <article className="p-6 lg:border-r border-b lg:border-b-0 border-[#DFDFDF] dark:border-[#262626] flex flex-col justify-between gap-5 bg-[#FAFAFA] dark:bg-[#161616]">
                <div className="space-y-4">
                  <div className="text-[11px] font-mono text-[#737373] dark:text-[#8E8E93]">
                    Path 01 · Keep Current Chair, Change Placement
                  </div>

                  <div className="aspect-[4/3] bg-white border border-[#DFDFDF] dark:border-[#262626] p-4 flex items-center justify-center">
                    <SafeImage
                      src={currentChair.imageUrl}
                      alt={currentChair.name}
                      className="max-h-44 object-contain brightness-[1.02] contrast-[1.04]"
                    />
                  </div>

                  <div>
                    <div className="text-xs font-mono tabular-nums text-[#666666] dark:text-[#9CA3AF]">
                      {currentChair.name} · {currentChair.price}
                    </div>
                    <h4 className="text-base font-bold text-[#0E0E0E] dark:text-[#F2F2F2] mt-1">
                      {activeAnalysis.placementStrategy.title}
                    </h4>
                    <p className="text-xs text-[#333333] dark:text-[#CCCCCC] leading-relaxed mt-2">
                      {activeAnalysis.placementStrategy.description}
                    </p>
                  </div>

                  <dl className="pt-3 border-t border-[#E5E5E5] dark:border-[#262626] space-y-2 text-xs">
                    <div>
                      <dt className="font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
                        What you gain
                      </dt>
                      <dd className="text-[#525252] dark:text-[#A3A3A3] mt-0.5">
                        {activeAnalysis.placementStrategy.gained}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
                        Trade-off
                      </dt>
                      <dd className="text-[#525252] dark:text-[#A3A3A3] mt-0.5">
                        {activeAnalysis.placementStrategy.tradeoff}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    disabled={visualRenders[`placement-${currentChair.id}`]?.status === 'rendering'}
                    onClick={() =>
                      onVisualizeInRoom(
                        `placement-${currentChair.id}`,
                        currentChair,
                        activeAnalysis.placementStrategy.renderHint
                      )
                    }
                    className="w-full h-10 px-3.5 border border-[#0E0E0E] dark:border-[#F2F2F2] bg-white dark:bg-[#111111] text-[#0E0E0E] dark:text-[#F2F2F2] text-xs font-semibold inline-flex items-center justify-between hover:bg-[#0E0E0E] hover:text-white dark:hover:bg-[#F2F2F2] dark:hover:text-[#111111] disabled:opacity-45 transition-colors"
                  >
                    <span>
                      {visualRenders[`placement-${currentChair.id}`]?.status === 'rendering'
                        ? 'Rendering placement preview…'
                        : 'Visualize New Placement in Room'}
                    </span>
                    {visualRenders[`placement-${currentChair.id}`]?.status === 'rendering' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => onAddToCart(currentChair)}
                    className="w-full h-10 px-3.5 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold inline-flex items-center justify-between hover:opacity-85 transition-opacity"
                  >
                    <span>Keep &amp; Add to Bag · {currentChair.price}</span>
                    <ShoppingBag className="w-3.5 h-3.5" />
                  </button>
                </div>
              </article>

              {/* Cards 2 & 3: Catalog-Grounded Alternatives */}
              {activeAnalysis.alternatives.map((alt, idx) => {
                const chair = catalogById.get(alt.productId);
                if (!chair) return null;
                const renderKey = `alt-${chair.id}`;
                const renderState = visualRenders[renderKey];

                return (
                  <article
                    key={chair.id}
                    className={`p-6 flex flex-col justify-between gap-5 bg-white dark:bg-[#111111] ${
                      idx === 0
                        ? 'lg:border-r border-b lg:border-b-0 border-[#DFDFDF] dark:border-[#262626]'
                        : ''
                    }`}
                  >
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#737373] dark:text-[#8E8E93]">
                        <span>Path 0{idx + 2} · Same-Store Alternative</span>
                        <span className="text-[#0E0E0E] dark:text-[#F2F2F2] font-medium">
                          {chair.price}
                        </span>
                      </div>

                      <div className="aspect-[4/3] bg-white border border-[#DFDFDF] dark:border-[#262626] p-4 flex items-center justify-center">
                        <SafeImage
                          src={chair.imageUrl}
                          alt={chair.name}
                          className="max-h-44 object-contain brightness-[1.02] contrast-[1.04]"
                        />
                      </div>

                      <div>
                        <div className="text-[11px] font-mono tabular-nums text-[#666666] dark:text-[#9CA3AF]">
                          H {chair.dimensions.heightCm} × W {chair.dimensions.widthCm} × D{' '}
                          {chair.dimensions.depthCm} cm · {chair.backProfile}
                        </div>
                        <h4 className="text-base font-bold text-[#0E0E0E] dark:text-[#F2F2F2] mt-1">
                          {chair.name}
                        </h4>
                        <p className="text-xs text-[#333333] dark:text-[#CCCCCC] leading-relaxed mt-2">
                          {alt.reason}
                        </p>
                      </div>

                      <dl className="pt-3 border-t border-[#EFEFEF] dark:border-[#222222] space-y-2 text-xs">
                        <div>
                          <dt className="font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
                            What you gain
                          </dt>
                          <dd className="text-[#525252] dark:text-[#A3A3A3] mt-0.5">{alt.gained}</dd>
                        </div>
                        <div>
                          <dt className="font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
                            Trade-off
                          </dt>
                          <dd className="text-[#525252] dark:text-[#A3A3A3] mt-0.5">
                            {alt.tradeoff}
                          </dd>
                        </div>
                      </dl>
                    </div>

                    <div className="space-y-2 pt-2">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectChair(chair.id)}
                          className="h-10 px-3 border border-[#DFDFDF] dark:border-[#2C2C2C] text-xs font-medium text-[#0E0E0E] dark:text-[#F2F2F2] hover:border-[#0E0E0E] dark:hover:border-[#F2F2F2] transition-colors whitespace-nowrap"
                        >
                          Inspect Specs
                        </button>
                        <button
                          type="button"
                          disabled={renderState?.status === 'rendering'}
                          onClick={() => onVisualizeInRoom(renderKey, chair)}
                          className="h-10 px-3 border border-[#0E0E0E] dark:border-[#F2F2F2] text-xs font-semibold text-[#0E0E0E] dark:text-[#F2F2F2] hover:bg-[#0E0E0E] hover:text-white dark:hover:bg-[#F2F2F2] dark:hover:text-[#111111] disabled:opacity-45 inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          {renderState?.status === 'rendering' ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                          <span>{renderState?.imageDataUrl ? 'Re-render' : 'Visualize'}</span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => onAddToCart(chair)}
                        className="w-full h-10 px-3.5 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold inline-flex items-center justify-between hover:opacity-85 transition-opacity"
                      >
                        <span>Add to Bag · {chair.price}</span>
                        <ShoppingBag className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>

          {/* PANEL D: HERO DEMO MOMENT — INTERACTIVE PREFERENCE REVISION */}
          <div className="border-2 border-[#0E0E0E] dark:border-[#F2F2F2] p-6 bg-white dark:bg-[#111111] space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="text-[11px] font-mono text-[#B91C1C] dark:text-[#F87171]">
                  Adaptive Decision Loop · Change Priorities
                </p>
                <h4 className="text-lg font-bold tracking-tight text-[#0E0E0E] dark:text-[#F2F2F2] mt-0.5">
                  Push back on a trade-off — ContextFit revises its plan.
                </h4>
              </div>
              <span className="text-xs text-[#666666] dark:text-[#9CA3AF]">
                Preserves room context &amp; re-evaluates the store catalog
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {REVISION_FOLLOWUP_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  disabled={isAnalyzing}
                  onClick={() => onRunRevision(chip)}
                  className="px-3 py-1.5 text-xs font-medium border border-[#0E0E0E] dark:border-[#525252] text-[#0E0E0E] dark:text-[#F2F2F2] hover:bg-[#0E0E0E] hover:text-white dark:hover:bg-[#F2F2F2] dark:hover:text-[#111111] disabled:opacity-45 transition-colors text-left"
                >
                  &ldquo;{chip}&rdquo;
                </button>
              ))}
            </div>

            <form onSubmit={handleFollowUpSubmit} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={followUpInput}
                onChange={(e) => setFollowUpInput(e.target.value)}
                placeholder='e.g., "But I really love the high-back design" or "Keep it under $650"'
                aria-label="Follow-up preference revision"
                className="flex-1 h-11 px-3.5 text-sm border border-[#DFDFDF] dark:border-[#2C2C2C] bg-white dark:bg-[#161616] text-[#0E0E0E] dark:text-[#F2F2F2] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#0E0E0E] dark:focus:border-[#F2F2F2]"
              />
              <button
                type="submit"
                disabled={!followUpInput.trim() || isAnalyzing}
                className="h-11 px-6 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-85 disabled:opacity-40 transition-opacity whitespace-nowrap shrink-0"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Revising Plan…</span>
                  </>
                ) : (
                  <>
                    <span>Revise Plan</span>
                    <ArrowUpRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* OPTIONAL VISUAL ROOM PREVIEW WORKSPACE (Shown when any room render is triggered) */}
      {Object.keys(visualRenders).length > 0 && roomPhoto && (
        <div className="mt-10 border-t-2 border-[#0E0E0E] dark:border-[#F2F2F2] pt-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-mono text-[#737373] dark:text-[#9CA3AF]">
                Optional Visual Context · Powered by Gemini Room Compositing
              </p>
              <h3 className="text-xl font-bold tracking-tight text-[#0E0E0E] dark:text-[#F2F2F2] mt-0.5">
                Room Preview Comparison
              </h3>
              <p className="text-xs text-[#666666] dark:text-[#9CA3AF] mt-1">
                Visual preview for aesthetic context only — not to exact physical scale. Verify cm
                dimensions in the table below.
              </p>
            </div>

            <div className="inline-flex border border-[#0E0E0E] dark:border-[#F2F2F2]">
              <button
                type="button"
                onClick={() => setVisualMode('split')}
                className={`h-9 px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 ${
                  visualMode === 'split'
                    ? 'bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111]'
                    : 'text-[#525252] dark:text-[#A3A3A3]'
                }`}
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span>Split Slider</span>
              </button>
              <button
                type="button"
                onClick={() => setVisualMode('grid')}
                className={`h-9 px-3.5 text-xs font-semibold inline-flex items-center gap-1.5 ${
                  visualMode === 'grid'
                    ? 'bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111]'
                    : 'text-[#525252] dark:text-[#A3A3A3]'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>Side-by-Side</span>
              </button>
            </div>
          </div>

          {visualMode === 'split' && renderedEntries.length > 0 ? (
            <div className="border border-[#DFDFDF] dark:border-[#262626] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <select
                    aria-label="Left split comparison scene"
                    value={splitLeftKey}
                    onChange={(e) => setSplitLeftKey(e.target.value)}
                    className="h-9 px-3 text-xs border border-[#DFDFDF] dark:border-[#2C2C2C] bg-white dark:bg-[#161616] text-[#0E0E0E] dark:text-[#F2F2F2]"
                  >
                    <option value="__original__">Original Room</option>
                    {renderedEntries.map(([k, r]) => (
                      <option key={k} value={k}>
                        {r.label || k}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs font-mono text-[#737373]">vs.</span>
                  <select
                    aria-label="Right split comparison scene"
                    value={effectiveRightKey}
                    onChange={(e) => setSplitRightKey(e.target.value)}
                    className="h-9 px-3 text-xs border border-[#DFDFDF] dark:border-[#2C2C2C] bg-white dark:bg-[#161616] text-[#0E0E0E] dark:text-[#F2F2F2]"
                  >
                    {renderedEntries.map(([k, r]) => (
                      <option key={k} value={k}>
                        {r.label || k}
                      </option>
                    ))}
                  </select>
                </div>

                {effectiveRightKey && visualRenders[effectiveRightKey]?.imageDataUrl && (
                  <button
                    type="button"
                    disabled={exportingKey === effectiveRightKey}
                    onClick={() =>
                      handleExportPng(
                        effectiveRightKey,
                        effectiveRightLabel,
                        visualRenders[effectiveRightKey].imageDataUrl!
                      )
                    }
                    className="h-9 px-3.5 border border-[#0E0E0E] dark:border-[#F2F2F2] text-xs font-semibold inline-flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PNG</span>
                  </button>
                )}
              </div>

              <SplitCompareSlider
                leftImageUrl={effectiveLeftUrl}
                leftLabel={effectiveLeftLabel}
                rightImageUrl={effectiveRightUrl}
                rightLabel={effectiveRightLabel}
                aspectRatioStyle={`${roomPhoto.resizedWidth} / ${roomPhoto.resizedHeight}`}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 border border-[#DFDFDF] dark:border-[#262626]">
              {Object.entries(visualRenders).map(([key, render]) => (
                <div
                  key={key}
                  className="p-4 border-r border-b border-[#DFDFDF] dark:border-[#262626] space-y-3"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold truncate">{render.label || key}</span>
                    {render.status === 'done' && render.imageDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          handleExportPng(key, render.label || key, render.imageDataUrl!)
                        }
                        className="text-[11px] font-mono underline underline-offset-2 shrink-0"
                      >
                        PNG
                      </button>
                    )}
                  </div>
                  <div className="aspect-[4/3] bg-[#F5F5F4] dark:bg-[#181818] border border-[#DFDFDF] dark:border-[#262626] relative overflow-hidden flex items-center justify-center">
                    {render.status === 'rendering' ? (
                      <div className="flex flex-col items-center gap-2 text-xs text-[#666666] dark:text-[#9CA3AF]">
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Generating room preview…</span>
                      </div>
                    ) : render.status === 'error' ? (
                      <p className="p-4 text-xs text-[#B91C1C] text-center">{render.error}</p>
                    ) : render.imageDataUrl ? (
                      <SafeImage
                        src={render.imageDataUrl}
                        alt={render.label || 'Room visual preview'}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VERIFIED SPEC COMPARISON MATRIX */}
      <div id="compare-matrix" className="mt-12 border-t-2 border-[#0E0E0E] dark:border-[#F2F2F2] pt-6 scroll-mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
          <div>
            <p className="text-xs font-mono text-[#737373] dark:text-[#9CA3AF]">
              Verified Catalog Comparison · Confirmed Dimensions &amp; Pricing
            </p>
            <h3 className="text-xl font-bold tracking-tight text-[#0E0E0E] dark:text-[#F2F2F2] mt-0.5">
              Compare Options Side by Side
            </h3>
          </div>
        </div>

        <div className="border border-[#DFDFDF] dark:border-[#262626] overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#DFDFDF] dark:border-[#262626] bg-[#FAFAFA] dark:bg-[#161616]">
                <th scope="col" className="p-4 w-44 font-mono font-medium text-[#737373] dark:text-[#8E8E93]">
                  Attribute
                </th>
                {matrixChairs.map((chair, idx) => (
                  <th
                    key={chair.id}
                    scope="col"
                    className="p-4 border-l border-[#DFDFDF] dark:border-[#262626] align-top"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-white border border-[#DFDFDF] dark:border-[#2C2C2C] p-1 shrink-0">
                        <SafeImage
                          src={chair.imageUrl}
                          alt={chair.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[10px] font-mono text-[#737373] dark:text-[#8E8E93]">
                          {chair.id === currentChair.id
                            ? 'Currently Viewing'
                            : activeAnalysis
                              ? `Alternative 0${idx}`
                              : `Catalog 0${idx + 1}`}
                        </div>
                        <div className="text-sm font-bold text-[#0E0E0E] dark:text-[#F2F2F2] leading-snug">
                          {chair.name}
                        </div>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DFDFDF] dark:divide-[#262626]">
              <tr>
                <th scope="row" className="p-4 font-mono font-medium text-[#737373] dark:text-[#8E8E93]">
                  Price
                </th>
                {matrixChairs.map((chair) => (
                  <td
                    key={chair.id}
                    className="p-4 border-l border-[#DFDFDF] dark:border-[#262626] font-mono tabular-nums font-semibold text-sm text-[#0E0E0E] dark:text-[#F2F2F2]"
                  >
                    {chair.price}
                    {typeof measurements.maxBudgetUsd === 'number' &&
                      measurements.maxBudgetUsd > 0 && (
                        <span
                          className={`block text-[10px] font-normal mt-0.5 ${
                            chair.priceNumeric <= measurements.maxBudgetUsd
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-[#B91C1C] dark:text-[#F87171]'
                          }`}
                        >
                          {chair.priceNumeric <= measurements.maxBudgetUsd
                            ? `Within $${measurements.maxBudgetUsd} budget`
                            : `$${chair.priceNumeric - measurements.maxBudgetUsd} over budget`}
                        </span>
                      )}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="p-4 font-mono font-medium text-[#737373] dark:text-[#8E8E93]">
                  Dimensions (H×W×D)
                </th>
                {matrixChairs.map((chair) => (
                  <td
                    key={chair.id}
                    className="p-4 border-l border-[#DFDFDF] dark:border-[#262626] font-mono tabular-nums text-[#0E0E0E] dark:text-[#F2F2F2]"
                  >
                    {chair.dimensions.heightCm} × {chair.dimensions.widthCm} ×{' '}
                    {chair.dimensions.depthCm} cm
                    {typeof measurements.windowSillHeightCm === 'number' &&
                      measurements.windowSillHeightCm > 0 && (
                        <span
                          className={`block text-[10px] mt-0.5 ${
                            chair.dimensions.backHeightCm <= measurements.windowSillHeightCm
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-[#B91C1C] dark:text-[#F87171]'
                          }`}
                        >
                          {chair.dimensions.backHeightCm <= measurements.windowSillHeightCm
                            ? `Clears ${measurements.windowSillHeightCm} cm sill`
                            : `+${chair.dimensions.backHeightCm - measurements.windowSillHeightCm} cm above sill`}
                        </span>
                      )}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="p-4 font-mono font-medium text-[#737373] dark:text-[#8E8E93]">
                  Back Profile
                </th>
                {matrixChairs.map((chair) => (
                  <td
                    key={chair.id}
                    className="p-4 border-l border-[#DFDFDF] dark:border-[#262626] text-[#0E0E0E] dark:text-[#F2F2F2]"
                  >
                    {chair.backProfile} ({chair.dimensions.backHeightCm} cm)
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="p-4 font-mono font-medium text-[#737373] dark:text-[#8E8E93]">
                  Visual Weight
                </th>
                {matrixChairs.map((chair) => (
                  <td
                    key={chair.id}
                    className="p-4 border-l border-[#DFDFDF] dark:border-[#262626] text-[#0E0E0E] dark:text-[#F2F2F2]"
                  >
                    {chair.visualWeight}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="p-4 font-mono font-medium text-[#737373] dark:text-[#8E8E93]">
                  Material
                </th>
                {matrixChairs.map((chair) => (
                  <td
                    key={chair.id}
                    className="p-4 border-l border-[#DFDFDF] dark:border-[#262626] text-[#333333] dark:text-[#CCCCCC]"
                  >
                    {chair.material}
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row" className="p-4 font-mono font-medium text-[#737373] dark:text-[#8E8E93]">
                  Action
                </th>
                {matrixChairs.map((chair) => (
                  <td
                    key={chair.id}
                    className="p-4 border-l border-[#DFDFDF] dark:border-[#262626]"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onAddToCart(chair)}
                        className="h-9 px-3.5 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold inline-flex items-center gap-1.5 hover:opacity-85 transition-opacity whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Add to Bag</span>
                      </button>
                      {chair.id !== currentChair.id && (
                        <button
                          type="button"
                          onClick={() => onSelectChair(chair.id)}
                          className="h-9 px-3 border border-[#DFDFDF] dark:border-[#2C2C2C] text-xs font-medium text-[#0E0E0E] dark:text-[#F2F2F2] hover:border-[#0E0E0E] dark:hover:border-[#F2F2F2] transition-colors whitespace-nowrap"
                        >
                          View PDP
                        </button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
