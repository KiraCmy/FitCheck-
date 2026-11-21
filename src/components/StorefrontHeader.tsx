import { Moon, Sun, ShoppingBag } from 'lucide-react';

interface StorefrontHeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  cartCount: number;
  onOpenCart: () => void;
  activeCategory: string;
  onSelectCategory: (cat: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSearchSubmit: () => void;
}

const CATEGORIES = [
  { id: 'All', label: 'Seating', sub: 'Accent · Reading' },
  { id: 'High-Back', label: 'High-Back', sub: 'Wing · Open-Frame' },
  { id: 'Low-Back', label: 'Low-Back', sub: 'Window-Safe · Swivel' },
  { id: 'Open / Airy', label: 'Open-Frame', sub: 'Cane · Steel' },
];

export function StorefrontHeader({
  theme,
  onToggleTheme,
  cartCount,
  onOpenCart,
  activeCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onSearchSubmit,
}: StorefrontHeaderProps) {
  return (
    <header className="bg-white dark:bg-[#111111] text-[#0E0E0E] dark:text-[#F2F2F2]">
      {/* Primary 3-Zone Top Bar */}
      <div className="border-b-2 border-[#0E0E0E] dark:border-[#F2F2F2]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-line architectural wordmark */}
          <a
            href="#top"
            className="text-xl font-bold tracking-[-0.04em] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0E0E0E] dark:focus-visible:outline-[#F2F2F2]"
          >
            FORMA
          </a>

          {/* Zone 2: 4 concise single-line nav links */}
          <nav
            aria-label="Storefront navigation"
            className="hidden md:flex items-center gap-8 text-xs font-medium tracking-[0.02em] text-[#525252] dark:text-[#A3A3A3]"
          >
            <a
              href="#product-view"
              className="hover:text-[#0E0E0E] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#0E0E0E] dark:hover:border-white"
            >
              Product
            </a>
            <a
              href="#contextfit"
              className="hover:text-[#0E0E0E] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#0E0E0E] dark:hover:border-white"
            >
              ContextFit
            </a>
            <a
              href="#compare-matrix"
              className="hover:text-[#0E0E0E] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#0E0E0E] dark:hover:border-white"
            >
              Compare
            </a>
            <a
              href="#merchant-catalog"
              className="hover:text-[#0E0E0E] dark:hover:text-white transition-colors whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#0E0E0E] dark:hover:border-white"
            >
              Catalog
            </a>
          </nav>

          {/* Zone 3: Theme switch + Shopping Bag action */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="w-9 h-9 inline-flex items-center justify-center border border-[#DFDFDF] dark:border-[#2C2C2C] text-[#0E0E0E] dark:text-[#F2F2F2] hover:border-[#0E0E0E] dark:hover:border-[#F2F2F2] transition-colors shrink-0"
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" strokeWidth={1.6} />
              ) : (
                <Moon className="w-4 h-4" strokeWidth={1.6} />
              )}
            </button>

            <button
              type="button"
              onClick={onOpenCart}
              className="h-9 px-4 inline-flex items-center gap-2 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold tracking-[0.02em] hover:opacity-85 transition-opacity whitespace-nowrap shrink-0"
            >
              <ShoppingBag className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span>Bag</span>
              <span className="font-mono tabular-nums">({cartCount})</span>
            </button>
          </div>
        </div>
      </div>

      {/* ECC-inspired Swiss Architectural Category & Search Grid */}
      <div className="border-b border-[#DFDFDF] dark:border-[#262626]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="grid grid-cols-2 lg:grid-cols-4 border-x border-[#DFDFDF] dark:border-[#262626]">
            {CATEGORIES.map((cat) => {
              const isActive = activeCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => onSelectCategory(cat.id)}
                  className={`relative text-left px-4 py-3.5 border-r border-b lg:border-b-0 last:border-r-0 border-[#DFDFDF] dark:border-[#262626] hover:bg-[#FAFAFA] dark:hover:bg-[#171717] transition-colors ${
                    isActive ? 'bg-[#FAFAFA] dark:bg-[#171717]' : ''
                  }`}
                >
                  <div className="text-sm font-semibold tracking-tight text-[#0E0E0E] dark:text-[#F2F2F2]">
                    {cat.label}
                  </div>
                  <div className="text-[11px] text-[#737373] dark:text-[#8E8E93] mt-0.5 truncate">
                    {cat.sub}
                  </div>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#B91C1C]"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Breadcrumb + Sharp ECC Search Row */}
      <div className="border-b border-[#DFDFDF] dark:border-[#262626]">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-[#737373] dark:text-[#9CA3AF] truncate">
            Residential Seating — Reading &amp; Lounge — Accent Chairs · Demo Merchant Catalog
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSearchSubmit();
            }}
            className="flex items-stretch w-full sm:w-auto sm:min-w-[340px]"
          >
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter store chairs by name, height, material..."
              aria-label="Filter store catalog"
              className="flex-1 h-9 px-3 text-xs bg-white dark:bg-[#161616] text-[#0E0E0E] dark:text-[#F2F2F2] border border-[#0E0E0E] dark:border-[#525252] border-r-0 placeholder:text-[#8E8E93] focus:outline-none"
            />
            <button
              type="submit"
              className="h-9 px-5 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-medium hover:opacity-85 transition-opacity whitespace-nowrap shrink-0"
            >
              Search
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
