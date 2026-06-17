// ============================================================
// abtest.js — A/B 유의성 검정 (도구 모듈)
// 진입점: window.renderAbTestTool()  →  컨테이너 #page-tool-abtest
// 두 그룹 전환율 차이의 통계적 유의성을 양측 z-검정으로 판정.
// 표준정규 CDF Φ(x)=0.5(1+erf(x/√2))를 순수 JS erf 근사로 구현(외부 의존 없음).
// 통합 계약: ES모듈 금지(평범한 스크립트), IIFE 캡슐화, 전역 함수 1개만 노출,
//            전역 헬퍼(fmtInt/fmtPct/saveToolState 등) 사용, file://·서브경로 동작,
//            외부 의존/CDN/네트워크/현재시각 API 금지, 무효값은 "–".
// 전역 식별자는 모두 ab* 접두사 + IIFE 캡슐화. 진입점만 window 노출.
// ============================================================
(function () {
  'use strict';

  var CONTAINER_ID = 'page-tool-abtest';
  var STATE_KEY = 'abtest';

  // 신뢰수준 (0.95 | 0.90) — 기본 95%
  var abConf = 0.95;

  // 결과 복사용 plain text 요약 (계산 시 갱신, 무효 입력 시 null)
  var abLastSummary = null;

  // ── 컨테이너 헬퍼 ──
  function abRoot() { return document.getElementById(CONTAINER_ID); }
  function abQ(sel) { var r = abRoot(); return r ? r.querySelector(sel) : null; }
  function abQA(sel) { var r = abRoot(); return r ? r.querySelectorAll(sel) : []; }

  // ── 안전 정수 파서: 빈칸/문자/콤마 방어 → 유효한 0 이상 정수 아니면 null ──
  function abInt(raw) {
    if (raw == null) return null;
    var s = String(raw).trim().replace(/,/g, '');
    if (s === '') return null;
    var n = parseFloat(s);
    if (!isFinite(n) || n < 0) return null;
    return Math.floor(n);
  }

  // ── 표준정규 누적분포 Φ(x) — erf 근사(Abramowitz & Stegun 7.1.26) ──
  function abErf(x) {
    // erf는 기함수: erf(-x) = -erf(x)
    var sign = x < 0 ? -1 : 1;
    var ax = Math.abs(x);
    var t = 1 / (1 + 0.3275911 * ax);
    var y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
    return sign * y;
  }
  function abPhi(x) {
    return 0.5 * (1 + abErf(x / Math.SQRT2));
  }

  // ── 상태 영속화 (localStorage) ──
  function abSaveState() {
    try {
      if (typeof saveToolState !== 'function') return;
      saveToolState(STATE_KEY, {
        conf: abConf,
        nA: abFieldVal('ab-nA'), cA: abFieldVal('ab-cA'),
        nB: abFieldVal('ab-nB'), cB: abFieldVal('ab-cB')
      });
    } catch (e) {}
  }
  function abLoadState() {
    try {
      if (typeof loadToolState !== 'function') return;
      var saved = loadToolState(STATE_KEY);
      if (!saved || typeof saved !== 'object') return;
      if (saved.conf === 0.9 || saved.conf === 0.95) abConf = saved.conf;
      ['nA', 'cA', 'nB', 'cB'].forEach(function (k) {
        var el = abQ('#ab-' + k);
        if (el && typeof saved[k] === 'string') el.value = saved[k];
      });
    } catch (e) {}
  }
  function abFieldVal(id) {
    var el = abQ('#' + id);
    return el ? String(el.value) : '';
  }

  // ── 입력 필드 1개 마크업 (정수 입력) ──
  function abField(id, label, unit, hint) {
    var affix = unit
      ? '<div class="input-affix"><input type="text" inputmode="numeric" class="input" id="' + id + '" placeholder="0"><span class="affix">' + unit + '</span></div>'
      : '<input type="text" inputmode="numeric" class="input" id="' + id + '" placeholder="0">';
    return '<div class="field">'
      + '<label>' + label + ' <span class="req">필수</span></label>'
      + affix
      + (hint ? '<div class="field-hint">' + hint + '</div>' : '')
      + '</div>';
  }

  // ── 한 그룹 입력 패널 ──
  function abGroupPanel(letter, ico, nId, cId) {
    return '<div class="panel panel-sticky">'
      + '<div class="panel-head"><span class="ico">' + ico + '</span><div>'
      + '<div class="panel-title">' + letter + ' 그룹</div>'
      + '<div class="panel-sub">표본수(분모)와 전환수(분자)를 입력하세요.</div>'
      + '</div></div>'
      + abField(nId, '표본수', '명', '광고/페이지에 노출된 사용자 수')
      + abField(cId, '전환수', '건', '구매·가입 등 목표 행동을 한 수')
      + '</div>';
  }

  // ── 결과 지표 타일 마크업 ──
  function abMetric(id, label, cls) {
    return '<div class="metric ' + (cls || '') + '" id="' + id + '">'
      + '<div class="m-label">' + label + '</div>'
      + '<div class="m-value">–</div>'
      + '<div class="formula"></div>'
      + '</div>';
  }

  // 타일 값/공식/상태 세팅. valHtml==null 이면 "–"
  function abSet(id, valHtml, formula, stateCls) {
    var el = abQ('#' + id);
    if (!el) return;
    var v = el.querySelector('.m-value');
    var f = el.querySelector('.formula');
    if (v) v.innerHTML = (valHtml == null ? '–' : valHtml);
    if (f && formula != null) f.textContent = formula;
    el.classList.remove('good', 'bad');
    if (stateCls) el.classList.add(stateCls);
  }

  // 값 + 단위 조합 HTML
  function abVU(valStr, unit) {
    if (valStr == null) return null;
    return valStr + (unit ? '<span class="unit">' + unit + '</span>' : '');
  }

  // ── 결과 패널 마크업 ──
  function abResultsHtml() {
    return '<div class="panel">'
      + '<div class="panel-head"><span class="ico">🧮</span><div>'
      + '<div class="panel-title">검정 결과</div>'
      + '<div class="panel-sub">입력 즉시 양측 z-검정으로 계산됩니다.</div>'
      + '</div></div>'
      // 결과 본문 (입력 전엔 빈 상태)
      + '<div id="ab-result">'
      // 판정 영역(콜아웃)
      + '<div id="ab-verdict"></div>'
      // 지표 타일
      + '<div class="result-grid c3">'
      + abMetric('ab-m-pA', '전환율 A')
      + abMetric('ab-m-pB', '전환율 B')
      + abMetric('ab-m-uplift', '상대 상승률 <span style="color:var(--text-muted);font-weight:600">Uplift</span>')
      + abMetric('ab-m-z', 'z값 <span style="color:var(--text-muted);font-weight:600">검정통계량</span>')
      + abMetric('ab-m-p', 'p-value <span style="color:var(--text-muted);font-weight:600">양측</span>')
      + abMetric('ab-m-verdict', '판정', 'primary')
      + '</div>'
      // 결과 복사
      + '<div class="btn-row"><button type="button" class="btn btn-ghost btn-sm copy-btn" id="ab-copy">📋 결과 복사</button></div>'
      + '</div>'
      // 도구 연계
      + '<div class="callout info"><span class="c-ico">ℹ️</span><div>'
      + '전환율(비율) 비교용 양측 z-검정입니다. A/B 테스트 기획·설계는 커리큘럼 <b>Day 21~25</b>에서 배워요.'
      + '<div class="btn-row" style="margin-top:10px">'
      + '<button type="button" class="btn btn-ghost btn-sm" data-page="tool-kpi">📊 KPI 계산기</button>'
      + '<button type="button" class="btn btn-ghost btn-sm" data-page="glossary">📖 용어 사전</button>'
      + '<button type="button" class="btn btn-ghost btn-sm" data-page="week5">🧪 5주차 A/B</button>'
      + '<button type="button" class="btn btn-ghost btn-sm" data-page="tool-report">📝 주간 리포트</button>'
      + '</div></div></div>'
      + '</div>';
  }

  // ── 핵심 재계산 ──
  function abRecalc() {
    var nA = abInt(abFieldVal('ab-nA'));
    var cA = abInt(abFieldVal('ab-cA'));
    var nB = abInt(abFieldVal('ab-nB'));
    var cB = abInt(abFieldVal('ab-cB'));

    abSaveState();

    var verdict = abQ('#ab-verdict');

    // ── 입력 검증: 표본>0, 전환<=표본 필요 ──
    var validA = (nA != null && nA > 0 && cA != null && cA <= nA);
    var validB = (nB != null && nB > 0 && cB != null && cB <= nB);

    // 전환수가 표본수 초과 시 안내
    var overflow = (nA != null && cA != null && cA > nA) || (nB != null && cB != null && cB > nB);

    if (!validA || !validB) {
      abSet('ab-m-pA', validA ? abVU(fmtPct(cA / nA * 100), null) : null, '전환수 A ÷ 표본수 A × 100');
      abSet('ab-m-pB', validB ? abVU(fmtPct(cB / nB * 100), null) : null, '전환수 B ÷ 표본수 B × 100');
      abSet('ab-m-uplift', null, '(전환율B − 전환율A) ÷ 전환율A × 100');
      abSet('ab-m-z', null, '(p_B − p_A) ÷ 표준오차(SE)');
      abSet('ab-m-p', null, '2 × (1 − Φ(|z|))');
      abSet('ab-m-verdict', null, '');
      abLastSummary = null;
      if (verdict) {
        if (overflow) {
          verdict.innerHTML = '<div class="callout danger"><span class="c-ico">⛔</span><div>'
            + '전환수가 표본수보다 클 수 없습니다. 분자(전환수) ≤ 분모(표본수)로 입력하세요.</div></div>';
        } else {
          verdict.innerHTML = '<div class="empty-state">'
            + '<div class="e-ico">🧪</div>'
            + '<div class="e-txt">A·B 그룹의 <b>표본수</b>와 <b>전환수</b>를<br>모두 입력하면 유의성을 판정합니다.</div>'
            + '</div>';
        }
      }
      return;
    }

    // ── 전환율 ──
    var pA = cA / nA;
    var pB = cB / nB;
    abSet('ab-m-pA', abVU(fmtPct(pA * 100), null), '전환수 A ÷ 표본수 A × 100');
    abSet('ab-m-pB', abVU(fmtPct(pB * 100), null), '전환수 B ÷ 표본수 B × 100');

    // ── 상대 상승률 (uplift) — pA>0 필요. 색상은 유의할 때만 부여(아래에서 처리) ──
    var uplift = null;
    var upStr = null;
    if (pA > 0) {
      uplift = (pB - pA) / pA * 100;
      upStr = (uplift >= 0 ? '+' : '') + fmtPct(uplift);
    }

    // ── 합동 비율 / 표준오차 / z ──
    var pPool = (cA + cB) / (nA + nB);
    var seVar = pPool * (1 - pPool) * (1 / nA + 1 / nB);
    var z = null, pval = null;
    if (seVar > 0) {
      var se = Math.sqrt(seVar);
      z = (pB - pA) / se;
      pval = 2 * (1 - abPhi(Math.abs(z)));
      if (pval < 0) pval = 0;       // 수치오차 방어
      if (pval > 1) pval = 1;
    }

    // 분산=0(seVar<=0): 두 전환율이 같거나 모두 0%/100% → z/p 계산 불가
    var computable = (seVar > 0 && z != null && isFinite(z) && pval != null && isFinite(pval));

    if (computable) {
      abSet('ab-m-z', abVU(z.toFixed(2), null), '(p_B − p_A) ÷ 표준오차(SE)');
      var pStr = pval < 0.001 ? '<0.001' : pval.toFixed(4);
      abSet('ab-m-p', abVU(pStr, null), '2 × (1 − Φ(|z|))');
    } else {
      abSet('ab-m-z', null, '(p_B − p_A) ÷ 표준오차(SE)');
      abSet('ab-m-p', null, '2 × (1 − Φ(|z|))');
    }

    // ── 판정 ──
    var alpha = 1 - abConf;          // 0.05 또는 0.10
    var lowSample = (cA < 30 || cB < 30);  // 그룹 전환수<30 → 신뢰도 낮음
    var significant = (computable && pval < alpha);

    // 승자 결정
    var winner = null;
    if (pB > pA) winner = 'B';
    else if (pA > pB) winner = 'A';

    // 상대 상승률 타일: 유의할 때만 good/bad, 비유의면 중립
    if (upStr != null) {
      var upCls = significant ? (uplift >= 0 ? 'good' : 'bad') : null;
      abSet('ab-m-uplift', abVU(upStr, null), '(전환율B − 전환율A) ÷ 전환율A × 100', upCls);
    } else {
      abSet('ab-m-uplift', null, '(전환율B − 전환율A) ÷ 전환율A × 100');
    }

    // 판정 타일 (인라인 폰트크기 제거 → .unit 클래스 사용)
    if (!computable) {
      abSet('ab-m-verdict', '계산 불가', '');
    } else if (significant) {
      var wTxt = winner ? winner + ' 그룹 우세' : '차이 유의';
      abSet('ab-m-verdict', '유의함<br><span class="unit">' + wTxt + '</span>', '', 'good');
    } else {
      abSet('ab-m-verdict', '유의하지<br>않음', '', 'bad');
    }

    // 판정 콜아웃 + 복사 텍스트 구성
    var confPct = fmtPct(abConf * 100, 0);
    var verdictLine, html = '';

    if (!computable) {
      verdictLine = '판정 불가 — 두 그룹 전환율이 같거나 극단(0/100%)이라 통계 차이를 계산할 수 없습니다.';
      html += '<div class="callout warn"><span class="c-ico">⚠️</span><div>'
        + '두 그룹 전환율이 같거나 극단(0/100%)이라 통계 차이를 계산할 수 없습니다 — 표본/전환을 더 모으세요.'
        + '</div></div>';
    } else if (significant) {
      var winTxt = winner
        ? '<b>' + winner + ' 그룹</b>의 전환율이 더 높고, 그 차이는 '
        : '두 그룹의 전환율 차이는 ';
      verdictLine = (winner ? winner + ' 그룹 우세 — ' : '') + '통계적으로 유의함 (' + confPct + ' 신뢰수준)';
      html += '<div class="callout ok"><span class="c-ico">✅</span><div>'
        + '<b>통계적으로 유의</b>합니다 (' + confPct + ' 신뢰수준, p ' + (pval < 0.001 ? '< 0.001' : '= ' + pval.toFixed(4)) + ' &lt; ' + alpha.toFixed(2) + '). '
        + winTxt + '우연으로 보기 어렵습니다.'
        + (winner ? ' → <b>' + winner + '안 채택</b>을 검토하세요.' : '')
        + '</div></div>';
    } else {
      verdictLine = '유의하지 않음 (' + confPct + ' 신뢰수준)';
      html += '<div class="callout warn"><span class="c-ico">⚠️</span><div>'
        + '<b>유의하지 않습니다</b> (' + confPct + ' 신뢰수준, p ' + (pval < 0.001 ? '< 0.001' : '= ' + pval.toFixed(4)) + ' ≥ ' + alpha.toFixed(2) + '). '
        + '관측된 차이가 우연일 가능성을 배제할 수 없어, 아직 승자를 단정할 수 없습니다. 표본을 더 모으세요.'
        + '</div></div>';
    }

    // 표본 과소 경고 (전환수<30)
    if (lowSample) {
      html += '<div class="callout warn"><span class="c-ico">📉</span><div>'
        + '한쪽 이상 그룹의 <b>전환수가 30건 미만</b>이라 z-검정 정규근사의 신뢰도가 낮습니다. '
        + '판정을 참고용으로만 보고, 전환을 더 누적한 뒤 재검정하세요.'
        + '</div></div>';
    }

    if (verdict) verdict.innerHTML = html;

    // ── 복사용 plain text 요약 저장 ──
    var lines = [];
    lines.push('[A/B 유의성 검정]');
    lines.push('전환율 A: ' + fmtPct(pA * 100) + '% (' + fmtInt(cA) + '/' + fmtInt(nA) + ')');
    lines.push('전환율 B: ' + fmtPct(pB * 100) + '% (' + fmtInt(cB) + '/' + fmtInt(nB) + ')');
    lines.push('상대 상승률(uplift): ' + (upStr != null ? upStr + '%' : '–'));
    lines.push('z값: ' + (computable ? z.toFixed(2) : '–') + ' / p-value(양측): ' + (computable ? (pval < 0.001 ? '<0.001' : pval.toFixed(4)) : '–'));
    lines.push('판정(' + confPct + '% 신뢰수준): ' + verdictLine);
    lines.push('공식: z = (p_B − p_A) ÷ SE,  p = 2 × (1 − Φ(|z|))');
    if (lowSample) lines.push('주의: 한쪽 이상 전환수<30 — 정규근사 신뢰도 낮음, 참고용.');
    abLastSummary = lines.join('\n');
  }

  // ── 예시 / 초기화 ──
  function abFillSample() {
    var map = { 'ab-nA': 5000, 'ab-cA': 100, 'ab-nB': 5000, 'ab-cB': 130 };
    Object.keys(map).forEach(function (id) { var el = abQ('#' + id); if (el) el.value = map[id]; });
    abRecalc();
  }
  function abReset() {
    ['ab-nA', 'ab-cA', 'ab-nB', 'ab-cB'].forEach(function (id) {
      var el = abQ('#' + id); if (el) el.value = '';
    });
    try { if (typeof clearToolState === 'function') clearToolState(STATE_KEY); } catch (e) {}
    abRecalc();
  }

  // ── 신뢰수준 세그 전환 ──
  function abSetConf(c) {
    var v = parseFloat(c);
    abConf = (v === 0.9) ? 0.9 : 0.95;
    abQA('#ab-conf-seg .seg-btn').forEach(function (b) {
      b.classList.toggle('on', parseFloat(b.getAttribute('data-conf')) === abConf);
    });
    abRecalc();
  }

  // ── 이벤트 바인딩 ──
  function abBind() {
    ['ab-nA', 'ab-cA', 'ab-nB', 'ab-cB'].forEach(function (id) {
      var el = abQ('#' + id);
      if (el) el.addEventListener('input', abRecalc);
    });
    abQA('#ab-conf-seg .seg-btn').forEach(function (b) {
      b.addEventListener('click', function () { abSetConf(b.getAttribute('data-conf')); });
    });
    var sb = abQ('#ab-sample'); if (sb) sb.addEventListener('click', abFillSample);
    var rb = abQ('#ab-reset'); if (rb) rb.addEventListener('click', abReset);

    // 결과 복사
    var cp = abQ('#ab-copy');
    if (cp) cp.addEventListener('click', function () {
      if (abLastSummary && typeof copyToClipboard === 'function') copyToClipboard(abLastSummary, cp);
    });

    // 페이지 이동 버튼(위임)
    abQA('[data-page]').forEach(function (b) {
      b.addEventListener('click', function () {
        var page = b.getAttribute('data-page');
        if (page && typeof window.showPage === 'function') window.showPage(page);
      });
    });
  }

  // ── 진입점 ──────────────────────────────────────────────
  function renderAbTestTool() {
    var root = abRoot();
    if (!root) return;

    root.innerHTML = ''
      + '<div class="tool-wrap">'
      + '  <div class="tool-hero">'
      + '    <div class="eyebrow">🧪 실무 도구</div>'
      + '    <h1>A/B 유의성 검정</h1>'
      + '    <p>두 그룹의 전환율 차이가 <b>우연인지, 진짜 차이인지</b> 양측 z-검정으로 판정합니다. '
      + '    표본수·전환수만 넣으면 전환율·상대 상승률·z값·p-value와 함께 통계적 유의성을 즉시 계산해요.</p>'
      + '    <div class="seg" id="ab-conf-seg" role="tablist">'
      + '      <button type="button" class="seg-btn on" data-conf="0.95">95% 신뢰</button>'
      + '      <button type="button" class="seg-btn" data-conf="0.90">90% 신뢰</button>'
      + '    </div>'
      + '    <div class="field-hint">95% = 유의수준 5%(p&lt;0.05) 기준으로 판정합니다.</div>'
      + '  </div>'
      + '  <div class="tool-grid wide-right">'
      + '    <div>'
      + abGroupPanel('A', '🅰️', 'ab-nA', 'ab-cA')
      + '<div style="height:14px"></div>'
      + abGroupPanel('B', '🅱️', 'ab-nB', 'ab-cB')
      + '      <div class="btn-row">'
      + '        <button type="button" class="btn btn-ghost btn-sm" id="ab-sample">✨ 예시 채우기</button>'
      + '        <button type="button" class="btn btn-ghost btn-sm" id="ab-reset">🗑 입력 비우기</button>'
      + '      </div>'
      + '    </div>'
      + abResultsHtml()
      + '  </div>'
      + '</div>';

    // 저장된 입력/신뢰수준 복원
    abLoadState();
    // 세그 표시를 복원된 신뢰수준에 맞춤
    abQA('#ab-conf-seg .seg-btn').forEach(function (b) {
      b.classList.toggle('on', parseFloat(b.getAttribute('data-conf')) === abConf);
    });

    abBind();
    abRecalc();
  }

  // 진입점만 전역 노출
  window.renderAbTestTool = renderAbTestTool;
})();
