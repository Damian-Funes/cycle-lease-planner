import { describe, it, expect } from "vitest";
import { linksGoogleMaps, linkWaze, formatarDuracao, rotaLonga, coordenadaValida } from "./rotaNavegacao";

const base = { lat: -23.4, lng: -51.9 };
const p = (i: number) => ({ lat: -20 - i, lng: -50 });

describe("rota navegação", () => {
  it("link do Google Maps com origem/destino na base e paradas na ordem", () => {
    const [url] = linksGoogleMaps(base, [p(1), p(2), p(3)]);
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&origin=-23.4,-51.9&destination=-23.4,-51.9&waypoints=" + encodeURIComponent("-21,-50|-22,-50|-23,-50") + "&travelmode=driving");
  });
  it("9 paradas = 1 trecho; 10 paradas = 2 trechos", () => {
    expect(linksGoogleMaps(base, Array.from({ length: 9 }, (_, i) => p(i)))).toHaveLength(1);
    const dois = linksGoogleMaps(base, Array.from({ length: 10 }, (_, i) => p(i)));
    expect(dois).toHaveLength(2);
    expect(dois[1]).toContain("origin=-29,-50&destination=-23.4,-51.9");
  });
  it("Waze por parada", () => {
    expect(linkWaze(p(1))).toBe("https://waze.com/ul?ll=-21,-50&navigate=yes");
  });
  it("formata duração e aviso acima de 10 h", () => {
    expect(formatarDuracao(31200)).toBe("8h40");
    expect(rotaLonga(36000)).toBe(false);
    expect(rotaLonga(36001)).toBe(true);
  });
  it("coordenada inválida", () => {
    expect(coordenadaValida(null, 1)).toBe(false);
    expect(coordenadaValida(0, 0)).toBe(false);
    expect(coordenadaValida("-23.1", "-51")).toBe(true);
  });
});

import { distanciaAoTrajeto, posicaoInsercaoMaisBarata, classificarMotivo, ordenarSugestoes, objetivoSugerido } from "./rotaNavegacao";

describe("clientes no caminho", () => {
  // trajeto reto no equador, ~111 km por grau
  const caminho = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 0, lng: 2 }];
  it("distância perpendicular ao segmento e posição ao longo", () => {
    const r = distanciaAoTrajeto({ lat: 0.1, lng: 1.5 }, caminho);
    expect(r.km).toBeCloseTo(11.1, 0);
    expect(r.posicaoKm).toBeCloseTo(166.8, 0);
  });
  it("ponto além do fim mede até a extremidade", () => {
    expect(distanciaAoTrajeto({ lat: 0, lng: 2.5 }, caminho).km).toBeCloseTo(55.6, 0);
  });
  it("inserção mais barata entra entre as paradas vizinhas, não no fim", () => {
    const base = { lat: -1, lng: 0 };
    const paradas = [{ lat: 0, lng: 1 }, { lat: 0, lng: 3 }];
    expect(posicaoInsercaoMaisBarata(base, paradas, { lat: 0, lng: 2 })).toBe(1);
    expect(posicaoInsercaoMaisBarata(base, paradas, { lat: -0.5, lng: 0.5 })).toBe(0);
  });
  const agora = new Date("2026-11-04T12:00:00Z");
  it("prioridades 1-4", () => {
    expect(classificarMotivo({ deal: { titulo: "D", valor: 1, proximaAtividadeEm: null }, carteiraDoVendedor: true, ultimoContato: null, agora }).prioridade).toBe(1);
    expect(classificarMotivo({ deal: { titulo: "D", valor: 1, proximaAtividadeEm: "2026-11-01T00:00:00Z" }, carteiraDoVendedor: false, ultimoContato: null, agora }).prioridade).toBe(1);
    expect(classificarMotivo({ deal: { titulo: "D", valor: 1, proximaAtividadeEm: "2026-11-10T00:00:00Z" }, carteiraDoVendedor: false, ultimoContato: null, agora }).prioridade).toBe(2);
    expect(classificarMotivo({ carteiraDoVendedor: true, ultimoContato: "2026-08-01T00:00:00Z", agora })).toEqual({ prioridade: 3, tipo: "sem_contato", dias: 95 });
    expect(classificarMotivo({ carteiraDoVendedor: true, ultimoContato: "2026-10-01T00:00:00Z", agora }).prioridade).toBe(4);
    expect(classificarMotivo({ carteiraDoVendedor: true, ultimoContato: null, agora })).toEqual({ prioridade: 3, tipo: "sem_contato", dias: null });
  });
  it("ordena por prioridade e depois pela posição na viagem; objetivo sugerido", () => {
    const t = { prioridade: 4 as const, tipo: "territorio" as const };
    const d = { prioridade: 2 as const, tipo: "deal_aberto" as const, dealTitulo: "X", dealValor: 1, numeroOrcamento: "ORC2026-047" };
    const r = ordenarSugestoes([{ motivo: t, posicaoKm: 1, n: "a" }, { motivo: d, posicaoKm: 50, n: "b" }, { motivo: d, posicaoKm: 10, n: "c" }]);
    expect(r.map((x) => x.n)).toEqual(["c", "b", "a"]);
    expect(objetivoSugerido(d)).toBe("Retomar negociação ORC2026-047");
  });
});

