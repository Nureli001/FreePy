const SHELL = "pyide-shell-v20";          // tətbiq faylları (hər yeniləmədə dəyişə bilər)
const PYO = "pyide-pyodide-0.26.4";       // Python faylları (yeniləmələrdə SİLİNMİR)
const PYO_BASE = "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/";
const PYO_FILES = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    // hər fayl ayrıca: biri alınmasa belə quraşdırma uğursuz olmasın
    await Promise.allSettled(CORE.map(u => shell.add(new Request(u, { cache: "reload" }))));
    const pyo = await caches.open(PYO);
    await Promise.allSettled(PYO_FILES.map(async f => {
      const url = PYO_BASE + f;
      if (await pyo.match(url)) return;
      const old = await caches.match(url);      // köhnə keşdən köçür (internet lazım deyil)
      if (old) await pyo.put(url, old);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== PYO).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);

  // Öz fayllarımız: əvvəl internet (ən yeni), olmasa keş
  if (url.origin === location.origin) {
    e.respondWith(
      Promise.race([
        fetch(e.request, { cache: "no-cache" }),
        new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000))
      ]).then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(SHELL).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(async () =>
        (await caches.match(e.request, { ignoreSearch: true })) || (await caches.match("./index.html"))
      )
    );
    return;
  }

  // Python (CDN) faylları: əvvəl keş, sonra internet
  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res && (res.ok || res.type === "opaque") && e.request.url.startsWith(PYO_BASE)) {
          const copy = res.clone();
          caches.open(PYO).then(c => c.put(e.request, copy));
        }
        return res;
      });
    })
  );
});
