import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { ImageCarousel } from "@/components/product/ImageCarousel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCart } from "@/hooks/useCart";
import { formatCurrency } from "@/lib/pricing-utils";
import { Heart, Share2, ShoppingCart, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { AurezoLicenseBadge } from "@/components/common/AurezoLicenseBadge";

interface Product {
  id: string;
  name: string;
  description: string;
  base_cost: number;
  image_urls: string[];
  category: string;
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const { addToCart } = useCart();
  const { toast } = useToast();

  useEffect(() => {
    if (id) {
      loadProduct();
    }
  }, [id]);

  const loadProduct = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (error) throw error;
      setProduct(data);
    } catch (error) {
      console.error("Error loading product:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToCart = async () => {
    if (!product) return;
    await addToCart(product.id, {});
  };

  const handleToggleFavorite = () => {
    setIsFavorite(!isFavorite);
    toast({
      title: isFavorite ? "Removed from wishlist" : "Added to wishlist",
      description: isFavorite ? "Item removed from your wishlist" : "Item added to your wishlist",
    });
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    toast({
      title: "Link copied",
      description: "Product link copied to clipboard",
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 pt-20 flex items-center justify-center">
          <p>Loading...</p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 pt-20 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4">Product not found</h2>
            <Link to="/shop">
              <Button>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Shop
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      
      <main className="flex-1 pt-20">
        <div className="container mx-auto px-6 py-12">
          {/* Breadcrumb */}
          <div className="mb-6">
            <Link to="/shop" className="text-sm text-muted-foreground hover:text-foreground">
              Shop
            </Link>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="text-sm">{product.name}</span>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* Product Images */}
            <div className="relative">
              <ImageCarousel
                images={product.image_urls}
                alt={product.name}
              />
              <div className="absolute top-4 right-4 z-10">
                <AurezoLicenseBadge size="sm" />
              </div>
            </div>

            {/* Product Info */}
            <div>
              <h1 className="text-4xl font-bold mb-4">{product.name}</h1>
              
              <div className="flex items-center gap-4 mb-6">
                <p className="text-3xl font-bold">{formatCurrency(product.base_cost)}</p>
              </div>

              <p className="text-muted-foreground mb-6">
                {product.description}
              </p>

              {/* Action Buttons */}
              <div className="flex gap-4 mb-8">
                <Button 
                  size="lg" 
                  className="flex-1"
                  onClick={handleAddToCart}
                >
                  <ShoppingCart className="w-5 h-5 mr-2" />
                  Add to Cart
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleToggleFavorite}
                >
                  <Heart className={`w-5 h-5 ${isFavorite ? 'fill-current' : ''}`} />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handleShare}
                >
                  <Share2 className="w-5 h-5" />
                </Button>
              </div>

              {/* Product Details Tabs */}
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="inline-flex h-auto w-max gap-0 rounded-none border-b border-border bg-transparent p-0">
                  <TabsTrigger value="details" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Details</TabsTrigger>
                  <TabsTrigger value="specifications" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Specifications</TabsTrigger>
                  <TabsTrigger value="shipping" className="relative rounded-none border-b-2 border-transparent bg-transparent px-4 py-2.5 text-xs sm:text-sm font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none whitespace-nowrap">Shipping</TabsTrigger>
                </TabsList>
                
                <TabsContent value="details" className="mt-6">
                  <div className="space-y-4">
                    <p className="text-muted-foreground">
                      {product.description}
                    </p>
                    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                      <li>Handcrafted with precision</li>
                      <li>Premium materials</li>
                      <li>Lifetime warranty included</li>
                      <li>Certificate of authenticity</li>
                    </ul>
                  </div>
                </TabsContent>
                
                <TabsContent value="specifications" className="mt-6">
                  <div className="space-y-3">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Category</span>
                      <span className="font-medium">{product.category}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Material</span>
                      <span className="font-medium">Premium Gold</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Weight</span>
                      <span className="font-medium">Varies by size</span>
                    </div>
                  </div>
                </TabsContent>
                
                <TabsContent value="shipping" className="mt-6">
                  <div className="space-y-4 text-muted-foreground">
                    <p>
                      <strong className="text-foreground">Free Standard Shipping:</strong> 5-7 business days
                    </p>
                    <p>
                      <strong className="text-foreground">Express Shipping:</strong> 2-3 business days ($25)
                    </p>
                    <p>
                      <strong className="text-foreground">Overnight Shipping:</strong> Next business day ($50)
                    </p>
                    <p className="pt-4">
                      All orders include insurance and require signature upon delivery.
                    </p>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