import { agruparPorGrade, categoriaMapa, CATEGORIAS_MAPA } from "./rotaNavegacao";
import { medirClientes, filtrarNoCaminho, type ClienteMapa } from "./clientesNoCaminho";

describe("mapa de clientes", () => {
  const cli = (id: string, lat: number, lng: number, prioridade: 1 | 2 | 3 | 4): ClienteMapa => ({
    id, nome: id, cidade: null, estado: null, lat, lng, aproximada: false, oportunidadeId: null,
    motivo: prioridade === 4 ? { prioridade: 4, tipo: "territorio" } : prioridade === 3 ? { prioridade: 3, tipo: "sem_contato", dias: null }
      : prioridade === 2 ? { prioridade: 2, tipo: "deal_aberto", dealTitulo: "D", dealValor: 1 } : { prioridade: 1, tipo: "deal_parado", dealTitulo: "D", dealValor: 1, atividadeAtrasada: true },
  });

  it("categoria segue a prioridade com cores vermelho/laranja/azul/cinza", () => {
    expect(categoriaMapa(cli("a", 0, 0, 1).motivo)).toBe(1);
    expect(categoriaMapa(cli("a", 0, 0, 4).motivo)).toBe(4);
    expect(CATEGORIAS_MAPA[1].cor).toBe("#dc2626");
    expect(CATEGORIAS_MAPA[4].cor).toBe("#9ca3af");
  });

  it("agrupa pontos próximos no zoom do Brasil e separa no zoom alto", () => {
    const pts = [{ lat: -23.5, lng: -46.6 }, { lat: -23.55, lng: -46.65 }, { lat: -3.1, lng: -60.0 }];
    expect(agruparPorGrade(pts, 4)).toHaveLength(2);
    expect(agruparPorGrade(pts, 12)).toHaveLength(3);
  });

  it("todos aparecem sem trajeto; 'só no caminho' respeita o raio e exclui paradas", () => {
    const lista = [cli("perto", 0.1, 0.5, 4), cli("longe", 2, 0.5, 1), cli("parada", 0, 0.5, 2)];
    expect(medirClientes(lista, [], ["parada"]).map((c) => c.id)).toEqual(["perto", "longe"]);
    const medidos = medirClientes(lista, [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }], ["parada"]);
    expect(filtrarNoCaminho(medidos, 30).map((c) => c.id)).toEqual(["perto"]);
  });
});

import { getOrigemVendedor, MARINGA } from './maps';
describe('base de saída por veículo', () => {
  const murilo = '14138b1c-5b33-4a66-b0f0-fc06e58da561';
  const veiculos = [
    { id: 'toro', vendedor_id: murilo, ativo: true, base_nome: 'Formosa - GO', base_lat: -15.5372, base_lng: -47.3344 },
    { id: 's10', vendedor_id: 'flavio', ativo: true, base_nome: 'Maringá - PR', base_lat: '-23.4253', base_lng: '-51.9386' },
    { id: 'semBase', vendedor_id: 'x', ativo: true, base_nome: null, base_lat: null, base_lng: null },
  ];
  it('usa o veículo da viagem', () => expect(getOrigemVendedor('flavio', veiculos, 'toro')).toEqual({ lat: -15.5372, lng: -47.3344, nome: 'Formosa - GO' }));
  it('sem veículo na viagem usa o do vendedor (Murilo = Formosa)', () => expect(getOrigemVendedor(murilo, veiculos, null).nome).toBe('Formosa - GO'));
  it('veículo sem base cai no do vendedor ou Maringá', () => {
    expect(getOrigemVendedor(murilo, veiculos, 'semBase').nome).toBe('Formosa - GO');
    expect(getOrigemVendedor('x', veiculos, 'semBase')).toBe(MARINGA);
    expect(getOrigemVendedor('desconhecido')).toBe(MARINGA);
  });
});
