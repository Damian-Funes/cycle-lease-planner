import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Página legada — redireciona para /organizacoes (nova entidade unificada).
 * Mantida apenas para preservar links externos antigos.
 * Será removida na Fase 6.
 */
export default function Clientes() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/organizacoes", { replace: true });
  }, [navigate]);
  return null;
}
