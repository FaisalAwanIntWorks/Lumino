import { supabase } from '@/integrations/supabase/client';

/**
 * Uploads a single file immediately to the diamond-inspiration bucket and returns its public URL.
 * Returns null if the upload fails.
 */
export async function uploadSingleFormImage(
  clientId: string,
  file: File
): Promise<string | null> {
  const fileName = `${clientId}/${Date.now()}_${crypto.randomUUID()}_${file.name}`;
  const { error } = await supabase.storage
    .from('diamond-inspiration')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });
  if (error) {
    console.error('Failed to upload image:', error);
    return null;
  }
  const { data } = supabase.storage.from('diamond-inspiration').getPublicUrl(fileName);
  return data?.publicUrl || null;
}

/**
 * Uploads an array of files to the diamond-inspiration bucket and returns public URLs.
 */
export async function uploadFormImages(
  clientId: string,
  files: (File | null | undefined)[]
): Promise<string[]> {
  const validFiles = files.filter((f): f is File => f instanceof File);
  if (validFiles.length === 0) return [];

  const urls: string[] = [];
  for (const file of validFiles) {
    const url = await uploadSingleFormImage(clientId, file);
    if (url) urls.push(url);
  }
  return urls;
}
