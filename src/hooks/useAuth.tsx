import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "admin"
  | "user"
  | "gerente_comercial"
  | "comercial"
  | "rtv"
  | "marketing"
  | "engenharia"
  | "financeiro"
  | "operacao"
  | "viewer";

interface Profile {
  id: string;
  user_id: string;
  email: string;
  nome: string | null;
  status: "pending" | "approved" | "rejected";
}

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: AppRole[];
  estadoIds: string[];
  isAdmin: boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  cobreEstado: (estadoId: string) => boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: (userId?: string) => Promise<void>;
}

const defaultAuthContext: AuthContextValue = {
  user: null,
  session: null,
  profile: null,
  roles: [],
  estadoIds: [],
  isAdmin: false,
  hasRole: () => false,
  hasAnyRole: () => false,
  cobreEstado: () => false,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => {},
};

const AuthContext = createContext<AuthContextValue>(defaultAuthContext);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [estadoIds, setEstadoIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  const fetchProfileAndRole = async (userId: string) => {
    const [profRes, rolesRes, estadosRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("usuario_estados").select("estado_id").eq("user_id", userId),
    ]);

    if (profRes.error) throw profRes.error;
    if (rolesRes.error) throw rolesRes.error;
    if (estadosRes.error) throw estadosRes.error;

    setProfile(profRes.data as Profile | null);
    setRoles((rolesRes.data ?? []).map((r: any) => r.role as AppRole));
    setEstadoIds((estadosRes.data ?? []).map((e: any) => e.estado_id as string));
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setAuthReady(true);
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    let active = true;

    const loadProfile = async () => {
      if (!user) {
        if (!active) return;
        setProfile(null);
        setRoles([]);
        setEstadoIds([]);
        setLoading(false);
        return;
      }
      if (active) setLoading(true);
      try {
        await fetchProfileAndRole(user.id);
      } catch (error) {
        console.error("[auth] failed to load profile/roles", error);
        if (active) {
          setProfile(null);
          setRoles([]);
          setEstadoIds([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [authReady, user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setRoles([]);
    setEstadoIds([]);
  };

  const refreshProfile = async (userId?: string) => {
    const targetUserId = userId ?? user?.id;
    if (!targetUserId) return;
    try {
      setLoading(true);
      await fetchProfileAndRole(targetUserId);
    } finally {
      setLoading(false);
    }
  };

  const isAdmin = roles.includes("admin");
  const hasRole = (role: AppRole) => roles.includes(role);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));
  const cobreEstado = (estadoId: string) => estadoIds.includes(estadoId);

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        roles,
        estadoIds,
        isAdmin,
        hasRole,
        hasAnyRole,
        cobreEstado,
        loading,
        refreshProfile,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
