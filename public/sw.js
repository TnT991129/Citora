// Service worker de Citora.
// - Las páginas se piden siempre a la red (así cada cambio publicado se ve al momento);
//   sin conexión se muestra la última versión guardada.
// - Los archivos de /assets/ llevan su huella en el nombre: se guardan y se reutilizan.
// - Nunca se guarda nada de Supabase (datos y fotos van siempre a la red).
const CACHE = 'citora-v3'
const scope = new URL(self.registration.scope)
const SHELL = scope.pathname // ej. "/citora/"

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(SHELL)).catch(() => {}))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(SHELL, copy))
            return res
          }
          // GitHub Pages responde 404 en las páginas de la app (/crear, /barberia-leo...), pero con la app
          // recién publicada (404.html = index.html): se usa esa, como 200, y se guarda para sin conexión.
          // (Antes se usaba la guardada, y quien entraba directo a esas páginas veía una versión vieja.)
          if (res.status === 404) {
            return res.text().then((html) => {
              const page = new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
              caches.open(CACHE).then((c) => c.put(SHELL, page.clone()))
              return page
            })
          }
          return res
        })
        .catch(() => caches.match(SHELL).then((r) => r || Response.error())),
    )
    return
  }

  if (url.pathname.startsWith(`${SHELL}assets/`)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})

// Notificaciones push (ver supabase/functions/notify-push)
self.addEventListener('push', (event) => {
  let data = { title: 'Citora', body: '' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    /* si no viene JSON, se muestra el título por defecto */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: `${SHELL}favicon.svg`,
      badge: `${SHELL}favicon.svg`,
      data: { url: SHELL },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || SHELL
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      const existing = list.find((c) => c.url.includes(url))
      if (existing) return existing.focus()
      return clients.openWindow(url)
    }),
  )
})
