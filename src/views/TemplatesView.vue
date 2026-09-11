<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { extractVariables } from '../lib/template'
import type { ContractTemplate } from '../types'

const templates = ref<ContractTemplate[]>([])
const loading = ref(true)

async function load() {
  loading.value = true
  const { data } = await supabase
    .from('contract_templates')
    .select('*')
    .order('updated_at', { ascending: false })
  templates.value = data ?? []
  loading.value = false
}

async function remove(template: ContractTemplate) {
  if (!confirm(`Excluir o modelo "${template.name}"?`)) return
  await supabase.from('contract_templates').delete().eq('id', template.id)
  load()
}

async function duplicate(template: ContractTemplate) {
  await supabase.from('contract_templates').insert({
    name: `${template.name} (cópia)`,
    content: template.content,
  })
  load()
}

const formatDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR')

onMounted(load)
</script>

<template>
  <h1>Modelos</h1>
  <p class="subtitle">Os textos-base dos contratos, com as variáveis que o formulário vai preencher.</p>

  <p v-if="loading" class="empty">Carregando…</p>

  <template v-else>
    <div v-if="!templates.length" class="empty">
      Nenhum modelo ainda. Crie o primeiro para começar a gerar contratos.
    </div>

    <div v-for="template in templates" :key="template.id" class="row">
      <div class="grow">
        <div class="name">{{ template.name }}</div>
        <div class="meta">
          Atualizado em {{ formatDate(template.updated_at) }} ·
          {{ extractVariables(template.content).length }} variáveis
        </div>
      </div>
      <RouterLink :to="`/modelos/${template.id}`"><button class="link">Editar</button></RouterLink>
      <button class="link" @click="duplicate(template)">Duplicar</button>
      <button class="link danger" @click="remove(template)">Excluir</button>
    </div>
  </template>

  <div class="actions">
    <RouterLink to="/modelos/novo"><button class="primary">+ Novo modelo</button></RouterLink>
  </div>
</template>
