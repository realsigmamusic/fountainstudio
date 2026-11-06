const VERSAO = '1.21.1';
const ARQUIVOS = [
  './',
  'css/app.css',
  'css/preview.css',
  'fonts/courier-prime-bold-italic.ttf',
  'fonts/courier-prime-bold.ttf',
  'fonts/courier-prime-italic.ttf',
  'fonts/courier-prime.ttf',
  'icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'index.html',
  'js/core/config.js',
  'js/core/fonts.js',
  'js/core/helpers.js',
  'js/core/liner.js',
  'js/core/parser.js',
  'js/core/pdf.js',
  'js/core/pdfmaker.js',
  'js/core/print.js',
  'js/core/token.js',
  'js/core/utils.js',
  'js/core/layout.js',
  'js/core/production.js',
  'js/editor.js',
  'js/main.js',
  'js/pdf-export.js',
  'js/production-ui.js',
  'js/production-pdf.js',
  'js/theatre-pdf.js',
  'js/storage.js',
  'js/vendor/codemirror.js',
  'js/vendor/he.js',
  'js/vendor/pdfkit.standalone.js',
  'js/vendor/textbox/dataRearanger.js',
  'js/vendor/textbox/fontHandler.js',
  'js/vendor/textbox/lineWrapper.js',
  'js/vendor/textbox/pdfTextbox.js',
  'js/vendor/textbox/textMeasurement.js',
  'js/vendor/pdfjs/pdf.min.mjs',
  'js/vendor/pdfjs/pdf.worker.min.mjs',
  'manifest.webmanifest',
  'noisetexture.png'
];

self.addEventListener('install', e => {
  // cache:'reload' ignora o cache HTTP do navegador: a versão nova é baixada inteira e sem misturar arquivos velhos
  e.waitUntil(
    caches.open(VERSAO)
      .then(c => c.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/*
 * Cache primeiro, atualização em segundo plano.
 * Antes era "rede primeiro": sem internet mas com Wi-Fi/dados ligados a conexão fica pendurada e o app
 * esperava a rede desistir antes de usar o cache (o PDF, que baixa pdfkit e fontes na hora, parecia quebrado).
 * Agora o que já está guardado responde na hora, offline ou não; a cópia nova é baixada por trás e vale na próxima abertura.
 */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    let guardado = await cache.match(req, { ignoreSearch: true });
    if (!guardado && req.mode === 'navigate') guardado = await cache.match('./');
    const atualiza = fetch(req).then(resp => {
      if (resp.ok && resp.type === 'basic') cache.put(req, resp.clone());
      return resp;
    });
    if (guardado) { e.waitUntil(atualiza.catch(() => {})); return guardado; }
    return atualiza; // ainda não está no cache: só a rede pode responder
  })());
});
