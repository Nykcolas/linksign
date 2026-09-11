<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'

const router = useRouter()
const email = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''

  const { error: err } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  busy.value = false
  if (err) {
    error.value = 'E-mail ou senha inválidos.'
    return
  }
  router.push('/')
}
</script>

<template>
  <div class="center">
    <form class="card" @submit.prevent="submit">
      <h1>LinkSign</h1>
      <p class="subtitle">Acesso interno</p>

      <div v-if="error" class="alert error">{{ error }}</div>

      <div class="field">
        <label for="email">E-mail</label>
        <input id="email" v-model="email" type="email" required autocomplete="username" />
      </div>

      <div class="field">
        <label for="password">Senha</label>
        <input
          id="password"
          v-model="password"
          type="password"
          required
          autocomplete="current-password"
        />
      </div>

      <button class="primary" style="width: 100%; margin-top: 8px" :disabled="busy">
        {{ busy ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>
  </div>
</template>
