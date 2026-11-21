import { useState } from 'react';
import { X, Plus, Minus, Trash2, Check } from 'lucide-react';
import type { CartItem } from '../types/contextFit';
import { formatPrice } from '../utils/sceneMath';
import { SafeImage } from './SafeImage';

interface CartDrawerProps {
  isOpen: boolean;
  items: CartItem[];
  onClose: () => void;
  onUpdateQty: (chairId: string, delta: number) => void;
  onRemoveItem: (chairId: string) => void;
  onClearCart: () => void;
}

export function CartDrawer({
  isOpen,
  items,
  onClose,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
}: CartDrawerProps) {
  const [orderRef, setOrderRef] = useState<string | null>(null);

  if (!isOpen) return null;

  const subtotal = items.reduce((sum, item) => sum + item.chair.priceNumeric * item.quantity, 0);

  const handleDemoCheckout = () => {
    const code = `CF-${Math.floor(100000 + Math.random() * 900000)}`;
    setOrderRef(code);
    onClearCart();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/45"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cart-drawer-title"
    >
      <div className="w-full max-w-md h-full bg-white dark:bg-[#111111] border-l border-[#0E0E0E] dark:border-[#333333] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b-2 border-[#0E0E0E] dark:border-[#F2F2F2] flex items-center justify-between">
          <div>
            <h2
              id="cart-drawer-title"
              className="text-base font-bold tracking-tight text-[#0E0E0E] dark:text-[#F2F2F2]"
            >
              Shopping Bag
            </h2>
            <p className="text-[11px] text-[#737373] dark:text-[#8E8E93]">
              FORMA Demo Storefront Checkout
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setOrderRef(null);
              onClose();
            }}
            aria-label="Close shopping bag"
            className="w-9 h-9 inline-flex items-center justify-center border border-[#DFDFDF] dark:border-[#2C2C2C] text-[#0E0E0E] dark:text-[#F2F2F2] hover:border-[#0E0E0E] dark:hover:border-[#F2F2F2] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto divide-y divide-[#DFDFDF] dark:divide-[#262626]">
          {orderRef ? (
            <div className="p-8 space-y-4">
              <div className="w-10 h-10 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] flex items-center justify-center">
                <Check className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold tracking-tight text-[#0E0E0E] dark:text-[#F2F2F2]">
                Demo Order Recorded
              </h3>
              <p className="text-xs leading-relaxed text-[#525252] dark:text-[#A3A3A3]">
                Reference <span className="font-mono font-semibold text-[#0E0E0E] dark:text-white">{orderRef}</span>.
                This is a simulated merchant cart flow for the ContextFit hackathon demo—no real
                payment or Shopify charge was processed.
              </p>
              <button
                type="button"
                onClick={() => {
                  setOrderRef(null);
                  onClose();
                }}
                className="h-10 px-5 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold"
              >
                Continue Browsing
              </button>
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
                Your bag is empty
              </p>
              <p className="text-xs text-[#737373] dark:text-[#8E8E93]">
                Evaluate a chair with ContextFit or add any item from the FORMA catalog.
              </p>
            </div>
          ) : (
            items.map(({ chair, quantity }) => (
              <div key={chair.id} className="p-5 flex gap-4">
                <div className="w-20 h-20 bg-white border border-[#DFDFDF] dark:border-[#2C2C2C] p-1.5 shrink-0">
                  <SafeImage
                    src={chair.imageUrl}
                    alt={chair.name}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#0E0E0E] dark:text-[#F2F2F2] leading-snug">
                      {chair.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(chair.id)}
                      aria-label={`Remove ${chair.name} from bag`}
                      className="text-[#737373] hover:text-[#B91C1C] transition-colors p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-[#737373] dark:text-[#8E8E93] mt-0.5">
                    {chair.finish} · H {chair.dimensions.heightCm} × W {chair.dimensions.widthCm} cm
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="inline-flex items-center border border-[#DFDFDF] dark:border-[#2C2C2C]">
                      <button
                        type="button"
                        onClick={() => onUpdateQty(chair.id, -1)}
                        aria-label={`Decrease quantity of ${chair.name}`}
                        className="w-8 h-8 inline-flex items-center justify-center hover:bg-[#F5F5F4] dark:hover:bg-[#1C1C1C]"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-xs font-mono tabular-nums">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => onUpdateQty(chair.id, 1)}
                        aria-label={`Increase quantity of ${chair.name}`}
                        className="w-8 h-8 inline-flex items-center justify-center hover:bg-[#F5F5F4] dark:hover:bg-[#1C1C1C]"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <span className="text-sm font-mono tabular-nums font-semibold text-[#0E0E0E] dark:text-[#F2F2F2]">
                      {formatPrice(chair.priceNumeric * quantity, chair.currency)}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && !orderRef && (
          <div className="p-6 border-t border-[#DFDFDF] dark:border-[#262626] space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#737373] dark:text-[#8E8E93]">Subtotal</span>
              <span className="font-mono tabular-nums text-base font-bold text-[#0E0E0E] dark:text-[#F2F2F2]">
                {formatPrice(subtotal, 'USD')}
              </span>
            </div>
            <button
              type="button"
              onClick={handleDemoCheckout}
              className="w-full h-11 bg-[#0E0E0E] dark:bg-[#F2F2F2] text-white dark:text-[#111111] text-xs font-semibold hover:opacity-85 transition-opacity"
            >
              Complete Demo Order
            </button>
            <p className="text-[11px] text-[#737373] dark:text-[#8E8E93]">
              Simulated merchant checkout for ContextFit MVP demonstration.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
