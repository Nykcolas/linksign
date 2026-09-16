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
     └── Edge Functions  ← guardam o token da Autentique
           ├── criar-contrato     → cria o documento, devolve o link
           └── webhook-autentique → recebe "assinado", arquiva o PDF
                    ▲
                    └── Autentique ──link──> celular do cliente
```

A página de assinatura é a da Autentique. Não hospedamos nada público, e a
Autentique não manda e-mail: o signatário é criado "por link", e quem gera o
contrato repassa o link para o cliente.

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

   Para a recuperação de senha funcionar, em Authentication → URL Configuration
   defina o **Site URL** com o endereço do app e adicione em **Redirect URLs**
   `http://localhost:5173/redefinir-senha` e `https://SEU-DOMINIO/redefinir-senha`.
   Sem isso o link do e-mail cai na raiz em vez da tela de nova senha.
5. Publique as Edge Functions. O `login` abre o navegador, então rode você mesmo:

   ```bash
   npx supabase login
   npx supabase link --project-ref SEU-REF

   npm run deploy:functions
   ```

   O `verify_jwt = false` do webhook está em `supabase/config.toml`: quem chama
   é a Autentique, não um usuário logado — por isso ele confere a assinatura
   HMAC do corpo (cabeçalho `x-autentique-signature`).

   Depois configure os segredos, que é de onde as funções leem (nunca do `.env`):

   ```bash
   npx supabase secrets set AUTENTIQUE_TOKEN=...
   npx supabase secrets set AUTENTIQUE_WEBHOOK_SECRET=...
   npx supabase secrets set AUTENTIQUE_SANDBOX=true   # documentos de teste, sem custo
   npx supabase secrets set APP_ORIGIN=http://localhost:5173
   ```

   Com `AUTENTIQUE_SANDBOX=true` os documentos não são cobrados, somem em
   alguns dias e não têm validade jurídica. Para produção, `false`.

6. No painel da Autentique (configurações da API → webhooks), cadastre um
   endpoint em formato JSON com os eventos `signature.accepted` e
   `document.finished`, apontando para:

   ```
   https://SEU-PROJETO.supabase.co/functions/v1/webhook-autentique
   ```

   O secret que o painel mostra para o endpoint é o `AUTENTIQUE_WEBHOOK_SECRET`.
   Com mais de um endpoint (ex.: um para documentos e outro para assinaturas),
   cada um tem seu secret: separe por vírgula (`AUTENTIQUE_WEBHOOK_SECRET=abc,def`).
   O webhook vale para a conta toda; documentos criados fora do app são ignorados.

## Como os modelos funcionam

O texto do modelo é escrito num editor visual (negrito, sublinhado, títulos,
listas, alinhamento) e salvo como HTML. O que muda a cada cliente são **campos**
cadastrados no próprio modelo:

| Nome do campo   | Tipo              | Variável gerada        |
| --------------- | ----------------- | ---------------------- |
| Nome do cliente | Nome (maiúsculas) | `{{nome_do_cliente}}`  |
| CPF             | CPF               | `{{cpf}}`              |
| Data de início  | Data              | `{{data_de_inicio}}`   |

A variável sai do nome do campo, e renomear o campo atualiza o texto. No editor
cada variável aparece como uma etiqueta com o nome do campo. O formulário do
novo contrato é montado a partir dos campos, com o comportamento do tipo:
máscara, seletor de data, maiúsculas.

Modelos criados antes do cadastro de campos continuam funcionando: o texto
(puro ou Markdown) é convertido ao abrir, e os campos são deduzidos do nome das
variáveis. Para salvar campos é preciso rodar a migration `0003`.

## Decisões que valem saber

- **O token da Autentique nunca chega ao navegador.** Quem fala com a API é a
  Edge Function. Isso vale mais ainda se um dia isto virar Electron.
- **O contrato congela ao ser enviado.** Um trigger no banco recusa alteração
  de `content` fora de `draft`. Para corrigir: cancelar e gerar outro.
- **Guardamos cópia do PDF assinado.** O arquivo fica no nosso bucket, sem
  depender da Autentique. Logo depois da última assinatura ela pode responder
  425 (PDF ainda sendo gerado); o webhook tenta de novo por até 30 segundos.
- **O status vem da API, não do evento.** O webhook só avisa que algo mudou; a
  função consulta o documento para saber se todos já assinaram.
- **PDF é texto de verdade**, não imagem — o jsPDF escreve texto selecionável e
  pesquisável. A formatação do editor (títulos, negrito, itálico, sublinhado,
  listas, alinhamento) é desenhada à mão em `src/lib/pdf.ts`.
- **O documento do signatário é CPF ou CNPJ, escolhido antes.** CPF aceita só
  números; CNPJ aceita letras, por causa do CNPJ alfanumérico (julho de 2026).
- **Os valores digitados são escapados** antes de entrar no HTML do contrato.

## Pendências conhecidas

- Cancelar contrato ainda não tem botão (o status existe no banco).
- O plano free do Supabase pausa o projeto após ~7 dias sem acesso.
- Recusa de assinatura (`signature.rejected`) ainda não muda o status do contrato.
- O e-mail do cliente continua obrigatório no formulário, mas a Autentique não o
  usa: o envio é só por link.
