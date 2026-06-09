CREATE OR REPLACE FUNCTION public.fn_atribuir_responsavel_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  criador_role app_role;
  comercial_destino uuid;
BEGIN
  IF NEW.responsavel_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO criador_role
  FROM public.user_roles
  WHERE user_id = auth.uid()
  ORDER BY CASE role
    WHEN 'admin' THEN 1
    WHEN 'gerente_comercial' THEN 2
    WHEN 'comercial' THEN 3
    WHEN 'rtv' THEN 4
    ELSE 99
  END
  LIMIT 1;

  IF criador_role = 'admin' THEN
    NEW.responsavel_id := NULL;
  ELSIF criador_role = 'rtv' AND NEW.estado_id IS NOT NULL THEN
    comercial_destino := public.fn_proximo_comercial_para_estado(NEW.estado_id);
    NEW.responsavel_id := COALESCE(comercial_destino, auth.uid());
  ELSE
    NEW.responsavel_id := auth.uid();
  END IF;

  RETURN NEW;
END;
$function$;