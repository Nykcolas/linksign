<script setup lang="ts">
import TextAlign from '@tiptap/extension-text-align'
import StarterKit from '@tiptap/starter-kit'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import { computed, watch } from 'vue'
import type { TemplateField } from '../lib/fields'
import { toEditorHtml } from '../lib/template'
import { VariableNode } from '../lib/variable-node'

/**
 * Editor visual do texto do contrato. O valor (v-model) é HTML; as variáveis
 * entram como etiquetas pelo seletor "Inserir campo" ou pelos métodos expostos.
 */

const props = defineProps<{ fields: TemplateField[]; labelledby?: string }>()
const model = defineModel<string>({ default: '' })

const labels = () => Object.fromEntries(props.fields.map((f) => [f.key, f.label]))

const editor = useEditor({
  content: toEditorHtml(model.value, labels()),
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      code: false,
      codeBlock: false,
      link: false,
    }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    VariableNode,
  ],
  editorProps: {
    attributes: {
      class: 'doc editor-content',
      ...(props.labelledby ? { 'aria-labelledby': props.labelledby } : {}),
    },
  },
  // Modelo antigo (texto puro ou Markdown) já sai convertido para HTML no v-model.
  onCreate: ({ editor }) => {
    if (model.value) emit(editor.getHTML())
  },
  onUpdate: ({ editor }) => emit(editor.getHTML()),
})

// O último HTML que o próprio editor mandou pelo v-model. O `watch` abaixo roda
// um instante depois da digitação; comparar com `getHTML()` naquele momento
// confundiria a tecla seguinte com mudança de fora e apagaria a letra digitada.
let emitted = ''
function emit(html: string) {
  emitted = html
  model.value = html
}

// O modelo chega do banco depois de montado; só substitui quando a mudança veio de fora.
watch(model, (value) => {
  const e = editor.value
  if (!e || value === emitted) return
  e.commands.setContent(toEditorHtml(value, labels()), { emitUpdate: false })
  emit(e.getHTML())
})

const insertable = computed(() => props.fields.filter((f) => f.key))

type Tool = {
  title: string
  html?: string
  icon?: string
  run: () => void
  active?: () => boolean
  disabled?: () => boolean
}

const ALIGN_ICONS = {
  left: 'M3 5h14M3 9h9M3 13h14M3 17h9',
  center: 'M3 5h14M5.5 9h9M3 13h14M5.5 17h9',
  right: 'M3 5h14M8 9h9M3 13h14M8 17h9',
  justify: 'M3 5h14M3 9h14M3 13h14M3 17h14',
}
const ALIGN_TITLES = {
  left: 'Alinhar à esquerda',
  center: 'Centralizar',
  right: 'Alinhar à direita',
  justify: 'Justificar',
}

const chain = () => editor.value!.chain().focus()
const isActive = (name: string | Record<string, unknown>, attrs?: Record<string, unknown>) =>
  typeof name === 'string' ? editor.value!.isActive(name, attrs) : editor.value!.isActive(name)

const groups: Tool[][] = [
  [
    { title: 'Negrito (Ctrl+B)', html: '<b>B</b>', run: () => chain().toggleBold().run(), active: () => isActive('bold') },
    { title: 'Itálico (Ctrl+I)', html: '<i>I</i>', run: () => chain().toggleItalic().run(), active: () => isActive('italic') },
    { title: 'Sublinhado (Ctrl+U)', html: '<u>U</u>', run: () => chain().toggleUnderline().run(), active: () => isActive('underline') },
    { title: 'Tachado', html: '<s>S</s>', run: () => chain().toggleStrike().run(), active: () => isActive('strike') },
  ],
  [
    { title: 'Lista com marcadores', html: '•', run: () => chain().toggleBulletList().run(), active: () => isActive('bulletList') },
    { title: 'Lista numerada', html: '1.', run: () => chain().toggleOrderedList().run(), active: () => isActive('orderedList') },
  ],
  (['left', 'center', 'right', 'justify'] as const).map((align) => ({
    title: ALIGN_TITLES[align],
    icon: ALIGN_ICONS[align],
    run: () => chain().setTextAlign(align).run(),
    active: () => isActive({ textAlign: align }),
  })),
  [
    { title: 'Linha horizontal', html: '―', run: () => chain().setHorizontalRule().run() },
    { title: 'Desfazer (Ctrl+Z)', html: '↶', run: () => chain().undo().run(), disabled: () => !editor.value!.can().undo() },
    { title: 'Refazer (Ctrl+Shift+Z)', html: '↷', run: () => chain().redo().run(), disabled: () => !editor.value!.can().redo() },
  ],
]

