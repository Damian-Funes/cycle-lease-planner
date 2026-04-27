import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { z } from "zod";

const emailSchema = z.string().trim().email("Email inválido").max(255);
const passwordSchema = z.string().min(6, "Senha deve ter no mínimo 6 caracteres").max(72);
const nomeSchema = z.string().trim().min(2, "Nome muito curto").max(100);

export default function Auth() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [signupNome, setSignupNome] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPwd, setSignupPwd] = useState("");

  useEffect(() => {
    if (authLoading || !user || !profile) return;

    if (profile.status === "approved") {
      const from = (location.state as any)?.from;
      const target = from && typeof from === "string" && from !== "/auth" ? from : "/";
      navigate(target, { replace: true });
      return;
    }

    navigate("/pendente", { replace: true });
  }, [user, profile, authLoading, navigate, location.state]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      emailSchema.parse(loginEmail);
      passwordSchema.parse(loginPwd);
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message || "Dados inválidos");
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPwd });

    if (error) {
      setLoading(false);
      toast.error(error.message === "Invalid login credentials" ? "Email ou senha incorretos" : error.message);
      return;
    }

    const signedInUser = data.user;
    if (!signedInUser) {
      setLoading(false);
      toast.error("Sessão não iniciada corretamente.");
      return;
    }

    const { data: prof, error: profileError } = await supabase
      .from("profiles")
      .select("status")
      .eq("user_id", signedInUser.id)
      .maybeSingle();

    if (profileError) {
      await refreshProfile();
      setLoading(false);
      toast.error("Login realizado, mas não foi possível carregar seu perfil.");
      return;
    }

    toast.success("Login realizado");
    setLoading(false);

    if (prof?.status === "approved") {
      const from = (location.state as any)?.from;
      const target = from && typeof from === "string" && from !== "/auth" ? from : "/";
      navigate(target, { replace: true });
      return;
    }

    navigate("/pendente", { replace: true });
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      nomeSchema.parse(signupNome);
      emailSchema.parse(signupEmail);
      passwordSchema.parse(signupPwd);
    } catch (err: any) {
      toast.error(err.errors?.[0]?.message || "Dados inválidos");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPwd,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        data: { nome: signupNome },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message.includes("already registered") ? "Email já cadastrado" : error.message);
    } else {
      toast.success("Cadastro enviado! Aguarde aprovação do administrador.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-2 font-bold">LS</div>
          <CardTitle>SmartCycle LS</CardTitle>
          <CardDescription>Acesso restrito · Cadastro requer aprovação</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Cadastrar</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3 mt-4">
                <div>
                  <Label htmlFor="le">Email</Label>
                  <Input id="le" type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="lp">Senha</Label>
                  <Input id="lp" type="password" value={loginPwd} onChange={(e) => setLoginPwd(e.target.value)} required />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-3 mt-4">
                <div>
                  <Label htmlFor="sn">Nome completo</Label>
                  <Input id="sn" value={signupNome} onChange={(e) => setSignupNome(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="se">Email</Label>
                  <Input id="se" type="email" value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="sp">Senha</Label>
                  <Input id="sp" type="password" value={signupPwd} onChange={(e) => setSignupPwd(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Cadastrar
                </Button>
                <p className="text-xs text-muted-foreground text-center">Sua conta ficará pendente até aprovação do administrador.</p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
