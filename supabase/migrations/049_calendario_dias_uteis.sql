-- Calendário: feriados fixos (todo ano), eventos específicos e configuração de fim de semana
-- Usado para definir dias úteis: um dia é não útil se for feriado fixo, evento ou sáb/dom conforme config.

-- Configuração de fim de semana por empresa (sábado e domingo são úteis?)
CREATE TABLE IF NOT EXISTS calendario_fim_semana (
  empresa_id UUID PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  sabado_util BOOLEAN NOT NULL DEFAULT FALSE,
  domingo_util BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Feriados/datas fixas que se repetem todo ano (ex: 01/01, 25/12, 07/09)
CREATE TABLE IF NOT EXISTS calendario_feriados_fixos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mes SMALLINT NOT NULL CHECK (mes >= 1 AND mes <= 12),
  dia SMALLINT NOT NULL CHECK (dia >= 1 AND dia <= 31),
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(mes, dia)
);

-- Eventos/datas específicas (um ano ou recorrentes)
-- ano_especifico NULL = recorrente (todo ano nessa data); preenchido = só naquele ano
CREATE TABLE IF NOT EXISTS calendario_eventos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  ano_especifico INTEGER NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendario_eventos_empresa ON calendario_eventos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_calendario_eventos_data ON calendario_eventos(data);
CREATE INDEX IF NOT EXISTS idx_calendario_eventos_ano ON calendario_eventos(ano_especifico);

COMMENT ON TABLE calendario_fim_semana IS 'Define se sábado e domingo são dias úteis por empresa';
COMMENT ON TABLE calendario_feriados_fixos IS 'Datas fixas não úteis que se repetem todo ano (mes/dia)';
COMMENT ON TABLE calendario_eventos IS 'Datas específicas não úteis: ano_especifico NULL = todo ano; preenchido = só naquele ano';

-- RLS
ALTER TABLE calendario_fim_semana ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_feriados_fixos ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendario_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_fim_semana" ON public.calendario_fim_semana;
CREATE POLICY "Admin e operador gerenciam calendario_fim_semana" ON public.calendario_fim_semana FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_feriados_fixos" ON public.calendario_feriados_fixos;
CREATE POLICY "Admin e operador gerenciam calendario_feriados_fixos" ON public.calendario_feriados_fixos FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());

DROP POLICY IF EXISTS "Admin e operador gerenciam calendario_eventos" ON public.calendario_eventos;
CREATE POLICY "Admin e operador gerenciam calendario_eventos" ON public.calendario_eventos FOR ALL
  USING (public.eh_admin_ou_operador())
  WITH CHECK (public.eh_admin_ou_operador());
