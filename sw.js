const VERSAO = '1.20.0';
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
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(nomes => Promise.all(nomes.filter(n => n !== VERSAO).map(n => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const copia = resp.clone();
        caches.open(VERSAO).then(c => c.put(e.request, copia));
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
