// ============================================================
// mediamix.js — 매체 벤치마크 페이지의 '업종별 참고표'
// 진입점: window.mmRenderLookup(el)
//
// ※ 미디어믹스 도구 화면은 js/tools/mix-studio.js 가 그린다.
//   mix-studio 가 window.renderMediamixTool 을 덮어쓰기 때문에, 예전에 이 파일이 갖고 있던
//   플래너 UI(약 1,000줄)는 로드만 되고 실행되지 않는 죽은 코드였다. 그 부분을 걷어냈다.
//   (mix-studio 는 window.mmRenderLookup 을 감싸 '브랜드별 캠페인 벤치마크' 안내를 덧붙인다)
//
// 데이터: js/data/mediamix-data.js 의 window.MM_DATA (구글·Meta 업종 참고값)
// 통합 계약: ES모듈 금지 / 외부 라이브러리·CDN·네트워크 금지 / 현재시각 API 금지
// app.js 헬퍼: fmtInt, fmtPct, copyToClipboard, escapeHtml
// ============================================================
(function () {
  'use strict';

  var ALL = '전 업종(통합)';
  function mmEsc(s) { return (typeof escapeHtml === 'function') ? escapeHtml(s) : String(s == null ? '' : s); }

  function mmDataset(pid) { var D = window.MM_DATA; return D ? (D[pid] || D.google || null) : null; }
  function mmChannels(ds) { return (ds && ds.channels) || []; }
  function mmChannel(ds, id) {
    var l = mmChannels(ds);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    return null;
  }
  function mmDeviceIds(ds) { return (ds.devices || []).map(function (d) { return d.id; }); }
  // 선택 업종에 값이 없으면 '전 업종(통합)'으로 대체한다(표에 '통합 대체' 배지가 붙는다).
  function mmBench(ds, industry, device, channel) {
    var hit = mmFindRow(ds, industry, device, channel);
    if (hit) return { b: hit, fallback: false };
    if (industry !== ALL) {
      var alt = mmFindRow(ds, ALL, device, channel);
      if (alt) return { b: alt, fallback: true };
    }
    return { b: null, fallback: false };
  }
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
        '<div class="panel-title">업종별 참고 벤치마크 (구글 Ads · Meta Ads)</div>' +
        '<div class="panel-sub">기존 간편 플래너의 2024~2025 참고값 · 원시 데이터 및 표본 미검증</div>' +
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
        'CPC·CTR·CPM은 각각 따로 평균 낸 값이라 <b>CPC × (CTR ÷ 100) × 1000 ≠ CPM</b> 인 행이 있을 수 있습니다. ' +
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

  window.mmRenderLookup = lkRender;
})();
