/* Local-only planning workspace. No client records are sent to the server. */
// ============================================================
// mix-studio.js — 미디어믹스 화면 (계획 편집 / 벤치마크 / 제출본 검수)
// 진입점: window.renderMediamixTool()  (컨테이너 id="page-tool-mediamix")
// 계산·검증·XLSX 는 건드리지 않는다 — mix-engine.js / mix-workbook.js 담당.
// 이 파일은 화면만 그린다.
//
// 디자인: 허브 공용 디자인 시스템(css/tools.css)만 쓴다.
//   .tool-wrap/.tool-hero/.panel/.field/.input/.seg/.btn/.t-table/.metric/.callout
//   예전엔 이 도구만 자체 라이트 테마(mix-studio.css)를 써서 허브 안에서 다른 앱처럼 보였다.
//   새 색·간격이 필요하면 base.css 변수를 쓰고, 정말 없는 것만 mix-studio.css 에 둔다.
// ============================================================
(function () {
  'use strict';
  const E=window.MixEngine, A=window.MixAuto, key='pm_mix_studio_v1';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=(v,d=0)=>v==null||!Number.isFinite(v)?'–':v.toLocaleString('ko-KR',{maximumFractionDigits:d,minimumFractionDigits:d});
  const won=v=>v==null||!Number.isFinite(v)?'–':'₩'+v.toLocaleString('ko-KR',{maximumFractionDigits:0});
  const pct=(v,d=0)=>v==null||!Number.isFinite(v)?'–':n(v,d)+'%';
  const copy=o=>JSON.parse(JSON.stringify(o));
  let db={plan:E.plan(),saved:[],benchmarks:[]}, selected=-1, page='compose', filter='', brand='', mediaFilter='', notice='', recoveryRaw=null;
  let pasteText='', pasteDate='', pasteKind='실적', pasteIndustry='', pasteNotice='', pasteGoal='구매',pasteUnit='points',pasteCost='net';
  let benchSelection=new Set();
  const PASTE_SAMPLE='매체\t캠페인\timps\tclick\tspending\tCTR\tCPC\tCPM\torder\trevenue\tCVR\tROAS\tAOV\n카카오비즈보드\t온라인_트래픽\t2064155\t33196\t2104344\t1.61%\t63\t1019\t61\t9001900\t0.18%\t427.78%\t147572';
  try {const raw=localStorage.getItem(key);if(raw){recoveryRaw=raw;db=E.validateBackup(JSON.parse(raw));recoveryRaw=null;}}catch(_){notice='기존 저장자료 형식 오류: JSON 백업 후 정상 백업을 복원하세요. 기존 원본은 유지됩니다.';}
  const p=()=>db.plan, root=()=>document.getElementById('page-tool-mediamix');
  function initPlan(){
    const date=new Date(),local=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    if(!p().date)p().date=local(date);
    if(!p().start)p().start=local(date);
    if(!p().end){date.setDate(date.getDate()+29);p().end=local(date);}
    if(!p().autoSettings)p().autoSettings={...A.defaults(),...(db.preferences||{})};
    if(p().autoEnabled==null)p().autoEnabled=!!db.preferences?.industry&&!p().rows.length;
  }
  initPlan();
  function save(){if(recoveryRaw!=null)return;try{localStorage.setItem(key,JSON.stringify(db));notice='이 브라우저에 저장됨';}catch(_){notice='저장 실패: JSON 백업을 내려받으세요.';}}
  const quantity=r=>r.model==='CPV'?['조회',r.views]:r.model==='CPI'?['설치',r.installs]:r.model==='SEND'?['발송',r.sends]:['클릭',r.clicks];
  const rawBench=()=>db.benchmarks.concat(A.publicBench(window.MM_DATA));
  const allBench=()=>A.catalogue(rawBench(),p().date);
  const industries=()=>[...new Set(rawBench().map(b=>A.industry(b.industry)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));

  // ── 폼 조각 (허브 .field / .input 규격) ────────────────────
  const fid=(scope,k)=>'mixf-'+scope+'-'+k;
  function field(k,label,type='text',obj=p(),scope='plan',hint='',unit='') {
    const id=fid(scope,k);
    const inp=`<input class="input" id="${id}" data-scope="${scope}" data-field="${k}" type="${type}" value="${esc(obj[k])}" ${type==='number'?'step="any" min="0" inputmode="decimal"':'autocomplete="off"'}>`;
    return `<div class="field"><label for="${id}">${label}</label>`+
      (unit?`<div class="input-affix">${inp}<span class="affix">${unit}</span></div>`:inp)+
      (hint?`<div class="field-hint">${hint}</div>`:'')+`</div>`;
  }
  function select(k,label,opts,obj=p(),scope='plan',hint='') {
    const id=fid(scope,k);
    return `<div class="field"><label for="${id}">${label}</label><select class="input" id="${id}" data-scope="${scope}" data-field="${k}">`+
      opts.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${String(obj[k])===String(v)?'selected':''}>${esc(l)}</option>`;}).join('')+
      `</select>`+(hint?`<div class="field-hint">${hint}</div>`:'')+`</div>`;
  }
  function check(k,label,obj,scope='row') {
    const id=fid(scope,k);
    return `<label class="mix-check" for="${id}"><input type="checkbox" id="${id}" data-scope="${scope}" data-field="${k}" ${obj[k]?'checked':''}><span>${label}</span></label>`;
  }
  const button=(action,text,cls='btn-ghost')=>`<button type="button" class="btn btn-sm ${cls}" data-action="${action}">${text}</button>`;
  const panel=(ico,title,sub,body,extra='')=>`<div class="panel${extra?' '+extra:''}">`+
    `<div class="panel-head"><span class="ico">${ico}</span><div><div class="panel-title">${title}</div>`+
    (sub?`<div class="panel-sub">${sub}</div>`:'')+`</div></div>${body}</div>`;
  const metric=(label,value,sub,cls='')=>`<div class="metric${cls?' '+cls:''}"><div class="m-label">${label}</div>`+
    `<div class="m-value">${value}</div>${sub?`<div class="m-sub">${sub}</div>`:''}</div>`;

  // ============================================================
  // 셸
  // ============================================================
  function render() {
    initPlan();
    const el=root();if(!el)return;
    const res=E.compute(p());
    const tabs=[['compose','📝 계획 편집'],['library','📚 벤치마크'],['preview','📄 제출본 검수']];
    el.innerHTML=`<div class="tool-wrap mix-studio">
      <div class="tool-hero mix-noprint">
        <div class="eyebrow">🧰 실무 도구</div>
        <h1>미디어믹스</h1>
      </div>

      <div class="mix-bar mix-noprint">
        <div class="seg" id="mix-tabs" role="tablist">${tabs.map(([v,l])=>
          `<button type="button" class="seg-btn${page===v?' on':''}" data-view="${v}" aria-pressed="${page===v}">${l}</button>`).join('')}</div>
        <span class="mix-status" id="mix-save" role="status">${esc(notice||'브라우저 전용 저장 · 서버 전송 없음')}</span>
      </div>

      <details class="mix-storage mix-noprint"><summary>저장한 계획 · 자료 관리 <span>${db.saved.length}개 계획 / ${db.benchmarks.length}행 자료</span></summary>
        <div class="mix-bar">
          <div class="field mix-savedwrap"><label for="mix-saved">저장한 계획</label>
            <select class="input" id="mix-saved"><option value="">선택</option>${db.saved.map((s,i)=>`<option value="${i}">${esc(s.client+' · '+s.title)}</option>`).join('')}</select></div>
          <div class="btn-row">${button('save-plan','💾 계획 저장')}${button('duplicate','⧉ 복제')}${button('new','＋ 새 계획')}
            ${button('backup','📤 JSON 백업')}${button('import','📥 자료 가져오기')}${button('legacy','↩ 이전 입력')}</div>
        </div>
      </details>

      <div id="mix-body">${page==='compose'?compose(res):page==='library'?library():preview(res)}</div>
      <input type="file" id="mix-file" accept=".json,.xlsx" hidden>
      <dialog id="mix-import-dialog" class="mix-dialog">
        <div class="panel-title" style="margin-bottom:10px">가져오기 검토</div>
        <div id="mix-import-summary" class="mix-dialog-body"></div>
        <div class="btn-row">${button('cancel-import','취소')}${button('commit-import','추가','btn-primary')}</div>
      </dialog>
    </div>`;
    bind();
  }

  // ============================================================
  // 계획 편집
  // ============================================================
  function campaignTable(res) {
    const head=`<tr><th style="min-width:160px">매체 · 캠페인</th><th>기기</th><th>기준</th>`+
      `<th class="num">공급가 예산</th><th class="num">실매체비</th><th class="num">예상 물량</th>`+
      `<th class="num">예상 클릭</th><th class="num">예상 전환</th><th class="num">검토</th><th class="num"></th></tr>`;
    const body=res.rows.map((x,i)=>{
      const [unit,qty]=quantity(x);
      return `<tr class="${i===selected?'mix-selected':''}">`+
        `<td><button type="button" class="mix-rowname" data-edit="${i}"><b>${esc(x.type)}</b><span>${esc(x.name)}</span></button></td>`+
        `<td>${esc(x.device)}</td><td>${esc(x.model)}</td>`+
        `<td class="num"><input class="input mix-cell-input" type="number" min="0" step="1" data-inline="${i}" value="${esc(x.amount)}" aria-label="${i+1}행 공급가 예산"></td><td class="num" data-live="${i}-media">${won(x.media)}</td>`+
        `<td class="num" data-live="${i}-quantity">${n(qty)} <small>${unit}</small></td>`+
        `<td class="num" data-live="${i}-clicks">${n(x.clicks)}</td>`+
        `<td class="num" data-live="${i}-conv">${n(x.conv,1)} <small>${esc(x.goal)}</small></td>`+
        `<td class="num"><label class="mix-check mix-check-c"><input type="checkbox" data-approve="${i}" ${x.approved===true?'checked':''}>`+
          `<span class="${x.approved===true?'mix-ok-t':'mix-warn-t'}">${x.approved===true?'확인':'미확인'}</span></label></td>`+
        `<td class="num"><button type="button" class="mix-del" data-remove="${i}" title="캠페인 삭제" aria-label="${i+1}행 삭제">✕</button></td></tr>`;
    }).join('')||'<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:22px">선택된 캠페인이 없습니다 — 위에서 추가하거나 [벤치마크]에서 불러오세요</td></tr>';
  const foot=`<tr class="total"><td colspan="3">합계</td><td class="num">${won(res.totals.amount)}</td>`+
      `<td class="num">${won(res.totals.media)}</td><td class="num"><small>단위별 구분</small></td>`+
      `<td class="num">${n(res.totals.clicks)}</td><td class="num">${n(res.totals.conv,1)}</td><td colspan="2"></td></tr>`;
    return `<div class="table-scroll" id="mix-campaign-table"><table class="t-table"><thead>${head}</thead><tbody>${body}${foot}</tbody></table></div>`;
  }

  function compose(res) {
    const r=p().rows[selected];
    const s=p().autoSettings||A.defaults();
    const quick=panel('','업종별 자동 구성','',
      `<div class="field-row c3">${select('industry','업종',[['','선택'],...industries()],s,'auto')}${select('objective','캠페인 목표',A.objectives,s,'auto')}${select('device','디바이스',['MO','PC','전체','Android','iOS'],s,'auto')}</div>
       <div class="field-row">${field('budget','총 예산','number',p(),'plan','','원')}${select('vatMode','예산 기준',[['ex','VAT 별도'],['in','VAT 포함']])}</div>
       <div class="mix-bar"><div class="btn-row">${button('auto-generate',p().rows.length?'업종 기준으로 다시 구성':'미디어믹스 만들기','btn-primary')}${button('go-preview','제출본 검수')}</div>${check('autoEnabled','예산 변경 시 자동 재배분',p(),'plan')}</div>
       <details class="mix-options"><summary>자동 구성 조건</summary><div class="mix-checkrow">${check('feed','상품 피드 준비됨',s,'auto')}${check('audience','리타겟팅 모수 확보됨',s,'auto')}${check('allowReference','과거 제안·참고값 허용',s,'auto')}</div>
       <div class="field-row">${field('minDaily','캠페인당 권장 일예산 (공급가)','number',s,'auto','','원')}${field('maxChannels','최대 캠페인 수','number',s,'auto')}</div>
       <div class="field-row">${field('markup','기본 마크업','number',s,'auto','','%')}${field('tax','광고주 청구 VAT','number',p(),'plan','','%')}</div></details>
       <div id="mix-auto-status">${autoStatus()}</div>`,'mix-quick');
    const info=`<details class="mix-options mix-proposal" ${!p().client?'open':''}><summary>제안 정보 · 집행 기간</summary>`+panel('','제안 정보','',
      `<div class="field-row">${field('client','광고주')}${field('title','제안명')}</div>
       <div class="field-row">${field('agency','작성 주체')}${field('date','작성일','date')}</div>
       <div class="field-row">${field('start','집행 시작일','date')}${field('end','집행 종료일','date')}</div>`)+`</details>`;

    const money=panel('💰','예산 · 가정','단가는 수수료·VAT 제외 실매체비 기준, 행 예산은 수수료 포함·VAT 별도 공급가',
      `<div class="field-row">${select('scenario','매체 단가 시나리오',[[100,'기준'],[120,'단가 +20%'],[80,'단가 -20%']])}</div>
       <div class="field-row">${field('margin','마진율','number',p(),'plan','넣으면 본전선과 비교합니다','%')}${field('otherCost','건당 기타 변동비','number',p(),'plan','배송·수수료 등','원')}</div>
       <div class="btn-row">${button('allocate','⚖️ 잔여 예산 자동 배분','btn-primary')}</div>`);

    const rows=panel('🧩',`캠페인 구성 <span class="mix-count" id="mix-row-count">${p().rows.length}</span>`,'',
      `<div class="mix-bar" style="margin-bottom:12px">
         <div class="field" style="margin:0;flex:1;min-width:200px"><label for="mix-product">추가할 매체 · 캠페인</label>
           <select class="input" id="mix-product">${E.products.map(x=>`<option value="${x.id}">${esc(x.media)} · ${esc(x.campaign)}</option>`).join('')}</select></div>
         <div class="btn-row">${button('add','＋ 캠페인 추가')}${button('library','📚 벤치마크에서 고르기')}</div>
       </div>${campaignTable(res)}`);

    const editor=r?panel('✏️',`${selected+1}행 설정 — ${esc(r.media||E.products.find(x=>x.id===r.product).media)}`,'값을 고치면 검토 확인이 자동으로 해제됩니다',
      `<div class="field-row">${field('media','매체명','text',r,'row')}${field('campaign','캠페인명','text',r,'row')}</div>
       <div class="field-row c3">${select('device','디바이스',['전체','PC','MO','Android','iOS'],r,'row')}${select('goal','전환 정의',['구매','리드','설치','기타'],r,'row')}${select('model','물량 계산 기준',['CPC','CPM','CPV','CPI','SEND','FIXED'],r,'row')}</div>
       <div class="field-row c3">${field('amount','공급가 예산','number',r,'row','','원')}${field('weight','배분 가중치','number',r,'row','잔여 예산을 이 비율로 나눕니다')}${field('markup','마크업','number',r,'row','실매체비 = 예산 ÷ (1+마크업)','%')}</div>
       <div class="field-row c3">${field('rate','기준 단가','number',r,'row',r.model==='CPC'?'CPC':r.model==='CPM'?'CPM':r.model==='CPV'?'CPV':r.model==='CPI'?'CPI':r.model==='SEND'?'건당 발송 단가':'정액은 아래 물량 입력','원')}${field('ctr','CTR','number',r,'row','','%')}${field('cvr','클릭 기준 CVR','number',r,'row','','%')}</div>
       <div class="field-row${r.model==='CPV'?' c3':''}">${field('aov','구매 객단가','number',r,'row','','원')}${r.model==='CPV'?field('vtr','조회/노출 VTR','number',r,'row','','%'):''}${r.model==='FIXED'?field('fixedImpr','정액 예상 노출','number',r,'row'):''}${r.model==='FIXED'?field('fixedClicks','정액 예상 클릭','number',r,'row'):''}</div>
       <div class="field-row">${field('start','행 시작일','date',r,'row','비우면 전체 기간')}${field('end','행 종료일','date',r,'row','비우면 전체 기간')}</div>
       <div class="field-row c3">${field('target','타기팅','text',r,'row')}${field('source','산출 근거','text',r,'row','제출본에 인쇄됩니다')}${field('sourceDate','근거 기준일','date',r,'row')}</div>
       <div class="field-row">${select('sourceKind','근거 성격',['실적','과거 제안','참고값','가정'],r,'row')}${field('note','비고','text',r,'row')}</div>
       <div class="mix-checkrow">${check('locked','예산 고정 (자동 배분에서 제외)',r)}${check('approved','단가·전환 정의·출처 검토 확인',r)}
         <div class="btn-row" style="margin:0">${button('clone-row','⧉ 행 복제')}</div></div>`,'mix-editor'):'';

    return quick+`<div id="mix-live-summary">${liveSummary(res)}</div>`+rows+editor+info+`<details class="mix-options"><summary>단가 시나리오 · 손익분기</summary>${money}</details>`+`<div id="mix-check">${checks(res)}</div>`;
  }

  function autoStatus(){return p().autoSummary?`<p class="mix-policy">${esc(p().autoSummary)}</p><details class="mix-options"><summary>자동 구성 제외 내역 ${(p().autoExcluded||[]).length}개</summary><ul class="mix-list">${(p().autoExcluded||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details>`:'<p class="mix-policy">등록된 업종 자료만 적용 · 전환율·객단가 근거가 없으면 미산출 · 기본 기간은 오늘부터 30일</p>';}
  function liveSummary(res){return `<div class="mix-summary result-grid c3">${metric('공급가 배분',won(res.totals.amount),'청구 총액 '+won(res.totals.gross))}${metric('예상 클릭',n(res.totals.clicks),'예산 잔액 '+won(res.expected-(res.totals.amount||0)))}${metric('예상 전환',n(res.totals.conv,1),res.rows.some(r=>r.conv==null)?'전환 근거 미입력 포함':'동일 전환 정의만 합산')}</div>`;}

  // ── 손익분기 판정 — 계산은 MixEngine.breakEven 한 곳에서만 ──
  function beBlock(res){
    const b=res.be; if(!b||!b.marginValid) return '';
    const tone=b.unreachable||b.pass===false?'danger':b.pass===true?'ok':'warn';
    const msg=b.unreachable
      ? '건당 기타 변동비가 마진금액을 넘어섭니다. 광고비가 0이어도 적자라 본전 도달이 불가능한 조건입니다.'
      : b.pass===true
        ? '예상 ROAS 가 손익분기선을 넘습니다. CVR·객단가는 계획 가정이므로 실집행 후 다시 검증하세요.'
        : b.pass===false
          ? '예상 ROAS 가 손익분기선에 못 미칩니다. 단가가 낮은 캠페인으로 예산을 옮기거나 마진·객단가 가정을 재확인하세요.'
          : '예상 ROAS 를 산출할 수 없어 본전 여부를 판정하지 못했습니다.';
    const ico=tone==='ok'?'✅':tone==='danger'?'⛔':'⚠️';
    return panel('💹',`손익분기 검증`,`마진율 ${n(b.margin)}%${b.hasOther?' · 기타 변동비 '+won(b.other)+'/건':''} 기준`,
      `<div class="result-grid c3">
        ${metric('🎯 손익분기 ROAS',b.unreachable?'달성 불가':pct(b.beRoas),'이 수치를 넘어야 본전')}
        ${metric('🧾 손익분기 CPA',won(b.beCpa),'건당 공헌이익 = 최대 허용 CPA')}
        ${metric('📊 예상 ROAS',pct(b.roas),'이 계획의 산출값',b.pass===true?'good':b.pass===false?'bad':'')}
        ${metric('🛒 기준 객단가',won(b.aov),'구매 행의 전환 가중 평균')}
      </div><div class="callout ${tone}"><span class="c-ico">${ico}</span><div>${esc(msg)}</div></div>`);
  }

  function checks(res){
    const gap=res.expected-res.totals.amount;
    return beBlock(res)+panel('🔍','검수 결과',
      res.errors.length?`제출 전 ${res.errors.length}건을 완료해야 합니다`:'제출 요건 충족',
      `<div class="result-grid c3">
        ${metric('공급가',won(res.totals.amount),'VAT 별도','primary')}
        ${metric('청구 VAT',won(res.totals.tax),'')}
        ${metric('청구 총액',won(res.totals.gross),'광고주 청구 기준')}
        ${metric('예산 잔액',won(gap),Number.isFinite(gap)&&gap===0?'배분 완료':'배분이 남았습니다',
          Number.isFinite(gap)&&gap===0?'good':'bad')}
      </div>`+
      (res.errors.length
        ?`<div class="callout danger"><span class="c-ico">⛔</span><div><b>미완료 ${res.errors.length}건</b><ul class="mix-list">${res.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div></div>`
        :`<div class="callout ok"><span class="c-ico">✅</span><div>필수 입력 및 예산 검수를 통과했습니다. 제출용 XLSX 를 만들 수 있습니다.</div></div>`)+
      (res.warnings.length
        ?`<div class="callout warn"><span class="c-ico">⚠️</span><div><b>주의 ${res.warnings.length}건</b><ul class="mix-list">${res.warnings.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></div></div>`:''));
  }

  // ============================================================
  // 벤치마크
  // ============================================================
  function library() {
    const all=allBench(),brands=industries();
    const list=all.filter(b=>(!brand||b.industry===brand)&&(!mediaFilter||b.product===mediaFilter)&&(!filter||[b.campaign,b.device,b.industry,b.source].join(' ').toLowerCase().includes(filter.toLowerCase())));

    const paste=panel('📥','성과 리포트 붙여넣기','지난 캠페인 리포트 표를 헤더째 복사해 붙이면 매체를 알아보고 단가를 뽑습니다',
      `<div class="field-row c3">
         <div class="field"><label for="mix-paste-industry">업종</label><select class="input" id="mix-paste-industry"><option value="">선택</option>${industries().map(v=>`<option ${v===pasteIndustry?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
         <div class="field"><label for="mix-paste-date">근거 기준일</label><input class="input" id="mix-paste-date" type="date" value="${esc(pasteDate)}"></div>
         <div class="field"><label for="mix-paste-kind">근거 성격</label><select class="input" id="mix-paste-kind">${['실적','과거 제안','참고값','가정'].map(k=>`<option ${k===pasteKind?'selected':''}>${k}</option>`).join('')}</select></div>
       </div>
       <div class="field-row c3"><div class="field"><label for="mix-paste-goal">전환 정의</label><select class="input" id="mix-paste-goal">${['구매','리드','설치','기타'].map(v=>`<option ${v===pasteGoal?'selected':''}>${v}</option>`).join('')}</select></div>
       <div class="field"><label for="mix-paste-unit">% 없는 비율 값</label><select class="input" id="mix-paste-unit"><option value="points" ${pasteUnit==='points'?'selected':''}>1.5 = 1.5%</option><option value="fraction" ${pasteUnit==='fraction'?'selected':''}>0.015 = 1.5%</option></select></div>
       <div class="field"><label for="mix-paste-cost">입력 비용 기준</label><select class="input" id="mix-paste-cost"><option value="net" ${pasteCost==='net'?'selected':''}>VAT·수수료 제외 실매체비</option><option value="vat" ${pasteCost==='vat'?'selected':''}>VAT 10% 포함·수수료 제외</option></select></div></div>
       <div class="field"><label for="mix-paste-text">리포트 표</label>
         <textarea class="input mix-paste-text" id="mix-paste-text" rows="5" spellcheck="false" placeholder="${esc(PASTE_SAMPLE)}">${esc(pasteText)}</textarea>
         <div class="field-hint">imps·click·spending 만 있어도 CTR·CPC·CPM 을 역산하고, order·revenue 가 있으면 CVR·객단가까지 만듭니다. 읽은 자료는 중복·충돌 확인을 거쳐 이 브라우저에만 저장됩니다.</div></div>
       ${pasteNotice?`<div class="callout info"><span class="c-ico">ℹ️</span><div>${esc(pasteNotice)}</div></div>`:''}
       <div class="btn-row">${button('paste-report','🔍 읽어들이기','btn-primary')}${button('paste-clear','비우기')}</div>`);

    const rows=list.slice(0,150).map(b=>{
      const prod=E.products.find(x=>x.id===b.product);
      return `<tr><td><label class="mix-check"><input type="checkbox" data-bench-select="${esc(b.id)}" ${benchSelection.has(b.id)?'checked':''} aria-label="${esc(b.industry+' '+prod.media+' '+prod.campaign+' '+b.device+' 선택')}"><b>${esc(b.industry)}</b></label><div class="mix-sub">${esc(b.campaign||prod.campaign)} · ${b.sampleCount}행${b.goal?' / '+esc(b.goal):''}</div></td>`+
        `<td>${esc(b.media||prod.media)}<div class="mix-sub">${esc(b.device||'전체')}</div></td>`+
        `<td>${esc(b.model)}</td><td class="num">${n(E.num(b.rate),0)}</td>`+
        `<td class="num">${n(E.num(b.ctr),2)}</td><td class="num">${n(E.num(b.cvr),2)}</td>`+
        `<td title="${esc(b.source)}">${esc(b.sourceKind)}<div class="mix-sub">${esc(b.sourceDate||'기준일 확인 필요')}</div>${b.costBasis!=='media-net'?`<button class="btn btn-sm btn-ghost" data-cost-review="${esc(b.id)}">비용 기준 확인</button>`:''}</td>`+
        `<td class="num"><button type="button" class="btn btn-sm btn-ghost" data-bench="${esc(b.id)}">계획에 추가</button></td></tr>`;
    }).join('')||'<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:22px">일치하는 자료가 없습니다</td></tr>';

    const lib=panel('📚',`벤치마크 자료 <span class="mix-count">${list.length}</span>`,
      `등록 ${db.benchmarks.length}건 · 공통 참고값은 2024~2025 과거값 · 가져온 자료는 이 브라우저에만 저장`,
      `<div class="field-row c3">
         <div class="field"><label for="mix-industry">업종</label><select class="input" id="mix-industry"><option value="">전체</option>${brands.map(v=>`<option ${v===brand?'selected':''}>${esc(v)}</option>`).join('')}</select></div>
         <div class="field"><label for="mix-media-filter">매체 · 캠페인</label><select class="input" id="mix-media-filter"><option value="">전체</option>${E.products.map(v=>`<option value="${v.id}" ${v.id===mediaFilter?'selected':''}>${esc(v.media)} · ${esc(v.campaign)}</option>`).join('')}</select></div>
         <div class="field"><label for="mix-filter">검색</label><input class="input" id="mix-filter" value="${esc(filter)}" placeholder="캠페인·업종·기기·출처" autocomplete="off"></div>
       </div>
       <div class="table-scroll"><table class="t-table"><thead><tr>
         <th style="min-width:150px">업종 · 캠페인</th><th>매체 · 기기</th><th>기준</th>
         <th class="num">단가(원)</th><th class="num">CTR(%)</th><th class="num">CVR(%)</th><th>근거</th><th class="num"></th>
       </tr></thead><tbody>${rows}</tbody></table></div>
       ${list.length>150?'<div class="field-hint">최대 150건까지 표시합니다. 검색 조건을 좁히면 나머지도 볼 수 있습니다.</div>':''}
       <div class="btn-row">${button('add-selected','선택 자료 일괄 추가','btn-primary')}${button('import','📥 JSON / XLSX 가져오기')}${button('template','📄 엑셀 입력 양식')}</div>`);

    const unclassified=db.benchmarks.filter(b=>!b.industry?.trim()).length;
    return (unclassified?`<div class="callout warn">업종 미분류 ${unclassified}행은 자동 구성에서 제외됩니다. 원본은 백업에 보존됩니다.<div class="field"><label for="mix-classify">미분류 자료 업종</label><select class="input" id="mix-classify"><option value="">선택</option>${industries().map(v=>`<option>${esc(v)}</option>`).join('')}</select></div>${button('classify','미분류 자료에 업종 지정')}</div>`:'')+lib+`<details class="mix-options"><summary>성과 리포트 붙여넣기</summary>${paste}</details>`;
  }

  // ============================================================
  // 제출본
  // ============================================================
  function preview(res) {
    const rows=res.rows.map(r=>{
      const [unit,qty]=quantity(r);
      return `<tr><td><b style="color:var(--text-primary)">${esc(r.type)}</b><div class="mix-sub">${esc(r.name)}${r.days?' · '+r.days+'일':''}</div></td>`+
        `<td class="num">${won(r.amount)}</td><td class="num">${n(qty)} <small>${unit}</small></td>`+
        `<td class="num">${n(r.impr)}</td><td class="num">${n(r.clicks)}</td><td class="num">${pct(r.ctr,2)}</td>`+
        `<td class="num">${n(r.conv,1)} <small>${esc(r.goal)}</small></td>`+
        `<td class="num">${won(r.revenue)}</td>`+
        `<td class="num${res.be&&res.be.beRoas!=null&&r.roas!=null?(r.roas>=res.be.beRoas?' mm-pass':' mm-fail'):''}">${pct(r.roas,1)}</td></tr>`;
    }).join('');

    const doc=`<article class="mix-paper">
      <div class="mm-doc">
        <div class="mm-doc-top">
          <div class="mm-doc-title">${esc(p().client||'(광고주 미입력)')} · ${esc(p().title)}</div>
          <div class="mm-doc-sub">${esc(p().start)} ~ ${esc(p().end)}</div>
        </div>
        <div class="mm-doc-meta"><span>작성 ${esc(p().agency)}</span><span>작성일 ${esc(p().date||'미입력')}</span>
          <span>캠페인 ${res.rows.length}개</span></div>
      </div>

      <div class="table-scroll" style="margin-top:16px"><table class="t-table"><thead><tr>
        <th style="min-width:150px">매체 · 캠페인</th><th class="num">공급가</th><th class="num">예상 물량</th>
        <th class="num">예상 노출</th><th class="num">예상 클릭</th><th class="num">CTR</th>
        <th class="num">예상 전환</th><th class="num">예상 매출</th><th class="num">ROAS</th>
      </tr></thead><tbody>${rows}
        <tr class="total"><td>TOTAL</td><td class="num">${won(res.totals.amount)}</td><td class="num"><small>단위별 구분</small></td>
        <td class="num">${n(res.totals.impr)}</td><td class="num">${n(res.totals.clicks)}</td><td class="num">${pct(res.totals.ctr,2)}</td>
        <td class="num">${n(res.totals.conv,1)}</td><td class="num">${won(res.totals.revenue)}</td><td class="num">${pct(res.totals.roas,1)}</td></tr>
      </tbody></table></div>

      <div class="mm-vat"><span>공급가 ${won(res.totals.amount)}</span><span>부가세 ${won(res.totals.tax)}</span>
        <b>청구 총액 ${won(res.totals.gross)}</b></div>
      ${p().autoSummary?`<p class="mix-policy">${esc(p().autoSummary)}</p>`:''}
      ${res.warnings.length?`<div class="mm-notice"><b>산출 제한 및 확인 사항</b><ul>${res.warnings.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></div>`:''}

      <div class="mix-evidence-wrap"><div class="mm-notice-t">산출 근거 및 운영 조건</div>
        <ul class="mix-evidence">${res.rows.map(r=>`<li><b>${esc(r.type)}</b> <span class="mix-sub">${esc(r.name)}</span><br>`+
          `${esc(r.source)} / ${esc(r.sourceKind)} / 기준일 ${esc(r.sourceDate||'미입력')}<br>`+
          `기간 ${esc(r.start)} ~ ${esc(r.end)} · ${esc(r.device)} · ${esc(r.target||'타기팅 미입력')}`+
          `${r.note?'<br>'+esc(r.note):''}</li>`).join('')}</ul></div>

      <div class="mm-notice"><div class="mm-notice-t">NOTICE</div><ul>
        <li>예상치는 성과를 보장하지 않습니다. 단가·CTR·CVR 은 계획 가정이며 예산·기간·소재·타기팅에 따라 달라집니다.</li>
        <li>CPC·CPM 은 <b>실매체비</b> 기준, CPA·ROAS 는 <b>수수료 포함 공급가</b> 기준입니다.</li>
        <li>미산출 항목은 <b>–</b> 로 표시하며, 구매·리드·설치는 합산하지 않습니다. 메시지 발송량은 클릭수에 합산하지 않습니다.</li>
        <li>모든 금액은 VAT 별도 기준이며, 표 아래에 부가세 포함 청구 총액을 병기했습니다.</li>
      </ul></div>
      ${res.errors.length?`<div class="callout danger"><span class="c-ico">⛔</span><div><b>검토용 초안 · 미완료 항목 존재</b> — 이 상태로는 광고주에게 보내지 마세요.</div></div>`:''}
    </article>`;

    return checks(res)+panel('📄','제출본','검수를 통과해야 제출용 XLSX 를 만들 수 있습니다',
      `<div class="btn-row mix-noprint">${button('xlsx','📊 제출용 XLSX','btn-primary')}${button('draft','📝 검토용 XLSX')}${button('print','🖨 인쇄 / PDF')}</div>${doc}`,'mix-preview');
  }

  // ============================================================
  // 동작 (로직 변경 없음)
  // ============================================================
  function addBench(id,quiet=false) {
    const b=allBench().find(x=>x.id===id);if(!b)return;
    const defaults=E.row(b.product), model=b.model||defaults.model;
    p().rows.push({...defaults,...copy(b),model,goal:b.goal||defaults.goal,device:b.device||defaults.device,sourceKind:b.sourceKind||'참고값',markup:b.markup==null||b.markup===''?0:b.markup,approved:false,locked:model==='FIXED',amount:b.amount||0,weight:b.amount||1,source:b.source,rate:b.rate??'',ctr:b.ctr??'',cvr:b.cvr??'',aov:b.aov??''});selected=p().rows.length-1;page='compose';p().autoEnabled=false;if(!quiet){save();render();}
  }
  function download(data,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
  let pending=null;
  async function importFile(file){
    if(!file)return;try{
      if(file.size>15*1024*1024)throw Error('15MB 이하 파일만 지원합니다.');
      pending=file.name.toLowerCase().endsWith('.xlsx')?await window.MixWorkbook.importBench(await file.arrayBuffer(),file.name):JSON.parse(await file.text());
      reviewPending();
    }catch(e){pending=null;alert('가져오기 실패: '+e.message);}
  }
  // 파일 가져오기와 성과 리포트 붙여넣기가 같은 검토 절차(중복·충돌 확인)를 지나게 한다.
  function reviewPending(){
      if(pending.kind==='mix-backup'){
        pending.db=E.validateBackup(pending.db);
      }else E.validatePack(pending);
      const count=pending.kind==='mix-backup'?pending.db.benchmarks.length:pending.benchmarks.length;
      const existing=new Map(db.benchmarks.map(b=>[b.id,b]));
      const duplicates=pending.kind==='mix-backup'?0:pending.benchmarks.filter(b=>existing.has(b.id)).length;
      const conflicts=pending.kind==='mix-backup'?0:pending.benchmarks.filter(b=>existing.has(b.id)&&Object.keys({...b,...existing.get(b.id)}).some(k=>JSON.stringify(b[k])!==JSON.stringify(existing.get(b.id)[k]))).length;
      if(pending.kind!=='mix-backup'&&db.benchmarks.length+count-duplicates>3000)throw Error('등록 자료는 최대 3,000건입니다.');
      document.getElementById('mix-import-summary').textContent=pending.kind==='mix-backup'?`백업 복원: 현재 계획과 자료 ${count}건으로 교체합니다. 기존 내용은 복원 전 JSON으로 자동 다운로드합니다.`:`검토 ${count}건 / 신규 ${count-duplicates}건 / 중복 ${duplicates}건 / 동일 ID 내용 충돌 ${conflicts}건. 중복·충돌 자료는 기존 값을 유지합니다. 수정 자료는 새 ID로 등록하세요.`;
      document.getElementById('mix-import-dialog').showModal();
  }
  async function act(action) {
    try {
      if(action==='go-preview'){page='preview';render();return;}
      if(action==='auto-generate'){
        const next=A.generate(p(),rawBench(),p().autoSettings);
        if(p().rows.length){if(!confirm('현재 계획을 보관하고 업종 기준으로 다시 구성할까요?'))return;db.saved.push(copy(p()));}
        db.plan=next;db.preferences=copy(next.autoSettings);selected=-1;page='compose';
      }
      if(action==='classify'){
        const value=document.getElementById('mix-classify').value;if(!value)throw Error('업종을 선택하세요.');
        if(!confirm('미분류 자료 전체에 '+value+' 업종을 지정할까요? 서로 다른 업종의 자료라면 취소하고 입력 양식에서 개별 분류하세요.'))return;
        download(JSON.stringify({kind:'mix-backup',db},null,2),'미디어믹스_업종지정전백업.json','application/json');
        db.benchmarks.filter(b=>!b.industry?.trim()).forEach(b=>b.industry=value);
      }
      if(action==='add-selected'){
        if(!benchSelection.size)throw Error('추가할 자료를 선택하세요.');
        for(const id of benchSelection)addBench(id,true);benchSelection.clear();
      }
      if(action==='library'){page='library';render();return;}
      if(action==='import'){document.getElementById('mix-file').click();return;}
      if(action==='paste-clear'){pasteText='';pasteNotice='';render();return;}
      if(action==='paste-report'){
        const g=id=>{const el=document.getElementById(id);return el?el.value:'';};
        pasteText=g('mix-paste-text');pasteDate=g('mix-paste-date');
        pasteKind=g('mix-paste-kind')||'실적';pasteIndustry=g('mix-paste-industry');
        pasteGoal=g('mix-paste-goal');pasteUnit=g('mix-paste-unit');pasteCost=g('mix-paste-cost');
        const r=E.parseReport(pasteText,{sourceDate:pasteDate,sourceKind:pasteKind,industry:pasteIndustry,source:'성과 리포트',goal:pasteGoal,percentUnit:pasteUnit,costFactor:pasteCost==='vat'?1.1:1});
        if(r.error){pasteNotice=r.error+(r.skipped&&r.skipped.length?' / 인식 못한 행: '+r.skipped.join(', '):'');render();return;}
        pasteNotice=r.pack.benchmarks.length+'건을 읽었습니다.'+(r.skipped.length?' 인식 못한 행: '+r.skipped.join(', '):'');
        brand=pasteIndustry;
        // render() 가 dialog 를 포함한 DOM 을 갈아끼우므로, 다시 그린 뒤에 모달을 연다.
        render();pending=r.pack;reviewPending();return;
      }
      if(action==='cancel-import'){document.getElementById('mix-import-dialog').close();pending=null;return;}
      if(action==='commit-import'){
        if(!pending)throw Error('가져올 자료를 다시 선택하세요.');
        if(pending.kind==='mix-backup'){download(recoveryRaw??JSON.stringify({kind:'mix-backup',db},null,2),'미디어믹스_복원전백업.json','application/json');db=pending.db;recoveryRaw=null;}
        else{const ids=new Set(db.benchmarks.map(b=>b.id));db.benchmarks.push(...pending.benchmarks.filter(b=>!ids.has(b.id)));}
        pending=null;page='library';selected=-1;
      }
      if(action==='backup'){download(recoveryRaw??JSON.stringify({kind:'mix-backup',db},null,2),'미디어믹스_백업.json','application/json');return;}
      if(action==='new'){if(!confirm('현재 계획은 저장한 계획에 보관하고 새 계획을 열까요?'))return;if(p().rows.length)db.saved.push(copy(p()));db.plan=E.plan();initPlan();selected=-1;page='compose';}
      if(action==='save-plan'){db.saved.push(copy(p()));}
      if(action==='duplicate'){db.saved.push(copy(p()));db.plan=copy(p());p().title+=' (복제)';p().rows.forEach(r=>r.approved=false);}
      if(action==='add'){p().rows.push(E.row(document.getElementById('mix-product').value));selected=p().rows.length-1;p().autoEnabled=false;}
      if(action==='clone-row'&&selected>=0){p().rows.push({...copy(p().rows[selected]),approved:false});selected=p().rows.length-1;p().autoEnabled=false;}
      if(action==='allocate'){E.allocate(p());p().rows.forEach(r=>r.approved=false);}
      if(action==='legacy'){
        const old=loadToolState('mediamix');if(!old?.rows?.length)throw Error('이전 입력이 없습니다.');
        if(p().rows.length)db.saved.push(copy(p()));db.plan=E.plan();Object.assign(p(),{client:old.client||'',title:old.campaign||'이전 미디어믹스',budget:E.num(old.budget)||0,vatMode:old.vatMode||'ex'});
        p().rows=old.rows.map(r=>({...E.row('custom'),media:r.media||old.platform,campaign:r.adType||r.channel,weight:E.num(r.ratio)||0,rate:r.cpc||'',ctr:r.ctr||'',cvr:r.cvr||old.cvr||'',aov:r.aov||old.aov||'',markup:E.num(r.markup)||E.num(old.markup)||0,source:'이전 플래너 입력 (단가 기준 재확인)',note:r.note||''}));E.allocate(p());page='compose';selected=0;
      }
      if(action==='print'){if(E.compute(p()).errors.length)throw Error('제출본 필수 검수를 완료한 후 인쇄하세요.');page='preview';render();document.body.classList.add('mix-print');window.print();document.body.classList.remove('mix-print');return;}
      if(action==='xlsx'||action==='draft'){const res=E.compute(p());if(action==='xlsx'&&res.errors.length)throw Error('필수 검수 '+res.errors.length+'개를 완료하세요. 초안은 검토용 XLSX로 받을 수 있습니다.');await window.MixWorkbook.exportPlan(p(),res,action==='draft');return;}
      if(action==='template'){await window.MixWorkbook.template();return;}
      save();render();
    }catch(e){alert(e.message);}
  }
  function bindRows(){
    root().querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{selected=+b.dataset.edit;render();root().querySelector('.mix-editor')?.scrollIntoView({block:'nearest'});});
    root().querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(confirm('이 캠페인을 계획에서 제거할까요?')){p().rows.splice(+b.dataset.remove,1);p().autoEnabled=false;selected=-1;save();render();}});
    root().querySelectorAll('[data-inline]').forEach(el=>{el.oninput=()=>{const r=p().rows[+el.dataset.inline];r.amount=el.value;r.approved=false;p().autoEnabled=false;save();refreshComputed();};el.onblur=()=>setTimeout(()=>{if(document.activeElement?.dataset.inline==null)refreshComputed();},0);});
    // 표에서 바로 검토 확인 — 행을 열지 않고 한 번에 체크할 수 있게
    root().querySelectorAll('[data-approve]').forEach(b=>b.onchange=()=>{const r=p().rows[+b.dataset.approve];if(!r)return;r.approved=b.checked;save();refreshComputed();});
  }
  // Keep active inputs in place while recalculating, so blur never swallows a click.
  function refreshComputed(){
    const res=E.compute(p()),table=root().querySelector('#mix-campaign-table');
    if(selected<0)root().querySelector('.mix-editor')?.remove();
    const count=root().querySelector('#mix-row-count');if(count)count.textContent=p().rows.length;
    if(table&&document.activeElement?.dataset.inline==null){const fragment=document.createElement('template');fragment.innerHTML=campaignTable(res);const left=table.scrollLeft;table.innerHTML=fragment.content.querySelector('#mix-campaign-table').innerHTML;table.scrollLeft=left;bindRows();}
    else if(table){
      const fragment=document.createElement('template');fragment.innerHTML=campaignTable(res);
      for(const cell of table.querySelectorAll('[data-live]'))cell.innerHTML=fragment.content.querySelector(`[data-live="${cell.dataset.live}"]`).innerHTML;
      table.querySelector('.total').innerHTML=fragment.content.querySelector('.total').innerHTML;
      table.querySelectorAll('[data-approve]').forEach(el=>{el.checked=p().rows[+el.dataset.approve].approved===true;el.nextElementSibling.textContent=el.checked?'확인':'미확인';el.nextElementSibling.className=el.checked?'mix-ok-t':'mix-warn-t';});
    }
    const summary=root().querySelector('#mix-live-summary');if(summary)summary.innerHTML=liveSummary(res);
    const status=root().querySelector('#mix-auto-status');if(status)status.innerHTML=autoStatus();
    const autoCheck=root().querySelector('[data-field="autoEnabled"]');if(autoCheck)autoCheck.checked=p().autoEnabled===true;
    const check=root().querySelector('#mix-check');if(check)check.innerHTML=checks(res);
    const st=root().querySelector('#mix-save');if(st)st.textContent=notice;
    const approved=root().querySelector('.mix-editor [data-field="approved"]');if(approved)approved.checked=p().rows[selected]?.approved===true;
  }
  function bind(){
    root().querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.dataset.action));
    const pt=document.getElementById('mix-paste-text');
    if(pt){pt.value=pasteText;pt.oninput=()=>{pasteText=pt.value;};}
    root().querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{page=b.dataset.view;render();});
    bindRows();
    root().querySelectorAll('[data-bench]').forEach(b=>b.onclick=()=>addBench(b.dataset.bench));
    root().querySelectorAll('[data-bench-select]').forEach(b=>b.onchange=()=>{if(b.checked)benchSelection.add(b.dataset.benchSelect);else benchSelection.delete(b.dataset.benchSelect);});
    root().querySelectorAll('[data-cost-review]').forEach(b=>b.onclick=()=>{
      const record=allBench().find(x=>x.id===b.dataset.costReview);if(!record)return;
      if(!confirm(record.sampleCount+'행의 단가가 VAT·수수료 제외 실매체비 기준임을 확인하셨습니까? 이 작업은 금액을 자동 보정하지 않습니다.'))return;
      download(JSON.stringify({kind:'mix-backup',db},null,2),'미디어믹스_비용확인전백업.json','application/json');
      db.benchmarks.filter(x=>record.benchmarkIds.includes(x.id)).forEach(x=>x.costBasis='media-net');save();render();
    });
    root().querySelectorAll('[data-field]').forEach(el=>{
      const update=()=>{
        const scope=el.dataset.scope,k=el.dataset.field,obj=scope==='row'?p().rows[selected]:scope==='auto'?p().autoSettings:p();
        obj[k]=el.type==='checkbox'?el.checked:el.value;
        if(scope==='row'&&k!=='approved'){obj.approved=false;p().autoEnabled=false;}
        if(scope==='auto'){p().autoEnabled=false;p().autoSummary='';p().autoExcluded=[];p().rows.forEach(r=>r.approved=false);}
        if(scope==='plan'){
          p().rows.forEach(r=>r.approved=false);
          if(p().autoEnabled&&['budget','vatMode','tax','start','end','autoEnabled'].includes(k)){
            try{db.plan=A.generate(p(),rawBench(),p().autoSettings);selected=-1;}
            catch(e){notice=e.message;save();notice=e.message;refreshComputed();return;}
          }
        }
        save();if(k==='model')render();else refreshComputed();
      };
      if(el.tagName==='INPUT'&&el.type!=='checkbox')el.oninput=update;else el.onchange=update;
    });
    document.getElementById('mix-file').onchange=e=>importFile(e.target.files[0]);
    document.getElementById('mix-saved').onchange=e=>{if(e.target.value!==''&&confirm('현재 계획을 보관하고 선택한 계획을 열까요?')){const next=copy(db.saved[+e.target.value]);if(p().rows.length)db.saved.push(copy(p()));db.plan=next;initPlan();selected=-1;save();render();}};
    for(const [id,set]of [['mix-industry',v=>brand=v],['mix-media-filter',v=>mediaFilter=v],['mix-filter',v=>filter=v]]){const e=document.getElementById(id);if(e)e.onchange=()=>{set(e.value);render();};}
  }
  window.renderMediamixTool=render;
  window.mediamixPrefill=function(o){brand=A.industry(o?.industry||'');filter='';mediaFilter='';page='library';render();if(typeof showPage==='function')showPage('tool-mediamix');};
  const oldLookup=window.mmRenderLookup;
  window.mmRenderLookup=function(el){
    oldLookup(el);
    const block=document.createElement('div');
    block.innerHTML=`<div class="panel"><div class="panel-head"><span class="ico">🏷️</span><div>`+
      `<div class="panel-title">업종별 캠페인 벤치마크</div>`+
      `<div class="panel-sub">이 브라우저에 등록된 자료 ${db.benchmarks.length}건 — 우리 계정 실적을 넣어두는 곳</div>`+
      `</div></div><div class="btn-row"><button type="button" class="btn btn-sm btn-primary" id="mix-open-library">업종 · 캠페인 자료 열기</button></div></div>`;
    el.before(block);
    block.querySelector('button').onclick=()=>{page='library';render();showPage('tool-mediamix');};
  };
})();
