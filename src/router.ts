import { createRouter, createWebHistory } from 'vue-router'
import { isRecoveringPassword, supabase } from './lib/supabase'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/novo-contrato' },
    { path: '/login', component: () => import('./views/LoginView.vue'), meta: { public: true } },
    {
      path: '/redefinir-senha',
      component: () => import('./views/ResetPasswordView.vue'),
      meta: { public: true },
    },
    { path: '/novo-contrato', component: () => import('./views/NewContractView.vue') },
    { path: '/contratos', component: () => import('./views/ContractsView.vue') },
    { path: '/modelos', component: () => import('./views/TemplatesView.vue') },
    { path: '/modelos/:id', component: () => import('./views/TemplateEditView.vue') },
  ],
})

router.beforeEach(async (to) => {
  const { data } = await supabase.auth.getSession()

  // Veio pelo link de recuperação: a sessão já existe, mas a senha ainda não foi trocada.
  if (data.session && isRecoveringPassword() && to.path !== '/redefinir-senha') {
    return '/redefinir-senha'
  }

  // Quem já está conectado não precisa ver o login de novo.
  if (to.path === '/login') return data.session ? '/' : true
  if (to.meta.public) return true
  return data.session ? true : '/login'
})

export default router
