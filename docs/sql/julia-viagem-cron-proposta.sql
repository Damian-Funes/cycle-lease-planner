-- PROPOSTA SOMENTE: NÃO EXECUTADA. Um job; UTC = BRT + 3h.
-- 39 execuções/dia: 15h50–22h (37) + 9h–9h10 (2). Até 10 minutos de atraso.
-- Requer JULIA_CRON_SECRET também configurado no Vault pelo proprietário,
-- com o mesmo valor do secret da função. NÃO colar segredos neste arquivo.
-- Nenhum secret é criado/salvo automaticamente pelo SQL abaixo.
-- Requer pg_cron e pg_net já instalados e SQL de tabelas aprovado/aplicado.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name='JULIA_CRON_SECRET') THEN
  RAISE EXCEPTION 'Configure JULIA_CRON_SECRET no Vault com o mesmo valor da função antes de criar o job.';
 END IF;
END $$;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='julia-viagem-fechamento';
SELECT cron.schedule('julia-viagem-fechamento','*/10 0,1,12,18,19,20,21,22,23 * * *',$cron$
 SELECT net.http_post(
  url:='https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/julia-viagem-ligar',
  headers:=jsonb_build_object('Content-Type','application/json','apikey',
   'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y3F0bHhvaWRzYnN2cnN2cWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTEzOTAsImV4cCI6MjA4NjgyNzM5MH0.RQK4Y4uyvus2wxfZ6qI8j-4KUyrbLffpMGuAtF1crgU',
   'x-cron-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='JULIA_CRON_SECRET' LIMIT 1)),
  body:='{"modo":"cron"}'::jsonb)
 WHERE ((now() AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN '15:50' AND '22:00')
    OR ((now() AT TIME ZONE 'America/Sao_Paulo')::time BETWEEN '09:00' AND '09:10');
$cron$);