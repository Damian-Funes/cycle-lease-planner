import { useEffect, useRef } from 'react';
import { loadGoogleMaps, getOrigemVendedor } from '@/lib/maps';
import { type RotaParada } from '@/lib/rotas';

export default function RotaMapa({ vendedorId, paradas }: { vendedorId: string; paradas: RotaParada[] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    const markers: any[] = [];
    let linha: any;
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled || !container.current) return;
        const origem = getOrigemVendedor(vendedorId);
        const base = { lat: origem.lat, lng: origem.lng };
        const map = new g.maps.Map(container.current, { center: base, zoom: 7, mapTypeControl: false, streetViewControl: false });
        const bounds = new g.maps.LatLngBounds(); bounds.extend(base);
        const path = [base];
        markers.push(new g.maps.Marker({ map, position: base, title: origem.nome, label: 'B' }));
        paradas.forEach((p, i) => {
          if (p.latitude === null || p.longitude === null) return;
          const position = { lat: Number(p.latitude), lng: Number(p.longitude) };
          path.push(position); bounds.extend(position);
          markers.push(new g.maps.Marker({ map, position, label: String(i + 1), title: p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade || '' }));
        });
        if (path.length > 1) { path.push(base); map.fitBounds(bounds, 40); }
        linha = new g.maps.Polyline({ map, path, strokeWeight: 3 });
      } catch { if (container.current) container.current.textContent = 'Não foi possível carregar o mapa.'; }
    })();
    return () => { cancelled = true; markers.forEach(m => m.setMap(null)); linha?.setMap(null); };
  }, [vendedorId, paradas]);
  return <div ref={container} className="h-64 w-full bg-muted" aria-label="Mapa da rota" />;
}