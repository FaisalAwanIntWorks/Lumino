import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { RingConfiguration } from '@/types/ring-builder';
import { toWebpRenderUrl, WEBP_TRANSPARENT_RENDER_STYLE_FOLDERS } from '@/lib/cdn-utils';

interface RingVariantImages {
  image_angle_0: string | null;
  image_angle_1: string | null;
  image_angle_2: string | null;
  image_angle_3: string | null;
  image_angle_4: string | null;
  model_photo: string | null;
  model_3d_url: string | null;
  video_url: string | null;
}

interface UseRingVariantImagesResult {
  images: RingVariantImages | null;
  loading: boolean;
  error: string | null;
}

// Map metal variant names to color families for matching
const getColorFamilyFromMetal = (metal: string | null | undefined): string | null => {
  if (!metal) return null;

  const metalLower = metal.toLowerCase();

  if (metalLower.includes('yellow')) return 'yellow';
  if (metalLower.includes('rose') || metalLower.includes('pink')) return 'rose';
  // Platinum and Silver are now separate families but share white-gold imagery,
  // so we still resolve them to 'white' for master_db image lookup.
  if (metalLower.includes('white') || metalLower.includes('platinum') || metalLower.includes('silver')) return 'white';
  if (metalLower.includes('gold')) return 'yellow';

  return null;
};

// Client metal variants can have arbitrary names (e.g. "Champagne"), so we also
// resolve visual_color (yellow/rose/white) from the client's configured metal variants.
// Must match the slug logic used in useClientCatalogOptions (variant_name -> id)
// so we can reliably map configuration.metal -> color_family.
const slugifyVariantName = (value: string): string =>
  value.toLowerCase().trim().replace(/\s+/g, '-');

// CloudFront CDN base URL for ring assets
const CLOUDFRONT_CDN_BASE = 'https://do2z856wqq7wu.cloudfront.net';

// WebP-first render styles live in `WEBP_RENDER_STYLE_FOLDERS` (src/lib/cdn-utils.ts),
// shared with the admin/catalog/saved-designs pages and the Shopify push.

// Clients that should use transparent_*_filename columns instead of image_*_filename.
// Currently scoped to "24k Carat Jewelers" only.
const TRANSPARENT_IMAGE_CLIENT_IDS = new Set<string>([
  '9311d1ea-09d1-4f5c-a03c-baf0101ab6c5',
]);

// Shared select fields used across all DB queries
const SELECT_FIELDS =
  'folder_path, image_0_filename, image_1_filename, image_2_filename, image_3_filename, image_4_filename, image_url_0, model_photo_filename, model_3d_url, video_url, video_filename, transparent_0_filename, transparent_1_filename, transparent_2_filename, transparent_3_filename';

// Module-level cache: combination key → resolved images (or null = confirmed no match).
// Persists for the lifetime of the browser tab so repeated selections are instant.
const variantImageCache = new Map<string, RingVariantImages | null>();

