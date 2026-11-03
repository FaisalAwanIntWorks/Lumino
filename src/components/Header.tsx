import { ShoppingCart } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/useCart";
import { ThemedLogo } from "@/components/common/ThemedLogo";

export const Header = () => {
  const { cartCount } = useCart();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-xl">
      <nav className="container mx-auto flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
        <a href="/" className="flex items-center justify-center w-full">
          <ThemedLogo className="h-12 md:h-16 w-auto" />
        </a>

        <nav className="hidden md:flex items-center gap-6">
          <Link to="/" className="text-sm font-medium hover:text-foreground transition-colors">
            Home
          </Link>
          <Link to="/shop" className="text-sm font-medium hover:text-foreground transition-colors">
            Shop
          </Link>
          <Link to="/ring-builder" className="text-sm font-medium hover:text-foreground transition-colors">
            Ring Builder
          </Link>
          <Link to="/custom-builder" className="text-sm font-medium hover:text-foreground transition-colors">
            Custom Builder
          </Link>
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          <Link to="/cart">
            <Button variant="ghost" size="icon" className="relative h-9 w-9 md:h-10 md:w-10">
              <ShoppingCart className="w-4 h-4 md:w-5 md:h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-primary text-primary-foreground text-[10px] md:text-xs rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </Button>
          </Link>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold text-xs md:text-sm px-3 md:px-4 h-9 md:h-10">
            Contact
          </Button>
        </div>
      </nav>
    </header>
  );
};
