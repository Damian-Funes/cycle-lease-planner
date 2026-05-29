CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove job anterior se existir
DO $$
BEGIN
  PERFORM cron.unschedule('rd-sync-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'rd-sync-hourly',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/rd-sync-leads',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN5Y3F0bHhvaWRzYnN2cnN2cWVzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNTEzOTAsImV4cCI6MjA4NjgyNzM5MH0.RQK4Y4uyvus2wxfZ6qI8j-4KUyrbLffpMGuAtF1crgU"}'::jsonb,
    body := jsonb_build_object('origem','cron','ts', now())
  );
  $$
);