// Helper to construct full image URL from folder_path and filename
// Uses CloudFront CDN for optimized global delivery
const constructImageUrl = (folderPath: string | null, filename: string | null): string | null => {
  if (!filename || !folderPath) return null;

  // Remove "rings/" prefix from folder path if present (CDN uses shorter paths)
  let cdnPath = folderPath.replace(/^rings\//, '');
  // Capitalize "solitaire" to match CDN bucket structure
  cdnPath = cdnPath.replace(/^solitaire\//, 'Solitaire/');

  // Use CloudFront CDN for all ring assets
  return `${CLOUDFRONT_CDN_BASE}/${cdnPath}/${filename}`;
};

export const useRingVariantImages = (configuration: RingConfiguration): UseRingVariantImagesResult => {
  const [images, setImages] = useState<RingVariantImages | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // In the public embed, clientId is present in the URL; we use it to map metal variant -> color family.
  const { clientId } = useParams<{ clientId?: string }>();
  const metalFamilyMapRef = useRef<Map<string, string>>(new Map());
  const metalFamilyClientRef = useRef<string | null>(null);

  // Convert IDs like "three-stone" -> "Three Stone" for name-based fallback querying
  const toHumanName = (value: string) =>
    value
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

  // Track previous config to detect actual changes
  const prevConfigRef = useRef<string>('');

  const ensureMetalFamilyMapLoaded = async (): Promise<void> => {
    if (!clientId) return;

    // Reset cache if we moved to a different client
    if (metalFamilyClientRef.current !== clientId) {
      metalFamilyClientRef.current = clientId;
      metalFamilyMapRef.current.clear();
    }

    // Already loaded for this client
    if (metalFamilyMapRef.current.size > 0) return;

    const { data, error } = await supabase
      .from('client_metal_variants')
      .select('variant_name, color_family')
      .eq('client_id', clientId);

    if (error) {
      // Fail soft; we'll fall back to string parsing.
      console.warn('[useRingVariantImages] Could not load client metal variants:', error);
      return;
    }

    (data || []).forEach((row: any) => {
      if (!row?.variant_name || !row?.color_family) return;
      const key = slugifyVariantName(String(row.variant_name));
      // Master DB only has yellow/rose/white imagery; alias platinum & silver to white.
      const cf = String(row.color_family);
      const aliased = cf === 'platinum' || cf === 'silver' ? 'white' : cf;
      metalFamilyMapRef.current.set(key, aliased);
    });
  };

  const resolveVisualColor = async (metal: string | null | undefined): Promise<string | null> => {
    if (!metal) return null;

    // Back-compat for older slugs / mock values
    const parsed = getColorFamilyFromMetal(metal);
    if (parsed) return parsed;

    // Preferred: client-specific mapping (supports arbitrary custom metal names)
    await ensureMetalFamilyMapLoaded();
    return metalFamilyMapRef.current.get(metal) ?? null;
  };

  useEffect(() => {
    let cancelled = false;

    const cachedFamily = configuration.metal ? metalFamilyMapRef.current.get(configuration.metal) : null;
    const colorFamily = cachedFamily ?? getColorFamilyFromMetal(configuration.metal);
    const configSignature = [
      configuration.style || '',
      configuration.shank || '',
      colorFamily || '',
      configuration.shape || ''
    ].join('|');

    prevConfigRef.current = configSignature;

    const fetchVariantImages = async () => {
      if (!configuration.style) {
        if (!cancelled) setImages(null);
        return;
      }

      const colorFamily = await resolveVisualColor(configuration.metal);
      if (cancelled) return;

      const hasFullSelection = Boolean(
        configuration.style &&
          configuration.shank &&
          colorFamily &&
          configuration.shape
      );

      if (!hasFullSelection) {
        if (!cancelled) setImages(null);
        return;
      }

      const cacheKey = `${configuration.style}|${configuration.shank}|${colorFamily}|${configuration.shape}`;

      // Return cached result instantly — no DB round-trip needed.
      if (variantImageCache.has(cacheKey)) {
        if (!cancelled) {
          setImages(variantImageCache.get(cacheKey) ?? null);
          setLoading(false);
          setError(null);
        }
        return;
      }

      if (!cancelled) {
        setLoading(true);
        setError(null);
      }

      try {
        const expectedCombinationId = `${configuration.style}-${configuration.shank}-${colorFamily}-${configuration.shape}`;
        const expectedFolderPath = `rings/${configuration.style}/${configuration.shank}/${colorFamily}/${configuration.shape}`;

        // Primary query: combination_id is indexed — usually resolves in one round-trip.
        const { data: primaryData } = await supabase
          .from('my_master_db_data')
          .select(SELECT_FIELDS)
          .eq('combination_id', expectedCombinationId)
          .limit(1)
          .maybeSingle();

        if (cancelled) return;
        let data = primaryData;

        // If primary misses, fire the 3 fallback strategies in parallel instead of sequentially.
        if (!data) {
          const styleName = toHumanName(configuration.style);
          const shankName = toHumanName(configuration.shank!);
          const shapeName = toHumanName(configuration.shape!);

          const [r1, r2, r3] = await Promise.all([
            supabase.from('my_master_db_data').select(SELECT_FIELDS)
              .eq('folder_path', expectedFolderPath).limit(1).maybeSingle(),
            supabase.from('my_master_db_data').select(SELECT_FIELDS)
              .eq('style_id', configuration.style).eq('shank_id', configuration.shank)
              .eq('visual_color', colorFamily).eq('shape_id', configuration.shape)
              .limit(1).maybeSingle(),
            supabase.from('my_master_db_data').select(SELECT_FIELDS)
              .ilike('style_name', styleName).ilike('shank_name', shankName)
              .ilike('visual_color', colorFamily!).ilike('shape_name', shapeName)
              .limit(1).maybeSingle(),
          ]);

          if (cancelled) return;
          data = r1.data ?? r2.data ?? r3.data ?? null;
        }

        // Stage 3: same style+shank+color, any shape.
        // e.g. pave-rail-marquise-cut-white-* → shows correct color even if shape missing.
        if (!data) {
          const { data: likeColorData } = await supabase
            .from('my_master_db_data')
            .select(SELECT_FIELDS)
            .like('combination_id', `${configuration.style}-${configuration.shank}-${colorFamily}-%`)
            .limit(1)
            .maybeSingle();
          if (cancelled) return;
          data = likeColorData ?? null;
        }

        // Stage 4: same style+shank, any color/shape.
        // Last resort — at least shows the correct style+shank ring.
        if (!data) {
          const { data: likeShankData } = await supabase
            .from('my_master_db_data')
            .select(SELECT_FIELDS)
            .like('combination_id', `${configuration.style}-${configuration.shank}-%`)
            .limit(1)
            .maybeSingle();
          if (cancelled) return;
          data = likeShankData ?? null;
        }

        if (!cancelled) {
          if (data) {
            const folderPath = data.folder_path;
            const useTransparent = clientId ? TRANSPARENT_IMAGE_CLIENT_IDS.has(clientId) : false;
            const d = data as any;
            // Transparent filenames in DB are stored without extension; append .png for CDN.
            const withExt = (name: string | null | undefined): string | null => {
              if (!name) return null;
              return /\.(png|jpg|jpeg|webp|avif)$/i.test(name) ? name : `${name}.png`;
            };
            // One angle's URL. The transparent client gets its transparent file
            // (falling back to the stock file when none is stored); everyone else
            // gets the stock file. Both sets are then requested as WebP for the
            // styles enabled in cdn-utils — the stock set via
            // WEBP_RENDER_STYLE_FOLDERS, the transparent set via
            // WEBP_TRANSPARENT_RENDER_STYLE_FOLDERS. ProductViewer /
            // usePreloadedImage fall back to the .png if a WebP cannot load.
            const angleUrl = (transparent: string | null | undefined, stock: string | null | undefined): string | null => {
              const transparentName = useTransparent ? withExt(transparent) : null;
              if (transparentName) {
                return toWebpRenderUrl(constructImageUrl(folderPath, transparentName), WEBP_TRANSPARENT_RENDER_STYLE_FOLDERS);
              }
              return toWebpRenderUrl(constructImageUrl(folderPath, stock ?? null));
            };
            const transformedImages: RingVariantImages = {
              image_angle_0:
                angleUrl(d.transparent_0_filename, d.image_0_filename) ??
                (data as any).image_url_0 ??
                null,
              image_angle_1: angleUrl(d.transparent_1_filename, d.image_1_filename),
              image_angle_2: angleUrl(d.transparent_2_filename, d.image_2_filename),
              image_angle_3: angleUrl(d.transparent_3_filename, d.image_3_filename),
              image_angle_4: constructImageUrl(folderPath, (data as any).image_4_filename),
              model_photo: constructImageUrl(folderPath, (data as any).model_photo_filename),
              model_3d_url: data.model_3d_url,
              video_url: constructImageUrl(folderPath, (data as any).video_filename) ?? data.video_url,
            };
            variantImageCache.set(cacheKey, transformedImages);
            setImages(transformedImages);
          } else {
            variantImageCache.set(cacheKey, null);
            setImages(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError('Failed to fetch images');
          setImages(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchVariantImages();
    return () => { cancelled = true; };
  }, [configuration.style, configuration.shank, configuration.metal, configuration.shape, clientId]);

  return { images, loading, error };
};
