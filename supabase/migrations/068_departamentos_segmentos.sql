-- Departamentos (ex.: Pedagógico, Administrativo) por empresa
CREATE TABLE IF NOT EXISTS departamentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_departamentos_empresa ON departamentos(empresa_id);

-- Segmentos (ex.: EFAF, EFAI, Infantil) dentro de cada departamento
CREATE TABLE IF NOT EXISTS segmentos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  departamento_id UUID NOT NULL REFERENCES departamentos(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segmentos_departamento ON segmentos(departamento_id);

-- RLS
ALTER TABLE departamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE segmentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins podem gerenciar departamentos"
  ON departamentos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = departamentos.empresa_id OR u.empresa_id IS NULL)
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = departamentos.empresa_id OR u.empresa_id IS NULL)
    )
  );

CREATE POLICY "Admins podem gerenciar segmentos"
  ON segmentos FOR ALL
  USING (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.departamentos d
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = d.empresa_id OR u.empresa_id IS NULL)
      WHERE d.id = segmentos.departamento_id
    )
  )
  WITH CHECK (
    public.eh_admin_usuario(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.departamentos d
      JOIN public.usuarios u ON u.auth_user_id = auth.uid() AND u.ativo = TRUE
        AND (u.empresa_id = d.empresa_id OR u.empresa_id IS NULL)
      WHERE d.id = segmentos.departamento_id
    )
  );
