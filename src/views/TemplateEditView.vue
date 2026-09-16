<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import RichTextEditor from '../components/RichTextEditor.vue'
import {
  FIELD_TYPES,
  guessFields,
  variableKey,
  type TemplateField,
} from '../lib/fields'
import { supabase } from '../lib/supabase'
import { extractVariables } from '../lib/template'

const route = useRoute()
const router = useRouter()

const isNew = computed(() => route.params.id === 'novo')
const name = ref('')
const content = ref('')
const busy = ref(false)
const error = ref('')

// `uid` só existe na tela: a variável muda enquanto o nome é digitado, então
// não serve de chave para o v-for (o input perderia o foco a cada tecla).
type Row = { uid: number; field: TemplateField }
let nextUid = 1
const rows = ref<Row[]>([])
const fields = computed(() => rows.value.map((row) => row.field))
const setFields = (list: TemplateField[]) => {
  rows.value = list.map((field) => ({ uid: nextUid++, field: { ...field } }))
}

const editor = ref<InstanceType<typeof RichTextEditor>>()
const usedKeys = computed(() => extractVariables(content.value))

// O tokenizer do Vue fecha a interpolação na primeira `}}`, então o marcador
// é montado aqui em vez de literal no template.
const marker = (key: string) => '{{' + key + '}}'

const EXAMPLE_FIELDS: TemplateField[] = [
  { key: 'nome_do_cliente', label: 'Nome do cliente', type: 'nome' },
  { key: 'cpf', label: 'CPF', type: 'cpf' },
  { key: 'endereco', label: 'Endereço', type: 'texto' },
  { key: 'valor', label: 'Valor', type: 'moeda' },
  { key: 'data_de_inicio', label: 'Data de início', type: 'data' },
]

const chip = (key: string) => {
  const field = EXAMPLE_FIELDS.find((f) => f.key === key)!
  return `<span data-variable="${key}" data-label="${field.label}">${marker(key)}</span>`
}

const EXAMPLE = `<h1 style="text-align: center">CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
<p><strong>CONTRATANTE:</strong> ${chip('nome_do_cliente')}, inscrito(a) no CPF sob o nº ${chip('cpf')}, residente em ${chip('endereco')}.</p>
<p style="text-align: justify">Pelo presente instrumento, as partes acordam a prestação dos serviços descritos abaixo, pelo valor de ${chip('valor')}, com início em ${chip('data_de_inicio')}.</p>
<h2>Obrigações da contratada</h2>
<ul><li><p>Executar os serviços com qualidade e dentro do prazo</p></li><li><p>Emitir nota fiscal mensalmente</p></li></ul>`

// Acompanha o id, não só a montagem: indo de um modelo para outro o Vue
// reaproveita esta tela, e ela continuaria mostrando o anterior.
watch(
  () => route.params.id,
  async () => {
    error.value = ''
    if (isNew.value) {
      name.value = ''
      setFields(EXAMPLE_FIELDS)
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
      // Campos antes do texto: o editor usa os nomes deles nas etiquetas.
      setFields(data.fields?.length ? data.fields : guessFields(data.content))
      content.value = data.content
    }
  },
  { immediate: true },
)

function addField() {
  rows.value.push({ uid: nextUid++, field: { key: '', label: '', type: 'texto' } })
}

/** A variável acompanha o nome do campo, e as etiquetas no texto acompanham a variável. */
function renameField(field: TemplateField, label: string) {
  const oldKey = field.key
  field.label = label
  const taken = fields.value.filter((f) => f !== field).map((f) => f.key)
  const key = variableKey(label, taken)
  // Nome apagado: mantém a variável antiga até digitar outro.
  if (!key) return
  field.key = key
  if (oldKey) editor.value?.updateVariable(oldKey, field)
}

function removeRow(row: Row) {
  const { key, label } = row.field
  if (key && editor.value?.usesVariable(key)) {
    const ok = confirm(`O campo "${label}" está no texto. Remover o campo e tirá-lo do texto?`)
    if (!ok) return
    editor.value.removeVariable(key)
  }
  rows.value = rows.value.filter((r) => r !== row)
}

async function save() {
  error.value = ''
  if (fields.value.some((f) => !f.label.trim() || !f.key)) {
    error.value = 'Dê um nome a todos os campos do formulário.'
    return
  }

  busy.value = true
  const payload = { name: name.value, content: content.value, fields: fields.value }
  const { error: err } = isNew.value
    ? await supabase.from('contract_templates').insert(payload)
    : await supabase
        .from('contract_templates')
        .update(payload)
        .eq('id', route.params.id as string)

  busy.value = false
  if (err) {
    error.value = /fields/.test(err.message)
      ? 'O banco ainda não tem a coluna de campos. Rode supabase/migrations/0003_template_fields.sql no SQL Editor do Supabase.'
      : err.message
    return
  }
  router.push('/modelos')
}
</script>

<template>
  <h1>{{ isNew ? 'Novo modelo' : 'Editar modelo' }}</h1>
  <p class="subtitle">
    Cadastre os campos que mudam a cada cliente e insira-os no texto. O formulário do novo
    contrato é montado a partir desses campos.
  </p>

  <div v-if="error" class="alert error">{{ error }}</div>

  <div class="field">
    <label for="name">Nome do modelo</label>
    <input id="name" v-model="name" placeholder="Contrato de prestação de serviços" />
  </div>

  <h2>Campos do formulário</h2>
  <div v-if="rows.length" class="field-rows">
    <div class="field-row field-row-head" aria-hidden="true">
      <span>Nome do campo</span>
      <span>Tipo</span>
      <span>Variável</span>
      <span></span>
    </div>
    <div v-for="row in rows" :key="row.uid" class="field-row">
      <input
        :value="row.field.label"
        placeholder="Ex.: Nome do cliente"
        aria-label="Nome do campo"
        @input="renameField(row.field, ($event.target as HTMLInputElement).value)"
      />
      <select v-model="row.field.type" aria-label="Tipo do campo">
        <option v-for="type in FIELD_TYPES" :key="type.value" :value="type.value">
          {{ type.label }}
        </option>
      </select>
      <div class="field-row-key">
        <code v-if="row.field.key">{{ marker(row.field.key) }}</code>
        <span v-else class="hint">gerada pelo nome</span>
        <span v-if="row.field.key && !usedKeys.includes(row.field.key)" class="hint warn">
          ainda não está no texto
        </span>
      </div>
      <div class="field-row-actions">
        <button
          type="button"
          class="link"
          :disabled="!row.field.key"
          @click="editor?.insertVariable(row.field)"
        >
          Inserir no texto
        </button>
        <button type="button" class="link danger" @click="removeRow(row)">Remover</button>
      </div>
    </div>
  </div>
  <p v-else class="hint">Nenhum campo ainda. Sem campos, o contrato sai igual para todo cliente.</p>
  <button type="button" style="margin-top: 8px" @click="addField">+ Adicionar campo</button>

  <div class="field" style="margin-top: 32px">
    <label id="content-label">Texto do contrato</label>
    <RichTextEditor ref="editor" v-model="content" :fields="fields" labelledby="content-label" />
  </div>

  <div class="actions">
    <button class="primary" :disabled="busy || !name" @click="save">
      {{ busy ? 'Salvando…' : 'Salvar modelo' }}
    </button>
    <RouterLink to="/modelos"><button class="link">Cancelar</button></RouterLink>
  </div>
</template>
