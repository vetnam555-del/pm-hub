// ============================================================
// mediamix.js — 미디어믹스 플래너 (제안서 제출용)
// 진입점: window.renderMediamixTool()   (컨테이너 id="page-tool-mediamix")
// 보조 진입점:
//   window.mediamixPrefill({platform, industry, device})  — 다른 페이지에서 조건 넘겨 열기
//   window.mmRenderLookup(el)                             — 벤치마크 페이지에 '업종별 실측표' 삽입
//
// 설계 근거 — 실제 클라이언트 산출물 3종의 공통 컬럼을 그대로 재현한다:
//   · 매체 / 광고유형 / 예산비중 / 예산(VAT별도) / 마크업 제외 매체비
//   · 노출 · 클릭 · CTR · CPC · CPM
//   · CVR · 전환수 · CPA · AOV · 매출 · ROAS
//   · 비고, TOTAL 행, NOTICE 면책
// 벤치마크(구글·Meta)가 없는 매체(네이버·카카오·크리테오 등)는 '직접 입력 행'으로 채운다.
//
// 데이터: js/data/mediamix-data.js 의 window.MM_DATA
// 통합 계약: ES모듈 금지 / 외부 라이브러리·CDN·네트워크 금지 / 현재시각 API 금지
//            (작성일은 사용자가 직접 입력한다 — Date() 를 쓰지 않는다)
// app.js 헬퍼: fmtInt, fmtWon, fmtWonShort, fmtPct, copyToClipboard,
//              saveToolState, loadToolState, escapeHtml
// 전역 식별자는 모두 mm* 접두사 + IIFE 캡슐화. 진입점만 window 노출.
// ============================================================
(function () {
  'use strict';

  var CID = 'page-tool-mediamix';
  var STATE_KEY = 'mediamix';
  var ALL = '전 업종(통합)';
  var VAT = 0.1; // 부가세 10%

  var mmPending = null;   // 렌더 전 prefill 보류
  var mmSeq = 1;          // 행 id 시퀀스

  // ── 화면 상태 ────────────────────────────────────────────
  function mmDefaultState() {
    return {
      // 문서 정보 (제안서 헤더)
      client: '', campaign: '', agency: 'HLL중앙', docDate: '', period: '',
      // 예산
      budget: '10000000', vatMode: 'ex', days: '30', markup: '0',
      // 벤치마크 조건
      platform: 'google', industry: ALL, device: 'MO',
      // 전환 가정 (행별로 비우면 이 값을 씀)
      cvr: '', aov: '',
      // 믹스 행
      preset: 'balanced',
      rows: []
    };
  }
  var mmState = mmDefaultState();

  // ── 프리셋 (행 시드) ─────────────────────────────────────
  var MM_PRESETS = {
    google: [
      { id: 'search_only', label: '검색 올인', alloc: { Search: 100 },
        why: '예산이 작거나 이미 발생한 수요(검색어)를 빠르게 클릭으로 바꾸는 게 목적일 때의 가장 안전한 출발점입니다. 채널을 하나로 좁혀 학습 데이터가 분산되지 않습니다.' },
      { id: 'traffic', label: '트래픽형 (검색+쇼핑)', alloc: { Search: 70, Shopping: 30 },
        why: '상품 피드가 준비된 커머스라면 검색에 쇼핑을 얹어 같은 예산으로 클릭 단가를 낮출 수 있습니다. 쇼핑은 보통 검색보다 CPC가 낮습니다.' },
      { id: 'balanced', label: '기본 (균형)', alloc: { Search: 50, Shopping: 20, Display: 10, YouTube_Instream: 10, YouTube_Shorts: 10 },
        why: '수요 포착(검색·쇼핑) + 확장(디스플레이·영상)을 동시에 켜서 어느 채널이 맞는지 표본을 빨리 모으는 구성입니다. 영상은 인스트림/쇼츠를 반씩 나눠 지면 비교가 가능합니다.' },
      { id: 'awareness', label: '인지 확장', alloc: { Display: 35, YouTube_Instream: 25, YouTube_Shorts: 20, Search: 20 },
        why: '신규 브랜드·신제품처럼 아직 검색 수요 자체가 적을 때. 해석은 CPC가 아니라 CPV·VTR·CPM 중심으로 봐야 합니다.' },
      { id: 'video', label: '영상 조회', alloc: { YouTube_Instream: 60, YouTube_Shorts: 40 },
        why: '조회수·시청완료가 핵심 KPI일 때. 인스트림(긴 영상)과 쇼츠(세로 숏폼)의 반응 차이를 같이 봅니다.' },
      { id: 'app', label: '앱 설치', alloc: { App_Android: 70, App_iOS: 30 },
        why: 'CPI 중심 구성. AOS 70 : iOS 30 은 예시 가정값이니 실제 우리 앱의 OS별 설치 비중으로 바꿔 쓰세요.' }
    ],
    meta: [
      { id: 'traffic_only', label: '트래픽 올인', alloc: { Traffic: 100 },
        why: '랜딩 유입(클릭)이 목적일 때의 기본형. 예산이 작을수록 목표를 하나로 좁히는 편이 학습에 유리합니다.' },
      { id: 'commerce', label: '커머스형 (카탈로그 중심)', alloc: { Catalog: 60, Traffic: 40 },
        why: '상품 카탈로그가 연동된 이커머스라면 다이내믹 리타겟팅(카탈로그)이 보통 가장 효율이 좋습니다. 신규 유입은 트래픽으로 보충합니다.' },
      { id: 'balanced', label: '기본 (균형)', alloc: { Traffic: 45, Catalog: 25, VideoViews: 20, Awareness: 10 },
        why: '유입·재구매·인지를 동시에 테스트해 표본을 빠르게 모으는 구성입니다.' },
      { id: 'awareness', label: '인지 확장', alloc: { VideoViews: 40, Awareness: 35, Reach: 25 },
        why: '캠페인 목표가 도달·상기도일 때. CPM·CPV 중심으로 해석하고, CTR이 낮은 것은 정상입니다.' },
      { id: 'leads', label: '리드 확보', alloc: { Leads: 100 },
        why: 'DB 수집(인스턴트 양식)이 목적일 때. 리드 단가는 업종별 편차가 크니 벤치마크를 반드시 확인하세요.' },
      { id: 'app', label: '앱 설치', alloc: { AppInstalls: 100 },
        why: 'CPI 중심 구성. Meta 앱 설치는 클릭·노출 지표도 함께 제공되어 CPI와 CPC를 같이 볼 수 있습니다.' }
    ]
  };

  // 직접 입력 행 빠른 추가 — 벤치마크에 없는 국내 매체(실제 믹스의 절반 이상을 차지한다)
  var MM_QUICK_MEDIA = [
    { media: '네이버', adType: '파워링크(검색)' },
    { media: '네이버', adType: '브랜드검색' },
    { media: '네이버', adType: '쇼핑검색' },
    { media: '네이버', adType: 'GFA(성과형 DA)' },
    { media: '카카오', adType: '비즈보드' },
    { media: '카카오', adType: '채널 메시지' },
    { media: '크리테오', adType: '리타겟팅' },
    { media: '당근마켓', adType: '지역 DA' },
    { media: '틱톡', adType: '인피드' },
    { media: '토스애즈', adType: 'DA' }
  ];

  // ── 컨테이너 · 유틸 ─────────────────────────────────────
  function mmRoot() { return document.getElementById(CID); }
  function mmQ(sel) { var r = mmRoot(); return r ? r.querySelector(sel) : null; }
  function mmQA(sel) { var r = mmRoot(); return r ? r.querySelectorAll(sel) : []; }
  function mmEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }
  function mmNum(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().replace(/,/g, '');
    if (s === '') return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }
  function mmPos(raw) { var n = mmNum(raw); return (n == null || n <= 0) ? null : n; }
  function mmDash(v) { return (v == null || !isFinite(v)) ? '–' : null; }

  // ── 데이터 접근 ─────────────────────────────────────────
  function mmDataset(pid) { var D = window.MM_DATA; return D ? (D[pid] || D.google || null) : null; }
  function mmChannels(ds) { return (ds && ds.channels) || []; }
  function mmChannel(ds, id) {
    var l = mmChannels(ds);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function mmDeviceIds(ds) { return (ds.devices || []).map(function (d) { return d.id; }); }
  function mmFindRow(ds, industry, device, channel) {
    if (!ds || !ds.rows) return null;
    for (var i = 0; i < ds.rows.length; i++) {
      var r = ds.rows[i];
      if (r[0] === industry && r[1] === device && r[2] === channel) {
        return { CPC: r[3], CTR: r[4], CPM: r[5], CPV: r[6], VTR: r[7], CPI: r[8] };
      }
    }
    return null;
  }
  // 선택 업종에 값이 없으면 '전 업종(통합)'으로 대체
  function mmBench(ds, industry, device, channel) {
    var hit = mmFindRow(ds, industry, device, channel);
    if (hit) return { b: hit, fallback: false };
    if (industry !== ALL) {
      var alt = mmFindRow(ds, ALL, device, channel);
      if (alt) return { b: alt, fallback: true };
    }
    return { b: null, fallback: false };
  }

  // ── 행 모델 ─────────────────────────────────────────────
  // kind:'bench' → channel 로 벤치마크 조회 / kind:'custom' → media·adType·단가 직접 입력
  // cpc·ctr·cvr·aov·markup 은 비워두면(null) 벤치마크/전역 기본값을 따른다.
  function mmNewRow(o) {
    return {
      id: 'r' + (mmSeq++),
      kind: o.kind || 'bench',
      channel: o.channel || '',
      media: o.media || '',
      adType: o.adType || '',
      ratio: o.ratio != null ? o.ratio : 0,
      cpc: o.cpc != null ? o.cpc : '',
      ctr: o.ctr != null ? o.ctr : '',
      cvr: o.cvr != null ? o.cvr : '',
      aov: o.aov != null ? o.aov : '',
      markup: o.markup != null ? o.markup : '',
      note: o.note || ''
    };
  }
  function mmRowById(id) {
    for (var i = 0; i < mmState.rows.length; i++) if (mmState.rows[i].id === id) return mmState.rows[i];
    return null;
  }
  function mmSeedFromPreset(presetId) {
    var ds = mmDataset(mmState.platform);
    var p = mmPreset(presetId);
    if (!ds || !p) return;
    mmState.preset = p.id;
    // 직접 입력 행은 보존하고 벤치마크 행만 갈아끼운다(네이버 등 손으로 넣은 내용 유지)
    var customs = mmState.rows.filter(function (r) { return r.kind === 'custom'; });
    var benches = [];
    mmChannels(ds).forEach(function (c) {
      if (p.alloc[c.id] > 0) benches.push(mmNewRow({ kind: 'bench', channel: c.id, ratio: p.alloc[c.id] }));
    });
    mmState.rows = benches.concat(customs);
  }
  function mmPreset(id) {
    var l = MM_PRESETS[mmState.platform] || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return l[0] || null;
  }

  // ── 상태 저장/복원 ──────────────────────────────────────
  function mmSave() { try { if (typeof saveToolState === 'function') saveToolState(STATE_KEY, mmState); } catch (e) {} }
  function mmLoad() {
    try {
      if (typeof loadToolState !== 'function') return false;
      var s = loadToolState(STATE_KEY);
      if (!s || typeof s !== 'object' || !Array.isArray(s.rows)) return false;
      var d = mmDefaultState();
      Object.keys(d).forEach(function (k) { if (s[k] != null) d[k] = s[k]; });
      if (d.platform !== 'google' && d.platform !== 'meta') d.platform = 'google';
      if (d.vatMode !== 'ex' && d.vatMode !== 'in') d.vatMode = 'ex';
      // 행 id 재발급(시퀀스 충돌 방지)
      d.rows = s.rows.map(function (r) { return mmNewRow(r); });
      mmState = d;
      return true;
    } catch (e) { return false; }
  }

  // 플랫폼/업종/디바이스를 데이터셋에 맞게 정리
  function mmSyncPlatform() {
    var ds = mmDataset(mmState.platform);
    if (!ds) return;
    if (ds.industries.indexOf(mmState.industry) < 0) mmState.industry = ALL;
    if (mmDeviceIds(ds).indexOf(mmState.device) < 0) mmState.device = ds.devices[0].id;
    if (!mmPreset(mmState.preset)) mmState.preset = (MM_PRESETS[mmState.platform][0] || {}).id;
    // 다른 플랫폼의 채널을 참조하는 벤치마크 행은 제거(직접 입력 행은 유지)
    var valid = mmChannels(ds).map(function (c) { return c.id; });
    var kept = mmState.rows.filter(function (r) { return r.kind === 'custom' || valid.indexOf(r.channel) >= 0; });
    if (kept.filter(function (r) { return r.kind === 'bench'; }).length === 0) {
      mmState.rows = kept;
      mmSeedFromPreset(mmState.preset);
    } else {
      mmState.rows = kept;
    }
  }

  // ============================================================
  // 계산
  // ============================================================
  function mmCompute() {
    var ds = mmDataset(mmState.platform);
    var raw = mmPos(mmState.budget);
    var days = mmPos(mmState.days);
    var gCvr = mmPos(mmState.cvr);
    var gAov = mmPos(mmState.aov);
    var gMarkup = mmNum(mmState.markup);
    if (gMarkup == null || gMarkup < 0) gMarkup = 0;

    // 모든 계산은 '공급가(VAT 별도)' 기준 — 매체 단가가 VAT 별도이기 때문
    var net = null, vat = null, gross = null;
    if (raw != null) {
      if (mmState.vatMode === 'in') { gross = raw; net = raw / (1 + VAT); }
      else { net = raw; gross = raw * (1 + VAT); }
      vat = gross - net;
    }

    var res = {
      ds: ds, net: net, vat: vat, gross: gross, days: days,
      gCvr: gCvr, gAov: gAov, gMarkup: gMarkup,
      rows: [], sumRatio: 0, fallbacks: [], nodata: [], missingRate: [],
      totals: { net: 0, media: 0, clicks: null, impr: null, views: null, installs: null, conv: null, revenue: null }
    };
    if (!ds) return res;

    var active = mmState.rows.filter(function (r) { return mmNum(r.ratio) > 0; });
    res.sumRatio = active.reduce(function (a, r) { return a + mmNum(r.ratio); }, 0);
    if (net == null || !active.length || res.sumRatio <= 0) return res;

    active.forEach(function (r) {
      var share = mmNum(r.ratio) / res.sumRatio;
      var rNet = net * share;

      // ── 유효 단가 결정: 행 입력값 > 벤치마크 ──
      var b = null, fallback = false, ch = null;
      if (r.kind === 'bench') {
        var hit = mmBench(ds, mmState.industry, mmState.device, r.channel);
        b = hit.b; fallback = hit.fallback;
        ch = mmChannel(ds, r.channel) || { id: r.channel, label: r.channel, short: r.channel, color: '#8892A4', role: '' };
      }
      var cpc = mmPos(r.cpc) != null ? mmPos(r.cpc) : (b && b.CPC > 0 ? b.CPC : null);
      var ctr = mmPos(r.ctr) != null ? mmPos(r.ctr) : (b && b.CTR > 0 ? b.CTR : null);
      var cpm = (b && b.CPM > 0) ? b.CPM : null;
      var cpv = (b && b.CPV > 0) ? b.CPV : null;
      var vtr = (b && b.VTR > 0) ? b.VTR : null;
      var cpi = (b && b.CPI > 0) ? b.CPI : null;
      // CPC·CTR 을 직접 입력했으면 CPM 도 그 값에서 다시 계산(입력이 벤치마크보다 우선)
      if (mmPos(r.cpc) != null || mmPos(r.ctr) != null) {
        cpm = (cpc != null && ctr != null) ? (cpc * (ctr / 100) * 1000) : cpm;
      }

      // ── 볼륨 ──
      var clicks = (cpc != null) ? rNet / cpc : null;
      var views = (cpv != null) ? rNet / cpv : null;
      var installs = (cpi != null) ? rNet / cpi : null;
      var impr = null;
      if (cpm != null) impr = rNet / cpm * 1000;
      else if (clicks != null && ctr != null) impr = clicks / (ctr / 100);
      else if (views != null && vtr != null) impr = views / (vtr / 100);

      // ── 전환·매출 ──
      // 앱 채널은 '설치'가 곧 전환. 그 외는 클릭 × CVR.
      var cvr = mmPos(r.cvr) != null ? mmPos(r.cvr) : gCvr;
      var aov = mmPos(r.aov) != null ? mmPos(r.aov) : gAov;
      var conv = null;
      if (installs != null) conv = installs;
      else if (clicks != null && cvr != null) conv = clicks * cvr / 100;
      var revenue = (conv != null && aov != null) ? conv * aov : null;
      var cpa = (conv != null && conv > 0) ? rNet / conv : null;
      var roas = (revenue != null && rNet > 0) ? revenue / rNet * 100 : null;

      // ── 마크업(대행 수수료 제외 실매체비) ──
      var mk = mmNum(r.markup);
      if (mk == null || mk < 0) mk = gMarkup;
      var media = rNet / (1 + mk / 100);

      var name = (r.kind === 'bench') ? (ds.label) : (r.media || '(매체명 미입력)');
      var type = (r.kind === 'bench') ? (ch ? ch.label : r.channel) : (r.adType || '-');

      res.rows.push({
        ref: r, kind: r.kind, ch: ch, name: name, type: type,
        share: share, net: rNet, media: media, markup: mk,
        cpc: cpc, ctr: ctr, cpm: cpm, cpv: cpv, vtr: vtr, cpi: cpi,
        clicks: clicks, impr: impr, views: views, installs: installs,
        cvr: cvr, aov: aov, conv: conv, revenue: revenue, cpa: cpa, roas: roas,
        fallback: fallback, note: r.note,
        daily: days ? rNet / days : null,
        color: ch ? ch.color : '#8892A4'
      });

      res.totals.net += rNet;
      res.totals.media += media;
      if (clicks != null) res.totals.clicks = (res.totals.clicks || 0) + clicks;
      if (impr != null) res.totals.impr = (res.totals.impr || 0) + impr;
      if (views != null) res.totals.views = (res.totals.views || 0) + views;
      if (installs != null) res.totals.installs = (res.totals.installs || 0) + installs;
      if (conv != null) res.totals.conv = (res.totals.conv || 0) + conv;
      if (revenue != null) res.totals.revenue = (res.totals.revenue || 0) + revenue;

      if (fallback) res.fallbacks.push(type);
      if (r.kind === 'bench' && !b) res.nodata.push(type);
      if (cpc == null && cpv == null && cpi == null) res.missingRate.push(type);
    });

    res.benchCount = res.rows.filter(function (r) { return r.kind === 'bench'; }).length;
    var t = res.totals;
    t.ctr = (t.clicks != null && t.impr) ? t.clicks / t.impr * 100 : null;
    t.cpc = (t.clicks) ? t.net / t.clicks : null;
    t.cpm = (t.impr) ? t.net / t.impr * 1000 : null;
    t.cpa = (t.conv) ? t.net / t.conv : null;
    t.roas = (t.revenue != null && t.net > 0) ? t.revenue / t.net * 100 : null;
    t.vatIncl = t.net * (1 + VAT);
    return res;
  }

  // ============================================================
  // 입력 UI — 문서 정보 / 예산·조건
  // ============================================================
  function mmField(id, label, val, ph, hint, unit, req) {
    var badge = req ? '<span class="req">필수</span>' : '<span class="opt">선택</span>';
    var inp = '<input type="text" class="input" id="' + id + '" value="' + mmEsc(val) + '" placeholder="' + mmEsc(ph) + '" autocomplete="off">';
    if (unit) inp = '<div class="input-affix">' + inp.replace('class="input"', 'class="input" inputmode="numeric"') + '<span class="affix">' + unit + '</span></div>';
    return '<div class="field"><label for="' + id + '">' + label + ' ' + badge + '</label>' + inp +
      (hint ? '<div class="field-hint">' + hint + '</div>' : '') + '</div>';
  }

  function mmDocPanel() {
    return '' +
    '<div class="panel mm-noprint">' +
      '<div class="panel-head"><span class="ico">📋</span><div>' +
        '<div class="panel-title">문서 정보</div>' +
        '<div class="panel-sub">제안서 상단에 그대로 찍힙니다</div>' +
      '</div></div>' +
      '<div class="field-row">' +
        mmField('mm-client', '광고주', mmState.client, '예: 뉴발란스', '', '', true) +
        mmField('mm-campaign', '캠페인', mmState.campaign, '예: 26년 10월 퍼포먼스', '') +
      '</div>' +
      '<div class="field-row">' +
        mmField('mm-period', '집행 기간', mmState.period, '예: 2026.10.01 ~ 10.31', '') +
        mmField('mm-docdate', '작성일', mmState.docDate, '예: 2026.09.06', '자동 입력하지 않습니다 — 견적일을 직접 적으세요') +
      '</div>' +
      mmField('mm-agency', '작성 주체', mmState.agency, '예: HLL중앙', '') +
    '</div>';
  }

  function mmBudgetPanel() {
    var ds = mmDataset(mmState.platform);
    var industryOpts = ds.industries.map(function (i) {
      return '<option value="' + mmEsc(i) + '"' + (i === mmState.industry ? ' selected' : '') + '>' + mmEsc(i) + '</option>';
    }).join('');
    var deviceOpts = ds.devices.map(function (d) {
      return '<option value="' + mmEsc(d.id) + '"' + (d.id === mmState.device ? ' selected' : '') + '>' + mmEsc(d.label) + '</option>';
    }).join('');

    return '' +
    '<div class="panel mm-noprint">' +
      '<div class="panel-head"><span class="ico">💰</span><div>' +
        '<div class="panel-title">예산 · 벤치마크 조건</div>' +
        '<div class="panel-sub">벤치마크는 구글·Meta 채널 행에만 적용됩니다</div>' +
      '</div></div>' +

      '<div class="field">' +
        '<label for="mm-budget">총 예산 <span class="req">필수</span></label>' +
        '<div class="input-affix"><input type="text" inputmode="numeric" class="input" id="mm-budget" value="' + mmEsc(mmState.budget) + '" placeholder="10000000"><span class="affix">원</span></div>' +
        '<div class="seg" id="mm-vat-seg" style="margin-top:8px">' +
          '<button type="button" class="seg-btn' + (mmState.vatMode === 'ex' ? ' on' : '') + '" data-vat="ex">VAT 별도</button>' +
          '<button type="button" class="seg-btn' + (mmState.vatMode === 'in' ? ' on' : '') + '" data-vat="in">VAT 포함</button>' +
        '</div>' +
        '<div class="qtags" id="mm-budget-tags">' +
          '<button type="button" class="qtag" data-v="3000000">300만</button>' +
          '<button type="button" class="qtag" data-v="10000000">1,000만</button>' +
          '<button type="button" class="qtag" data-v="45000000">4,500만</button>' +
          '<button type="button" class="qtag" data-v="100000000">1억</button>' +
        '</div>' +
        '<div class="field-hint">매체 단가는 <b>VAT 별도</b> 기준이라, 계산은 항상 공급가로 환산해 수행합니다.</div>' +
      '</div>' +

      '<div class="field-row">' +
        '<div class="field"><label for="mm-days">집행 일수 <span class="opt">선택</span></label>' +
          '<div class="input-affix"><input type="text" inputmode="numeric" class="input" id="mm-days" value="' + mmEsc(mmState.days) + '" placeholder="30"><span class="affix">일</span></div></div>' +
        '<div class="field"><label for="mm-markup">기본 마크업 <span class="opt">선택</span></label>' +
          '<div class="input-affix"><input type="text" inputmode="decimal" class="input" id="mm-markup" value="' + mmEsc(mmState.markup) + '" placeholder="0"><span class="affix">%</span></div>' +
          '<div class="field-hint">해외매체 수수료 등. 행별로 다르면 표에서 개별 입력</div></div>' +
      '</div>' +

      '<div class="field-row">' +
        '<div class="field"><label for="mm-cvr">기본 전환율(CVR) <span class="opt">선택</span></label>' +
          '<div class="input-affix"><input type="text" inputmode="decimal" class="input" id="mm-cvr" value="' + mmEsc(mmState.cvr) + '" placeholder="1.5"><span class="affix">%</span></div></div>' +
        '<div class="field"><label for="mm-aov">기본 객단가(AOV) <span class="opt">선택</span></label>' +
          '<div class="input-affix"><input type="text" inputmode="numeric" class="input" id="mm-aov" value="' + mmEsc(mmState.aov) + '" placeholder="70000"><span class="affix">원</span></div></div>' +
      '</div>' +
      '<div class="field-hint" style="margin-top:-8px">CVR·AOV를 넣어야 <b>전환수·CPA·매출·ROAS</b>가 나옵니다. 우리 계정 과거 실적값을 쓰세요 — 벤치마크에는 전환 데이터가 없습니다.</div>' +

      '<div class="field" style="margin-top:16px">' +
        '<label class="field-label">벤치마크 기준</label>' +
        '<div class="seg" id="mm-platform-seg">' +
          '<button type="button" class="seg-btn' + (mmState.platform === 'google' ? ' on' : '') + '" data-platform="google">구글 Ads</button>' +
          '<button type="button" class="seg-btn' + (mmState.platform === 'meta' ? ' on' : '') + '" data-platform="meta">Meta Ads</button>' +
        '</div>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label for="mm-industry">업종</label><select class="input" id="mm-industry">' + industryOpts + '</select></div>' +
        '<div class="field"><label for="mm-device">' + mmEsc(ds.deviceLabel || '디바이스') + '</label>' +
          '<select class="input" id="mm-device"' + (ds.devices.length < 2 ? ' disabled' : '') + '>' + deviceOpts + '</select></div>' +
      '</div>' +
    '</div>';
  }

  // ============================================================
  // 믹스 구성 (편집 표)
  // ============================================================
  function mmCell(row, f, ph, w) {
    return '<input type="text" inputmode="decimal" class="input mm-cell" data-row="' + row.id + '" data-f="' + f + '" ' +
      'value="' + mmEsc(row[f]) + '" placeholder="' + mmEsc(ph) + '"' + (w ? ' style="width:' + w + 'px"' : '') + '>';
  }
  function mmTextCell(row, f, ph, w) {
    return '<input type="text" class="input mm-cell" data-row="' + row.id + '" data-f="' + f + '" ' +
      'value="' + mmEsc(row[f]) + '" placeholder="' + mmEsc(ph) + '"' + (w ? ' style="width:' + w + 'px"' : '') + '>';
  }

  function mmMixPanel() {
    var ds = mmDataset(mmState.platform);
    var presets = MM_PRESETS[mmState.platform] || [];
    var presetChips = presets.map(function (p) {
      return '<button type="button" class="qtag' + (p.id === mmState.preset ? ' on' : '') + '" data-preset="' + mmEsc(p.id) + '">' + mmEsc(p.label) + '</button>';
    }).join('');

    var benchOpts = mmChannels(ds).map(function (c) {
      return '<option value="' + mmEsc(c.id) + '">' + mmEsc(c.label) + '</option>';
    }).join('');
    var quickOpts = MM_QUICK_MEDIA.map(function (m, i) {
      return '<option value="' + i + '">' + mmEsc(m.media + ' · ' + m.adType) + '</option>';
    }).join('');

    var rows = mmState.rows.map(function (r) {
      var isB = r.kind === 'bench';
      var ch = isB ? mmChannel(ds, r.channel) : null;
      var hit = isB ? mmBench(ds, mmState.industry, mmState.device, r.channel) : { b: null, fallback: false };
      var b = hit.b;
      var phCpc = (b && b.CPC > 0) ? fmtInt(b.CPC) + ' (벤치)' : (isB ? '해당 없음' : '직접 입력');
      var phCtr = (b && b.CTR > 0) ? Number(b.CTR).toFixed(2) + ' (벤치)' : (isB ? '해당 없음' : '직접 입력');

      var nameCell = isB
        ? '<span class="mm-dot" style="background:' + mmEsc(ch ? ch.color : '#8892A4') + '"></span>' +
          '<b style="color:var(--text-primary)">' + mmEsc(ch ? ch.label : r.channel) + '</b>' +
          (ch && ch.est ? ' <span class="mm-badge">추정</span>' : '') +
          (hit.fallback ? ' <span class="mm-badge warn">통합 대체</span>' : '') +
          '<div class="mm-sub">' + mmEsc(ds.label) + ' 벤치마크</div>'
        : '<div class="mm-custom-name">' + mmTextCell(r, 'media', '매체명', 92) + mmTextCell(r, 'adType', '광고유형', 104) + '</div>';

      return '<tr data-row="' + r.id + '">' +
        '<td class="mm-name-cell">' + nameCell + '</td>' +
        '<td class="num">' + mmCell(r, 'ratio', '0', 58) + '</td>' +
        '<td class="num">' + mmCell(r, 'cpc', phCpc, 88) + '</td>' +
        '<td class="num">' + mmCell(r, 'ctr', phCtr, 80) + '</td>' +
        '<td class="num">' + mmCell(r, 'cvr', mmState.cvr ? mmState.cvr + ' (기본)' : 'CVR', 72) + '</td>' +
        '<td class="num">' + mmCell(r, 'aov', mmState.aov ? fmtInt(mmNum(mmState.aov)) + ' (기본)' : 'AOV', 88) + '</td>' +
        '<td class="num">' + mmCell(r, 'markup', (mmState.markup || '0') + ' (기본)', 68) + '</td>' +
        '<td>' + mmTextCell(r, 'note', '운영 메모', 150) + '</td>' +
        '<td class="num"><button type="button" class="mm-del" data-del="' + r.id + '" aria-label="행 삭제" title="행 삭제">✕</button></td>' +
      '</tr>';
    }).join('');

    return '' +
    '<div class="panel mm-noprint">' +
      '<div class="panel-head"><span class="ico">🧩</span><div>' +
        '<div class="panel-title">믹스 구성</div>' +
        '<div class="panel-sub">빈칸은 벤치마크·기본값을 따릅니다 — 값을 넣으면 그 값이 우선</div>' +
      '</div></div>' +

      '<div class="qtags" id="mm-preset-chips">' + presetChips + '</div>' +
      '<div class="field-hint" id="mm-preset-why" style="margin-bottom:12px"></div>' +

      '<div class="table-scroll">' +
        '<table class="t-table mm-edit">' +
          '<thead><tr>' +
            '<th style="min-width:200px">매체 · 광고유형</th>' +
            '<th class="num">비중%</th><th class="num">CPC</th><th class="num">CTR%</th>' +
            '<th class="num">CVR%</th><th class="num">AOV</th><th class="num">마크업%</th>' +
            '<th>비고</th><th class="num"></th>' +
          '</tr></thead>' +
          '<tbody>' + (rows || '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px">행이 없습니다 — 아래에서 채널을 추가하세요</td></tr>') + '</tbody>' +
        '</table>' +
      '</div>' +

      '<div class="field-hint" id="mm-ratio-hint" style="margin-top:10px"></div>' +

      '<div class="mm-addbar">' +
        '<div class="mm-addgrp">' +
          '<select class="input" id="mm-add-bench">' + benchOpts + '</select>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="mm-add-bench-btn">+ 벤치마크 채널</button>' +
        '</div>' +
        '<div class="mm-addgrp">' +
          '<select class="input" id="mm-add-quick">' + quickOpts + '</select>' +
          '<button type="button" class="btn btn-ghost btn-sm" id="mm-add-quick-btn">+ 국내 매체</button>' +
        '</div>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="mm-add-blank">+ 빈 행</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="mm-normalize">⚖️ 합계 100%</button>' +
      '</div>' +
      '<div class="callout info"><span class="c-ico">💡</span><div>' +
        '벤치마크에는 <b>네이버·카카오·크리테오가 없습니다</b>(구글·Meta 집행 데이터라서). 실제 믹스에서 비중이 큰 국내 매체는 ' +
        '<b>[+ 국내 매체]</b>로 행을 추가하고 <b>우리 계정 과거 실적</b>의 CPC·CTR·CVR을 직접 넣으세요.' +
      '</div></div>' +
    '</div>';
  }

  // ============================================================
  // 결과 — 미디어믹스 표 (제안서 포맷)
  // ============================================================
  function mmMetric(label, value, sub, cls) {
    return '<div class="metric' + (cls ? ' ' + cls : '') + '">' +
      '<div class="m-label">' + label + '</div><div class="m-value">' + value + '</div>' +
      (sub ? '<div class="m-sub">' + sub + '</div>' : '') + '</div>';
  }
  function mmN(v, unit) { return (v == null || !isFinite(v)) ? '–' : fmtInt(v) + (unit ? '<span class="unit">' + unit + '</span>' : ''); }
  function mmW(v) { return (v == null || !isFinite(v)) ? '–' : fmtWon(v); }
  function mmP(v, d) { return (v == null || !isFinite(v)) ? '–' : fmtPct(v, d == null ? 2 : d); }

  function mmResultHtml(res) {
    if (!res.ds) return '<div class="callout danger"><span class="c-ico">⛔</span><div>벤치마크 데이터를 불러오지 못했습니다. <code>js/data/mediamix-data.js</code> 로딩을 확인하세요.</div></div>';
    if (res.net == null) {
      return '<div class="empty-state"><div class="e-ico">🧩</div><div class="e-txt"><b>총 예산</b>을 입력하면<br>미디어믹스가 생성됩니다.</div></div>';
    }
    if (!res.rows.length) {
      return '<div class="callout warn"><span class="c-ico">⚠️</span><div>배분할 행이 없습니다. 위 표에서 <b>비중%</b>를 1 이상 입력하거나 프리셋을 선택하세요.</div></div>';
    }

    var t = res.totals;
    var hasConv = t.conv != null && t.conv > 0;
    var hasRev = t.revenue != null && t.revenue > 0;
    var showViews = res.rows.some(function (r) { return r.views != null; });

    // ── 제안서 헤더 (인쇄 시에도 남는다) ──
    var head = '<div class="mm-doc">' +
      '<div class="mm-doc-top">' +
        '<div class="mm-doc-title">' + mmEsc(mmState.client || '(광고주명)') + ' · 미디어믹스</div>' +
        '<div class="mm-doc-sub">' +
          (mmState.campaign ? mmEsc(mmState.campaign) + ' · ' : '') +
          (mmState.period ? mmEsc(mmState.period) : (res.days ? fmtInt(res.days) + '일' : '기간 미입력')) +
        '</div>' +
      '</div>' +
      '<div class="mm-doc-meta">' +
        (mmState.agency ? '<span>작성 ' + mmEsc(mmState.agency) + '</span>' : '') +
        (mmState.docDate ? '<span>견적일 ' + mmEsc(mmState.docDate) + '</span>' : '') +
        (res.benchCount
          ? '<span>단가 근거 ' + mmEsc(res.ds.label) + ' ' + mmEsc(res.ds.period) + ' 벤치마크(' + mmEsc(mmState.industry) + ') ' + res.benchCount + '행'
            + (res.rows.length > res.benchCount ? ' · 직접 입력 ' + (res.rows.length - res.benchCount) + '행' : '') + '</span>'
          : '<span>단가 근거 전 행 직접 입력(자사 실적 기준)</span>') +
      '</div>' +
    '</div>';

    // ── 요약 지표 ──
    var html = head + '<div class="result-grid c3" style="margin-top:14px">';
    html += mmMetric('💰 총 예산 (VAT 별도)', fmtWonShort(t.net) + '<span class="unit">원</span>',
      fmtWon(t.net) + ' · VAT 포함 ' + fmtWon(t.vatIncl), 'primary');
    html += mmMetric('👁 예상 노출', mmN(t.impr, '회'), t.cpm != null ? 'CPM ' + fmtWon(t.cpm) : '산출 불가');
    html += mmMetric('👆 예상 클릭', mmN(t.clicks, '회'), t.cpc != null ? 'CPC ' + fmtWon(t.cpc) : '산출 불가');
    html += mmMetric('📐 예상 CTR', mmP(t.ctr), '클릭 ÷ 노출');
    if (hasConv) html += mmMetric('🎯 예상 전환', mmN(t.conv, '건'), t.cpa != null ? 'CPA ' + fmtWon(t.cpa) : '');
    if (hasRev) html += mmMetric('💵 예상 매출', fmtWonShort(t.revenue) + '<span class="unit">원</span>', fmtWon(t.revenue));
    if (t.roas != null) {
      html += mmMetric('📈 예상 ROAS', mmP(t.roas, 0), '매출 ÷ 광고비', t.roas >= 100 ? 'good' : 'bad');
    }
    if (showViews) html += mmMetric('▶️ 예상 조회', mmN(t.views, '회'), '영상 채널 합계');
    html += '</div>';

    // ── 배분 막대 ──
    html += '<div style="margin-top:18px">' +
      '<div class="panel-sub" style="margin-bottom:8px;font-weight:700">예산 배분</div>' +
      '<div class="mm-bar">' + res.rows.map(function (r) {
        return '<div style="width:' + (r.share * 100).toFixed(2) + '%;background:' + mmEsc(r.color) + '" title="' + mmEsc(r.type) + '"></div>';
      }).join('') + '</div>' +
      '<div class="legend">' + res.rows.map(function (r) {
        return '<div class="legend-item"><span class="legend-dot" style="background:' + mmEsc(r.color) + '"></span>' +
          mmEsc(r.type) + ' ' + (r.share * 100).toFixed(1) + '% · ' + fmtWonShort(r.net) + '원</div>';
      }).join('') + '</div></div>';

    // ── 미디어믹스 표 ──
    var showMarkup = res.rows.some(function (r) { return r.markup > 0; });
    var th = '<tr>' +
      '<th style="min-width:150px">매체 · 광고유형</th>' +
      '<th class="num">비중</th><th class="num">예산<br><span class="mm-th-sub">VAT 별도</span></th>' +
      (showMarkup ? '<th class="num">매체비<br><span class="mm-th-sub">마크업 제외</span></th>' : '') +
      (res.days ? '<th class="num">일 예산</th>' : '') +
      '<th class="num">노출</th><th class="num">클릭</th><th class="num">CTR</th><th class="num">CPC</th><th class="num">CPM</th>' +
      (showViews ? '<th class="num">조회</th>' : '') +
      (hasConv ? '<th class="num">CVR</th><th class="num">전환</th><th class="num">CPA</th>' : '') +
      (hasRev ? '<th class="num">매출</th><th class="num">ROAS</th>' : '') +
      '<th style="min-width:110px">비고</th></tr>';

    var tb = res.rows.map(function (r) {
      return '<tr>' +
        '<td class="mm-name-cell"><span class="mm-dot" style="background:' + mmEsc(r.color) + '"></span>' +
          '<b style="color:var(--text-primary)">' + mmEsc(r.type) + '</b>' +
          (r.ch && r.ch.est ? ' <span class="mm-badge">추정</span>' : '') +
          (r.fallback ? ' <span class="mm-badge warn">통합 대체</span>' : '') +
          (r.kind === 'custom' ? ' <span class="mm-badge">직접 입력</span>' : '') +
          '<div class="mm-sub">' + mmEsc(r.name) + '</div></td>' +
        '<td class="num">' + (r.share * 100).toFixed(1) + '%</td>' +
        '<td class="num">' + mmW(r.net) + '</td>' +
        (showMarkup ? '<td class="num">' + mmW(r.media) + '</td>' : '') +
        (res.days ? '<td class="num">' + mmW(r.daily) + '</td>' : '') +
        '<td class="num">' + mmN(r.impr) + '</td>' +
        '<td class="num">' + mmN(r.clicks) + '</td>' +
        '<td class="num">' + mmP(r.ctr) + '</td>' +
        '<td class="num">' + mmW(r.cpc) + '</td>' +
        '<td class="num">' + mmW(r.cpm) + '</td>' +
        (showViews ? '<td class="num">' + mmN(r.views) + '</td>' : '') +
        (hasConv ? '<td class="num">' + (r.installs != null ? '<span title="앱 설치는 설치수가 곧 전환">설치</span>' : mmP(r.cvr)) + '</td>' +
                   '<td class="num">' + mmN(r.conv) + '</td><td class="num">' + mmW(r.cpa) + '</td>' : '') +
        (hasRev ? '<td class="num">' + mmW(r.revenue) + '</td><td class="num">' + mmP(r.roas, 0) + '</td>' : '') +
        '<td class="mm-note">' + mmEsc(r.note) + '</td>' +
      '</tr>';
    }).join('');

    var tf = '<tr class="total">' +
      '<td>TOTAL</td><td class="num">100%</td><td class="num">' + mmW(t.net) + '</td>' +
      (showMarkup ? '<td class="num">' + mmW(t.media) + '</td>' : '') +
      (res.days ? '<td class="num">' + mmW(t.net / res.days) + '</td>' : '') +
      '<td class="num">' + mmN(t.impr) + '</td><td class="num">' + mmN(t.clicks) + '</td>' +
      '<td class="num">' + mmP(t.ctr) + '</td><td class="num">' + mmW(t.cpc) + '</td><td class="num">' + mmW(t.cpm) + '</td>' +
      (showViews ? '<td class="num">' + mmN(t.views) + '</td>' : '') +
      (hasConv ? '<td class="num">–</td><td class="num">' + mmN(t.conv) + '</td><td class="num">' + mmW(t.cpa) + '</td>' : '') +
      (hasRev ? '<td class="num">' + mmW(t.revenue) + '</td><td class="num">' + mmP(t.roas, 0) + '</td>' : '') +
      '<td></td></tr>';

    html += '<div class="table-scroll" style="margin-top:16px"><table class="t-table mm-mix"><thead>' + th + '</thead><tbody>' + tb + tf + '</tbody></table></div>';

    // ── VAT 요약 ──
    html += '<div class="mm-vat"><span>공급가 ' + fmtWon(t.net) + '</span><span>부가세 ' + fmtWon(t.net * VAT) + '</span>' +
      '<b>합계(VAT 포함) ' + fmtWon(t.vatIncl) + '</b></div>';

    // ── 경고 ──
    if (res.missingRate.length) {
      html += '<div class="callout danger"><span class="c-ico">⛔</span><div>' +
        '<b>' + mmEsc(res.missingRate.join(', ')) + '</b> 은(는) 단가(CPC/CPV/CPI)가 없어 볼륨이 계산되지 않았습니다. ' +
        '표에서 <b>CPC</b>를 직접 입력하거나 다른 채널로 바꾸세요. 이 상태로는 제안서에 쓸 수 없습니다.</div></div>';
    }
    if (res.fallbacks.length) {
      html += '<div class="callout warn"><span class="c-ico">⚠️</span><div>' +
        '<b>' + mmEsc(res.fallbacks.join(', ')) + '</b> 은(는) <b>' + mmEsc(mmState.industry) + '</b> 데이터가 없어 ' +
        '<b>전 업종(통합)</b> 값으로 대체했습니다. 업종 특성이 반영되지 않았으니 확정 전 실적으로 보정하세요.</div></div>';
    }
    if (!hasConv) {
      html += '<div class="callout warn"><span class="c-ico">🎯</span><div>' +
        '<b>전환·매출·ROAS가 비어 있습니다.</b> 벤치마크에는 전환 데이터가 없어, <b>기본 전환율(CVR)</b>과 <b>기본 객단가(AOV)</b>를 ' +
        '입력해야 전환수·CPA·매출·ROAS가 산출됩니다. 광고주 제안서라면 이 컬럼이 사실상 필수입니다.</div></div>';
    }
    if (res.days) {
      var thin = res.rows.filter(function (r) {
        var unit = r.cpc || r.cpi;
        return unit && r.daily != null && r.daily < unit * 20;
      }).map(function (r) { return r.type; });
      if (thin.length) {
        html += '<div class="callout warn"><span class="c-ico">📉</span><div>' +
          '<b>' + mmEsc(thin.join(', ')) + '</b> 은(는) 일 예산이 단가 대비 작아 <b>하루 20클릭(또는 설치) 미만</b>이 예상됩니다. ' +
          '머신러닝 학습에 필요한 데이터가 안 쌓일 수 있으니 채널 수를 줄이거나 기간을 늘리세요.</div></div>';
    }
    }
    if (Math.abs(res.sumRatio - 100) > 0.05) {
      html += '<div class="callout info"><span class="c-ico">ℹ️</span><div>' +
        '입력한 비중 합계가 <b>' + (Math.round(res.sumRatio * 10) / 10) + '%</b> 라서, <b>비율대로 정규화</b>해 총예산을 전액 배분했습니다. ' +
        '표의 비중 컬럼은 정규화 후 값입니다.</div></div>';
    }

    // ── NOTICE (제안서 하단 면책 — 인쇄에도 남는다) ──
    html += '<div class="mm-notice">' +
      '<div class="mm-notice-t">NOTICE</div>' +
      '<ul>' +
        '<li>본 미디어믹스는 ' + (res.benchCount
          ? '<b>' + mmEsc(res.ds.label) + ' ' + mmEsc(res.ds.period) + ' 업종 평균 벤치마크</b>와 입력된 가정값'
          : '<b>입력된 단가·전환 가정값</b>') + '을 근거로 작성된 <b>추정치</b>이며, 실제 집행 결과와 다를 수 있습니다.</li>' +
        '<li>매체별 인벤토리·경쟁 상황·시즌에 따라 단가와 볼륨은 변동됩니다. 실집행 시 세부 내역이 조정될 수 있습니다.</li>' +
        '<li>모든 금액은 <b>VAT 별도</b> 기준이며, 표 하단에 부가세 포함 금액을 병기했습니다.</li>' +
        (res.rows.some(function (r) { return r.markup > 0; }) ? '<li>마크업(대행 수수료)이 적용된 행은 <b>매체비(마크업 제외)</b> 컬럼에 실 매체 집행가를 별도 표기했습니다.</li>' : '') +
        '<li>전환·매출 지표는 입력된 <b>CVR·객단가 가정</b>에 따른 산출값으로, 보장 수치가 아닙니다.</li>' +
      '</ul></div>';

    // ── 액션 ──
    html += '<div class="btn-row mm-noprint">' +
      '<button type="button" class="btn btn-primary btn-sm copy-btn" id="mm-copy-mix">📊 미디어믹스 복사 (엑셀 붙여넣기)</button>' +
      '<button type="button" class="btn btn-ghost btn-sm copy-btn" id="mm-copy-text">📋 요약 복사 (메일·메신저)</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="mm-print">🖨 인쇄 / PDF</button>' +
      '</div>' +
      '<div class="btn-row mm-noprint">' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="showPage(\'tool-budget\')">💰 손익분기로 검증</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="showPage(\'tool-kpi\')">📊 KPI 계산기</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" onclick="showPage(\'benchmark\')">📊 매체 벤치마크</button>' +
      '</div>';

    return html;
  }

  // ── 내보내기 ────────────────────────────────────────────
  function mmMixTsv(res) {
    var t = res.totals;
    var showMarkup = res.rows.some(function (r) { return r.markup > 0; });
    var hasConv = t.conv != null && t.conv > 0;
    var hasRev = t.revenue != null && t.revenue > 0;
    var showViews = res.rows.some(function (r) { return r.views != null; });
    var L = [];

    L.push(['광고주', mmState.client || ''].join('\t'));
    L.push(['캠페인', mmState.campaign || ''].join('\t'));
    L.push(['집행 기간', mmState.period || (res.days ? fmtInt(res.days) + '일' : '')].join('\t'));
    L.push(['견적일', mmState.docDate || ''].join('\t'));
    L.push(['작성', mmState.agency || ''].join('\t'));
    L.push(['총 예산(VAT 별도)', Math.round(t.net)].join('\t'));
    L.push(['총 예산(VAT 포함)', Math.round(t.vatIncl)].join('\t'));
    L.push(['단가 근거', res.benchCount
      ? (res.ds.label + ' ' + res.ds.period + ' 벤치마크(' + mmState.industry + ' / ' + mmState.device + ') ' + res.benchCount + '행'
         + (res.rows.length > res.benchCount ? ' + 직접 입력 ' + (res.rows.length - res.benchCount) + '행' : ''))
      : '전 행 직접 입력(자사 실적 기준)'].join('\t'));
    L.push('');

    var head = ['매체', '광고유형', '예산비중(%)', '예산(VAT별도)'];
    if (showMarkup) head.push('매체비(마크업제외)');
    if (res.days) head.push('일예산');
    head = head.concat(['노출', '클릭', 'CTR(%)', 'CPC', 'CPM']);
    if (showViews) head.push('조회');
    if (hasConv) head = head.concat(['CVR(%)', '전환수', 'CPA']);
    if (hasRev) head = head.concat(['매출', 'ROAS(%)']);
    head.push('비고');
    L.push(head.join('\t'));

    var num = function (v, d) {
      if (v == null || !isFinite(v)) return '';
      return d ? Number(v).toFixed(d) : Math.round(v);
    };
    res.rows.forEach(function (r) {
      var c = [r.name, r.type, (r.share * 100).toFixed(1), num(r.net)];
      if (showMarkup) c.push(num(r.media));
      if (res.days) c.push(num(r.daily));
      c = c.concat([num(r.impr), num(r.clicks), num(r.ctr, 2), num(r.cpc), num(r.cpm)]);
      if (showViews) c.push(num(r.views));
      if (hasConv) c = c.concat([r.installs != null ? '설치' : num(r.cvr, 2), num(r.conv), num(r.cpa)]);
      if (hasRev) c = c.concat([num(r.revenue), num(r.roas, 1)]);
      c.push((r.note || '') + (r.fallback ? ' (통합 대체)' : ''));
      L.push(c.join('\t'));
    });

    var tot = ['TOTAL', '', '100.0', num(t.net)];
    if (showMarkup) tot.push(num(t.media));
    if (res.days) tot.push(num(t.net / res.days));
    tot = tot.concat([num(t.impr), num(t.clicks), num(t.ctr, 2), num(t.cpc), num(t.cpm)]);
    if (showViews) tot.push(num(t.views));
    if (hasConv) tot = tot.concat(['', num(t.conv), num(t.cpa)]);
    if (hasRev) tot = tot.concat([num(t.revenue), num(t.roas, 1)]);
    tot.push('');
    L.push(tot.join('\t'));

    L.push('');
    L.push('NOTICE');
    L.push('* 본 미디어믹스는 ' + (res.benchCount ? res.ds.label + ' ' + res.ds.period + ' 업종 평균 벤치마크와 ' : '') +
      '입력 가정값 기반 추정치이며, 실제 집행 결과와 다를 수 있습니다.');
    L.push('* 매체별 인벤토리·경쟁·시즌에 따라 단가와 볼륨은 변동되며, 실집행 시 세부 내역이 조정될 수 있습니다.');
    L.push('* 모든 금액은 VAT 별도 기준입니다. (VAT 포함 합계: ' + Math.round(t.vatIncl) + '원)');
    L.push('* 전환·매출 지표는 입력된 CVR·객단가 가정에 따른 산출값으로 보장 수치가 아닙니다.');
    return L.join('\n');
  }

  function mmSummaryText(res) {
    var t = res.totals;
    var L = [];
    L.push('[' + (mmState.client || '광고주') + ' 미디어믹스] ' + (mmState.campaign || '') );
    L.push('기간: ' + (mmState.period || (res.days ? fmtInt(res.days) + '일' : '-')) +
      ' / 예산: ' + fmtWon(t.net) + ' (VAT 별도, 포함 ' + fmtWon(t.vatIncl) + ')');
    L.push('단가 근거: ' + (res.benchCount
      ? res.ds.label + ' ' + res.ds.period + ' 벤치마크(' + mmState.industry + ') ' + res.benchCount + '행'
        + (res.rows.length > res.benchCount ? ' + 직접 입력 ' + (res.rows.length - res.benchCount) + '행' : '')
      : '전 행 직접 입력(자사 실적 기준)'));
    L.push('');
    res.rows.forEach(function (r) {
      var p = [r.type + ' ' + (r.share * 100).toFixed(1) + '% · ' + fmtWon(r.net)];
      if (r.impr != null) p.push('노출 ' + fmtInt(r.impr));
      if (r.clicks != null) p.push('클릭 ' + fmtInt(r.clicks));
      if (r.conv != null) p.push('전환 ' + fmtInt(r.conv));
      if (r.roas != null) p.push('ROAS ' + fmtPct(r.roas, 0));
      L.push('- ' + p.join(' / ') + (r.note ? '  ※' + r.note : ''));
    });
    L.push('');
    L.push('TOTAL: 노출 ' + fmtInt(t.impr) + ' / 클릭 ' + fmtInt(t.clicks) +
      ' / CTR ' + fmtPct(t.ctr) + ' / CPC ' + fmtWon(t.cpc) +
      (t.conv ? ' / 전환 ' + fmtInt(t.conv) + ' / CPA ' + fmtWon(t.cpa) : '') +
      (t.roas != null ? ' / ROAS ' + fmtPct(t.roas, 0) : ''));
    L.push('');
    L.push('※ 업종 평균 벤치마크 + 입력 가정 기반 추정치이며 보장 수치가 아닙니다.');
    return L.join('\n');
  }

  // ============================================================
  // 갱신
  // ============================================================
  // 결과 패널만 다시 그린다 — 표의 입력칸이 재생성되면 포커스가 튄다.
  function mmRefreshResult() {
    var res = mmCompute();
    var out = mmQ('#mm-result');
    if (out) {
      out.innerHTML = mmResultHtml(res);
      var b1 = out.querySelector('#mm-copy-mix');
      if (b1) b1.addEventListener('click', function () { copyToClipboard(mmMixTsv(res), b1); });
      var b2 = out.querySelector('#mm-copy-text');
      if (b2) b2.addEventListener('click', function () { copyToClipboard(mmSummaryText(res), b2); });
      var b3 = out.querySelector('#mm-print');
      if (b3) b3.addEventListener('click', function () { window.print(); });
    }
    var hint = mmQ('#mm-ratio-hint');
    if (hint) {
      var s = Math.round(res.sumRatio * 10) / 10;
      if (s === 100) hint.innerHTML = '비중 합계 <b style="color:var(--ok)">100%</b>';
      else if (s === 0) hint.innerHTML = '<b style="color:var(--danger)">비중 합계 0%</b> — 행에 비중을 넣으세요.';
      else hint.innerHTML = '비중 합계 <b style="color:var(--warn)">' + s + '%</b> — 비율대로 정규화해 배분합니다. [⚖️ 합계 100%]로 정리할 수 있습니다.';
    }
    var why = mmQ('#mm-preset-why');
    if (why) {
      var p = mmPreset(mmState.preset);
      why.innerHTML = p ? '<b style="color:var(--text-primary)">' + mmEsc(p.label) + '</b> — ' + mmEsc(p.why) : '';
    }
    mmSave();
  }

  // 표 구조가 바뀔 때(행 추가·삭제·플랫폼 변경)만 전체 재렌더
  function mmRefreshAll() { mmRenderAll(); }

  // ============================================================
  // 이벤트 바인딩
  // ============================================================
  function mmBindText(id, key) {
    var el = mmQ('#' + id);
    if (el) el.addEventListener('input', function () { mmState[key] = el.value; mmRefreshResult(); });
  }

  function mmBind() {
    ['mm-client:client', 'mm-campaign:campaign', 'mm-period:period', 'mm-docdate:docDate',
     'mm-agency:agency', 'mm-budget:budget', 'mm-days:days', 'mm-markup:markup',
     'mm-cvr:cvr', 'mm-aov:aov'].forEach(function (pair) {
      var p = pair.split(':'); mmBindText(p[0], p[1]);
    });

    // VAT 세그
    mmQA('#mm-vat-seg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        mmState.vatMode = b.getAttribute('data-vat');
        mmQA('#mm-vat-seg .seg-btn').forEach(function (x) { x.classList.toggle('on', x === b); });
        mmRefreshResult();
      });
    });
    // 예산 빠른 태그
    mmQA('#mm-budget-tags .qtag').forEach(function (tag) {
      tag.addEventListener('click', function () {
        mmState.budget = tag.getAttribute('data-v');
        var b = mmQ('#mm-budget'); if (b) b.value = mmState.budget;
        mmRefreshResult();
      });
    });
    // 플랫폼 — 채널 목록이 바뀌므로 전체 재렌더
    mmQA('#mm-platform-seg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-platform');
        if (p === mmState.platform) return;
        mmState.platform = p;
        mmSyncPlatform();
        mmRefreshAll();
      });
    });
    var ind = mmQ('#mm-industry');
    if (ind) ind.addEventListener('change', function () { mmState.industry = ind.value; mmRefreshAll(); });
    var dev = mmQ('#mm-device');
    if (dev) dev.addEventListener('change', function () { mmState.device = dev.value; mmRefreshAll(); });

    // 프리셋
    mmQA('#mm-preset-chips .qtag').forEach(function (chip) {
      chip.addEventListener('click', function () {
        mmSeedFromPreset(chip.getAttribute('data-preset'));
        mmRefreshAll();
      });
    });

    // 표 입력 — 결과만 갱신(포커스 유지)
    mmQA('.mm-cell').forEach(function (inp) {
      inp.addEventListener('input', function () {
        var r = mmRowById(inp.getAttribute('data-row'));
        if (!r) return;
        r[inp.getAttribute('data-f')] = inp.value;
        mmRefreshResult();
      });
    });
    // 행 삭제
    mmQA('.mm-del').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-del');
        mmState.rows = mmState.rows.filter(function (r) { return r.id !== id; });
        mmRefreshAll();
      });
    });
    // 행 추가
    var ab = mmQ('#mm-add-bench-btn');
    if (ab) ab.addEventListener('click', function () {
      var sel = mmQ('#mm-add-bench'); if (!sel) return;
      mmState.rows.push(mmNewRow({ kind: 'bench', channel: sel.value, ratio: 10 }));
      mmRefreshAll();
    });
    var aq = mmQ('#mm-add-quick-btn');
    if (aq) aq.addEventListener('click', function () {
      var sel = mmQ('#mm-add-quick'); if (!sel) return;
      var m = MM_QUICK_MEDIA[parseInt(sel.value, 10)];
      if (!m) return;
      mmState.rows.push(mmNewRow({ kind: 'custom', media: m.media, adType: m.adType, ratio: 10 }));
      mmRefreshAll();
    });
    var abl = mmQ('#mm-add-blank');
    if (abl) abl.addEventListener('click', function () {
      mmState.rows.push(mmNewRow({ kind: 'custom', ratio: 10 }));
      mmRefreshAll();
    });
    // 합계 100%로 정규화
    var norm = mmQ('#mm-normalize');
    if (norm) norm.addEventListener('click', function () {
      var sum = mmState.rows.reduce(function (a, r) { var v = mmNum(r.ratio); return a + (v > 0 ? v : 0); }, 0);
      if (sum <= 0) return;
      mmState.rows.forEach(function (r) {
        var v = mmNum(r.ratio);
        r.ratio = (v > 0) ? String(Math.round(v / sum * 1000) / 10) : '0';
      });
      mmRefreshAll();
    });
  }

  function mmRenderAll() {
    var root = mmRoot();
    if (!root) return;
    var ds = mmDataset(mmState.platform);

    root.innerHTML = '' +
    '<div class="tool-wrap mm-wrap">' +
      '<div class="tool-hero mm-noprint">' +
        '<div class="eyebrow">🧰 실무 도구</div>' +
        '<h1>미디어믹스 플래너</h1>' +
        '<p>업종별 실측 벤치마크 + 우리 계정 실적 가정으로 <b>광고주 제출용 미디어믹스</b>를 만듭니다. ' +
        '채널 배분 · 예상 노출/클릭/전환/매출 · VAT · 마크업까지 계산해 <b>엑셀에 그대로 붙여넣을 수 있는 표</b>로 내보냅니다.</p>' +
      '</div>' +

      '<div class="callout warn mm-noprint"><span class="c-ico">⚠️</span><div>' +
        '벤치마크는 <b>' + mmEsc(ds ? ds.label + ' ' + ds.period : '-') + '</b> 업종 평균이라 실제 계정 성과와 다릅니다. ' +
        '<b>네이버·카카오·크리테오는 벤치마크에 없으니</b> 아래 [+ 국내 매체]로 추가하고 우리 실적 단가를 넣으세요. ' +
        '확정 제안 전에는 반드시 과거 실적으로 보정하세요.' +
      '</div></div>' +

      '<div class="tool-grid" style="margin-top:18px">' + mmDocPanel() + mmBudgetPanel() + '</div>' +
      '<div style="margin-top:20px">' + mmMixPanel() + '</div>' +

      '<div class="panel mm-result-panel" style="margin-top:20px">' +
        '<div class="panel-head mm-noprint"><span class="ico">📊</span><div>' +
          '<div class="panel-title">미디어믹스 (제안서 출력)</div>' +
          '<div class="panel-sub">이 영역만 인쇄됩니다 — 인쇄/PDF 버튼으로 바로 저장</div>' +
        '</div></div>' +
        '<div id="mm-result"></div>' +
      '</div>' +
    '</div>';

    mmBind();
    mmRefreshResult();
  }

  // ============================================================
  // 벤치마크 페이지용 '업종별 실측표'
  // ============================================================
  var lkState = { platform: 'google', industry: ALL, device: 'MO' };
  function lkDs() { return mmDataset(lkState.platform); }
  function lkSync() {
    var ds = lkDs(); if (!ds) return;
    if (ds.industries.indexOf(lkState.industry) < 0) lkState.industry = ALL;
    if (mmDeviceIds(ds).indexOf(lkState.device) < 0) lkState.device = ds.devices[0].id;
  }
  function lkTableHtml() {
    var ds = lkDs();
    if (!ds) return '<div class="callout danger"><span class="c-ico">⛔</span><div>벤치마크 데이터를 불러오지 못했습니다.</div></div>';
    var rows = mmChannels(ds).map(function (c) {
      var hit = mmBench(ds, lkState.industry, lkState.device, c.id);
      var b = hit.b;
      var cell = function (v, kind) {
        if (v == null) return '<td class="num" style="color:var(--text-muted)">–</td>';
        return '<td class="num">' + (kind === 'pct' ? fmtPct(v, 2) : fmtInt(v)) + '</td>';
      };
      return '<tr><td class="mm-name-cell" style="min-width:178px">' +
        '<span class="mm-dot" style="background:' + mmEsc(c.color) + '"></span>' +
        '<b style="color:var(--text-primary)">' + mmEsc(c.label) + '</b>' +
        (c.est ? ' <span class="mm-badge">추정</span>' : '') +
        (hit.fallback ? ' <span class="mm-badge warn">통합 대체</span>' : '') +
        '<div class="mm-sub">' + mmEsc(c.role) + '</div></td>' +
        cell(b && b.CPC) + cell(b && b.CTR, 'pct') + cell(b && b.CPM) +
        cell(b && b.CPV) + cell(b && b.VTR, 'pct') + cell(b && b.CPI) + '</tr>';
    }).join('');
    return '<div class="table-scroll"><table class="t-table"><thead><tr>' +
      '<th>채널</th><th class="num">CPC(원)</th><th class="num">CTR(%)</th><th class="num">CPM(원)</th>' +
      '<th class="num">CPV(원)</th><th class="num">VTR(%)</th><th class="num">CPI(원)</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }
  function lkTsv() {
    var ds = lkDs();
    var L = [['채널', 'CPC(원)', 'CTR(%)', 'CPM(원)', 'CPV(원)', 'VTR(%)', 'CPI(원)'].join('\t')];
    mmChannels(ds).forEach(function (c) {
      var b = mmBench(ds, lkState.industry, lkState.device, c.id).b;
      var v = function (x) { return x == null ? '' : x; };
      L.push([c.label, v(b && b.CPC), v(b && b.CTR), v(b && b.CPM), v(b && b.CPV), v(b && b.VTR), v(b && b.CPI)].join('\t'));
    });
    return '[' + ds.label + ' 업종 벤치마크] ' + lkState.industry + ' / ' + lkState.device + ' · ' + ds.period + '\n' + L.join('\n');
  }
  function lkRender(el) {
    if (!el) return;
    lkSync();
    var ds = lkDs();
    if (!ds) { el.innerHTML = ''; return; }
    var industryOpts = ds.industries.map(function (i) {
      return '<option value="' + mmEsc(i) + '"' + (i === lkState.industry ? ' selected' : '') + '>' + mmEsc(i) + '</option>';
    }).join('');
    var deviceOpts = ds.devices.map(function (d) {
      return '<option value="' + mmEsc(d.id) + '"' + (d.id === lkState.device ? ' selected' : '') + '>' + mmEsc(d.label) + '</option>';
    }).join('');

    el.innerHTML =
    '<div class="panel">' +
      '<div class="panel-head"><span class="ico">🎯</span><div>' +
        '<div class="panel-title">업종별 실측 벤치마크 (구글 Ads · Meta Ads)</div>' +
        '<div class="panel-sub">2024~2025 집행 데이터 기반 단가표 — 위 표가 “매체 감각”이라면, 이 표는 “업종 실측치”입니다</div>' +
      '</div></div>' +
      '<div class="seg" id="lk-platform-seg" style="margin-bottom:12px">' +
        '<button type="button" class="seg-btn' + (lkState.platform === 'google' ? ' on' : '') + '" data-platform="google">구글 Ads</button>' +
        '<button type="button" class="seg-btn' + (lkState.platform === 'meta' ? ' on' : '') + '" data-platform="meta">Meta Ads</button>' +
      '</div>' +
      '<div class="field-row">' +
        '<div class="field"><label for="lk-industry">업종</label><select class="input" id="lk-industry">' + industryOpts + '</select></div>' +
        '<div class="field"><label for="lk-device">' + mmEsc(ds.deviceLabel || '디바이스') + '</label>' +
          '<select class="input" id="lk-device"' + (ds.devices.length < 2 ? ' disabled' : '') + '>' + deviceOpts + '</select></div>' +
      '</div>' +
      '<div id="lk-table">' + lkTableHtml() + '</div>' +
      '<div class="callout info" style="margin-top:12px"><span class="c-ico">💡</span><div>' +
        '<b>–</b> 는 해당 조합에 데이터가 없다는 뜻입니다(<span class="mm-badge warn">통합 대체</span>는 전 업종 평균으로 대체한 값). ' +
        'CPC·CTR·CPM은 각각 따로 평균 낸 값이라 <b>CPC × CTR × 1000 ≠ CPM</b> 인 행이 있을 수 있습니다. ' +
        '전환·매출(CVR·CPA·ROAS)은 이 데이터에 <b>없습니다</b> — 플래너에서 우리 실적값을 직접 넣어야 합니다.' +
      '</div></div>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn btn-primary btn-sm" id="lk-goplan">🧩 이 조건으로 미디어믹스 짜기 →</button>' +
        '<button type="button" class="btn btn-ghost btn-sm copy-btn" id="lk-copy">📋 벤치마크 복사(TSV)</button>' +
      '</div>' +
    '</div>';

    el.querySelectorAll('#lk-platform-seg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var p = b.getAttribute('data-platform');
        if (p === lkState.platform) return;
        lkState.platform = p; lkSync(); lkRender(el);
      });
    });
    var li = el.querySelector('#lk-industry');
    if (li) li.addEventListener('change', function () {
      lkState.industry = li.value;
      var t = el.querySelector('#lk-table'); if (t) t.innerHTML = lkTableHtml();
    });
    var ld = el.querySelector('#lk-device');
    if (ld) ld.addEventListener('change', function () {
      lkState.device = ld.value;
      var t = el.querySelector('#lk-table'); if (t) t.innerHTML = lkTableHtml();
    });
    var cp = el.querySelector('#lk-copy');
    if (cp) cp.addEventListener('click', function () { copyToClipboard(lkTsv(), cp); });
    var go = el.querySelector('#lk-goplan');
    if (go) go.addEventListener('click', function () {
      window.mediamixPrefill({ platform: lkState.platform, industry: lkState.industry, device: lkState.device });
    });
  }

  // ============================================================
  // 진입점
  // ============================================================
  function mmApplyPrefill(o) {
    if (!o) return;
    if (o.platform === 'google' || o.platform === 'meta') mmState.platform = o.platform;
    mmSyncPlatform();
    var ds = mmDataset(mmState.platform);
    if (ds && o.industry && ds.industries.indexOf(o.industry) >= 0) mmState.industry = o.industry;
    if (ds && o.device && mmDeviceIds(ds).indexOf(o.device) >= 0) mmState.device = o.device;
  }

  function renderMediamixTool() {
    if (!mmRoot()) return;
    var restored = mmLoad();
    mmSyncPlatform();
    if (!restored || !mmState.rows.length) mmSeedFromPreset(mmState.preset);
    if (mmPending) { mmApplyPrefill(mmPending); mmPending = null; }
    mmRenderAll();
  }

  window.mediamixPrefill = function (o) {
    var r = mmRoot();
    if (r && r.innerHTML.trim()) { mmApplyPrefill(o); mmRenderAll(); }
    else mmPending = o;
    if (typeof showPage === 'function') showPage('tool-mediamix');
  };

  window.renderMediamixTool = renderMediamixTool;
  window.mmRenderLookup = lkRender;
})();
