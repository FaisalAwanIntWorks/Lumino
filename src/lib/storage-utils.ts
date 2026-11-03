import { supabase } from '@/integrations/supabase/client';

/**
 * Generates a signed URL for a file in storage (secure access to private buckets)
 * @param bucket - The storage bucket name
 * @param path - The file path within the bucket
 * @param expiresIn - URL expiry time in seconds (default: 24 hours)
 */
export async function getSignedUrl(
  bucket: string,
  path: string,
  expiresIn: number = 86400
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error) {
    console.error('Error generating signed URL:', error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Uploads a file to storage with client-scoped path
 * @param bucket - The storage bucket name
 * @param clientId - The client ID for scoping
 * @param fileName - The file name
 * @param file - The file to upload
 */
export async function uploadClientFile(
  bucket: string,
  clientId: string,
  fileName: string,
  file: File
): Promise<{ path: string; url: string } | null> {
  const filePath = `${clientId}/${fileName}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error('Error uploading file:', uploadError);
    return null;
  }

  // Generate signed URL for the uploaded file
  const signedUrl = await getSignedUrl(bucket, uploadData.path);

  if (!signedUrl) {
    return null;
  }

  return {
    path: uploadData.path,
    url: signedUrl,
  };
}

/**
 * Deletes a file from storage
 * @param bucket - The storage bucket name
 * @param path - The file path to delete
 */
export async function deleteFile(bucket: string, path: string): Promise<boolean> {
  const { error } = await supabase.storage.from(bucket).remove([path]);

  if (error) {
    console.error('Error deleting file:', error);
    return false;
  }

  return true;
}
