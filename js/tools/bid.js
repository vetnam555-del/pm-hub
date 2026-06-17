// ============================================================
// bid.js — 적정 입찰가(최대 CPC) 계산기
// 진입점: window.renderBidTool()  (컨테이너 id="page-tool-bid")
// 모드1 "목표 CPA 기준" / 모드2 "목표 ROAS 기준" 을 .seg 로 전환.
// 통합 계약: ES모듈 금지 / 외부 라이브러리·CDN·네트워크 금지 / 현재시각 API 금지
// app.js 헬퍼 사용: fmtInt, fmtWon, fmtPct (무효값 "–")
// 전역 식별자는 모두 bid* 접두사 + IIFE 캡슐화. 진입점만 window 노출.
// ============================================================
(function () {
  'use strict';

  var BID_CID = 'page-tool-bid';

  // 현재 모드 상태 ('cpa' | 'roas')
  var bidMode = 'cpa';

  // ── 안전 숫자 파서: 빈칸/문자/콤마 방어 → 유효 숫자 아니면 null ──
  function bidNum(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().replace(/,/g, '');
    if (s === '') return null;
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return n;
  }
  // 0 또는 음수면 분모/비율로 못 쓰므로 null 처리(양수만)
  function bidPos(raw) {
    var n = bidNum(raw);
    if (n == null || n <= 0) return null;
    return n;
  }

  // ── 컨테이너 헬퍼 ──
  function bidRoot() { return document.getElementById(BID_CID); }
  function bidQ(sel) { var r = bidRoot(); return r ? r.querySelector(sel) : null; }
  function bidQA(sel) { var r = bidRoot(); return r ? r.querySelectorAll(sel) : []; }

  // 입력 필드 1개 마크업 (req: true면 "필수", 아니면 "선택")
  function bidField(id, label, unit, hint, req) {
    var badge = req
      ? '<span class="req">필수</span>'
      : '<span class="opt">선택</span>';
    var affix = unit
      ? '<div class="input-affix"><input type="number" inputmode="decimal" min="0" step="any" class="input" id="' + id + '" placeholder="0"><span class="affix">' + unit + '</span></div>'
      : '<input type="number" inputmode="decimal" min="0" step="any" class="input" id="' + id + '" placeholder="0">';
    return '<div class="field">'
      + '<label>' + label + ' ' + badge + '</label>'
      + affix
      + (hint ? '<div class="field-hint">' + hint + '</div>' : '')
      + '</div>';
  }

  function bidEmptyState(msg) {
    return '<div class="empty-state"><div class="e-ico">🧭</div><div class="e-txt">' + msg + '</div></div>';
  }

  // ============================================================
  // 입력 패널 (모드별 분기)
  // ============================================================
  function bidInputsHtml() {
    return '<div class="panel panel-sticky">'
      + '<div class="panel-head"><span class="ico">🎯</span><div>'
      + '<div class="panel-title">입찰 조건 입력</div>'
      + '<div class="panel-sub">목표를 정하면 클릭당 입찰 상한을 계산합니다. 입력 즉시 반영돼요.</div>'
      + '</div></div>'
      // 모드 선택 세그
      + '<div class="field"><label>기준</label>'
      + '<div class="seg" id="bid-seg" role="tablist">'
      + '<button class="seg-btn on" data-mode="cpa">🎯 목표 CPA 기준</button>'
      + '<button class="seg-btn" data-mode="roas">📈 목표 ROAS 기준</button>'
      + '</div></div>'
      // 모드1 입력 (목표 CPA 기준)
      + '<div id="bid-in-cpa">'
      + bidField('bid-tcpa', '목표 CPA', '원', '전환 1건당 허용 가능한 최대 비용', true)
      + bidField('bid-cvr1', '예상 전환율(CVR)', '%', '클릭 100회 중 몇 건이 전환되는지 (예: 3)', true)
      + '</div>'
      // 모드2 입력 (목표 ROAS 기준)
      + '<div id="bid-in-roas" style="display:none">'
      + bidField('bid-troas', '목표 ROAS', '%', '예: 400% = 광고비 1원당 매출 4원', true)
      + bidField('bid-aov', '객단가(AOV)', '원', '전환 1건당 평균 매출', true)
      + bidField('bid-cvr2', '예상 전환율(CVR)', '%', '클릭 100회 중 몇 건이 전환되는지 (예: 3)', true)
      + '</div>'
      + '<div class="btn-row">'
      + '<button class="btn btn-ghost btn-sm" id="bid-sample">✨ 예시 채우기</button>'
      + '<button class="btn btn-ghost btn-sm" id="bid-reset">↺ 초기화</button>'
      + '<button class="btn btn-ghost btn-sm" id="bid-clear">🗑 입력 비우기</button>'
      + '</div>'
      + '</div>';
  }

  // ============================================================
  // 결과 패널
  // ============================================================
  function bidResultsHtml() {
    return '<div class="panel">'
      + '<div class="panel-head"><span class="ico">💸</span><div>'
      + '<div class="panel-title">적정 입찰가</div>'
      + '<div class="panel-sub">이 금액 이하로 입찰해야 목표를 지킵니다</div>'
      + '</div></div>'
      + '<div id="bid-out"></div>'
      // 하단 안내 + 도구 연계
      + '<div class="callout info"><span class="c-ico">ℹ️</span><div>'
      + '여기 계산은 <b>마진을 반영하지 않은</b> 상한선입니다. 클릭당 이 금액까지 써도 목표 CPA/ROAS는 지키지만, '
      + '실제 <b>흑자 여부는 [손익분기·예산]</b>에서 마진을 넣어 확인하세요.'
      + '<div class="btn-row" style="margin-top:10px">'
      + '<button class="btn btn-ghost btn-sm" id="bid-go-kpi">📊 KPI 계산기</button>'
      + '<button class="btn btn-ghost btn-sm" id="bid-go-budget">💰 손익분기·예산</button>'
      + '</div>'
      + '</div></div>'
      + '</div>';
  }

  // ============================================================
  // 계산 + 출력
  // ============================================================
  function bidRecalc() {
    var out = bidQ('#bid-out');
    if (!out) return;

    if (bidMode === 'cpa') {
      // 모드1: 적정 최대 CPC = 목표CPA × (CVR/100)
      var tcpa = bidPos(bidQ('#bid-tcpa') && bidQ('#bid-tcpa').value); // 원
      var cvr = bidPos(bidQ('#bid-cvr1') && bidQ('#bid-cvr1').value);  // %

      if (tcpa == null || cvr == null) {
        out.innerHTML = bidEmptyState('<b>목표 CPA</b>와 <b>예상 전환율(CVR)</b>을 입력하면<br>클릭당 최대 입찰가를 계산합니다.');
        return;
      }

      var maxCpc = tcpa * (cvr / 100);

      var html = '<div class="result-grid">'
        + '<div class="metric primary">'
        + '<div class="m-label">💸 적정 최대 CPC</div>'
        + '<div class="m-value" style="font-size:34px">' + fmtWon(maxCpc) + '</div>'
        + '<div class="formula">목표CPA × (CVR ÷ 100)  →  '
        + fmtInt(tcpa) + ' × ' + fmtPct(cvr) + ' = ' + fmtWon(maxCpc) + '</div>'
        + '</div>'
        + '</div>';

      html += '<div class="callout info"><span class="c-ico">💡</span><div>'
        + 'CVR이 <b>' + fmtPct(cvr) + '</b>라면 클릭당 최대 <b>' + fmtWon(maxCpc) + '</b>까지 입찰해도 '
        + '목표 CPA(<b>' + fmtWon(tcpa) + '</b>)를 유지합니다. '
        + '이보다 비싸게 입찰하면 전환당 비용이 목표를 넘습니다.'
        + '</div></div>';

      out.innerHTML = html;

    } else {
      // 모드2: 허용 CPA = AOV ÷ (목표ROAS/100); 적정 최대 CPC = 허용CPA × (CVR/100)
      var troas = bidPos(bidQ('#bid-troas') && bidQ('#bid-troas').value); // %
      var aov = bidPos(bidQ('#bid-aov') && bidQ('#bid-aov').value);       // 원
      var cvr2 = bidPos(bidQ('#bid-cvr2') && bidQ('#bid-cvr2').value);     // %

      if (troas == null || aov == null || cvr2 == null) {
        out.innerHTML = bidEmptyState('<b>목표 ROAS</b>·<b>객단가(AOV)</b>·<b>예상 전환율(CVR)</b>을 입력하면<br>허용 CPA와 클릭당 최대 입찰가를 계산합니다.');
        return;
      }

      var allowCpa = aov / (troas / 100);
      var maxCpc2 = allowCpa * (cvr2 / 100);

      var html2 = '<div class="result-grid">'
        + '<div class="metric">'
        + '<div class="m-label">허용 CPA</div>'
        + '<div class="m-value">' + fmtWon(allowCpa) + '</div>'
        + '<div class="formula">AOV ÷ (목표ROAS ÷ 100)  →  '
        + fmtInt(aov) + ' ÷ ' + fmtPct(troas, 0) + ' = ' + fmtWon(allowCpa) + '</div>'
        + '</div>'
        + '<div class="metric primary">'
        + '<div class="m-label">💸 적정 최대 CPC</div>'
        + '<div class="m-value" style="font-size:30px">' + fmtWon(maxCpc2) + '</div>'
        + '<div class="formula">허용CPA × (CVR ÷ 100)  →  '
        + fmtInt(allowCpa) + ' × ' + fmtPct(cvr2) + ' = ' + fmtWon(maxCpc2) + '</div>'
        + '</div>'
        + '</div>';

      html2 += '<div class="callout info"><span class="c-ico">💡</span><div>'
        + '객단가 <b>' + fmtWon(aov) + '</b>에서 ROAS <b>' + fmtPct(troas, 0) + '</b>를 지키려면 전환당 비용(CPA)을 '
        + '<b>' + fmtWon(allowCpa) + '</b> 이하로 유지해야 합니다. CVR <b>' + fmtPct(cvr2) + '</b> 기준 '
        + '클릭당 최대 <b>' + fmtWon(maxCpc2) + '</b>까지 입찰해도 목표 ROAS를 유지합니다.'
        + '</div></div>';

      out.innerHTML = html2;
    }

    // 입력값 영속화
    bidSaveState();
  }

  // ============================================================
  // 입력값 영속화 (localStorage)
  // ============================================================
  var BID_IDS = ['bid-tcpa', 'bid-cvr1', 'bid-troas', 'bid-aov', 'bid-cvr2'];

  function bidSaveState() {
    var st = { mode: bidMode };
    BID_IDS.forEach(function (id) {
      var el = bidQ('#' + id);
      if (el) st[id] = el.value;
    });
    try { if (typeof saveToolState === 'function') saveToolState('bid', st); } catch (e) {}
  }
  function bidLoadState() {
    try {
      if (typeof loadToolState !== 'function') return null;
      return loadToolState('bid');
    } catch (e) { return null; }
  }
  function bidRestoreState() {
    var st = bidLoadState();
    if (!st || typeof st !== 'object') return;
    if (st.mode === 'roas' || st.mode === 'cpa') bidMode = st.mode;
    BID_IDS.forEach(function (id) {
      var el = bidQ('#' + id);
      if (el && st[id] != null) el.value = st[id];
    });
  }

  // ── 예시 채우기 / 초기화 / 입력 비우기 ──
  function bidFillSample() {
    if (bidMode === 'cpa') {
      var m = { 'bid-tcpa': 15000, 'bid-cvr1': 3 };
      Object.keys(m).forEach(function (id) { var el = bidQ('#' + id); if (el) el.value = m[id]; });
    } else {
      var m2 = { 'bid-troas': 400, 'bid-aov': 60000, 'bid-cvr2': 3 };
      Object.keys(m2).forEach(function (id) { var el = bidQ('#' + id); if (el) el.value = m2[id]; });
    }
    bidRecalc();
  }
  function bidResetInputs() {
    BID_IDS.forEach(function (id) { var el = bidQ('#' + id); if (el) el.value = ''; });
    bidRecalc();
  }
  // 🗑 입력 비우기 — 저장된 상태까지 삭제 후 초기화
  function bidClearInputs() {
    try { if (typeof clearToolState === 'function') clearToolState('bid'); } catch (e) {}
    BID_IDS.forEach(function (id) { var el = bidQ('#' + id); if (el) el.value = ''; });
    bidRecalc();
  }

  // ── 입력/버튼 이벤트 바인딩 ──
  function bidBind() {
    BID_IDS.forEach(function (id) {
      var el = bidQ('#' + id);
      if (el) el.addEventListener('input', bidRecalc);
    });
    var sb = bidQ('#bid-sample'); if (sb) sb.addEventListener('click', bidFillSample);
    var rb = bidQ('#bid-reset'); if (rb) rb.addEventListener('click', bidResetInputs);
    var cb = bidQ('#bid-clear'); if (cb) cb.addEventListener('click', bidClearInputs);

    // 도구 연계 버튼
    var gk = bidQ('#bid-go-kpi');
    if (gk) gk.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-kpi');
    });
    var gb = bidQ('#bid-go-budget');
    if (gb) gb.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-budget');
    });
  }

  // ── 모드 전환 ──
  function bidSetMode(m) {
    bidMode = (m === 'roas') ? 'roas' : 'cpa';
    bidQA('#bid-seg .seg-btn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === bidMode);
    });
    var box1 = bidQ('#bid-in-cpa'); var box2 = bidQ('#bid-in-roas');
    if (box1) box1.style.display = (bidMode === 'cpa') ? '' : 'none';
    if (box2) box2.style.display = (bidMode === 'roas') ? '' : 'none';
    bidRecalc();
  }

  // ── 진입점 ──────────────────────────────────────────────
  function renderBidTool() {
    var root = bidRoot();
    if (!root) return;

    root.innerHTML = ''
      + '<div class="tool-wrap">'
      + '  <div class="tool-hero">'
      + '    <div class="eyebrow">🧰 실무 도구</div>'
      + '    <h1>적정 입찰가(최대 CPC) 계산기</h1>'
      + '    <p>목표 CPA나 ROAS를 지키려면 클릭당 얼마까지 입찰해도 되는지 산정합니다. '
      + '    전환율(CVR)을 반영해 "이 금액 이하면 목표 유지" 상한선을 알려드려요.</p>'
      + '  </div>'
      + '  <div id="bid-body">'
      + '    <div class="tool-grid wide-right">'
      + bidInputsHtml() + bidResultsHtml()
      + '    </div>'
      + '  </div>'
      + '</div>';

    // 모드 세그 이벤트
    bidQA('#bid-seg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { bidSetMode(b.getAttribute('data-mode')); });
    });

    // 저장된 입력/모드 복원 후 바인딩 → 모드 동기화(초기 계산 포함)
    bidRestoreState();
    bidBind();
    bidSetMode(bidMode);
  }

  // 진입점만 전역 노출
  window.renderBidTool = renderBidTool;
})();
