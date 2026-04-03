const { configure } = require('quasar/wrappers');

module.exports = configure(function (ctx) {
  return {
    boot: ['axios'],
    
    css: ['app.css'],
    
    extras: [
      'material-icons',
      'material-icons-outlined',
      'material-icons-round',
      'material-icons-sharp'
    ],
    
    build: {
      target: {
        browser: ['es2019', 'edge88', 'firefox78', 'chrome87', 'safari13.1'],
        node: 'node18'
      },
      
      vueRouterMode: 'hash',
      vitePlugins: [
        ['@vitejs/plugin-vue', {}]
      ],
      
      extendViteConf(viteConf) {
        viteConf.css = viteConf.css || {};
        viteConf.css.postcss = {
          plugins: [
            require('tailwindcss'),
            require('autoprefixer')
          ]
        };
      }
    },
    
    devServer: {
      open: false,
      port: 9000,
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true
        }
      }
    },
    
    framework: {
      config: {},
      plugins: ['Dialog', 'Notify', 'Loading']
    },
    
    animations: [],
    
    ssr: {
      pwa: false,
      prodPort: 3000,
      middlewares: [ctx.prod ? 'compression' : '', 'render']
    },
    
    pwa: {
      workboxMode: 'generateSW',
      injectPwaMetaTags: true,
      swFilename: 'sw.js',
      manifestFilename: 'manifest.json',
      useCredentialsForManifestTag: false
    },
    
    cordova: {},
    capacitor: {},
    electron: {},
    
    bex: {
      contentScripts: ['my-content-script']
    }
  }
});
