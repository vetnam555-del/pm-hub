// ============================================================
// app.js — 통합 허브 라우터 + 플랫폼
// 해시 라우팅 · 도구 지연 렌더 · 전역 검색(Ctrl+K) · 상태 저장 · 접근성
// (커리큘럼/참고 데이터·렌더러는 curriculum.js, 각 도구는 js/tools/*.js)
// ============================================================

// 한 번만 렌더하는(=입력 보존) 페이지 추적
const _rendered = new Set();

// 페이지 id → 렌더 함수 (존재할 때만 1회 호출)
const _renderers = {
  'tool-kpi':      () => window.renderKpiTool && renderKpiTool(),
  'tool-utm':      () => window.renderUtmTool && renderUtmTool(),
  'tool-budget':   () => window.renderBudgetTool && renderBudgetTool(),
  'tool-report':   () => window.renderReportTool && renderReportTool(),
  'tool-diagnose': () => window.renderDiagnoseTool && renderDiagnoseTool(),
  'tool-abtest':   () => window.renderAbTestTool && renderAbTestTool(),
  'tool-bid':      () => window.renderBidTool && renderBidTool(),
  'tool-pacing':   () => window.renderPacingTool && renderPacingTool(),
  'utm-learn':     () => window.renderUtmLearn && renderUtmLearn(),
  'benchmark':     () => window.renderBenchmark && renderBenchmark(),
  'naming':        () => window.renderNaming && renderNaming(),
  'sources':       () => window.renderSources && renderSources(),
};

// 모바일 상단바·검색에 쓰는 페이지 제목
const PAGE_TITLES = {
  'home': '🏠 홈 대시보드',
  'tool-kpi': '📊 KPI 계산기', 'tool-utm': '🔗 UTM 빌더', 'tool-budget': '💰 손익분기·예산',
  'tool-report': '📝 주간 리포트', 'tool-diagnose': '🩺 트러블슈팅 진단', 'tool-abtest': '🧪 A/B 유의성',
  'tool-bid': '📈 적정 입찰가', 'tool-pacing': '⏱️ 예산 페이싱',
  'utm-learn': '🎯 UTM 완전정복', 'media': '📡 매체 가이드', 'glossary': '📖 광고 용어 사전',
  'specs': '📐 소재 규격표', 'faq': '❓ 자주 묻는 질문', 'benchmark': '📊 매체 벤치마크', 'naming': '🏷️ 네이밍 규칙',
  'sources': '📰 인사이트 소스',
};

const VALID_PAGES = new Set(Object.keys(PAGE_TITLES).concat(
  ['week1','week2','week3','week4','week5','week6','week7','week8','week9','week10','week11','week12']
));

// ─── 라우팅 ───
function applyPage(id) {
  if (!VALID_PAGES.has(id)) {
    id = 'home';
    // 잘못된 해시는 #home 으로 정규화(주소창·시각 상태 불일치 방지)
    if (location.hash && location.hash !== '#home') { try { history.replaceState(null, '', location.pathname + location.search); } catch (_) {} }
  }
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (page) page.classList.add('active');

  // 네비 활성 + aria-current
  document.querySelectorAll('.nav-item').forEach(n => { n.classList.remove('active'); n.removeAttribute('aria-current'); });
  const navBtn = document.querySelector('.nav-item[data-page="' + id + '"]');
  if (navBtn) {
    navBtn.classList.add('active');
    navBtn.setAttribute('aria-current', 'page');
    // 접힌 아코디언 안에 있으면 펼치기
    const acc = navBtn.closest('.nav-accordion');
    if (acc) acc.classList.add('open');
  }

  // 주차는 매번 렌더(진도 복원 포함), 그 외는 1회만
  if (id.indexOf('week') === 0) {
    if (typeof renderWeekPage === 'function') renderWeekPage(id);
  } else if (_renderers[id] && !_rendered.has(id)) {
    _renderers[id]();
    _rendered.add(id);
  }

  // 모바일 상단바 제목
  const mt = document.getElementById('mtTitle');
  if (mt) mt.textContent = PAGE_TITLES[id] || (typeof weekMeta === 'object' && weekMeta[id] ? '📘 ' + weekMeta[id].title : '🚀 PM 실무 허브');

  // 즉시 상단 이동(부드러운 스크롤 방지)
  const root = document.documentElement;
  const prev = root.style.scrollBehavior;
  root.style.scrollBehavior = 'auto';
  window.scrollTo(0, 0);
  root.style.scrollBehavior = prev;

  // 접근성: 카드 키보드 조작 활성화 + 본문 포커스 이동
  if (page) a11yEnhance(page);
  const main = document.querySelector('main');
  if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }

  // 홈 복귀 시 질문 검색창 초기화 + 다음 학습 갱신
  if (id === 'home') { resetHomeSearch(); renderNextUp(); }

  closeSidebar();
}

