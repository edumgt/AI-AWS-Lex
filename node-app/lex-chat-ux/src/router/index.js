import { createRouter, createWebHashHistory } from 'vue-router';
import HomePage from '../pages/HomePage.vue';
import TuringPage from '../pages/TuringPage.vue';

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage
  },
  {
    path: '/turing',
    name: 'turing',
    component: TuringPage
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

export default router;
