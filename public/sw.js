const CACHE_NAME = "eat-simple-v1"

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(() => {
      return self.skipWaiting()
    })
  )
})

self.addEventListener("fetch", (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => response)
      .catch(() => caches.match(event.request).then((cached) => cached || new Response("", { status: 404, statusText: "Offline" })))
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    }).then(() => self.clients.claim())
  )
})
