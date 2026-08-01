/* ==========================================================
   聼说的缝纫工作台 — Service Worker
   离线缓存核心资源，实现 APP 秒开 + 离线可用
   策略：stale-while-revalidate（返回缓存的同时后台更新）
   ========================================================== */

const CACHE_NAME = 'sewing-workbench-v18';
const CORE_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './cat-icon.svg',
  './cat-icon-192.png',
  './cat-icon-180.png',
  './cat-icon-512.png',
  './cat-icon-maskable-512.png'
];

/* ---------- 安装：预缓存核心资源 ---------- */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        CORE_ASSETS.map((url) => cache.add(url))
      );
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

/* ---------- 激活：清理旧缓存 ---------- */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

/* ---------- 拦截请求 ---------- */
self.addEventListener('fetch', (event) => {
  const req = event.request;

  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 导航请求（页面跳转）：网络优先，失败回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静态资源：stale-while-revalidate
  // 先返回缓存（秒开），同时后台拉取最新版本更新缓存
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchPromise = fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached);

      // 有缓存就先返回缓存，否则等网络结果
      return cached || fetchPromise;
    })
  );
});

/* ---------- 消息：收到更新提示时立即激活 ---------- */
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
