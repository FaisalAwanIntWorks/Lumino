import React from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2 } from 'lucide-react';
import { formatCartPrice } from '@/lib/pricing-utils';

export interface CartLineItem {
  type: 'ring' | 'diamond';
  name: string;
  price: number;
  imageUrl?: string;
  attributes: Record<string, string>;
}

export interface CartData {
  cartId: string;
  checkoutUrl: string;
  cartPermalinkUrl?: string;
  totalPrice: string;
  currency: string;
  lineItems: CartLineItem[];
}

interface CartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cartData: CartData | null;
  onCheckout: () => void;
  onViewOnStore?: () => void;
  onRemoveItem?: (index: number) => void;
}

export function CartDrawer({
  open,
  onOpenChange,
  cartData,
  onCheckout,
  onViewOnStore,
  onRemoveItem,
}: CartDrawerProps) {
  if (!cartData) return null;

  const totalAmount = parseFloat(cartData.totalPrice) || 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b border-border">
          <SheetTitle className="text-lg font-semibold">Your cart</SheetTitle>
        </SheetHeader>

        {/* Column headers */}
        <div className="px-6 py-3 flex justify-between text-xs font-medium text-muted-foreground uppercase tracking-wide border-b border-border">
          <span>Product</span>
          <span>Total</span>
        </div>

        {/* Cart items */}
        <ScrollArea className="flex-1 px-6">
          <div className="py-4 space-y-6">
            {cartData.lineItems.map((item, index) => (
              <div key={index} className="flex gap-4">
                {/* Product image placeholder */}
                <div className="w-20 h-20 bg-muted rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-muted-foreground text-xs text-center px-2">
                      {item.type === 'diamond' ? '💎' : '💍'}
                    </div>
                  )}
                </div>

                {/* Product details */}
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-start gap-2">
                    <h4 className="font-medium text-sm text-foreground truncate">
                      {item.name}
                    </h4>
                    <span className="font-semibold text-sm text-foreground whitespace-nowrap">
                      {formatCartPrice(item.price, cartData.currency)}
                    </span>
                  </div>

                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatCartPrice(item.price, cartData.currency)}
                  </p>

                  {/* Attributes */}
                  <div className="mt-2 space-y-0.5">
                    {Object.entries(item.attributes).slice(0, 4).map(([key, value]) => (
                      <p key={key} className="text-xs text-muted-foreground">
                        <span className="font-medium">{key}:</span> {value}
                      </p>
                    ))}
                  </div>

                  {/* Quantity and remove */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 border border-border rounded-md">
                      <button
                        className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                        disabled
                      >
                        −
                      </button>
                      <span className="text-sm px-1">1</span>
                      <button
                        className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
                        disabled
                      >
                        +
                      </button>
                    </div>

                    {onRemoveItem && (
                      <button
                        onClick={() => onRemoveItem(index)}
                        className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border px-6 py-4 space-y-4 bg-background">
          {/* Estimated total */}
          <div className="flex justify-between items-center">
            <span className="font-medium text-foreground">Estimated total</span>
            <span className="font-semibold text-lg text-foreground">
              {formatCartPrice(totalAmount, cartData.currency)} {cartData.currency}
            </span>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Taxes, Discounts and shipping calculated at checkout
          </p>

          {/* Checkout button */}
          <Button
            onClick={onCheckout}
            className="w-full"
            size="lg"
          >
            Check out
          </Button>

          {/* View Cart on Store button - only show if cartPermalinkUrl exists */}
          {cartData.cartPermalinkUrl && onViewOnStore && (
            <Button
              onClick={onViewOnStore}
              variant="outline"
              className="w-full"
              size="lg"
            >
              View Cart on Store
            </Button>
          )}

          {/* Payment icons */}
          <div className="flex justify-center items-center gap-2 pt-2">
            <PaymentIcon type="amex" />
            <PaymentIcon type="apple" />
            <PaymentIcon type="diners" />
            <PaymentIcon type="discover" />
            <PaymentIcon type="meta" />
            <PaymentIcon type="google" />
            <PaymentIcon type="mastercard" />
            <PaymentIcon type="shop" />
            <PaymentIcon type="visa" />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Simple payment icon component using text badges
function PaymentIcon({ type }: { type: string }) {
  const iconMap: Record<string, string> = {
    amex: 'Amex',
    apple: '🍎',
    diners: 'DC',
    discover: 'Disc',
    meta: 'Meta',
    google: 'G',
    mastercard: 'MC',
    shop: 'Shop',
    visa: 'Visa',
  };

  return (
    <div className="w-8 h-5 bg-muted rounded text-[8px] flex items-center justify-center text-muted-foreground font-medium">
      {iconMap[type] || type}
    </div>
  );
}
