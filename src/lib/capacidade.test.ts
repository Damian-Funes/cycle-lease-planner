import { describe, expect, it } from 'vitest';
import { calcularCapacidade, validarCapacidade, taxaCrescimento, fraseCrescimento, urlOrcamentoDiagnostico, type EntradaCapacidade, type ModeloCapacidade } from './capacidade';
const entrada: EntradaCapacidade = { cultura:'soja', sacos_safra:200000, kg_por_saco:40, janela_dias:45, horas_trabalhadas_dia:20, lotes_liberados_dia_anterior:true, horas_perdidas_dia:2, tempo_receita_s:43, num_produtos_liquidos:0, usa_po:false, capacidade_atual_kg_h:null, equipamento_atual:'', observacoes:'' };
const modelos: ModeloCapacidade[] = [50,130,150,300,570].map((kg,i) => ({ id:String(kg), modelo:`LSB${kg}`, kg_batelada:kg, ordem:i, ativo:true, tipico_id:null }));
describe('Capacidade LS', () => {
  it('43 s e 150 kg produzem aproximadamente 12.558 kg/h', () => { expect(calcularCapacidade(entrada,modelos,.15).modelos.find(m=>m.id==='150')?.kg_h).toBeCloseTo(12558,0); });
  it('200.000 sacos de 40 kg, 20 menos 2 horas, LSB150 exigem 35,4 dias', () => { expect(calcularCapacidade(entrada,modelos,.15).modelos.find(m=>m.id==='150')?.dias).toBeCloseTo(35.4,1); });
  it('Duo de 570 kg produz aproximadamente 47.721 kg/h', () => { expect(calcularCapacidade(entrada,modelos,.15).modelos.find(m=>m.id==='570')?.kg_h).toBeCloseTo(47721,0); });
  it('recomenda o menor modelo com pelo menos 15% de folga', () => { const r=calcularCapacidade(entrada,[...modelos].reverse(),.15); expect(r.recomendado_id).toBe('150'); expect(r.modelos.find(m=>m.id==='130')?.folga).toBeLessThan(.15); expect(r.modelos.find(m=>m.id==='150')?.folga).toBeGreaterThanOrEqual(.15); });
  it('horas efetivas e capacidade necessária usam janela e peso', () => { const r=calcularCapacidade(entrada,modelos,.15); expect(r.horas_efetivas_dia).toBe(18); expect(r.kg_totais).toBe(8000000); expect(r.capacidade_necessaria_kg_h).toBeCloseTo(9876.54321); });
  it('equipamento atual leva 44,444 dias a 10.000 kg/h', () => { expect(calcularCapacidade({...entrada,capacidade_atual_kg_h:10000},modelos,.15).dias_equipamento_atual).toBeCloseTo(44.444444); });
  it('modelos inativos não podem ser recomendados', () => { expect(calcularCapacidade(entrada,modelos.map(m=>({...m,ativo:m.id!=='150'})),.15).recomendado_id).toBe('300'); });
  it('não inventa recomendação quando nenhum atende', () => { expect(calcularCapacidade({...entrada,janela_dias:1},modelos,.15).recomendado_id).toBeNull(); });
  it('aceita o limite exato de 15% de folga', () => { const r=calcularCapacidade({...entrada,sacos_safra:153000,tempo_receita_s:3600,janela_dias:400},[{...modelos[0],kg_batelada:1000}],.15); expect(r.modelos[0].folga).toBe(.15); expect(r.recomendado_id).toBe('50'); });
  it('não divide por zero nem aceita horas efetivas negativas', () => { expect(validarCapacidade({...entrada,horas_perdidas_dia:20})).not.toHaveLength(0); expect(()=>calcularCapacidade({...entrada,tempo_receita_s:0},modelos,.15)).toThrow(); });
  it('produtos e pó não alteram a fórmula', () => { expect(calcularCapacidade({...entrada,num_produtos_liquidos:4,usa_po:true},modelos,.15).modelos[2].kg_h).toBe(calcularCapacidade(entrada,modelos,.15).modelos[2].kg_h); });
  it('geração preserva típico e vínculos com novo=1', () => { const url=urlOrcamentoDiagnostico('t','d','o'); const p=new URLSearchParams(url.split('?')[1]); expect(p.get('tipico')).toBe('t'); expect(p.get('oportunidade')).toBe('d'); expect(p.get('organizacao')).toBe('o'); expect(p.get('novo')).toBe('1'); });
  describe('crescimento', () => {
    const cresc = { ...entrada, crescimento_modo:'percentual' as const, crescimento_anual_pct:10, horizonte_anos:5 };
    const r = calcularCapacidade(cresc, modelos, .15, 2026);
    it('10% a.a. por 5 anos leva 200.000 a ≈322.102 sacos em 2031', () => { expect(r.projecao?.ano_final).toBe(2031); const u=r.projecao!.anos.at(-1)!; expect(u.ano).toBe(2031); expect(u.sacos).toBeCloseTo(322102,0); expect(r.versao).toBe(2); });
    it('meta de 300.000 em 5 anos equivale a ≈8,447% a.a.', () => { expect(taxaCrescimento({ sacos_safra:200000, crescimento_modo:'meta', meta_sacos:300000, horizonte_anos:5 })).toBeCloseTo(.08447,5); });
    it('hoje LSB150, no horizonte LSB300', () => { expect(r.recomendado_hoje_id).toBe('150'); expect(r.recomendado_id).toBe('300'); });
    it('LSB150 atende até 2026 e LSB300 até 2031', () => { expect(r.modelos.find(m=>m.id==='150')?.atende_ate).toBe(2026); expect(r.modelos.find(m=>m.id==='300')?.atende_ate).toBe(2031); });
    it('LSB50 não atende nem hoje', () => { expect(r.modelos.find(m=>m.id==='50')?.atende_ate).toBeNull(); });
    it('frase exata de crescimento', () => { expect(fraseCrescimento(r)).toBe('A LSB150 atende até 2026. Para crescer até 322.102 sacos em 2031, o modelo indicado é a LSB300.'); });
    it('sem modo de crescimento o resultado é o original, mesmo com % preenchido', () => {
      const base = calcularCapacidade(entrada, modelos, .15, 2026); const sem = calcularCapacidade({ ...entrada, crescimento_modo:null, crescimento_anual_pct:10, horizonte_anos:5 }, modelos, .15, 2026);
      expect(sem.projecao).toBeNull(); expect(sem.versao).toBe(1); expect(sem.recomendado_id).toBe(base.recomendado_id); expect(sem.recomendado_id).toBe('150');
      expect(sem.capacidade_necessaria_kg_h).toBe(base.capacidade_necessaria_kg_h);
      expect(sem.modelos.map(m=>[m.id,m.kg_h,m.dias,m.folga,m.status])).toEqual(base.modelos.map(m=>[m.id,m.kg_h,m.dias,m.folga,m.status])); expect(fraseCrescimento(sem)).toBeNull();
    });
    it('0% a.a. mantém a recomendação de hoje', () => { const z=calcularCapacidade({ ...cresc, crescimento_anual_pct:0 }, modelos, .15, 2026); expect(z.recomendado_id).toBe(z.recomendado_hoje_id); });
    it('validação rejeita horizonte 0 e 16, 250% e meta 0', () => {
      expect(validarCapacidade({ ...cresc, horizonte_anos:0 })).not.toHaveLength(0);
      expect(validarCapacidade({ ...cresc, horizonte_anos:16 })).not.toHaveLength(0);
      expect(validarCapacidade({ ...cresc, crescimento_anual_pct:250 })).not.toHaveLength(0);
      expect(validarCapacidade({ ...entrada, crescimento_modo:'meta', meta_sacos:0, horizonte_anos:5 })).not.toHaveLength(0);
      expect(validarCapacidade(cresc)).toHaveLength(0);
    });
  });
});
