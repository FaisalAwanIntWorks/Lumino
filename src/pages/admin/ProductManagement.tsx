import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Package, Database, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePageSearchRegistration } from '@/hooks/usePageSearchRegistration';
import { toast } from 'sonner';
import { ProductEditDialog } from '@/components/admin/ProductEditDialog';
import { ProductDetailDialog } from '@/components/admin/ProductDetailDialog';
import { useAdminActivityLogger } from '@/hooks/useAdminActivityLogger';
import { MasterDbFilters } from '@/components/admin/MasterDbFilters';
import { getProductCdnImageUrl } from '@/lib/cdn-utils';
import { fallbackToPngOnError } from '@/lib/webp-image-fallback';
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';

interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  base_cost: number;
  manufacturing_cost: number | null;
  image_urls: string[];
  cad_file_url: string | null;
  model_3d_url: string | null;
  status: string;
  created_at: string;
  product_variations?: any[];
}

interface MasterDbData {
  id: string;
  unique_id: string;
  combination_id: string;
  style_id: string | null;
  style_name: string | null;
  shank_id: string | null;
  shank_name: string | null;
  visual_color: string | null;
  visual_color_name: string | null;
  shape_id: string | null;
  shape_name: string | null;
  base_price: number | null;
  image_url_0: string | null;
  image_url_1: string | null;
  image_url_2: string | null;
  image_url_3: string | null;
  image_0_filename: string | null;
  image_1_filename: string | null;
  image_2_filename: string | null;
  image_3_filename: string | null;
  folder_path: string | null;
  product_name: string | null;
  video_filename: string | null;
  video_url: string | null;
  video_status: boolean | null;
  glb_model_filename: string | null;
  glb_model_status: boolean | null;
  model_3d_url: string | null;
  model_photo_filename: string | null;
  model_photo_url: string | null;
  model_photo_status: boolean | null;
  rendered_cad_filename: string | null;
  rendered_cad_url: string | null;
  rendered_cad_status: boolean | null;
  manufacture_cad_filename: string | null;
  manufacture_cad_url: string | null;
  manufacture_cad_status: boolean | null;
  transparent_0_filename: string | null;
  transparent_1_filename: string | null;
  transparent_2_filename: string | null;
  transparent_3_filename: string | null;
  transparent_url_0: string | null;
  transparent_url_1: string | null;
  transparent_url_2: string | null;
  transparent_url_3: string | null;
  notes: string | null;
  drive_link: string | null;
  all_upload_complete: boolean | null;
  total_files: number | null;
  files_uploaded: string | null;
  created_at: string | null;
}

