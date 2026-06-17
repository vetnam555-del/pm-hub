// ============================================================
// kpi.js — KPI 계산기 도구 모듈
// 진입점: window.renderKpiTool()  →  컨테이너 id="page-tool-kpi"
// 모드 A "지표 계산" / 모드 B "목표 역산" 을 .seg 로 전환.
// ES 모듈 금지(평범한 스크립트), 외부 의존 없음, file:// 동작.
// 전역 헬퍼 사용: fmtInt / fmtWon / fmtWonShort / fmtPct (app.js)
// 전역 식별자는 모두 kpi* 접두사 + IIFE 캡슐화. 진입점만 window 노출.
// ============================================================
(function () {
  'use strict';

  var CONTAINER_ID = 'page-tool-kpi';

  // 현재 모드 상태 ('calc' | 'reverse')
  var kpiMode = 'calc';

  // ── 안전 숫자 파서: 빈칸/문자/콤마 방어 → 유효 양수 아니면 null ──
  function kpiNum(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().replace(/,/g, '');
    if (s === '') return null;
    var n = parseFloat(s);
    if (!isFinite(n)) return null;
    return n;
  }
  // 0 또는 음수면 나눗셈 분모로 못 쓰므로 null 처리
  function kpiPos(raw) {
    var n = kpiNum(raw);
    if (n == null || n <= 0) return null;
    return n;
  }
  // 비음수(0 허용) — 노출/클릭/전환 등 카운트 값
  function kpiCount(raw) {
    var n = kpiNum(raw);
    if (n == null || n < 0) return null;
    return n;
  }

  // ── 컨테이너 헬퍼 ──
  function kpiRoot() { return document.getElementById(CONTAINER_ID); }
  function kpiQ(sel) { var r = kpiRoot(); return r ? r.querySelector(sel) : null; }
  function kpiQA(sel) { var r = kpiRoot(); return r ? r.querySelectorAll(sel) : []; }

  // 입력 필드 1개 마크업 (im: inputmode — 'numeric'(금액·정수) | 'decimal'(비율%·소수))
  function kpiField(id, label, unit, hint, im) {
    var mode = (im === 'decimal') ? 'decimal' : 'numeric';
    var attrs = 'type="text" inputmode="' + mode + '" class="input" id="' + id + '" placeholder="0"';
    var affix = unit
      ? '<div class="input-affix"><input ' + attrs + '><span class="affix">' + unit + '</span></div>'
      : '<input ' + attrs + '>';
    return '<div class="field">'
      + '<label>' + label + ' <span class="opt">선택</span></label>'
      + affix
      + (hint ? '<div class="field-hint">' + hint + '</div>' : '')
      + '</div>';
  }

  // 결과 지표 타일 마크업
  function kpiMetric(id, label, cls) {
    return '<div class="metric ' + (cls || '') + '" id="' + id + '">'
      + '<div class="m-label">' + label + '</div>'
      + '<div class="m-value">–</div>'
      + '<div class="formula"></div>'
      + '</div>';
  }

  // ROAS 강조 카드(풀폭 .metric.primary) — 결론을 한눈에. 폰트크기는 공통 CSS가 처리(primary 30px)
  function kpiRoasMetric() {
    return '<div class="metric primary" id="m-roas" style="margin-bottom:14px">'
      + '<div class="m-label">ROAS <span style="color:var(--text-muted);font-weight:600">광고수익률 · 매출 ÷ 광고비 × 100</span></div>'
      + '<div class="m-value">–</div>'
      + '<div class="formula"></div>'
      + '</div>';
  }

  // 타일 값/공식 세팅. val==null 이면 "–"
  function kpiSet(id, valHtml, formula, stateCls) {
    var el = kpiQ('#' + id);
    if (!el) return;
    var v = el.querySelector('.m-value');
    var f = el.querySelector('.formula');
    if (v) v.innerHTML = (valHtml == null ? '–' : valHtml);
    if (f && formula != null) f.textContent = formula;
    // 상태 색(good/bad/primary)은 primary 타일에는 적용 안 함
    el.classList.remove('good', 'bad');
    if (stateCls) el.classList.add(stateCls);
  }

  // 값 + 단위 조합 HTML
  function kpiVU(valStr, unit) {
    if (valStr == null) return null;
    return valStr + (unit ? '<span class="unit">' + unit + '</span>' : '');
  }

  // ============================================================
  // 모드 A — 지표 계산
  // ============================================================
  function kpiCalcInputsHtml() {
    return '<div class="panel panel-sticky">'
      + '<div class="panel-head"><span class="ico">📊</span><div>'
      + '<div class="panel-title">캠페인 실적 입력</div>'
      + '<div class="panel-sub">아는 값만 넣으면 됩니다. 입력 즉시 계산돼요.</div>'
      + '</div></div>'
      + kpiField('kpi-imp', '노출수', '회', '광고가 화면에 노출된 횟수', 'numeric')
      + kpiField('kpi-clk', '클릭수', '회', null, 'numeric')
      + kpiField('kpi-cost', '광고비', '원', null, 'numeric')
      + kpiField('kpi-conv', '전환수', '건', '구매·가입·신청 등 목표 행동', 'numeric')
      + kpiField('kpi-rev', '매출', '원', '전환으로 발생한 총 매출액', 'numeric')
      + kpiField('kpi-reach', '도달수', '명', '광고를 본 순(unique) 사용자 수 — 빈도 계산용', 'numeric')
      + '<div class="btn-row">'
      + '<button class="btn btn-ghost btn-sm" id="kpi-sample">✨ 예시 채우기</button>'
      + '<button class="btn btn-ghost btn-sm" id="kpi-clear">🗑 입력 비우기</button>'
      + '</div>'
      + '</div>';
  }

  function kpiCalcResultsHtml() {
    return '<div class="panel">'
      + '<div class="panel-head"><span class="ico">🧮</span><div>'
      + '<div class="panel-title">핵심 지표</div>'
      + '<div class="panel-sub">계산 가능한 지표만 표시됩니다.</div>'
      + '</div></div>'
      // 입력 전 빈 상태(헤더 이모지와 동일한 📊)
      + '<div class="empty-state" id="kpi-calc-empty"><div class="e-ico">📊</div>'
      + '<div class="e-txt">노출·클릭·광고비·전환·매출을 입력하면<br>핵심 지표가 계산됩니다.</div></div>'
      // 계산 결과 묶음(값이 하나라도 나오면 노출)
      + '<div id="kpi-calc-body" style="display:none">'
      // ROAS = 결론. 최상단 풀폭 강조 카드
      + kpiRoasMetric()
      // 나머지 7개 지표
      + '<div class="result-grid c3">'
      + kpiMetric('m-ctr', 'CTR <span style="color:var(--text-muted);font-weight:600">클릭률</span>')
      + kpiMetric('m-cpc', 'CPC <span style="color:var(--text-muted);font-weight:600">클릭당비용</span>')
      + kpiMetric('m-cpm', 'CPM <span style="color:var(--text-muted);font-weight:600">1천회노출</span>')
      + kpiMetric('m-cvr', 'CVR <span style="color:var(--text-muted);font-weight:600">전환율</span>')
      + kpiMetric('m-cpa', 'CPA <span style="color:var(--text-muted);font-weight:600">전환당비용</span>')
      + kpiMetric('m-aov', '객단가 <span style="color:var(--text-muted);font-weight:600">AOV</span>')
      + kpiMetric('m-freq', '빈도 <span style="color:var(--text-muted);font-weight:600">Frequency</span>')
      + '</div>'
      // CTR·CVR 좋고 나쁨은 매체마다 다름 → 절대 임계값 색판정 대신 안내
      + '<div class="callout info"><span class="c-ico">ℹ️</span><div>'
      + 'CTR·CVR의 좋고 나쁨은 매체마다 다릅니다(검색 3~10% vs 디스플레이 0.3~0.8%). 내 매체 정상 범위는 아래에서 확인하세요.'
      + '<div class="btn-row" style="margin-top:10px"><button class="btn btn-ghost btn-sm" id="kpi-go-bench" onclick="showPage(\'benchmark\')">📊 매체 벤치마크</button></div>'
      + '</div></div>'
      + '<div class="callout info"><span class="c-ico">ℹ️</span><div>'
      + 'ROAS 100% = 본전(광고비=매출). 마진을 고려한 진짜 손익분기는 <b>[손익분기·예산]</b> 도구에서 확인하세요.'
      + '</div></div>'
      // 결과 복사
      + '<div class="btn-row"><button class="btn btn-ghost btn-sm copy-btn" id="kpi-copy">📋 결과 복사</button></div>'
      // 도구 연계 버튼(AOV 계산 시 동적 노출)
      + '<div class="btn-row" id="kpi-calc-actions"></div>'
      + '</div>' // /#kpi-calc-body
      + '</div>';
  }

  // 마지막 계산 스냅샷(결과 복사용 plain text 구성)
  var kpiLastSnap = null;

  function kpiRecalc() {
    var imp = kpiCount(kpiQ('#kpi-imp') && kpiQ('#kpi-imp').value);
    var clk = kpiCount(kpiQ('#kpi-clk') && kpiQ('#kpi-clk').value);
    var cost = kpiCount(kpiQ('#kpi-cost') && kpiQ('#kpi-cost').value);
    var conv = kpiCount(kpiQ('#kpi-conv') && kpiQ('#kpi-conv').value);
    var rev = kpiCount(kpiQ('#kpi-rev') && kpiQ('#kpi-rev').value);
    var reach = kpiCount(kpiQ('#kpi-reach') && kpiQ('#kpi-reach').value);

    // 복사용 텍스트 누적(계산된 지표만)
    var snap = { inputs: [], metrics: [], any: false };
    if (imp != null) snap.inputs.push('노출 ' + fmtInt(imp) + '회');
    if (clk != null) snap.inputs.push('클릭 ' + fmtInt(clk) + '회');
    if (cost != null) snap.inputs.push('광고비 ' + fmtWon(cost));
    if (conv != null) snap.inputs.push('전환 ' + fmtInt(conv) + '건');
    if (rev != null) snap.inputs.push('매출 ' + fmtWon(rev));
    if (reach != null) snap.inputs.push('도달 ' + fmtInt(reach) + '명');

    // CTR = 클릭/노출×100  (노출>0 필요) — 절대 임계값 색판정 제거(매체별 정상범위 상이)
    if (imp != null && imp > 0 && clk != null) {
      var ctr = clk / imp * 100;
      kpiSet('m-ctr', kpiVU(fmtPct(ctr), null), '클릭 ÷ 노출 × 100');
      snap.metrics.push('CTR(클릭률): ' + fmtPct(ctr) + ' = 클릭 ÷ 노출 × 100'); snap.any = true;
    } else { kpiSet('m-ctr', null, '클릭 ÷ 노출 × 100'); }

    // CPC = 광고비/클릭  (클릭>0 필요)
    if (cost != null && clk != null && clk > 0) {
      kpiSet('m-cpc', kpiVU(fmtInt(cost / clk), '원'), '광고비 ÷ 클릭');
      snap.metrics.push('CPC(클릭당비용): ' + fmtWon(cost / clk) + ' = 광고비 ÷ 클릭'); snap.any = true;
    } else { kpiSet('m-cpc', null, '광고비 ÷ 클릭'); }

    // CPM = 광고비/노출×1000  (노출>0 필요)
    if (cost != null && imp != null && imp > 0) {
      kpiSet('m-cpm', kpiVU(fmtInt(cost / imp * 1000), '원'), '광고비 ÷ 노출 × 1,000');
      snap.metrics.push('CPM(1천회노출비용): ' + fmtWon(cost / imp * 1000) + ' = 광고비 ÷ 노출 × 1,000'); snap.any = true;
    } else { kpiSet('m-cpm', null, '광고비 ÷ 노출 × 1,000'); }

    // CVR = 전환/클릭×100  (클릭>0 필요) — 절대 임계값 색판정 제거(매체별 정상범위 상이)
    if (conv != null && clk != null && clk > 0) {
      var cvr = conv / clk * 100;
      kpiSet('m-cvr', kpiVU(fmtPct(cvr), null), '전환 ÷ 클릭 × 100');
      snap.metrics.push('CVR(전환율): ' + fmtPct(cvr) + ' = 전환 ÷ 클릭 × 100'); snap.any = true;
    } else { kpiSet('m-cvr', null, '전환 ÷ 클릭 × 100'); }

    // CPA = 광고비/전환  (전환>0 필요)
    if (cost != null && conv != null && conv > 0) {
      kpiSet('m-cpa', kpiVU(fmtInt(cost / conv), '원'), '광고비 ÷ 전환');
      snap.metrics.push('CPA(전환당비용): ' + fmtWon(cost / conv) + ' = 광고비 ÷ 전환'); snap.any = true;
    } else { kpiSet('m-cpa', null, '광고비 ÷ 전환'); }

    // ROAS = 매출/광고비×100  (광고비>0 필요) — primary, 100% 기준 색
    if (rev != null && cost != null && cost > 0) {
      var roas = rev / cost * 100;
      var rl = (rev >= cost) ? '본전 이상' : '본전 미달';
      kpiSet('m-roas', kpiVU(fmtPct(roas, roas >= 1000 ? 0 : 2), null), '매출 ÷ 광고비 × 100');
      var roEl = kpiQ('#m-roas');
      if (roEl) {
        var sub = roEl.querySelector('.m-sub');
        if (!sub) { sub = document.createElement('div'); sub.className = 'm-sub'; roEl.appendChild(sub); }
        sub.textContent = (rev >= cost ? '🟢 ' : '🔴 ') + rl + ' · 순이익 ' + fmtWon(rev - cost);
      }
      snap.metrics.push('ROAS(광고수익률): ' + fmtPct(roas, roas >= 1000 ? 0 : 2)
        + ' (' + rl + ' · 순이익 ' + fmtWon(rev - cost) + ') = 매출 ÷ 광고비 × 100'); snap.any = true;
    } else {
      kpiSet('m-roas', null, '매출 ÷ 광고비 × 100');
      var roEl2 = kpiQ('#m-roas');
      if (roEl2) { var s2 = roEl2.querySelector('.m-sub'); if (s2) s2.textContent = ''; }
    }

    // 객단가 AOV = 매출/전환  (전환>0 필요)
    var aovVal = null;
    if (rev != null && conv != null && conv > 0) {
      aovVal = rev / conv;
      kpiSet('m-aov', kpiVU(fmtInt(aovVal), '원'), '매출 ÷ 전환');
      snap.metrics.push('객단가(AOV): ' + fmtWon(aovVal) + ' = 매출 ÷ 전환'); snap.any = true;
    } else { kpiSet('m-aov', null, '매출 ÷ 전환'); }

    // 빈도 Frequency = 노출/도달  (도달>0 필요)
    if (imp != null && reach != null && reach > 0) {
      var freq = imp / reach;
      kpiSet('m-freq', kpiVU(freq.toFixed(2), '회'), '노출 ÷ 도달', freq > 3 ? 'bad' : null);
      snap.metrics.push('빈도(Frequency): ' + freq.toFixed(2) + '회 = 노출 ÷ 도달'); snap.any = true;
    } else { kpiSet('m-freq', null, '노출 ÷ 도달'); }

    // 빈 상태 ↔ 결과 토글(계산된 지표가 하나도 없으면 빈 상태)
    var emptyEl = kpiQ('#kpi-calc-empty');
    var bodyEl = kpiQ('#kpi-calc-body');
    if (emptyEl) emptyEl.style.display = snap.any ? 'none' : '';
    if (bodyEl) bodyEl.style.display = snap.any ? '' : 'none';

    kpiLastSnap = snap;

    // 도구 연계 버튼: AOV 계산 시 손익분기 연결, 항상 용어사전 제공
    kpiRenderActions(aovVal);
    // 입력값 영속화
    kpiSaveCalcState();
  }

  // 결과 복사용 plain text 구성
  function kpiBuildCopyText() {
    var snap = kpiLastSnap;
    if (!snap || !snap.any) return null;
    var lines = ['[KPI 계산기 — 핵심 지표]'];
    if (snap.inputs.length) lines.push('입력: ' + snap.inputs.join(' / '));
    lines.push('');
    snap.metrics.forEach(function (m) { lines.push('· ' + m); });
    return lines.join('\n');
  }

  // 결과 하단 도구 연계 버튼 렌더(AOV 유효 시 손익분기 버튼 추가)
  function kpiRenderActions(aovVal) {
    var box = kpiQ('#kpi-calc-actions');
    if (!box) return;
    var html = '';
    if (aovVal != null && isFinite(aovVal) && aovVal > 0) {
      html += '<button class="btn btn-primary btn-sm" id="kpi-go-budget" data-aov="' + Math.round(aovVal) + '">→ 이 객단가로 손익분기 계산</button>';
    }
    html += '<button class="btn btn-ghost btn-sm" id="kpi-go-glossary" onclick="showPage(\'glossary\')">📖 용어 사전</button>';
    box.innerHTML = html;
    var gb = kpiQ('#kpi-go-budget');
    if (gb) {
      gb.addEventListener('click', function () {
        var a = parseFloat(gb.getAttribute('data-aov'));
        if (window.budgetPrefill && isFinite(a)) window.budgetPrefill({ aov: a });
        showPage('tool-budget');
      });
    }
  }

  // ── 입력값 영속화(localStorage) ──
  var KPI_CALC_IDS = ['kpi-imp', 'kpi-clk', 'kpi-cost', 'kpi-conv', 'kpi-rev', 'kpi-reach'];
  function kpiSaveCalcState() {
    var st = {};
    KPI_CALC_IDS.forEach(function (id) {
      var el = kpiQ('#' + id);
      if (el) st[id] = el.value;
    });
    saveToolState('kpi', st);
  }
  function kpiLoadCalcState() {
    var st = loadToolState('kpi');
    if (!st || typeof st !== 'object') return;
    KPI_CALC_IDS.forEach(function (id) {
      var el = kpiQ('#' + id);
      if (el && st[id] != null) el.value = st[id];
    });
  }

  function kpiFillSample() {
    var map = { 'kpi-imp': 500000, 'kpi-clk': 6000, 'kpi-cost': 3000000, 'kpi-conv': 180, 'kpi-rev': 12600000, 'kpi-reach': 320000 };
    Object.keys(map).forEach(function (id) { var el = kpiQ('#' + id); if (el) el.value = map[id]; });
    kpiRecalc();
  }
  // 🗑 입력 비우기 — 저장된 상태까지 삭제 후 초기화
  function kpiClearCalc() {
    clearToolState('kpi');
    KPI_CALC_IDS.forEach(function (id) {
      var el = kpiQ('#' + id); if (el) el.value = '';
    });
    kpiRecalc();
  }

  function kpiBindCalc() {
    // 저장된 입력 복원 후 이벤트 바인딩
    kpiLoadCalcState();
    KPI_CALC_IDS.forEach(function (id) {
      var el = kpiQ('#' + id);
      if (el) el.addEventListener('input', kpiRecalc);
    });
    var sb = kpiQ('#kpi-sample'); if (sb) sb.addEventListener('click', kpiFillSample);
    var cb = kpiQ('#kpi-clear'); if (cb) cb.addEventListener('click', kpiClearCalc);
    var cpy = kpiQ('#kpi-copy');
    if (cpy) cpy.addEventListener('click', function () {
      var txt = kpiBuildCopyText();
      if (txt) copyToClipboard(txt, cpy);
    });
    kpiRecalc();
  }

  // ============================================================
  // 모드 B — 목표 역산
  // ============================================================
  // 역산 케이스: 'cpa'(예산+목표CPA) | 'roas'(객단가+목표ROAS)
  var kpiRevCase = 'cpa';

  function kpiReverseInputsHtml() {
    return '<div class="panel panel-sticky">'
      + '<div class="panel-head"><span class="ico">🎯</span><div>'
      + '<div class="panel-title">목표 조건 입력</div>'
      + '<div class="panel-sub">목표를 정하면 필요한 실적을 거꾸로 계산합니다.</div>'
      + '</div></div>'
      // 케이스 선택 세그
      + '<div class="field"><label>역산 방식</label>'
      + '<div class="seg" id="kpi-rev-seg" role="tablist">'
      + '<button class="seg-btn on" data-case="cpa">예산 + 목표 CPA</button>'
      + '<button class="seg-btn" data-case="roas">객단가 + 목표 ROAS</button>'
      + '</div></div>'
      // 케이스1 입력
      + '<div id="kpi-rev-cpa">'
      + kpiField('kpi-r-budget', '광고비 예산', '원', '이번 캠페인에 쓸 총 예산', 'numeric')
      + kpiField('kpi-r-tcpa', '목표 CPA', '원', '전환 1건당 허용 가능한 비용', 'numeric')
      + kpiField('kpi-r-cvr1', '예상 전환율(CVR)', '%', '입력 시 필요 클릭수도 계산', 'decimal')
      + kpiField('kpi-r-cpc1', '예상 클릭당비용(CPC)', '원', '입력 시 필요 광고비 검증', 'numeric')
      + '</div>'
      // 케이스2 입력
      + '<div id="kpi-rev-roas" style="display:none">'
      + kpiField('kpi-r-aov', '객단가(AOV)', '원', '전환 1건당 평균 매출', 'numeric')
      + kpiField('kpi-r-troas', '목표 ROAS', '%', '예: 400% = 광고비 1원당 매출 4원', 'decimal')
      + kpiField('kpi-r-cvr2', '예상 전환율(CVR)', '%', '입력 시 허용 CPC도 계산', 'decimal')
      + '</div>'
      + '<div class="btn-row">'
      + '<button class="btn btn-ghost btn-sm" id="kpi-rev-sample">✨ 예시 채우기</button>'
      + '<button class="btn btn-ghost btn-sm" id="kpi-rev-clear">🗑 입력 비우기</button>'
      + '</div>'
      + '</div>';
  }

  function kpiReverseResultsHtml() {
    return '<div class="panel">'
      + '<div class="panel-head"><span class="ico">📐</span><div>'
      + '<div class="panel-title">역산 결과</div>'
      + '<div class="panel-sub">목표 달성에 필요한 조건</div>'
      + '</div></div>'
      + '<div id="kpi-rev-out"></div>'
      + '<div class="callout info"><span class="c-ico">ℹ️</span><div>'
      + '여기서는 마진을 반영하지 않은 단순 역산입니다. 마진 기반 손익분기 CPA/ROAS는 <b>[손익분기·예산]</b> 도구에서 계산하세요.'
      + '</div></div>'
      // 공통 도구 연계: 용어 사전
      + '<div class="btn-row"><button class="btn btn-ghost btn-sm" onclick="showPage(\'glossary\')">📖 용어 사전</button></div>'
      + '</div>';
  }

  function kpiEmptyState(msg) {
    return '<div class="empty-state"><div class="e-ico">📊</div><div class="e-txt">' + msg + '</div></div>';
  }

  function kpiRevRecalc() {
    var out = kpiQ('#kpi-rev-out');
    if (!out) return;

    if (kpiRevCase === 'cpa') {
      var budget = kpiPos(kpiQ('#kpi-r-budget') && kpiQ('#kpi-r-budget').value);
      var tcpa = kpiPos(kpiQ('#kpi-r-tcpa') && kpiQ('#kpi-r-tcpa').value);
      var cvr = kpiPos(kpiQ('#kpi-r-cvr1') && kpiQ('#kpi-r-cvr1').value);   // %
      var cpc = kpiPos(kpiQ('#kpi-r-cpc1') && kpiQ('#kpi-r-cpc1').value);   // 원

      if (budget == null || tcpa == null) {
        out.innerHTML = kpiEmptyState('<b>광고비 예산</b>과 <b>목표 CPA</b>를 입력하면<br>필요 전환수를 계산합니다.');
        return;
      }
      var needConv = budget / tcpa;                 // 필요 전환수
      var needClick = (cvr != null) ? needConv / (cvr / 100) : null; // 필요 클릭수
      var checkCost = (cpc != null && needClick != null) ? needClick * cpc : null; // 검증 광고비

      var html = '<div class="result-grid">'
        + '<div class="metric primary"><div class="m-label">필요 전환수</div>'
        + '<div class="m-value">' + fmtInt(needConv) + '<span class="unit">건</span></div>'
        + '<div class="formula">예산 ÷ 목표CPA</div></div>'
        + '<div class="metric"><div class="m-label">필요 클릭수</div>'
        + '<div class="m-value">' + (needClick != null ? fmtInt(needClick) + '<span class="unit">회</span>' : '–') + '</div>'
        + '<div class="formula">필요전환 ÷ (CVR÷100)</div></div>'
        + '</div>';

      // 해설 콜아웃
      var note = '예산 <b>' + fmtWon(budget) + '</b>으로 목표 CPA <b>' + fmtWon(tcpa) + '</b>를 맞추려면 전환 <b>' + fmtInt(needConv) + '건</b>이 필요합니다.';
      if (needClick != null) note += ' 예상 CVR ' + fmtPct(cvr) + ' 기준 클릭 <b>' + fmtInt(needClick) + '회</b> 확보가 목표예요.';
      html += '<div class="callout ok"><span class="c-ico">🎯</span><div>' + note + '</div></div>';

      // CPC 검증
      if (checkCost != null) {
        var diff = checkCost - budget;
        var okBudget = checkCost <= budget * 1.0001;
        html += '<div class="callout ' + (okBudget ? 'ok' : 'warn') + '"><span class="c-ico">' + (okBudget ? '✅' : '⚠️') + '</span><div>'
          + '예상 CPC <b>' + fmtWon(cpc) + '</b> 기준 필요 클릭 ' + fmtInt(needClick) + '회의 예상 광고비는 <b>' + fmtWon(checkCost) + '</b>입니다. '
          + (okBudget
              ? '설정 예산 안에서 목표 달성이 가능합니다.'
              : '설정 예산보다 <b>' + fmtWon(diff) + '</b> 더 필요합니다. CPC를 낮추거나 예산을 늘리세요.')
          + '</div></div>';
      }
      out.innerHTML = html;

    } else { // roas
      var aov = kpiPos(kpiQ('#kpi-r-aov') && kpiQ('#kpi-r-aov').value);
      var troas = kpiPos(kpiQ('#kpi-r-troas') && kpiQ('#kpi-r-troas').value); // %
      var cvr2 = kpiPos(kpiQ('#kpi-r-cvr2') && kpiQ('#kpi-r-cvr2').value);    // %

      if (aov == null || troas == null) {
        out.innerHTML = kpiEmptyState('<b>객단가</b>와 <b>목표 ROAS</b>를 입력하면<br>허용 CPA를 계산합니다.');
        return;
      }
      var allowCpa = aov / (troas / 100);                       // 허용 CPA
      var allowCpc = (cvr2 != null) ? allowCpa * (cvr2 / 100) : null; // 허용 CPC

      var html2 = '<div class="result-grid">'
        + '<div class="metric primary"><div class="m-label">허용 CPA</div>'
        + '<div class="m-value">' + fmtInt(allowCpa) + '<span class="unit">원</span></div>'
        + '<div class="formula">객단가 ÷ (목표ROAS÷100)</div></div>'
        + '<div class="metric"><div class="m-label">허용 CPC</div>'
        + '<div class="m-value">' + (allowCpc != null ? fmtInt(allowCpc) + '<span class="unit">원</span>' : '–') + '</div>'
        + '<div class="formula">허용CPA × (CVR÷100)</div></div>'
        + '</div>';

      var note2 = '객단가 <b>' + fmtWon(aov) + '</b>에서 ROAS <b>' + fmtPct(troas, 0) + '</b>를 달성하려면 전환 1건당 비용(CPA)을 <b>' + fmtWon(allowCpa) + '</b> 이하로 유지해야 합니다.';
      if (allowCpc != null) note2 += ' 예상 CVR ' + fmtPct(cvr2) + ' 기준 클릭당 비용(CPC)은 <b>' + fmtWon(allowCpc) + '</b> 이하가 목표예요.';
      html2 += '<div class="callout ok"><span class="c-ico">🎯</span><div>' + note2 + '</div></div>';
      out.innerHTML = html2;
    }
  }

  function kpiRevSetCase(c) {
    kpiRevCase = (c === 'roas') ? 'roas' : 'cpa';
    kpiQA('#kpi-rev-seg .seg-btn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-case') === kpiRevCase);
    });
    var box1 = kpiQ('#kpi-rev-cpa'); var box2 = kpiQ('#kpi-rev-roas');
    if (box1) box1.style.display = (kpiRevCase === 'cpa') ? '' : 'none';
    if (box2) box2.style.display = (kpiRevCase === 'roas') ? '' : 'none';
    kpiRevRecalc();
  }

  function kpiRevSample() {
    if (kpiRevCase === 'cpa') {
      var m = { 'kpi-r-budget': 5000000, 'kpi-r-tcpa': 25000, 'kpi-r-cvr1': 3, 'kpi-r-cpc1': 500 };
      Object.keys(m).forEach(function (id) { var el = kpiQ('#' + id); if (el) el.value = m[id]; });
    } else {
      var m2 = { 'kpi-r-aov': 70000, 'kpi-r-troas': 400, 'kpi-r-cvr2': 3 };
      Object.keys(m2).forEach(function (id) { var el = kpiQ('#' + id); if (el) el.value = m2[id]; });
    }
    kpiRevRecalc();
  }
  // 🗑 입력 비우기 — 역산 입력 모두 비움(역산 모드는 영속화 상태 없음)
  function kpiRevClear() {
    ['kpi-r-budget', 'kpi-r-tcpa', 'kpi-r-cvr1', 'kpi-r-cpc1', 'kpi-r-aov', 'kpi-r-troas', 'kpi-r-cvr2'].forEach(function (id) {
      var el = kpiQ('#' + id); if (el) el.value = '';
    });
    kpiRevRecalc();
  }

  function kpiBindReverse() {
    kpiQA('#kpi-rev-seg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { kpiRevSetCase(b.getAttribute('data-case')); });
    });
    ['kpi-r-budget', 'kpi-r-tcpa', 'kpi-r-cvr1', 'kpi-r-cpc1', 'kpi-r-aov', 'kpi-r-troas', 'kpi-r-cvr2'].forEach(function (id) {
      var el = kpiQ('#' + id);
      if (el) el.addEventListener('input', kpiRevRecalc);
    });
    var sb = kpiQ('#kpi-rev-sample'); if (sb) sb.addEventListener('click', kpiRevSample);
    var cb = kpiQ('#kpi-rev-clear'); if (cb) cb.addEventListener('click', kpiRevClear);
    kpiRevSetCase(kpiRevCase);
  }

  // ============================================================
  // 모드 전환 + 본문 렌더
  // ============================================================
  function kpiRenderBody() {
    var body = kpiQ('#kpi-body');
    if (!body) return;
    if (kpiMode === 'calc') {
      body.innerHTML = '<div class="tool-grid wide-right">'
        + kpiCalcInputsHtml() + kpiCalcResultsHtml() + '</div>';
      kpiBindCalc();
    } else {
      body.innerHTML = '<div class="tool-grid wide-right">'
        + kpiReverseInputsHtml() + kpiReverseResultsHtml() + '</div>';
      kpiBindReverse();
    }
  }

  function kpiSetMode(m) {
    kpiMode = (m === 'reverse') ? 'reverse' : 'calc';
    kpiQA('#kpi-mode-seg .seg-btn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-mode') === kpiMode);
    });
    kpiRenderBody();
  }

  // ── 진입점 ──────────────────────────────────────────────
  function renderKpiTool() {
    var root = kpiRoot();
    if (!root) return;
    // 재호출 안전: 매번 새로 그림(상태 kpiMode/kpiRevCase는 모듈 스코프 유지)
    root.innerHTML = ''
      + '<div class="tool-wrap">'
      + '  <div class="tool-hero">'
      + '    <div class="eyebrow">🧰 실무 도구</div>'
      + '    <h1>KPI 계산기</h1>'
      + '    <p>노출·클릭·광고비·전환·매출만 넣으면 CTR·CPC·CPM·CVR·CPA·ROAS·객단가·빈도를 한 번에. '
      + '    목표 CPA/ROAS로 필요한 전환·클릭을 거꾸로 역산할 수도 있어요.</p>'
      + '    <div class="seg" id="kpi-mode-seg" role="tablist" style="margin-top:4px">'
      + '      <button class="seg-btn on" data-mode="calc">📊 지표 계산</button>'
      + '      <button class="seg-btn" data-mode="reverse">🎯 목표 역산</button>'
      + '    </div>'
      + '  </div>'
      + '  <div id="kpi-body"></div>'
      + '</div>';

    kpiQA('#kpi-mode-seg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { kpiSetMode(b.getAttribute('data-mode')); });
    });

    // 초기 상태로 본문 렌더
    kpiSetMode(kpiMode);
  }

  // 진입점만 전역 노출
  window.renderKpiTool = renderKpiTool;
})();
