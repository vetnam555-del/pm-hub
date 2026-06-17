// ============================================================
// pacing.js — 주간/월간 예산 페이싱 계산기
// 진입점: window.renderPacingTool()  (컨테이너 id="page-tool-pacing")
// 통합 계약: ES모듈 금지 / IIFE 캡슐화 / 외부 의존·CDN·네트워크·현재시각 API 금지
// app.js 헬퍼 사용: fmtInt, fmtWon, fmtWonShort, fmtPct, saveToolState, loadToolState, clearToolState, copyToClipboard, showPage
// 전역 식별자는 모두 pacing* 접두사. 진입점만 window 노출.
// ============================================================
(function () {
  'use strict';

  var PACING_CID = 'page-tool-pacing';

  // 입력 필드 id 목록(저장/복원/이벤트 공통 사용)
  var PACING_IDS = ['pacingBudget', 'pacingTotalDays', 'pacingElapsed', 'pacingSpent'];

  // ── localStorage 영속화 ──
  function pacingSave(obj) {
    try { if (typeof saveToolState === 'function') saveToolState('pacing', obj); } catch (e) {}
  }
  function pacingLoad() {
    try {
      if (typeof loadToolState !== 'function') return null;
      return loadToolState('pacing');
    } catch (e) { return null; }
  }
  // 현재 화면 입력값을 읽어 저장
  function pacingPersist(root) {
    if (!root) return;
    var data = {};
    PACING_IDS.forEach(function (id) {
      var el = root.querySelector('#' + id);
      if (el) data[id] = el.value;
    });
    pacingSave(data);
  }

  // ── 안전 숫자 파서(콤마 허용, 숫자 아니면 null) ──
  function pacingNum(v) {
    if (v == null) return null;
    var s = String(v).trim().replace(/,/g, '');
    if (s === '') return null;
    var n = Number(s);
    if (isNaN(n) || !isFinite(n)) return null;
    return n;
  }
  // 0 초과 양수만(분모용)
  function pacingPos(v) {
    var n = pacingNum(v);
    if (n == null || n <= 0) return null;
    return n;
  }
  // 0 이상(0 허용) — 경과일·소진액 등
  function pacingNonNeg(v) {
    var n = pacingNum(v);
    if (n == null || n < 0) return null;
    return n;
  }
  // 정수/소수 표시(불필요한 0 제거), 무효값 "–"
  function pacingTrim(n) {
    if (n == null || isNaN(n) || !isFinite(n)) return '–';
    var r = Math.round(n * 100) / 100;
    return String(r);
  }

  // ============================================================
  // 진입점
  // ============================================================
  window.renderPacingTool = function () {
    var root = document.getElementById(PACING_CID);
    if (!root) return;

    root.innerHTML =
      '<div class="tool-wrap">' +
        '<div class="tool-hero">' +
          '<div class="eyebrow">🧰 실무 도구</div>' +
          '<h1>예산 페이싱 계산기</h1>' +
          '<p>예산이 너무 빨리(과속) 또는 너무 느리게(과소) 소진되고 있는지 점검합니다. ' +
          '기간 중간 시점에 "지금쯤 얼마를 썼어야 정상인지"와 비교해 페이스를 진단하고, 남은 기간 권장 일소진과 기간말 예상 소진액을 알려줍니다.</p>' +
        '</div>' +

        '<div class="tool-grid wide-right">' +
          // 입력 패널
          '<div class="panel">' +
            '<div class="panel-head"><span class="ico">⏱️</span><div>' +
              '<div class="panel-title">페이싱 입력</div>' +
              '<div class="panel-sub">아는 값을 넣으면 즉시 진단됩니다.</div>' +
            '</div></div>' +

            '<div class="field">' +
              '<label>총 예산<span class="req">필수</span></label>' +
              '<div class="input-affix"><input type="text" inputmode="numeric" id="pacingBudget" placeholder="예: 3000000"><span class="affix">원</span></div>' +
              '<div class="field-hint">이번 기간(주간·월간)에 집행할 전체 예산</div>' +
            '</div>' +

            '<div class="field-row">' +
              '<div class="field">' +
                '<label>전체 기간<span class="req">필수</span></label>' +
                '<div class="input-affix"><input type="text" inputmode="numeric" id="pacingTotalDays" placeholder="예: 30"><span class="affix">일</span></div>' +
              '</div>' +
              '<div class="field">' +
                '<label>경과 일수<span class="req">필수</span></label>' +
                '<div class="input-affix"><input type="text" inputmode="numeric" id="pacingElapsed" placeholder="예: 10"><span class="affix">일</span></div>' +
              '</div>' +
            '</div>' +
            '<div class="field-hint" style="margin-top:-6px;">전체 기간(예: 30일) 중 오늘까지 지난 일수(예: 10일)</div>' +

            '<div class="field" style="margin-top:14px;">' +
              '<label>현재까지 소진액<span class="req">필수</span></label>' +
              '<div class="input-affix"><input type="text" inputmode="numeric" id="pacingSpent" placeholder="예: 1200000"><span class="affix">원</span></div>' +
              '<div class="field-hint">경과 일수 동안 실제로 집행(소진)한 광고비 누계</div>' +
            '</div>' +

            '<div class="btn-row">' +
              '<button class="btn btn-ghost btn-sm" id="pacingSample">✨ 예시 채우기</button>' +
              '<button class="btn btn-ghost btn-sm" id="pacingClear">🗑 입력 비우기</button>' +
            '</div>' +
          '</div>' +

          // 결과 패널
          '<div class="panel panel-sticky">' +
            '<div class="panel-head"><span class="ico">📈</span><div>' +
              '<div class="panel-title">페이싱 진단</div>' +
              '<div class="panel-sub">이상 소진선 대비 현재 페이스</div>' +
            '</div></div>' +
            '<div id="pacingResult"></div>' +
          '</div>' +
        '</div>' +

        // 하단 연계 버튼
        '<div class="btn-row" style="margin-top:18px;">' +
          '<button class="btn btn-ghost" id="pacingGoKpi">📊 KPI 계산기</button>' +
          '<button class="btn btn-ghost" id="pacingGoBudget">💰 손익분기·예산</button>' +
          '<button class="btn btn-ghost" id="pacingGoReport">📝 주간 리포트</button>' +
          '<button class="btn btn-ghost" id="pacingGoGlossary">📖 용어 사전</button>' +
        '</div>' +
      '</div>';

    // 저장된 입력 복원
    var saved = pacingLoad();
    if (saved) {
      PACING_IDS.forEach(function (id) {
        if (saved[id] != null && saved[id] !== '') {
          var el = root.querySelector('#' + id);
          if (el) el.value = saved[id];
        }
      });
    }

    // 입력 변경 시 즉시 재계산 + 저장
    PACING_IDS.forEach(function (id) {
      var el = root.querySelector('#' + id);
      if (el) el.addEventListener('input', function () { pacingCalc(root); pacingPersist(root); });
    });

    // 예시 채우기 (예산 3000000 · 기간 30 · 경과 10 · 소진 1200000)
    var sampleBtn = root.querySelector('#pacingSample');
    if (sampleBtn) sampleBtn.addEventListener('click', function () {
      pacingSetVal(root, 'pacingBudget', '3000000');
      pacingSetVal(root, 'pacingTotalDays', '30');
      pacingSetVal(root, 'pacingElapsed', '10');
      pacingSetVal(root, 'pacingSpent', '1200000');
      pacingCalc(root);
      pacingPersist(root);
    });

    // 입력 비우기 — 모든 입력 비우고 저장 제거
    var clearBtn = root.querySelector('#pacingClear');
    if (clearBtn) clearBtn.addEventListener('click', function () { pacingClearInputs(root); });

    // 도구 연계 버튼
    var goKpi = root.querySelector('#pacingGoKpi');
    if (goKpi) goKpi.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-kpi');
    });
    var goBudget = root.querySelector('#pacingGoBudget');
    if (goBudget) goBudget.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-budget');
    });
    var goReport = root.querySelector('#pacingGoReport');
    if (goReport) goReport.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-report');
    });
    var goGlossary = root.querySelector('#pacingGoGlossary');
    if (goGlossary) goGlossary.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('glossary');
    });

    pacingCalc(root);
  };

  // 입력값 설정 헬퍼
  function pacingSetVal(root, id, val) {
    var el = root.querySelector('#' + id);
    if (el) el.value = val;
  }

  // 입력 전체 비우기 + 저장 제거
  function pacingClearInputs(root) {
    PACING_IDS.forEach(function (id) {
      var el = root.querySelector('#' + id);
      if (el) el.value = '';
    });
    try { if (typeof clearToolState === 'function') clearToolState('pacing'); } catch (e) {}
    pacingCalc(root);
  }

  // ============================================================
  // 계산 & 렌더
  // ============================================================
  function pacingCalc(root) {
    var out = root.querySelector('#pacingResult');
    if (!out) return;

    var budget = pacingPos(root.querySelector('#pacingBudget').value);        // 총 예산(양수)
    var totalDays = pacingPos(root.querySelector('#pacingTotalDays').value);  // 전체 기간(양수)
    var elapsed = pacingNonNeg(root.querySelector('#pacingElapsed').value);   // 경과 일수(0 이상)
    var spent = pacingNonNeg(root.querySelector('#pacingSpent').value);       // 현재 소진액(0 이상)

    // 핵심 입력이 하나도 없으면 빈 상태
    if (budget == null && totalDays == null && elapsed == null && spent == null) {
      out.innerHTML =
        '<div class="empty-state">' +
          '<div class="e-ico">⏱️</div>' +
          '<div class="e-txt">총 예산·전체 기간·경과 일수·소진액을<br>입력하면 페이스가 진단됩니다.</div>' +
        '</div>';
      return;
    }

    // ── 입력 유효성 방어 ──
    // 경과 일수가 전체 기간을 초과하면 계산 불가(경고)
    if (totalDays != null && elapsed != null && elapsed > totalDays) {
      out.innerHTML =
        '<div class="callout danger"><span class="c-ico">⛔</span><div>' +
        '<b>경과 일수가 전체 기간을 초과합니다.</b> 경과 일수(' + pacingTrim(elapsed) + '일)는 ' +
        '전체 기간(' + pacingTrim(totalDays) + '일) 이하여야 합니다. 입력을 확인하세요.</div></div>';
      return;
    }

    // 필수값 누락 안내(부분 입력 시)
    if (budget == null || totalDays == null || elapsed == null || spent == null) {
      var miss = [];
      if (budget == null) miss.push('총 예산');
      if (totalDays == null) miss.push('전체 기간');
      if (elapsed == null) miss.push('경과 일수');
      if (spent == null) miss.push('현재까지 소진액');
      out.innerHTML =
        '<div class="callout info"><span class="c-ico">💡</span><div>' +
        '아직 입력이 필요합니다 — <b>' + miss.join(', ') + '</b>을(를) 채우면 페이스가 진단됩니다. ' +
        '(전체 기간·경과 일수는 0보다 커야 합니다.)</div></div>';
      return;
    }

    // ── 핵심 계산 ──
    var dailyEven = budget / totalDays;            // 일 균등예산
    var idealSpent = dailyEven * elapsed;          // 이상적 현재소진
    var pace = (idealSpent > 0) ? (spent / idealSpent * 100) : null; // 페이스(%)
    var remainBudget = budget - spent;             // 남은 예산
    var remainDays = totalDays - elapsed;          // 남은 일수
    var recDaily = (remainDays > 0) ? (remainBudget / remainDays) : null; // 권장 일소진(남은기간)
    var projected = (elapsed > 0) ? (spent / elapsed * totalDays) : null; // 예상 기간말 소진
    var projectedDiff = (projected != null) ? (projected - budget) : null; // 예산 대비 초과(+)/미달(-)

    // ── 페이스 판정 ──
    // 110% 초과: 과속 / 90~110%: 정상 / 90% 미만: 과소
    var paceState = null; // 'over' | 'ok' | 'under'
    if (pace != null) {
      if (pace > 110) paceState = 'over';
      else if (pace >= 90) paceState = 'ok';
      else paceState = 'under';
    }

    // 페이스 타일 색상: 과속=bad / 정상=good / 과소=(중립, 콜아웃에서 경고)
    var paceMetricCls = 'primary';
    if (paceState === 'over') paceMetricCls = 'bad';
    else if (paceState === 'ok') paceMetricCls = 'good';

    var paceSub = '–';
    if (paceState === 'over') paceSub = '과속(초과 소진)';
    else if (paceState === 'ok') paceSub = '정상';
    else if (paceState === 'under') paceSub = '과소(미달)';

    // ── 출력: 핵심 타일 ──
    var html = '<div class="result-grid c3">';

    // 페이스(primary 또는 상태색)
    html +=
      '<div class="metric ' + paceMetricCls + '">' +
        '<div class="m-label">🚦 페이스</div>' +
        '<div class="m-value">' + (pace != null ? fmtInt(pace) : '–') +
          (pace != null ? '<span class="unit">%</span>' : '') + '</div>' +
        '<div class="m-sub">' + paceSub + '</div>' +
      '</div>';

    // 일 균등예산
    html +=
      '<div class="metric">' +
        '<div class="m-label">📅 일 균등예산</div>' +
        '<div class="m-value">' + fmtWon(dailyEven) + '</div>' +
        '<div class="m-sub">총 예산 ÷ 전체 기간</div>' +
      '</div>';

    // 권장 일소진(남은 기간)
    var recSub = (recDaily != null)
      ? ('남은 ' + pacingTrim(remainDays) + '일 동안 매일')
      : (remainDays <= 0 ? '기간 종료 — 남은 일수 없음' : '계산 불가');
    html +=
      '<div class="metric">' +
        '<div class="m-label">🎯 권장 일소진</div>' +
        '<div class="m-value">' + (recDaily != null ? fmtWon(recDaily) : '–') + '</div>' +
        '<div class="m-sub">' + recSub + '</div>' +
      '</div>';

    html += '</div>'; // result-grid

    // 예상 기간말 소진 + 예산 대비 초과/미달
    var projClass = '';
    if (projectedDiff != null) projClass = (projectedDiff > 0) ? ' bad' : ' good';
    var projSub;
    if (projected == null) {
      projSub = '경과 일수가 있어야 추정';
    } else if (projectedDiff > 0) {
      projSub = '예산 대비 +' + fmtWonShort(projectedDiff) + '원 초과 예상';
    } else if (projectedDiff < 0) {
      projSub = '예산 대비 ' + fmtWonShort(projectedDiff) + '원 미달 예상';
    } else {
      projSub = '예산과 정확히 일치 예상';
    }
    html +=
      '<div class="result-grid" style="margin-top:12px;">' +
        '<div class="metric' + projClass + '">' +
          '<div class="m-label">🔮 예상 기간말 소진</div>' +
          '<div class="m-value">' + (projected != null ? fmtWon(projected) : '–') + '</div>' +
          '<div class="m-sub">' + projSub + '</div>' +
        '</div>' +
        '<div class="metric">' +
          '<div class="m-label">💰 남은 예산</div>' +
          '<div class="m-value">' + fmtWon(remainBudget) + '</div>' +
          '<div class="m-sub">총 예산 − 현재 소진 · 남은 ' + pacingTrim(remainDays) + '일</div>' +
        '</div>' +
      '</div>';

    // ── 공식 칩 ──
    html +=
      '<div class="formula">페이스 = 현재 소진 ÷ 이상 소진 × 100 = ' +
        fmtInt(spent) + ' ÷ ' + fmtInt(idealSpent) + ' × 100 = ' + (pace != null ? fmtInt(pace) + '%' : '–') + '</div>' +
      '<div class="formula">이상 소진 = (총예산 ÷ 전체기간) × 경과일 = ' +
        fmtInt(dailyEven) + ' × ' + pacingTrim(elapsed) + ' = ' + fmtWon(idealSpent) + '</div>' +
      '<div class="formula">예상 기간말 소진 = (현재소진 ÷ 경과일) × 전체기간' +
        (projected != null ? '  →  (' + fmtInt(spent) + ' ÷ ' + pacingTrim(elapsed) + ') × ' + pacingTrim(totalDays) + ' = ' + fmtWon(projected) : '') + '</div>';

    // ── 소진 시각화: 현재 소진 비율 막대 + 이상선 문구 ──
    var spentPct = (budget > 0) ? (spent / budget * 100) : 0;
    var idealPct = (budget > 0) ? (idealSpent / budget * 100) : 0;
    var spentPctClamp = Math.max(0, Math.min(100, spentPct));
    var barColor = 'var(--primary)';
    if (paceState === 'over') barColor = 'var(--danger)';
    else if (paceState === 'ok') barColor = 'var(--ok)';
    else if (paceState === 'under') barColor = 'var(--warn)';

    html +=
      '<div style="margin-top:18px;">' +
        '<div class="panel-sub" style="margin-bottom:8px;font-weight:700;">예산 소진 현황</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + spentPctClamp.toFixed(2) + '%;background:' + barColor + ';"></div></div>' +
        '<div class="field-hint" style="margin-top:8px;">' +
          '현재 소진 <b style="color:var(--text-primary);">' + fmtPct(spentPct, 1) + '</b> (' + fmtWon(spent) + ')' +
          ' · 이상 소진선(경과 ' + pacingTrim(elapsed) + '/' + pacingTrim(totalDays) + '일) <b style="color:var(--text-primary);">' + fmtPct(idealPct, 1) + '</b>' +
        '</div>' +
      '</div>';

    // ── 페이스 판정 콜아웃 ──
    if (paceState === 'over') {
      html +=
        '<div class="callout warn"><span class="c-ico">⚠️</span><div>' +
        '<b>과속(초과 소진)입니다 — 페이스 ' + fmtInt(pace) + '%.</b> ' +
        '지금쯤 ' + fmtWon(idealSpent) + '를 썼어야 정상인데 실제로는 ' + fmtWon(spent) + '를 소진했습니다. ' +
        '이 속도면 기간말 ' + (projected != null ? fmtWon(projected) : '–') + '까지 소진해 예산을 <b>' +
        (projectedDiff != null && projectedDiff > 0 ? fmtWonShort(projectedDiff) + '원 초과' : '초과') + '</b>할 수 있습니다. ' +
        '남은 ' + pacingTrim(remainDays) + '일은 일 ' + (recDaily != null ? fmtWon(recDaily) : '–') + ' 이하로 줄여 페이스를 늦추세요.</div></div>';
    } else if (paceState === 'ok') {
      html +=
        '<div class="callout ok"><span class="c-ico">✅</span><div>' +
        '<b>정상 페이스입니다 — ' + fmtInt(pace) + '%.</b> ' +
        '이상 소진선 대비 90~110% 구간으로, 예산이 기간에 맞춰 고르게 소진되고 있습니다. ' +
        '남은 ' + pacingTrim(remainDays) + '일은 일 ' + (recDaily != null ? fmtWon(recDaily) : '–') + ' 수준을 유지하면 됩니다.</div></div>';
    } else if (paceState === 'under') {
      html +=
        '<div class="callout warn"><span class="c-ico">⚠️</span><div>' +
        '<b>과소(미달)입니다 — 페이스 ' + fmtInt(pace) + '%.</b> ' +
        '지금쯤 ' + fmtWon(idealSpent) + '를 썼어야 하는데 ' + fmtWon(spent) + '만 소진했습니다. ' +
        '이 속도면 기간말 ' + (projected != null ? fmtWon(projected) : '–') + '에 그쳐 예산을 ' +
        (projectedDiff != null && projectedDiff < 0 ? '<b>' + fmtWonShort(-projectedDiff) + '원 남길</b>' : '남길') + ' 수 있습니다. ' +
        '입찰가·예산 한도·타깃을 넓혀 남은 ' + pacingTrim(remainDays) + '일 동안 일 ' + (recDaily != null ? fmtWon(recDaily) : '–') + '까지 끌어올리세요.</div></div>';
    }

    // ── 면책(추세 기반 추정) ──
    html +=
      '<div class="callout info"><span class="c-ico">ℹ️</span><div>' +
      '예상 기간말 소진은 <b>현재까지의 평균 일소진을 단순 연장한 추세 추정</b>입니다. ' +
      '실제 소진은 요일·캠페인 운영·입찰 경쟁에 따라 달라질 수 있으니 참고용으로 활용하세요.</div></div>';

    // ── 결과 복사 ──
    html +=
      '<div class="btn-row">' +
        '<button class="btn btn-ghost btn-sm copy-btn" id="pacingCopy">📋 결과 복사</button>' +
      '</div>';

    out.innerHTML = html;

    // 결과 복사(핵심 수치 + 판정 + 공식) — plain text
    var copyBtn = out.querySelector('#pacingCopy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var lines = ['[예산 페이싱]'];
      lines.push('페이스: ' + (pace != null ? fmtInt(pace) + '% (' + paceSub + ')' : '–'));
      lines.push('총 예산: ' + fmtWon(budget) + ' · 전체 ' + pacingTrim(totalDays) + '일 중 경과 ' + pacingTrim(elapsed) + '일');
      lines.push('현재 소진: ' + fmtWon(spent) + ' · 이상 소진: ' + fmtWon(idealSpent));
      lines.push('권장 일소진(남은 ' + pacingTrim(remainDays) + '일): ' + (recDaily != null ? fmtWon(recDaily) : '–'));
      lines.push('예상 기간말 소진: ' + (projected != null ? fmtWon(projected) : '–') +
        (projectedDiff != null
          ? (projectedDiff > 0 ? ' (예산 대비 +' + fmtWonShort(projectedDiff) + '원 초과)'
            : projectedDiff < 0 ? ' (예산 대비 ' + fmtWonShort(projectedDiff) + '원 미달)'
            : ' (예산과 일치)')
          : ''));
      lines.push('남은 예산: ' + fmtWon(remainBudget));
      lines.push('공식: 페이스 = 현재 소진 ÷ 이상 소진 × 100 / 예상 기간말 소진 = (현재 소진 ÷ 경과일) × 전체기간');
      if (typeof copyToClipboard === 'function') copyToClipboard(lines.join('\n'), copyBtn);
    });
  }

})();
