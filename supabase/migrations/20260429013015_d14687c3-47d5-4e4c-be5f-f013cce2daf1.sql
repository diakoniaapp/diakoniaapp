
-- ============ ROLES ENUM ============
CREATE TYPE public.app_role AS ENUM ('admin', 'secretaria', 'diakonia', 'lideranca');

CREATE TYPE public.membro_status AS ENUM ('ativo', 'inativo', 'transferido', 'falecido');
CREATE TYPE public.estado_civil AS ENUM ('solteiro', 'casado', 'divorciado', 'viuvo', 'uniao_estavel', 'separado');
CREATE TYPE public.sexo AS ENUM ('masculino', 'feminino');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- security definer to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = ANY(_roles)
  )
$$;

-- ============ CONGREGACOES ============
CREATE TABLE public.congregacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  sigla TEXT,
  endereco TEXT,
  bairro TEXT,
  cidade TEXT,
  cep TEXT,
  telefone TEXT,
  pastor_responsavel TEXT,
  sede_principal BOOLEAN NOT NULL DEFAULT false,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.congregacoes ENABLE ROW LEVEL SECURITY;

-- ============ FAMILIAS ============
CREATE TABLE public.familias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_familia TEXT NOT NULL,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  cep TEXT,
  observacoes TEXT,
  congregacao_id UUID REFERENCES public.congregacoes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.familias ENABLE ROW LEVEL SECURITY;

-- ============ MEMBROS ============
CREATE TABLE public.membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_completo TEXT NOT NULL,
  nome_social TEXT,
  cpf TEXT UNIQUE,
  rg TEXT,
  data_nascimento DATE,
  sexo sexo,
  estado_civil estado_civil,
  data_casamento DATE,
  telefone_celular TEXT,
  telefone_fixo TEXT,
  email TEXT,
  endereco TEXT,
  numero TEXT,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  cep TEXT,
  data_batismo DATE,
  data_entrada DATE,
  status membro_status NOT NULL DEFAULT 'ativo',
  observacoes_pastorais TEXT,
  foto_url TEXT,
  congregacao_id UUID REFERENCES public.congregacoes(id) ON DELETE SET NULL,
  familia_id UUID REFERENCES public.familias(id) ON DELETE SET NULL,
  parentesco TEXT,
  responsavel_familiar BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.membros ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_membros_status ON public.membros(status);
CREATE INDEX idx_membros_familia ON public.membros(familia_id);
CREATE INDEX idx_membros_data_nasc ON public.membros(data_nascimento);

-- ============ MINISTERIOS ============
CREATE TABLE public.ministerios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  sigla TEXT,
  descricao TEXT,
  lider_id UUID REFERENCES public.membros(id) ON DELETE SET NULL,
  vice_lider_id UUID REFERENCES public.membros(id) ON DELETE SET NULL,
  congregacao_id UUID REFERENCES public.congregacoes(id) ON DELETE SET NULL,
  data_fundacao DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ministerios ENABLE ROW LEVEL SECURITY;

-- ============ MINISTERIO_MEMBROS ============
CREATE TABLE public.ministerio_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministerio_id UUID NOT NULL REFERENCES public.ministerios(id) ON DELETE CASCADE,
  membro_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  funcao TEXT,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(ministerio_id, membro_id)
);
ALTER TABLE public.ministerio_membros ENABLE ROW LEVEL SECURITY;

-- ============ HISTORICO_MEMBRO ============
CREATE TABLE public.historico_membro (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  membro_id UUID NOT NULL REFERENCES public.membros(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  descricao TEXT,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  registrado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.historico_membro ENABLE ROW LEVEL SECURITY;

-- ============ TRIGGERS updated_at ============
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_congregacoes_updated BEFORE UPDATE ON public.congregacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_familias_updated BEFORE UPDATE ON public.familias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_membros_updated BEFORE UPDATE ON public.membros FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_ministerios_updated BEFORE UPDATE ON public.ministerios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============ AUTO PROFILE + ROLE NA SIGNUP ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  user_count INT;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email), NEW.email);

  -- primeiro usuário vira admin; demais ficam como lideranca (apenas leitura) até admin promover
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'lideranca');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- profiles
CREATE POLICY "Usuarios veem proprio perfil" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Usuarios atualizam proprio perfil" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Admin gerencia perfis" ON public.profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- user_roles
CREATE POLICY "Usuario ve proprios roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin gerencia roles" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- congregacoes (todos autenticados leem; admin/secretaria escrevem)
CREATE POLICY "Autenticados leem congregacoes" ON public.congregacoes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Sec gerenciam congregacoes" ON public.congregacoes FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[]));

-- familias
CREATE POLICY "Autenticados leem familias" ON public.familias FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Sec gerenciam familias" ON public.familias FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[]));

-- membros
CREATE POLICY "Autenticados leem membros" ON public.membros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Sec gerenciam membros" ON public.membros FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[]));

-- ministerios
CREATE POLICY "Autenticados leem ministerios" ON public.ministerios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Sec gerenciam ministerios" ON public.ministerios FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[]));

CREATE POLICY "Autenticados leem ministerio_membros" ON public.ministerio_membros FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Sec gerenciam ministerio_membros" ON public.ministerio_membros FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[]));

-- historico
CREATE POLICY "Autenticados leem historico" ON public.historico_membro FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/Sec gerenciam historico" ON public.historico_membro FOR ALL TO authenticated USING (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[])) WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','secretaria']::app_role[]));
