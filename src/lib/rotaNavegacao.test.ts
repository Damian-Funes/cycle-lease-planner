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
