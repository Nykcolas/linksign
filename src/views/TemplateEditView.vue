<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { extractVariables } from '../lib/template'

const route = useRoute()
const router = useRouter()

const isNew = computed(() => route.params.id === 'novo')
const name = ref('')
const content = ref('')
const busy = ref(false)
const error = ref('')

const variables = computed(() => extractVariables(content.value))

// O tokenizer do Vue fecha a interpolação na primeira `}}`, então o exemplo
// de sintaxe vem daqui em vez de literal no template.
const SYNTAX = '{{' + 'variavel' + '}}'

const EXAMPLE = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS

CONTRATANTE: {{nome_cliente}}
CPF: {{cpf}}
Endereço: {{endereco}}

Pelo presente instrumento, as partes acordam a prestação dos
serviços descritos abaixo, pelo valor de {{valor}}, com início
em {{data_inicio}}.
`

onMounted(async () => {
  if (isNew.value) {
    content.value = EXAMPLE
    return
  }

  const { data } = await supabase
    .from('contract_templates')
    .select('*')
    .eq('id', route.params.id as string)
    .single()

  if (data) {
    name.value = data.name
    content.value = data.content
  }
})

async function save() {
  busy.value = true
  error.value = ''

  const payload = { name: name.value, content: content.value }
  const { error: err } = isNew.value
    ? await supabase.from('contract_templates').insert(payload)
    : await supabase
        .from('contract_templates')
        .update(payload)
        .eq('id', route.params.id as string)

  busy.value = false
  if (err) {
    error.value = err.message
    return
  }
  router.push('/modelos')
}
</script>

<template>
  <h1>{{ isNew ? 'Novo modelo' : 'Editar modelo' }}</h1>
  <p class="subtitle">
    Escreva o contrato como texto. Onde o valor muda a cada cliente, use
    <code>{{ SYNTAX }}</code> — o formulário de geração se monta sozinho a partir disso.
  </p>

  <div v-if="error" class="alert error">{{ error }}</div>

  <div class="field">
    <label for="name">Nome do modelo</label>
    <input id="name" v-model="name" placeholder="Contrato de prestação de serviços" />
  </div>

  <div class="field">
    <label for="content">Texto do contrato</label>
    <textarea id="content" v-model="content"></textarea>
    <p class="hint">
      <template v-if="variables.length">
        Variáveis encontradas: <code v-for="v in variables" :key="v">{{ v }}</code>
      </template>
      <template v-else>Nenhuma variável no texto ainda.</template>
    </p>
  </div>

  <div class="actions">
    <button class="primary" :disabled="busy || !name" @click="save">
      {{ busy ? 'Salvando…' : 'Salvar modelo' }}
    </button>
    <RouterLink to="/modelos"><button class="link">Cancelar</button></RouterLink>
  </div>
</template>
