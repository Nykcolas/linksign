<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import FieldInput from '../components/FieldInput.vue'
import { guessFields, isFilled, validateField, type TemplateField } from '../lib/fields'
import { renderContractPdf, pdfToBase64 } from '../lib/pdf'
import { sanitizeHtml } from '../lib/richtext'
import { callFunction, supabase } from '../lib/supabase'
import { fillTemplate } from '../lib/template'
import type { ContractTemplate } from '../types'

const templates = ref<ContractTemplate[]>([])
const templateId = ref('')
const values = ref<Record<string, string>>({})
const client = ref({ name: '', email: '', document: '' })
const documentType = ref<'cpf' | 'cnpj'>('cpf')

const busy = ref(false)
const error = ref('')
const signUrl = ref('')
const sandbox = ref(false)
const copied = ref(false)

const template = computed(() => templates.value.find((t) => t.id === templateId.value))

// Modelo antigo, sem campos cadastrados: os campos saem das variáveis do texto.
const fields = computed<TemplateField[]>(() => {
  const t = template.value
  if (!t) return []
  return t.fields?.length ? t.fields : guessFields(t.content)
})

const contentHtml = computed(() =>
  template.value ? sanitizeHtml(fillTemplate(template.value.content, values.value)) : '',
)

const ready = computed(
  () =>
    !!template.value &&
    isFilled('nome', client.value.name) &&
    isFilled('email', client.value.email) &&
    !validateField(documentType.value, client.value.document) &&
    fields.value.every((f) => isFilled(f.type, values.value[f.key])),
)

onMounted(async () => {
  const { data } = await supabase
    .from('contract_templates')
    .select('*')
    .order('name')
  templates.value = data ?? []
})

// Trocar de modelo zera o que foi preenchido: os campos são outros.
watch(templateId, () => {
  values.value = {}
  signUrl.value = ''
})

watch(documentType, () => (client.value.document = ''))

async function generate() {
  if (!template.value) return

  busy.value = true
  error.value = ''

  try {
    const content = contentHtml.value

    const { data: contract, error: err } = await supabase
      .from('contracts')
      .insert({
        template_id: template.value.id,
        content,
        variables: values.value,
        client_name: client.value.name.trim(),
        client_email: client.value.email.trim(),
        client_document: client.value.document || null,
      })
      .select()
      .single()

    if (err || !contract) throw err ?? new Error('falha ao salvar o contrato')

    // O PDF é montado aqui e vai em base64 para a Edge Function, que é quem
    // fala com a Autentique — o token da API nunca chega ao navegador.
    const base64Pdf = pdfToBase64(renderContractPdf(content))
    const result = await callFunction<{ signUrl: string; sandbox?: boolean }>('criar-contrato', {
      contractId: contract.id,
      base64Pdf,
    })

    sandbox.value = !!result.sandbox
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
  documentType.value = 'cpf'
  signUrl.value = ''
}

function downloadPdf() {
  renderContractPdf(contentHtml.value).save(`contrato-${client.value.name}.pdf`)
}
</script>

<template>
  <h1>Novo contrato</h1>
  <p class="subtitle">Escolha o modelo, preencha os dados e envie para assinatura.</p>

  <!-- Depois de enviado, a tela vira o comprovante com o link. -->
  <div v-if="signUrl" class="card">
    <h1 style="font-size: 18px">Contrato pronto para assinatura</h1>
    <p class="subtitle" style="margin-bottom: 20px">
      Envie o link abaixo para {{ client.name }} assinar pelo celular.
    </p>
    <div v-if="sandbox" class="alert info">
      Documento de teste (sandbox): não é cobrado, é apagado em alguns dias e não tem validade
      jurídica.
    </div>

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
          <FieldInput id="client-name" v-model="client.name" type="nome" autocomplete="name" />
        </div>
        <div class="field">
          <label for="client-email">E-mail</label>
          <FieldInput id="client-email" v-model="client.email" type="email" autocomplete="email" />
        </div>
        <div class="field">
          <label for="client-doc">Documento</label>
          <div class="input-group">
            <select v-model="documentType" aria-label="Tipo de documento">
              <option value="cpf">CPF</option>
              <option value="cnpj">CNPJ</option>
            </select>
            <FieldInput
              id="client-doc"
              :key="documentType"
              v-model="client.document"
              :type="documentType"
            />
          </div>
        </div>
      </div>

      <template v-if="fields.length">
        <h2>Dados do contrato</h2>
        <div class="fields">
          <div v-for="field in fields" :key="field.key" class="field">
            <label :for="`var-${field.key}`">{{ field.label }}</label>
            <FieldInput :id="`var-${field.key}`" v-model="values[field.key]" :type="field.type" />
          </div>
        </div>
      </template>

      <h2>Prévia</h2>
      <div class="preview doc" v-html="contentHtml"></div>

      <div class="actions">
        <button class="primary" :disabled="!ready || busy" @click="generate">
          {{ busy ? 'Enviando…' : 'Gerar e enviar para assinatura' }}
        </button>
        <button :disabled="!ready" @click="downloadPdf">Baixar PDF</button>
      </div>
    </template>
  </template>
</template>
