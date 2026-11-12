CREATE OR REPLACE FUNCTION public.fn_notificacoes_usuario_so_lida()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('authenticated','anon')
     AND ROW(NEW.user_id, NEW.chave, NEW.rota_id, NEW.resolvida_em, NEW.titulo, NEW.texto, NEW.link)
     IS DISTINCT FROM ROW(OLD.user_id, OLD.chave, OLD.rota_id, OLD.resolvida_em, OLD.titulo, OLD.texto, OLD.link) THEN
    RAISE EXCEPTION 'Só é possível marcar a notificação como lida.';
  END IF;
  RETURN NEW;
END $function$;