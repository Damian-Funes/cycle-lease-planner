
-- 1. Enum de roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- 2. Tabela de profiles (status de aprovação)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  nome TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Tabela de roles (separada por segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 4. Função has_role (security definer, evita recursão RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 5. Função is_approved (checa se usuário pode acessar dados)
CREATE OR REPLACE FUNCTION public.is_approved(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND status = 'approved'
  )
$$;

-- 6. Trigger: cria profile automaticamente no signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, nome, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
    -- admin pré-cadastrado já entra aprovado
    CASE WHEN NEW.email = 'ls.dfunes@gmail.com' THEN 'approved' ELSE 'pending' END
  );
  
  -- Se for o admin, atribui role admin
  IF NEW.email = 'ls.dfunes@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Trigger updated_at em profiles
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===================================================================
-- POLÍTICAS RLS
-- ===================================================================

-- PROFILES
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update profiles"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- USER_ROLES
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===================================================================
-- FECHAR ACESSO PÚBLICO ÀS TABELAS DE NEGÓCIO
-- ===================================================================

-- EQUIPAMENTOS
DROP POLICY IF EXISTS "Allow all access to equipamentos" ON public.equipamentos;

CREATE POLICY "Approved users can view equipamentos"
  ON public.equipamentos FOR SELECT
  TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Admins can manage equipamentos"
  ON public.equipamentos FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- PROPOSTAS
DROP POLICY IF EXISTS "Allow all access to propostas" ON public.propostas;

CREATE POLICY "Approved users can view propostas"
  ON public.propostas FOR SELECT
  TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can insert propostas"
  ON public.propostas FOR INSERT
  TO authenticated
  WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can update propostas"
  ON public.propostas FOR UPDATE
  TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can delete propostas"
  ON public.propostas FOR DELETE
  TO authenticated
  USING (public.is_approved(auth.uid()));

-- ORCAMENTOS
DROP POLICY IF EXISTS "Allow all access to orcamentos" ON public.orcamentos;

CREATE POLICY "Approved users can view orcamentos"
  ON public.orcamentos FOR SELECT
  TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can insert orcamentos"
  ON public.orcamentos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can update orcamentos"
  ON public.orcamentos FOR UPDATE
  TO authenticated
  USING (public.is_approved(auth.uid()));

CREATE POLICY "Approved users can delete orcamentos"
  ON public.orcamentos FOR DELETE
  TO authenticated
  USING (public.is_approved(auth.uid()));
