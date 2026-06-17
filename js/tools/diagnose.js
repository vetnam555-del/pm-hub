// ============================================================
// diagnose.js — 트러블슈팅 진단기 (도구 모듈)
// 진입점: window.renderDiagnoseTool()  →  컨테이너 #page-tool-diagnose
// 캠페인 증상을 고르면 보조 질문 → 원인 순위 + 권장 액션을 단계별 안내.
// 통합 계약: ES모듈 금지, 전역 헬퍼(copyToClipboard 등) 사용, 전역 함수 1개만 노출,
//            외부 의존/네트워크/현재시각 API 금지. 컨테이너 innerHTML 재렌더 안전.
// ============================================================
(function () {
  'use strict';

  // ─── 모듈 상태 (외부 노출 금지, 접두사 diag*) ───
  var diagState = {
    step: 1,        // 1: 증상선택 · 2: 보조질문 · 3: 결과
    symptom: null,  // 선택한 증상 키
    answers: {}     // { questionId: optionValue }
  };

  // 렌더 전 diagnosePrefill 호출 대비 보류 저장소 (report→진단 핸드오프용)
  var diagPending = null;

  // ─── 증상 데이터 매트릭스 ───
  // q: 보조 질문 목록 (각 답에 따라 원인 순위/문구를 조정)
  // causes: 기본 원인 순위(가능성 높은 순), actions: 권장 액션, days: 관련 학습 Day
  var diagDATA = {
    ctr: {
      ico: '👀', title: 'CTR 낮음', desc: '노출은 되는데 클릭률이 낮아요',
      questions: [
        { id: 'age', label: '같은 소재 사용 기간이 3일 이상인가요?', opts: [
          { v: 'yes', t: '3일 이상' }, { v: 'no', t: '3일 미만' } ] },
        { id: 'new', label: '신규 캠페인(학습 기간)인가요?', opts: [
          { v: 'yes', t: '신규' }, { v: 'no', t: '운영 중' } ] }
      ],
      causes: [
        { name: '소재 피로(노출 누적)', desc: '같은 소재가 반복 노출되며 반응이 떨어진 상태' },
        { name: '타겟 미스매치', desc: '소재 메시지와 노출 대상이 어긋남' },
        { name: '후킹(훅) 약함', desc: '첫 3초·첫 줄에서 시선을 잡지 못함' }
      ],
      actions: [
        '소재 교체 후 A/B 테스트 — 카피·썸네일·포맷을 2~3안으로 비교',
        '타겟 세분화 — 관심사·연령·디바이스별로 쪼개 반응 좋은 세그먼트 확인',
        '첫 3초/첫 줄 훅 강화 — 혜택·숫자·질문형 카피로 시선 잡기'
      ],
      days: [ { id: 'day18', label: '📘 Day 18 · 캠페인 최적화' } ]
    },
    cvr: {
      ico: '🛒', title: 'CVR 낮음', desc: '클릭은 되는데 전환이 안 돼요',
      questions: [
        { id: 'lp', label: '랜딩페이지(LP) 모바일·로딩 점검을 했나요?', opts: [
          { v: 'no', t: '아직' }, { v: 'yes', t: '확인함' } ] },
        { id: 'traffic', label: '유입 질(타겟 적합도)은 어떤가요?', opts: [
          { v: 'low', t: '낮은 듯' }, { v: 'ok', t: '괜찮음' } ] }
      ],
      causes: [
        { name: '랜딩페이지 문제', desc: '로딩 지연·모바일 UI 불편·CTA 불명확' },
        { name: '유입 질 낮음', desc: '클릭은 많지만 구매 의도 낮은 트래픽' },
        { name: '가격·신뢰 요소 부족', desc: '후기·혜택·보장 등 결정 근거 부족' }
      ],
      actions: [
        'LP 로딩 속도·모바일 UI 점검 — 첫 화면에 핵심 혜택과 CTA 노출',
        '타겟 정제 — 전환 가능성 높은 세그먼트로 유입 질 개선',
        '후기·혜택·보장 강화 — 가격/신뢰 장벽을 낮추는 요소 추가'
      ],
      days: [ { id: 'day18', label: '📘 Day 18 · 캠페인 최적화' } ]
    },
    budget: {
      ico: '💸', title: '예산 미소진', desc: '하루 예산이 다 안 쓰여요',
      questions: [
        { id: 'narrow', label: '타겟 모수가 좁은 편인가요?', opts: [
          { v: 'yes', t: '좁음' }, { v: 'no', t: '넓음' } ] },
        { id: 'bid', label: '입찰가가 낮게 설정돼 있나요?', opts: [
          { v: 'yes', t: '낮음' }, { v: 'no', t: '적정' } ] },
        { id: 'review', label: '소재가 심사 통과·노출 가능 상태인가요?', opts: [
          { v: 'yes', t: '정상' }, { v: 'no', t: '미확인' } ] }
      ],
      causes: [
        { name: '타겟이 너무 좁음', desc: '도달 가능 모수가 작아 노출 기회 부족' },
        { name: '입찰가 낮음', desc: '경매에서 밀려 노출이 적게 발생' },
        { name: '노출 조건 제한', desc: '소재 심사 반려·게재 위치·일정 제한' }
      ],
      actions: [
        '타겟 확대 — 관심사·지역·유사타겟을 넓혀 도달 모수 늘리기',
        '입찰가 상향 — 단계적으로 올리며 노출량·CPA 변화 관찰',
        '소재 심사 상태·노출 조건 확인 — 반려/제한 게재 위치 점검'
      ],
      days: [ { id: 'day18', label: '📘 Day 18 · 캠페인 최적화' } ]
    },
    cpa: {
      ico: '📈', title: 'CPA 급등', desc: '전환단가가 갑자기 비싸졌어요',
      questions: [
        { id: 'change', label: '최근 소재·타겟·예산을 변경했나요?', opts: [
          { v: 'yes', t: '변경함' }, { v: 'no', t: '그대로' } ] },
        { id: 'season', label: '시즌·경쟁 심화 이슈가 있나요?', opts: [
          { v: 'yes', t: '있음' }, { v: 'no', t: '없음' } ] },
        { id: 'new', label: '신규 캠페인(학습 기간)인가요?', opts: [
          { v: 'yes', t: '신규' }, { v: 'no', t: '운영 중' } ] }
      ],
      causes: [
        { name: '소재 소진(피로)', desc: '주력 소재 반응이 떨어지며 단가 상승' },
        { name: '알고리즘 재학습', desc: '변경 직후 또는 신규로 최적화가 흔들림' },
        { name: '시즌 경쟁 심화', desc: '경매 경쟁 증가로 입찰 단가 상승' }
      ],
      actions: [
        '소재 보충·교체 — 신규 소재를 투입해 반응 회복',
        '(변경/신규면) 학습 기간 대기 — 섣부른 추가 수정 금지',
        '입찰·예산 점진 조정 — 한 번에 크게 바꾸지 말고 단계적으로'
      ],
      days: [
        { id: 'day31', label: '📕 Day 31 · CPA 급등 대응' },
        { id: 'day18', label: '📘 Day 18 · 캠페인 최적화' }
      ]
    },
    roas: {
      ico: '📉', title: 'ROAS 급락', desc: '매출 효율이 떨어졌어요',
      questions: [
        { id: 'track', label: '전환·매출 추적이 정상 집계되나요?', opts: [
          { v: 'yes', t: '정상' }, { v: 'no', t: '의심됨' } ] },
        { id: 'price', label: '상품 마진·가격·구성이 바뀌었나요?', opts: [
          { v: 'yes', t: '바뀜' }, { v: 'no', t: '그대로' } ] }
      ],
      causes: [
        { name: '고CPA 유입 증가', desc: '단가 높은 트래픽이 늘어 효율 하락' },
        { name: '상품 마진·가격 변화', desc: '객단가·마진 변동으로 매출 대비 비용 악화' },
        { name: '전환 추적 오류', desc: '매출이 누락·과소 집계되어 ROAS 왜곡' }
      ],
      actions: [
        '유입 질 점검 — 고CPA·저전환 매체/세그먼트 비중 확인',
        '손익분기 ROAS 재확인 — [손익분기·예산] 도구로 목표선 점검',
        '상품 구성·가격 재검토 — 마진/객단가 변화 반영'
      ],
      days: [ { id: 'day18', label: '📘 Day 18 · 캠페인 최적화' } ]
    },
    track: {
      ico: '🔌', title: '전환 미집계', desc: '전환이 0으로 잡혀요',
      questions: [
        { id: 'pixel', label: '픽셀/SDK 설치를 확인했나요?', opts: [
          { v: 'no', t: '미확인' }, { v: 'yes', t: '확인함' } ] },
        { id: 'utm', label: 'UTM 파라미터가 적용돼 있나요?', opts: [
          { v: 'no', t: '누락 의심' }, { v: 'yes', t: '적용됨' } ] }
      ],
      causes: [
        { name: '픽셀/SDK 미설치·오류', desc: '전환 이벤트가 매체로 전달되지 않음' },
        { name: 'UTM 누락', desc: '유입 출처가 추적되지 않아 매칭 실패' },
        { name: '어트리뷰션 윈도우', desc: '전환 인정 기간 설정으로 집계 누락/지연' }
      ],
      actions: [
        'Pixel Helper · Tag Assistant로 이벤트 발화 점검',
        'UTM 점검 — [UTM 빌더] 도구로 파라미터 표준화·검수',
        '어트리뷰션 윈도우·이중집계 설정 확인'
      ],
      days: [ { id: 'day16', label: '📗 Day 16 · GA4 & 전환 추적' } ]
    }
  };

  // 증상 카드 표시 순서
  var diagORDER = ['ctr', 'cvr', 'budget', 'cpa', 'roas', 'track'];

  // ─── HTML 이스케이프 (방어용; 데이터는 내부 상수지만 일관성 유지) ───
  function diagEsc(s) {
    if (s == null) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ─── 컨테이너 조회 ───
  function diagRoot() { return document.getElementById('page-tool-diagnose'); }

  // ============================================================
  // 진입점: 전체 셸 1회 렌더 + 스텝 영역 렌더
  // ============================================================
  function renderDiagnoseTool() {
    var root = diagRoot();
    if (!root) return;
    // 진입점 재호출 시 항상 STEP 1부터 새로
    diagState = { step: 1, symptom: null, answers: {} };

    root.innerHTML =
      '<div class="tool-wrap">' +
        '<div class="tool-hero">' +
          '<div class="eyebrow">🧰 실무 도구</div>' +
          '<h1>트러블슈팅 진단기</h1>' +
          '<p>캠페인 증상을 고르면 가능성 높은 원인과 권장 액션을 단계별로 안내합니다. ' +
          '하루 변동에 흔들리지 말고, 진단 결과를 점검 체크리스트로 활용하세요.</p>' +
        '</div>' +
        '<div class="tool-grid single">' +
          '<div class="panel">' +
            '<div id="diag-steps"></div>' +
            '<div id="diag-body"></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    diagRender();

    // 렌더 전 호출된 diagnosePrefill 보류분 반영 (report→진단 핸드오프)
    if (diagPending != null) {
      var pk = diagPending;
      diagPending = null;
      diagApplyPrefill(pk);
    }
  }

  // ── 도구 연계: 외부에서 증상을 선택하고 STEP2로 진입 ──
  // symptomKey 예: 'ctr','cvr','budget','cpa','roas','track'. 잘못된 키는 무시.
  // 렌더 전 호출돼도 안전 — pending 저장 후 페이지 전환(전환이 렌더를 트리거).
  window.diagnosePrefill = function (symptomKey) {
    if (!symptomKey || !diagDATA[symptomKey]) return; // 잘못된 키 무시
    var root = diagRoot();
    if (!root || !root.querySelector('#diag-body')) {
      diagPending = symptomKey;
      if (typeof showPage === 'function') showPage('tool-diagnose');
      return;
    }
    diagApplyPrefill(symptomKey);
  };

  // 증상 선택 + STEP2 진입 (답변 초기화)
  function diagApplyPrefill(symptomKey) {
    if (!diagDATA[symptomKey]) return;
    diagState.symptom = symptomKey;
    diagState.answers = {};
    diagState.step = 2;
    diagRender();
  }

  // ─── 스텝퍼 + 본문 렌더 (상태 기반 부분 갱신) ───
  function diagRender() {
    var root = diagRoot();
    if (!root) return;

    var stepsEl = root.querySelector('#diag-steps');
    var bodyEl = root.querySelector('#diag-body');
    if (!stepsEl || !bodyEl) return;

    var labels = ['증상 선택', '보조 질문', '진단 결과'];
    var stepsHtml = '<div class="steps">';
    for (var i = 0; i < 3; i++) {
      var on = (diagState.step >= i + 1) ? ' on' : '';
      stepsHtml += '<div class="step' + on + '"><span class="s-num">' + (i + 1) + '</span>' +
        diagEsc(labels[i]) + '</div>';
    }
    stepsHtml += '</div>';
    stepsEl.innerHTML = stepsHtml;

    if (diagState.step === 1) bodyEl.innerHTML = diagViewStep1();
    else if (diagState.step === 2) bodyEl.innerHTML = diagViewStep2();
    else bodyEl.innerHTML = diagViewStep3();

    diagBind();
  }

  // ─── STEP 1: 증상 선택 ───
  function diagViewStep1() {
    var html =
      '<div class="panel-head" style="margin-bottom:14px;">' +
        '<span class="ico">🩺</span>' +
        '<div><div class="panel-title">어떤 증상인가요?</div>' +
        '<div class="panel-sub">현재 캠페인에서 가장 두드러진 문제를 1개 고르세요.</div></div>' +
      '</div>' +
      '<div class="choice-grid">';
    for (var i = 0; i < diagORDER.length; i++) {
      var key = diagORDER[i];
      var d = diagDATA[key];
      var on = (diagState.symptom === key) ? ' on' : '';
      html +=
        '<button type="button" class="choice' + on + '" data-symptom="' + key + '">' +
          '<div class="ch-ico">' + d.ico + '</div>' +
          '<div class="ch-title">' + diagEsc(d.title) + '</div>' +
          '<div class="ch-desc">' + diagEsc(d.desc) + '</div>' +
        '</button>';
    }
    html += '</div>' +
      '<div class="callout info"><span class="c-ico">💡</span>' +
      '<span>증상은 겹쳐 보일 수 있어요. <b>가장 직접적인 한 가지</b>부터 진단하면 원인 파악이 빠릅니다.</span></div>';
    return html;
  }

  // ─── STEP 2: 보조 질문 ───
  function diagViewStep2() {
    var d = diagDATA[diagState.symptom];
    if (!d) { diagState.step = 1; return diagViewStep1(); }

    var html =
      '<div class="panel-head" style="margin-bottom:14px;">' +
        '<span class="ico">' + d.ico + '</span>' +
        '<div><div class="panel-title">' + diagEsc(d.title) + ' — 보조 질문</div>' +
        '<div class="panel-sub">답에 따라 원인 순위를 조정합니다. (선택은 자유, 건너뛰면 기본 진단)</div></div>' +
      '</div>';

    for (var q = 0; q < d.questions.length; q++) {
      var qd = d.questions[q];
      html += '<div class="field"><label>' + diagEsc(qd.label) + '<span class="opt">선택</span></label>' +
        '<div class="seg" data-qid="' + diagEsc(qd.id) + '">';
      for (var o = 0; o < qd.opts.length; o++) {
        var op = qd.opts[o];
        var sel = (diagState.answers[qd.id] === op.v) ? ' on' : '';
        html += '<button type="button" class="seg-btn' + sel + '" data-qid="' + diagEsc(qd.id) +
          '" data-val="' + diagEsc(op.v) + '">' + diagEsc(op.t) + '</button>';
      }
      html += '</div></div>';
    }

    html += '<div class="btn-row">' +
      '<button type="button" class="btn btn-primary" data-act="to-result">진단 결과 보기 →</button>' +
      '<button type="button" class="btn btn-ghost" data-act="back-1">← 증상 다시 선택</button>' +
      '</div>';
    return html;
  }

  // ─── STEP 2 답변을 반영해 원인 순위/우선 문구 결정 ───
  function diagResolve() {
    var d = diagDATA[diagState.symptom];
    // 기본 원인 목록 복사 (얕은 복사 후 재정렬)
    var causes = d.causes.slice();
    var a = diagState.answers;
    var lead = null;   // 최우선 안내 콜아웃 (있으면)

    if (diagState.symptom === 'ctr') {
      if (a.age === 'no') {
        lead = { type: 'info', ico: '⏳', text: '소재 사용 <b>3일 미만</b>입니다. 데이터가 적어 판단이 이를 수 있어요. ' +
          '의미 있는 노출이 쌓일 때까지 <b>조금 더 관찰</b>한 뒤 교체를 결정하세요.' };
      }
      if (a.new === 'yes') {
        lead = { type: 'warn', ico: '🧪', text: '<b>신규 캠페인 학습 기간</b>입니다. 초반 CTR 변동은 정상이에요. ' +
          '잦은 수정은 학습을 리셋시킬 수 있으니 <b>섣부른 수정은 금지</b>하세요.' };
        causes = diagReorder(causes, '타겟 미스매치');
      }
    } else if (diagState.symptom === 'cvr') {
      if (a.lp === 'no') {
        causes = diagReorder(causes, '랜딩페이지 문제');
        lead = { type: 'warn', ico: '📱', text: 'LP 점검을 아직 안 했다면 <b>랜딩페이지부터</b> 확인하세요. ' +
          '로딩 지연·모바일 UI 불편이 전환을 가장 크게 깎습니다.' };
      } else if (a.traffic === 'low') {
        causes = diagReorder(causes, '유입 질 낮음');
      }
    } else if (diagState.symptom === 'budget') {
      if (a.review === 'no') {
        causes = diagReorder(causes, '노출 조건 제한');
        lead = { type: 'warn', ico: '🔍', text: '소재 심사·노출 상태가 미확인입니다. <b>심사 반려/게재 제한</b>이면 ' +
          '타겟·입찰을 바꿔도 소진되지 않으니 가장 먼저 확인하세요.' };
      }
      // narrow(타겟 좁음)·bid(입찰가 낮음)는 독립 원인 — 둘 다 yes면 모두 상위 반영.
      // diagReorder는 각각 해당 원인을 맨 앞으로 끌어올리므로, 나중에 호출된 쪽이 최종 1순위가 된다.
      if (a.bid === 'yes') {
        causes = diagReorder(causes, '입찰가 낮음');
      }
      if (a.narrow === 'yes') {
        causes = diagReorder(causes, '타겟이 너무 좁음');
      }
    } else if (diagState.symptom === 'cpa') {
      if (a.new === 'yes') {
        causes = diagReorder(causes, '알고리즘 재학습');
        lead = { type: 'warn', ico: '🧪', text: '<b>신규 캠페인 학습 기간</b>입니다. 초기 CPA 급등은 흔합니다. ' +
          '<b>섣부른 수정 금지</b> — 학습이 안정될 때까지 기다리세요.' };
      } else if (a.change === 'yes') {
        causes = diagReorder(causes, '알고리즘 재학습');
        lead = { type: 'info', ico: '🔄', text: '최근 변경 직후라면 <b>재학습</b> 영향일 수 있어요. 추가 변경을 멈추고 ' +
          '안정화를 기다린 뒤 판단하세요.' };
      } else if (a.season === 'yes') {
        causes = diagReorder(causes, '시즌 경쟁 심화');
      }
      // CPA는 항상 "3~5일 평균 판단" 강조 (lead가 없을 때 기본 안내)
      if (!lead) {
        lead = { type: 'warn', ico: '🛑', text: '<b>하루 변동에 즉시 끄지 마세요.</b> 단가는 노이즈가 큽니다. ' +
          '반드시 <b>3~5일 평균</b>으로 추세를 보고 판단하세요.' };
      }
    } else if (diagState.symptom === 'roas') {
      if (a.track === 'no') {
        causes = diagReorder(causes, '전환 추적 오류');
        lead = { type: 'warn', ico: '🔌', text: '추적이 의심된다면 <b>집계 정확성부터</b> 확인하세요. ' +
          '매출 누락이면 ROAS가 실제보다 낮게 보여 잘못된 판단을 부릅니다.' };
      } else if (a.price === 'yes') {
        causes = diagReorder(causes, '상품 마진·가격 변화');
      }
    } else if (diagState.symptom === 'track') {
      if (a.pixel === 'no') {
        causes = diagReorder(causes, '픽셀/SDK 미설치·오류');
        lead = { type: 'danger', ico: '🚨', text: '픽셀/SDK 설치가 미확인입니다. <b>이게 1순위</b>예요. ' +
          'Pixel Helper·Tag Assistant로 이벤트 발화부터 확인하세요.' };
      } else if (a.utm === 'no') {
        causes = diagReorder(causes, 'UTM 누락');
        lead = { type: 'warn', ico: '🔗', text: 'UTM이 누락되면 출처 매칭이 안 됩니다. [UTM 빌더]로 파라미터를 표준화하세요.' };
      }
    }

    return { causes: causes, lead: lead };
  }

  // 특정 원인을 맨 앞으로 끌어올림 (없으면 원본 유지)
  function diagReorder(causes, frontName) {
    var idx = -1;
    for (var i = 0; i < causes.length; i++) {
      if (causes[i].name === frontName) { idx = i; break; }
    }
    if (idx <= 0) return causes;
    var picked = causes.splice(idx, 1)[0];
    causes.unshift(picked);
    return causes;
  }

  // ─── STEP 3: 진단 결과 ───
  function diagViewStep3() {
    var d = diagDATA[diagState.symptom];
    if (!d) { diagState.step = 1; return diagViewStep1(); }

    var res = diagResolve();
    var rank = ['1순위', '2순위', '3순위', '4순위', '5순위'];

    var html =
      '<div class="panel-head" style="margin-bottom:14px;">' +
        '<span class="ico">' + d.ico + '</span>' +
        '<div><div class="panel-title">' + diagEsc(d.title) + ' — 진단 결과</div>' +
        '<div class="panel-sub">아래는 점검 우선순위입니다. 위에서부터 하나씩 확인하세요.</div></div>' +
      '</div>';

    // 최우선 안내 (보조 질문 반영)
    if (res.lead) {
      html += '<div class="callout ' + res.lead.type + '"><span class="c-ico">' + res.lead.ico +
        '</span><span>' + res.lead.text + '</span></div>';
    }

    // 가능성 높은 원인 (순위)
    html += '<div style="margin-top:18px;font-size:12px;font-weight:800;color:var(--text-secondary);' +
      'letter-spacing:.3px;margin-bottom:10px;">🔎 가능성 높은 원인</div>';
    html += '<div class="table-scroll"><table class="t-table"><thead><tr>' +
      '<th>우선순위</th><th>원인</th><th>설명</th></tr></thead><tbody>';
    for (var c = 0; c < res.causes.length; c++) {
      html += '<tr><td>' + diagEsc(rank[c] || (c + 1) + '순위') + '</td>' +
        '<td><b style="color:var(--text-primary);">' + diagEsc(res.causes[c].name) + '</b></td>' +
        '<td>' + diagEsc(res.causes[c].desc) + '</td></tr>';
    }
    html += '</tbody></table></div>';

    // 권장 액션 (원인 순위와 동일 순서로 정렬해 매칭)
    var orderedActions = diagOrderActions(d, res.causes);
    html += '<div class="callout ok" style="margin-top:16px;"><span class="c-ico">✅</span><span>' +
      '<b>권장 액션</b><br>';
    for (var k = 0; k < orderedActions.length; k++) {
      html += '&nbsp;&nbsp;' + (k + 1) + '. ' + diagEsc(orderedActions[k]) +
        (k < orderedActions.length - 1 ? '<br>' : '');
    }
    html += '</span></div>';

    // 관련 학습 / 도구 (Day 모달 링크 + 도구 페이지 바로가기)
    var tools = diagToolLinks(diagState.symptom);
    if ((d.days && d.days.length) || tools.length) {
      html += '<div style="margin-top:18px;font-size:12px;font-weight:800;color:var(--text-secondary);' +
        'letter-spacing:.3px;margin-bottom:8px;">🎓 관련 학습/도구</div>';
      html += '<div class="btn-row" style="margin-top:0;">';
      if (d.days && d.days.length) {
        for (var dd = 0; dd < d.days.length; dd++) {
          html += '<button type="button" class="btn btn-ghost btn-sm" data-act="learn" data-day="' +
            diagEsc(d.days[dd].id) + '">' + diagEsc(d.days[dd].label) + '</button>';
        }
      }
      for (var t = 0; t < tools.length; t++) {
        html += '<button type="button" class="btn btn-ghost btn-sm" data-act="goto" data-page="' +
          diagEsc(tools[t].page) + '">' + diagEsc(tools[t].label) + '</button>';
      }
      html += '</div>';
    }

    // 컨트롤
    html += '<div class="btn-row">' +
      '<button type="button" class="btn btn-ghost btn-sm copy-btn" data-act="copy-result">📋 결과 복사</button>' +
      '<button type="button" class="btn btn-primary" data-act="restart">🔄 다시 진단</button>' +
      '<button type="button" class="btn btn-ghost" data-act="back-2">← 보조 질문 수정</button>' +
      '</div>';

    return html;
  }

  // 액션을 원인 순위에 맞춰 재배열 (원인 name과 actions가 같은 인덱스로 작성됨 → 매핑 보존)
  function diagOrderActions(d, orderedCauses) {
    var baseCauses = d.causes;
    var out = [];
    for (var i = 0; i < orderedCauses.length; i++) {
      for (var j = 0; j < baseCauses.length; j++) {
        if (baseCauses[j].name === orderedCauses[i].name) {
          if (d.actions[j] != null) out.push(d.actions[j]);
          break;
        }
      }
    }
    // 누락 방지: 매핑 안 된 액션 보충
    if (out.length < d.actions.length) {
      for (var x = 0; x < d.actions.length; x++) {
        if (out.indexOf(d.actions[x]) === -1) out.push(d.actions[x]);
      }
    }
    return out;
  }

  // ─── 결과 복사용 plain text 생성 (핵심 수치 없음 → 증상·원인순위·권장액션) ───
  function diagPlainText(d, res, orderedActions) {
    var lines = [];
    lines.push('[트러블슈팅 진단] ' + d.title + ' — ' + d.desc);
    lines.push('');
    lines.push('■ 가능성 높은 원인 (점검 우선순위)');
    var rankTxt = ['1순위', '2순위', '3순위', '4순위', '5순위'];
    for (var c = 0; c < res.causes.length; c++) {
      lines.push((rankTxt[c] || (c + 1) + '순위') + '. ' + res.causes[c].name +
        ' — ' + res.causes[c].desc);
    }
    lines.push('');
    lines.push('■ 권장 액션');
    for (var k = 0; k < orderedActions.length; k++) {
      lines.push((k + 1) + '. ' + orderedActions[k]);
    }
    return lines.join('\n');
  }

  // 증상별 관련 도구 페이지 링크 (공통 + 증상별)
  function diagToolLinks(symptom) {
    var links = [
      { page: 'tool-kpi', label: '📊 KPI 계산기' },   // 공통(표준 #5)
      { page: 'benchmark', label: '📊 매체 벤치마크' } // 공통
    ];
    if (symptom === 'roas') links.push({ page: 'tool-budget', label: '💰 손익분기·예산' });
    else if (symptom === 'track') links.push({ page: 'tool-utm', label: '🔗 UTM 빌더' });
    links.push({ page: 'glossary', label: '📖 용어 사전' }); // 공통(표준 #5)
    return links;
  }

  // ─── 이벤트 바인딩 (컨테이너 내부 querySelector + addEventListener) ───
  function diagBind() {
    var root = diagRoot();
    if (!root) return;

    // STEP 1: 증상 카드 선택 → 즉시 STEP 2로
    var cards = root.querySelectorAll('.choice[data-symptom]');
    cards.forEach(function (el) {
      el.addEventListener('click', function () {
        var key = el.getAttribute('data-symptom');
        if (!diagDATA[key]) return;
        if (diagState.symptom !== key) {
          diagState.symptom = key;
          diagState.answers = {}; // 증상 바뀌면 답 초기화
        }
        diagState.step = 2;
        diagRender();
      });
    });

    // STEP 2: 세그먼트 토글 (같은 질문 내 단일 선택, 재클릭 시 해제)
    var segBtns = root.querySelectorAll('.seg-btn[data-qid]');
    segBtns.forEach(function (el) {
      el.addEventListener('click', function () {
        var qid = el.getAttribute('data-qid');
        var val = el.getAttribute('data-val');
        if (diagState.answers[qid] === val) {
          delete diagState.answers[qid]; // 재클릭 → 선택 해제
        } else {
          diagState.answers[qid] = val;
        }
        diagRender();
      });
    });

    // 액션 버튼들
    var actBtns = root.querySelectorAll('[data-act]');
    actBtns.forEach(function (el) {
      el.addEventListener('click', function () {
        var act = el.getAttribute('data-act');
        if (act === 'to-result') { diagState.step = 3; diagRender(); }
        else if (act === 'back-1') { diagState.step = 1; diagRender(); }
        else if (act === 'back-2') { diagState.step = 2; diagRender(); }
        else if (act === 'restart') {
          diagState = { step: 1, symptom: null, answers: {} };
          diagRender();
        } else if (act === 'learn') {
          var day = el.getAttribute('data-day');
          if (day && typeof window.openModal === 'function') window.openModal(day);
        } else if (act === 'goto') {
          var page = el.getAttribute('data-page');
          if (page && typeof window.showPage === 'function') window.showPage(page);
        } else if (act === 'copy-result') {
          var dd2 = diagDATA[diagState.symptom];
          if (dd2) {
            var res2 = diagResolve();
            var acts2 = diagOrderActions(dd2, res2.causes);
            var txt = diagPlainText(dd2, res2, acts2);
            if (typeof copyToClipboard === 'function') copyToClipboard(txt, el);
          }
        }
      });
    });
  }

  // ─── 전역 노출 (진입점 1개) ───
  window.renderDiagnoseTool = renderDiagnoseTool;
})();
