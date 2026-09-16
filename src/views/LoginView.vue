<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { getRememberMe, setRememberMe, supabase } from '../lib/supabase'

const router = useRouter()
const mode = ref<'login' | 'forgot'>('login')
const email = ref('')
const password = ref('')
const remember = ref(getRememberMe())
const error = ref('')
const info = ref('')
const busy = ref(false)

function switchMode(next: 'login' | 'forgot') {
  mode.value = next
  error.value = ''
  info.value = ''
}

async function submit() {
  busy.value = true
  error.value = ''

  // Precisa vir antes do login: é na hora de gravar a sessão que o storage é escolhido.
  setRememberMe(remember.value)

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

async function sendRecovery() {
  busy.value = true
  error.value = ''
  info.value = ''

  const { error: err } = await supabase.auth.resetPasswordForEmail(email.value, {
    redirectTo: `${window.location.origin}/redefinir-senha`,
  })

  busy.value = false
  if (err) {
    error.value =
      err.status === 429
        ? 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
        : 'Não foi possível enviar o e-mail de recuperação.'
    return
  }
  // Mesma mensagem exista ou não a conta, para não revelar quem está cadastrado.
  info.value = 'Se este e-mail tiver acesso, você vai receber um link para criar uma nova senha.'
}
</script>

<template>
  <div class="center">
    <form v-if="mode === 'login'" class="card" @submit.prevent="submit">
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

      <div class="login-options">
        <label class="check">
          <input v-model="remember" type="checkbox" />
          Manter-me conectado
        </label>
        <button type="button" class="link" @click="switchMode('forgot')">
          Esqueci minha senha
        </button>
      </div>

      <button class="primary" style="width: 100%; margin-top: 8px" :disabled="busy">
        {{ busy ? 'Entrando…' : 'Entrar' }}
      </button>
    </form>

    <form v-else class="card" @submit.prevent="sendRecovery">
      <h1>LinkSign</h1>
      <p class="subtitle">Recuperar senha</p>

      <div v-if="error" class="alert error">{{ error }}</div>
      <div v-if="info" class="alert info">{{ info }}</div>

      <div class="field">
        <label for="recovery-email">E-mail</label>
        <input
          id="recovery-email"
          v-model="email"
          type="email"
          required
          autocomplete="username"
        />
      </div>

      <button class="primary" style="width: 100%; margin-top: 8px" :disabled="busy">
        {{ busy ? 'Enviando…' : 'Enviar link de recuperação' }}
      </button>
      <button type="button" class="link" style="width: 100%; margin-top: 8px" @click="switchMode('login')">
        Voltar ao login
      </button>
    </form>
  </div>
</template>
