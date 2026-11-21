import { Award, ExternalLink, Star } from 'lucide-react';
import type { ProductItem } from '../types/studio';
import {
  findLowestPriceId,
  getActiveVariant,
  getEffectivePrice,
  getReferenceImageUrl,
} from '../utils/sceneMath';
import { SafeImage } from './SafeImage';

interface SpecComparisonTableProps {
  products: ProductItem[];
  winnerId: string | null;
  onToggleWinner: (productId: string) => void;
}

export function SpecComparisonTable({
  products,
  winnerId,
  onToggleWinner,
}: SpecComparisonTableProps) {
  if (products.length === 0) return null;

  const lowestPriceId = findLowestPriceId(products);

  return (
    <section id="spec-table" aria-labelledby="spec-table-heading" className="scroll-mt-20">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-xs font-medium text-[#666666] dark:text-[#9CA3AF] mb-1">
            Structured comparison · {products.length} shortlisted product
            {products.length === 1 ? '' : 's'}
          </p>
          <h2
            id="spec-table-heading"
            className="text-xl sm:text-2xl font-semibold tracking-tight text-[#1A1A1A] dark:text-[#F1F1F1]"
          >
            Specs, Pricing &amp; Final Pick
          </h2>
        </div>
        {winnerId && (
          <button
            type="button"
            onClick={() => onToggleWinner(winnerId)}
            className="text-xs font-medium text-[#666666] dark:text-[#A1A1AA] hover:text-[#1A1A1A] dark:hover:text-[#F1F1F1] transition-colors"
          >
            Clear winner highlight
          </button>
        )}
      </div>

      <div className="rounded-xl border border-[#E5E5E5] dark:border-[#2E2E2E] bg-white dark:bg-[#1A1A1A] overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[#E5E5E5] dark:border-[#2E2E2E]">
              <th
                scope="col"
                className="w-40 p-4 text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] align-bottom"
              >
                Specification
              </th>
              {products.map((product, idx) => {
                const isWinner = winnerId === product.id;
                const letter = String.fromCharCode(65 + idx);
                return (
                  <th
                    key={product.id}
                    scope="col"
                    className={`p-4 align-top transition-colors ${
                      isWinner ? 'bg-[#5433EB]/[0.05] dark:bg-[#5433EB]/[0.14]' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-12 h-12 rounded-lg overflow-hidden border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] shrink-0">
                        <SafeImage
                          src={getReferenceImageUrl(product)}
                          alt={product.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-mono text-[#666666] dark:text-[#A1A1AA] flex items-center gap-1.5">
                          <span>Option {letter}</span>
                          {isWinner && (
                            <span className="inline-flex items-center gap-0.5 text-[#5433EB] dark:text-[#A594FF] font-sans font-semibold">
                              · Winner
                            </span>
                          )}
                        </div>
                        <div className="text-sm font-semibold text-[#1A1A1A] dark:text-[#F1F1F1] leading-snug line-clamp-2 mt-0.5">
                          {product.title}
                        </div>
                      </div>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-[#E5E5E5] dark:divide-[#2E2E2E] text-sm">
            {/* Price */}
            <tr>
              <th
                scope="row"
                className="p-4 text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] align-top"
              >
                Price
              </th>
              {products.map((product) => {
                const price = getEffectivePrice(product);
                const isLowest = lowestPriceId === product.id;
                const isWinner = winnerId === product.id;
                return (
                  <td
                    key={product.id}
                    className={`p-4 align-top font-mono tabular-nums ${
                      isWinner ? 'bg-[#5433EB]/[0.05] dark:bg-[#5433EB]/[0.14]' : ''
                    }`}
                  >
                    <div className="font-semibold text-[#1A1A1A] dark:text-[#F1F1F1]">
                      {price.display}
                    </div>
                    {isLowest && (
                      <div className="text-[11px] font-sans font-medium text-[#5433EB] dark:text-[#A594FF] mt-0.5">
                        Lowest price
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Store / Brand */}
            <tr>
              <th
                scope="row"
                className="p-4 text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] align-top"
              >
                Store
              </th>
              {products.map((product) => {
                const isWinner = winnerId === product.id;
                return (
                  <td
                    key={product.id}
                    className={`p-4 align-top text-[#1A1A1A] dark:text-[#F1F1F1] ${
                      isWinner ? 'bg-[#5433EB]/[0.05] dark:bg-[#5433EB]/[0.14]' : ''
                    }`}
                  >
                    <div>{product.store}</div>
                    {product.brand !== product.store && (
                      <div className="text-xs text-[#666666] dark:text-[#A1A1AA] mt-0.5">
                        {product.brand}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Availability */}
            <tr>
              <th
                scope="row"
                className="p-4 text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] align-top"
              >
                Availability
              </th>
              {products.map((product) => {
                const variant = getActiveVariant(product);
                const availText = variant
                  ? variant.available
                    ? 'In Stock'
                    : 'Out of Stock'
                  : product.availability;
                const inStock = !/out of stock|sold out/i.test(availText);
                const isWinner = winnerId === product.id;
                return (
                  <td
                    key={product.id}
                    className={`p-4 align-top ${
                      isWinner ? 'bg-[#5433EB]/[0.05] dark:bg-[#5433EB]/[0.14]' : ''
                    }`}
                  >
                    <span
                      className={`text-sm font-medium ${
                        inStock
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {availText}
                    </span>
                  </td>
                );
              })}
            </tr>

            {/* Rating */}
            <tr>
              <th
                scope="row"
                className="p-4 text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] align-top"
              >
                Rating
              </th>
              {products.map((product) => {
                const isWinner = winnerId === product.id;
                return (
                  <td
                    key={product.id}
                    className={`p-4 align-top font-mono tabular-nums ${
                      isWinner ? 'bg-[#5433EB]/[0.05] dark:bg-[#5433EB]/[0.14]' : ''
                    }`}
                  >
                    {product.rating !== null ? (
                      <div className="inline-flex items-center gap-1.5 text-[#1A1A1A] dark:text-[#F1F1F1]">
                        <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                        <span className="font-medium">{product.rating.toFixed(1)}</span>
                        {product.reviewCount !== null && (
                          <span className="text-xs font-sans text-[#666666] dark:text-[#A1A1AA]">
                            ({product.reviewCount})
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs font-sans text-[#666666] dark:text-[#A1A1AA]">
                        No rating listed
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Selected Variant / SKU */}
            <tr>
              <th
                scope="row"
                className="p-4 text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] align-top"
              >
                Selected Variant / SKU
              </th>
              {products.map((product) => {
                const variant = getActiveVariant(product);
                const isWinner = winnerId === product.id;
                return (
                  <td
                    key={product.id}
                    className={`p-4 align-top ${
                      isWinner ? 'bg-[#5433EB]/[0.05] dark:bg-[#5433EB]/[0.14]' : ''
                    }`}
                  >
                    <div className="text-[#1A1A1A] dark:text-[#F1F1F1]">
                      {variant?.title || 'Standard'}
                    </div>
                    {variant?.sku && (
                      <div className="text-xs font-mono text-[#666666] dark:text-[#A1A1AA] mt-0.5">
                        SKU: {variant.sku}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Key Features */}
            <tr>
              <th
                scope="row"
                className="p-4 text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] align-top"
              >
                Key Features
              </th>
              {products.map((product) => {
                const isWinner = winnerId === product.id;
                return (
                  <td
                    key={product.id}
                    className={`p-4 align-top ${
                      isWinner ? 'bg-[#5433EB]/[0.05] dark:bg-[#5433EB]/[0.14]' : ''
                    }`}
                  >
                    {product.features.length > 0 ? (
                      <ul className="space-y-1.5 text-xs text-[#404040] dark:text-[#D4D4D8] list-disc pl-4">
                        {product.features.slice(0, 5).map((feat, i) => (
                          <li key={i} className="leading-relaxed">
                            {feat}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-xs text-[#666666] dark:text-[#A1A1AA]">
                        No specifications listed
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>

            {/* Decision & Merchant Link */}
            <tr>
              <th
                scope="row"
                className="p-4 text-xs font-semibold text-[#666666] dark:text-[#A1A1AA] align-middle"
              >
                Decision
              </th>
              {products.map((product) => {
                const isWinner = winnerId === product.id;
                return (
                  <td
                    key={product.id}
                    className={`p-4 align-middle ${
                      isWinner ? 'bg-[#5433EB]/[0.05] dark:bg-[#5433EB]/[0.14]' : ''
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={() => onToggleWinner(product.id)}
                        aria-pressed={isWinner}
                        className={`h-9 px-3.5 text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                          isWinner
                            ? 'bg-[#5433EB] text-white hover:bg-[#4424D6]'
                            : 'border border-[#E5E5E5] dark:border-[#2E2E2E] bg-[#F7F7F8] dark:bg-[#141414] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#5433EB]'
                        }`}
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>{isWinner ? 'Picked Winner' : 'Pick Winner'}</span>
                      </button>

                      {product.url && (
                        <a
                          href={product.url}
                          target="_blank"
                          rel="noreferrer"
                          className="h-9 px-3 text-xs font-medium rounded-lg border border-[#E5E5E5] dark:border-[#2E2E2E] text-[#1A1A1A] dark:text-[#F1F1F1] hover:border-[#1A1A1A] dark:hover:border-[#F1F1F1] inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                        >
                          <span>Visit Store</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}
