import { createApp } from 'vue'
import App from './App.vue'
import SetupView from './views/SetupView.vue'
import router from './router'
import { isConfigured } from './lib/supabase'
import './style.css'

if (isConfigured) {
  createApp(App).use(router).mount('#app')
} else {
  createApp(SetupView).mount('#app')
}
