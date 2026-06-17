// ============================================================
// budget.js — 손익분기·예산 시뮬레이터
// 진입점: window.renderBudgetTool()  (컨테이너 id="page-tool-budget")
// 통합 계약: ES모듈 금지 / 외부 라이브러리 금지 / 현재시각 API 금지
// app.js 헬퍼 사용: fmtInt, fmtWon, fmtWonShort, fmtPct, copyToClipboard
// ============================================================
(function () {
  'use strict';

  var CID = 'page-tool-budget';

  // 모듈 상태(탭 선택 보존)
  var budgetState = { tab: 'be' }; // 'be'=손익분기, 'sim'=예산 시뮬레이터

  // 렌더 전 budgetPrefill 호출 대비 보류 저장소
  var budgetPending = null;

  // ── localStorage 영속화 헬퍼 ──
  function budgetSave(obj) {
    try { if (typeof saveToolState === 'function') saveToolState('budget', obj); } catch (e) {}
  }
  function budgetLoad() {
    try {
      if (typeof loadToolState !== 'function') return null;
      return loadToolState('budget');
    } catch (e) { return null; }
  }
  // 현재 화면에 있는 입력만 읽어 기존 저장값과 병합 저장
  // (탭 전환으로 한쪽 탭 DOM이 없을 때 반대 탭 저장값이 지워지지 않도록 merge)
  function budgetPersist(root) {
    if (!root) return;
    var data = budgetLoad() || {};
    data.tab = budgetState.tab;
    var ids = ['beAov', 'beMargin', 'beVar', 'beTarget', 'simTotal', 'simDays', 'simAov'];
    ids.forEach(function (id) {
      var el = root.querySelector('#' + id);
      if (el) data[id] = el.value; // DOM에 있을 때만 갱신
    });
    var hasSimRows = root.querySelector('.simRatio');
    if (hasSimRows) {
      var sim = { ratio: [], cpc: [], cvr: [] };
      root.querySelectorAll('.simRatio').forEach(function (el) { sim.ratio[+el.getAttribute('data-i')] = el.value; });
      root.querySelectorAll('.simCpc').forEach(function (el) { sim.cpc[+el.getAttribute('data-i')] = el.value; });
      root.querySelectorAll('.simCvr').forEach(function (el) { sim.cvr[+el.getAttribute('data-i')] = el.value; });
      data.sim = sim;
    }
    budgetSave(data);
  }

  // ── 유틸: 입력값 안전 파싱 (빈값/문자/음수방어) ──
  // 콤마 허용, 숫자 아니면 null 반환
  function budgetNum(v) {
    if (v == null) return null;
    var s = String(v).trim().replace(/,/g, '');
    if (s === '') return null;
    var n = Number(s);
    if (isNaN(n) || !isFinite(n)) return null;
    return n;
  }
  // 0 이하 또는 null 이면 null (분모/비율 등 양수 필요값)
  function budgetPos(v) {
    var n = budgetNum(v);
    if (n == null || n <= 0) return null;
    return n;
  }
  // 0 이상(0 허용) — 기타변동비 등
  function budgetNonNeg(v) {
    var n = budgetNum(v);
    if (n == null || n < 0) return null;
    return n;
  }
  // HTML 이스케이프(혹시 모를 입력 반영 대비)
  function budgetEsc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 퍼널 단계 색상(배분 시각화/범례용)
  var BUDGET_STAGE_COLORS = ['#646CFF', '#63B3ED', '#68D391', '#F6AD55'];

  // 예산 시뮬레이터 기본 단계 정의
  // 매체 벤치마크 정합 예시값(AOV 70,000 기준 단계 ROAS = CVR×AOV÷CPC):
  //  인지 0.2%·CPC300 → 47% / 고려 0.8%·CPC450 → 124% / 전환 2.5%·CPC650 → 269% / 리텐션 3%·CPC450 → 467%
  //  → 종합 ROAS 약 220%대로, 마진 30% 본전(약 333%)보다 낮게 잡아 "본전과 비교" 교훈을 주는 보수적 예시값
  function budgetDefaultStages() {
    return [
      { key: 'awareness', name: '인지',    ratio: 20, cpc: 300, cvr: 0.2 },
      { key: 'consider',  name: '고려',    ratio: 30, cpc: 450, cvr: 0.8 },
      { key: 'convert',   name: '전환',    ratio: 40, cpc: 650, cvr: 2.5 },
      { key: 'retention', name: '리텐션',  ratio: 10, cpc: 450, cvr: 3.0 }
    ];
  }

  // ============================================================
  // 진입점
  // ============================================================
  window.renderBudgetTool = function () {
    var root = document.getElementById(CID);
    if (!root) return;

    // 저장된 탭 복원 (보류 prefill이 있으면 손익분기 우선)
    var saved = budgetLoad();
    if (saved && (saved.tab === 'be' || saved.tab === 'sim')) budgetState.tab = saved.tab;
    if (budgetPending) budgetState.tab = 'be';

    root.innerHTML =
      '<div class="tool-wrap">' +
        '<div class="tool-hero">' +
          '<div class="eyebrow">🧰 실무 도구</div>' +
          '<h1>손익분기·예산 시뮬레이터</h1>' +
          '<p>광고가 "본전"이 되는 ROAS·CPA 기준선을 먼저 잡고, 총 예산을 퍼널 단계별로 배분해 예상 성과를 미리 점검합니다. ' +
          'ROAS 100%는 흑자가 아닙니다 — 마진을 넣고 진짜 손익분기점을 확인하세요.</p>' +
        '</div>' +
        '<div style="margin-bottom:18px;">' +
          '<div class="seg" id="budgetSeg">' +
            '<button class="seg-btn" data-tab="be">📊 손익분기 계산기</button>' +
            '<button class="seg-btn" data-tab="sim">🧮 예산 시뮬레이터</button>' +
          '</div>' +
        '</div>' +
        '<div id="budgetBody"></div>' +
      '</div>';

    // 세그먼트 탭 이벤트
    var seg = root.querySelector('#budgetSeg');
    seg.addEventListener('click', function (e) {
      var btn = e.target.closest('.seg-btn');
      if (!btn) return;
      budgetState.tab = btn.getAttribute('data-tab');
      budgetSyncSeg(root);
      budgetRenderBody(root);
      budgetPersist(root); // 탭 선택 저장
    });

    budgetSyncSeg(root);
    budgetRenderBody(root);
  };

  // ── 도구 연계: 다른 도구가 AOV/마진을 손익분기 탭에 채우고 전환 ──
  // 렌더 전 호출돼도 안전 — pending에 저장 후 render 시 반영
  window.budgetPrefill = function (obj) {
    if (!obj || typeof obj !== 'object') return;
    var root = document.getElementById(CID);
    if (!root || !root.querySelector('#budgetBody')) {
      // 아직 렌더 전 → 보류 저장 후 페이지 전환(전환이 렌더를 트리거)
      budgetPending = obj;
      if (typeof showPage === 'function') showPage('tool-budget');
      return;
    }
    budgetApplyPrefill(root, obj);
  };

  // 손익분기 탭으로 전환 후 입력 채우고 재계산
  function budgetApplyPrefill(root, obj) {
    budgetState.tab = 'be';
    budgetSyncSeg(root);
    budgetRenderBody(root); // 손익분기 탭 DOM 보장
    var body = root.querySelector('#budgetBody');
    if (!body) return;
    var aov = budgetNum(obj.aov);
    if (aov != null) { var ai = body.querySelector('#beAov'); if (ai) ai.value = budgetTrim(aov); }
    var margin = budgetNum(obj.margin);
    if (margin != null) { var mi = body.querySelector('#beMargin'); if (mi) mi.value = budgetTrim(margin); }
    budgetCalcBE(body);
    budgetPersist(root);
  }

  function budgetSyncSeg(root) {
    root.querySelectorAll('#budgetSeg .seg-btn').forEach(function (b) {
      b.classList.toggle('on', b.getAttribute('data-tab') === budgetState.tab);
    });
  }

  function budgetRenderBody(root) {
    if (budgetState.tab === 'sim') budgetRenderSim(root);
    else budgetRenderBE(root);

    // 보류된 prefill 반영(렌더 전 budgetPrefill 호출분)
    if (budgetPending) {
      var p = budgetPending;
      budgetPending = null;
      budgetApplyPrefill(root, p);
    }
  }

  // ============================================================
  // 탭 1 — 손익분기 계산기
  // ============================================================
  function budgetRenderBE(root) {
    var body = root.querySelector('#budgetBody');
    body.innerHTML =
      '<div class="tool-grid wide-right">' +
        // 입력 패널
        '<div class="panel">' +
          '<div class="panel-head"><span class="ico">📊</span><div>' +
            '<div class="panel-title">손익분기 입력</div>' +
            '<div class="panel-sub">마진 기준으로 본전 ROAS·CPA를 계산</div>' +
          '</div></div>' +

          '<div class="field">' +
            '<label>객단가 AOV<span class="req">필수</span></label>' +
            '<div class="input-affix"><input type="text" inputmode="numeric" id="beAov" placeholder="예: 50000"><span class="affix">원</span></div>' +
            '<div class="field-hint">주문 1건당 평균 결제 금액</div>' +
          '</div>' +

          '<div class="field">' +
            '<label>마진율<span class="req">필수</span></label>' +
            '<div class="input-affix"><input type="text" inputmode="decimal" id="beMargin" placeholder="예: 30"><span class="affix">%</span></div>' +
            '<div class="qtags" id="beMarginTags">' +
              '<span class="qtag" data-v="20">20%</span>' +
              '<span class="qtag" data-v="30">30%</span>' +
              '<span class="qtag" data-v="40">40%</span>' +
              '<span class="qtag" data-v="50">50%</span>' +
            '</div>' +
            '<div class="field-hint">매출 대비 공헌이익 비율(광고비 제외). 모르면 평균 마진율을 넣으세요.</div>' +
          '</div>' +

          '<div class="field">' +
            '<label>건당 기타 변동비<span class="opt">선택</span></label>' +
            '<div class="input-affix"><input type="text" inputmode="numeric" id="beVar" placeholder="예: 3000"><span class="affix">원</span></div>' +
            '<div class="field-hint">배송비·결제수수료·포장 등 주문 1건마다 추가로 드는 비용</div>' +
          '</div>' +

          '<div class="field">' +
            '<label>목표 ROAS<span class="opt">선택</span></label>' +
            '<div class="input-affix"><input type="text" inputmode="decimal" id="beTarget" placeholder="예: 500"><span class="affix">%</span></div>' +
            '<div class="field-hint">입력 시 목표 CPA와 건당 예상 이익을 함께 계산합니다.</div>' +
          '</div>' +

          '<div class="btn-row">' +
            '<button class="btn btn-ghost btn-sm" id="beFill">✨ 예시 채우기</button>' +
            '<button class="btn btn-ghost btn-sm" id="beClear">🗑 입력 비우기</button>' +
          '</div>' +
        '</div>' +

        // 결과 패널
        '<div class="panel panel-sticky">' +
          '<div class="panel-head"><span class="ico">🎯</span><div>' +
            '<div class="panel-title">손익분기 결과</div>' +
            '<div class="panel-sub">이 선을 넘겨야 흑자입니다</div>' +
          '</div></div>' +
          '<div id="beResult"></div>' +
        '</div>' +
      '</div>';

    // 저장된 입력 복원
    var saved = budgetLoad();
    if (saved) {
      ['beAov', 'beMargin', 'beVar', 'beTarget'].forEach(function (id) {
        if (saved[id] != null) { var el = body.querySelector('#' + id); if (el) el.value = saved[id]; }
      });
    }

    // 마진율 빠른 태그
    var marginInput = body.querySelector('#beMargin');
    body.querySelectorAll('#beMarginTags .qtag').forEach(function (tag) {
      tag.addEventListener('click', function () {
        marginInput.value = tag.getAttribute('data-v');
        budgetCalcBE(body);
        budgetPersist(root);
      });
    });

    // 입력 변경 시 즉시 계산 + 저장
    ['beAov', 'beMargin', 'beVar', 'beTarget'].forEach(function (id) {
      var el = body.querySelector('#' + id);
      el.addEventListener('input', function () { budgetCalcBE(body); budgetPersist(root); });
    });

    // 예시 채우기 — AOV 50000·마진 30%·기타비 0·목표ROAS 400
    var fillBtn = body.querySelector('#beFill');
    if (fillBtn) fillBtn.addEventListener('click', function () {
      var ex = { beAov: '50,000', beMargin: '30', beVar: '0', beTarget: '400' };
      Object.keys(ex).forEach(function (id) {
        var el = body.querySelector('#' + id); if (el) el.value = ex[id];
      });
      budgetCalcBE(body);
      budgetPersist(root);
    });

    // 입력 비우기 — 손익분기 탭 입력만 초기화 + 저장 키 정리(시뮬레이터 입력은 저장 유지)
    var clearBtn = body.querySelector('#beClear');
    if (clearBtn) clearBtn.addEventListener('click', function () {
      ['beAov', 'beMargin', 'beVar', 'beTarget'].forEach(function (id) {
        var el = body.querySelector('#' + id); if (el) el.value = '';
      });
      var cur = budgetLoad() || {};
      ['beAov', 'beMargin', 'beVar', 'beTarget'].forEach(function (id) { delete cur[id]; });
      budgetSave(cur);
      budgetCalcBE(body);
    });

    budgetCalcBE(body);
  }

  function budgetCalcBE(body) {
    var out = body.querySelector('#beResult');

    var aov = budgetPos(body.querySelector('#beAov').value);       // 객단가 (양수)
    var margin = budgetNum(body.querySelector('#beMargin').value); // 마진율 (%)
    var other = budgetNonNeg(body.querySelector('#beVar').value);  // 기타변동비 (0 이상)
    var target = budgetPos(body.querySelector('#beTarget').value); // 목표 ROAS (양수)

    if (other == null) other = 0; // 선택값 → 비우면 0 처리

    // 마진율 유효성: 0초과 100이하만 손익분기 ROAS 계산 가능
    var marginValid = (margin != null && margin > 0 && margin <= 100);

    // 아무 핵심 입력도 없으면 빈 상태
    if (aov == null && !marginValid) {
      out.innerHTML =
        '<div class="empty-state">' +
          '<div class="e-ico">💰</div>' +
          '<div class="e-txt">객단가와 마진율을 입력하면<br>본전 ROAS·CPA가 계산됩니다.</div>' +
        '</div>';
      return;
    }

    // ── 핵심 계산 ──
    // 손익분기 CPA(최대 허용 CPA) = AOV × (마진율/100) − 기타변동비 = 건당 공헌이익
    var beCpa = (aov != null && marginValid) ? (aov * (margin / 100) - other) : null;
    // 건당 공헌이익(마진금액 − 기타변동비) — 손익분기 CPA와 동일, 목표이익 계산의 기준
    var contribution = beCpa;

    // 기타변동비 반영 여부 (양수일 때만 공헌이익 기준 식 사용)
    var hasOther = (other > 0);

    // 손익분기 ROAS(%)
    //  - 기타변동비 0: 100 ÷ (마진율/100)         = 매출 대비 마진만으로 본전
    //  - 기타변동비 >0: AOV ÷ 공헌이익 × 100        = 공헌이익(CPA) 기준 본전
    //                    (분모 = 공헌이익 ≤ 0 이면 달성 불가)
    var beRoas = null;          // % (null이면 미계산)
    var beRoasUnreachable = false; // 공헌이익<=0 으로 손익분기 ROAS 달성 불가
    if (marginValid) {
      if (hasOther) {
        if (aov != null && beCpa != null && beCpa > 0) {
          beRoas = aov / beCpa * 100;
        } else if (aov != null && beCpa != null && beCpa <= 0) {
          beRoasUnreachable = true; // 공헌이익이 0 이하 → 본전 도달 불가
        }
        // aov 없으면 공헌이익 기준 ROAS는 계산 불가(beRoas=null 유지)
      } else {
        beRoas = 100 / (margin / 100); // 기존 방식(= 10000/margin)
      }
    }

    // 목표 ROAS 입력 시
    var targetCpa = (aov != null && target != null) ? (aov / (target / 100)) : null;
    var profitPerOrder = (contribution != null && targetCpa != null)
      ? (contribution - targetCpa) : null;

    // ── 출력: metric 타일 ──
    var beCpaClass = (beCpa != null && beCpa < 0) ? ' bad' : '';
    var html = '<div class="result-grid c3">';

    // 손익분기 ROAS (primary)
    var roasSub = hasOther
      ? 'AOV ÷ 공헌이익 (변동비 반영)'
      : '100 ÷ 마진율';
    if (beRoasUnreachable) roasSub = '공헌이익이 0 이하 — 본전 불가';
    html +=
      '<div class="metric primary">' +
        '<div class="m-label">🎯 손익분기 ROAS</div>' +
        '<div class="m-value">' + (beRoas != null ? fmtInt(beRoas) : (beRoasUnreachable ? '달성 불가' : '–')) +
          (beRoas != null ? '<span class="unit">%</span>' : '') + '</div>' +
        '<div class="m-sub">' + roasSub + '</div>' +
      '</div>';

    // 손익분기 CPA
    html +=
      '<div class="metric' + beCpaClass + '">' +
        '<div class="m-label">💰 손익분기 CPA</div>' +
        '<div class="m-value">' + (beCpa != null ? fmtWon(beCpa) : '–') + '</div>' +
        '<div class="m-sub">' + (beCpa != null && beCpa < 0
          ? '변동비가 마진보다 큼 — 팔수록 손해'
          : '전환 1건당 최대 허용 광고비') + '</div>' +
      '</div>';

    // 건당 공헌이익
    var contribClass = (contribution != null && contribution < 0) ? ' bad' : (contribution != null ? ' good' : '');
    html +=
      '<div class="metric' + contribClass + '">' +
        '<div class="m-label">📦 건당 공헌이익</div>' +
        '<div class="m-value">' + (contribution != null ? fmtWon(contribution) : '–') + '</div>' +
        '<div class="m-sub">광고비 쓰기 전 1건당 남는 돈</div>' +
      '</div>';

    html += '</div>'; // result-grid

    // 공식 칩 — 기타변동비 유무에 따라 손익분기 ROAS 식 표기 분기
    var roasFormula;
    if (hasOther) {
      // 공헌이익 기준
      roasFormula = '손익분기 ROAS = AOV ÷ 공헌이익 × 100';
      if (beRoas != null) {
        roasFormula += '  →  ' + fmtInt(aov) + ' ÷ ' + fmtInt(beCpa) + ' × 100 = ' + fmtInt(beRoas) + '%';
      } else if (beRoasUnreachable) {
        roasFormula += '  →  공헌이익(' + fmtWon(beCpa) + ') ≤ 0 이므로 달성 불가';
      }
    } else {
      roasFormula = '손익분기 ROAS = 1 ÷ (마진율 ÷ 100) × 100';
      if (marginValid && beRoas != null) {
        roasFormula += '  →  100 ÷ ' + budgetTrim(margin) + '% × 100 = ' + fmtInt(beRoas) + '%';
      }
    }
    html +=
      '<div class="formula">' + roasFormula + '</div>' +
      '<div class="formula">손익분기 CPA = AOV × (마진율 ÷ 100) − 기타변동비' +
      (beCpa != null ? '  →  ' + fmtInt(aov) + ' × ' + budgetTrim(margin) + '% − ' + fmtInt(other) + ' = ' + fmtWon(beCpa) : '') +
      '</div>';

    // 목표 ROAS 결과(입력 시)
    if (target != null && aov != null) {
      var profitClass = (profitPerOrder != null && profitPerOrder >= 0) ? ' good' : ' bad';
      html +=
        '<div style="margin-top:18px;border-top:1px solid var(--border);padding-top:16px;">' +
          '<div class="panel-sub" style="margin-bottom:10px;font-weight:700;">🎯 목표 ROAS ' + budgetTrim(target) + '% 기준</div>' +
          '<div class="result-grid">' +
            '<div class="metric">' +
              '<div class="m-label">목표 CPA</div>' +
              '<div class="m-value">' + (targetCpa != null ? fmtWon(targetCpa) : '–') + '</div>' +
              '<div class="m-sub">전환 1건을 이 비용 이하로 따와야 함</div>' +
            '</div>' +
            '<div class="metric' + profitClass + '">' +
              '<div class="m-label">건당 예상 이익</div>' +
              '<div class="m-value">' + (profitPerOrder != null ? fmtWon(profitPerOrder) : '–') + '</div>' +
              '<div class="m-sub">' + (profitPerOrder != null
                ? (profitPerOrder >= 0 ? '목표 달성 시 1건당 흑자' : '목표 달성해도 1건당 적자')
                : '') + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="formula">목표 CPA = AOV ÷ (목표ROAS ÷ 100) = ' + fmtInt(aov) + ' ÷ ' + budgetTrim(target) + '% = ' + (targetCpa != null ? fmtWon(targetCpa) : '–') + '</div>' +
          '<div class="formula">건당 예상 이익 = 공헌이익 − 목표CPA = ' + (contribution != null ? fmtInt(contribution) : '–') + ' − ' + (targetCpa != null ? fmtInt(targetCpa) : '–') + ' = ' + (profitPerOrder != null ? fmtWon(profitPerOrder) : '–') + '</div>' +
        '</div>';

      // 목표 ROAS vs 손익분기 ROAS 비교 콜아웃
      if (beRoas != null) {
        if (target >= beRoas) {
          html +=
            '<div class="callout ok"><span class="c-ico">✅</span><div>' +
            '목표 ROAS <b>' + budgetTrim(target) + '%</b>는 손익분기 <b>' + fmtInt(beRoas) + '%</b>를 넘습니다. 목표를 달성하면 흑자 구간입니다.</div></div>';
        } else {
          html +=
            '<div class="callout danger"><span class="c-ico">⛔</span><div>' +
            '목표 ROAS <b>' + budgetTrim(target) + '%</b>는 손익분기 <b>' + fmtInt(beRoas) + '%</b>보다 낮습니다. ' +
            '이 목표를 달성해도 <b>적자</b>입니다 — 목표를 ' + fmtInt(beRoas) + '% 이상으로 올리세요.</div></div>';
        }
      }
    }

    // 핵심 해설 콜아웃 (동적 수치)
    if (beRoasUnreachable) {
      // 공헌이익이 0 이하 → 광고를 켜기 전부터 적자
      html +=
        '<div class="callout danger"><span class="c-ico">⛔</span><div>' +
        '<b>광고비 0원이어도 적자입니다.</b> 건당 기타 변동비(' + fmtWon(other) + ')가 매출 마진(' + fmtWon(aov * (margin / 100)) + ')보다 커서 ' +
        '공헌이익이 <b>' + fmtWon(beCpa) + '</b>입니다 — 손익분기 ROAS를 달성할 수 없습니다. 객단가·마진율을 올리거나 변동비를 낮추세요.</div></div>';
    } else if (marginValid && beRoas != null) {
      html +=
        '<div class="callout warn"><span class="c-ico">⚠️</span><div>' +
        '<b>ROAS 100%는 흑자가 아닙니다.</b> ' +
        (hasOther
          ? '마진율 ' + budgetTrim(margin) + '%에 건당 변동비 ' + fmtWon(other) + '까지 반영하면 ROAS가 약 <b>' + fmtInt(beRoas) + '%</b>는 넘어야 본전입니다. '
          : '마진율 ' + budgetTrim(margin) + '%라면 ROAS가 약 <b>' + fmtInt(beRoas) + '%</b>는 넘어야 본전입니다. ') +
        '그 아래면 팔수록 손해예요.</div></div>';
    } else if (marginValid && hasOther && aov == null) {
      // 마진율·변동비는 있으나 AOV가 없어 공헌이익 기준 ROAS 미계산
      html +=
        '<div class="callout info"><span class="c-ico">💡</span><div>' +
        '건당 변동비가 있을 때는 <b>객단가(AOV)</b>까지 입력해야 공헌이익 기준 손익분기 ROAS가 계산됩니다.</div></div>';
    } else if (margin != null) {
      // 마진율은 입력했으나 범위 밖(0 이하 또는 100 초과)
      html +=
        '<div class="callout warn"><span class="c-ico">⚠️</span><div>' +
        '마진율은 <b>0 초과 100 이하</b>로 입력하세요. 현재 값으로는 손익분기 ROAS를 계산할 수 없습니다.</div></div>';
    } else {
      html +=
        '<div class="callout info"><span class="c-ico">💡</span><div>' +
        '마진율을 입력하면 본전 ROAS가 계산됩니다. (예: 마진 30% → 약 333%, 마진 50% → 200%)</div></div>';
    }

    // 결과 액션: 복사 + 도구 연계
    html +=
      '<div class="btn-row">' +
        '<button class="btn btn-ghost btn-sm copy-btn" id="beCopy">📋 결과 복사</button>' +
        '<button class="btn btn-ghost btn-sm" id="beGoKpi">📊 KPI 계산기</button>' +
        '<button class="btn btn-ghost btn-sm" id="beGoReport">📝 주간 리포트</button>' +
        '<button class="btn btn-ghost btn-sm" id="beGoGlossary">📖 용어 사전</button>' +
      '</div>';

    out.innerHTML = html;

    // 결과 복사(핵심 수치 + 공식) — plain text
    var copyBtn = out.querySelector('#beCopy');
    if (copyBtn) copyBtn.addEventListener('click', function () {
      var lines = ['[손익분기]'];
      lines.push('객단가(AOV): ' + (aov != null ? fmtInt(aov) + '원' : '–'));
      lines.push('마진율: ' + (marginValid ? budgetTrim(margin) + '%' : '–'));
      lines.push('건당 기타 변동비: ' + fmtInt(other) + '원');
      lines.push('손익분기 ROAS: ' + (beRoas != null ? fmtInt(beRoas) + '%' : (beRoasUnreachable ? '달성 불가(공헌이익 0 이하)' : '–')));
      lines.push('손익분기 CPA: ' + (beCpa != null ? fmtWon(beCpa) : '–'));
      lines.push('건당 공헌이익: ' + (contribution != null ? fmtWon(contribution) : '–'));
      if (target != null && aov != null) {
        lines.push('목표 ROAS ' + budgetTrim(target) + '% → 목표 CPA ' + (targetCpa != null ? fmtWon(targetCpa) : '–') +
          ', 건당 예상 이익 ' + (profitPerOrder != null ? fmtWon(profitPerOrder) : '–') +
          (profitPerOrder != null ? (profitPerOrder >= 0 ? ' (흑자)' : ' (적자)') : ''));
      }
      lines.push('공식: 손익분기 CPA = AOV × (마진율÷100) − 기타변동비 / 손익분기 ROAS = AOV ÷ 공헌이익 × 100');
      if (typeof copyToClipboard === 'function') copyToClipboard(lines.join('\n'), copyBtn);
    });

    // 도구 연계 버튼
    var goKpi = out.querySelector('#beGoKpi');
    if (goKpi) goKpi.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-kpi');
    });
    var goReport = out.querySelector('#beGoReport');
    if (goReport) goReport.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-report');
    });
    var goGlossary = out.querySelector('#beGoGlossary');
    if (goGlossary) goGlossary.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('glossary');
    });
  }

  // 마진율/ROAS 표시용: 정수면 정수, 소수면 최대 2자리(불필요한 0 제거)
  function budgetTrim(n) {
    if (n == null || isNaN(n) || !isFinite(n)) return '–';
    var r = Math.round(n * 100) / 100; // 소수 2자리까지 반올림(불필요한 0은 String 변환 시 제거됨)
    return String(r);
  }

  // ============================================================
  // 탭 2 — 예산 시뮬레이터
  // ============================================================
  function budgetRenderSim(root) {
    var body = root.querySelector('#budgetBody');
    var st = budgetDefaultStages();

    // 저장된 단계 입력 복원(있으면 기본값 대체)
    var saved = budgetLoad();
    var savedSim = (saved && saved.sim) ? saved.sim : null;
    function simVal(arr, i, dflt) {
      if (arr && arr[i] != null && arr[i] !== '') return arr[i];
      return dflt;
    }

    var stageRows = st.map(function (s, i) {
      var rv = savedSim ? simVal(savedSim.ratio, i, s.ratio) : s.ratio;
      var cv = savedSim ? simVal(savedSim.cpc, i, s.cpc) : s.cpc;
      var vv = savedSim ? simVal(savedSim.cvr, i, s.cvr) : s.cvr;
      return '' +
        '<tr>' +
          '<td style="font-weight:700;color:var(--text-primary);">' +
            '<span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:' + BUDGET_STAGE_COLORS[i] + ';margin-right:7px;"></span>' + s.name + '</td>' +
          '<td><input type="text" inputmode="decimal" class="input simRatio" data-i="' + i + '" value="' + budgetEsc(rv) + '" style="padding:7px 9px;font-size:13px;text-align:right;"></td>' +
          '<td><input type="text" inputmode="numeric" class="input simCpc" data-i="' + i + '" value="' + budgetEsc(cv) + '" style="padding:7px 9px;font-size:13px;text-align:right;"></td>' +
          '<td><input type="text" inputmode="decimal" class="input simCvr" data-i="' + i + '" value="' + budgetEsc(vv) + '" style="padding:7px 9px;font-size:13px;text-align:right;"></td>' +
        '</tr>';
    }).join('');

    body.innerHTML =
      '<div class="tool-grid wide-right">' +
        // 입력 패널
        '<div class="panel">' +
          '<div class="panel-head"><span class="ico">🧮</span><div>' +
            '<div class="panel-title">예산 & 가정값</div>' +
            '<div class="panel-sub">총 예산을 퍼널 4단계로 배분</div>' +
          '</div></div>' +

          '<div class="field-row">' +
            '<div class="field">' +
              '<label>총 예산<span class="req">필수</span></label>' +
              '<div class="input-affix"><input type="text" inputmode="numeric" id="simTotal" placeholder="예: 10000000"><span class="affix">원</span></div>' +
            '</div>' +
            '<div class="field">' +
              '<label>기간<span class="opt">선택</span></label>' +
              '<div class="input-affix"><input type="text" inputmode="numeric" id="simDays" placeholder="예: 30"><span class="affix">일</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="qtags" id="simTotalTags">' +
            '<span class="qtag" data-v="3000000">300만</span>' +
            '<span class="qtag" data-v="5000000">500만</span>' +
            '<span class="qtag" data-v="10000000">1,000만</span>' +
            '<span class="qtag" data-v="30000000">3,000만</span>' +
          '</div>' +

          '<div class="field" style="margin-top:16px;">' +
            '<label>공통 객단가 AOV<span class="req">필수</span></label>' +
            '<div class="input-affix"><input type="text" inputmode="numeric" id="simAov" value="70000"><span class="affix">원</span></div>' +
            '<div class="field-hint">전환 1건당 평균 매출(전 단계 공통 적용)</div>' +
          '</div>' +

          '<div class="field" style="margin-top:6px;">' +
            '<label class="field-label">단계별 배분 비율 · 가정값</label>' +
            '<div class="table-scroll">' +
              '<table class="t-table" style="font-size:12px;">' +
                '<thead><tr>' +
                  '<th>단계</th><th style="text-align:right;">비율(%)</th><th style="text-align:right;">CPC(원)</th><th style="text-align:right;">CVR(%)</th>' +
                '</tr></thead>' +
                '<tbody>' + stageRows + '</tbody>' +
              '</table>' +
            '</div>' +
            '<div class="field-hint" id="simRatioHint">비율 합계가 100%가 되도록 맞추세요. CPC·CVR은 매체/캠페인 경험치로 수정하세요.</div>' +
          '</div>' +

          '<div class="btn-row">' +
            '<button class="btn btn-ghost btn-sm" id="simReset">🎲 예시값으로 복원</button>' +
            '<button class="btn btn-ghost btn-sm" id="simClear">🗑 입력 비우기</button>' +
          '</div>' +
        '</div>' +

        // 결과 패널
        '<div class="panel">' +
          '<div class="panel-head"><span class="ico">📈</span><div>' +
            '<div class="panel-title">예상 성과 시뮬레이션</div>' +
            '<div class="panel-sub">입력 가정 기준 추정</div>' +
          '</div></div>' +
          '<div id="simResult"></div>' +
        '</div>' +
      '</div>';

    // 저장된 상단 입력 복원(총예산·기간·AOV)
    if (saved) {
      ['simTotal', 'simDays', 'simAov'].forEach(function (id) {
        if (saved[id] != null && saved[id] !== '') { var el = body.querySelector('#' + id); if (el) el.value = saved[id]; }
      });
    }

    // 총예산 빠른 태그
    var totalInput = body.querySelector('#simTotal');
    body.querySelectorAll('#simTotalTags .qtag').forEach(function (tag) {
      tag.addEventListener('click', function () {
        totalInput.value = tag.getAttribute('data-v');
        budgetCalcSim(body);
        budgetPersist(root);
      });
    });

    // 입력 변경 시 재계산 + 저장
    ['simTotal', 'simDays', 'simAov'].forEach(function (id) {
      body.querySelector('#' + id).addEventListener('input', function () { budgetCalcSim(body); budgetPersist(root); });
    });
    body.querySelectorAll('.simRatio, .simCpc, .simCvr').forEach(function (el) {
      el.addEventListener('input', function () { budgetCalcSim(body); budgetPersist(root); });
    });

    // 예시값으로 복원 — 시뮬레이터 저장값 비우고 기본 예시값으로 재렌더(손익분기 입력은 유지)
    body.querySelector('#simReset').addEventListener('click', function () {
      var cur = budgetLoad() || {};
      delete cur.sim;
      ['simTotal', 'simDays', 'simAov'].forEach(function (id) { delete cur[id]; });
      budgetSave(cur);
      budgetRenderSim(root);
    });

    // 입력 비우기 — 시뮬레이터 입력만 모두 비움 + 저장 키 정리(손익분기 입력은 유지)
    body.querySelector('#simClear').addEventListener('click', function () {
      ['simTotal', 'simDays', 'simAov'].forEach(function (id) {
        var el = body.querySelector('#' + id); if (el) el.value = '';
      });
      body.querySelectorAll('.simRatio, .simCpc, .simCvr').forEach(function (el) { el.value = ''; });
      var cur = budgetLoad() || {};
      ['simTotal', 'simDays', 'simAov'].forEach(function (id) { delete cur[id]; });
      delete cur.sim;
      budgetSave(cur);
      budgetCalcSim(body);
    });

    budgetCalcSim(body);
  }

  function budgetCalcSim(body) {
    var out = body.querySelector('#simResult');

    var total = budgetPos(body.querySelector('#simTotal').value); // 총 예산
    var days = budgetPos(body.querySelector('#simDays').value);   // 기간(선택)
    var aov = budgetPos(body.querySelector('#simAov').value);     // 공통 AOV

    // 단계 입력값 수집
    var stages = budgetDefaultStages();
    body.querySelectorAll('.simRatio').forEach(function (el) {
      var i = +el.getAttribute('data-i'); stages[i].ratio = budgetNum(el.value);
    });
    body.querySelectorAll('.simCpc').forEach(function (el) {
      var i = +el.getAttribute('data-i'); stages[i].cpc = budgetNum(el.value);
    });
    body.querySelectorAll('.simCvr').forEach(function (el) {
      var i = +el.getAttribute('data-i'); stages[i].cvr = budgetNum(el.value);
    });

    // 비율 합계(빈칸/음수는 0 취급해 합계 검증)
    var ratioSum = stages.reduce(function (acc, s) {
      var r = (s.ratio != null && s.ratio >= 0) ? s.ratio : 0;
      return acc + r;
    }, 0);
    var ratioSumR = Math.round(ratioSum * 100) / 100;

    // 비율 합계 힌트 갱신
    var hint = body.querySelector('#simRatioHint');
    if (hint) {
      var sumTxt = budgetTrim(ratioSumR);
      if (ratioSumR === 100) {
        hint.innerHTML = '✅ 비율 합계 <b style="color:var(--ok)">100%</b> — 정상';
      } else {
        hint.innerHTML = '현재 비율 합계 <b style="color:var(--warn)">' + sumTxt + '%</b> (목표 100%). CPC·CVR은 경험치로 수정하세요.';
      }
    }

    // 총예산/AOV 없으면 빈 상태
    if (total == null || aov == null) {
      out.innerHTML =
        '<div class="empty-state">' +
          '<div class="e-ico">💰</div>' +
          '<div class="e-txt">총 예산과 객단가(AOV)를 입력하면<br>단계별 예상 성과가 계산됩니다.</div>' +
        '</div>';
      return;
    }

    // ── 단계별 계산 ──
    // 예산 = 총예산 × 비율/100 / 클릭 = 예산/CPC / 전환 = 클릭×CVR/100
    // 매출 = 전환×AOV / ROAS = 매출/예산×100 / CPA = 예산/전환
    var rows = stages.map(function (s, i) {
      var ratio = (s.ratio != null && s.ratio >= 0) ? s.ratio : 0;
      var budget = total * (ratio / 100);
      var cpc = (s.cpc != null && s.cpc > 0) ? s.cpc : null;
      var cvr = (s.cvr != null && s.cvr >= 0) ? s.cvr : null;

      var clicks = (cpc != null) ? (budget / cpc) : null;
      var conv = (clicks != null && cvr != null) ? (clicks * (cvr / 100)) : null;
      var revenue = (conv != null) ? (conv * aov) : null;
      var roas = (revenue != null && budget > 0) ? (revenue / budget * 100) : null;
      var cpa = (conv != null && conv > 0) ? (budget / conv) : null;

      return {
        idx: i, name: s.name, ratio: ratio, budget: budget,
        clicks: clicks, conv: conv, revenue: revenue, roas: roas, cpa: cpa
      };
    });

    // 합계(유효 단계만 합산)
    var sumBudget = 0, sumClicks = 0, sumConv = 0, sumRevenue = 0;
    rows.forEach(function (r) {
      sumBudget += r.budget;
      if (r.clicks != null) sumClicks += r.clicks;
      if (r.conv != null) sumConv += r.conv;
      if (r.revenue != null) sumRevenue += r.revenue;
    });
    var totalRoas = (sumBudget > 0) ? (sumRevenue / sumBudget * 100) : null;
    var totalCpa = (sumConv > 0) ? (sumBudget / sumConv) : null;

    // ── 종합 요약 타일 ── (결론 지표는 종합 ROAS 1개만 primary)
    var html = '<div class="result-grid c3">';
    html +=
      '<div class="metric primary">' +
        '<div class="m-label">📈 종합 ROAS</div>' +
        '<div class="m-value">' + (totalRoas != null ? fmtInt(totalRoas) : '–') +
          (totalRoas != null ? '<span class="unit">%</span>' : '') + '</div>' +
        '<div class="m-sub">매출 ÷ 예산</div>' +
      '</div>';
    html +=
      '<div class="metric">' +
        '<div class="m-label">🛒 총 전환</div>' +
        '<div class="m-value">' + (sumConv > 0 ? fmtInt(sumConv) : '–') +
          (sumConv > 0 ? '<span class="unit">건</span>' : '') + '</div>' +
        '<div class="m-sub">예상 전환 합계</div>' +
      '</div>';
    html +=
      '<div class="metric">' +
        '<div class="m-label">💵 총 매출</div>' +
        '<div class="m-value">' + (sumRevenue > 0 ? fmtWonShort(sumRevenue) : '–') + '</div>' +
        '<div class="m-sub">' + (sumRevenue > 0 ? fmtWon(sumRevenue) : '예상 매출 합계') + '</div>' +
      '</div>';
    html += '</div>';

    // 종합 CPA + 일 예산(기간 입력 시)
    html += '<div class="result-grid" style="margin-top:12px;">';
    html +=
      '<div class="metric">' +
        '<div class="m-label">🎯 종합 CPA</div>' +
        '<div class="m-value">' + (totalCpa != null ? fmtWon(totalCpa) : '–') + '</div>' +
        '<div class="m-sub">전환 1건당 평균 비용</div>' +
      '</div>';
    var perDay = (days != null) ? (total / days) : null;
    html +=
      '<div class="metric">' +
        '<div class="m-label">📅 일 예산</div>' +
        '<div class="m-value">' + (perDay != null ? fmtWon(perDay) : '–') + '</div>' +
        '<div class="m-sub">' + (perDay != null ? '총 예산 ÷ ' + budgetTrim(days) + '일' : '기간 입력 시 표시') + '</div>' +
      '</div>';
    html += '</div>';

    // ── 단계별 표 ──
    var tbody = rows.map(function (r, i) {
      return '' +
        '<tr>' +
          '<td><span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:' + BUDGET_STAGE_COLORS[i] + ';margin-right:7px;"></span>' + r.name +
            ' <span style="color:var(--text-muted);font-weight:600;">' + budgetTrim(r.ratio) + '%</span></td>' +
          '<td class="num">' + fmtWon(r.budget) + '</td>' +
          '<td class="num">' + fmtInt(r.clicks) + '</td>' +
          '<td class="num">' + fmtInt(r.conv) + '</td>' +
          '<td class="num">' + (r.revenue != null ? fmtWon(r.revenue) : '–') + '</td>' +
          '<td class="num">' + (r.roas != null ? fmtInt(r.roas) + '%' : '–') + '</td>' +
        '</tr>';
    }).join('');

    var totalRow =
      '<tr class="total">' +
        '<td>합계</td>' +
        '<td class="num">' + fmtWon(sumBudget) + '</td>' +
        '<td class="num">' + (sumClicks > 0 ? fmtInt(sumClicks) : '–') + '</td>' +
        '<td class="num">' + (sumConv > 0 ? fmtInt(sumConv) : '–') + '</td>' +
        '<td class="num">' + (sumRevenue > 0 ? fmtWon(sumRevenue) : '–') + '</td>' +
        '<td class="num">' + (totalRoas != null ? fmtInt(totalRoas) + '%' : '–') + '</td>' +
      '</tr>';

    html +=
      '<div class="table-scroll" style="margin-top:18px;">' +
        '<table class="t-table">' +
          '<thead><tr>' +
            '<th>단계</th><th style="text-align:right;">예산</th><th style="text-align:right;">예상클릭</th>' +
            '<th style="text-align:right;">예상전환</th><th style="text-align:right;">예상매출</th><th style="text-align:right;">ROAS</th>' +
          '</tr></thead>' +
          '<tbody>' + tbody + totalRow + '</tbody>' +
        '</table>' +
      '</div>';

    // ── 예산 배분 시각화 (막대 + 범례) ──
    var barSegs = '';
    var legend = '';
    rows.forEach(function (r, i) {
      var w = (sumBudget > 0) ? (r.budget / sumBudget * 100) : 0;
      barSegs += '<div class="bar-fill" style="width:' + w.toFixed(2) + '%;background:' + BUDGET_STAGE_COLORS[i] + ';"></div>';
      legend +=
        '<span class="legend-item"><span class="legend-dot" style="background:' + BUDGET_STAGE_COLORS[i] + ';"></span>' +
        r.name + ' ' + budgetTrim(r.ratio) + '% · ' + fmtWonShort(r.budget) + '원</span>';
    });
    html +=
      '<div style="margin-top:18px;">' +
        '<div class="panel-sub" style="margin-bottom:8px;font-weight:700;">예산 배분</div>' +
        '<div class="bar-track" style="display:flex;height:12px;">' + barSegs + '</div>' +
        '<div class="legend">' + legend + '</div>' +
      '</div>';

    // 비율 합계 경고 (100% 아닐 때)
    if (ratioSumR !== 100) {
      html +=
        '<div class="callout warn"><span class="c-ico">⚠️</span><div>' +
        '단계별 비율 합계가 <b>' + budgetTrim(ratioSumR) + '%</b>입니다(100% 아님). ' +
        (ratioSumR < 100
          ? '예산의 ' + budgetTrim(100 - ratioSumR) + '%가 배정되지 않았습니다 — 표의 비율을 조정해 100%를 맞추세요.'
          : '배정 비율이 100%를 초과했습니다 — 실제 집행 예산(' + fmtWon(sumBudget) + ')이 총 예산보다 큽니다. 비율을 줄이세요.') +
        '</div></div>';
    }

    // 손익분기 비교 캡션 — 기본 가정값은 예시이며 본전 ROAS와 비교 유도
    html +=
      '<div class="callout warn"><span class="c-ico">⚖️</span><div>' +
      '이 표의 CPC·CVR은 <b>벤치마크 기반 예시 가정값</b>입니다. ' +
      '종합 ROAS <b>' + (totalRoas != null ? fmtInt(totalRoas) + '%' : '–') + '</b>를 ' +
      '<b>손익분기 계산기</b>의 본전 ROAS(예: 마진 30% → 약 333%)와 꼭 비교하세요 — ' +
      '본전선보다 낮으면 가정대로 집행해도 적자입니다.</div></div>';

    // 면책 콜아웃
    html +=
      '<div class="callout info"><span class="c-ico">ℹ️</span><div>' +
      '예상치는 입력한 가정(CPC·CVR·AOV)에 따른 <b>추정</b>이며 실제와 다를 수 있습니다. ' +
      '집행 후 실제 데이터로 가정값을 보정해 정확도를 높이세요.</div></div>';

    // 결과 액션: 복사 + 도구 연계
    html +=
      '<div class="btn-row">' +
        '<button class="btn btn-ghost btn-sm copy-btn" id="simCopy">📋 결과 복사</button>' +
        '<button class="btn btn-ghost btn-sm" id="simGoBe">📊 손익분기 계산기</button>' +
        '<button class="btn btn-ghost btn-sm" id="simGoKpi">📊 KPI 계산기</button>' +
        '<button class="btn btn-ghost btn-sm" id="simGoReport">📝 주간 리포트</button>' +
        '<button class="btn btn-ghost btn-sm" id="simGoGlossary">📖 용어 사전</button>' +
      '</div>';

    out.innerHTML = html;

    // 결과 복사(종합 요약 + 단계별) — plain text
    var simCopyBtn = out.querySelector('#simCopy');
    if (simCopyBtn) simCopyBtn.addEventListener('click', function () {
      var lines = ['[예산 시뮬레이션]'];
      lines.push('총 예산: ' + fmtInt(total) + '원' + (days != null ? ' / ' + budgetTrim(days) + '일 (일 ' + fmtInt(perDay) + '원)' : ''));
      lines.push('공통 AOV: ' + fmtInt(aov) + '원');
      lines.push('종합 ROAS: ' + (totalRoas != null ? fmtInt(totalRoas) + '%' : '–') +
        ' / 총 전환: ' + (sumConv > 0 ? fmtInt(sumConv) + '건' : '–') +
        ' / 총 매출: ' + (sumRevenue > 0 ? fmtInt(sumRevenue) + '원' : '–') +
        ' / 종합 CPA: ' + (totalCpa != null ? fmtWon(totalCpa) : '–'));
      lines.push('단계별:');
      rows.forEach(function (r) {
        lines.push('  - ' + r.name + ' ' + budgetTrim(r.ratio) + '% | 예산 ' + fmtInt(r.budget) + '원 | 전환 ' +
          (r.conv != null ? fmtInt(r.conv) + '건' : '–') + ' | ROAS ' + (r.roas != null ? fmtInt(r.roas) + '%' : '–'));
      });
      lines.push('※ 가정값(CPC·CVR) 기반 추정 — 손익분기 본전 ROAS와 비교 필요');
      if (typeof copyToClipboard === 'function') copyToClipboard(lines.join('\n'), simCopyBtn);
    });

    // 도구 연계 버튼
    var simGoBe = out.querySelector('#simGoBe');
    if (simGoBe) simGoBe.addEventListener('click', function () {
      var r = document.getElementById(CID);
      if (!r) return;
      budgetState.tab = 'be';
      budgetSyncSeg(r);
      budgetRenderBody(r);
      budgetPersist(r);
    });
    var simGoKpi = out.querySelector('#simGoKpi');
    if (simGoKpi) simGoKpi.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-kpi');
    });
    var simGoReport = out.querySelector('#simGoReport');
    if (simGoReport) simGoReport.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('tool-report');
    });
    var simGoGlossary = out.querySelector('#simGoGlossary');
    if (simGoGlossary) simGoGlossary.addEventListener('click', function () {
      if (typeof showPage === 'function') showPage('glossary');
    });
  }

})();
