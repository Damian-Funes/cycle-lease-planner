import { describe, expect, it } from 'vitest';
import { configurarElevenLabs, erroElevenLabs } from '../../supabase/functions/julia-viagem-ligar/elevenlabs';
describe('ElevenLabs viagens sem chamadas reais', () => {
  it('aceita URL e elimina espaços em todos os secrets', () => {
    expect(configurarElevenLabs({ key: ' key-demo \n', agent: ' https://elevenlabs.io/app/agents/agent_AbC123?tab=phone ', phone: ' phone-demo ' })).toEqual({ key: 'key-demo', agent: 'agent_AbC123', phone: 'phone-demo', endpoint: 'https://api.elevenlabs.io/v1/convai/twilio/outbound-call' });
  });
  it('aceita ID puro', () => expect(configurarElevenLabs({ key: 'demo', agent: ' agent_123 ', phone: 'demo' }).agent).toBe('agent_123'));
  it('seleciona SIP pela configuração', () => expect(configurarElevenLabs({ key: 'demo', agent: 'agent_123', phone: 'demo', telefonia: ' SIP ' }).endpoint).toBe('https://api.elevenlabs.io/v1/convai/sip-trunk/outbound-call'));
  it('recusa telefonia inválida', () => expect(() => configurarElevenLabs({ key: 'demo', agent: 'agent_123', phone: 'demo', telefonia: 'outro' })).toThrow('twilio ou sip'));
  it('retorna detail e message para distinguir agente e número', () => {
    expect(erroElevenLabs(404, '{"detail":{"message":"Agent not found"}}', [])).toContain('Agent not found');
    expect(erroElevenLabs(404, '{"message":"Phone number not found"}', [])).toContain('Phone number not found');
  });
  it('redige credenciais e telefones antes de limitar a 1000 caracteres', () => {
    const result = erroElevenLabs(404, JSON.stringify({ detail: 'key-demo agent_123 phone-demo +5544998187930 Authorization: Bearer other-token ' + 'x'.repeat(1200) }), [' key-demo ', 'agent_123', 'phone-demo']);
    for (const value of ['key-demo', 'agent_123', 'phone-demo', '+5544998187930', 'other-token']) expect(result).not.toContain(value);
    expect(result.length).toBe(1000);
  });
});