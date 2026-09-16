-- Campos do formulário cadastrados no modelo: [{ "key", "label", "type" }].
-- `key` é a variável usada no texto ({{key}}), gerada a partir de `label`;
-- `type` define a máscara no formulário (cpf, data, moeda, ...).
--
-- Modelos antigos ficam com [] e o app deduz os campos pelo nome das variáveis.

alter table contract_templates
  add column if not exists fields jsonb not null default '[]'::jsonb;
