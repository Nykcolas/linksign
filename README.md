# LinkSign

Gerador de contratos interno: cadastra modelos em texto com variáveis, preenche
um formulário, envia para assinatura eletrônica e guarda o PDF assinado.

Sem servidor próprio. O frontend é estático (hospedagem gratuita em Cloudflare
Pages, Vercel ou Netlify) e o Supabase faz o papel de backend.

```
Vue 3 + Vite  (navegador; Electron depois, se fizer sentido)
     │  supabase-js — login e RLS
     ▼
  Supabase
     ├── Postgres        contract_templates, contracts
     ├── Storage         PDFs assinados (bucket privado)
     └── Edge Functions  ← guardam o token da ZapSign
           ├── criar-contrato  → cria o documento, devolve o link
           └── webhook-zapsign → recebe "assinado", arquiva o PDF
                    ▲
                    └── ZapSign ──link──> celular do cliente
```

A página de assinatura é a da ZapSign. Não hospedamos nada público.

## Rodando localmente

```bash
npm install
cp .env.example .env    # preencha as duas VITE_*
npm run dev
```

Sem `.env` o app abre numa tela de setup em vez de quebrar.

## Configurando o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Rode as migrations de `supabase/migrations/` no SQL Editor, na ordem.
3. Copie a URL e a publishable key (Project Settings → API Keys) para o `.env`.
4. Crie os usuários da equipe em Authentication → Users. Não há tela de
   cadastro: é ferramenta interna, o acesso é dado manualmente.
5. Publique as Edge Functions. O `login` abre o navegador, então rode você mesmo:

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-REF

   npm run deploy:functions
   ```

   O `verify_jwt = false` do webhook está em `supabase/config.toml`: quem chama
   é a ZapSign, não um usuário logado — por isso ele é protegido pelo segredo
   na URL.

   Depois configure os segredos, que é de onde as funções leem (nunca do `.env`):

   ```bash
   npx supabase secrets set ZAPSIGN_API_TOKEN=...
   npx supabase secrets set ZAPSIGN_BASE_URL=https://sandbox.api.zapsign.com.br/api/v1
   npx supabase secrets set WEBHOOK_SECRET=$(openssl rand -hex 24)
   npx supabase secrets set APP_ORIGIN=http://localhost:5173
   ```

6. No painel da ZapSign, aponte o webhook para:

   ```
   https://SEU-PROJETO.supabase.co/functions/v1/webhook-zapsign?secret=SEGREDO
   ```

## Como os modelos funcionam

Modelo é texto puro com marcadores:

```
CONTRATANTE: {{nome_cliente}}
CPF: {{cpf}}
Valor: {{valor}}
```

O app lê as variáveis do próprio texto e monta o formulário. Não existe
cadastro de campos em lugar nenhum.

## Decisões que valem saber

- **O token da ZapSign nunca chega ao navegador.** Quem fala com a API é a
  Edge Function. Isso vale mais ainda se um dia isto virar Electron.
- **O contrato congela ao ser enviado.** Um trigger no banco recusa alteração
  de `content` fora de `draft`. Para corrigir: cancelar e gerar outro.
- **Guardamos cópia do PDF assinado.** O link da ZapSign expira; o bucket não.
- **PDF é texto de verdade**, não imagem — os modelos são texto puro, então o
  jsPDF escreve texto selecionável e pesquisável.

## Pendências conhecidas

- Cancelar contrato ainda não tem botão (o status existe no banco).
- O plano free do Supabase pausa o projeto após ~7 dias sem acesso.
- Os campos da resposta da ZapSign (`token`, `signed_file`) foram escritos a
  partir da documentação e precisam ser conferidos no primeiro teste real
  contra o sandbox.

