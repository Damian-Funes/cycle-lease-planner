import { useEffect, useState } from "react";
import { resolvePlantaSignedUrl } from "@/lib/plantasUrl";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  source: string | null | undefined;
  fallback?: React.ReactNode;
}

/** Renderiza imagem de planta do cliente usando URL assinada (bucket privado). */
export default function PlantaImage({ source, fallback = null, ...imgProps }: Props) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!source) { setUrl(null); return; }
    resolvePlantaSignedUrl(source).then((u) => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [source]);

  if (!source) return <>{fallback}</>;
  if (!url) return <>{fallback}</>;
  return <img src={url} {...imgProps} />;
}
