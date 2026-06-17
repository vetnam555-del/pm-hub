// ============================================================
// report.js — 주간 리포트 빌더
// 매체별 수치(이번주/전주)를 입력하면 클라이언트 보고용
// 주간 리포트(요약·매체비교·인사이트·다음액션)를 자동 생성.
// 진입점: window.renderReportTool()  → 컨테이너 #page-tool-report
// 전역 식별자는 report* 접두사로 충돌 방지. (ES모듈/CDN 미사용)
// ============================================================
(function () {
  'use strict';

  var CID = 'page-tool-report';

  // ── 안전 계산 헬퍼 (0 나누기 / 빈 입력 방어) ──────────────
  function reportNum(v) {
    // 문자열 → 숫자. 콤마/공백 제거. 유효치 아니면 null.
    if (v == null) return null;
    var s = String(v).replace(/,/g, '').replace(/\s/g, '').trim();
    if (s === '') return null;
    var n = Number(s);
    if (isNaN(n) || !isFinite(n)) return null;
    return n;
  }
  function reportDiv(a, b) {
    // a/b, 분모 0/null 이면 null
    if (a == null || b == null || b === 0) return null;
    var r = a / b;
    if (isNaN(r) || !isFinite(r)) return null;
    return r;
  }
  function reportDash(formatted) {
    // 포맷 결과가 비었거나 '–'면 그대로 '–'
    return (formatted == null || formatted === '' || formatted === '–') ? '–' : formatted;
  }
  function reportEsc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  // 화면용 % 포맷 (app.js fmtPct 재사용, 없으면 폴백)
  function reportPct(n, d) {
    if (typeof fmtPct === 'function') return fmtPct(n, d);
    if (n == null || isNaN(n) || !isFinite(n)) return '–';
    return n.toFixed(d == null ? 2 : d) + '%';
  }
  function reportWon(n) {
    if (typeof fmtWon === 'function') return fmtWon(n);
    if (n == null || isNaN(n) || !isFinite(n)) return '–';
    return '₩' + Math.round(n).toLocaleString('ko-KR');
  }
  function reportInt(n) {
    if (typeof fmtInt === 'function') return fmtInt(n);
    if (n == null || isNaN(n) || !isFinite(n)) return '–';
    return Math.round(n).toLocaleString('ko-KR');
  }

  // ── 기본 프리필 행 (가벼운 예시값 비움 → 사용자 입력 유도) ──
  function reportSeedRows() {
    return [
      { name: '네이버 SA',   cost: '', imp: '', clk: '', cv: '', rev: '', pCost: '', pCv: '', pRev: '' },
      { name: '카카오모먼트', cost: '', imp: '', clk: '', cv: '', rev: '', pCost: '', pCv: '', pRev: '' },
      { name: 'Meta',        cost: '', imp: '', clk: '', cv: '', rev: '', pCost: '', pCv: '', pRev: '' }
    ];
  }
  // 예시 채우기용 더미 데이터(현실적인 비율)
  function reportSampleRows() {
    return [
      { name: '네이버 SA',   cost: '3200000', imp: '850000',  clk: '12400', cv: '210', rev: '14800000', pCost: '3000000', pCv: '195', pRev: '13200000' },
      { name: '카카오모먼트', cost: '2100000', imp: '1900000', clk: '7600',  cv: '95',  rev: '5700000',  pCost: '2200000', pCv: '120', pRev: '7300000'  },
      { name: 'Meta',        cost: '2800000', imp: '2400000', clk: '9100',  cv: '160', rev: '12200000', pCost: '2500000', pCv: '150', pRev: '11000000' }
    ];
  }

  var STATE_KEY = 'report';

  // ── 입력 상태 저장 (클라이언트·기간·행 데이터) ────────────
  function reportSaveState(root) {
    if (typeof saveToolState !== 'function') return;
    var client = (root.querySelector('#reportClient') || {}).value || '';
    var period = (root.querySelector('#reportPeriod') || {}).value || '';
    var rows = [];
    var trs = root.querySelectorAll('#reportRows tr');
    for (var i = 0; i < trs.length; i++) {
      var inps = trs[i].querySelectorAll('input[data-f]');
      var row = {};
      for (var j = 0; j < inps.length; j++) row[inps[j].getAttribute('data-f')] = inps[j].value;
      rows.push(row);
    }
    try { saveToolState(STATE_KEY, { client: client, period: period, rows: rows }); } catch (e) {}
  }

  // ── 입력 상태 복원 → 유효 데이터 있으면 행 배열 반환, 없으면 null ──
  function reportLoadState(root) {
    if (typeof loadToolState !== 'function') return null;
    var st = null;
    try { st = loadToolState(STATE_KEY); } catch (e) { st = null; }
    if (!st || typeof st !== 'object') return null;
    var c = root.querySelector('#reportClient');
    var p = root.querySelector('#reportPeriod');
    if (c && typeof st.client === 'string') c.value = st.client;
    if (p && typeof st.period === 'string') p.value = st.period;
    if (Object.prototype.toString.call(st.rows) === '[object Array]' && st.rows.length) {
      return st.rows;
    }
    return null;
  }

  // ── 진입점 ────────────────────────────────────────────────
  window.renderReportTool = function () {
    var root = document.getElementById(CID);
    if (!root) return;

    root.innerHTML =
      '<div class="tool-wrap">' +
        '<div class="tool-hero">' +
          '<div class="eyebrow">🧰 실무 도구</div>' +
          '<h1>📝 주간 리포트 빌더</h1>' +
          '<p>매체별 이번주·전주 수치를 넣으면 클라이언트 보고용 주간 리포트를 자동으로 만듭니다. ' +
          '요약 지표 · 매체별 성과표 · 자동 인사이트 · 다음 주 액션까지. 텍스트/표로 복사해 메일·문서에 바로 붙여넣으세요.</p>' +
        '</div>' +
        '<div class="tool-grid single">' +
          reportInputPanel() +
          '<div class="panel" id="reportOut">' +
            reportEmptyState() +
          '</div>' +
        '</div>' +
      '</div>';

    // 저장된 입력 복원 → 없으면 프리필 행 주입
    var saved = reportLoadState(root);
    reportRenderRows(root, (saved && saved.length) ? saved : reportSeedRows());
    reportBind(root);
    // 복원된 데이터가 있으면 리포트 자동 생성
    if (saved && saved.length) reportGenerate(root);
  };

  // ── 입력 패널 마크업 ──────────────────────────────────────
  function reportInputPanel() {
    return '' +
      '<div class="panel">' +
        '<div class="panel-head">' +
          '<span class="ico">✏️</span>' +
          '<div><div class="panel-title">리포트 입력</div>' +
          '<div class="panel-sub">매체별 이번주 수치 + (선택) 전주 수치로 WoW 비교</div></div>' +
        '</div>' +

        '<div class="field-row">' +
          '<div class="field">' +
            '<label>클라이언트명 <span class="opt">선택</span></label>' +
            '<input type="text" id="reportClient" class="input" placeholder="예) HLL중앙 골프웨어">' +
          '</div>' +
          '<div class="field">' +
            '<label>리포트 기간 <span class="opt">선택</span></label>' +
            '<input type="text" id="reportPeriod" class="input" placeholder="예) 6월 2주차 (6/8~6/14)">' +
          '</div>' +
        '</div>' +

        '<div class="field" style="margin-bottom:8px">' +
          '<label>매체별 수치 <span class="req">필수</span></label>' +
          '<div class="field-hint">이번주: 광고비·노출·클릭·전환·매출 / 전주: 광고비·전환·매출(WoW 비교용, 선택). 숫자만 입력(콤마 자동 처리).</div>' +
        '</div>' +

        '<div class="table-scroll" style="margin-top:6px">' +
          '<table class="t-table" id="reportTable">' +
            '<thead>' +
              '<tr>' +
                '<th style="min-width:120px">매체</th>' +
                '<th>광고비</th><th>노출</th><th>클릭</th><th>전환</th><th>매출</th>' +
                '<th style="color:var(--text-muted)">전주 광고비</th>' +
                '<th style="color:var(--text-muted)">전주 전환</th>' +
                '<th style="color:var(--text-muted)">전주 매출</th>' +
                '<th></th>' +
              '</tr>' +
            '</thead>' +
            '<tbody id="reportRows"></tbody>' +
          '</table>' +
        '</div>' +

        '<div class="btn-row">' +
          '<button class="btn btn-ghost btn-sm" id="reportAddBtn">➕ 행 추가</button>' +
          '<button class="btn btn-ghost btn-sm" id="reportSampleBtn">🎲 예시 채우기</button>' +
          '<button class="btn btn-ghost btn-sm" id="reportClearBtn">🧹 비우기</button>' +
          '<button class="btn btn-ghost btn-sm" id="reportWipeBtn">🗑 입력 비우기</button>' +
          '<button class="btn btn-primary" id="reportGenBtn">📝 리포트 생성</button>' +
        '</div>' +
      '</div>';
  }

  // ── 입력 행 1개 마크업 ────────────────────────────────────
  function reportRowHtml(r) {
    r = r || {};
    function cell(field, val, ph, w) {
      return '<td><input type="text" inputmode="' + (field === 'name' ? 'text' : 'numeric') + '" ' +
        'class="input" data-f="' + field + '" ' +
        'style="padding:7px 9px;font-size:12.5px;min-width:' + (w || 80) + 'px" ' +
        'value="' + reportEsc(val == null ? '' : val) + '" ' +
        'placeholder="' + reportEsc(ph || '') + '"></td>';
    }
    return '<tr class="report-row">' +
      cell('name', r.name, '매체명', 110) +
      cell('cost', r.cost, '0', 90) +
      cell('imp',  r.imp,  '0', 90) +
      cell('clk',  r.clk,  '0', 80) +
      cell('cv',   r.cv,   '0', 70) +
      cell('rev',  r.rev,  '0', 90) +
      cell('pCost', r.pCost, '–', 80) +
      cell('pCv',   r.pCv,   '–', 70) +
      cell('pRev',  r.pRev,  '–', 80) +
      '<td style="text-align:center"><button class="btn btn-ghost btn-sm report-del" title="행 삭제" ' +
        'style="padding:5px 9px">✕</button></td>' +
      '</tr>';
  }

  function reportRenderRows(root, rows) {
    var tbody = root.querySelector('#reportRows');
    if (!tbody) return;
    var html = '';
    for (var i = 0; i < rows.length; i++) html += reportRowHtml(rows[i]);
    tbody.innerHTML = html;
  }

  // ── 이벤트 연결 (컨테이너 내부 위임/직접 바인딩) ───────────
  function reportBind(root) {
    var addBtn = root.querySelector('#reportAddBtn');
    var sampleBtn = root.querySelector('#reportSampleBtn');
    var clearBtn = root.querySelector('#reportClearBtn');
    var wipeBtn = root.querySelector('#reportWipeBtn');
    var genBtn = root.querySelector('#reportGenBtn');
    var tbody = root.querySelector('#reportRows');

    if (addBtn) addBtn.addEventListener('click', function () {
      tbody.insertAdjacentHTML('beforeend', reportRowHtml({}));
      reportSaveState(root);
    });
    if (sampleBtn) sampleBtn.addEventListener('click', function () {
      reportRenderRows(root, reportSampleRows());
      var c = root.querySelector('#reportClient');
      var p = root.querySelector('#reportPeriod');
      if (c && !c.value) c.value = 'HLL중앙 골프웨어';
      if (p && !p.value) p.value = '6월 2주차 (6/8~6/14)';
      reportGenerate(root);
    });
    if (clearBtn) clearBtn.addEventListener('click', function () {
      reportRenderRows(root, reportSeedRows());
      var out = root.querySelector('#reportOut');
      if (out) out.innerHTML = reportEmptyState();
      reportSaveState(root);
    });
    if (wipeBtn) wipeBtn.addEventListener('click', function () {
      // 저장된 입력 영구 삭제 + 화면 초기화
      if (typeof clearToolState === 'function') { try { clearToolState(STATE_KEY); } catch (e) {} }
      var c = root.querySelector('#reportClient');
      var p = root.querySelector('#reportPeriod');
      if (c) c.value = '';
      if (p) p.value = '';
      reportRenderRows(root, reportSeedRows());
      var out2 = root.querySelector('#reportOut');
      if (out2) out2.innerHTML = reportEmptyState();
    });
    if (genBtn) genBtn.addEventListener('click', function () {
      reportGenerate(root);
    });

    // 입력 변경 시 자동 저장 (클라이언트·기간·행 데이터)
    if (tbody) tbody.addEventListener('input', function () { reportSaveState(root); });
    var cInp = root.querySelector('#reportClient');
    var pInp = root.querySelector('#reportPeriod');
    if (cInp) cInp.addEventListener('input', function () { reportSaveState(root); });
    if (pInp) pInp.addEventListener('input', function () { reportSaveState(root); });
    // 행 삭제(이벤트 위임): 최소 1행 유지
    if (tbody) tbody.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.report-del') : null;
      if (!btn) return;
      var tr = btn.closest('tr');
      if (!tr) return;
      if (tbody.querySelectorAll('tr').length <= 1) {
        // 마지막 1행이면 값만 비움
        tr.querySelectorAll('input').forEach(function (inp) { inp.value = ''; });
      } else {
        tr.parentNode.removeChild(tr);
      }
      reportSaveState(root);
    });
  }

  // ── 입력 수집 + 행별 지표 계산 ────────────────────────────
  function reportCollect(root) {
    var trs = root.querySelectorAll('#reportRows tr');
    var rows = [];
    for (var i = 0; i < trs.length; i++) {
      var inps = trs[i].querySelectorAll('input[data-f]');
      var raw = {};
      for (var j = 0; j < inps.length; j++) raw[inps[j].getAttribute('data-f')] = inps[j].value;

      var name = (raw.name || '').trim();
      var cost = reportNum(raw.cost);
      var imp  = reportNum(raw.imp);
      var clk  = reportNum(raw.clk);
      var cv   = reportNum(raw.cv);
      var rev  = reportNum(raw.rev);
      var pCost = reportNum(raw.pCost);
      var pCv   = reportNum(raw.pCv);
      var pRev  = reportNum(raw.pRev);

      // 의미있는 데이터가 하나도 없으면 스킵
      var hasData = (name !== '') || cost != null || imp != null || clk != null || cv != null || rev != null;
      if (!hasData) continue;

      rows.push(reportComputeRow({
        name: name || ('매체 ' + (rows.length + 1)),
        cost: cost, imp: imp, clk: clk, cv: cv, rev: rev,
        pCost: pCost, pCv: pCv, pRev: pRev
      }));
    }
    return rows;
  }

  function reportComputeRow(r) {
    // 비율 단위: CTR/CVR/ROAS 는 %, CPC/CPA 는 원
    var ctr = reportDiv(r.clk, r.imp); ctr = ctr == null ? null : ctr * 100;
    var cpc = reportDiv(r.cost, r.clk);
    var cvr = reportDiv(r.cv, r.clk); cvr = cvr == null ? null : cvr * 100;
    var cpa = reportDiv(r.cost, r.cv);
    var roas = reportDiv(r.rev, r.cost); roas = roas == null ? null : roas * 100;

    // 전주 대비 ROAS / CPA (WoW 비교용)
    var pRoas = reportDiv(r.pRev, r.pCost); pRoas = pRoas == null ? null : pRoas * 100;
    var pCpa  = reportDiv(r.pCost, r.pCv);

    r.ctr = ctr; r.cpc = cpc; r.cvr = cvr; r.cpa = cpa; r.roas = roas;
    r.pRoas = pRoas; r.pCpa = pCpa;
    return r;
  }

  // 합계 + 종합 지표
  function reportTotals(rows) {
    var t = { cost: 0, imp: 0, clk: 0, cv: 0, rev: 0, pCost: 0, pCv: 0, pRev: 0,
              hasCost: false, hasImp: false, hasClk: false, hasCv: false, hasRev: false,
              hasPCost: false, hasPCv: false, hasPRev: false };
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.cost != null) { t.cost += r.cost; t.hasCost = true; }
      if (r.imp  != null) { t.imp  += r.imp;  t.hasImp = true; }
      if (r.clk  != null) { t.clk  += r.clk;  t.hasClk = true; }
      if (r.cv   != null) { t.cv   += r.cv;   t.hasCv = true; }
      if (r.rev  != null) { t.rev  += r.rev;  t.hasRev = true; }
      if (r.pCost != null) { t.pCost += r.pCost; t.hasPCost = true; }
      if (r.pCv   != null) { t.pCv   += r.pCv;   t.hasPCv = true; }
      if (r.pRev  != null) { t.pRev  += r.pRev;  t.hasPRev = true; }
    }
    var cost = t.hasCost ? t.cost : null;
    var imp  = t.hasImp ? t.imp : null;
    var clk  = t.hasClk ? t.clk : null;
    var cv   = t.hasCv ? t.cv : null;
    var rev  = t.hasRev ? t.rev : null;
    var pCost = t.hasPCost ? t.pCost : null;
    var pCv   = t.hasPCv ? t.pCv : null;
    var pRev  = t.hasPRev ? t.pRev : null;

    var ctr = reportDiv(clk, imp); ctr = ctr == null ? null : ctr * 100;
    var cpc = reportDiv(cost, clk);
    var cvr = reportDiv(cv, clk); cvr = cvr == null ? null : cvr * 100;
    var cpa = reportDiv(cost, cv);
    var roas = reportDiv(rev, cost); roas = roas == null ? null : roas * 100;
    var pRoas = reportDiv(pRev, pCost); pRoas = pRoas == null ? null : pRoas * 100;

    return {
      cost: cost, imp: imp, clk: clk, cv: cv, rev: rev,
      pCost: pCost, pCv: pCv, pRev: pRev,
      ctr: ctr, cpc: cpc, cvr: cvr, cpa: cpa, roas: roas, pRoas: pRoas
    };
  }

  // WoW% = (이번주 − 전주)/전주 × 100. 분모 0/null 방어. (카운트 지표용)
  function reportWow(cur, prev) {
    if (cur == null || prev == null || prev === 0) return null;
    return (cur - prev) / prev * 100;
  }
  // 퍼센트포인트(pp) 차이 = 이번주값 − 전주값. (비율 지표 ROAS·CTR·CVR 용)
  // cur/prev 자체가 이미 % 단위(예 ROAS 440 = 440%)이므로 단순 차감.
  function reportWowPp(cur, prev) {
    if (cur == null || prev == null) return null;
    var d = cur - prev;
    if (isNaN(d) || !isFinite(d)) return null;
    return d;
  }
  // pp 배지 문구 ("+12.3%p"). digits 자리.
  function reportPpStr(pp, digits) {
    if (pp == null || isNaN(pp) || !isFinite(pp)) return '–';
    var d = digits == null ? 1 : digits;
    return (pp > 0 ? '+' : '') + pp.toFixed(d) + '%p';
  }

  // ── 메인: 리포트 생성 ─────────────────────────────────────
  function reportGenerate(root) {
    var out = root.querySelector('#reportOut');
    if (!out) return;
    var rows = reportCollect(root);
    if (!rows.length) {
      out.innerHTML = reportEmptyState();
      return;
    }
    var client = (root.querySelector('#reportClient') || {}).value || '';
    var period = (root.querySelector('#reportPeriod') || {}).value || '';
    var t = reportTotals(rows);

    var html = '' +
      '<div class="panel-head">' +
        '<span class="ico">📄</span>' +
        '<div><div class="panel-title">' +
          (client ? reportEsc(client.trim()) + ' · ' : '') + '주간 성과 리포트' +
          '</div><div class="panel-sub">' +
          (period ? reportEsc(period.trim()) : '기간 미입력') +
          ' · 매체 ' + rows.length + '개' +
        '</div></div>' +
      '</div>' +
      reportPrintRowHtml() +
      reportSummaryHtml(t) +
      reportTableHtml(rows, t) +
      reportInsightsHtml(rows, t) +
      reportActionsHtml(rows, t) +
      reportCopyRowHtml() +
      reportLinkRowHtml();

    out.innerHTML = html;

    // 인쇄/PDF 버튼 (생성된 결과 상단)
    var printBtn = out.querySelector('#reportPrintBtn');
    if (printBtn) printBtn.addEventListener('click', function () {
      if (typeof window.print === 'function') window.print();
    });

    // 복사 버튼 바인딩 (생성된 결과 내부)
    var txtBtn = out.querySelector('#reportCopyTxt');
    var tsvBtn = out.querySelector('#reportCopyTsv');
    if (txtBtn) txtBtn.addEventListener('click', function () {
      copyToClipboard(reportPlainText(client, period, rows, t), txtBtn);
    });
    if (tsvBtn) tsvBtn.addEventListener('click', function () {
      copyToClipboard(reportTsv(rows, t), tsvBtn);
    });

    // 연계 버튼 (트러블슈팅 진단 / 매체 벤치마크)
    var diagBtn = out.querySelector('#reportGoDiagnose');
    var benchBtn = out.querySelector('#reportGoBenchmark');
    if (diagBtn) diagBtn.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-diagnose');
    });
    if (benchBtn) benchBtn.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('benchmark');
    });

    // 생성 시점에 입력값 저장
    reportSaveState(root);
  }

  // ── 1. 요약 (.result-grid .metric) + WoW delta ────────────
  function reportSummaryHtml(t) {
    // 카운트 지표(광고비·노출·클릭·전환·매출) WoW = 상대% 배지
    function deltaBadge(curr, prev, opt) {
      // opt.lowerBetter: true면 감소가 호재(예: 광고비는 중립 처리)
      var w = reportWow(curr, prev);
      if (w == null) return '';
      var arrow, cls;
      if (Math.abs(w) < 0.05) { cls = 'flat'; arrow = '→'; }
      else if (w > 0) { cls = (opt && opt.lowerBetter) ? 'down' : 'up'; arrow = '▲'; }
      else { cls = (opt && opt.lowerBetter) ? 'up' : 'down'; arrow = '▼'; }
      // 광고비는 좋고나쁨 색을 빼고 중립(flat 톤)로
      if (opt && opt.neutral) cls = (Math.abs(w) < 0.05) ? 'flat' : (w > 0 ? 'up' : 'down');
      var sign = w > 0 ? '+' : '';
      return ' <span class="delta ' + cls + '">' + arrow + ' ' + sign + reportPct(w, 1) + '</span>';
    }
    // 비율 지표(ROAS·CTR·CVR) WoW = 퍼센트포인트(pp) 배지
    function deltaBadgePp(curr, prev) {
      var pp = reportWowPp(curr, prev);
      if (pp == null) return '';
      var arrow, cls;
      if (Math.abs(pp) < 0.05) { cls = 'flat'; arrow = '→'; }
      else if (pp > 0) { cls = 'up'; arrow = '▲'; }
      else { cls = 'down'; arrow = '▼'; }
      return ' <span class="delta ' + cls + '">' + arrow + ' ' + reportPpStr(pp, 1) + '</span>';
    }

    var cards = [
      { label: '💰 총 광고비', value: reportDash(reportWon(t.cost)), badge: deltaBadge(t.cost, t.pCost, { neutral: true }), cls: '' },
      { label: '👁 총 노출',   value: reportDash(reportInt(t.imp)), unit: '회', badge: '', cls: '' },
      { label: '🖱 총 클릭',   value: reportDash(reportInt(t.clk)), unit: '회', badge: '', cls: '' },
      { label: '🎯 총 전환',   value: reportDash(reportInt(t.cv)), unit: '건', badge: deltaBadge(t.cv, t.pCv), cls: '' },
      { label: '🛒 총 매출',   value: reportDash(reportWon(t.rev)), badge: deltaBadge(t.rev, t.pRev), cls: '' },
      { label: '📈 종합 ROAS', value: reportDash(reportPct(t.roas, 0)), badge: deltaBadgePp(t.roas, t.pRoas), cls: 'primary' },
      { label: '💸 종합 CPA',  value: reportDash(reportWon(t.cpa)), badge: '', cls: '' },
      { label: '🔁 CTR / CVR', value: reportDash(reportPct(t.ctr, 2)) + ' / ' + reportDash(reportPct(t.cvr, 2)), small: true, badge: '', cls: '' }
    ];

    var html = '<div style="font-size:13px;font-weight:800;color:var(--text-primary);margin:18px 0 10px">📌 이번 주 요약</div>';
    html += '<div class="result-grid c3">';
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var valSize = c.small ? 'font-size:17px' : '';
      html += '<div class="metric' + (c.cls ? ' ' + c.cls : '') + '">' +
        '<div class="m-label">' + c.label + '</div>' +
        '<div class="m-value" style="' + valSize + '">' + c.value +
          (c.unit ? '<span class="unit">' + c.unit + '</span>' : '') + '</div>' +
        (c.badge ? '<div class="m-sub">전주 대비' + c.badge + '</div>' : '') +
        '</div>';
    }
    html += '</div>';
    return html;
  }

  // ── 2. 매체별 성과 테이블 ─────────────────────────────────
  function reportTableHtml(rows, t) {
    // ROAS는 비율 지표 → 전주比를 퍼센트포인트(pp)로 표기
    function deltaCellPp(curr, prev) {
      var pp = reportWowPp(curr, prev);
      if (pp == null) return '<span style="color:var(--text-muted)">–</span>';
      var cls, arrow;
      if (Math.abs(pp) < 0.05) { cls = 'flat'; arrow = '→'; }
      else if (pp > 0) { cls = 'up'; arrow = '▲'; }
      else { cls = 'down'; arrow = '▼'; }
      return '<span class="delta ' + cls + '">' + arrow + ' ' + reportPpStr(pp, 1) + '</span>';
    }

    var html = '<div style="font-size:13px;font-weight:800;color:var(--text-primary);margin:24px 0 10px">📊 매체별 성과</div>';
    html += '<div class="table-scroll"><table class="t-table"><thead><tr>' +
      '<th>매체</th><th>광고비</th><th>CTR</th><th>CPC</th><th>CVR</th><th>CPA</th><th>ROAS</th><th>ROAS 전주比</th>' +
      '</tr></thead><tbody>';

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<tr>' +
        '<td>' + reportEsc(r.name) + '</td>' +
        '<td class="num">' + reportDash(reportWon(r.cost)) + '</td>' +
        '<td class="num">' + reportDash(reportPct(r.ctr, 2)) + '</td>' +
        '<td class="num">' + reportDash(reportWon(r.cpc)) + '</td>' +
        '<td class="num">' + reportDash(reportPct(r.cvr, 2)) + '</td>' +
        '<td class="num">' + reportDash(reportWon(r.cpa)) + '</td>' +
        '<td class="num">' + reportDash(reportPct(r.roas, 0)) + '</td>' +
        '<td class="num">' + deltaCellPp(r.roas, r.pRoas) + '</td>' +
        '</tr>';
    }
    // 합계 행
    html += '<tr class="total">' +
      '<td>합계 / 종합</td>' +
      '<td class="num">' + reportDash(reportWon(t.cost)) + '</td>' +
      '<td class="num">' + reportDash(reportPct(t.ctr, 2)) + '</td>' +
      '<td class="num">' + reportDash(reportWon(t.cpc)) + '</td>' +
      '<td class="num">' + reportDash(reportPct(t.cvr, 2)) + '</td>' +
      '<td class="num">' + reportDash(reportWon(t.cpa)) + '</td>' +
      '<td class="num">' + reportDash(reportPct(t.roas, 0)) + '</td>' +
      '<td class="num">' + deltaCellPp(t.roas, t.pRoas) + '</td>' +
      '</tr>';
    html += '</tbody></table></div>';
    return html;
  }

  // ── 3. 자동 인사이트 (규칙 기반 한국어 문장) ──────────────
  function reportInsightsHtml(rows, t) {
    var items = []; // { kind:'ok'|'warn'|'info', text }

    // (1) 종합 ROAS + WoW (비율 지표 → 퍼센트포인트 pp)
    if (t.roas != null) {
      var ppRoas = reportWowPp(t.roas, t.pRoas);
      var roasTxt = '이번 주 종합 ROAS는 <b>' + reportPct(t.roas, 0) + '</b>';
      if (t.cost != null && t.rev != null) {
        roasTxt += ' (광고비 ' + reportWon(t.cost) + ' → 매출 ' + reportWon(t.rev) + ')';
      }
      roasTxt += '입니다.';
      if (ppRoas != null) {
        if (ppRoas >= 5) {
          items.push({ kind: 'ok', text: roasTxt + ' 전주 대비 <b>' + reportPpStr(ppRoas, 1) + '</b> 개선되어 효율이 상승했습니다.' });
        } else if (ppRoas <= -5) {
          items.push({ kind: 'warn', text: roasTxt + ' 전주 대비 <b>' + reportPpStr(ppRoas, 1) + '</b> 하락했습니다. 효율 저하 원인 점검이 필요합니다.' });
        } else {
          items.push({ kind: 'info', text: roasTxt + ' 전주와 유사한 수준(' + reportPpStr(ppRoas, 1) + ')으로 안정적입니다.' });
        }
      } else {
        items.push({ kind: t.roas >= 100 ? 'ok' : 'info', text: roasTxt + ' (전주 데이터가 없어 WoW 비교는 생략)' });
      }
    }

    // (2) ROAS 최고 매체 / CPA 악화 매체
    var best = null, bestRoas = -Infinity;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].roas != null && rows[i].roas > bestRoas) { bestRoas = rows[i].roas; best = rows[i]; }
    }
    if (best) {
      items.push({ kind: 'ok', text: 'ROAS가 가장 높은 매체는 <b>' + reportEsc(best.name) + '</b> (' + reportPct(best.roas, 0) + ')입니다. 효율이 가장 좋아 증액 1순위 후보입니다.' });
    }

    var cpaWorse = [];
    for (var j = 0; j < rows.length; j++) {
      var r = rows[j];
      var wCpa = reportWow(r.cpa, r.pCpa);
      if (wCpa != null && wCpa >= 15) cpaWorse.push({ name: r.name, w: wCpa });
    }
    if (cpaWorse.length) {
      cpaWorse.sort(function (a, b) { return b.w - a.w; });
      var names = cpaWorse.map(function (x) { return '<b>' + reportEsc(x.name) + '</b> (+' + reportPct(x.w, 0) + ')'; }).join(', ');
      items.push({ kind: 'warn', text: 'CPA(전환당 비용)가 전주 대비 크게 상승한 매체: ' + names + '. 전환 효율이 악화되어 소재·타겟 점검이 필요합니다.' });
    }

    // (3) CTR 낮은 매체(<0.5%) / CVR 낮은 매체(<1%)
    var lowCtr = [], lowCvr = [];
    for (var k = 0; k < rows.length; k++) {
      var rr = rows[k];
      if (rr.ctr != null && rr.ctr < 0.5) lowCtr.push(rr.name + ' (' + reportPct(rr.ctr, 2) + ')');
      if (rr.cvr != null && rr.cvr < 1)   lowCvr.push(rr.name + ' (' + reportPct(rr.cvr, 2) + ')');
    }
    var dispCaveat = ' (검색광고 기준이며 디스플레이/소셜은 정상 범위일 수 있음 → <b>[매체 벤치마크]</b> 참고)';
    if (lowCtr.length) {
      items.push({ kind: 'warn', text: 'CTR이 낮은 매체(<0.5%): <b>' + reportEsc(lowCtr.join(', ')) + '</b>. 소재 후킹/타겟 적합성을 점검하세요.' + dispCaveat });
    }
    if (lowCvr.length) {
      items.push({ kind: 'warn', text: 'CVR이 낮은 매체(<1%): <b>' + reportEsc(lowCvr.join(', ')) + '</b>. 랜딩페이지 정합성·타겟 정교화를 검토하세요.' + dispCaveat });
    }

    if (!items.length) {
      items.push({ kind: 'info', text: '인사이트를 생성할 충분한 지표가 없습니다. 노출·클릭·전환·매출 값을 채워 주세요.' });
    }

    var html = '<div style="font-size:13px;font-weight:800;color:var(--text-primary);margin:24px 0 4px">💡 인사이트</div>';
    var icoMap = { ok: '✅', warn: '⚠️', info: 'ℹ️' };
    for (var m = 0; m < items.length; m++) {
      var it = items[m];
      html += '<div class="callout ' + it.kind + '"><span class="c-ico">' + icoMap[it.kind] + '</span><div>' + it.text + '</div></div>';
    }
    return html;
  }

  // ── 4. 다음 주 액션 (규칙 기반 추천) ──────────────────────
  function reportActionsHtml(rows, t) {
    var acts = []; // { ico, text }
    var hasPrev = (t.pCost != null || t.pRev != null || t.pCv != null);

    // 종합 ROAS 기준선(없으면 100% 가정)
    var baseRoas = (t.roas != null) ? t.roas : 100;

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var done = false;

      // CPA 급등 → 소재 교체/타겟 점검 (최우선)
      var wCpa = reportWow(r.cpa, r.pCpa);
      if (wCpa != null && wCpa >= 15) {
        acts.push({ ico: '🛠', text: '<b>' + reportEsc(r.name) + '</b> — CPA 전주 대비 +' + reportPct(wCpa, 0) + ' 급등 → <b>소재 교체 / 타겟 재설정</b> 검토.' });
        done = true;
      }

      // ROAS 높고 안정적 → 증액 검토 (보수적 임계값: 종합ROAS 1.2배 & 절대 300% 이상)
      if (!done && r.roas != null && r.roas >= baseRoas * 1.2 && r.roas >= 300) {
        var stable = true;
        var ppR = reportWowPp(r.roas, r.pRoas);
        if (ppR != null && ppR < -5) stable = false;
        if (stable) {
          acts.push({ ico: '📈', text: '<b>' + reportEsc(r.name) + '</b> — ROAS ' + reportPct(r.roas, 0) + '로 효율 양호 → <b>예산 20% 이내 증액</b> 검토 (단계적 확대). <b>※ 손익분기 ROAS를 넘는지 [손익분기·예산]에서 먼저 확인.</b>' });
          done = true;
        }
      }

      // 예산 대비 전환 적음(CPA가 종합 대비 1.5배 이상) → 랜딩/입찰 점검
      if (!done && r.cpa != null && t.cpa != null && t.cpa > 0 && r.cpa >= t.cpa * 1.5) {
        acts.push({ ico: '🔧', text: '<b>' + reportEsc(r.name) + '</b> — CPA가 종합 평균(' + reportWon(t.cpa) + ')보다 높음 → <b>랜딩페이지·입찰가</b> 점검.' });
        done = true;
      }

      // CVR 낮음
      if (!done && r.cvr != null && r.cvr < 1) {
        acts.push({ ico: '🎯', text: '<b>' + reportEsc(r.name) + '</b> — CVR ' + reportPct(r.cvr, 2) + '로 낮음 → <b>랜딩·타겟</b> 정교화. <b>※ 검색광고 기준이며 디스플레이/소셜은 정상일 수 있음([매체 벤치마크] 참고).</b>' });
        done = true;
      }

      // CTR 낮음
      if (!done && r.ctr != null && r.ctr < 0.5) {
        acts.push({ ico: '🖼', text: '<b>' + reportEsc(r.name) + '</b> — CTR ' + reportPct(r.ctr, 2) + '로 낮음 → <b>소재 후킹</b> 개선. <b>※ 검색광고 기준이며 디스플레이/소셜은 정상일 수 있음([매체 벤치마크] 참고).</b>' });
        done = true;
      }
    }

    // 전주 데이터 없으면 일반 권고
    if (!hasPrev) {
      acts.push({ ico: '🗓', text: '전주 데이터가 없어 WoW 추세 판단이 어렵습니다. <b>다음 주부터 전주 광고비·전환·매출을 함께 기록</b>해 추세를 모니터링하세요.' });
    }
    if (!acts.length) {
      acts.push({ ico: '✅', text: '전반적으로 안정적입니다. <b>현 예산·세팅을 유지</b>하며 주간 추세를 관찰하세요.' });
    }

    var html = '<div style="font-size:13px;font-weight:800;color:var(--text-primary);margin:24px 0 8px">🎯 다음 주 액션</div>';
    html += '<div class="callout info"><span class="c-ico">📋</span><div style="line-height:1.9">';
    for (var a = 0; a < acts.length; a++) {
      html += '<div style="margin-bottom:' + (a === acts.length - 1 ? '0' : '6px') + '">' + acts[a].ico + ' ' + acts[a].text + '</div>';
    }
    html += '</div></div>';
    return html;
  }

  // ── 인쇄/PDF 버튼 행 (결과 상단, @media print 로 인쇄에서 자동 숨김) ──
  function reportPrintRowHtml() {
    return '<div class="btn-row" style="margin:14px 0 0;justify-content:flex-end">' +
      '<button class="btn btn-ghost btn-sm" id="reportPrintBtn">🖨 인쇄 / PDF 저장</button>' +
      '</div>';
  }

  // ── 복사 버튼 행 ──────────────────────────────────────────
  function reportCopyRowHtml() {
    return '<div class="btn-row">' +
      '<button class="btn btn-primary copy-btn" id="reportCopyTxt">📋 리포트 복사 (텍스트)</button>' +
      '<button class="btn btn-ghost copy-btn" id="reportCopyTsv">📊 표 복사 (TSV)</button>' +
      '</div>';
  }

  // ── 연계 버튼 행 (관련 도구로 이동) ───────────────────────
  function reportLinkRowHtml() {
    return '<div class="btn-row" style="margin-top:8px">' +
      '<button class="btn btn-ghost btn-sm" id="reportGoDiagnose">🩺 트러블슈팅 진단</button>' +
      '<button class="btn btn-ghost btn-sm" id="reportGoBenchmark">📊 매체 벤치마크</button>' +
      '</div>';
  }

  // ── 빈 상태 ──────────────────────────────────────────────
  function reportEmptyState() {
    return '<div class="panel-head">' +
        '<span class="ico">📄</span>' +
        '<div><div class="panel-title">리포트 미리보기</div>' +
        '<div class="panel-sub">매체 수치를 입력하고 [리포트 생성]을 누르세요</div></div>' +
      '</div>' +
      '<div class="empty-state">' +
        '<div class="e-ico">📝</div>' +
        '<div class="e-txt">아직 생성된 리포트가 없습니다.<br>' +
        '매체별 수치를 입력한 뒤 <b>📝 리포트 생성</b> 버튼을 누르거나,<br>' +
        '<b>🎲 예시 채우기</b>로 샘플 리포트를 확인해 보세요.</div>' +
      '</div>';
  }

  // ── 복사용: 사람이 읽기 좋은 markdown/plain text ──────────
  function reportPlainText(client, period, rows, t) {
    function pPct(n, d) { return reportDash(reportPct(n, d)); }
    function pWon(n) { return reportDash(reportWon(n)); }
    function pInt(n) { return reportDash(reportInt(n)); }
    function wowStr(curr, prev) {
      var w = reportWow(curr, prev);
      if (w == null) return '';
      return ' (전주比 ' + (w > 0 ? '+' : '') + reportPct(w, 1) + ')';
    }
    // 비율 지표(ROAS 등) → 퍼센트포인트(pp)
    function wowPpStr(curr, prev) {
      var pp = reportWowPp(curr, prev);
      if (pp == null) return '';
      return ' (전주比 ' + reportPpStr(pp, 1) + ')';
    }

    var L = [];
    L.push('# ' + (client && client.trim() ? client.trim() + ' ' : '') + '주간 성과 리포트');
    if (period && period.trim()) L.push('기간: ' + period.trim());
    L.push('매체: ' + rows.length + '개');
    L.push('');
    L.push('## 📌 요약');
    L.push('- 총 광고비: ' + pWon(t.cost) + wowStr(t.cost, t.pCost));
    L.push('- 총 노출: ' + pInt(t.imp) + '회');
    L.push('- 총 클릭: ' + pInt(t.clk) + '회');
    L.push('- 총 전환: ' + pInt(t.cv) + '건' + wowStr(t.cv, t.pCv));
    L.push('- 총 매출: ' + pWon(t.rev) + wowStr(t.rev, t.pRev));
    L.push('- 종합 ROAS: ' + pPct(t.roas, 0) + wowPpStr(t.roas, t.pRoas));
    L.push('- 종합 CPA: ' + pWon(t.cpa));
    L.push('- CTR / CVR: ' + pPct(t.ctr, 2) + ' / ' + pPct(t.cvr, 2));
    L.push('');
    L.push('## 📊 매체별 성과');
    L.push('매체 | 광고비 | CTR | CPC | CVR | CPA | ROAS');
    L.push('--- | --- | --- | --- | --- | --- | ---');
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      L.push([r.name, pWon(r.cost), pPct(r.ctr, 2), pWon(r.cpc), pPct(r.cvr, 2), pWon(r.cpa), pPct(r.roas, 0)].join(' | '));
    }
    L.push(['합계/종합', pWon(t.cost), pPct(t.ctr, 2), pWon(t.cpc), pPct(t.cvr, 2), pWon(t.cpa), pPct(t.roas, 0)].join(' | '));
    L.push('');

    // 인사이트 (HTML 태그 제거 텍스트화)
    L.push('## 💡 인사이트');
    var insights = reportInsightsTextList(rows, t);
    for (var a = 0; a < insights.length; a++) L.push('- ' + insights[a]);
    L.push('');

    L.push('## 🎯 다음 주 액션');
    var actions = reportActionsTextList(rows, t);
    for (var b = 0; b < actions.length; b++) L.push('- ' + actions[b]);

    return L.join('\n');
  }

  // 인사이트/액션 텍스트 버전 (복사용, 태그 없음) ── HTML과 동일 규칙
  function reportStrip(html) {
    return String(html).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
  function reportInsightsTextList(rows, t) {
    // HTML 생성 후 태그 제거하여 동일 문구 보장
    var tmp = document.createElement('div');
    tmp.innerHTML = reportInsightsHtml(rows, t);
    var nodes = tmp.querySelectorAll('.callout > div');
    var out = [];
    for (var i = 0; i < nodes.length; i++) out.push(reportStrip(nodes[i].innerHTML));
    return out.length ? out : ['(인사이트 없음)'];
  }
  function reportActionsTextList(rows, t) {
    var tmp = document.createElement('div');
    tmp.innerHTML = reportActionsHtml(rows, t);
    var nodes = tmp.querySelectorAll('.callout > div > div');
    var out = [];
    for (var i = 0; i < nodes.length; i++) out.push(reportStrip(nodes[i].innerHTML));
    return out.length ? out : ['(액션 없음)'];
  }

  // ── 복사용: 매체별 표 TSV (스프레드시트 붙여넣기용) ───────
  function reportTsv(rows, t) {
    function pPct(n, d) { var v = reportPct(n, d); return v === '–' ? '' : v; }
    function pWon(n) { return (n == null || isNaN(n) || !isFinite(n)) ? '' : Math.round(n); }
    function pInt(n) { return (n == null || isNaN(n) || !isFinite(n)) ? '' : Math.round(n); }
    var lines = [];
    lines.push(['매체', '광고비', '노출', '클릭', '전환', '매출', 'CTR', 'CPC', 'CVR', 'CPA', 'ROAS'].join('\t'));
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      lines.push([
        r.name, pWon(r.cost), pInt(r.imp), pInt(r.clk), pInt(r.cv), pWon(r.rev),
        pPct(r.ctr, 2), pWon(r.cpc), pPct(r.cvr, 2), pWon(r.cpa), pPct(r.roas, 0)
      ].join('\t'));
    }
    lines.push([
      '합계/종합', pWon(t.cost), pInt(t.imp), pInt(t.clk), pInt(t.cv), pWon(t.rev),
      pPct(t.ctr, 2), pWon(t.cpc), pPct(t.cvr, 2), pWon(t.cpa), pPct(t.roas, 0)
    ].join('\t'));
    return lines.join('\n');
  }

})();
