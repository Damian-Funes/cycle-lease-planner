import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { gradeMes } from "./calendarioMes";

describe("gradeMes", () => {
  it("novembro/2026: 42 dias, começa no domingo 01/11 e termina 12/12", () => {
    const g = gradeMes(new Date(2026, 10, 15));
    expect(g).toHaveLength(42);
    expect(format(g[0], "yyyy-MM-dd")).toBe("2026-11-01");
    expect(g[0].getDay()).toBe(0);
    expect(format(g[41], "yyyy-MM-dd")).toBe("2026-12-12");
  });
  it("dezembro/2026 começa no domingo 29/11", () => {
    expect(format(gradeMes(new Date(2026, 11, 1))[0], "yyyy-MM-dd")).toBe("2026-11-29");
  });
});