// onclick 진입점 — 해시를 갱신하면 hashchange가 applyPage를 호출
function showPage(id, btn) {
  const cur = location.hash.replace(/^#/, '');
  if (cur === id) { applyPage(id); }   // 같은 해시 재클릭 → 직접 적용
  else { location.hash = id; }          // 다르면 해시 변경 → hashchange가 applyPage 호출
}

window.addEventListener('hashchange', () => {
  const id = location.hash.replace(/^#/, '') || 'home';
  applyPage(id);
});

// 초기 로드: 해시 있으면 해당 페이지로
function initRouting() {
  const id = location.hash.replace(/^#/, '');
  if (id && VALID_PAGES.has(id)) applyPage(id);
}

// ─── 모바일 사이드바 ───
function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebarScrim');
  const open = sb.classList.toggle('open');
  if (scrim) scrim.classList.toggle('open', open);
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const scrim = document.getElementById('sidebarScrim');
  if (sb) sb.classList.remove('open');
  if (scrim) scrim.classList.remove('open');
}

// ─── 접근성: 클릭형 카드(div)를 키보드로 조작 가능하게 ───
function a11yEnhance(root) {
  root = root || document;
  root.querySelectorAll('.week-card[onclick], .day-item[onclick]').forEach(el => {
    if (el.tagName === 'BUTTON') return;
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
  });
}

// ─── 용어 툴팁 위치 보정 ───
// .gloss-pop은 position:fixed라 모달/카드의 overflow를 탈출함. 트리거 기준으로
// 좌표를 계산해 뷰포트 안으로 클램프하고, 위 공간이 없으면 아래로 뒤집는다.
(function () {
  let active = null; // 현재 열린(호버/포커스) 트리거 — 스크롤·리사이즈 재배치용
  let raf = 0;
  // 트리거의 '실제 용어 텍스트' 사각형을 구한다.
  // .tip-trigger가 flex 컨테이너(예: 팁 목록 li) 안에 있으면 flex 아이템으로
  // 블록화·세로 stretch 되어 박스가 글자보다 훨씬 커진다(예: 20px 글자가 100px 박스).
  // 그 박스(top) 기준으로 올리면 툴팁이 글자보다 한참 위에 뜬다 → Range로 글자 첫 줄만 측정.
  function triggerRect(trigger) {
    try {
      const range = document.createRange();
      range.setStart(trigger, 0);
      range.setEnd(trigger, 1); // 첫 자식(용어 텍스트 노드)만 — .gloss-pop 자식 제외
      const rects = range.getClientRects();
      if (rects && rects.length) return rects[0]; // 여러 줄이면 첫 줄 기준
      const rb = range.getBoundingClientRect();
      if (rb && (rb.width || rb.height)) return rb;
    } catch (e) { /* 폴백 */ }
    return trigger.getBoundingClientRect();
  }
  function positionGlossPop(trigger) {
    const pop = trigger.querySelector(':scope > .gloss-pop'); // 직계 말풍선만(중첩 방지)
    if (!pop) return;
    pop.classList.remove('below');
    // 컨테이닝 블록 보정: 모달 오버레이의 backdrop-filter(또는 조상의 transform/filter)는
    // position:fixed의 기준을 뷰포트가 아니라 그 조상으로 바꾼다. 그래서 left/top=0이
    // 실제로 어느 뷰포트 좌표에 놓이는지(origin) 측정해, 뷰포트 목표좌표에서 빼서 적용한다.
    pop.style.left = '0px';
    pop.style.top = '0px';
    const origin = pop.getBoundingClientRect(); // (0,0)이 매핑되는 뷰포트 좌표 + 말풍선 크기
    const popW = origin.width;
    const popH = origin.height;
    const tr = triggerRect(trigger);   // 실제 용어 글자 사각형(뷰포트 기준)
    const M = 10; // 뷰포트 여백
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    // 가로: 글자 중앙 정렬 후 좌우 경계로 클램프 (뷰포트 좌표)
    let vx = tr.left + tr.width / 2 - popW / 2;
    vx = Math.max(M, Math.min(vx, vw - popW - M));
    // 세로: 기본은 글자 위, 공간 부족하면 아래로 flip (뷰포트 좌표)
    let vy = tr.top - popH - 8;
    let below = false;
    if (vy < M) { vy = tr.bottom + 8; below = true; }
    if (below && vy + popH > vh - M) vy = Math.max(M, vh - popH - M);
    // 뷰포트 목표좌표 → 컨테이닝 블록 로컬좌표로 변환해 적용
    pop.style.left = Math.round(vx - origin.left) + 'px';
    pop.style.top = Math.round(vy - origin.top) + 'px';
    if (below) pop.classList.add('below');
    // 화살표: 글자 중앙을 가리키되 말풍선 안으로 클램프
    let arrow = (tr.left + tr.width / 2) - vx;
    arrow = Math.max(12, Math.min(arrow, popW - 12));
    pop.style.setProperty('--arrow-left', Math.round(arrow) + 'px');
  }
  function onEnter(e) {
    const t = e.target && e.target.closest && e.target.closest('.tip-trigger');
    if (!t || t === active) return; // 같은 트리거 반복 mouseover는 스킵(리플로우 방지)
    active = t;
    positionGlossPop(t);
  }
  function onLeave(e) {
    const t = e.target && e.target.closest && e.target.closest('.tip-trigger');
    if (t && t === active) active = null;
  }
  document.addEventListener('mouseover', onEnter, true);
  document.addEventListener('focusin', onEnter, true);
  document.addEventListener('mouseout', onLeave, true);
  document.addEventListener('focusout', onLeave, true);
  // 터치 기기 지원: hover가 없으므로 탭하면 툴팁을 핀(.tip-open). 다른 곳 탭하면 닫힘
  document.addEventListener('click', function (e) {
    const t = e.target && e.target.closest && e.target.closest('.tip-trigger');
    document.querySelectorAll('.tip-trigger.tip-open').forEach(el => { if (el !== t) el.classList.remove('tip-open'); });
    if (!t) return;
    if (t.classList.toggle('tip-open')) { active = t; positionGlossPop(t); }
    else if (active === t) active = null;
  });
  // 모달 본문 스크롤·창 크기 변경 시, 열린 툴팁만 rAF로 1회 재배치
  function reposition() {
    raf = 0;
    if (active && document.contains(active)) positionGlossPop(active);
    else active = null;
  }
  function schedule() {
    if (!active) return; // 열린 툴팁 없으면 즉시 종료(전역 질의 안 함)
    if (!raf) raf = requestAnimationFrame(reposition);
  }
  window.addEventListener('resize', schedule);
  document.addEventListener('scroll', schedule, { passive: true, capture: true });
})();

// ─── 사이드바 학습 아코디언 ───
function toggleAccordion(headerEl) {
  const acc = headerEl.closest('.nav-accordion');
  if (acc) {
    const open = acc.classList.toggle('open');
    headerEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
}

// ─── 공용: HTML 이스케이프 (XSS/마크업 깨짐 방지) ───
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── 공용: 도구 입력 상태 저장/복원 (localStorage) ───
function saveToolState(key, obj) {
  try { localStorage.setItem('pm_' + key, JSON.stringify(obj)); } catch (_) {}
}
function loadToolState(key) {
  try { const v = localStorage.getItem('pm_' + key); return v ? JSON.parse(v) : null; } catch (_) { return null; }
}
function clearToolState(key) {
  try { localStorage.removeItem('pm_' + key); } catch (_) {}
}

// ─── 공용: 클립보드 복사 (성공/실패 정확 피드백) ───
function copyToClipboard(text, btnEl) {
  const flash = (ok) => {
    if (!btnEl) return;
    const orig = btnEl.dataset._orig || btnEl.innerHTML;
    btnEl.dataset._orig = orig;
    btnEl.classList.toggle('copied', ok);
    btnEl.innerHTML = ok ? '✓ 복사됨' : '⚠ 복사 실패 — 직접 선택';
    setTimeout(() => { btnEl.classList.remove('copied'); btnEl.innerHTML = orig; delete btnEl.dataset._orig; }, 1800);
  };
  if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => flash(true)).catch(() => flash(fallbackCopy(text)));
  } else {
    flash(fallbackCopy(text));
  }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.top = '-9999px';
  document.body.appendChild(ta); ta.focus(); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  document.body.removeChild(ta);
  return ok;
}

// ─── 공용: 숫자 포맷 ───
function fmtInt(n) { if (n == null || isNaN(n) || !isFinite(n)) return '–'; return Math.round(n).toLocaleString('ko-KR'); }
function fmtWon(n) { if (n == null || isNaN(n) || !isFinite(n)) return '–'; return '₩' + Math.round(n).toLocaleString('ko-KR'); }
function fmtPct(n, digits) { if (n == null || isNaN(n) || !isFinite(n)) return '–'; return n.toFixed(digits == null ? 2 : digits) + '%'; }
function fmtWonShort(n) {
  if (n == null || isNaN(n) || !isFinite(n)) return '–';
  const abs = Math.abs(n);
  if (abs >= 1e8) return (n / 1e8).toFixed(2).replace(/\.00$/, '') + '억';
  if (abs >= 1e4) return (n / 1e4).toFixed(1).replace(/\.0$/, '') + '만';
  return Math.round(n).toLocaleString('ko-KR');
}

// ─── 전역 검색 (Ctrl/⌘+K) ───
function buildSearchIndex() {
  const idx = [];
  // 도구·페이지
  Object.keys(PAGE_TITLES).forEach(id => {
    if (id === 'home') return;
    idx.push({ type: '도구/페이지', label: PAGE_TITLES[id].replace(/^[^\s]+\s/, ''), kw: PAGE_TITLES[id], go: () => showPage(id) });
  });
  // 주차
  if (typeof weekMeta === 'object') Object.keys(weekMeta).forEach(w => {
    const m = weekMeta[w];
    idx.push({ type: '커리큘럼', label: m.num + ' · ' + m.title, kw: m.title + ' ' + m.sub, go: () => showPage(w) });
  });
  // Day
  if (typeof dayData === 'object') Object.keys(dayData).forEach(d => {
    const v = dayData[d];
    idx.push({ type: 'Day', label: v.week + ' · ' + v.title, kw: v.title + ' ' + (v.tags || []).join(' '), go: () => { const wk = 'week' + Math.ceil(parseInt(d.replace('day', '')) / 5); showPage(wk); setTimeout(() => openModal(d), 60); } });
  });
  // 용어
  if (typeof glossaryData === 'object') glossaryData.forEach(g => {
    idx.push({ type: '용어', label: g.term + ' (' + g.en + ')', kw: g.term + ' ' + g.en + ' ' + g.desc, go: () => { showPage('glossary'); setTimeout(() => { const s = document.getElementById('glossarySearch'); if (s) { s.value = g.term; filterGlossary(); } }, 60); } });
  });
  // 매체
  if (typeof mediaData === 'object') mediaData.forEach(m => idx.push({ type: '매체', label: m.name, kw: m.name + ' ' + m.type + ' ' + (m.tags || []).join(' '), go: () => showPage('media') }));
  // 규격
  if (typeof specData === 'object') specData.forEach(s => idx.push({ type: '규격', label: s.name, kw: s.name + ' ' + s.tagline, go: () => showPage('specs') }));
  // FAQ
  if (typeof faqData === 'object') faqData.forEach((f, i) => idx.push({ type: 'FAQ', label: f.q, kw: f.q + ' ' + f.a, go: () => { showPage('faq'); setTimeout(() => { const el = document.getElementById('faq-' + i); if (el) { el.classList.add('open'); el.scrollIntoView({ block: 'center' }); } }, 60); } }));
  return idx;
}
let _searchIndex = null;
function openSearch() {
  let ov = document.getElementById('searchOverlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'searchOverlay'; ov.className = 'search-overlay';
    ov.innerHTML = '<div class="search-box" role="dialog" aria-label="전역 검색">' +
      '<input id="searchInput" class="search-input" type="text" placeholder="도구·용어·매체·커리큘럼 검색..." autocomplete="off">' +
      '<div id="searchResults" class="search-results"></div>' +
      '<div class="search-hint">↑↓ 이동 · Enter 열기 · Esc 닫기</div></div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov) closeSearch(); });
    ov.querySelector('#searchInput').addEventListener('input', runSearch);
    ov.querySelector('#searchInput').addEventListener('keydown', searchKeys);
  }
  _searchIndex = _searchIndex || buildSearchIndex();
  ov.classList.add('open');
  const inp = ov.querySelector('#searchInput');
  inp.value = ''; runSearch(); inp.focus();
}
function closeSearch() { const ov = document.getElementById('searchOverlay'); if (ov) ov.classList.remove('open'); }
let _searchSel = 0;
function runSearch() {
  const q = (document.getElementById('searchInput').value || '').trim().toLowerCase();
  const box = document.getElementById('searchResults');
  let items = _searchIndex;
  if (q) {
    const qNS = q.replace(/\s+/g, ''); // 공백 무시 매칭("학습상태"=="학습 상태")
    items = _searchIndex.filter(it => {
      const hay = (it.kw + ' ' + it.label).toLowerCase();
      return hay.indexOf(q) >= 0 || hay.replace(/\s+/g, '').indexOf(qNS) >= 0;
    });
  }
  items = items.slice(0, 24);
  _searchSel = 0;
  if (!items.length) { box.innerHTML = '<div class="search-empty">검색 결과가 없습니다</div>'; box._items = []; return; }
  box._items = items;
  box.innerHTML = items.map((it, i) =>
    '<button class="search-item' + (i === 0 ? ' sel' : '') + '" data-i="' + i + '"><span class="search-type">' + escapeHtml(it.type) + '</span><span class="search-label">' + escapeHtml(it.label) + '</span></button>'
  ).join('');
  [...box.querySelectorAll('.search-item')].forEach(b => b.addEventListener('click', () => { const it = box._items[+b.dataset.i]; closeSearch(); it.go(); }));
}
function searchKeys(e) {
  const box = document.getElementById('searchResults');
  const items = box._items || [];
  if (e.key === 'Escape') { closeSearch(); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); _searchSel = Math.min(_searchSel + 1, items.length - 1); paintSel(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); _searchSel = Math.max(_searchSel - 1, 0); paintSel(); }
  else if (e.key === 'Enter') { e.preventDefault(); if (items[_searchSel]) { closeSearch(); items[_searchSel].go(); } }
}
function paintSel() {
  const box = document.getElementById('searchResults');
  [...box.querySelectorAll('.search-item')].forEach((b, i) => b.classList.toggle('sel', i === _searchSel));
  const sel = box.querySelector('.search-item.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
}

// ─── 홈 질문형 검색창 (의도 파악 + 자료 점프) ───
// 자연어 질문의 의도를 키워드로 잡아 알맞은 도구/페이지로 안내
const SEARCH_INTENTS = [
  { kw:['급등','올랐','올라','떨어','하락','안나와','안 나와','미집계','집계','문제','왜','진단','이상','튀','폭등'], go:'tool-diagnose', label:'🩺 트러블슈팅 진단기 — 증상으로 원인·액션 찾기' },
  { kw:['계산','얼마','지표','roas','cpa','cpc','ctr','cvr','cpm','전환율','클릭률'], go:'tool-kpi', label:'📊 KPI 계산기 — 지표 자동 계산·역산' },
  { kw:['utm','링크','추적','파라미터','소스','source','medium'], go:'tool-utm', label:'🔗 UTM 빌더 — 추적 링크 생성' },
  { kw:['규격','사이즈','크기','소재','배너','픽셀','해상도','비율'], go:'specs', label:'📐 소재 규격표 — 매체별 이미지·영상 규격' },
  { kw:['예산','손익','마진','본전','분기','얼마 써','배분'], go:'tool-budget', label:'💰 손익분기·예산 시뮬레이터' },
  { kw:['리포트','보고','주간','보고서','대시보드'], go:'tool-report', label:'📝 주간 리포트 빌더' },
  { kw:['벤치마크','정상','평균','범위','기준','좋은','나쁜'], go:'benchmark', label:'📊 매체 벤치마크 — CTR·CVR 정상 범위' },
  { kw:['ab','a/b','유의','테스트','표본','통계'], go:'tool-abtest', label:'🧪 A/B 유의성 검정' },
  { kw:['입찰','입찰가','bid','cpc 얼마','클릭당'], go:'tool-bid', label:'📈 적정 입찰가 계산기' },
  { kw:['페이싱','소진','pacing','과속','월말','남은 예산'], go:'tool-pacing', label:'⏱️ 예산 페이싱 계산기' },
  { kw:['네이밍','이름','규칙','컨벤션','표준'], go:'naming', label:'🏷️ 네이밍 규칙' },
  { kw:['뉴스레터','인사이트','소스','트렌드','구독','읽을거리','캐릿','모비인사이드','아이보스','사이트','블로그','리포트'], go:'sources', label:'📰 마케팅 인사이트 소스 — 뉴스레터·사이트' },
  { kw:['용어','뜻','무슨','뭐','뭔','약자','의미','이란','란?'], go:'glossary', label:'📖 광고 용어 사전 — 모르는 용어 검색' },
  { kw:['학습','학습상태','러닝','learning','learning phase','커리큘럼','온보딩','day','일차'], go:'glossary', label:'📖 광고 용어 사전 (학습 상태 등 용어 검색)' },
];
const HS_CHIPS = [
  ['📊 KPI 계산기','tool-kpi'], ['🔗 UTM 빌더','tool-utm'], ['💰 손익분기','tool-budget'],
  ['🩺 트러블슈팅','tool-diagnose'], ['📊 매체 벤치마크','benchmark'], ['📖 용어 사전','glossary'],
];
function renderHomeSearch() {
  const m = document.getElementById('homeSearchMount');
  if (!m) return;
  m.innerHTML =
    '<div class="home-search">' +
    '<div class="hs-title">💬 무엇이든 물어보세요 — 알맞은 자료로 안내해 드려요</div>' +
    '<div class="hs-input-wrap"><span class="hs-ico">✨</span>' +
    '<input id="hsInput" class="hs-input" type="text" autocomplete="off" ' +
    'placeholder="예) ROAS 어떻게 계산해? · 비즈보드 규격 · CPA가 갑자기 올랐어요 · UTM 만들기">' +
    '<button class="hs-go" onclick="homeSearchEnter()" aria-label="검색">→</button></div>' +
    '<div id="hsResults" class="hs-results"></div>' +
    '<div id="hsChips" class="hs-chips"><span class="hs-chips-label">자주 찾는:</span>' +
    HS_CHIPS.map(c => '<button class="hs-chip" onclick="showPage(\'' + c[1] + '\')">' + c[0] + '</button>').join('') +
    '</div></div>';
  const inp = document.getElementById('hsInput');
  inp.addEventListener('input', homeSearchRun);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); homeSearchEnter(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); _hsSel = Math.min(_hsSel + 1, _hsHits.length - 1); hsPaint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); _hsSel = Math.max(_hsSel - 1, 0); hsPaint(); }
    else if (e.key === 'Escape') { resetHomeSearch(); }
  });
}
// 홈 질문창 초기화(홈 복귀 시 지난 결과 제거)
function resetHomeSearch() {
  const inp = document.getElementById('hsInput'); if (inp) inp.value = '';
  const box = document.getElementById('hsResults'); if (box) { box.innerHTML = ''; box.classList.remove('on'); }
  const chips = document.getElementById('hsChips'); if (chips) chips.style.display = '';
  _hsHits = []; _hsSel = 0;
}
function hsPaint() {
  const box = document.getElementById('hsResults'); if (!box) return;
  [...box.querySelectorAll('.hs-item')].forEach((b, i) => b.classList.toggle('sel', i === _hsSel));
  const sel = box.querySelector('.hs-item.sel'); if (sel) sel.scrollIntoView({ block: 'nearest' });
}
let _hsHits = [];
let _hsSel = 0;
function homeSearchRun() {
  const q = (document.getElementById('hsInput').value || '').trim().toLowerCase();
  const box = document.getElementById('hsResults');
  const chips = document.getElementById('hsChips');
  if (!q) { box.innerHTML = ''; box.classList.remove('on'); _hsHits = []; if (chips) chips.style.display = ''; return; }
  if (chips) chips.style.display = 'none';
  _searchIndex = _searchIndex || buildSearchIndex();
  const tokens = q.split(/\s+/).filter(Boolean);
  const qNS = q.replace(/\s+/g, ''); // 공백 무시 매칭
  const scored = _searchIndex.map(it => {
    const hay = (it.label + ' ' + it.kw).toLowerCase();
    const hayNS = hay.replace(/\s+/g, '');
    let s = 0;
    tokens.forEach(t => { if (hay.indexOf(t) >= 0 || hayNS.indexOf(t.replace(/\s+/g, '')) >= 0) s++; });
    if (hay.indexOf(q) >= 0 || hayNS.indexOf(qNS) >= 0) s += 2;
    return { it, s };
  }).filter(x => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 8).map(x => x.it);
  // 의도 기반 바로가기 제안
  let suggest = null;
  for (const intent of SEARCH_INTENTS) {
    if (intent.kw.some(k => q.indexOf(k) >= 0)) { suggest = intent; break; }
  }
  _hsHits = (suggest ? [{ type: '바로가기', label: suggest.label, go: () => showPage(suggest.go), _suggest: true }] : []).concat(scored);
  _hsSel = 0;
  if (!_hsHits.length) {
    box.innerHTML = '<div class="hs-empty">딱 맞는 결과가 없어요.<br>아래 [자주 찾는] 버튼이나 좌측 메뉴, 또는 <b>Ctrl+K</b> 전체 검색을 이용해보세요.</div>';
    box.classList.add('on'); return;
  }
  box.innerHTML = _hsHits.map((h, i) =>
    '<button class="hs-item' + (h._suggest ? ' hs-suggest' : '') + (i === _hsSel ? ' sel' : '') + '" data-i="' + i + '">' +
    '<span class="hs-type">' + escapeHtml(h.type) + '</span><span class="hs-label">' + escapeHtml(h.label) + '</span></button>'
  ).join('');
  [...box.querySelectorAll('.hs-item')].forEach(b => b.addEventListener('click', () => { const h = _hsHits[+b.dataset.i]; if (h) h.go(); }));
  box.classList.add('on');
}
function homeSearchEnter() {
  if (_hsHits && _hsHits.length) { (_hsHits[_hsSel] || _hsHits[0]).go(); return; }
  // 입력은 있는데 히트가 없으면 전체 검색 팔레트로
  const q = (document.getElementById('hsInput') || {}).value || '';
  if (q.trim()) { openSearch(); const si = document.getElementById('searchInput'); if (si) { si.value = q; runSearch(); } }
}

