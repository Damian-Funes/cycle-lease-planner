REVOKE ALL ON FUNCTION public.fn_resolver_numero_orcamento_duplicado() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_resolver_numero_orcamento_duplicado() FROM anon;
REVOKE ALL ON FUNCTION public.fn_resolver_numero_orcamento_duplicado() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_resolver_numero_orcamento_duplicado() TO service_role;