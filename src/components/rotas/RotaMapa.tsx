import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, getOrigemVendedor, calcularRota, erroRotaMensagem } from '@/lib/maps';
import { coordenadaValida, formatarDuracao, formatarKm } from '@/lib/rotaNavegacao';
import { type RotaParada } from '@/lib/rotas';

export default function RotaMapa({ vendedorId, paradas }: { vendedorId: string; paradas: RotaParada[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const markers: any[] = [];
    let renderer: any;
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled || !container.current) return;
        const origem = getOrigemVendedor(vendedorId);
        const base = { lat: origem.lat, lng: origem.lng };
        const map = new g.maps.Map(container.current, { center: base, zoom: 7, mapTypeControl: false, streetViewControl: false });
        const bounds = new g.maps.LatLngBounds(); bounds.extend(base);
        markers.push(new g.maps.Marker({ map, position: base, title: origem.nome, label: 'B' }));
        const validas: { lat: number; lng: number }[] = [];
        const invalidas: string[] = [];
        paradas.forEach((p, i) => {
          const nome = p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade || '';
          if (!coordenadaValida(p.latitude, p.longitude)) { invalidas.push(`parada ${i + 1} (${nome || 'sem nome'})`); return; }
          const position = { lat: Number(p.latitude), lng: Number(p.longitude) };
          validas.push(position); bounds.extend(position);
          markers.push(new g.maps.Marker({ map, position, label: String(i + 1), title: nome }));
        });
        if (validas.length) map.fitBounds(bounds, 40);
        setErro(invalidas.length ? `Sem coordenada válida: ${invalidas.join(', ')}.` : null);
        if (!validas.length) return;
        try {
          const r = await calcularRota(base, validas, false);
          if (cancelled || !r) return;
          renderer = new g.maps.DirectionsRenderer({ map, suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: '#059669', strokeWeight: 4 } });
          renderer.setDirections(r.result);
          setResumo(`${formatarKm(r.totalKm * 1000)} · ${formatarDuracao(r.totalSegundos)} de direção`);
        } catch (e) {
          if (!cancelled) setErro(erroRotaMensagem(e, invalidas));
        }
      } catch { if (container.current) container.current.textContent = 'Não foi possível carregar o mapa.'; }
    })();
    return () => { cancelled = true; markers.forEach(m => m.setMap(null)); renderer?.setMap(null); };
  }, [vendedorId, paradas]);
  return (
    <div>
      <div ref={container} className="h-64 w-full bg-muted" aria-label="Mapa da rota" />
      {(resumo || erro) && <div className="px-2 py-1 text-xs">{resumo && <span className="font-medium">{resumo}</span>}{erro && <span className="text-destructive ml-2">{erro}</span>}</div>}
    </div>
  );
}
