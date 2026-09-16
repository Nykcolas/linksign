<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { finishPasswordRecovery, supabase } from '../lib/supabase'

const router = useRouter()
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)
// O supabase-js troca o token do link por uma sessão antes do router liberar a
// rota, então basta ver se ela existe. Sem sessão, o link expirou ou já foi usado.
const ready = ref(false)
const validLink = ref(false)

onMounted(async () => {
  const { data } = await supabase.auth.getSession()
  validLink.value = Boolean(data.session)
  if (!validLink.value) finishPasswordRecovery()
  ready.value = true
})

async function submit() {
  error.value = ''
  if (password.value !== confirm.value) {
    error.value = 'As senhas não conferem.'
    return
  }

  busy.value = true
  const { error: err } = await supabase.auth.updateUser({ password: password.value })
  busy.value = false

  if (err) {
    error.value =
      err.code === 'same_password'
        ? 'A nova senha precisa ser diferente da atual.'
        : err.code === 'weak_password'
          ? 'Senha fraca. Use uma senha mais longa.'
          : 'Não foi possível salvar a nova senha.'
    return
  }
  finishPasswordRecovery()
  router.push('/')
}
</script>

<template>
  <div class="center">
    <div v-if="ready && !validLink" class="card">
      <h1>LinkSign</h1>
      <p class="subtitle">Link inválido ou expirado</p>
      <p style="font-size: 14px; line-height: 1.6">
        Peça um novo link de recuperação na tela de login.
      </p>
      <button class="primary" style="width: 100%" @click="router.push('/login')">
        Voltar ao login
      </button>
    </div>

    <form v-else-if="ready" class="card" @submit.prevent="submit">
      <h1>LinkSign</h1>
      <p class="subtitle">Defina uma nova senha</p>

      <div v-if="error" class="alert error">{{ error }}</div>

      <div class="field">
        <label for="password">Nova senha</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          minlength="6"
          autocomplete="new-password"
        />
      </div>

      <div class="field">
        <label for="confirm">Confirme a nova senha</label>
        <input
          id="confirm"
          v-model="confirm"
          type="password"
          required
          minlength="6"
          autocomplete="new-password"
        />
      </div>

      <button class="primary" style="width: 100%; margin-top: 8px" :disabled="busy">
        {{ busy ? 'Salvando…' : 'Salvar nova senha' }}
      </button>
    </form>
  </div>
</template>
