// ============================================================
// utm.js — UTM 빌더 (네이밍 규칙 내장)
// 진입점: window.renderUtmTool()  →  컨테이너 id="page-tool-utm"
// 탭: 단일 생성 / 여러 개(엑셀용) / 캠페인명 생성기
// 외부 라이브러리·네트워크·현재날짜 API 사용 금지. 순수 JS + 이모지.
// ============================================================
(function () {
  'use strict';

  // ── 모듈 상태 (탭 간 공유) ──
  var utmState = {
    tab: 'single',          // single | bulk | campaign
    naming: true,           // 네이밍 규칙 적용
    single: {
      url: '',
      source: '',
      medium: '',
      campaign: '',
      term: '',
      content: ''
    },
    bulk: {
      url: '',
      rows: [
        { source: '', medium: '', campaign: '', term: '', content: '' },
        { source: '', medium: '', campaign: '', term: '', content: '' }
      ]
    },
    camp: {
      brand: '',
      purpose: 'conversion',
      date: ''
    }
  };

  // source 빠른 태그 → 추천 medium
  var UTM_SOURCES = ['naver', 'google', 'kakao', 'meta', 'instagram', 'youtube', 'tiktok', 'criteo', 'daangn', 'toss'];
  var UTM_SOURCE_MEDIUM = {
    naver: 'cpc',
    google: 'cpc',
    kakao: 'cpc',
    meta: 'paid_social',
    instagram: 'paid_social',
    youtube: 'video',
    tiktok: 'paid_social',
    criteo: 'retargeting',
    daangn: 'display',
    toss: 'display'
  };
  var UTM_MEDIUMS = ['cpc', 'display', 'paid_social', 'video', 'email', 'retargeting'];
  var UTM_PURPOSES = [
    { v: 'brand', label: '브랜드 (brand)' },
    { v: 'awareness', label: '인지도 (awareness)' },
    { v: 'conversion', label: '전환 (conversion)' },
    { v: 'retargeting', label: '리타겟팅 (retargeting)' },
    { v: 'launch', label: '런칭 (launch)' },
    { v: 'sale', label: '세일/프로모션 (sale)' },
    { v: 'cpi', label: '앱설치 (cpi)' }
  ];

  // ── 상태 영속화 (localStorage) ──
  function utmSaveState() {
    try { if (typeof saveToolState === 'function') saveToolState('utm', utmState); } catch (e) {}
  }
  function utmLoadState() {
    try {
      if (typeof loadToolState !== 'function') return;
      var saved = loadToolState('utm');
      if (!saved || typeof saved !== 'object') return;
      // 안전 병합 (구조 보존, 누락 키는 기본값 유지)
      if (saved.tab === 'single' || saved.tab === 'bulk' || saved.tab === 'campaign') utmState.tab = saved.tab;
      if (typeof saved.naming === 'boolean') utmState.naming = saved.naming;
      if (saved.single && typeof saved.single === 'object') {
        var sk = ['url', 'source', 'medium', 'campaign', 'term', 'content'];
        for (var i = 0; i < sk.length; i++) {
          if (typeof saved.single[sk[i]] === 'string') utmState.single[sk[i]] = saved.single[sk[i]];
        }
      }
      if (saved.bulk && typeof saved.bulk === 'object') {
        if (typeof saved.bulk.url === 'string') utmState.bulk.url = saved.bulk.url;
        if (Object.prototype.toString.call(saved.bulk.rows) === '[object Array]' && saved.bulk.rows.length) {
          var rows = [];
          for (var r = 0; r < saved.bulk.rows.length; r++) {
            var sr = saved.bulk.rows[r] || {};
            rows.push({
              source: typeof sr.source === 'string' ? sr.source : '',
              medium: typeof sr.medium === 'string' ? sr.medium : '',
              campaign: typeof sr.campaign === 'string' ? sr.campaign : '',
              term: typeof sr.term === 'string' ? sr.term : '',
              content: typeof sr.content === 'string' ? sr.content : ''
            });
          }
          utmState.bulk.rows = rows;
        }
      }
      if (saved.camp && typeof saved.camp === 'object') {
        if (typeof saved.camp.brand === 'string') utmState.camp.brand = saved.camp.brand;
        if (typeof saved.camp.date === 'string') utmState.camp.date = saved.camp.date;
        // purpose 는 유효 옵션일 때만 복원
        if (typeof saved.camp.purpose === 'string') {
          for (var p = 0; p < UTM_PURPOSES.length; p++) {
            if (UTM_PURPOSES[p].v === saved.camp.purpose) { utmState.camp.purpose = saved.camp.purpose; break; }
          }
        }
      }
    } catch (e) {}
  }

  // 입력을 기본값으로 초기화
  function utmSampleState() {
    utmState.tab = 'single';
    utmState.single = { url: 'https://www.example.com/event', source: 'naver', medium: 'cpc', campaign: 'newbalance_sale_20260601', term: '', content: 'banner_a' };
    try { if (typeof saveToolState === 'function') saveToolState('utm', utmState); } catch (e) {}
  }
  function utmClearState() {
    utmState.single = { url: '', source: '', medium: '', campaign: '', term: '', content: '' };
    utmState.bulk = {
      url: '',
      rows: [
        { source: '', medium: '', campaign: '', term: '', content: '' },
        { source: '', medium: '', campaign: '', term: '', content: '' }
      ]
    };
    utmState.camp = { brand: '', purpose: 'conversion', date: '' };
    try { if (typeof clearToolState === 'function') clearToolState('utm'); } catch (e) {}
  }

  // ── 유틸 ──
  function utmEscapeHtml(s) {
    s = (s == null) ? '' : String(s);
    return s.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // 네이밍 규칙: 소문자화 + 공백→_ + URL 위험문자 제거
  function utmNormalize(v) {
    if (v == null) return '';
    var s = String(v).trim();
    if (!s) return '';
    s = s.toLowerCase();
    s = s.replace(/\s+/g, '_');                 // 공백 → 언더스코어
    s = s.replace(/[#%&?=/\\<>{}|^~`"'\[\]]/g, ''); // URL 위험/예약 문자 제거
    s = s.replace(/_+/g, '_');                   // 연속 _ 축약
    return s;
  }

  // 표시용 파라미터 값 변환 (네이밍 토글 반영)
  function utmApply(v) {
    return utmState.naming ? utmNormalize(v) : (v == null ? '' : String(v).trim());
  }

  // 대문자/공백/한글 등 GA 집계 위험 문자 감지
  function utmHasRisk(v) {
    if (v == null) return false;
    var s = String(v);
    return /[A-Z]/.test(s) || /\s/.test(s) || /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(s);
  }

  // URL 유효성 (랜딩 URL은 http/https 권장)
  function utmIsValidBase(url) {
    if (!url) return false;
    return /^https?:\/\/.+/i.test(url.trim());
  }

  // 파라미터 객체 → 쿼리스트링 (값 encodeURIComponent)
  function utmBuildQuery(params) {
    var pairs = [];
    var keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var val = params[k];
      if (val != null && String(val).length > 0) {
        pairs.push(k + '=' + encodeURIComponent(val));
      }
    }
    return pairs.join('&');
  }

  // 완성 URL 생성 (? 이미 있으면 & 로 연결)
  function utmBuildUrl(baseUrl, params) {
    var base = (baseUrl == null) ? '' : String(baseUrl).trim();
    var qs = utmBuildQuery(params);
    if (!base) return qs ? '?' + qs : '';
    if (!qs) return base;
    var sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + qs;
  }

  // 단일 탭의 정규화된 파라미터 객체
  function utmSingleParams() {
    var s = utmState.single;
    return {
      utm_source: utmApply(s.source),
      utm_medium: utmApply(s.medium),
      utm_campaign: utmApply(s.campaign),
      utm_term: utmApply(s.term),
      utm_content: utmApply(s.content)
    };
  }

  // ──────────────────────────────────────────────
  //  메인 렌더
  // ──────────────────────────────────────────────
  function utmRender() {
    var root = document.getElementById('page-tool-utm');
    if (!root) return;

    utmLoadState();

    root.innerHTML =
      '<div class="tool-wrap">' +
        '<div class="tool-hero">' +
          '<div class="eyebrow">🧰 실무 도구</div>' +
          '<h1>UTM 빌더 <span style="font-weight:400;color:var(--text-muted);font-size:18px;">네이밍 규칙 내장</span></h1>' +
          '<p>광고 링크 추적용 UTM URL을 규칙에 맞게 정확히, 그리고 대량으로 만듭니다. GA4에서 소스/매체/캠페인이 깔끔하게 집계되도록 자동으로 소문자·언더스코어 규칙을 적용합니다.</p>' +
        '</div>' +
        // 도구 연계 + 입력 비우기
        '<div class="btn-row" style="margin-bottom:14px;">' +
          '<button class="btn btn-ghost btn-sm" data-utm-naming-link>🏷️ 네이밍 규칙 보기</button>' +
          '<button class="btn btn-ghost btn-sm" data-utm-learn-link>🎯 UTM 완전정복</button>' +
          '<button class="btn btn-ghost btn-sm" data-utm-sample>✨ 예시 채우기</button>' +
          '<button class="btn btn-ghost btn-sm" data-utm-clear>🗑 입력 비우기</button>' +
        '</div>' +
        // 탭 + 네이밍 토글
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:18px;">' +
          '<div class="seg" data-utm-seg>' +
            segBtn('single', '① 단일 생성') +
            segBtn('bulk', '② 여러 개 (엑셀용)') +
            segBtn('campaign', '③ 캠페인명 생성기') +
          '</div>' +
          '<label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:12.5px;font-weight:700;color:var(--text-secondary);user-select:none;">' +
            '<input type="checkbox" data-utm-naming ' + (utmState.naming ? 'checked' : '') + ' style="width:16px;height:16px;accent-color:var(--primary);cursor:pointer;">' +
            '네이밍 규칙 적용 <span style="color:var(--text-muted);font-weight:600;">(소문자·언더스코어)</span>' +
          '</label>' +
        '</div>' +
        '<div data-utm-body></div>' +
      '</div>';

    utmBindShell(root);
    utmRenderBody(root);
  }

  function segBtn(tab, label) {
    return '<button class="seg-btn' + (utmState.tab === tab ? ' on' : '') + '" data-utm-tab="' + tab + '">' + label + '</button>';
  }

  function utmBindShell(root) {
    // 탭 전환
    var seg = root.querySelector('[data-utm-seg]');
    if (seg) {
      seg.addEventListener('click', function (e) {
        var b = e.target.closest('[data-utm-tab]');
        if (!b) return;
        utmState.tab = b.getAttribute('data-utm-tab');
        // 탭 active 갱신
        var btns = seg.querySelectorAll('.seg-btn');
        for (var i = 0; i < btns.length; i++) {
          btns[i].classList.toggle('on', btns[i].getAttribute('data-utm-tab') === utmState.tab);
        }
        utmSaveState();
        utmRenderBody(root);
      });
    }
    // 네이밍 토글
    var chk = root.querySelector('[data-utm-naming]');
    if (chk) {
      chk.addEventListener('change', function () {
        utmState.naming = chk.checked;
        utmSaveState();
        utmRenderBody(root);
      });
    }
    // 도구 연계 — 네이밍 규칙
    var namingLink = root.querySelector('[data-utm-naming-link]');
    if (namingLink) {
      namingLink.addEventListener('click', function () {
        if (typeof showPage === 'function') showPage('naming');
      });
    }
    // 도구 연계 — UTM 완전정복
    var learnLink = root.querySelector('[data-utm-learn-link]');
    if (learnLink) {
      learnLink.addEventListener('click', function () {
        if (typeof showPage === 'function') showPage('utm-learn');
      });
    }
    // 예시 채우기
    var sampleBtn = root.querySelector('[data-utm-sample]');
    if (sampleBtn) {
      sampleBtn.addEventListener('click', function () {
        utmSampleState();
        utmRenderBody(root);
      });
    }
    // 입력 비우기
    var clearBtn = root.querySelector('[data-utm-clear]');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        utmClearState();
        utmRenderBody(root);
      });
    }
  }

  function utmRenderBody(root) {
    var body = root.querySelector('[data-utm-body]');
    if (!body) return;
    if (utmState.tab === 'single') utmRenderSingle(body);
    else if (utmState.tab === 'bulk') utmRenderBulk(body);
    else utmRenderCampaign(body);
  }

  // ──────────────────────────────────────────────
  //  탭 1 — 단일 생성
  // ──────────────────────────────────────────────
  function utmRenderSingle(body) {
    var s = utmState.single;

    body.innerHTML =
      '<div class="tool-grid wide-right">' +
        // ─ 입력 패널 ─
        '<div class="panel">' +
          '<div class="panel-head"><span class="ico">🔗</span><div><div class="panel-title">파라미터 입력</div><div class="panel-sub">랜딩 URL + UTM 5종</div></div></div>' +

          '<div class="field">' +
            '<label>랜딩 URL <span class="req">필수</span></label>' +
            '<input type="text" class="input" data-f="url" placeholder="https://www.example.com/event" value="' + utmEscapeHtml(s.url) + '">' +
            '<div class="field-hint">광고를 클릭하면 도착할 페이지. http:// 또는 https:// 로 시작해야 합니다.</div>' +
          '</div>' +

          '<div class="field">' +
            '<label>utm_source 소스 <span class="req">필수</span></label>' +
            '<input type="text" class="input" data-f="source" placeholder="naver" value="' + utmEscapeHtml(s.source) + '">' +
            '<div class="qtags" data-utm-srctags>' + UTM_SOURCES.map(function (x) {
              return '<button class="qtag' + (s.source === x ? ' on' : '') + '" data-src="' + x + '">' + x + '</button>';
            }).join('') + '</div>' +
            '<div class="field-hint">유입 출처 (매체사). 빠른 태그를 누르면 추천 매체가 자동 입력됩니다.</div>' +
          '</div>' +

          '<div class="field">' +
            '<label>utm_medium 매체 <span class="req">필수</span></label>' +
            '<input type="text" class="input" data-f="medium" placeholder="cpc" value="' + utmEscapeHtml(s.medium) + '">' +
            '<div class="qtags" data-utm-medtags>' + UTM_MEDIUMS.map(function (x) {
              return '<button class="qtag' + (s.medium === x ? ' on' : '') + '" data-med="' + x + '">' + x + '</button>';
            }).join('') + '</div>' +
            '<div class="field-hint">유입 방식. 예: cpc(검색), display(배너), paid_social(SNS).</div>' +
          '</div>' +

          '<div class="field">' +
            '<label>utm_campaign 캠페인 <span class="req">필수</span></label>' +
            '<input type="text" class="input" data-f="campaign" placeholder="summer_sale_20260601" value="' + utmEscapeHtml(s.campaign) + '">' +
            '<div class="field-hint">캠페인 식별자. ③번 탭의 캠페인명 생성기로 표준 형식을 만들 수 있습니다.</div>' +
          '</div>' +

          '<div class="field-row">' +
            '<div class="field">' +
              '<label>utm_term 키워드 <span class="opt">선택</span></label>' +
              '<input type="text" class="input" data-f="term" placeholder="running_shoes" value="' + utmEscapeHtml(s.term) + '">' +
            '</div>' +
            '<div class="field">' +
              '<label>utm_content 콘텐츠 <span class="opt">선택</span></label>' +
              '<input type="text" class="input" data-f="content" placeholder="banner_a" value="' + utmEscapeHtml(s.content) + '">' +
            '</div>' +
          '</div>' +

        '</div>' +

        // ─ 결과 패널 ─
        '<div class="panel panel-sticky">' +
          '<div class="panel-head"><span class="ico">✨</span><div><div class="panel-title">완성된 추적 URL</div><div class="panel-sub">입력 즉시 자동 생성</div></div></div>' +
          '<div data-utm-warn></div>' +
          '<div class="codebox" data-utm-out style="margin-bottom:14px;"></div>' +
          '<div class="btn-row">' +
            '<button class="btn btn-primary copy-btn btn-block" data-utm-copy>📋 URL 복사</button>' +
          '</div>' +
          '<div style="margin-top:20px;">' +
            '<div class="panel-sub" style="margin-bottom:8px;font-weight:700;">📊 GA4 집계 미리보기</div>' +
            '<div class="table-scroll">' +
              '<table class="t-table" data-utm-preview><tbody></tbody></table>' +
            '</div>' +
          '</div>' +
          '<div class="callout info"><span class="c-ico">💡</span><div><b>source · medium · campaign 3개는 항상 함께</b> 채우세요. 하나라도 빠지면 GA4 보고서에서 “(not set)”으로 잡혀 분석이 어렵습니다.</div></div>' +
          '<div class="callout info"><span class="c-ico">🚫</span><div>우리 사이트 <b>내부 링크에는 UTM을 붙이지 마세요.</b> 세션이 끊기고 유입 출처가 자기 자신으로 덮어써집니다.</div></div>' +
        '</div>' +
      '</div>';

    // 입력 바인딩
    var inputs = body.querySelectorAll('[data-f]');
    for (var i = 0; i < inputs.length; i++) {
      (function (el) {
        el.addEventListener('input', function () {
          s[el.getAttribute('data-f')] = el.value;
          utmSaveState();
          utmUpdateSingleOutput(body);
          utmSyncSingleTags(body);
        });
      })(inputs[i]);
    }

    // source 빠른 태그
    var srcTags = body.querySelector('[data-utm-srctags]');
    if (srcTags) {
      srcTags.addEventListener('click', function (e) {
        var b = e.target.closest('[data-src]');
        if (!b) return;
        var val = b.getAttribute('data-src');
        s.source = val;
        // medium 비어있으면 추천 medium 자동 채움
        if (!s.medium || !s.medium.trim()) {
          s.medium = UTM_SOURCE_MEDIUM[val] || '';
        }
        // 인풋 값 반영
        var srcInput = body.querySelector('[data-f="source"]');
        var medInput = body.querySelector('[data-f="medium"]');
        if (srcInput) srcInput.value = s.source;
        if (medInput) medInput.value = s.medium;
        utmSaveState();
        utmUpdateSingleOutput(body);
        utmSyncSingleTags(body);
      });
    }

    // medium 빠른 태그
    var medTags = body.querySelector('[data-utm-medtags]');
    if (medTags) {
      medTags.addEventListener('click', function (e) {
        var b = e.target.closest('[data-med]');
        if (!b) return;
        s.medium = b.getAttribute('data-med');
        var medInput = body.querySelector('[data-f="medium"]');
        if (medInput) medInput.value = s.medium;
        utmSaveState();
        utmUpdateSingleOutput(body);
        utmSyncSingleTags(body);
      });
    }

    // 복사 버튼
    var copyBtn = body.querySelector('[data-utm-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var p = utmSingleParams();
        var miss = utmSingleMissing();
        if (miss.length) return; // 비활성 상태일 때 방어
        var url = utmBuildUrl(s.url, p);
        if (url) copyToClipboard(url, copyBtn);
      });
    }

    utmUpdateSingleOutput(body);
  }

  // 필수 누락 항목 (정규화 후 기준)
  function utmSingleMissing() {
    var p = utmSingleParams();
    var miss = [];
    if (!utmIsValidBase(utmState.single.url)) miss.push('랜딩 URL');
    if (!p.utm_source) miss.push('utm_source');
    if (!p.utm_medium) miss.push('utm_medium');
    if (!p.utm_campaign) miss.push('utm_campaign');
    return miss;
  }

  function utmSyncSingleTags(body) {
    var s = utmState.single;
    var srcTags = body.querySelectorAll('[data-utm-srctags] .qtag');
    for (var i = 0; i < srcTags.length; i++) {
      srcTags[i].classList.toggle('on', srcTags[i].getAttribute('data-src') === s.source);
    }
    var medTags = body.querySelectorAll('[data-utm-medtags] .qtag');
    for (var j = 0; j < medTags.length; j++) {
      medTags[j].classList.toggle('on', medTags[j].getAttribute('data-med') === s.medium);
    }
  }

  function utmUpdateSingleOutput(body) {
    var s = utmState.single;
    var p = utmSingleParams();
    var url = utmBuildUrl(s.url, p);

    // 출력 codebox (랜딩 URL이 http/https 로 유효할 때만 완성 URL 노출)
    var out = body.querySelector('[data-utm-out]');
    if (out) {
      if (url && utmIsValidBase(s.url) && (p.utm_source || p.utm_medium || p.utm_campaign)) {
        out.classList.remove('empty');
        out.innerHTML = utmEscapeHtml(url);
      } else {
        out.classList.add('empty');
        out.innerHTML = '<span class="ph">랜딩 URL과 source·medium·campaign을 입력하면 추적 URL이 여기에 생성됩니다.</span>';
      }
    }

    // 경고 + 복사 버튼 활성/비활성
    var warnEl = body.querySelector('[data-utm-warn]');
    var copyBtn = body.querySelector('[data-utm-copy]');
    var warnHtml = '';

    // 규칙 위반 경고 (네이밍 토글이 꺼져 있을 때만 의미 있음 — 켜져 있으면 자동 정규화됨)
    var riskFields = [];
    if (utmHasRisk(s.source)) riskFields.push('utm_source');
    if (utmHasRisk(s.medium)) riskFields.push('utm_medium');
    if (utmHasRisk(s.campaign)) riskFields.push('utm_campaign');

    if (!utmState.naming && riskFields.length) {
      warnHtml += '<div class="callout warn"><span class="c-ico">⚠️</span><div><b>' + riskFields.join(', ') + '</b> 에 대문자/공백/한글이 있습니다. GA에서는 <b>대소문자·공백을 다른 값으로 집계</b>합니다(예: Naver ≠ naver). “네이밍 규칙 적용”을 켜거나 직접 소문자·언더스코어로 정리하세요.</div></div>';
    } else if (utmState.naming && riskFields.length) {
      warnHtml += '<div class="callout ok"><span class="c-ico">✅</span><div>입력값을 네이밍 규칙으로 자동 정리했습니다. (소문자·공백→_·위험문자 제거)</div></div>';
    }

    // 필수 누락 경고
    var miss = utmSingleMissing();
    if (miss.length) {
      warnHtml += '<div class="callout danger"><span class="c-ico">🔴</span><div>필수 항목이 비었습니다 → <b>' + miss.join(', ') + '</b>. 채워야 URL을 복사할 수 있습니다.</div></div>';
    }
    if (warnEl) warnEl.innerHTML = warnHtml;
    if (copyBtn) copyBtn.disabled = miss.length > 0;

    // GA4 미리보기 테이블
    var prev = body.querySelector('[data-utm-preview] tbody');
    if (prev) {
      var rows = [
        ['소스 (source)', p.utm_source],
        ['매체 (medium)', p.utm_medium],
        ['캠페인 (campaign)', p.utm_campaign],
        ['키워드 (term)', p.utm_term],
        ['콘텐츠 (content)', p.utm_content]
      ];
      prev.innerHTML = rows.map(function (r) {
        var v = r[1];
        var cell = v ? utmEscapeHtml(v) : '<span style="color:var(--text-muted);">–</span>';
        return '<tr><th style="text-transform:none;">' + r[0] + '</th><td>' + cell + '</td></tr>';
      }).join('');
    }
  }

  // ──────────────────────────────────────────────
  //  탭 2 — 여러 개 (엑셀 붙여넣기용)
  // ──────────────────────────────────────────────
  function utmRenderBulk(body) {
    var b = utmState.bulk;

    body.innerHTML =
      '<div class="tool-grid single">' +
        '<div class="panel">' +
          '<div class="panel-head"><span class="ico">📑</span><div><div class="panel-title">여러 개 한꺼번에 생성</div><div class="panel-sub">행마다 파라미터 입력 → 스프레드시트에 붙여넣기</div></div></div>' +

          '<div class="field">' +
            '<label>공통 랜딩 URL <span class="req">필수</span></label>' +
            '<input type="text" class="input" data-bulk-url placeholder="https://www.example.com/event" value="' + utmEscapeHtml(b.url) + '">' +
            '<div class="field-hint">모든 행에 동일하게 적용됩니다. http:// 또는 https:// 로 시작해야 합니다.</div>' +
          '</div>' +

          '<div data-bulk-warn></div>' +

          '<div class="table-scroll" style="margin-top:6px;">' +
            '<table class="t-table" data-bulk-table>' +
              '<thead><tr>' +
                '<th style="width:30px;">#</th>' +
                '<th>source<span style="color:var(--danger);">*</span></th>' +
                '<th>medium<span style="color:var(--danger);">*</span></th>' +
                '<th>campaign<span style="color:var(--danger);">*</span></th>' +
                '<th>term</th>' +
                '<th>content</th>' +
                '<th style="width:40px;"></th>' +
              '</tr></thead>' +
              '<tbody data-bulk-rows></tbody>' +
            '</table>' +
          '</div>' +

          '<div class="btn-row">' +
            '<button class="btn btn-ghost btn-sm" data-bulk-add>➕ 행 추가</button>' +
          '</div>' +

          '<div style="margin-top:22px;">' +
            '<div class="panel-sub" style="margin-bottom:8px;font-weight:700;">📋 생성 결과 (TSV — 스프레드시트에 바로 붙여넣기)</div>' +
            '<div class="codebox" data-bulk-out style="white-space:pre;overflow-x:auto;"></div>' +
          '</div>' +

          '<div class="btn-row">' +
            '<button class="btn btn-primary copy-btn" data-bulk-copy>📋 전체 복사 (TSV)</button>' +
            '<span style="font-size:11.5px;color:var(--text-muted);align-self:center;">헤더 포함 · 탭 구분 · 엑셀/구글시트 셀에 바로 분리됩니다</span>' +
          '</div>' +

          '<div class="callout info"><span class="c-ico">💡</span><div>복사 후 스프레드시트 <b>A1 셀을 선택하고 붙여넣기(Ctrl+V)</b> 하면 열이 자동으로 나뉩니다. 완성URL 열만 복사해 광고 매체에 등록하세요.</div></div>' +
        '</div>' +
      '</div>';

    utmBulkRenderRows(body);

    // 공통 URL
    var urlInput = body.querySelector('[data-bulk-url]');
    if (urlInput) {
      urlInput.addEventListener('input', function () {
        b.url = urlInput.value;
        utmSaveState();
        utmBulkUpdateOutput(body);
      });
    }

    // 행 추가
    var addBtn = body.querySelector('[data-bulk-add]');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        b.rows.push({ source: '', medium: '', campaign: '', term: '', content: '' });
        utmSaveState();
        utmBulkRenderRows(body);
        utmBulkUpdateOutput(body);
      });
    }

    // 전체 복사
    var copyBtn = body.querySelector('[data-bulk-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var tsv = utmBulkTsv();
        if (tsv) copyToClipboard(tsv, copyBtn);
      });
    }

    utmBulkUpdateOutput(body);
  }

  function utmBulkRenderRows(body) {
    var b = utmState.bulk;
    var tbody = body.querySelector('[data-bulk-rows]');
    if (!tbody) return;
    var fields = ['source', 'medium', 'campaign', 'term', 'content'];
    var html = '';
    for (var i = 0; i < b.rows.length; i++) {
      var row = b.rows[i];
      html += '<tr data-row="' + i + '">';
      html += '<td style="color:var(--text-muted);font-weight:700;">' + (i + 1) + '</td>';
      for (var f = 0; f < fields.length; f++) {
        var fld = fields[f];
        html += '<td style="padding:6px 8px;"><input type="text" class="input" style="padding:7px 9px;font-size:12.5px;" data-row-f="' + fld + '" data-row-i="' + i + '" value="' + utmEscapeHtml(row[fld]) + '"></td>';
      }
      var delDisabled = b.rows.length <= 1 ? ' disabled' : '';
      html += '<td style="padding:6px 8px;"><button class="btn btn-ghost btn-sm" data-row-del="' + i + '"' + delDisabled + ' title="행 삭제" style="padding:6px 9px;">🗑</button></td>';
      html += '</tr>';
    }
    tbody.innerHTML = html;

    // 셀 입력 바인딩
    var cells = tbody.querySelectorAll('[data-row-f]');
    for (var c = 0; c < cells.length; c++) {
      (function (el) {
        el.addEventListener('input', function () {
          var ri = parseInt(el.getAttribute('data-row-i'), 10);
          var rf = el.getAttribute('data-row-f');
          if (b.rows[ri]) b.rows[ri][rf] = el.value;
          utmSaveState();
          utmBulkUpdateOutput(body);
        });
      })(cells[c]);
    }

    // 삭제 버튼
    var dels = tbody.querySelectorAll('[data-row-del]');
    for (var d = 0; d < dels.length; d++) {
      (function (el) {
        el.addEventListener('click', function () {
          if (b.rows.length <= 1) return;
          var idx = parseInt(el.getAttribute('data-row-del'), 10);
          b.rows.splice(idx, 1);
          utmSaveState();
          utmBulkRenderRows(body);
          utmBulkUpdateOutput(body);
        });
      })(dels[d]);
    }
  }

  // 행 → 정규화 파라미터
  function utmBulkRowParams(row) {
    return {
      utm_source: utmApply(row.source),
      utm_medium: utmApply(row.medium),
      utm_campaign: utmApply(row.campaign),
      utm_term: utmApply(row.term),
      utm_content: utmApply(row.content)
    };
  }

  // 유효한(필수 채워진) 행만 TSV 생성
  function utmBulkValidRows() {
    var b = utmState.bulk;
    var out = [];
    for (var i = 0; i < b.rows.length; i++) {
      var p = utmBulkRowParams(b.rows[i]);
      if (p.utm_source && p.utm_medium && p.utm_campaign) {
        out.push(p);
      }
    }
    return out;
  }

  function utmBulkTsv() {
    var b = utmState.bulk;
    var valid = utmBulkValidRows();
    if (!utmIsValidBase(b.url) || !valid.length) return '';
    var header = ['소스', '매체', '캠페인', '키워드', '콘텐츠', '완성URL'].join('\t');
    var lines = [header];
    for (var i = 0; i < valid.length; i++) {
      var p = valid[i];
      var url = utmBuildUrl(b.url, p);
      lines.push([
        p.utm_source,
        p.utm_medium,
        p.utm_campaign,
        p.utm_term || '',
        p.utm_content || '',
        url
      ].join('\t'));
    }
    return lines.join('\n');
  }

  function utmBulkUpdateOutput(body) {
    var b = utmState.bulk;
    var out = body.querySelector('[data-bulk-out]');
    var warnEl = body.querySelector('[data-bulk-warn]');
    var copyBtn = body.querySelector('[data-bulk-copy]');

    // 경고
    var warnHtml = '';
    if (b.url && !utmIsValidBase(b.url)) {
      warnHtml += '<div class="callout warn"><span class="c-ico">⚠️</span><div>공통 랜딩 URL은 <b>http:// 또는 https://</b> 로 시작해야 합니다.</div></div>';
    }
    var totalFilled = 0, validCount = 0;
    for (var i = 0; i < b.rows.length; i++) {
      var r = b.rows[i];
      if (r.source || r.medium || r.campaign || r.term || r.content) totalFilled++;
      var p = utmBulkRowParams(r);
      if (p.utm_source && p.utm_medium && p.utm_campaign) validCount++;
    }
    if (totalFilled > validCount) {
      warnHtml += '<div class="callout warn"><span class="c-ico">⚠️</span><div>일부 행에 <b>source·medium·campaign</b> 중 빠진 값이 있어 결과에서 제외됩니다. (' + validCount + '개 행 생성)</div></div>';
    }
    if (warnEl) warnEl.innerHTML = warnHtml;

    // 출력 (TSV — 화면엔 가독성 위해 그대로, 단 escape)
    var tsv = utmBulkTsv();
    if (out) {
      if (tsv) {
        out.classList.remove('empty');
        out.innerHTML = utmEscapeHtml(tsv);
      } else {
        out.classList.add('empty');
        out.innerHTML = '<span class="ph">공통 URL과 각 행의 source·medium·campaign을 채우면 TSV가 생성됩니다.</span>';
      }
    }
    if (copyBtn) copyBtn.disabled = !tsv;
  }

  // ──────────────────────────────────────────────
  //  탭 3 — 캠페인명 생성기
  // ──────────────────────────────────────────────
  function utmRenderCampaign(body) {
    var c = utmState.camp;

    body.innerHTML =
      '<div class="tool-grid wide-right">' +
        '<div class="panel">' +
          '<div class="panel-head"><span class="ico">🏷️</span><div><div class="panel-title">캠페인명 부품 조합</div><div class="panel-sub">{브랜드}_{목적}_{YYYYMMDD}</div></div></div>' +

          '<div class="field">' +
            '<label>브랜드 / 제품 <span class="req">필수</span></label>' +
            '<input type="text" class="input" data-camp="brand" placeholder="newbalance" value="' + utmEscapeHtml(c.brand) + '">' +
            '<div class="field-hint">브랜드명 또는 제품 라인. 예: newbalance, 530, kids.</div>' +
          '</div>' +

          '<div class="field">' +
            '<label>캠페인 목적 <span class="req">필수</span></label>' +
            '<select class="input" data-camp="purpose">' +
              UTM_PURPOSES.map(function (o) {
                return '<option value="' + o.v + '"' + (c.purpose === o.v ? ' selected' : '') + '>' + o.label + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +

          '<div class="field">' +
            '<label>날짜 (YYYYMMDD) <span class="opt">선택</span></label>' +
            '<input type="text" class="input" data-camp="date" placeholder="20260601" maxlength="8" inputmode="numeric" value="' + utmEscapeHtml(c.date) + '">' +
            '<div class="field-hint">시작일을 8자리 숫자로 직접 입력하세요. 예: 2026년 6월 1일 → 20260601. (비워도 됩니다)</div>' +
          '</div>' +

          '<div data-camp-warn></div>' +
        '</div>' +

        '<div class="panel panel-sticky">' +
          '<div class="panel-head"><span class="ico">✨</span><div><div class="panel-title">생성된 캠페인명</div><div class="panel-sub">utm_campaign 값으로 사용</div></div></div>' +
          '<div class="codebox" data-camp-out style="margin-bottom:14px;font-size:14px;"></div>' +
          '<div class="btn-row">' +
            '<button class="btn btn-primary copy-btn" data-camp-copy>📋 복사</button>' +
            '<button class="btn btn-ghost" data-camp-tosingle>① 단일 생성 탭에 적용 →</button>' +
          '</div>' +

          '<div class="callout ok"><span class="c-ico">✅</span><div><b>좋은 예</b><br>newbalance_sale_20260601<br>530_conversion_20260315<br>kids_launch_20260701</div></div>' +
          '<div class="callout danger"><span class="c-ico">🚫</span><div><b>나쁜 예</b><br>여름세일 (한글) · Summer Sale (대문자·공백) · 6월캠페인!! (특수문자) → GA에서 제각각 집계됩니다.</div></div>' +
          '<div class="callout info"><span class="c-ico">💡</span><div>팀 전체가 <b>같은 형식</b>으로 만들면 GA4 캠페인 보고서가 깔끔해집니다. 날짜는 캠페인 <b>시작일</b> 기준으로 통일하세요.</div></div>' +
        '</div>' +
      '</div>';

    // 입력 바인딩
    var fields = body.querySelectorAll('[data-camp]');
    for (var i = 0; i < fields.length; i++) {
      (function (el) {
        var key = el.getAttribute('data-camp');
        var evt = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(evt, function () {
          c[key] = el.value;
          utmSaveState();
          utmCampUpdate(body);
        });
      })(fields[i]);
    }

    // 복사
    var copyBtn = body.querySelector('[data-camp-copy]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var name = utmCampName();
        if (name) copyToClipboard(name, copyBtn);
      });
    }

    // 탭1에 적용
    var toSingle = body.querySelector('[data-camp-tosingle]');
    if (toSingle) {
      toSingle.addEventListener('click', function () {
        var name = utmCampName();
        if (!name) return;
        utmState.single.campaign = name; // 이미 규칙 적용된 값
        utmState.tab = 'single';
        utmSaveState();
        // 셸 탭 active 갱신
        var root = document.getElementById('page-tool-utm');
        if (root) {
          var btns = root.querySelectorAll('[data-utm-seg] .seg-btn');
          for (var k = 0; k < btns.length; k++) {
            btns[k].classList.toggle('on', btns[k].getAttribute('data-utm-tab') === 'single');
          }
          utmRenderBody(root);
        }
      });
    }

    utmCampUpdate(body);
  }

  // 캠페인명 조립 (항상 소문자·언더스코어 규칙 적용)
  function utmCampName() {
    var c = utmState.camp;
    var brand = utmNormalize(c.brand);
    var purpose = utmNormalize(c.purpose);
    if (!brand || !purpose) return '';
    var parts = [brand, purpose];
    var date = (c.date || '').replace(/[^0-9]/g, '');
    if (date) parts.push(date);
    return parts.join('_');
  }

  function utmCampUpdate(body) {
    var c = utmState.camp;
    var name = utmCampName();
    var out = body.querySelector('[data-camp-out]');
    var warnEl = body.querySelector('[data-camp-warn]');
    var copyBtn = body.querySelector('[data-camp-copy]');
    var toSingle = body.querySelector('[data-camp-tosingle]');

    if (out) {
      if (name) {
        out.classList.remove('empty');
        out.innerHTML = utmEscapeHtml(name);
      } else {
        out.classList.add('empty');
        out.innerHTML = '<span class="ph">브랜드와 목적을 입력하면 캠페인명이 생성됩니다.</span>';
      }
    }

    // 날짜 형식 경고
    var warnHtml = '';
    var rawDate = (c.date || '').trim();
    if (rawDate) {
      var digits = rawDate.replace(/[^0-9]/g, '');
      if (!/^\d{8}$/.test(digits)) {
        warnHtml += '<div class="callout warn"><span class="c-ico">⚠️</span><div>날짜는 <b>YYYYMMDD 8자리 숫자</b> 권장입니다. 예: 20260601. (현재 입력은 형식에 맞지 않아 숫자만 사용됩니다)</div></div>';
      }
    }
    if (!utmNormalize(c.brand)) {
      warnHtml += '<div class="callout danger"><span class="c-ico">🔴</span><div>브랜드/제품을 입력하세요.</div></div>';
    }
    if (warnEl) warnEl.innerHTML = warnHtml;

    var disabled = !name;
    if (copyBtn) copyBtn.disabled = disabled;
    if (toSingle) toSingle.disabled = disabled;
  }

  // ── 진입점 노출 ──
  window.renderUtmTool = function () {
    utmRender();
  };
})();
