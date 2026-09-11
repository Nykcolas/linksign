<script setup lang="ts">
// Mostrada quando o .env ainda não aponta para um projeto Supabase.
</script>

<template>
  <div class="center">
    <div class="card" style="max-width: 520px">
      <h1>LinkSign</h1>
      <p class="subtitle">Falta conectar o projeto ao Supabase.</p>

      <p style="font-size: 14px; line-height: 1.7">
        Crie um projeto em <a href="https://supabase.com" target="_blank" rel="noopener">supabase.com</a>,
        copie <code>.env.example</code> para <code>.env</code> e preencha:
      </p>

      <pre style="background: var(--bg); padding: 14px; border-radius: 8px; font-size: 12px; overflow-x: auto"><code>VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=…</code></pre>

      <p class="hint">
        As duas chaves estão em Project Settings → API. Depois reinicie o
        <code>npm run dev</code>.
      </p>
    </div>
  </div>
</template>