// ─── 다음 학습 Day 안내 (홈, 순차 진행 길잡이) ───
function renderNextUp() {
  const mount = document.getElementById('nextUpMount');
  if (!mount || typeof dayData !== 'object') return;
  const total = Object.keys(dayData).length;
  const done = (typeof getDoneSet === 'function') ? getDoneSet() : new Set();
  const doneCount = [...done].filter(x => /^day\d+$/.test(x) && dayData[x]).length;
  let nextN = 0;
  for (let i = 1; i <= total; i++) { if (!done.has('day' + i)) { nextN = i; break; } }
  if (nextN === 0) {
    mount.innerHTML = '<div class="nextup done"><span class="nu-ico">🎓</span><div><div class="nu-title">커리큘럼 ' + total + '일 완주! 축하합니다 🎉</div><div class="nu-sub">이제 실무 도구로 실제 캠페인을 운영해 보세요.</div></div></div>';
    return;
  }
  const d = dayData['day' + nextN];
  const wk = 'week' + Math.ceil(nextN / 5);
  mount.innerHTML =
    '<div class="nextup"><div class="nu-left">' +
      '<span class="nu-badge">📍 다음 학습</span>' +
      '<div class="nu-title">Day ' + nextN + ' · ' + escapeHtml(d.title) + '</div>' +
      '<div class="nu-sub">' + escapeHtml(d.week) + ' · 권장 페이스: 주 5일 · 하루 1강 (전체 12주) · 진도 ' + doneCount + '/' + total + '</div>' +
    '</div><div class="nu-btns">' +
      '<button class="btn btn-primary btn-sm" onclick="openModal(\'day' + nextN + '\')">바로 열기 →</button>' +
      '<button class="btn btn-ghost btn-sm" onclick="showPage(\'' + wk + '\')">주차 보기</button>' +
    '</div></div>';
}

