// ============================================================
// sw.js — 앱 셸 캐시(오프라인 지원)
// 전략:
//   · HTML 문서   → network-first (배포 즉시 반영, 오프라인이면 캐시)
//   · 동일 출처 정적 → stale-while-revalidate (즉시 표시 + 백그라운드 갱신)
//   · 폰트 CDN     → cache-first (사내망 차단·오프라인에서도 글꼴 유지)
// CACHE 이름의 버전은 index.html 의 ?v=NN 과 함께 올린다.
// ============================================================
const CACHE = 'pm-hub-v27';

// 상대 경로로 등록 — /pm-hub/ 같은 하위 경로 배포에서도 동작한다
const SHELL = [
  './',
  './index.html',
  './css/base.css?v=27',
  './css/beginner.css?v=27',
  './css/tools.css?v=27',
  './css/mix-studio.css?v=27',
  './js/tools/mix-engine.js?v=27',
  './js/tools/mix-workbook.js?v=27',
  './js/tools/mix-studio.js?v=27',
  './js/vendor/exceljs.min.js?v=27',
  './js/curriculum.js?v=27',
  './js/data/mediamix-data.js?v=27',
  './js/tools/kpi.js?v=27',
  './js/tools/utm.js?v=27',
  './js/tools/budget.js?v=27',
  './js/tools/report.js?v=27',
  './js/tools/diagnose.js?v=27',
  './js/tools/abtest.js?v=27',
  './js/tools/bid.js?v=27',
  './js/tools/pacing.js?v=27',
  './js/tools/mediamix.js?v=27',
  './js/tools/utm-learn.js?v=27',
  './js/app.js?v=27',
  './assets/icon-192.png',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 한 파일이 실패해도 설치 전체가 깨지지 않도록 개별 처리
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pm-hub-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 1) HTML 문서 — 최신 우선, 오프라인이면 캐시
  //    GitHub Pages 는 HTML 에 Cache-Control: max-age=600 을 붙인다. 그냥 fetch 하면
  //    브라우저 HTTP 캐시가 최대 10분 지난 문서를 돌려줘서 network-first 가 무의미해진다.
  //    cache:'reload' 로 HTTP 캐시를 건너뛰고 항상 원본을 받는다.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    e.respondWith(
      fetch(new Request(req.url, { cache: 'reload', credentials: 'same-origin' }))
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // 2) 동일 출처 정적 — 캐시 즉시 반환 + 백그라운드 갱신
  if (sameOrigin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        const net = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // 3) 외부(폰트 CDN) — 캐시 우선. 사내망 차단·오프라인에서도 한 번 받은 글꼴은 유지된다
  e.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      if (res && (res.status === 200 || res.type === 'opaque')) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => cached))
  );
});
