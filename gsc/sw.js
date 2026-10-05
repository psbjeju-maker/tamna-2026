/* 굿스마일 행사장 화면 — 한 번 열면 오프라인에서도 계속 돈다. 상품을 바꾸면 CACHE 번호를 올릴 것 */
var CACHE = "gsc-v5";
var FILES = ["./", "index.html", "items.js", "qr.js", "../fonts/SCDream4.woff", "../fonts/SCDream5.woff", "../fonts/SCDream7.woff", "../assets/brand/logo.png", "assets/showcase/corner_lines.svg", "assets/showcase/divider.svg", "assets/showcase/floor_reflection.svg", "assets/showcase/grid_frame.svg", "assets/showcase/light_streak_01.svg", "assets/showcase/particle_dots.svg", "assets/showcase/qr_frame.svg", "assets/showcase/reservation_badge.svg", "assets/showcase/showcase_halo.svg", "assets/showcase/showcase_platform.svg", "assets/showcase/sparkle.svg", "img/4533564064981_0.webp", "img/4545784044193_0.webp", "img/4545784044209_0.webp", "img/4570001514647_0.webp", "img/4570001514746_0.webp", "img/4570232580510_0.webp", "img/4570232581906_0.webp", "img/4570232581937_0.webp", "img/4570232581968_0.webp", "img/4570232581975_0.webp", "img/4570232582743_0.webp", "img/4571623514176_0.webp", "img/4571623514183_0.webp", "img/4571697187627_0.webp", "img/4571697189294_0.webp", "img/4580590197701_0.webp", "img/4580590197718_0.webp", "img/4580590197725_0.webp", "img/4580590197732_0.webp", "img/4580590199064_0.webp", "img/4580590199071_0.webp", "img/4580590199088_0.webp", "img/4580590199095_0.webp", "img/4580678968872_0.webp", "img/4580678969015_0.webp", "img/4580787174133_0.webp", "img/4580828660854_0.webp", "img/4580828663398_0.webp", "img/4580828663404_0.webp", "img/4580828663817_0.webp", "img/4580828665484_0.webp", "img/4580828669635_0.webp", "img/4580828670471_0.webp", "img/4580828673250_0.webp", "img/4580828673595_0.webp", "img/4580828673748_0.webp", "img/4580828673755_0.webp", "img/4580828675667_0.webp", "img/4580828675759_0.webp", "img/4580828675780_0.webp", "img/4580828675896_0.webp", "img/4580828676206_0.webp", "img/4580828676428_0.webp", "img/4580828676435_0.webp", "img/4580828676602_0.webp", "img/4580828676671_0.webp", "img/4580828676688_0.webp", "img/4580828677104_0.webp", "img/4580828677173_0.webp", "img/4580828677180_0.webp", "img/4580828677197_0.webp", "img/4580828677203_0.webp", "img/4580828678255_0.webp", "img/4580828679146_0.webp", "img/4580828679597_0.webp"];
self.addEventListener("install", function (e) { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILES); })); });
self.addEventListener("activate", function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf("gsc-") === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
/* 화면 코드(html·js)는 인터넷 먼저 → 고친 게 바로 반영. 끊기면 저장본. 사진·폰트는 저장본 먼저 */
self.addEventListener("fetch", function (e) {
  var u = new URL(e.request.url), fresh = e.request.mode === "navigate" || /\.(html|js)$/.test(u.pathname) || u.pathname.slice(-1) === "/";
  if (e.request.method !== "GET") return;
  if (fresh) {
    e.respondWith(fetch(e.request).then(function (r) {
      if (r && r.ok) { var c = r.clone(); caches.open(CACHE).then(function (k) { k.put(e.request, c); }); }
      return r;
    }).catch(function () { return caches.match(e.request, { ignoreSearch: true }); }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
