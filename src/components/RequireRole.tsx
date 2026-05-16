import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useAuth, AppRole } from "@/hooks/useAuth";
import SemPermissao from "./SemPermissao";

interface Props {
  /** Permite uma ou várias roles. Admin sempre passa. */
  roles: AppRole[];
  children: ReactNode;
  titulo?: string;
  mensagem?: string;
}

export default function RequireRole({ roles, children, titulo, mensagem }: Props) {
  const { loading, isAdmin, hasAnyRole } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (isAdmin || hasAnyRole(roles)) {
    return <>{children}</>;
  }

  return (
    <SemPermissao
      titulo={titulo ?? "Acesso negado"}
      mensagem={
        mensagem ??
        "Esta página requer um perfil específico. Se você acredita que deveria ter acesso, fale com um administrador."
      }
      icone="lock"
    />
  );
}
