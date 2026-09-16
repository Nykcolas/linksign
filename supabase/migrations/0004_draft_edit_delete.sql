-- Rascunhos podem ser editados e excluídos pelo app.
-- Depois que saem para assinatura, só as Edge Functions (service_role) mexem
-- neles; para refazer um contrato enviado, o app cria uma cópia em draft.

create policy "equipe edita rascunhos"
  on contracts for update to authenticated
  using (status = 'draft')
  with check (status = 'draft');

create policy "equipe exclui rascunhos"
  on contracts for delete to authenticated
  using (status = 'draft');