// ─── 첫 주 온보딩 체크리스트 (홈) ───
const ONBOARD_ITEMS = [
  { id: 'utm',      label: 'UTM 완전정복 학습하기',          sub: '개념·5파라미터·퀴즈',  go: 'utm-learn' },
  { id: 'kpi',      label: 'KPI 계산기로 캠페인 1건 계산',    sub: 'CTR·CPA·ROAS 익히기',  go: 'tool-kpi' },
  { id: 'be',       label: '손익분기 ROAS 계산해보기',        sub: '마진 기반 본전선',     go: 'tool-budget' },
  { id: 'utmbuild', label: '첫 UTM 추적 링크 만들기',         sub: '네이밍 규칙 적용',     go: 'tool-utm' },
  { id: 'gloss',    label: '광고 용어 사전 훑어보기',         sub: 'CPM·ROAS·픽셀 등',     go: 'glossary' },
  { id: 'day1',     label: '커리큘럼 Day 1~5 완료',           sub: '기초 & 용어 마스터',   go: 'week1' },
];
function getOnboardSet() { try { return new Set(JSON.parse(localStorage.getItem('pm_onboard') || '[]')); } catch (_) { return new Set(); } }
function toggleOnboard(id, ev) {
  if (ev) ev.stopPropagation();
  const set = getOnboardSet();
  if (set.has(id)) set.delete(id); else set.add(id);
  try { localStorage.setItem('pm_onboard', JSON.stringify([...set])); } catch (_) {}
  renderOnboarding();
}
function renderOnboarding() {
  const mount = document.getElementById('onboardMount');
  if (!mount) return;
  const set = getOnboardSet();
  const done = ONBOARD_ITEMS.filter(i => set.has(i.id)).length;
  const pct = Math.round(done / ONBOARD_ITEMS.length * 100);
  if (done === ONBOARD_ITEMS.length) { mount.innerHTML = ''; return; } // 전부 완료 시 숨김
  mount.innerHTML =
    '<div class="onboard"><div class="onboard-head"><span style="font-size:18px">🚀</span><span class="onboard-title">첫 주 온보딩 체크리스트</span></div>' +
    '<div class="onboard-bar-wrap"><div class="onboard-bar"><div style="width:' + pct + '%"></div></div><span style="font-size:12px;font-weight:700;color:var(--primary)">' + done + '/' + ONBOARD_ITEMS.length + '</span></div>' +
    '<div class="onboard-grid">' +
    ONBOARD_ITEMS.map(i => {
      const d = set.has(i.id);
      return '<button class="onboard-item' + (d ? ' done' : '') + '" onclick="showPage(\'' + i.go + '\',this)">' +
        '<span class="ck" onclick="toggleOnboard(\'' + i.id + '\',event)">✓</span>' +
        '<span><span class="ob-label">' + escapeHtml(i.label) + '</span><span class="ob-sub">' + escapeHtml(i.sub) + '</span></span></button>';
    }).join('') +
    '</div></div>';
}

// ─── 전역 키보드 ───
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); openSearch(); return; }
  if (e.key === 'Escape') {
    closeSearch(); closeSidebar();
    if (typeof closeWelcome === 'function') { const w = document.getElementById('welcomeOverlay'); if (w && w.classList.contains('open')) closeWelcome(); }
    if (typeof closeNameModal === 'function') closeNameModal();
    return;
  }
  // 포커스된 클릭형 카드를 Enter/Space로 활성화
  if (e.key === 'Enter' || e.key === ' ') {
    const el = document.activeElement;
    if (el && el.getAttribute && el.getAttribute('onclick') &&
        (el.classList.contains('week-card') || el.classList.contains('day-item'))) {
      e.preventDefault();
      el.click();
    }
  }
});

// ─── 초기화 ───
renderHomeSearch();
renderNextUp();
renderOnboarding();
a11yEnhance(document);
initRouting();
