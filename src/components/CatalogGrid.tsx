import { ArrowUpRight } from 'lucide-react';
import type { MerchantChair } from '../types/contextFit';
import { MERCHANT_CATALOG_LABEL } from '../data/merchantCatalog';
import { SafeImage } from './SafeImage';

interface CatalogGridProps {
  chairs: MerchantChair[];
  selectedChairId: string;
  activeCategory: string;
  searchQuery: string;
  onSelectChair: (chairId: string) => void;
  onClearFilters: () => void;
}

export function CatalogGrid({
  chairs,
  selectedChairId,
  activeCategory,
  searchQuery,
  onSelectChair,
  onClearFilters,
}: CatalogGridProps) {
  return (
    <section
      id="merchant-catalog"
      aria-labelledby="merchant-catalog-heading"
      className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 pb-16 scroll-mt-6"
    >
      <div className="border-t-2 border-[#0E0E0E] dark:border-[#F2F2F2] pt-6 pb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-mono text-[#737373] dark:text-[#9CA3AF]">
            {MERCHANT_CATALOG_LABEL}
          </p>
          <h2
            id="merchant-catalog-heading"
            className="text-2xl sm:text-3xl font-bold tracking-[-0.03em] text-[#0E0E0E] dark:text-[#F2F2F2] mt-1"
          >
            More Seating in This Store
          </h2>
        </div>

        {(activeCategory !== 'All' || searchQuery.trim()) && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs font-mono underline underline-offset-4 text-[#0E0E0E] dark:text-[#F2F2F2]"
          >
            Clear filter ({chairs.length} shown)
          </button>
        )}
      </div>

      {chairs.length === 0 ? (
        <div className="border border-[#DFDFDF] dark:border-[#262626] p-10 text-center space-y-3">
          <p className="text-sm font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
            No chairs match &ldquo;{searchQuery}&rdquo;
          </p>
          <button
            type="button"
            onClick={onClearFilters}
            className="h-9 px-4 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold"
          >
            Show All Store Chairs
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 border-t border-l border-[#DFDFDF] dark:border-[#262626]">
          {chairs.map((chair) => {
            const isSelected = chair.id === selectedChairId;
            return (
              <button
                key={chair.id}
                type="button"
                onClick={() => onSelectChair(chair.id)}
                className={`group text-left flex flex-col justify-between border-r border-b border-[#DFDFDF] dark:border-[#262626] bg-white dark:bg-[#111111] hover:bg-[#FAFAFA] dark:hover:bg-[#171717] transition-colors ${
                  isSelected ? 'ring-2 ring-inset ring-[#0E0E0E] dark:ring-[#F2F2F2]' : ''
                }`}
              >
                {/* Pure white studio product tile */}
                <div className="aspect-square w-full bg-white p-6 flex items-center justify-center border-b border-[#EFEFEF] dark:border-[#222222]">
                  <SafeImage
                    src={chair.imageUrl}
                    alt={chair.name}
                    className="w-full h-full object-contain brightness-[1.02] contrast-[1.04] group-hover:scale-[1.03] transition-transform duration-200"
                  />
                </div>

                {/* Swiss architectural metadata footer */}
                <div className="p-4 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-[#737373] dark:text-[#8E8E93]">
                    <span className="truncate">{chair.designer}</span>
                    <span className="text-[#0E0E0E] dark:text-[#F2F2F2] font-medium tabular-nums shrink-0">
                      {chair.price}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[#0E0E0E] dark:text-[#F2F2F2] leading-snug line-clamp-2 min-h-[2.5rem]">
                    {chair.name}
                  </div>
                  <div className="pt-2 mt-1 border-t border-[#EFEFEF] dark:border-[#222222] flex items-center justify-between text-[11px] font-mono tabular-nums text-[#666666] dark:text-[#9CA3AF]">
                    <span>
                      H {chair.dimensions.heightCm} · W {chair.dimensions.widthCm} cm
                    </span>
                    <span className="inline-flex items-center gap-0.5 text-[#0E0E0E] dark:text-[#F2F2F2] font-medium">
                      {isSelected ? 'Viewing' : 'Inspect'}
                      <ArrowUpRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
