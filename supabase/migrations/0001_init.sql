-- LinkSign — esquema inicial
-- Ferramenta interna: todo usuário autenticado enxerga e opera tudo.

create extension if not exists "pgcrypto";

-- Modelos de contrato -------------------------------------------------------

create table contract_templates (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  content    text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Contratos gerados ---------------------------------------------------------

create type contract_status as enum (
  'draft',
  'pending_signature',
  'signed',
  'cancelled',
  'expired'
);

create table contracts (
  id              uuid primary key default gen_random_uuid(),
  template_id     uuid references contract_templates (id) on delete set null,
  -- snapshot do texto no momento da geração: o modelo pode mudar depois,
  -- o contrato assinado não.
  content         text not null,
  variables       jsonb not null default '{}'::jsonb,
  client_name     text not null,
  client_email    text not null,
  client_document text,
  status          contract_status not null default 'draft',
  external_id     text unique,
  sign_url        text,
  signed_at       timestamptz,
  signed_file     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index contracts_status_idx  on contracts (status);
create index contracts_created_idx on contracts (created_at desc);

-- updated_at automático ------------------------------------------------------

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger contract_templates_touch
  before update on contract_templates
  for each row execute function touch_updated_at();

create trigger contracts_touch
  before update on contracts
  for each row execute function touch_updated_at();

-- Congelamento do conteúdo ---------------------------------------------------
-- Depois que o contrato saiu para assinatura, o texto não muda mais.
-- Para corrigir algo: cancelar e gerar um novo.

create or replace function freeze_sent_contract()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'draft' and new.content is distinct from old.content then
    raise exception 'contrato % já foi enviado para assinatura; cancele e gere outro', old.id;
  end if;
  return new;
end;
$$;

create trigger contracts_freeze
  before update on contracts
  for each row execute function freeze_sent_contract();

-- RLS ------------------------------------------------------------------------

alter table contract_templates enable row level security;
alter table contracts          enable row level security;

create policy "equipe lê modelos"    on contract_templates for select to authenticated using (true);
create policy "equipe escreve modelos" on contract_templates for all    to authenticated using (true) with check (true);

create policy "equipe lê contratos"  on contracts for select to authenticated using (true);
create policy "equipe cria contratos" on contracts for insert to authenticated with check (status = 'draft');

-- O envio para assinatura e a baixa pelo webhook passam pelas Edge Functions,
-- que usam a service_role e ignoram RLS. O app nunca muda status direto.
