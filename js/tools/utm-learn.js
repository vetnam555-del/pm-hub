// ============================================================
// utm-learn.js — 학습 페이지 "UTM 완전정복"
// 진입점: window.renderUtmLearn()  →  컨테이너 #page-utm-learn 에 렌더
// 처음 배우는 인턴용. 개념·파라미터·실전예시·실수TOP5·미니퀴즈.
// 외부 라이브러리/네트워크/날짜 API 사용 안 함. 순수 JS + 이모지.
// 전역 충돌 방지를 위해 IIFE로 감싸고 진입점만 window에 노출.
// ============================================================
(function () {
  'use strict';

  // ── 퀴즈 데이터(모듈 내부 상수) ──────────────────────────
  // correct: 정답 보기 index, why: 정·오답 공통 해설
  var UTM_LEARN_QUIZ = [
    {
      q: 'UTM은 무엇의 약자일까요?',
      opts: [
        'Universal Tracking Module',
        'Urchin Tracking Module',
        'User Traffic Monitor',
        'URL Tag Manager'
      ],
      correct: 1,
      why: 'UTM은 <b>Urchin Tracking Module</b>의 약자입니다. 구글이 인수한 웹분석 회사 Urchin(어친)에서 유래했고, 지금의 구글 애널리틱스(GA)의 뿌리가 됐어요.'
    },
    {
      q: '다음 중 UTM 필수 파라미터가 <b>아닌</b> 것은?',
      opts: ['utm_source', 'utm_medium', 'utm_term', 'utm_campaign'],
      correct: 2,
      why: '필수 3총사는 <b>source · medium · campaign</b> 입니다. <b>utm_term</b>(키워드)과 utm_content(소재)는 선택 항목이에요.'
    },
    {
      q: 'utm_medium 값으로 가장 올바른 것은?',
      opts: ['naver', 'cpc', 'spring_sale', '배너광고A'],
      correct: 1,
      why: 'medium은 "어떤 방법으로 왔는가"이므로 <b>cpc</b>(검색광고), display(배너), email, social 같은 유형 값이 들어갑니다. naver는 source, spring_sale은 campaign 자리예요.'
    },
    {
      q: '네이밍 규칙으로 가장 올바른 source 값은?',
      opts: ['utm_source=Naver', 'utm_source=NAVER', 'utm_source=naver', 'utm_source=네이버'],
      correct: 2,
      why: 'UTM 값은 <b>대소문자를 구분</b>합니다. 전부 <b>소문자 영문</b>으로 통일하는 것이 표준이에요. 한글·대문자 혼용은 데이터가 따로 집계돼 분석이 깨집니다.'
    },
    {
      q: '내부(자사) 사이트 배너 링크에 UTM을 그대로 넣으면?',
      opts: [
        '페이지 로딩이 느려진다',
        '세션이 끊기고 원래 유입 소스가 덮어써진다',
        '브라우저가 자동으로 삭제한다',
        '아무 문제 없다'
      ],
      correct: 1,
      why: '내부 링크 클릭 시 GA가 <b>새 세션</b>으로 인식하고, 진짜 유입 소스(예: naver/cpc)가 internal 같은 값으로 <b>덮어써집니다</b>. UTM은 "외부 → 우리 사이트" 유입에만 사용하세요.'
    }
  ];

  // ── 퀴즈 진행 상태(모듈 내부 변수) ──────────────────────
  // answered[i] = 사용자가 고른 보기 index(미응답 = -1)
  var utmLearnAnswered = [];

  function utmLearnResetState() {
    utmLearnAnswered = UTM_LEARN_QUIZ.map(function () { return -1; });
  }

  // ── HTML 안전 이스케이프(혹시 모를 입력 방어용 유틸) ──────
  function utmLearnEsc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 실전 예시 데이터 ────────────────────────────────────
  var UTM_LEARN_EXAMPLES = [
    {
      ico: '🟢',
      name: '네이버 검색광고',
      url: 'https://www.hllcenter.com/product?utm_source=naver&utm_medium=cpc&utm_campaign=spring_sale&utm_term=running_shoes',
      desc: '검색 키워드로 유입 → medium은 cpc(클릭당 과금), term에 입찰 키워드(영문 슬러그)를 기록. 한글 키워드는 %인코딩으로 깨져 권장하지 않아요.'
    },
    {
      ico: '🟣',
      name: '메타 (인스타그램)',
      url: 'https://www.hllcenter.com/event?utm_source=instagram&utm_medium=paid_social&utm_campaign=summer_launch&utm_content=video_a',
      desc: '인스타 피드 광고 → medium은 paid_social, content로 A/B 소재 구분.'
    },
    {
      ico: '🔴',
      name: '유튜브 영상광고',
      url: 'https://www.hllcenter.com/?utm_source=youtube&utm_medium=video&utm_campaign=brand_film&utm_content=15s_skip',
      desc: '유튜브 영상 광고 → medium은 video, content로 15초/스킵 버전 구분.'
    },
    {
      ico: '✉️',
      name: '뉴스레터 이메일',
      url: 'https://www.hllcenter.com/news?utm_source=newsletter&utm_medium=email&utm_campaign=june_weekly&utm_content=top_banner',
      desc: '이메일 본문 링크 → medium은 email, content로 상단/하단 버튼 위치 구분.'
    }
  ];

  // ── 5가지 파라미터 데이터 ───────────────────────────────
  var UTM_LEARN_PARAMS = [
    { key: 'utm_source', req: true, q: '어디서?', desc: '유입 출처(매체/사이트)', tags: ['naver', 'google', 'instagram', 'youtube', 'newsletter'] },
    { key: 'utm_medium', req: true, q: '어떤 방법?', desc: '마케팅 채널 유형', tags: ['cpc', 'display', 'email', 'paid_social', 'organic'] },
    { key: 'utm_campaign', req: true, q: '어떤 캠페인?', desc: '캠페인/프로모션 이름', tags: ['spring_sale', 'summer_launch', 'june_weekly'] },
    // utm_term 키워드는 영문 슬러그로 통일. 한글은 %인코딩되어 깨지므로 권장하지 않음.
    { key: 'utm_term', req: false, q: '어떤 키워드?', desc: '검색광고 입찰 키워드(영문 슬러그)', tags: ['spring_sale', 'running_shoes'] },
    { key: 'utm_content', req: false, q: '어떤 소재?', desc: 'A/B 소재·버튼 위치 구분', tags: ['video_a', 'top_banner', 'cta_red'] }
  ];

  // ── 자주 하는 실수 TOP 5 데이터 ─────────────────────────
  var UTM_LEARN_MISTAKES = [
    { kind: 'danger', n: '①', title: '대소문자 혼용', bad: 'utm_source=Naver', good: 'utm_source=naver', note: '값은 대소문자를 구분해 Naver와 naver가 다른 매체로 집계됩니다.' },
    { kind: 'danger', n: '②', title: '띄어쓰기 사용', bad: 'utm_campaign=spring sale', good: 'utm_campaign=spring_sale', note: '공백은 %20으로 깨집니다. 언더스코어(_)나 하이픈(-)으로 연결하세요.' },
    { kind: 'warn', n: '③', title: '네이밍 규칙 없음', bad: 'naver / Naver_SA / 네이버 혼용', good: 'naver 로 통일', note: '같은 매체를 여러 표기로 쓰면 데이터가 쪼개집니다. 팀 규칙표를 만드세요.' },
    { kind: 'danger', n: '④', title: '내부 링크에 UTM 사용', bad: '자사 메인→이벤트 배너에 UTM', good: '외부 유입에만 UTM', note: '내부 클릭이 새 세션으로 잡혀 원래 유입 소스가 덮어써집니다.' },
    { kind: 'warn', n: '⑤', title: '필수 파라미터 누락', bad: 'source만 있고 medium 없음', good: 'source·medium·campaign 모두', note: '필수 3개가 빠지면 GA에서 (not set)으로 잡혀 분석이 불가능합니다.' }
  ];

  // ── 화면 빌드: 정적 HTML 문자열 생성 ────────────────────
  function utmLearnBuildHTML() {
    var exampleUrl = 'https://www.hllcenter.com/product?utm_source=naver&utm_medium=cpc&utm_campaign=spring_sale';

    // 2. 왜 쓰는가 3가지
    var whyCards = [
      { ico: '🎯', t: '정확한 성과 측정', d: '어느 매체·캠페인이 얼마나 전환을 냈는지 콕 집어 알 수 있어요.' },
      { ico: '💰', t: '예산 최적화', d: '잘 나오는 채널에 예산을 몰고, 안 되는 곳은 줄일 근거가 생겨요.' },
      { ico: '📊', t: '데이터 기반 의사결정', d: '"감"이 아니라 숫자로 다음 액션을 정할 수 있어요.' }
    ].map(function (c) {
      return '' +
        '<div class="metric primary">' +
          '<div class="m-label">' + c.ico + ' ' + c.t + '</div>' +
          '<div class="m-sub" style="font-size:12px;line-height:1.6;color:var(--text-secondary)">' + c.d + '</div>' +
        '</div>';
    }).join('');

    // 3. 5가지 파라미터 카드
    var paramCards = UTM_LEARN_PARAMS.map(function (p) {
      var badge = p.req
        ? '<span style="font-size:10px;font-weight:800;color:var(--danger);background:rgba(252,129,129,.12);border:1px solid rgba(252,129,129,.3);border-radius:20px;padding:2px 9px">필수</span>'
        : '<span style="font-size:10px;font-weight:800;color:var(--text-muted);background:rgba(255,255,255,.05);border:1px solid var(--border);border-radius:20px;padding:2px 9px">선택</span>';
      var tags = p.tags.map(function (t) {
        return '<span class="qtag" style="cursor:default">' + utmLearnEsc(t) + '</span>';
      }).join('');
      return '' +
        '<div class="metric" style="display:flex;flex-direction:column;gap:8px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">' +
            '<code style="font-size:13px;font-weight:800;color:var(--primary);font-family:\'JetBrains Mono\',monospace">' + p.key + '</code>' +
            badge +
          '</div>' +
          '<div style="font-size:13px;font-weight:800;color:var(--text-primary)">' + p.q + '</div>' +
          '<div style="font-size:12px;color:var(--text-secondary);line-height:1.5">' + p.desc + '</div>' +
          '<div class="qtags" style="margin-top:2px">' + tags + '</div>' +
        '</div>';
    }).join('');

    // 4. 실전 예시
    var exampleBlocks = UTM_LEARN_EXAMPLES.map(function (ex, i) {
      return '' +
        '<div style="margin-bottom:16px">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px">' +
            '<div style="font-size:13.5px;font-weight:800;color:var(--text-primary)">' + ex.ico + ' ' + ex.name + '</div>' +
            '<button class="btn btn-ghost btn-sm copy-btn" data-utm-copy="' + i + '">📋 복사</button>' +
          '</div>' +
          '<div class="codebox" style="font-size:11.5px">' + utmLearnEsc(ex.url) + '</div>' +
          '<div class="field-hint" style="margin-top:6px">' + ex.desc + '</div>' +
        '</div>';
    }).join('');

    // 5. 자주 하는 실수 TOP 5
    var mistakeBlocks = UTM_LEARN_MISTAKES.map(function (m) {
      return '' +
        '<div class="callout ' + m.kind + '" style="flex-direction:column;align-items:stretch;gap:8px">' +
          '<div style="display:flex;gap:9px;align-items:center">' +
            '<span class="c-ico">' + (m.kind === 'danger' ? '🚫' : '⚠️') + '</span>' +
            '<b style="font-size:13.5px">' + m.n + ' ' + m.title + '</b>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            '<div style="background:rgba(252,129,129,.1);border:1px solid rgba(252,129,129,.25);border-radius:6px;padding:8px 10px;font-size:11.5px;color:#F4C0C0">' +
              '❌ <b style="color:#F4C0C0">잘못</b><br><span style="font-family:\'JetBrains Mono\',monospace;word-break:break-all">' + utmLearnEsc(m.bad) + '</span>' +
            '</div>' +
            '<div style="background:rgba(104,211,145,.1);border:1px solid rgba(104,211,145,.25);border-radius:6px;padding:8px 10px;font-size:11.5px;color:#BBE9CC">' +
              '✅ <b style="color:#BBE9CC">올바름</b><br><span style="font-family:\'JetBrains Mono\',monospace;word-break:break-all">' + utmLearnEsc(m.good) + '</span>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:11.5px;color:var(--text-muted);line-height:1.55">💡 ' + m.note + '</div>' +
        '</div>';
    }).join('');

    // 6. 미니 퀴즈(빈 컨테이너 — 렌더는 utmLearnRenderQuiz로)
    // 7. CTA

    return '' +
    '<div class="tool-wrap">' +

      // 1. 히어로
      '<div class="tool-hero">' +
        '<div class="eyebrow">📘 학습 · UTM 기초</div>' +
        '<h1>UTM 완전정복</h1>' +
        '<p>광고 성과를 정확히 추적하는 첫걸음. URL 뒤에 붙는 다섯 글자 태그가 어떻게 "어디서 온 손님인지"를 알려주는지, 처음부터 차근차근 익혀봅니다.</p>' +
      '</div>' +

      // 2. UTM이란?
      '<div class="panel">' +
        '<div class="panel-head"><span class="ico">🏷️</span><div><div class="panel-title">UTM이란?</div><div class="panel-sub">Urchin Tracking Module</div></div></div>' +
        '<div class="callout info">' +
          '<span class="c-ico">📦</span>' +
          '<div><b>UTM = 택배 송장번호</b> 라고 생각하세요. 택배에 송장이 붙어야 "어디서 출발해 어떻게 왔는지" 추적되듯, 링크에 UTM 태그를 붙여야 방문자가 <b>어느 광고를 타고 왔는지</b> 정확히 추적할 수 있어요.</div>' +
        '</div>' +
        '<div style="margin-top:14px"><div class="field-hint" style="margin-bottom:6px">예시 URL — 물음표(?) 뒤에 태그들이 붙습니다:</div>' +
          '<div class="codebox">https://www.hllcenter.com/product<span style="color:var(--primary)">?utm_source=naver&amp;utm_medium=cpc&amp;utm_campaign=spring_sale</span></div>' +
        '</div>' +
        '<div class="field-hint" style="margin:18px 0 8px;font-weight:700;color:var(--text-secondary)">왜 쓰나요? — 이 3가지 때문에:</div>' +
        '<div class="result-grid c3">' + whyCards + '</div>' +
      '</div>' +

      // 3. 5가지 파라미터
      '<div class="panel">' +
        '<div class="panel-head"><span class="ico">🧩</span><div><div class="panel-title">5가지 파라미터</div><div class="panel-sub">필수 3개 + 선택 2개</div></div></div>' +
        '<div class="result-grid c3">' + paramCards + '</div>' +
        '<div class="callout ok"><span class="c-ico">✅</span><div><b>외우는 법:</b> "<b>어디서(source)</b> · <b>어떤 방법(medium)</b> · <b>어떤 캠페인(campaign)</b>" 이 셋만 있으면 기본은 OK. term/content는 더 세밀하게 보고 싶을 때 추가해요.</div></div>' +
      '</div>' +

      // 4. 실전 예시
      '<div class="panel">' +
        '<div class="panel-head"><span class="ico">📋</span><div><div class="panel-title">실전 예시 4가지</div><div class="panel-sub">채널별 UTM URL — 복사해서 바로 참고</div></div></div>' +
        exampleBlocks +
      '</div>' +

      // 5. 자주 하는 실수 TOP 5
      '<div class="panel">' +
        '<div class="panel-head"><span class="ico">🚨</span><div><div class="panel-title">자주 하는 실수 TOP 5</div><div class="panel-sub">데이터를 망치는 단골 함정</div></div></div>' +
        mistakeBlocks +
      '</div>' +

      // 6. 미니 퀴즈
      '<div class="panel">' +
        '<div class="panel-head"><span class="ico">🧠</span><div><div class="panel-title">미니 퀴즈</div><div class="panel-sub">5문항 — 보기를 눌러 정답을 확인하세요</div></div></div>' +
        '<div id="utmLearnQuizArea"></div>' +
      '</div>' +

      // 7. CTA
      '<div class="callout info" style="align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-top:20px">' +
        '<div style="display:flex;gap:11px;align-items:center"><span class="c-ico">🚀</span><div>이제 개념은 충분해요. <b>직접 UTM을 만들어 볼 차례</b>입니다!</div></div>' +
        '<div class="btn-row">' +
          '<button id="utmLearnGlossary" class="btn btn-ghost">📖 용어 사전</button>' +
          '<button id="utmLearnGoBuilder" class="btn btn-primary">UTM 빌더로 이동 →</button>' +
        '</div>' +
      '</div>' +

    '</div>';
  }

  // ── 퀴즈 영역 렌더(상태 기반, 재호출 안전) ───────────────
  function utmLearnRenderQuiz(area) {
    if (!area) return;

    var blocks = UTM_LEARN_QUIZ.map(function (item, qi) {
      var chosen = utmLearnAnswered[qi];
      var isAnswered = chosen >= 0;

      var optsHtml = item.opts.map(function (opt, oi) {
        var cls = 'btn btn-ghost btn-block';
        var prefix = '';
        var extraStyle = 'justify-content:flex-start;text-align:left;margin-bottom:8px;white-space:normal;line-height:1.5;';
        if (isAnswered) {
          if (oi === item.correct) {
            // 정답 보기: 항상 초록
            extraStyle += 'border-color:var(--ok);background:rgba(104,211,145,.12);color:#BBE9CC;';
            prefix = '✅ ';
          } else if (oi === chosen) {
            // 사용자가 고른 오답: 빨강
            extraStyle += 'border-color:var(--danger);background:rgba(252,129,129,.12);color:#F4C0C0;';
            prefix = '❌ ';
          } else {
            extraStyle += 'opacity:.55;';
          }
        }
        var disabledAttr = isAnswered ? ' disabled' : '';
        return '<button class="' + cls + '" style="' + extraStyle + '"' +
          ' data-q="' + qi + '" data-o="' + oi + '"' + disabledAttr + '>' +
          prefix + utmLearnEsc(opt) + '</button>';
      }).join('');

      // 해설(응답 후에만)
      var explain = '';
      if (isAnswered) {
        var ok = chosen === item.correct;
        explain = '<div class="callout ' + (ok ? 'ok' : 'danger') + '" style="margin-top:4px">' +
          '<span class="c-ico">' + (ok ? '🎉' : '📝') + '</span>' +
          '<div><b>' + (ok ? '정답입니다!' : '아쉬워요.') + '</b> ' + item.why + '</div></div>';
      }

      return '' +
        '<div style="margin-bottom:20px;padding-bottom:20px;' + (qi < UTM_LEARN_QUIZ.length - 1 ? 'border-bottom:1px solid var(--border);' : '') + '">' +
          '<div style="font-size:13.5px;font-weight:800;color:var(--text-primary);margin-bottom:11px">Q' + (qi + 1) + '. ' + item.q + '</div>' +
          optsHtml +
          explain +
        '</div>';
    }).join('');

    // 진행/점수 요약
    var doneCount = utmLearnAnswered.filter(function (a) { return a >= 0; }).length;
    var scoreCount = UTM_LEARN_QUIZ.reduce(function (acc, item, i) {
      return acc + (utmLearnAnswered[i] === item.correct ? 1 : 0);
    }, 0);
    var allDone = doneCount === UTM_LEARN_QUIZ.length;

    var scoreHtml;
    if (allDone) {
      var pct = Math.round((scoreCount / UTM_LEARN_QUIZ.length) * 100);
      var verdict = scoreCount === 5 ? '🏆 완벽해요! UTM 마스터' :
                    scoreCount >= 3 ? '👍 좋아요! 거의 다 왔어요' :
                                      '💪 다시 한 번 복습해봐요';
      var mcls = scoreCount >= 3 ? 'good' : 'bad';
      scoreHtml = '' +
        '<div class="metric ' + mcls + '" style="text-align:center;margin-bottom:14px">' +
          '<div class="m-label" style="justify-content:center">최종 점수</div>' +
          '<div class="m-value">' + scoreCount + '<span class="unit"> / 5</span></div>' +
          '<div class="m-sub">정답률 ' + pct + '% · ' + verdict + '</div>' +
        '</div>';
    } else {
      scoreHtml = '<div class="field-hint" style="margin-bottom:14px;text-align:center">진행 ' + doneCount + ' / ' + UTM_LEARN_QUIZ.length + ' 문항</div>';
    }

    var resetBtn = doneCount > 0
      ? '<div class="btn-row" style="justify-content:center"><button id="utmLearnReset" class="btn btn-ghost">🔄 다시 풀기</button></div>'
      : '';

    area.innerHTML = scoreHtml + blocks + resetBtn;

    // 이벤트 연결(컨테이너 내부 querySelector)
    var optBtns = area.querySelectorAll('button[data-q]');
    Array.prototype.forEach.call(optBtns, function (b) {
      b.addEventListener('click', function () {
        var qi = parseInt(b.getAttribute('data-q'), 10);
        var oi = parseInt(b.getAttribute('data-o'), 10);
        if (isNaN(qi) || isNaN(oi)) return;
        if (utmLearnAnswered[qi] >= 0) return; // 이미 응답한 문항은 잠금
        utmLearnAnswered[qi] = oi;
        utmLearnRenderQuiz(area); // 상태 반영해 재렌더
      });
    });

    var resetEl = area.querySelector('#utmLearnReset');
    if (resetEl) {
      resetEl.addEventListener('click', function () {
        utmLearnResetState();
        utmLearnRenderQuiz(area);
        // 퀴즈 영역 상단으로 부드럽게
        if (area.scrollIntoView) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  // ── 진입점 ───────────────────────────────────────────────
  function renderUtmLearn() {
    var el = document.getElementById('page-utm-learn');
    if (!el) return;

    // 재호출 안전: 상태 초기화 후 전체 재구성
    utmLearnResetState();
    el.innerHTML = utmLearnBuildHTML();

    // 실전 예시 복사 버튼 연결
    var copyBtns = el.querySelectorAll('button[data-utm-copy]');
    Array.prototype.forEach.call(copyBtns, function (b) {
      b.addEventListener('click', function () {
        var idx = parseInt(b.getAttribute('data-utm-copy'), 10);
        if (isNaN(idx) || !UTM_LEARN_EXAMPLES[idx]) return;
        if (typeof copyToClipboard === 'function') {
          copyToClipboard(UTM_LEARN_EXAMPLES[idx].url, b);
        }
      });
    });

    // CTA: UTM 빌더로 이동(전역 showPage 존재)
    var goBtn = el.querySelector('#utmLearnGoBuilder');
    if (goBtn) {
      goBtn.addEventListener('click', function () {
        if (typeof showPage === 'function') showPage('tool-utm', null);
      });
    }

    // CTA: 용어 사전으로 이동(공통 연계 버튼)
    var glossaryBtn = el.querySelector('#utmLearnGlossary');
    if (glossaryBtn) {
      glossaryBtn.addEventListener('click', function () {
        if (typeof showPage === 'function') showPage('glossary');
      });
    }

    // 퀴즈 렌더
    utmLearnRenderQuiz(el.querySelector('#utmLearnQuizArea'));
  }

  // 진입점만 전역 노출
  window.renderUtmLearn = renderUtmLearn;
})();
