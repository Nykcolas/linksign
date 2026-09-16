import { Node, mergeAttributes } from '@tiptap/core'

/**
 * Etiqueta de variável no editor.
 *
 * No HTML salvo: `<span data-variable="cpf" data-label="CPF">{{cpf}}</span>`.
 * Na tela: só o nome do campo, como um bloco que se apaga inteiro.
 */
export const VariableNode = Node.create({
  name: 'variable',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      key: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-variable') ?? '',
        renderHTML: (attrs) => ({ 'data-variable': attrs.key }),
      },
      label: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-label') ?? '',
        renderHTML: (attrs) => ({ 'data-label': attrs.label }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-variable]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes), `{{${node.attrs.key}}}`]
  },

  renderText({ node }) {
    return `{{${node.attrs.key}}}`
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span')
      dom.className = 'variable-chip'
      dom.textContent = node.attrs.label || node.attrs.key
      return { dom }
    }
  },
})
