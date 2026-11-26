// ============================================================
// app-learn.js — 학습 페이지 "앱 마케팅 완전정복"
// 진입점: window.renderAppLearn()  →  컨테이너 #page-app-learn 에 렌더
// 처음 배우는 인턴용. 웹과 다른 점 · 측정 흐름 · 기여 판정 · 자체 집계 매체 ·
// 포스트백 · 딥링크 · 리타겟팅 · KPI · 링크 조립 실습 · 체크리스트 · 미니퀴즈.
// utm-learn.js 와 같은 규칙: 외부 라이브러리/네트워크 없음, IIFE, 진입점만 window 에 노출.
//
// 수치의 기준(2026-11 확인): AppsFlyer 고객센터 문서의 기본값이다. 계정 설정과 매체마다
// 달라질 수 있어 화면에도 "실제 값은 대시보드에서 확인"이라고 적는다. 광고주 자료는 싣지 않는다 —
// 예시 주소·이름은 모두 지어낸 값(example)이다.
// ============================================================
(function () {
  'use strict';

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── 퀴즈 ────────────────────────────────────────────────
  var QUIZ = [
    {
      q: '웹 광고에서 쓰던 UTM만으로 앱 설치 성과를 매체별로 나누기 어려운 가장 큰 이유는?',
      opts: [
        '앱에는 URL이라는 개념이 아예 없어서',
        '클릭과 첫 실행 사이에 앱스토어가 끼어 링크에 붙인 정보가 이어지지 않아서',
        'UTM은 유료 기능이라서',
        '앱 광고는 클릭이 발생하지 않아서'
      ],
      correct: 1,
      why: '광고를 누르면 스토어로 갔다가 설치 후 앱이 열립니다. 이 사이에서 <b>링크에 붙인 값이 끊기기</b> 때문에, 앱 안의 SDK와 MMP가 클릭과 첫 실행을 다시 이어 붙여 줍니다.'
    },
    {
      q: '한 사용자가 3일 전에 A 매체 광고를 <b>클릭</b>했고, 2시간 전에 B 매체 광고를 <b>보기만</b> 한 뒤 앱을 설치했습니다. 기본 설정이라면 설치는 어디로 잡힐까요?',
      opts: ['B 매체 (가장 최근 접점이라서)', 'A 매체 (클릭이 조회보다 우선이라서)', '두 매체에 0.5건씩', '오가닉'],
      correct: 1,
      why: '클릭 룩백 기간(기본 7일) 안에 클릭이 있으면 <b>클릭이 조회보다 우선</b>합니다. B 매체의 조회는 기여 보조(어시스트)로만 남습니다.'
    },
    {
      q: '포스트백(postback)은 어느 방향으로 가는 신호일까요?',
      opts: ['광고 매체 → 사용자', '앱스토어 → 광고주', 'MMP → 광고 매체', '사용자 → MMP'],
      correct: 2,
      why: 'MMP가 "이 설치·구매는 당신 매체 것"이라고 <b>매체에 돌려보내는 신호</b>입니다. 매체는 이 신호로 자동입찰을 학습하고 타겟을 만듭니다.'
    },
    {
      q: '구글·메타 같은 자체 집계 매체(SRN)의 설치 수가 MMP 숫자와 다르게 보이는 이유로 <b>알맞지 않은</b> 것은?',
      opts: [
        '매체와 MMP의 룩백 기간이 서로 달라서',
        '매체는 자기 접점만 보고, MMP는 여러 매체 중 한 곳에만 설치를 주기 때문에',
        '기기 ID 사용에 동의하지 않은 iOS 사용자가 있어서',
        'MMP는 설치를 아예 세지 않기 때문에'
      ],
      correct: 3,
      why: 'MMP는 설치를 셉니다. 숫자가 다른 것은 <b>기준이 달라서</b>입니다. 그래서 리포트에는 "어느 화면의 숫자인지"를 항상 적습니다.'
    },
    {
      q: '앱이 <b>설치돼 있는</b> 휴면 사용자가 리타겟팅 광고를 눌러 앱을 다시 열었습니다. 이 전환의 이름은?',
      opts: ['리어트리뷰션', '리인게이지먼트', '신규 설치', '디퍼드 딥링크'],
      correct: 1,
      why: '앱이 남아 있는 상태에서 다시 여는 것은 <b>리인게이지먼트</b>, 앱을 지웠다가 리타겟팅 광고로 다시 설치하는 것은 <b>리어트리뷰션</b>입니다.'
    },
    {
      q: '앱이 없는 사용자가 "여름 기획전" 광고를 눌렀을 때, 설치 후 첫 실행에서 바로 그 기획전 화면이 열리게 하는 기능은?',
      opts: ['포스트백', '디퍼드 딥링크', '룩백 윈도우', '뷰스루'],
      correct: 1,
      why: '<b>디퍼드(지연된) 딥링크</b>입니다. 설치 때문에 한 번 미뤄졌다가, 첫 실행에서 원래 가려던 화면으로 보내 줍니다.'
    }
  ];
  var answered = [];
  function resetQuiz() { answered = QUIZ.map(function () { return -1; }); }

  // ── 내용 데이터 ─────────────────────────────────────────
  var FLOW = [
    { n: '1', t: '광고 접점', d: '사용자가 광고를 보거나 누릅니다. 이때 "어느 매체 · 캠페인 · 소재"인지가 측정 링크 또는 매체의 기록으로 남습니다.' },
    { n: '2', t: '스토어 · 설치', d: '앱이 없으면 앱스토어로 갑니다. 여기서 링크에 붙인 값이 끊깁니다 — 웹과 가장 다른 지점입니다.' },
    { n: '3', t: '첫 실행', d: '앱 안의 MMP SDK가 "방금 이 기기에서 앱이 처음 열렸다"고 MMP에 알립니다.' },
    { n: '4', t: '기여 판정', d: 'MMP가 그 기기의 최근 접점을 찾아, 규칙(룩백 기간 · 클릭 우선)에 따라 한 매체를 정합니다. 접점이 없으면 오가닉입니다.' },
    { n: '5', t: '포스트백', d: 'MMP가 결과를 그 매체에 돌려보냅니다. 이후 가입 · 구매 같은 인앱 이벤트도 같은 길로 전달됩니다.' }
  ];

  var RULES = [
    ['클릭 룩백 기간', '기본 7일', '1~30일 사이에서 설정', '클릭한 뒤 이 기간 안에 설치해야 그 클릭의 성과로 봅니다.'],
    ['조회(뷰스루) 룩백 기간', '기본 1일(24시간)', '1~24시간 사이에서 설정', '보기만 하고 누르지 않은 광고의 기여를 인정하는 기간입니다.'],
    ['클릭과 조회가 함께 있을 때', '클릭 우선', '—', '클릭 룩백 안에 클릭이 있으면 가장 최근 클릭이 가져갑니다. 조회는 어시스트로 남습니다.'],
    ['클릭이 여러 번일 때', '마지막 클릭', '—', '기본은 설치 직전의 마지막 클릭 한 곳(라스트 터치)입니다.']
  ];

  var PARAMS = [
    { key: 'pid', req: true, q: '어느 매체?', desc: '미디어 소스. 유일한 필수값이며, 연동 파트너는 정해진 값을 그대로 씁니다(임의로 바꾸지 않음).' },
    { key: 'c', req: false, q: '어느 캠페인?', desc: '캠페인 이름. 팀 네이밍 규칙을 그대로 적용합니다.' },
    { key: 'af_adset', req: false, q: '어느 광고그룹?', desc: '캠페인과 소재 사이의 중간 단계 이름입니다.' },
    { key: 'af_ad', req: false, q: '어느 소재?', desc: '소재 이름. 소재끼리 성과를 비교할 때 씁니다.' },
    { key: 'deep_link_value', req: false, q: '앱 안 어디로?', desc: '앱 안에서 열 화면의 이름. 무엇을 여는지는 앱 개발 쪽에서 값마다 정해 둡니다.' },
    { key: 'af_dp', req: false, q: '예비 경로', desc: '앱을 여는 URI 스킴. 기본 방식이 안 될 때의 예비이며, 딥링크 용도로는 deep_link_value 가 권장됩니다.' },
    { key: 'af_web_dp', req: false, q: 'PC에서는?', desc: '데스크톱에서 눌렀을 때 보낼 웹 주소입니다.' },
    { key: 'is_retargeting', req: false, q: '리타겟팅?', desc: '리타겟팅 캠페인이면 true. 빠지면 신규 유입 캠페인으로 처리됩니다.' }
  ];

  var CHECKS = [
    '광고주가 쓰는 MMP가 무엇인지, 우리 계정 권한이 있는지 확인했다',
    '이 매체가 측정 링크를 쓰는 매체인지, 자체 집계 매체(SRN)인지 구분했다',
    '캠페인 · 광고그룹 · 소재 이름을 네이밍 규칙대로 먼저 정했다',
    'pid 는 대시보드의 파트너 설정에서 복사했다(직접 지어 쓰지 않았다)',
    '주소 안에 넣는 주소는 URL 인코딩을 했다',
    '리타겟팅 캠페인 링크에 is_retargeting=true 를 넣었다',
    '앱이 깔린 기기와 없는 기기에서 각각 눌러 도착 화면을 확인했다',
    '테스트 설치가 MMP 화면에 내가 정한 이름으로 잡히는지 확인했다',
    '룩백 기간 설정값을 확인하고 리포트에 기준을 적었다',
    '매체 화면과 MMP 화면의 숫자 중 어느 쪽을 보고 기준으로 삼을지 팀과 맞췄다'
  ];

  var SOURCES = [
    ['AppsFlyer 기여 모델', 'https://support.appsflyer.com/hc/en-us/articles/207447053-AppsFlyer-attribution-model'],
    ['룩백 기간 설정', 'https://support.appsflyer.com/hc/en-us/articles/208338403-Set-up-lookback-windows'],
    ['링크 구조와 파라미터', 'https://support.appsflyer.com/hc/en-us/articles/207447163-About-link-structure-and-parameters'],
    ['자체 집계 매체(SRN)', 'https://support.appsflyer.com/hc/en-us/articles/360001546905-Self-reporting-networks-SRNs'],
    ['리타겟팅 기여 가이드', 'https://support.appsflyer.com/hc/en-us/articles/207033786-Retargeting-attribution-guide'],
    ['리어트리뷰션 기간 설정', 'https://support.appsflyer.com/hc/en-us/articles/115002587066-Set-up-re-attribution-window'],
    ['OneLink 로 딥링크 · 리디렉션 링크 만들기', 'https://support.appsflyer.com/hc/en-us/articles/208874366-Create-deep-linking-and-redirection-links-for-your-campaigns-with-OneLink']
  ];

  // ── 링크 조립 실습 ──────────────────────────────────────
  var BUILDER_FIELDS = [
    { id: 'base', label: 'OneLink 기본 주소', ph: 'https://example.onelink.me/AbCd', val: 'https://example.onelink.me/AbCd', hint: 'MMP 대시보드에서 만든 주소. 여기서는 예시값입니다.' },
    { id: 'pid', label: 'pid · 매체', ph: 'examplead_int', val: 'examplead_int', hint: '실무에서는 대시보드의 파트너 값을 복사합니다.' },
    { id: 'c', label: 'c · 캠페인', ph: '2611_aos_ua_install', val: '2611_aos_ua_install', hint: '' },
    { id: 'af_adset', label: 'af_adset · 광고그룹', ph: 'benefit_new', val: 'benefit_new', hint: '' },
    { id: 'af_ad', label: 'af_ad · 소재', ph: 'image_coupon_01', val: 'image_coupon_01', hint: '' },
    { id: 'deep_link_value', label: 'deep_link_value · 앱 안 목적지', ph: 'summer_event', val: 'summer_event', hint: '앱 개발 쪽과 약속한 값.' },
    { id: 'af_web_dp', label: 'af_web_dp · PC용 웹 주소', ph: 'https://www.example.com/event?id=10&tab=new', val: 'https://www.example.com/event?id=10&tab=new', hint: '주소 안의 주소 — 자동으로 인코딩됩니다.' }
  ];

  function buildLink(v) {
    var warns = [];
    var base = (v.base || '').trim();
    if (!base) return { url: '', parts: [], warns: ['OneLink 기본 주소를 넣어 주세요.'] };
    if (!/^https:\/\//i.test(base)) warns.push('기본 주소는 https:// 로 시작해야 합니다.');
    if (base.indexOf('?') > -1) warns.push('기본 주소에 이미 ? 가 있습니다. 파라미터는 아래 칸에 나눠 적으세요.');
    if (!(v.pid || '').trim()) warns.push('pid(매체)는 필수입니다. 비어 있으면 어느 매체 성과인지 알 수 없습니다.');
    var parts = [];
    ['pid', 'c', 'af_adset', 'af_ad', 'deep_link_value', 'af_web_dp'].forEach(function (k) {
      var raw = (v[k] || '').trim();
      if (!raw) return;
      if (k !== 'af_web_dp') {
        if (/\s/.test(raw)) warns.push(k + ' 값에 띄어쓰기가 있습니다. 언더스코어(_)로 이으세요.');
        if (/[A-Z]/.test(raw)) warns.push(k + ' 값에 대문자가 있습니다. 소문자로 통일하면 집계가 쪼개지지 않습니다.');
        if (/[^\x00-\x7F]/.test(raw)) warns.push(k + ' 값에 한글이 있습니다. 영문 슬러그를 권장합니다.');
      } else if (!/^https?:\/\//i.test(raw)) {
        warns.push('af_web_dp 는 http(s):// 로 시작하는 전체 주소여야 합니다.');
      }
      parts.push({ k: k, raw: raw, enc: encodeURIComponent(raw) });
    });
    if (v.retarget) parts.push({ k: 'is_retargeting', raw: 'true', enc: 'true' });
    var url = base + (parts.length ? '?' + parts.map(function (p) { return p.k + '=' + p.enc; }).join('&') : '');
    return { url: url, parts: parts, warns: warns };
  }

  function renderBuilderOut(root) {
    var v = { retarget: !!root.querySelector('#appLearnRt').checked };
    BUILDER_FIELDS.forEach(function (f) { v[f.id] = root.querySelector('#appLearnF_' + f.id).value; });
    var r = buildLink(v);
    var out = root.querySelector('#appLearnOut');
    var rows = r.parts.map(function (p) {
      var changed = p.raw !== p.enc;
      return '<tr><td><code>' + esc(p.k) + '</code></td><td style="word-break:break-all">' + esc(p.raw) + '</td>' +
        '<td style="word-break:break-all">' + (changed ? '<code>' + esc(p.enc) + '</code>' : '<span style="color:var(--text-muted)">그대로</span>') + '</td></tr>';
    }).join('');
    var warnHtml = r.warns.map(function (w) {
      return '<div class="callout warn" style="margin-top:8px"><span class="c-ico">⚠️</span><div>' + esc(w) + '</div></div>';
    }).join('');
    out.innerHTML =
      '<div class="field-hint" style="margin-bottom:6px">완성된 링크</div>' +
      '<div class="codebox" id="appLearnUrl" style="word-break:break-all">' + (r.url ? esc(r.url) : '—') + '</div>' +
      '<div class="btn-row" style="margin-top:10px"><button id="appLearnCopy" class="btn btn-primary btn-sm"' + (r.url ? '' : ' disabled') + '>링크 복사</button>' +
      '<span id="appLearnCopied" class="field-hint" style="align-self:center"></span></div>' +
      warnHtml +
      (rows ? '<div class="table-scroll" style="margin-top:14px"><table class="t-table"><thead><tr><th>파라미터</th><th>넣은 값</th><th>주소에 들어간 모양</th></tr></thead><tbody>' + rows + '</tbody></table></div>' : '');
    var btn = out.querySelector('#appLearnCopy');
    if (btn) btn.addEventListener('click', function () {
      var done = function () { var m = out.querySelector('#appLearnCopied'); if (m) m.textContent = '복사했습니다'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(r.url).then(done, function () {});
      else { var ta = document.createElement('textarea'); ta.value = r.url; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (_) {} document.body.removeChild(ta); }
    });
  }

  // ── 화면 ────────────────────────────────────────────────
  function panel(ico, title, sub, body) {
    return '<div class="panel"><div class="panel-head"><span class="ico">' + ico + '</span><div><div class="panel-title">' + title + '</div>' +
      (sub ? '<div class="panel-sub">' + sub + '</div>' : '') + '</div></div>' + body + '</div>';
  }

  function buildHTML() {
    var compare =
      '<div class="result-grid c2">' +
        '<div class="metric"><div class="m-label">🌐 웹</div><div class="m-sub" style="font-size:12.5px;line-height:1.7;color:var(--text-secondary)">' +
          '광고 클릭 → <b>바로 페이지</b>가 열립니다.<br>링크에 붙인 UTM이 그대로 따라와 분석 도구가 읽습니다.<br>측정 도구: 픽셀 · 태그 · GA4' +
        '</div></div>' +
        '<div class="metric primary"><div class="m-label">📱 앱</div><div class="m-sub" style="font-size:12.5px;line-height:1.7;color:var(--text-secondary)">' +
          '광고 클릭 → <b>스토어 → 설치 → 첫 실행</b>.<br>중간에 링크의 값이 끊겨 따로 이어 붙여야 합니다.<br>측정 도구: 앱 안의 SDK + MMP' +
        '</div></div>' +
      '</div>' +
      '<div class="callout info" style="margin-top:14px"><span class="c-ico">🧾</span><div><b>MMP = 영수증을 대조해 주는 제3자</b>라고 생각하세요. 매체마다 "내 광고 덕분"이라고 말할 때, 같은 기준으로 한 곳만 골라 줍니다. 앱스플라이어 · 애드저스트 · 에어브릿지가 대표적입니다.</div></div>';

    var flow = '<ol style="list-style:none;padding:0;margin:0;display:grid;gap:10px">' + FLOW.map(function (s) {
      return '<li style="display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:start">' +
        '<span style="display:inline-flex;width:30px;height:30px;border-radius:50%;background:var(--primary-soft);color:var(--primary);font-weight:800;align-items:center;justify-content:center;font-size:13px">' + s.n + '</span>' +
        '<div><div style="font-weight:800;font-size:13.5px;color:var(--text-primary)">' + s.t + '</div>' +
        '<div style="font-size:12.5px;line-height:1.7;color:var(--text-secondary)">' + s.d + '</div></div></li>';
    }).join('') + '</ol>';

    var rules = '<div class="table-scroll"><table class="t-table" style="min-width:620px"><thead><tr><th>규칙</th><th>기본값</th><th>바꿀 수 있는 범위</th><th>뜻</th></tr></thead><tbody>' +
      RULES.map(function (r) { return '<tr><td><b>' + r[0] + '</b></td><td>' + r[1] + '</td><td>' + r[2] + '</td><td>' + r[3] + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<div class="callout warn" style="margin-top:14px"><span class="c-ico">⚠️</span><div>위 값은 <b>AppsFlyer의 기본값</b>(측정 링크를 쓰는 매체 기준)입니다. 계정 설정으로 바꿀 수 있고, 자체 집계 매체는 기본값이 따로 있습니다(예: 구글 클릭 30일 · 메타 클릭 7일). <b>실제 값은 대시보드에서 확인하고 리포트에 적으세요.</b></div></div>' +
      '<div class="callout info" style="margin-top:8px"><span class="c-ico">💡</span><div><b>룩백 기간을 길게 잡으면</b> 광고 성과로 잡히는 설치가 늘고 오가닉이 줄어 보입니다. 숫자가 좋아졌다는 말을 들으면 기간 설정이 바뀌지 않았는지부터 확인하세요.</div></div>';

    var srn =
      '<div class="result-grid c2">' +
        '<div class="metric"><div class="m-label">🔗 측정 링크를 쓰는 매체</div><div class="m-sub" style="font-size:12.5px;line-height:1.7;color:var(--text-secondary)">' +
          '광고의 도착 주소에 <b>MMP 측정 링크</b>를 넣습니다.<br>클릭이 MMP를 거쳐 가므로 MMP가 접점을 직접 기록합니다.<br>링크의 파라미터로 캠페인 · 소재 이름을 넘깁니다.' +
        '</div></div>' +
        '<div class="metric primary"><div class="m-label">🏛️ 자체 집계 매체 (SRN · SAN)</div><div class="m-sub" style="font-size:12.5px;line-height:1.7;color:var(--text-secondary)">' +
          '메타 · 구글 · 애플 서치애즈처럼 <b>측정 링크를 쓰지 않는</b> 매체입니다.<br>앱이 처음 열리면 MMP가 광고 ID로 매체에 "이 기기에 접점이 있었나"를 묻고, 매체가 답합니다.<br>넘어오는 항목이 정해져 있어 링크에 값을 덧붙일 수 없습니다.' +
        '</div></div>' +
      '</div>' +
      '<div class="field-hint" style="margin:16px 0 8px;font-weight:700;color:var(--text-secondary)">그래서 매체 화면과 MMP 화면의 숫자가 다릅니다:</div>' +
      '<ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.9;color:var(--text-secondary)">' +
        '<li><b>기간이 다릅니다.</b> 매체와 MMP의 룩백 기간 설정이 서로 다를 수 있습니다.</li>' +
        '<li><b>보는 범위가 다릅니다.</b> 매체는 자기 광고의 접점만 보고, MMP는 여러 매체 가운데 한 곳에만 설치를 줍니다.</li>' +
        '<li><b>기기 ID가 없는 사용자가 있습니다.</b> iOS에서 추적에 동의하지 않은 사용자는 기기 단위로 맞춰 볼 수 없습니다.</li>' +
      '</ul>' +
      '<div class="callout ok" style="margin-top:12px"><span class="c-ico">✅</span><div>둘 중 하나가 "틀린" 것이 아닙니다. <b>어느 화면의 숫자를 기준으로 보고할지</b>를 먼저 정하고, 리포트에 그 기준을 적는 것이 실무입니다.</div></div>';

    var postback =
      '<div class="callout info"><span class="c-ico">📮</span><div><b>포스트백 = MMP가 매체에 보내는 성과 통지서.</b> 방향은 항상 <b>MMP → 매체</b>입니다.</div></div>' +
      '<div class="result-grid c3" style="margin-top:14px">' +
        '<div class="metric"><div class="m-label">🤖 자동입찰 학습</div><div class="m-sub" style="font-size:12px;line-height:1.6;color:var(--text-secondary)">매체는 돌아온 설치 · 구매 신호로 "어떤 사람이 전환하는지"를 배웁니다.</div></div>' +
        '<div class="metric"><div class="m-label">🎯 타겟 만들기</div><div class="m-sub" style="font-size:12px;line-height:1.6;color:var(--text-secondary)">이미 설치한 사람을 빼거나, 장바구니만 담은 사람을 다시 부를 때 씁니다.</div></div>' +
        '<div class="metric"><div class="m-label">🧾 성과 맞춰 보기</div><div class="m-sub" style="font-size:12px;line-height:1.6;color:var(--text-secondary)">매체 화면에도 MMP가 판정한 전환이 보여 서로 대조할 수 있습니다.</div></div>' +
      '</div>' +
      '<div class="callout warn" style="margin-top:14px"><span class="c-ico">⚠️</span><div>포스트백에 넣을 이벤트(가입 · 구매 등)가 빠지면 매체는 설치까지만 보고 최적화합니다. <b>"설치는 많은데 구매가 없다"</b>면 구매 이벤트가 매체로 전달되고 있는지부터 확인하세요.</div></div>';

    var deeplink =
      '<div class="result-grid c3">' +
        '<div class="metric"><div class="m-label">🚪 딥링크</div><div class="m-sub" style="font-size:12px;line-height:1.6;color:var(--text-secondary)">앱 첫 화면이 아니라 <b>앱 안의 특정 화면</b>으로 바로 보내는 링크.</div></div>' +
        '<div class="metric"><div class="m-label">⏳ 디퍼드 딥링크</div><div class="m-sub" style="font-size:12px;line-height:1.6;color:var(--text-secondary)">앱이 없어 <b>설치를 거친 뒤</b>, 첫 실행에서 원래 가려던 화면을 열어 주는 것.</div></div>' +
        '<div class="metric primary"><div class="m-label">🔀 OneLink</div><div class="m-sub" style="font-size:12px;line-height:1.6;color:var(--text-secondary)">AppsFlyer의 링크. <b>링크 하나</b>가 기기와 설치 여부를 보고 갈 길을 나눕니다.</div></div>' +
      '</div>' +
      '<div class="field-hint" style="margin:16px 0 8px;font-weight:700;color:var(--text-secondary)">같은 링크를 눌러도 길이 갈립니다:</div>' +
      '<div class="table-scroll"><table class="t-table"><thead><tr><th>누른 사람</th><th>일어나는 일</th></tr></thead><tbody>' +
        '<tr><td><b>앱이 깔려 있음</b></td><td>앱이 바로 열리고 지정한 화면으로 갑니다(딥링크).</td></tr>' +
        '<tr><td><b>앱이 없음</b></td><td>스토어로 이동 → 설치 → 첫 실행에서 지정한 화면이 열립니다(디퍼드 딥링크).</td></tr>' +
        '<tr><td><b>PC에서 누름</b></td><td>따로 정해 둔 웹 주소로 보냅니다.</td></tr>' +
      '</tbody></table></div>' +
      '<div class="field-hint" style="margin:18px 0 8px;font-weight:700;color:var(--text-secondary)">링크에 붙는 주요 파라미터:</div>' +
      '<div class="result-grid c2">' + PARAMS.map(function (p) {
        return '<div class="metric' + (p.req ? ' primary' : '') + '"><div class="m-label"><code>' + p.key + '</code> ' +
          (p.req ? '<span style="margin-left:6px;font-size:10px;font-weight:700;color:var(--danger)">필수</span>' : '<span style="margin-left:6px;font-size:10px;font-weight:600;color:var(--text-muted)">선택</span>') + '</div>' +
          '<div style="font-size:12.5px;font-weight:800;color:var(--text-primary);margin:4px 0 2px">' + p.q + '</div>' +
          '<div class="m-sub" style="font-size:12px;line-height:1.6;color:var(--text-secondary)">' + p.desc + '</div></div>';
      }).join('') + '</div>' +
      '<div class="callout info" style="margin-top:14px"><span class="c-ico">🧩</span><div><b>UTM과 같이 쓰는 이유:</b> <code>pid</code> · <code>c</code>는 MMP(앱 성과)가 읽고, <code>utm_source</code> · <code>utm_campaign</code>은 GA4(웹 성과)가 읽습니다. 같은 캠페인이면 <b>두 쪽의 이름을 같게</b> 맞춰야 나중에 표를 합칠 수 있습니다.</div></div>';

    var builder =
      '<div class="callout info"><span class="c-ico">🛠️</span><div>값을 바꿔 보며 <b>링크가 어떻게 조립되는지</b> 익히는 연습용입니다. 실제 OneLink는 MMP 대시보드에서 만들고, <code>pid</code>는 거기서 복사합니다. 아래 값은 모두 지어낸 예시입니다.</div></div>' +
      '<div class="form-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-top:14px">' +
        BUILDER_FIELDS.map(function (f) {
          return '<div class="field" style="margin-bottom:0"><label for="appLearnF_' + f.id + '">' + f.label + '</label>' +
            '<input class="input" id="appLearnF_' + f.id + '" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(f.ph) + '" value="' + esc(f.val) + '">' +
            (f.hint ? '<div class="field-hint">' + f.hint + '</div>' : '') + '</div>';
        }).join('') +
      '</div>' +
      '<label style="display:flex;gap:8px;align-items:center;margin-top:12px;font-size:13px;color:var(--text-secondary)"><input type="checkbox" id="appLearnRt"> 리타겟팅 캠페인입니다 (<code>is_retargeting=true</code> 추가)</label>' +
      '<div id="appLearnOut" style="margin-top:16px"></div>' +
      '<div class="callout ok" style="margin-top:14px"><span class="c-ico">🔎</span><div><b>눈여겨볼 것:</b> PC용 웹 주소 안의 <code>?</code> <code>&amp;</code> <code>=</code> <code>/</code> 가 <code>%3F</code> <code>%26</code> <code>%3D</code> <code>%2F</code> 로 바뀝니다. 인코딩하지 않으면 안쪽 주소의 <code>&amp;tab=new</code>가 바깥 링크의 파라미터로 잘못 읽힙니다 — 주소 안에 주소를 넣을 때 가장 흔한 사고입니다.</div></div>';

    var retarget =
      '<div class="table-scroll"><table class="t-table" style="min-width:680px"><thead><tr><th>이름</th><th>앱 상태</th><th>일어난 일</th><th>기간(AppsFlyer 기본값)</th></tr></thead><tbody>' +
        '<tr><td><b>리인게이지먼트</b></td><td>설치돼 있음</td><td>리타겟팅 광고를 눌러 앱을 다시 엶</td><td>리인게이지먼트 기간 30일(1~90일 또는 무기한으로 설정). 이 기간의 인앱 이벤트가 리타겟팅 매체 성과로도 잡힙니다.</td></tr>' +
        '<tr><td><b>리어트리뷰션</b></td><td>지웠다가 다시 설치</td><td>리타겟팅 광고를 거쳐 재설치</td><td>리어트리뷰션 기간 90일(1~24개월로 설정). 첫 설치 뒤 이 기간 안의 재설치는 <b>신규 설치로 세지 않습니다.</b></td></tr>' +
      '</tbody></table></div>' +
      '<div class="callout warn" style="margin-top:14px"><span class="c-ico">⚠️</span><div>리타겟팅 캠페인의 링크에는 <code>is_retargeting=true</code>가 있어야 합니다. 빠지면 신규 유입 캠페인으로 처리돼 <b>성과가 엉뚱한 표에 들어갑니다.</b></div></div>' +
      '<div class="callout info" style="margin-top:8px"><span class="c-ico">💡</span><div>"신규 설치가 줄었다"는 보고를 받으면, 재설치가 리어트리뷰션 기간에 걸려 신규로 안 잡힌 것은 아닌지 함께 보세요.</div></div>';

    var kpi =
      '<div class="result-grid c2">' +
        '<div class="metric"><div class="m-label">① 설치 단계</div><div class="m-sub" style="font-size:12.5px;line-height:1.7;color:var(--text-secondary)"><b>CPI</b> = 광고비 ÷ 설치 수<br>설치 전환율 = 설치 ÷ 클릭</div></div>' +
        '<div class="metric"><div class="m-label">② 첫 행동 단계</div><div class="m-sub" style="font-size:12.5px;line-height:1.7;color:var(--text-secondary)">가입 · 첫 구매 전환율 = 해당 이벤트 ÷ 설치<br><b>CPA</b> = 광고비 ÷ 해당 이벤트 수</div></div>' +
        '<div class="metric"><div class="m-label">③ 남는 단계</div><div class="m-sub" style="font-size:12.5px;line-height:1.7;color:var(--text-secondary)"><b>리텐션</b> = 설치 N일 뒤 다시 연 사람 ÷ 설치한 사람<br>D1 · D7 · D30 처럼 날짜를 붙여 씁니다.</div></div>' +
        '<div class="metric primary"><div class="m-label">④ 돈이 되는 단계</div><div class="m-sub" style="font-size:12.5px;line-height:1.7;color:var(--text-secondary)"><b>ROAS</b> = 인앱 매출 ÷ 광고비<br><b>LTV</b> = 한 사용자가 남기는 누적 매출</div></div>' +
      '</div>' +
      '<div class="callout danger" style="margin-top:14px"><span class="c-ico">🚨</span><div><b>CPI가 싼 캠페인이 좋은 캠페인은 아닙니다.</b> 설치만 하고 다시 열지 않는 사용자가 많으면 CPI는 낮아도 CPA · ROAS는 나빠집니다. 설치 단가는 <b>그 뒤 단계의 숫자와 함께</b> 보고하세요.</div></div>';

    var checklist = '<ul id="appLearnChecks" style="list-style:none;padding:0;margin:0;display:grid;gap:6px">' + CHECKS.map(function (c, i) {
      return '<li><label style="display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.6;color:var(--text-secondary);cursor:pointer">' +
        '<input type="checkbox" data-check="' + i + '" style="margin-top:3px"><span>' + c + '</span></label></li>';
    }).join('') + '</ul><div id="appLearnCheckMsg" class="field-hint" style="margin-top:10px"></div>';

    var sources = '<ul style="margin:0;padding-left:18px;font-size:12.5px;line-height:1.9">' + SOURCES.map(function (s) {
      return '<li><a href="' + s[1] + '" target="_blank" rel="noopener noreferrer" style="color:var(--primary);text-decoration:underline">' + s[0] + '</a></li>';
    }).join('') + '</ul>' +
      '<div class="field-hint" style="margin-top:10px">기본값과 범위는 2026년 11월에 위 문서로 확인했습니다. MMP와 매체 정책은 자주 바뀌니, 세팅 전에는 원문과 대시보드를 다시 보세요. 애드저스트 · 에어브릿지는 같은 개념을 다른 이름과 기본값으로 쓰기도 합니다.</div>';

    return '' +
      '<div class="tool-wrap">' +
        '<div class="tool-hero">' +
          '<div class="eyebrow">📘 학습 · 앱 마케팅 기초</div>' +
          '<h1>앱 마케팅 완전정복</h1>' +
          '<p>앱 광고는 클릭과 첫 실행 사이에 스토어가 끼어 있습니다. 그 끊긴 구간을 누가, 어떤 규칙으로 이어 붙이는지 알면 설치 수 · 매체 숫자 · 링크 세팅이 한 번에 이해됩니다.</p>' +
        '</div>' +
        panel('🔀', '웹과 앱은 무엇이 다를까', 'UTM을 배웠다면 여기서 시작', compare) +
        panel('🛰️', '설치 한 건이 잡히기까지', '클릭에서 포스트백까지 5단계', flow) +
        panel('⚖️', '누구의 성과로 볼까', '기여 판정 규칙', rules) +
        panel('🏛️', '매체 숫자와 MMP 숫자가 다른 이유', '측정 링크 매체 vs 자체 집계 매체', srn) +
        panel('📮', '포스트백', '판정 결과를 매체에 돌려보내기', postback) +
        panel('🚪', '딥링크 · 디퍼드 딥링크 · OneLink', '눌렀을 때 어디에 도착하나', deeplink) +
        panel('🛠️', '링크 조립 실습', '값을 바꿔 보며 구조 익히기', builder) +
        panel('🔁', '리타겟팅 — 다시 부르기', '리인게이지먼트와 리어트리뷰션', retarget) +
        panel('📊', '앱 캠페인의 숫자 읽기', '설치에서 매출까지', kpi) +
        panel('✅', '세팅 전 체크리스트', '10가지 — 체크는 이 기기에 저장됩니다', checklist) +
        panel('🧠', '미니 퀴즈', QUIZ.length + '문항 — 보기를 눌러 정답을 확인하세요', '<div id="appLearnQuizArea"></div>') +
        panel('📎', '공식 문서', '더 깊이 볼 때', sources) +
        '<div class="callout info" style="align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;margin-top:20px">' +
          '<div style="display:flex;gap:11px;align-items:center"><span class="c-ico">🚀</span><div>웹 쪽 추적이 아직 헷갈린다면 <b>UTM 완전정복</b>을 먼저, 숫자 계산은 <b>KPI 계산기</b>로 연습하세요.</div></div>' +
          '<div class="btn-row">' +
            '<button id="appLearnGoUtm" class="btn btn-ghost">🎯 UTM 완전정복</button>' +
            '<button id="appLearnGoGloss" class="btn btn-ghost">📖 용어 사전</button>' +
            '<button id="appLearnGoKpi" class="btn btn-primary">KPI 계산기로 이동 →</button>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  // ── 퀴즈 렌더 ───────────────────────────────────────────
  function renderQuiz(area) {
    if (!area) return;
    var blocks = QUIZ.map(function (item, qi) {
      var chosen = answered[qi], done = chosen >= 0;
      var opts = item.opts.map(function (opt, oi) {
        var st = 'justify-content:flex-start;text-align:left;margin-bottom:8px;white-space:normal;line-height:1.5;', pre = '';
        if (done) {
          if (oi === item.correct) { st += 'border-color:var(--ok);background:rgba(104,211,145,.12);color:#BBE9CC;'; pre = '✅ '; }
          else if (oi === chosen) { st += 'border-color:var(--danger);background:rgba(252,129,129,.12);color:#F4C0C0;'; pre = '❌ '; }
          else st += 'opacity:.55;';
        }
        return '<button class="btn btn-ghost btn-block" style="' + st + '" data-q="' + qi + '" data-o="' + oi + '"' + (done ? ' disabled' : '') + '>' + pre + esc(opt) + '</button>';
      }).join('');
      var explain = '';
      if (done) {
        var ok = chosen === item.correct;
        explain = '<div class="callout ' + (ok ? 'ok' : 'danger') + '" style="margin-top:4px"><span class="c-ico">' + (ok ? '🎉' : '📝') + '</span><div><b>' + (ok ? '정답입니다!' : '아쉬워요.') + '</b> ' + item.why + '</div></div>';
      }
      return '<div style="margin-bottom:20px;padding-bottom:20px;' + (qi < QUIZ.length - 1 ? 'border-bottom:1px solid var(--border);' : '') + '">' +
        '<div style="font-size:13.5px;font-weight:800;color:var(--text-primary);margin-bottom:11px">Q' + (qi + 1) + '. ' + item.q + '</div>' + opts + explain + '</div>';
    }).join('');

    var doneCount = answered.filter(function (a) { return a >= 0; }).length;
    var score = QUIZ.reduce(function (acc, it, i) { return acc + (answered[i] === it.correct ? 1 : 0); }, 0);
    var head;
    if (doneCount === QUIZ.length) {
      var pass = score >= Math.ceil(QUIZ.length * 0.6);
      var verdict = score === QUIZ.length ? '🏆 완벽해요! 앱 측정의 뼈대를 잡았어요' : pass ? '👍 좋아요! 틀린 문항의 해설만 다시 보세요' : '💪 위 내용을 한 번 더 읽고 다시 풀어 봐요';
      head = '<div class="metric ' + (pass ? 'good' : 'bad') + '" style="text-align:center;margin-bottom:14px"><div class="m-label" style="justify-content:center">최종 점수</div>' +
        '<div class="m-value">' + score + '<span class="unit"> / ' + QUIZ.length + '</span></div><div class="m-sub">' + verdict + '</div></div>';
    } else {
      head = '<div class="field-hint" style="margin-bottom:14px;text-align:center">진행 ' + doneCount + ' / ' + QUIZ.length + ' 문항</div>';
    }
    var reset = doneCount > 0 ? '<div class="btn-row" style="justify-content:center"><button id="appLearnReset" class="btn btn-ghost">🔄 다시 풀기</button></div>' : '';
    area.innerHTML = head + blocks + reset;

    Array.prototype.forEach.call(area.querySelectorAll('button[data-q]'), function (b) {
      b.addEventListener('click', function () {
        var qi = parseInt(b.getAttribute('data-q'), 10), oi = parseInt(b.getAttribute('data-o'), 10);
        if (isNaN(qi) || isNaN(oi) || answered[qi] >= 0) return;
        answered[qi] = oi;
        renderQuiz(area);
      });
    });
    var r = area.querySelector('#appLearnReset');
    if (r) r.addEventListener('click', function () {
      resetQuiz(); renderQuiz(area);
      if (area.scrollIntoView) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ── 체크리스트 저장(이 기기) ────────────────────────────
  var CHECK_KEY = 'pm_app_learn_checks';
  function loadChecks() { try { return JSON.parse(localStorage.getItem(CHECK_KEY) || '[]'); } catch (_) { return []; } }
  function bindChecks(root) {
    var saved = loadChecks(), msg = root.querySelector('#appLearnCheckMsg');
    var boxes = root.querySelectorAll('#appLearnChecks input[data-check]');
    function paint() {
      var n = Array.prototype.filter.call(boxes, function (b) { return b.checked; }).length;
      if (msg) msg.textContent = n === boxes.length ? '모두 확인했습니다. 세팅을 넘겨도 좋습니다.' : n + ' / ' + boxes.length + ' 확인';
    }
    Array.prototype.forEach.call(boxes, function (b) {
      var i = parseInt(b.getAttribute('data-check'), 10);
      b.checked = saved.indexOf(i) > -1;
      b.addEventListener('change', function () {
        var now = Array.prototype.filter.call(boxes, function (x) { return x.checked; }).map(function (x) { return parseInt(x.getAttribute('data-check'), 10); });
        try { localStorage.setItem(CHECK_KEY, JSON.stringify(now)); } catch (_) {}
        paint();
      });
    });
    paint();
  }

  // ── 진입점 ──────────────────────────────────────────────
  function renderAppLearn() {
    var el = document.getElementById('page-app-learn');
    if (!el) return;
    resetQuiz();
    el.innerHTML = buildHTML();
    renderQuiz(el.querySelector('#appLearnQuizArea'));
    bindChecks(el);

    BUILDER_FIELDS.forEach(function (f) {
      el.querySelector('#appLearnF_' + f.id).addEventListener('input', function () { renderBuilderOut(el); });
    });
    el.querySelector('#appLearnRt').addEventListener('change', function () { renderBuilderOut(el); });
    renderBuilderOut(el);

    var go = function (id, page) {
      var b = el.querySelector(id);
      if (b) b.addEventListener('click', function () { if (window.showPage) window.showPage(page); });
    };
    go('#appLearnGoUtm', 'utm-learn'); go('#appLearnGoGloss', 'glossary'); go('#appLearnGoKpi', 'tool-kpi');
  }

  // 테스트에서 링크 조립 규칙만 따로 검증할 수 있게 노출(node 에서는 window 가 없다)
  if (typeof window !== 'undefined') {
    window.renderAppLearn = renderAppLearn;
    window.AppLearn = { buildLink: buildLink, QUIZ: QUIZ };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildLink: buildLink, QUIZ: QUIZ };
})();
