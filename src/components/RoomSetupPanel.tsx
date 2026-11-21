import { useRef, useState } from 'react';
import type { DragEvent, ChangeEvent } from 'react';
import { Upload, Loader2, RefreshCw, Layers } from 'lucide-react';
import type { LightingMood, PlacementOption, RoomPhoto, SceneSettings } from '../types/studio';
import { LIGHTING_MOODS, PLACEMENT_OPTIONS, QUICK_NOTE_CHIPS } from '../types/studio';
import { appendQuickNote } from '../utils/sceneMath';
import { SafeImage } from './SafeImage';

interface RoomSetupPanelProps {
  roomPhoto: RoomPhoto | null;
  isProcessingRoom: boolean;
  roomError: string | null;
  settings: SceneSettings;
  shortlistCount: number;
  isRenderingAny: boolean;
  renderingProgressText: string | null;
  onUploadRoomFile: (file: File) => void;
  onUseSampleRoom: () => void;
  onUpdateSettings: (patch: Partial<SceneSettings>) => void;
  onRenderAll: () => void;
}

export function RoomSetupPanel({
  roomPhoto,
  isProcessingRoom,
  roomError,
  settings,
  shortlistCount,
  isRenderingAny,
  renderingProgressText,
  onUploadRoomFile,
  onUseSampleRoom,
  onUpdateSettings,
  onRenderAll,
}: RoomSetupPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadRoomFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onUploadRoomFile(file);
    }
  };

  const canRender = Boolean(roomPhoto) && shortlistCount > 0 && !isRenderingAny;

  return (
    <section id="room-scene" aria-labelledby="room-scene-heading" className="scroll-mt-20">
      <div className="mb-5">
        <p className="text-xs font-medium text-[#666666] dark:text-[#9CA3AF] mb-1">
          Step 2 of 3 · Shared room canvas &amp; lighting direction
        </p>
        <h2
          id="room-scene-heading"
          className="text-xl sm:text-2xl font-semibold tracking-tight text-[#1A1A1A] dark:text-[#F1F1F1]"
        >
          Your Room &amp; Shared Scene Settings
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Column: Room Photo Upload with Canvas 1400px Optimization */}
        <div className="lg:col-span-5 flex flex-col rounded-xl border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#1A1A1A] overflow-hidden">
          <div className="px-5 py-4 border-b border-[#E5E5E5] dark:border-[#2E2E2E] flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F1F1F1]">
                Base Room Photo
              </h3>
              <p className="text-xs text-[#666666] dark:text-[#A1A1AA]">
                Auto-resized in browser to max 1400px longest side
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {roomPhoto ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-8 px-3 text-xs font-medium rounded-md border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] transition-colors whitespace-nowrap"
                >
                  Replace
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onUseSampleRoom}
                  className="h-8 px-3 text-xs font-medium rounded-md border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB] transition-colors whitespace-nowrap"
                >
                  Use Sample Room
                </button>
              )}
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            aria-label="Upload room photo"
            className="hidden"
          />

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex-1 flex flex-col justify-between p-5 transition-colors ${
              isDragging ? 'bg-[#5433EB]/5' : ''
            }`}
          >
            {roomPhoto ? (
              <div className="flex flex-col h-full gap-4">
                <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414]">
                  <SafeImage
                    src={roomPhoto.dataUrl}
                    alt={`Uploaded room: ${roomPhoto.name}`}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Original -> Resized Dimensions Readout */}
                <div
                  className="pt-3 border-t border-[#E5E5E5] dark:border-[#2E2E2E] flex flex-wrap items-center justify-between gap-2 text-xs"
                  data-testid="room-dimensions-readout"
                >
                  <div className="text-[#666666] dark:text-[#A1A1AA] truncate max-w-[200px]">
                    {roomPhoto.name}
                  </div>
                  <div className="font-mono tabular-nums text-[#1A1A1A] dark:text-[#F1F1F1] flex items-center gap-1.5">
                    <span>
                      {roomPhoto.originalWidth}×{roomPhoto.originalHeight}
                    </span>
                    <span aria-hidden="true" className="text-[#5433EB] dark:text-[#A594FF]">
                      →
                    </span>
                    <span className="font-medium">
                      {roomPhoto.resizedWidth}×{roomPhoto.resizedHeight}px
                    </span>
                    <span aria-hidden="true" className="text-[#9CA3AF]">
                      ·
                    </span>
                    <span className="text-[#666666] dark:text-[#A1A1AA]">
                      {roomPhoto.aspectRatio}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-[#666666] dark:text-[#A1A1AA]">
                  {roomPhoto.wasResized
                    ? 'Proportionally scaled on HTML canvas to 1400px max side for fast, crisp compositing.'
                    : 'Original resolution kept (already within 1400px max side — never upscaled).'}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingRoom}
                className="flex-1 min-h-[260px] w-full rounded-lg border border-dashed border-[#D4D4D4] dark:border-[#3A3A3A] bg-[#F7F7F8] dark:bg-[#141414] hover:border-[#5433EB] transition-colors flex flex-col items-center justify-center p-6 text-center"
              >
                {isProcessingRoom ? (
                  <Loader2 className="w-7 h-7 text-[#5433EB] animate-spin mb-3" />
                ) : (
                  <Upload className="w-7 h-7 text-[#666666] dark:text-[#A1A1AA] mb-3" strokeWidth={1.5} />
                )}
                <span className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F1F1F1]">
                  {isProcessingRoom
                    ? 'Optimizing photo on canvas…'
                    : 'Drop your room photo here or click to browse'}
                </span>
                <span className="text-xs text-[#666666] dark:text-[#A1A1AA] mt-1.5 max-w-xs">
                  JPG, PNG, or WebP. Resized proportionally in your browser so the longest side is at
                  most 1400px.
                </span>
              </button>
            )}

            {roomError && (
              <p role="alert" className="mt-3 text-xs font-medium text-red-600 dark:text-red-400">
                {roomError}
              </p>
            )}
          </div>
        </div>

        {/* Right Column: Shared Scene Settings */}
        <div className="lg:col-span-7 flex flex-col justify-between rounded-xl border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#1A1A1A] p-5 sm:p-6 gap-6">
          <div className="space-y-6">
            {/* Placement Grid */}
            <div>
              <span className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] mb-2.5">
                Placement Target
              </span>
              <div
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
                role="radiogroup"
                aria-label="Product placement target"
              >
                {PLACEMENT_OPTIONS.map((option: PlacementOption) => {
                  const active = settings.placement === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => onUpdateSettings({ placement: option })}
                      className={`h-10 px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap truncate ${
                        active
                          ? 'border-[#5433EB] bg-[#5433EB] text-white'
                          : 'border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#BDBDBD] dark:hover:border-[#4A4A4A]'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lighting Mood */}
            <div>
              <span className="block text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] mb-2.5">
                Lighting Mood
              </span>
              <div
                className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
                role="radiogroup"
                aria-label="Room lighting mood"
              >
                {LIGHTING_MOODS.map((mood) => {
                  const active = settings.lightingMood === mood.value;
                  return (
                    <button
                      key={mood.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() =>
                        onUpdateSettings({ lightingMood: mood.value as LightingMood })
                      }
                      className={`text-left px-3.5 py-2.5 rounded-lg border transition-colors ${
                        active
                          ? 'border-[#5433EB] bg-[#5433EB]/8 dark:bg-[#5433EB]/20 text-[#1A1A1A] dark:text-[#F1F1F1]'
                          : 'border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#BDBDBD] dark:hover:border-[#4A4A4A]'
                      }`}
                    >
                      <div className="text-xs font-semibold flex items-center justify-between">
                        <span>{mood.label}</span>
                        {active && (
                          <span className="text-[11px] font-medium text-[#5433EB] dark:text-[#A594FF]">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#666666] dark:text-[#A1A1AA] mt-0.5">
                        {mood.detail}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Notes + Quick-Append Chips */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <label
                  htmlFor="scene-custom-notes"
                  className="text-xs font-semibold text-[#1A1A1A] dark:text-[#F1F1F1]"
                >
                  Custom Placement Notes (Optional)
                </label>
                {settings.customNotes.trim() && (
                  <button
                    type="button"
                    onClick={() => onUpdateSettings({ customNotes: '' })}
                    className="text-xs text-[#666666] dark:text-[#A1A1AA] hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1] transition-colors"
                  >
                    Clear notes
                  </button>
                )}
              </div>
              <textarea
                id="scene-custom-notes"
                rows={2}
                value={settings.customNotes}
                onChange={(e) => onUpdateSettings({ customNotes: e.target.value })}
                placeholder="e.g., Place on the right side of the oak console, replacing the existing lamp..."
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] placeholder:text-[#8E8E93] focus:outline-none focus:border-[#5433EB] resize-none"
              />
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {QUICK_NOTE_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        customNotes: appendQuickNote(settings.customNotes, chip),
                      })
                    }
                    className="px-2.5 py-1 text-xs rounded-md border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#141414] text-[#525252] dark:text-[#D4D4D8] hover:border-[#5433EB] hover:text-[#5433EB] dark:hover:text-[#A594FF] transition-colors"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Primary Action Footer */}
          <div className="pt-4 border-t border-[#E5E5E5] dark:border-[#2E2E2E] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1 min-w-0 text-xs text-[#666666] dark:text-[#A1A1AA]">
              {renderingProgressText ? (
                <span className="font-medium text-[#5433EB] dark:text-[#A594FF]">
                  {renderingProgressText}
                </span>
              ) : roomPhoto && shortlistCount > 0 ? (
                <span>
                  Renders all {shortlistCount} shortlisted item{shortlistCount === 1 ? '' : 's'} into
                  your room with identical placement &amp; lighting.
                </span>
              ) : (
                <span>Add at least 1 product and upload a room photo to generate room renders.</span>
              )}
            </div>

            <button
              type="button"
              onClick={onRenderAll}
              disabled={!canRender}
              className="h-11 px-5 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white bg-[#5433EB] hover:bg-[#4424D6] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
            >
              {isRenderingAny ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Rendering Room…</span>
                </>
              ) : (
                <>
                  {shortlistCount > 0 ? (
                    <Layers className="w-4 h-4" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  <span>
                    Render All in Room{shortlistCount > 0 ? ` (${shortlistCount})` : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
