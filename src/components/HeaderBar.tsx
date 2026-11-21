import { Moon, Sun, Loader2 } from 'lucide-react';

interface HeaderBarProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  shortlistCount: number;
  canRenderAll: boolean;
  isRenderingAny: boolean;
  onRenderAll: () => void;
}

export function HeaderBar({
  theme,
  onToggleTheme,
  shortlistCount,
  canRenderAll,
  isRenderingAny,
  onRenderAll,
}: HeaderBarProps) {
  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-[#141414]/95 backdrop-blur-sm border-b border-[#E5E5E5] dark:border-[#2E2E2E]">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6 sm:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#top"
          className="text-lg font-bold tracking-tight text-[#1A1A1A] dark:text-[#F1F1F1] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#5433EB]"
        >
          RoomCheck
        </a>

        {/* Zone 2: 4 concise single-line text nav links */}
        <nav
          aria-label="Workspace sections"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#525252] dark:text-[#A3A3A3]"
        >
          <a
            href="#shortlist"
            className="hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1] transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#1A1A1A] dark:hover:border-[#F1F1F1]"
          >
            Shortlist ({shortlistCount})
          </a>
          <a
            href="#room-scene"
            className="hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1] transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#1A1A1A] dark:hover:border-[#F1F1F1]"
          >
            Room &amp; Scene
          </a>
          <a
            href="#visual-compare"
            className="hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1] transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#1A1A1A] dark:hover:border-[#F1F1F1]"
          >
            Visual Compare
          </a>
          <a
            href="#spec-table"
            className="hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1] transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#1A1A1A] dark:hover:border-[#F1F1F1]"
          >
            Specs
          </a>
        </nav>

        {/* Zone 3: Theme Switch + 1 Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="w-10 h-10 inline-flex items-center justify-center rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#1A1A1A] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#BDBDBD] dark:hover:border-[#4A4A4A] transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5433EB]"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" strokeWidth={1.75} />
            ) : (
              <Moon className="w-4 h-4" strokeWidth={1.75} />
            )}
          </button>

          <button
            type="button"
            onClick={onRenderAll}
            disabled={!canRenderAll || isRenderingAny}
            className="h-10 px-4 inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white bg-[#5433EB] hover:bg-[#4424D6] disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5433EB]"
          >
            {isRenderingAny ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Rendering…</span>
              </>
            ) : (
              <span>Render All in Room</span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
