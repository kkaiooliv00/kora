import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

// O xterm mede a largura do caractere ao abrir: a fonte mono precisa estar carregada antes.
const FONTS = ['400 13px "JetBrains Mono"', '600 13px "JetBrains Mono"', '400 14px "IBM Plex Sans"']

// `npm run dev` aberto no navegador (sem Tauri): backend simulado para revisar o visual.
const mocks =
  import.meta.env.DEV && !('__TAURI_INTERNALS__' in window && 'invoke' in (window.__TAURI_INTERNALS__ as object))
    ? import('./dev/mock').then((m) => m.installMocks())
    : Promise.resolve()

Promise.all([mocks, ...FONTS.map((font) => document.fonts.load(font))])
  .catch(() => undefined) // sem a fonte, segue com a do sistema
  .then(() => mount(App, { target: document.getElementById('app')! }))
