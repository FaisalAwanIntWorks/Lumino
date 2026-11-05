import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toWebpImageUrl } from '@/lib/webp-image-fallback';
import { ASSET_CDN } from "@/lib/asset-cdn";

export interface CaratSizeImageRow {
  id: string;
  diamond_shape: string;
  folder_path: string | null;
  image_0_filename: string | null;
  image_1_filename: string | null;
  image_2_filename: string | null;
  image_3_filename: string | null;
  image_4_filename: string | null;
  image_5_filename: string | null;
  image_6_filename: string | null;
  image_7_filename: string | null;
  image_8_filename: string | null;
}

/** Maps carat_value (from client_carat_options) → image column index */
const CARAT_TO_INDEX: Record<number, number> = {
  0.5: 0,
  1: 1,
  1.5: 2,
  2: 3,
  2.5: 4,
  3: 5,
  3.5: 6,
  4: 7,
  4.5: 8,
};

/**
 * Carat buckets above 4.50 - 4.99 ct. The carat_size_images table only has
 * columns for the nine buckets above, so the 5.00 - 8.49 ct images are mapped
 * here; they live in the same CDN folder as the shape's other images.
 */
const EXTENDED_CARAT_VALUES = [5, 5.5, 6, 6.5, 7, 7.5, 8];

const EXTENDED_CARAT_FILENAMES: Record<string, string[]> = {
  round: ['tCIhU0kIfWDVIP6.png', '6NvtngC1JkXxsQl.png', 'qaphFyfPsJVWS5v.png', 'qe9f0gSETZ0vF0i.png', 'ymAcbHXN3m3WnyC.png', 'siTaGOHEx7bIwGC.png', 'DQdVfL50PHcwodz.png'],
  oval: ['IeXc8QOFgIxoaDn.png', '4q9EqEaVBnP1m7l.png', 'MN9pFy0TNuqFKhd.png', 'rdx8zHZWprN9fFW.png', 'RI9hiIAioXN1cBO.png', 'W3onsJ35QeqvLqg.png', 'e3dyq8nh7LUaDds.png'],
  princess: ['LptfmsDv9hjaNVi.png', 'UyzF9Er68w2fAiN.png', '74RJQchBWFzKmo8.png', 'WqnpFNuf1EGadMG.png', '8m60oiHJuMQPvX8.png', 'IwjcIEo99GBBA8b.png', 'xWhYl2z3ZSTJ8cA.png'],
  radiant: ['xGgiIN97OPGWqJV.png', 'vRWg4vdItgxck9p.png', 'KWHBCbxm7nvvkvM.png', 'Fq6wHPeI4yd4j55.png', 'g2LJQwKVeD21Ipq.png', 'YknWC67l7yfxLNG.png', 'Wr5TiIYL0CmAppG.png'],
  emerald: ['36zPS0Us8BJxKGP.png', 'Hw0MC6SRm4Dxyfr.png', 'FjRbr9wb4so2PgR.png', 'JBnsOQc87rqXRTz.png', 'Vpmg3qtIf6eTU4B.png', '6NOPekD7BWJWvHc.png', '9JnQ3Yv27IgcejW.png'],
  cushion: ['HpvSVzzKSypuUX1.png', 'nVSZ46CJverMmKW.png', 'd4EIjMTLqo7E2LY.png', 'IXhXucl6xC7JuQe.png', 'bYmSgeFHUSoo4fC.png', 'TdZ0DhSH13MCcGe.png', 'pSLY2DHk7Hmfn4G.png'],
  pear: ['GO8H059jPqU0ZSd.png', 'HV8739El6uCdSdK.png', 'tugIxCgIyiWVaF2.png', 'UU0EmYyant6mxDV.png', 'JCipA5nqsAYWwBv.png', 'I7LEaASiI8ZIRRj.png', 'vuufJJ8Zci6oSTz.png'],
  marquise: ['937SIDR8kHIZTjZ.png', 'iXEE7JsqdGHWPPS.png', 'B8XlOvaR2ZybiyT.png', '8djmg4JLxtlZnUH.png', 'q8anrIfBFkHyUGF.png', '6Bwj9Bn489TpdTq.png', '8QYGKsUAdtRYEaw.png'],
};

/**
 * Fetches carat_size_images table and provides a helper
 * to get the image URL for a given shape + carat value.
 */
export function useCaratSizeImages() {
  const { data: rows, isLoading } = useQuery<CaratSizeImageRow[]>({
    queryKey: ['carat-size-images'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('carat_size_images')
        .select('*');
      if (error) throw error;
      return (data ?? []) as CaratSizeImageRow[];
    },
    staleTime: 1000 * 60 * 30, // cache 30 min
  });

  /**
   * Returns the public image URL for a shape + carat value, or undefined.
   * Served from the CDN as WebP; every <img> showing one falls back to the
   * .png twin via `fallbackToPngOnError` if the WebP cannot load.
   */
  const getCaratImage = useCallback((shape: string | null, caratValue: number): string | undefined => {
    if (!shape || !rows?.length) return undefined;

    const row = rows.find(
      r => r.diamond_shape.toLowerCase() === shape.toLowerCase()
    );
    if (!row || !row.folder_path) return undefined;

    const idx = CARAT_TO_INDEX[caratValue];
    const filename = idx !== undefined
      ? (row[`image_${idx}_filename` as keyof CaratSizeImageRow] as string | null)
      : EXTENDED_CARAT_FILENAMES[shape.toLowerCase()]?.[EXTENDED_CARAT_VALUES.indexOf(caratValue)];
    if (!filename) return undefined;

    return toWebpImageUrl(`${ASSET_CDN.rings}/${row.folder_path}/${filename}`);
  }, [rows]);

  return { getCaratImage, isLoading };
}
