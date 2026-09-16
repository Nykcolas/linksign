<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import FieldInput from '../components/FieldInput.vue'
import { guessFields, isFilled, validateField, type TemplateField } from '../lib/fields'
import { renderContractPdf, pdfToBase64 } from '../lib/pdf'
import { sanitizeHtml } from '../lib/richtext'
import { callFunction, supabase } from '../lib/supabase'
import { fillTemplate } from '../lib/template'
import type { ContractTemplate } from '../types'

const route = useRoute()
const router = useRouter()

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

/** Rascunho já salvo no banco: salvar e enviar atualizam ele em vez de criar outro. */
const draftId = ref('')
/** Nome do cliente do contrato que serviu de base para a cópia. */
const copiedFrom = ref('')

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
  await loadFromRoute()
})

// ?rascunho=<id> edita um rascunho; ?copiar=<id> preenche a partir de qualquer contrato.
watch(() => [route.query.rascunho, route.query.copiar], loadFromRoute)

// Trocar de modelo zera o que foi preenchido: os campos são outros.
watch(templateId, () => {
  values.value = {}
  signUrl.value = ''
})

watch(documentType, () => (client.value.document = ''))

async function loadFromRoute() {
  reset()
  error.value = ''

  const editId = typeof route.query.rascunho === 'string' ? route.query.rascunho : ''
  const copyId = typeof route.query.copiar === 'string' ? route.query.copiar : ''
  const id = editId || copyId
  if (!id) return

  const { data: contract } = await supabase.from('contracts').select('*').eq('id', id).single()
  if (!contract) {
    error.value = 'Contrato não encontrado.'
    return
  }
  if (editId && contract.status !== 'draft') {
    error.value = 'Este contrato já foi enviado e não pode ser editado. Use "Reaproveitar" na lista.'
    return
  }
  if (!templates.value.some((t) => t.id === contract.template_id)) {
    error.value = 'O modelo usado neste contrato foi excluído, então não dá para reabrir o formulário.'
    return
  }

  templateId.value = contract.template_id!
  const digits = (contract.client_document ?? '').replace(/\D/g, '')
  documentType.value = digits.length > 11 ? 'cnpj' : 'cpf'

  // Os watchers acima limpam valores e documento; espera eles rodarem antes de preencher.
  await nextTick()

  values.value = { ...contract.variables }
  client.value = {
    name: contract.client_name,
    email: contract.client_email,
    document: contract.client_document ?? '',
  }
  draftId.value = editId ? contract.id : ''
  copiedFrom.value = copyId ? contract.client_name : ''
}

/** Grava o formulário como rascunho (cria ou atualiza) e devolve o id. */
async function saveDraft(): Promise<string> {
  const row = {
    template_id: template.value!.id,
    content: contentHtml.value,
    variables: values.value,
    client_name: client.value.name.trim(),
    client_email: client.value.email.trim(),
    client_document: client.value.document || null,
  }

  // Filtrar por draft impede sobrescrever um rascunho que foi enviado em outra aba.
  const { data, error: err } = draftId.value
    ? await supabase
        .from('contracts')
        .update(row)
        .eq('id', draftId.value)
        .eq('status', 'draft')
        .select('id')
        .maybeSingle()
    : await supabase.from('contracts').insert(row).select('id').single()

  if (err) throw err
  if (!data) throw new Error('Este rascunho já foi enviado ou excluído.')

  draftId.value = data.id
  return data.id
}

async function saveAndExit() {
  if (!template.value) return
  busy.value = true
  error.value = ''
  try {
    await saveDraft()
    router.push('/contratos')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Não foi possível salvar o rascunho.'
  } finally {
    busy.value = false
  }
}

async function generate() {
  if (!template.value) return

  busy.value = true
  error.value = ''

  try {
    const content = contentHtml.value
    // Se o envio falhar, o rascunho fica salvo e a próxima tentativa reaproveita ele.
    const contractId = await saveDraft()

    // O PDF é montado aqui e vai em base64 para a Edge Function, que é quem
    // fala com a Autentique — o token da API nunca chega ao navegador.
    const base64Pdf = pdfToBase64(renderContractPdf(content))
    const result = await callFunction<{ signUrl: string; sandbox?: boolean }>('criar-contrato', {
      contractId,
      base64Pdf,
    })

    sandbox.value = !!result.sandbox
    signUrl.value = result.signUrl
    draftId.value = ''
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
  draftId.value = ''
  copiedFrom.value = ''
}

/** "Gerar outro" também sai do modo edição/cópia. */
function startOver() {
  if (route.query.rascunho || route.query.copiar) router.replace('/novo-contrato')
  else reset()
}

function downloadPdf() {
  renderContractPdf(contentHtml.value).save(`contrato-${client.value.name}.pdf`)
}
</script>

<template>
  <h1>{{ draftId && !signUrl ? 'Editar rascunho' : 'Novo contrato' }}</h1>
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
      <button class="link" @click="startOver">Gerar outro</button>
    </div>
  </div>

  <template v-else>
    <div v-if="error" class="alert error">{{ error }}</div>
    <div v-if="copiedFrom" class="alert info">
      Cópia do contrato de {{ copiedFrom }}. Revise os dados: ao enviar, um novo contrato é criado
      e o original não muda.
    </div>

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
        <button :disabled="busy" @click="saveAndExit">Salvar rascunho</button>
        <button :disabled="!ready" @click="downloadPdf">Baixar PDF</button>
      </div>
    </template>
  </template>
</template>
