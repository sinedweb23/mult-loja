-- RE (Registro do Empregado) para colaboradores importados pelo RH
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS re_colaborador TEXT;

COMMENT ON COLUMN usuarios.re_colaborador IS 'Registro do empregado (RE), preenchido na importação de colaboradores pelo RH';
