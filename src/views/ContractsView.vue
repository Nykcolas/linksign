<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { STATUS_LABEL, type Contract } from '../types'

const contracts = ref<Contract[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  const { data } = await supabase
    .from('contracts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)
  contracts.value = data ?? []
  loading.value = false
}

/** O bucket é privado: o download passa por um link temporário assinado. */
async function download(contract: Contract) {
  if (!contract.signed_file) return
  const { data } = await supabase.storage
    .from('contracts')
    .createSignedUrl(contract.signed_file, 60)
  if (data) window.open(data.signedUrl, '_blank')
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

onMounted(load)
</script>

<template>
  <h1>Contratos</h1>
  <p class="subtitle">Tudo que já foi gerado, e onde ficam os PDFs assinados.</p>

  <p v-if="loading" class="empty">Carregando…</p>

  <template v-else>
    <div v-if="!contracts.length" class="empty">Nenhum contrato gerado ainda.</div>

    <div v-for="contract in contracts" :key="contract.id" class="row">
      <div class="grow">
        <div class="name">{{ contract.client_name }}</div>
        <div class="meta">{{ formatDate(contract.created_at) }} · {{ contract.client_email }}</div>
      </div>

      <span class="badge" :class="contract.status">{{ STATUS_LABEL[contract.status] }}</span>

      <button v-if="contract.signed_file" class="link" @click="download(contract)">
        Baixar PDF
      </button>
      <a
        v-else-if="contract.sign_url"
        :href="contract.sign_url"
        target="_blank"
        rel="noopener"
      >
        <button class="link">Link</button>
      </a>
    </div>
  </template>
</template>
