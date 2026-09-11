import { createRouter, createWebHistory } from 'vue-router'
import { supabase } from './lib/supabase'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/novo-contrato' },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    { path: '/novo-contrato', component: () => import('./views/NewContractView.vue') },
    { path: '/contratos', component: () => import('./views/ContractsView.vue') },
    { path: '/modelos', component: () => import('./views/TemplatesView.vue') },
    { path: '/modelos/:id', component: () => import('./views/TemplateEditView.vue') },
  ],
})

router.beforeEach(async (to) => {
  if (to.meta.public) return true

  const { data } = await supabase.auth.getSession()
  return data.session ? true : '/login'
})

export default router
