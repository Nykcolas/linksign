<script setup lang="ts">
import { computed, ref } from 'vue'
import { FIELD_MASKS, brFromIso, isoFromBr, validateField, type FieldType } from '../lib/fields'

/**
 * Um campo do formulário, com o comportamento do tipo: máscara, seletor de
 * data, maiúsculas para nome. Atributos como `id` vão para o <input>.
 */

defineOptions({ inheritAttrs: false })

const props = defineProps<{ type: FieldType }>()
const model = defineModel<string>({ default: '' })

const mask = computed(() => FIELD_MASKS[props.type])

// O erro só aparece depois que a pessoa sai do campo, não a cada tecla.
const touched = ref(false)
const error = computed(() => (touched.value ? validateField(props.type, model.value) : null))

const SIGNIFICANT = /[0-9A-Za-z]/

function onMaskedInput(event: Event) {
  const input = event.target as HTMLInputElement
  const current = mask.value!
  const caret = input.selectionStart ?? input.value.length
  // Quantos caracteres de verdade (sem pontuação) havia antes do cursor.
  const before = [...input.value.slice(0, caret)].filter((c) => SIGNIFICANT.test(c)).length

  const formatted = current.format(input.value)
  input.value = formatted
  model.value = formatted

  let position = formatted.length
  if (!current.caretAtEnd) {
    let seen = 0
    position = 0
    while (position < formatted.length && seen < before) {
      if (SIGNIFICANT.test(formatted[position])) seen++
      position++
    }
  }
  input.setSelectionRange(position, position)
}

/** Nome sai em maiúsculas enquanto digita, sem jogar o cursor para o fim. */
function onUppercaseInput(event: Event) {
  // Acento com tecla morta ainda está sendo composto; mexer agora quebra a composição.
  if ((event as InputEvent).isComposing) return
  const input = event.target as HTMLInputElement
  const { selectionStart, selectionEnd } = input
  const upper = input.value.toLocaleUpperCase('pt-BR')
  if (upper !== input.value) {
    input.value = upper
    input.setSelectionRange(selectionStart, selectionEnd)
  }
  model.value = upper
}

function onDateInput(event: Event) {
  model.value = brFromIso((event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="field-input">
    <input
      v-if="mask"
      v-bind="$attrs"
      :value="model"
      :inputmode="mask.inputmode"
      :placeholder="mask.placeholder"
      autocomplete="off"
      @input="onMaskedInput"
      @blur="touched = true"
    />
    <input
      v-else-if="type === 'data'"
      v-bind="$attrs"
      type="date"
      :value="isoFromBr(model)"
      @input="onDateInput"
      @blur="touched = true"
    />
    <input
      v-else-if="type === 'email'"
      v-bind="$attrs"
      v-model.trim="model"
      type="email"
      inputmode="email"
      placeholder="nome@exemplo.com"
      @blur="touched = true"
    />
    <input
      v-else-if="type === 'nome'"
      v-bind="$attrs"
      :value="model"
      autocapitalize="characters"
      @input="onUppercaseInput"
      @compositionend="onUppercaseInput"
      @blur="touched = true"
    />
    <input v-else v-bind="$attrs" v-model="model" @blur="touched = true" />

    <p v-if="error" class="hint field-error">{{ error }}</p>
  </div>
</template>
