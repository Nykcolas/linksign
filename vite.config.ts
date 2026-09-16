import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  // As telas são carregadas sob demanda, então o Vite só descobriria estas
  // dependências ao abrir o editor ou gerar um contrato — e refaria o cache no
  // meio da navegação ("504 Outdated Optimize Dep"). Declaradas aqui, entram na partida.
  optimizeDeps: {
    include: [
      '@tiptap/core',
      '@tiptap/vue-3',
      '@tiptap/starter-kit',
      '@tiptap/extension-text-align',
      'dompurify',
      'jspdf',
      'marked',
    ],
  },
})
