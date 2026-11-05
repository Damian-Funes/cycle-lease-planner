import { assertEquals } from 'jsr:@std/assert';
// Capture handlers without serving a port or invoking any provider.
const handlers: ((r:Request)=>Promise<Response>)[]=[];
const original=Deno.serve;
Object.defineProperty(Deno,'serve',{value:(handler:(r:Request)=>Promise<Response>)=>{handlers.push(handler);return {};},configurable:true});
await import('./index.ts');
await import('../julia-viagem-ferramentas/index.ts');
await import('../julia-viagem-webhook/index.ts');
Object.defineProperty(Deno,'serve',{value:original,configurable:true});
Deno.test('manual sem JWT recusa antes de consultar banco ou ligar',async()=>{
 const r=await handlers[0](new Request('http://localhost',{method:'POST',body:JSON.stringify({modo:'manual',rota_id:'10000000-0000-0000-0000-000000000001'})}));assertEquals(r.status,401);
});
Deno.test('cron sem segredo recusa',async()=>{
 const r=await handlers[0](new Request('http://localhost',{method:'POST',body:'{"modo":"cron"}'}));assertEquals(r.status,401);
});
Deno.test('destinatário arbitrário no corpo é rejeitado',async()=>{
 const r=await handlers[0](new Request('http://localhost',{method:'POST',body:JSON.stringify({modo:'manual',rota_id:'10000000-0000-0000-0000-000000000001',telefone:'+5511999999999'})}));assertEquals(r.status,400);
});
Deno.test('ferramentas sem segredo recusam',async()=>{
 const r=await handlers[1](new Request('http://localhost',{method:'POST',body:'{}'}));assertEquals(r.status,401);
});
Deno.test('webhook sem assinatura recusa',async()=>{
 const r=await handlers[2](new Request('http://localhost',{method:'POST',body:'{}'}));assertEquals(r.status,401);
});