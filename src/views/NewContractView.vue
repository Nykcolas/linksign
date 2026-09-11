<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { supabase, callFunction } from '../lib/supabase'
import { extractVariables, fillTemplate, humanize } from '../lib/template'
import { renderContractPdf, pdfToBase64 } from '../lib/pdf'
import type { ContractTemplate } from '../types'

const templates = ref<ContractTemplate[]>([])
const templateId = ref('')
const values = ref<Record<string, string>>({})
const client = ref({ name: '', email: '', document: '' })

const busy = ref(false)
const error = ref('')
const signUrl = ref('')
const copied = ref(false)

const template = computed(() => templates.value.find((t) => t.id === templateId.value))
const variables = computed(() => (template.value ? extractVariables(template.value.content) : []))
const preview = computed(() =>
  template.value ? fillTemplate(template.value.content, values.value) : '',
)

const ready = computed(
  () =>
    !!template.value &&
    !!client.value.name &&
    !!client.value.email &&
    variables.value.every((v) => values.value[v]?.trim()),
)

onMounted(async () => {
  const { data } = await supabase
    .from('contract_templates')
    .select('*')
    .order('name')
  templates.value = data ?? []
})

// Trocar de modelo zera o que foi preenchido: as variáveis são outras.
watch(templateId, () => {
  values.value = {}
  signUrl.value = ''
})

async function generate() {
  if (!template.value) return

  busy.value = true
  error.value = ''

  try {
    const content = preview.value

    const { data: contract, error: err } = await supabase
      .from('contracts')
      .insert({
        template_id: template.value.id,
        content,
        variables: values.value,
        client_name: client.value.name,
        client_email: client.value.email,
        client_document: client.value.document || null,
      })
      .select()
      .single()

    if (err || !contract) throw err ?? new Error('falha ao salvar o contrato')

    // O PDF é montado aqui e vai em base64 para a Edge Function, que é quem
    // fala com a ZapSign — o token da API nunca chega ao navegador.
    const base64Pdf = pdfToBase64(renderContractPdf(content))
    const result = await callFunction<{ signUrl: string }>('criar-contrato', {
      contractId: contract.id,
      base64Pdf,
    })

    signUrl.value = result.signUrl
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Não foi possível gerar o contrato.'
  } finally {
    busy.value = false
  }
}

function copyLink() {
  navigator.clipboard.writeText(signUrl.value)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function reset() {
  templateId.value = ''
  values.value = {}
  client.value = { name: '', email: '', document: '' }
  signUrl.value = ''
}

function downloadPdf() {
  renderContractPdf(preview.value).save(`contrato-${client.value.name}.pdf`)
}
</script>

<template>
  <h1>Novo contrato</h1>
  <p class="subtitle">Escolha o modelo, preencha os dados e envie para assinatura.</p>

  <!-- Depois de enviado, a tela vira o comprovante com o link. -->
  <div v-if="signUrl" class="card">
    <h1 style="font-size: 18px">Contrato enviado</h1>
    <p class="subtitle" style="margin-bottom: 20px">
      {{ client.name }} recebeu o link por e-mail e pode assinar pelo celular.
    </p>

    <div class="field">
      <label>Link de assinatura</label>
      <input :value="signUrl" readonly @focus="($event.target as HTMLInputElement).select()" />
    </div>

    <div class="actions" style="margin-top: 16px">
      <button class="primary" @click="copyLink">{{ copied ? 'Copiado!' : 'Copiar link' }}</button>
      <a :href="signUrl" target="_blank" rel="noopener"><button>Abrir</button></a>
      <div class="spacer"></div>
      <button class="link" @click="reset">Gerar outro</button>
    </div>
  </div>

  <template v-else>
    <div v-if="error" class="alert error">{{ error }}</div>

    <div class="field">
      <label for="template">Modelo</label>
      <select id="template" v-model="templateId">
        <option value="" disabled>Selecione um modelo…</option>
        <option v-for="t in templates" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <p v-if="!templates.length" class="hint">
        Nenhum modelo cadastrado ainda — crie um em <RouterLink to="/modelos">Modelos</RouterLink>.
      </p>
    </div>

    <template v-if="template">
      <h2>Signatário</h2>
      <div class="fields">
        <div class="field">
          <label for="client-name">Nome do cliente</label>
          <input id="client-name" v-model="client.name" />
        </div>
        <div class="field">
          <label for="client-email">E-mail</label>
          <input id="client-email" v-model="client.email" type="email" />
        </div>
        <div class="field">
          <label for="client-doc">CPF/CNPJ</label>
          <input id="client-doc" v-model="client.document" />
        </div>
      </div>

      <template v-if="variables.length">
        <h2>Dados do contrato</h2>
        <div class="fields">
          <div v-for="variable in variables" :key="variable" class="field">
            <label :for="`var-${variable}`">{{ humanize(variable) }}</label>
            <input :id="`var-${variable}`" v-model="values[variable]" />
          </div>
        </div>
      </template>

      <h2>Prévia</h2>
      <div class="preview">{{ preview }}</div>

      <div class="actions">
        <button class="primary" :disabled="!ready || busy" @click="generate">
          {{ busy ? 'Enviando…' : 'Gerar e enviar para assinatura' }}
        </button>
        <button :disabled="!ready" @click="downloadPdf">Baixar PDF</button>
      </div>
    </template>
  </template>
</template>
