import { createApp } from 'vue';
import { Quasar, Notify, Dialog, Loading } from 'quasar';

// Import icon libraries
import '@quasar/extras/material-icons/material-icons.css';
import '@quasar/extras/material-icons-outlined/material-icons-outlined.css';

// Import Quasar css
import 'quasar/dist/quasar.css';

// Import Tailwind CSS
import './css/app.css';

import App from './App.vue';
import router from './router';
import { pinia } from './stores/pinia';

const app = createApp(App);

app.use(Quasar, {
  plugins: {
    Notify,
    Dialog,
    Loading
  },
  config: {
    notify: {},
    loading: {}
  }
});

app.use(pinia);
app.use(router);

app.mount('#q-app');