const blockType = computed(() => {
  if (!editor.value) return 'p'
  for (const level of [1, 2, 3] as const) {
    if (editor.value.isActive('heading', { level })) return `h${level}`
  }
  return 'p'
})

function setBlock(value: string) {
  const level = Number(value.slice(1)) as 1 | 2 | 3
  if (value === 'p') chain().setParagraph().run()
  else chain().setHeading({ level }).run()
}

function onInsert(event: Event) {
  const select = event.target as HTMLSelectElement
  const field = props.fields.find((f) => f.key === select.value)
  if (field) insertVariable(field)
  select.value = ''
}

function insertVariable(field: TemplateField) {
  chain().insertContent({ type: 'variable', attrs: { key: field.key, label: field.label } }).run()
}

/** Renomear o campo atualiza todas as etiquetas dele no texto. */
function updateVariable(oldKey: string, field: TemplateField) {
  const e = editor.value
  if (!e) return
  const { tr } = e.state
  e.state.doc.descendants((node, pos) => {
    if (node.type.name === 'variable' && node.attrs.key === oldKey) {
      tr.setNodeMarkup(pos, undefined, { key: field.key, label: field.label })
    }
  })
  if (tr.docChanged) e.view.dispatch(tr)
}

function positionsOf(key: string): number[] {
  const positions: number[] = []
  editor.value?.state.doc.descendants((node, pos) => {
    if (node.type.name === 'variable' && node.attrs.key === key) positions.push(pos)
  })
  return positions
}

function usesVariable(key: string): boolean {
  return positionsOf(key).length > 0
}

function removeVariable(key: string) {
  const e = editor.value
  if (!e) return
  const { tr } = e.state
  // De trás para frente, para as posições anteriores continuarem válidas.
  for (const pos of positionsOf(key).reverse()) tr.delete(pos, pos + 1)
  if (tr.docChanged) e.view.dispatch(tr)
}

defineExpose({ insertVariable, updateVariable, usesVariable, removeVariable })
</script>

<template>
  <div v-if="editor" class="editor">
    <div class="editor-toolbar" role="toolbar" aria-label="Formatação do texto">
      <select
        class="toolbar-select"
        aria-label="Estilo do parágrafo"
        :value="blockType"
        @change="setBlock(($event.target as HTMLSelectElement).value)"
      >
        <option value="p">Texto</option>
        <option value="h1">Título</option>
        <option value="h2">Subtítulo</option>
        <option value="h3">Seção</option>
      </select>

      <template v-for="(group, index) in groups" :key="index">
        <span class="toolbar-sep" aria-hidden="true"></span>
        <button
          v-for="tool in group"
          :key="tool.title"
          type="button"
          class="tool"
          :class="{ active: tool.active?.() }"
          :title="tool.title"
          :aria-label="tool.title"
          :aria-pressed="tool.active ? tool.active() : undefined"
          :disabled="tool.disabled?.()"
          @mousedown.prevent
          @click="tool.run()"
        >
          <svg
            v-if="tool.icon"
            viewBox="0 0 20 20"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            aria-hidden="true"
          >
            <path :d="tool.icon" />
          </svg>
          <span v-else aria-hidden="true" v-html="tool.html"></span>
        </button>
      </template>

      <span class="toolbar-sep" aria-hidden="true"></span>
      <select
        class="toolbar-select"
        aria-label="Inserir campo no texto"
        value=""
        :disabled="!insertable.length"
        @change="onInsert"
      >
        <option value="" disabled>+ Inserir campo</option>
        <option v-for="field in insertable" :key="field.key" :value="field.key">
          {{ field.label }}
        </option>
      </select>
    </div>

    <EditorContent :editor="editor" />
  </div>
</template>
