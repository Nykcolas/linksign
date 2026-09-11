<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from './lib/supabase'

const route = useRoute()
const router = useRouter()
const email = ref('')

onMounted(async () => {
  const { data } = await supabase.auth.getUser()
  email.value = data.user?.email ?? ''

  supabase.auth.onAuthStateChange((_event, session) => {
    email.value = session?.user.email ?? ''
  })
})

async function signOut() {
  await supabase.auth.signOut()
  router.push('/login')
}
</script>

<template>
  <RouterView v-if="route.meta.public" />

  <template v-else>
    <header class="topbar">
      <span class="brand">LinkSign</span>
      <nav>
        <RouterLink to="/novo-contrato">Novo contrato</RouterLink>
        <RouterLink to="/contratos">Contratos</RouterLink>
        <RouterLink to="/modelos">Modelos</RouterLink>
      </nav>
      <button class="link" @click="signOut">Sair de {{ email }}</button>
    </header>

    <main><RouterView /></main>
  </template>
</template>
