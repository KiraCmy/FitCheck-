import { ArrowUpRight, ChevronLeft, ChevronRight, ShoppingBag } from 'lucide-react';
import type { MerchantChair } from '../types/contextFit';
import { SafeImage } from './SafeImage';

interface ProductDetailHeroProps {
  chair: MerchantChair;
  chairIndex: number;
  totalChairs: number;
  onPrevChair: () => void;
  onNextChair: () => void;
  onLaunchContextFit: () => void;
  onAddToCart: (chair: MerchantChair) => void;
}

export function ProductDetailHero({
  chair,
  chairIndex,
  totalChairs,
  onPrevChair,
  onNextChair,
  onLaunchContextFit,
  onAddToCart,
}: ProductDetailHeroProps) {
  const indexLabel = `${String(chairIndex + 1).padStart(2, '0')} / ${String(totalChairs).padStart(2, '0')}`;

  return (
    <section
      id="product-view"
      aria-labelledby="pdp-product-title"
      className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-10 pt-8 sm:pt-10 pb-10"
    >
      {/* Giant Swiss Editorial Title (ECC Moooi. Random. rhythm) */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 pb-6">
        <h1
          id="pdp-product-title"
          className="text-4xl sm:text-6xl font-bold tracking-[-0.038em] leading-[1.02] text-[#0E0E0E] dark:text-[#F2F2F2] [text-wrap:balance]"
        >
          {chair.shortTitle}
        </h1>
        <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-[#666666] dark:text-[#9CA3AF]">
          <span>{chair.name}</span>
          <span aria-hidden="true">·</span>
          <span className="text-[#0E0E0E] dark:text-[#F2F2F2] font-medium">{chair.price}</span>
        </div>
      </div>

      {/* 3-Column Swiss Hairline Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 border-t border-b border-[#DFDFDF] dark:border-[#262626] items-stretch">
        {/* Left Column: Editorial Description + Stark CTAs + Verified Dimensions */}
        <div className="lg:col-span-3 flex flex-col justify-between py-6 lg:pr-6 lg:border-r border-b lg:border-b-0 border-[#DFDFDF] dark:border-[#262626] gap-6">
          <div className="space-y-5">
            <p className="text-xs sm:text-[13px] leading-[1.65] text-[#333333] dark:text-[#CCCCCC]">
              {chair.description}
            </p>

            {/* Verified Catalog Specs (Zero hallucinated dimensions) */}
            <dl className="pt-4 border-t border-[#DFDFDF] dark:border-[#262626] space-y-2.5 text-xs">
              <div className="flex justify-between gap-3">
                <dt className="text-[#737373] dark:text-[#8E8E93]">Dimensions</dt>
                <dd className="font-mono tabular-nums text-right text-[#0E0E0E] dark:text-[#F2F2F2] font-medium">
                  H {chair.dimensions.heightCm} × W {chair.dimensions.widthCm} × D{' '}
                  {chair.dimensions.depthCm} cm
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#737373] dark:text-[#8E8E93]">Back Profile</dt>
                <dd className="text-right text-[#0E0E0E] dark:text-[#F2F2F2]">
                  {chair.backProfile} ({chair.dimensions.backHeightCm} cm)
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#737373] dark:text-[#8E8E93]">Visual Weight</dt>
                <dd className="text-right text-[#0E0E0E] dark:text-[#F2F2F2]">
                  {chair.visualWeight}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#737373] dark:text-[#8E8E93]">Material</dt>
                <dd className="text-right text-[#0E0E0E] dark:text-[#F2F2F2]">{chair.material}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#737373] dark:text-[#8E8E93]">Price / SKU</dt>
                <dd className="font-mono tabular-nums text-right text-[#0E0E0E] dark:text-[#F2F2F2]">
                  {chair.price} · {chair.sku}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[#737373] dark:text-[#8E8E93]">Availability</dt>
                <dd className="text-right text-[#0E0E0E] dark:text-[#F2F2F2]">
                  {chair.availability}
                </dd>
              </div>
            </dl>
          </div>

          {/* ECC Stark Full-Width Monochrome Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="button"
              onClick={onLaunchContextFit}
              className="w-full h-11 px-4 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold tracking-[0.01em] inline-flex items-center justify-between hover:opacity-85 transition-opacity whitespace-nowrap"
            >
              <span>Is It Fit?</span>
              <ArrowUpRight className="w-4 h-4 shrink-0" strokeWidth={1.75} />
            </button>

            <button
              type="button"
              onClick={() => onAddToCart(chair)}
              className="w-full h-11 px-4 bg-white dark:bg-[#111111] text-[#0E0E0E] dark:text-[#F2F2F2] border border-[#0E0E0E] dark:border-[#F2F2F2] text-xs font-semibold inline-flex items-center justify-between hover:bg-[#F5F5F4] dark:hover:bg-[#1C1C1C] transition-colors whitespace-nowrap"
            >
              <span>Add to Bag · {chair.price}</span>
              <ShoppingBag className="w-3.5 h-3.5 shrink-0" strokeWidth={1.75} />
            </button>

            <p className="text-[11px] text-[#737373] dark:text-[#8E8E93] pt-1">
              ContextFit evaluates this chair against your actual room photo before you buy.
            </p>
          </div>
        </div>

        {/* Center Column: Pure Gallery White Studio Hero Photo */}
        <div className="lg:col-span-7 flex items-center justify-center bg-white p-6 sm:p-10 lg:border-r border-b lg:border-b-0 border-[#DFDFDF] dark:border-[#262626] min-h-[360px] sm:min-h-[460px]">
          <SafeImage
            src={chair.imageUrl}
            alt={`${chair.name} studio photograph`}
            className="w-full max-w-[440px] max-h-[440px] object-contain brightness-[1.02] contrast-[1.04]"
            fallbackLabel={chair.name}
          />
        </div>

        {/* Right Column: Iconic ECC Vertical Rotated Designer Label + Catalog Index */}
        <div className="lg:col-span-2 flex flex-row lg:flex-col items-center justify-between py-5 lg:py-6 lg:pl-6 gap-4">
          <div className="text-[11px] font-mono tabular-nums text-[#737373] dark:text-[#8E8E93]">
            {indexLabel}
          </div>

          <div
            className="hidden lg:flex flex-1 items-center justify-center py-4 select-none"
            aria-hidden="true"
          >
            <span className="text-3xl font-bold tracking-[-0.03em] text-[#0E0E0E] dark:text-[#F2F2F2] [writing-mode:vertical-rl]">
              {chair.designer}
            </span>
          </div>

          <div className="lg:hidden text-sm font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
            {chair.designer}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onPrevChair}
              aria-label="Previous chair in catalog"
              className="w-9 h-9 inline-flex items-center justify-center border border-[#DFDFDF] dark:border-[#2C2C2C] text-[#0E0E0E] dark:text-[#F2F2F2] hover:border-[#0E0E0E] dark:hover:border-[#F2F2F2] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNextChair}
              aria-label="Next chair in catalog"
              className="w-9 h-9 inline-flex items-center justify-center border border-[#DFDFDF] dark:border-[#2C2C2C] text-[#0E0E0E] dark:text-[#F2F2F2] hover:border-[#0E0E0E] dark:hover:border-[#F2F2F2] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
