import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, XCircle, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useEffect } from "react";

export default function Pendente() {
  const { profile, signOut, user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
    if (!loading && profile?.status === "approved") navigate("/", { replace: true });
  }, [user, profile, loading, navigate]);

  const rejected = profile?.status === "rejected";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {rejected ? (
            <XCircle className="w-12 h-12 text-destructive mx-auto mb-2" />
          ) : (
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-2" />
          )}
          <CardTitle>{rejected ? "Acesso negado" : "Aguardando aprovação"}</CardTitle>
          <CardDescription>
            {rejected
              ? "Sua conta foi rejeitada pelo administrador."
              : "Sua conta foi criada e está aguardando aprovação do administrador."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-center">
          <p className="text-sm text-muted-foreground">{profile?.email}</p>
          <Button variant="outline" onClick={async () => { await signOut(); navigate("/auth"); }} className="gap-2">
            <LogOut className="w-4 h-4" /> Sair
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
