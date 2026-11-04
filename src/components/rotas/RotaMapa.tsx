import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps, getOrigemVendedor, erroRotaMensagem } from '@/lib/maps';
import { calcularViagem } from '@/lib/viagemRota';
import { ordenarParadasViagem } from '@/lib/viagem';
import { coordenadaValida, formatarDuracao, formatarKm } from '@/lib/rotaNavegacao';
import { type RotaParada, listVeiculos } from '@/lib/rotas';
import { useQuery } from '@tanstack/react-query';

export default function RotaMapa({ vendedorId, veiculoId, paradas: brutas, inicio, fim }: { vendedorId: string; veiculoId?: string | null; paradas: RotaParada[]; inicio: string; fim?: string | null }) {
  const container = useRef<HTMLDivElement>(null);
  const [resumo, setResumo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { data: veiculos, isFetched } = useQuery({ queryKey: ['veiculos'], queryFn: listVeiculos });
  useEffect(() => {
    if (!isFetched) return;
    const paradas = ordenarParadasViagem(brutas.map((p) => ({ ...p, dia: p.dia ?? inicio })), inicio);
    let cancelled = false;
    const markers: any[] = [];
    const renderers: any[] = [];
    (async () => {
      try {
        const g = await loadGoogleMaps();
        if (cancelled || !container.current) return;
        const origem = getOrigemVendedor(vendedorId, veiculos ?? [], veiculoId);
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
          markers.push(new g.maps.Marker({ map, position, label: p.tipo === 'pernoite' ? 'H' : String(i + 1), title: p.tipo === 'pernoite' ? `Pernoite: ${p.hotel_nome}` : nome }));
        });
        if (validas.length) map.fitBounds(bounds, 40);
        setErro(invalidas.length ? `Sem coordenada válida: ${invalidas.join(', ')}.` : null);
        if (!validas.length) return;
        try {
          const r = await calcularViagem(base, paradas, inicio, fim);
          if (cancelled || !r) return;
          const cores = ['#059669', '#2563eb', '#d97706', '#7c3aed', '#db2777'];
          r.dias.forEach((d, i) => {
            const ren = new g.maps.DirectionsRenderer({ map, suppressMarkers: true, preserveViewport: true, polylineOptions: { strokeColor: cores[i % cores.length], strokeWeight: 4 } });
            ren.setDirections(d.rota.result); renderers.push(ren);
          });
          setResumo(`${formatarKm(r.totalKm * 1000)} · ${formatarDuracao(r.totalSegundos)} de direção${r.dias.length > 1 ? ` em ${r.dias.length} dias` : ''}`);
        } catch (e) {
          if (!cancelled) setErro(erroRotaMensagem(e, invalidas));
        }
      } catch { if (container.current) container.current.textContent = 'Não foi possível carregar o mapa.'; }
    })();
    return () => { cancelled = true; markers.forEach(m => m.setMap(null)); renderers.forEach(r => r.setMap(null)); };
  }, [vendedorId, veiculoId, veiculos, isFetched, brutas, inicio, fim]);
  return (
    <div>
      <div ref={container} className="h-64 w-full bg-muted" aria-label="Mapa da rota" />
      {(resumo || erro) && <div className="px-2 py-1 text-xs">{resumo && <span className="font-medium">{resumo}</span>}{erro && <span className="text-destructive ml-2">{erro}</span>}</div>}
    </div>
  );
}
