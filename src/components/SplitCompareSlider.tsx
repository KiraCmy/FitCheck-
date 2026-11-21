import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { MoveHorizontal } from 'lucide-react';

interface SplitCompareSliderProps {
  leftImageUrl: string;
  leftLabel: string;
  rightImageUrl: string;
  rightLabel: string;
  aspectRatioStyle?: string;
}

export function SplitCompareSlider({
  leftImageUrl,
  leftLabel,
  rightImageUrl,
  rightLabel,
  aspectRatioStyle = '4 / 3',
}: SplitCompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);

  const updatePositionFromClientX = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setPosition(Math.max(2, Math.min(98, pct)));
  }, []);

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePositionFromClientX(e.clientX);
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    updatePositionFromClientX(e.clientX);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    const stopDrag = () => setIsDragging(false);
    window.addEventListener('pointerup', stopDrag);
    return () => window.removeEventListener('pointerup', stopDrag);
  }, []);

  return (
    <div className="max-w-[920px] mx-auto space-y-3">
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        style={{ aspectRatio: aspectRatioStyle }}
        data-testid="split-compare-surface"
        className="relative w-full overflow-hidden border border-[#0E0E0E] dark:border-[#3A3A3A] bg-[#F5F5F4] dark:bg-[#141414] select-none touch-none cursor-ew-resize"
      >
        {/* Right / Base Layer (Full Image) */}
        <img
          src={rightImageUrl}
          alt={rightLabel}
          referrerPolicy="no-referrer"
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* Left / Clipped Layer (Pixel-aligned clip-path) */}
        <img
          src={leftImageUrl}
          alt={leftLabel}
          referrerPolicy="no-referrer"
          draggable={false}
          style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* Crisp Vertical Divider Line + Handle */}
        <div
          style={{ left: `${position}%` }}
          className="absolute inset-y-0 -translate-x-1/2 w-[2px] bg-white shadow-[0_0_8px_rgba(0,0,0,0.45)] pointer-events-none"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 bg-[#0E0E0E] text-white shadow-lg border border-white flex items-center justify-center">
            <MoveHorizontal className="w-4 h-4" strokeWidth={2} />
          </div>
        </div>

        {/* Measured Contrast Scrim Labels */}
        <div className="absolute bottom-3 left-3 max-w-[44%] px-2.5 py-1 bg-black/80 text-white text-xs font-mono truncate pointer-events-none">
          {leftLabel}
        </div>
        <div className="absolute bottom-3 right-3 max-w-[44%] px-2.5 py-1 bg-black/80 text-white text-xs font-mono truncate pointer-events-none">
          {rightLabel}
        </div>
      </div>

      {/* Accessible Range Scrubber */}
      <div className="flex items-center gap-4 px-1">
        <span className="text-xs font-medium text-[#666666] dark:text-[#A1A1AA] truncate max-w-[180px]">
          {leftLabel}
        </span>
        <input
          type="range"
          min={2}
          max={98}
          step={0.5}
          value={position}
          onChange={(e) => setPosition(Number(e.target.value))}
          aria-label={`Split comparison slider between ${leftLabel} and ${rightLabel}`}
          className="split-scrubber flex-1 h-1.5 rounded-full bg-[#E5E5E5] dark:bg-[#2E2E2E] cursor-ew-resize"
        />
        <span className="text-xs font-medium text-[#666666] dark:text-[#A1A1AA] truncate max-w-[180px] text-right">
          {rightLabel}
        </span>
      </div>
    </div>
  );
}
