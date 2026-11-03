import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export interface CartItem {
  id: string;
  product_id: string;
  variation_id?: string;
  configuration: any;
  quantity: number;
  product?: {
    id: string;
    name: string;
    image_urls: string[];
    base_cost: number;
  };
}

export const useCart = () => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [loading] = useState(false);
  const { toast } = useToast();

  const addToCart = async (
    productId: string,
    configuration: any,
    quantity: number = 1,
    variationId?: string
  ) => {
    const newItem: CartItem = {
      id: crypto.randomUUID(),
      product_id: productId,
      variation_id: variationId,
      configuration,
      quantity,
    };
    setCartItems((prev) => [...prev, newItem]);
    toast({ title: "Added to cart", description: "Item has been added to your cart" });
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    if (quantity < 1) {
      await removeFromCart(itemId);
      return;
    }
    setCartItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, quantity } : i)));
  };

  const removeFromCart = async (itemId: string) => {
    setCartItems((prev) => prev.filter((i) => i.id !== itemId));
    toast({ title: "Removed from cart", description: "Item has been removed from your cart" });
  };

  const clearCart = async () => {
    setCartItems([]);
  };

  const calculateSubtotal = () =>
    cartItems.reduce((total, item) => total + (item.product?.base_cost || 0) * item.quantity, 0);

  const calculateTax = (subtotal: number) => subtotal * 0.08;

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    return subtotal + calculateTax(subtotal);
  };

  return {
    cartItems,
    loading,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    calculateSubtotal,
    calculateTax,
    calculateTotal,
    cartCount: cartItems.reduce((sum, item) => sum + item.quantity, 0),
  };
};