const formatProductTitle = (combinationId: string): string => {
  return combinationId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

const getProductImageUrl = (item: MasterDbData): string | null => {
  return getProductCdnImageUrl(item, 0);
};

export default function ProductManagement() {
  const [products, setProducts] = useState<Product[]>([]);
  const [masterData, setMasterData] = useState<MasterDbData[]>([]);
  const [loading, setLoading] = useState(true);
  const [masterLoading, setMasterLoading] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedMasterItem, setSelectedMasterItem] = useState<MasterDbData | null>(null);
  const { logProductDelete } = useAdminActivityLogger();

  const [searchQuery, setSearchQuery] = useState('');
  const [styleFilter, setStyleFilter] = useState('all');
  const [shapeFilter, setShapeFilter] = useState('all');
  const [colorFilter, setColorFilter] = useState('all');
  const [shankFilter, setShankFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 25;

  const productSearchItems = useMemo(() => [
    ...products.map(p => ({
      id: p.id,
      label: p.name,
      description: `${p.category}`,
      icon: Package,
      category: p.status,
      action: () => { setEditingProduct(p); setEditDialogOpen(true); },
    })),
    ...masterData.slice(0, 30).map(m => ({
      id: m.id,
      label: m.product_name || formatProductTitle(m.combination_id),
      description: `${m.style_name || ''} · ${m.shape_name || ''}`,
      icon: Database,
      category: 'Master DB',
      action: () => setSelectedMasterItem(m),
    })),
  ], [products, masterData]);
  usePageSearchRegistration('Products', productSearchItems);

  useEffect(() => {
    fetchProducts();
    fetchMasterData();
  }, []);

  const fetchMasterData = async () => {
    try {
      const { data, error } = await supabase
        .from('my_master_db_data')
        .select('*')
        .order('combination_id');
      if (error) throw error;
      setMasterData(data || []);
    } catch (error) {
      console.error('Error fetching master data:', error);
      toast.error('Failed to load master database');
    } finally {
      setMasterLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_variations(count)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  };

  const filterOptions = useMemo(() => {
    const styles = [...new Set(masterData.map(item => item.style_name).filter(Boolean))] as string[];
    const shapes = [...new Set(masterData.map(item => item.shape_name).filter(Boolean))] as string[];
    const colors = [...new Set(masterData.map(item => item.visual_color_name).filter(Boolean))] as string[];
    const shanks = [...new Set(masterData.map(item => item.shank_name).filter(Boolean))] as string[];
    return { styles: styles.sort(), shapes: shapes.sort(), colors: colors.sort(), shanks: shanks.sort() };
  }, [masterData]);

  const filteredMasterData = useMemo(() => {
    return masterData.filter(item => {
      const title = item.product_name || formatProductTitle(item.combination_id);
      const matchesSearch = searchQuery === '' ||
        title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.combination_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.style_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.shape_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.visual_color_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.shank_name?.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesStyle = styleFilter === 'all' || item.style_name === styleFilter;
      const matchesShape = shapeFilter === 'all' || item.shape_name === shapeFilter;
      const matchesColor = colorFilter === 'all' || item.visual_color_name === colorFilter;
      const matchesShank = shankFilter === 'all' || item.shank_name === shankFilter;
      return matchesSearch && matchesStyle && matchesShape && matchesColor && matchesShank;
    });
  }, [masterData, searchQuery, styleFilter, shapeFilter, colorFilter, shankFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredMasterData.length / PAGE_SIZE));
  const paginatedData = useMemo(
    () => filteredMasterData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filteredMasterData, currentPage]
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, styleFilter, shapeFilter, colorFilter, shankFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  const deleteProduct = async (productId: string, productName: string) => {
    if (!confirm('Are you sure you want to delete this product?')) return;
    try {
      const { error } = await supabase.from('products').update({ status: 'inactive' }).eq('id', productId);
      if (error) throw error;
      await logProductDelete(productName, productId);
      toast.success('Product deleted successfully');
      fetchProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Failed to delete product');
    }
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-1/2 sm:w-1/4"></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <div key={i} className="aspect-square bg-muted rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-full overflow-x-hidden">
      <div className="mb-4 sm:mb-6 lg:mb-8">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold mb-1 sm:mb-2">RingOS Catalog</h1>
        <p className="text-sm sm:text-base text-muted-foreground">
          Browse all ring combinations and their CDN assets.
        </p>
      </div>

      <div className="space-y-3 sm:space-y-4">
        <div className="flex flex-col gap-4 mb-3 sm:mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-semibold">All Products</h2>
          </div>
          <MasterDbFilters
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            styleFilter={styleFilter}
            onStyleChange={setStyleFilter}
            shapeFilter={shapeFilter}
            onShapeChange={setShapeFilter}
            colorFilter={colorFilter}
            onColorChange={setColorFilter}
            shankFilter={shankFilter}
            onShankChange={setShankFilter}
            styles={filterOptions.styles}
            shapes={filterOptions.shapes}
            colors={filterOptions.colors}
            shanks={filterOptions.shanks}
            totalCount={masterData.length}
            filteredCount={filteredMasterData.length}
          />
        </div>

        {masterLoading ? (
          <div className="flex items-center justify-center py-8 sm:py-12">
            <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">
            {paginatedData.map((item) => {
              const imageUrl = getProductImageUrl(item);
              const title = item.product_name || formatProductTitle(item.combination_id);
              return (
                <Card
                  key={item.id}
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => setSelectedMasterItem(item)}
                >
                  <div className="relative aspect-square bg-muted">
                    {imageUrl ? (
                      <img
                        src={imageUrl}
                        alt={title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Retry the .png twin of a failed .webp before hiding the image.
                          if (fallbackToPngOnError(e)) return;
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="w-8 h-8 sm:w-12 sm:h-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div className="p-2 sm:p-4">
                    <h3 className="font-semibold text-xs sm:text-base mb-1 sm:mb-2 line-clamp-2 sm:line-clamp-1">{title}</h3>
                    <div className="flex flex-wrap gap-1 sm:gap-1.5">
                      {item.style_name && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 sm:px-2 sm:py-0.5">{item.style_name}</Badge>
                      )}
                      {item.shape_name && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 sm:px-2 sm:py-0.5">{item.shape_name}</Badge>
                      )}
                      {item.visual_color_name && (
                        <Badge variant="outline" className="text-[10px] sm:text-xs px-1.5 py-0 sm:px-2 sm:py-0.5 hidden sm:inline-flex">{item.visual_color_name}</Badge>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {!masterLoading && filteredMasterData.length > 0 && totalPages > 1 && (
          <Pagination className="pt-4">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (currentPage > 1) setCurrentPage(currentPage - 1); }}
                  className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, idx) =>
                  p === 'ellipsis' ? (
                    <PaginationItem key={`e-${idx}`}><PaginationEllipsis /></PaginationItem>
                  ) : (
                    <PaginationItem key={p}>
                      <PaginationLink
                        href="#"
                        isActive={p === currentPage}
                        onClick={(e) => { e.preventDefault(); setCurrentPage(p); }}
                      >
                        {p}
                      </PaginationLink>
                    </PaginationItem>
                  )
                )}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (currentPage < totalPages) setCurrentPage(currentPage + 1); }}
                  className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}

        {!masterLoading && filteredMasterData.length === 0 && (
          <Card className="p-6 sm:p-12 text-center">
            <Database className="w-12 h-12 sm:w-16 sm:h-16 mx-auto text-muted-foreground mb-3 sm:mb-4" />
            <h3 className="text-base sm:text-lg font-semibold mb-2">
              {masterData.length === 0 ? 'No Products in Master Database' : 'No products match your filters'}
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              {masterData.length === 0 ? 'Import products to get started' : 'Try adjusting your search or filter criteria'}
            </p>
          </Card>
        )}
      </div>

      <ProductEditDialog product={editingProduct} open={editDialogOpen} onOpenChange={setEditDialogOpen} onSave={() => { fetchProducts(); setEditingProduct(null); }} />
      <ProductDetailDialog item={selectedMasterItem} open={!!selectedMasterItem} onOpenChange={(open) => { if (!open) setSelectedMasterItem(null); }} />
    </div>
  );
}