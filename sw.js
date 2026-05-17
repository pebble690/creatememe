// sw.js — мини service worker, нужен только для одного: отдать сгенерированный
// blob по same-origin URL с заголовком Content-Disposition: attachment.
// Это единственный pure-JS способ заставить Android-WebView Telegram реально
// сохранить файл — DownloadManager не умеет резолвить blob: URL, но обычные
// HTTP-ответы с attachment-заголовком перехватывает корректно.

const downloads = new Map();

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'cache-download') return;
  downloads.set(data.id, { blob: data.blob, fileName: data.fileName });
  // Чистим через 5 минут, чтобы не копить мусор в памяти SW
  setTimeout(() => downloads.delete(data.id), 5 * 60 * 1000);
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(/\/_dl\/([^/]+)\/[^/]+$/);
  if (!match) return;

  const id = match[1];
  const entry = downloads.get(id);
  if (!entry) {
    event.respondWith(new Response('Not found', { status: 404 }));
    return;
  }

  // Одноразовая ссылка — после первого ответа удаляем blob
  downloads.delete(id);

  event.respondWith(new Response(entry.blob, {
    headers: {
      'Content-Type': entry.blob.type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${entry.fileName}"`,
      'Cache-Control': 'no-store',
    },
  }));
});
