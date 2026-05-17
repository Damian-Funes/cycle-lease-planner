import { supabase } from "@/integrations/supabase/client";

const BUCKET = "plantas-cliente";

/**
 * Resolve um valor armazenado em `piso_imagem_url` (path novo ou URL pública legada)
 * para uma URL assinada temporária (1h). Bucket é privado.
 */
export async function resolvePlantaSignedUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  let path = value;
  // Legacy: URL pública completa — extrair path após /plantas-cliente/
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) path = value.slice(idx + marker.length).split("?")[0];
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Extrai o path (storage key) de um valor (path novo ou URL legada). */
export function extractPlantaPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const marker = `/${BUCKET}/`;
  const idx = value.indexOf(marker);
  if (idx >= 0) return value.slice(idx + marker.length).split("?")[0];
  return value;
}
