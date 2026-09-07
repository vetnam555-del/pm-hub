/* Local-only planning workspace. No client records are sent to the server. */
(function () {
  'use strict';
  const E=window.MixEngine, key='pm_mix_studio_v1';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=(v,d=0)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('ko-KR',{maximumFractionDigits:d,minimumFractionDigits:d});
  const copy=o=>JSON.parse(JSON.stringify(o));
  let db={plan:E.plan(),saved:[],benchmarks:[]}, selected=-1, page='compose', filter='', brand='', mediaFilter='', notice='', recoveryRaw=null;
  try {const raw=localStorage.getItem(key);if(raw){recoveryRaw=raw;db=E.validateBackup(JSON.parse(raw));recoveryRaw=null;}}catch(_){notice='기존 저장자료 형식 오류: JSON 백업 후 정상 백업을 복원하세요. 기존 원본은 유지됩니다.';}
  const p=()=>db.plan, root=()=>document.getElementById('page-tool-mediamix');
  function save(){if(recoveryRaw!=null)return;try{localStorage.setItem(key,JSON.stringify(db));notice='이 브라우저에 저장됨';}catch(_){notice='저장 실패: JSON 백업을 내려받으세요.';}}
  const quantity=r=>r.model==='CPV'?['조회',r.views]:r.model==='CPI'?['설치',r.installs]:r.model==='SEND'?['발송',r.sends]:['클릭',r.clicks];
  function publicBench() {
    const map={Search:'google-search',Shopping:'google-shopping',Display:'google-display',YouTube_Instream:'google-video',YouTube_Shorts:'google-video',App_Android:'google-app',App_iOS:'google-app',Traffic:'meta-traffic',Catalog:'meta-catalog',Leads:'meta-leads',Awareness:'meta-awareness',Reach:'meta-awareness',VideoViews:'meta-video',AppInstalls:'meta-app'};
    return Object.values(window.MM_DATA||{}).flatMap(ds=>ds.rows.filter(r=>map[r[2]]).map((r,i)=>{
      const id=map[r[2]], prod=E.products.find(x=>x.id===id),model=prod.model;
      return {id:'public-'+ds.id+'-'+i,brand:'공통 참고',industry:r[0],device:r[1]==="통합"?"전체":r[1],product:id,media:ds.label,campaign:r[2],model,rate:model==='CPC'?r[3]:model==='CPM'?r[5]:model==='CPV'?r[6]:r[8],ctr:r[4],vtr:r[7],source:'기존 간편 플래너 2024~2025 (원시 집행데이터 미검증)',sourceDate:'',sourceKind:'참고값',note:'익명화·변형된 과거 참고값. 최신 보장 단가가 아닙니다.'};
    }));
  }
  const allBench=()=>db.benchmarks.concat(publicBench());
  function field(k,label,type='text',obj=p(),scope='plan') {return `<label>${label}<input data-scope="${scope}" data-field="${k}" type="${type}" value="${esc(obj[k])}" ${type==='number'?'step="any" min="0"':''}></label>`;}
  function select(k,label,opts,obj=p(),scope='plan') {return `<label>${label}<select data-scope="${scope}" data-field="${k}">${opts.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${String(obj[k])===String(v)?'selected':''}>${esc(l)}</option>`;}).join('')}</select></label>`;}
  const button=(action,text,cls='')=>`<button type="button" class="${cls}" data-action="${action}">${text}</button>`;
  function render() {
    const el=root();if(!el)return;
    const res=E.compute(p());
    el.innerHTML=`<div class="mix-studio">
      <header class="mix-heading"><div><h1>미디어믹스</h1><span>계획 / 벤치마크 / 제출본</span></div><div class="mix-actions">${button('backup','JSON 백업')}${button('import','자료 가져오기')}${button('new','새 계획')}</div></header>
      <div class="mix-toolbar"><nav aria-label="미디어믹스 화면">${[['compose','계획 편집'],['library','벤치마크'],['preview','제출본 검수']].map(([v,l])=>`<button data-view="${v}" aria-pressed="${page===v}">${l}</button>`).join('')}</nav><span id="mix-save" role="status">${esc(notice||'브라우저 전용 저장 · 서버 전송 없음')}</span></div>
      <div class="mix-projects"><label>저장한 계획<select id="mix-saved"><option value="">선택</option>${db.saved.map((s,i)=>`<option value="${i}">${esc(s.client+' · '+s.title)}</option>`).join('')}</select></label>${button('save-plan','계획 저장')}${button('duplicate','계획 복제')}${button('legacy','이전 플래너 입력 가져오기')}</div>
      <div id="mix-body">${page==='compose'?compose(res):page==='library'?library():preview(res)}</div>
      <input type="file" id="mix-file" accept=".json,.xlsx" hidden>
      <dialog id="mix-import-dialog"><h2>가져오기 검토</h2><div id="mix-import-summary"></div><div class="mix-actions">${button('cancel-import','취소')}${button('commit-import','추가')}</div></dialog>
    </div>`;
    bind();
  }
  function compose(res) {
    const r=p().rows[selected];
    return `<section class="mix-section"><h2>제안 정보</h2><div class="mix-fields">${field('client','광고주')}${field('title','제안명')}${field('agency','작성 주체')}${field('date','작성일','date')}${field('start','시작일','date')}${field('end','종료일','date')}</div></section>
      <section class="mix-section"><div class="mix-fields">${field('budget','총 예산 (원)','number')}${select('vatMode','예산 기준',[['ex','VAT 별도'],['in','VAT 포함']])}${field('tax','광고주 청구 VAT (%)','number')}${select('scenario','매체 단가 시나리오',[[100,'기준'],[120,'단가 +20%'],[80,'단가 -20%']])}</div><div class="mix-actions">${button('allocate','잔여 예산 자동 배분','mix-primary')}<span>행 예산: 수수료 포함·VAT 별도 / 단가: 수수료·VAT 제외 실매체비 기준</span></div></section>
      <section class="mix-section"><div class="mix-section-head"><h2>캠페인 구성 <small>${p().rows.length}</small></h2><div class="mix-actions"><select id="mix-product" aria-label="추가할 매체 캠페인">${E.products.map(x=>`<option value="${x.id}">${x.media} · ${x.campaign}</option>`).join('')}</select>${button('add','캠페인 추가')}${button('library','벤치마크 선택')}</div></div>
      <div class="mix-scroll" id="mix-campaign-table"><table><thead><tr><th>매체 / 캠페인</th><th>기기</th><th>기준</th><th>공급가 예산</th><th>실매체비</th><th>예상 물량</th><th>예상 클릭</th><th>예상 전환</th><th>검토</th><th></th></tr></thead><tbody>${res.rows.map((x,i)=>`<tr class="${i===selected?'selected':''}"><td><button data-edit="${i}">${esc(x.name)}<br><strong>${esc(x.type)}</strong></button></td><td>${esc(x.device)}</td><td>${esc(x.model)}</td><td>${n(x.amount)}</td><td>${n(x.media)}</td><td>${n(quantity(x)[1])} ${quantity(x)[0]}</td><td>${n(x.clicks)}</td><td>${n(x.conv,1)} <small>${esc(x.goal)}</small></td><td>${x.approved===true?'확인':'미확인'}</td><td><button data-remove="${i}" title="캠페인 삭제" aria-label="${i+1}행 삭제">×</button></td></tr>`).join('')||'<tr><td colspan="10">선택된 캠페인 없음</td></tr>'}</tbody><tfoot><tr><th colspan="3">합계</th><td>${n(res.totals.amount)}</td><td>${n(res.totals.media)}</td><td>단위별 구분</td><td>${n(res.totals.clicks)}</td><td>${n(res.totals.conv,1)}</td><td colspan="2"></td></tr></tfoot></table></div></section>
      ${r?`<section class="mix-section mix-editor"><div class="mix-section-head"><h2>${selected+1}행 설정</h2>${button('clone-row','행 복제')}</div><div class="mix-fields">${field('media','매체명','text',r,'row')}${field('campaign','캠페인명','text',r,'row')}${select('device','디바이스',['전체','PC','MO','Android','iOS'],r,'row')}${select('goal','전환 정의',['구매','리드','설치','기타'],r,'row')}${select('model','물량 계산 기준',['CPC','CPM','CPV','CPI','SEND','FIXED'],r,'row')}${field('amount','공급가 예산 (원)','number',r,'row')}${field('weight','잔여 예산 배분 가중치','number',r,'row')}${field('markup','실매체비 가산 마크업 (%)','number',r,'row')}${field('rate','기준 단가 (원)','number',r,'row')}${field('ctr','CTR (%)','number',r,'row')}${field('cvr','클릭 기준 CVR (%)','number',r,'row')}${field('aov','구매 객단가 (원)','number',r,'row')}${r.model==='CPV'?field('vtr','조회 / 노출 VTR (%)','number',r,'row'):''}${r.model==='FIXED'?field('fixedImpr','정액 예상 노출','number',r,'row')+field('fixedClicks','정액 예상 클릭','number',r,'row'):''}${field('start','행 시작일 (빈칸=전체)','date',r,'row')}${field('end','행 종료일 (빈칸=전체)','date',r,'row')}${field('target','타기팅','text',r,'row')}${field('source','산출 근거','text',r,'row')}${field('sourceDate','근거 기준일','date',r,'row')}${select('sourceKind','근거 성격',['실적','과거 제안','참고값','가정'],r,'row')}${field('note','비고','text',r,'row')}</div><div class="mix-checks"><label><input type="checkbox" data-scope="row" data-field="locked" ${r.locked?'checked':''}>예산 고정</label><label><input type="checkbox" data-scope="row" data-field="approved" ${r.approved?'checked':''}>단가·전환 정의·출처 검토 확인</label></div></section>`:''}
      <div id="mix-check">${checks(res)}</div>`;
  }
  function checks(res){return `<section class="mix-section"><h2>검수 결과 <small>${res.errors.length}개 미완료</small></h2><div class="mix-totals"><div>공급가<strong>${n(res.totals.amount)}원</strong></div><div>청구 VAT<strong>${n(res.totals.tax)}원</strong></div><div>청구 총액<strong>${n(res.totals.gross)}원</strong></div><div>예산 잔액<strong>${n(res.expected-res.totals.amount)}원</strong></div></div>${res.errors.length?`<ul class="mix-errors">${res.errors.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>`:'<p class="mix-ok">필수 입력 및 예산 검수 통과</p>'}${res.warnings.length?`<details><summary>주의사항 ${res.warnings.length}개</summary><ul>${res.warnings.map(e=>`<li>${esc(e)}</li>`).join('')}</ul></details>`:''}</section>`;}
  function library() {
    const all=allBench(),brands=[...new Set(all.map(b=>b.brand))];
    const list=all.filter(b=>(!brand||b.brand===brand)&&(!mediaFilter||b.product===mediaFilter)&&(!filter||[b.brand,b.campaign,b.device,b.industry,b.source].join(' ').toLowerCase().includes(filter.toLowerCase())));
    return `<section class="mix-section"><div class="mix-section-head"><h2>벤치마크 자료 <small>${list.length}건</small></h2><div class="mix-actions">${button('import','JSON / XLSX 가져오기')}${button('template','엑셀 입력 양식')}</div></div><div class="mix-fields"><label>브랜드<select id="mix-brand"><option value="">전체</option>${brands.map(v=>`<option ${v===brand?'selected':''}>${esc(v)}</option>`).join('')}</select></label><label>매체 / 캠페인<select id="mix-media-filter"><option value="">전체</option>${E.products.map(v=>`<option value="${v.id}" ${v.id===mediaFilter?'selected':''}>${v.media} · ${v.campaign}</option>`).join('')}</select></label><label>검색<input id="mix-filter" value="${esc(filter)}" placeholder="캠페인·업종·기기·출처"></label></div><p class="mix-caption">등록 자료 ${db.benchmarks.length}건 · 공통 자료는 2024~2025 참고값 · 가져온 자료는 현재 브라우저에만 저장</p><div class="mix-scroll"><table><thead><tr><th>브랜드 / 캠페인</th><th>매체 · 기기</th><th>기준</th><th>단가(원)</th><th>CTR(%)</th><th>CVR(%)</th><th>근거</th><th></th></tr></thead><tbody>${list.slice(0,150).map(b=>`<tr><td>${esc(b.brand)}<br>${esc(b.campaign||E.products.find(x=>x.id===b.product).campaign)}<small>${esc(b.industry||'')}</small></td><td>${esc(b.media||E.products.find(x=>x.id===b.product).media)} · ${esc(b.device||'전체')}</td><td>${esc(b.model)}</td><td>${n(E.num(b.rate),2)}</td><td>${n(E.num(b.ctr),2)}</td><td>${n(E.num(b.cvr),2)}</td><td title="${esc(b.source)}">${esc(b.sourceKind)}<br>${esc(b.sourceDate||'기준일 확인 필요')}</td><td><button data-bench="${esc(b.id)}">계획에 추가</button></td></tr>`).join('')||'<tr><td colspan="8">일치하는 자료 없음</td></tr>'}</tbody></table></div>${list.length>150?'<p>검색 조건을 좁히면 나머지 자료도 표시됩니다. (최대 150건 표시)</p>':''}</section>`;
  }
  function preview(res) {
    const pct=(v,d)=>v==null?'—':n(v,d)+'%';
    return checks(res)+`<div class="mix-actions mix-section">${button('xlsx','제출용 XLSX','mix-primary')}${button('draft','검토용 XLSX')}${button('print','인쇄 / PDF')}</div>
      <article class="mix-paper"><h2>${esc(p().client||'광고주 미입력')} · ${esc(p().title)}</h2>
      <p>${esc(p().start)} ~ ${esc(p().end)} / ${esc(p().agency)} / ${esc(p().date)}</p><h3>예상 미디어플랜</h3>
      <div class="mix-scroll"><table><thead><tr><th>매체 / 캠페인</th><th>공급가</th><th>예상 물량</th><th>예상 노출</th><th>예상 클릭</th><th>CTR</th><th>예상 전환</th><th>예상 매출</th><th>ROAS</th></tr></thead><tbody>
      ${res.rows.map(r=>`<tr><td>${esc(r.name)}<br>${esc(r.type)}</td><td>${n(r.amount)}</td><td>${n(quantity(r)[1])} ${quantity(r)[0]}</td><td>${n(r.impr)}</td><td>${n(r.clicks)}</td><td>${pct(r.ctr,2)}</td><td>${n(r.conv,1)} ${esc(r.goal)}</td><td>${n(r.revenue)}</td><td>${pct(r.roas,1)}</td></tr>`).join('')}</tbody></table></div>
      <p>공급가 ${n(res.totals.amount)}원 + VAT ${n(res.totals.tax)}원 = 청구 총액 ${n(res.totals.gross)}원</p>
      <p>예상치는 성과를 보장하지 않습니다. 단가·CTR·CVR은 계획 가정이며 예산, 기간, 소재, 타기팅에 따라 달라집니다. CPC·CPM은 실매체비 기준, CPA·ROAS는 수수료 포함 공급가 기준입니다. 미산출 항목은 —로 표시하며 구매·리드·설치는 합산하지 않습니다. 메시지 발송량은 클릭수에 합산하지 않습니다.</p>
      <h3>산출 근거 및 운영 조건</h3><ul class="mix-evidence">${res.rows.map(r=>`<li><strong>${esc(r.name)} · ${esc(r.type)}</strong>: ${esc(r.source)} / ${esc(r.sourceKind)} / 기준일 ${esc(r.sourceDate||'미입력')}<br>기간 ${esc(r.start)} ~ ${esc(r.end)} / ${esc(r.device)} / ${esc(r.target||'타기팅 미입력')}${r.note?'<br>'+esc(r.note):''}</li>`).join('')}</ul>
      ${res.errors.length?'<strong>검토용 초안 · 미완료 항목 존재</strong>':''}${res.warnings.length?`<ul>${res.warnings.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}</article>`;
  }
  function addBench(id) {
    const b=allBench().find(x=>x.id===id);if(!b)return;
    const defaults=E.row(b.product), model=b.model||defaults.model;
    p().rows.push({...defaults,...copy(b),model,goal:b.goal||defaults.goal,device:b.device||defaults.device,sourceKind:b.sourceKind||'참고값',markup:b.markup==null||b.markup===''?0:b.markup,approved:false,locked:model==='FIXED',amount:b.amount||0,weight:b.amount||1,source:b.source,rate:b.rate??'',ctr:b.ctr??'',cvr:b.cvr??'',aov:b.aov??''});selected=p().rows.length-1;page='compose';save();render();
  }
  function download(data,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);}
  let pending=null;
  async function importFile(file){
    if(!file)return;try{
      if(file.size>15*1024*1024)throw Error('15MB 이하 파일만 지원합니다.');
      pending=file.name.toLowerCase().endsWith('.xlsx')?await window.MixWorkbook.importBench(await file.arrayBuffer(),file.name):JSON.parse(await file.text());
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
    }catch(e){pending=null;alert('가져오기 실패: '+e.message);}
  }
  async function act(action) {
    try {
      if(action==='library'){page='library';render();return;}
      if(action==='import'){document.getElementById('mix-file').click();return;}
      if(action==='cancel-import'){document.getElementById('mix-import-dialog').close();pending=null;return;}
      if(action==='commit-import'){
        if(!pending)throw Error('가져올 자료를 다시 선택하세요.');
        if(pending.kind==='mix-backup'){download(recoveryRaw??JSON.stringify({kind:'mix-backup',db},null,2),'미디어믹스_복원전백업.json','application/json');db=pending.db;recoveryRaw=null;}
        else{const ids=new Set(db.benchmarks.map(b=>b.id));db.benchmarks.push(...pending.benchmarks.filter(b=>!ids.has(b.id)));}
        pending=null;page='library';selected=-1;
      }
      if(action==='backup'){download(recoveryRaw??JSON.stringify({kind:'mix-backup',db},null,2),'미디어믹스_백업.json','application/json');return;}
      if(action==='new'){if(!confirm('현재 계획은 저장한 계획에 보관하고 새 계획을 열까요?'))return;if(p().rows.length)db.saved.push(copy(p()));db.plan=E.plan();selected=-1;page='compose';}
      if(action==='save-plan'){db.saved.push(copy(p()));}
      if(action==='duplicate'){db.saved.push(copy(p()));db.plan=copy(p());p().title+=' (복제)';p().rows.forEach(r=>r.approved=false);}
      if(action==='add'){p().rows.push(E.row(document.getElementById('mix-product').value));selected=p().rows.length-1;}
      if(action==='clone-row'&&selected>=0){p().rows.push({...copy(p().rows[selected]),approved:false});selected=p().rows.length-1;}
      if(action==='allocate'){E.allocate(p());p().rows.forEach(r=>r.approved=false);}
      if(action==='legacy'){
        const old=loadToolState('mediamix');if(!old?.rows?.length)throw Error('이전 입력이 없습니다.');
        if(p().rows.length)db.saved.push(copy(p()));db.plan=E.plan();Object.assign(p(),{client:old.client||'',title:old.campaign||'이전 미디어믹스',budget:E.num(old.budget)||0,vatMode:old.vatMode||'ex'});
        p().rows=old.rows.map(r=>({...E.row('custom'),media:r.media||old.platform,campaign:r.adType||r.channel,weight:E.num(r.ratio)||0,rate:r.cpc||'',ctr:r.ctr||'',cvr:r.cvr||old.cvr||'',aov:r.aov||old.aov||'',markup:E.num(r.markup)||E.num(old.markup)||0,source:'이전 플래너 입력 (단가 기준 재확인)',note:r.note||''}));E.allocate(p());page='compose';selected=0;
      }
      if(action==='print'){if(E.compute(p()).errors.length)throw Error('제출본 필수 검수를 완료한 후 인쇄하세요.');document.body.classList.add('mix-print');window.print();document.body.classList.remove('mix-print');return;}
      if(action==='xlsx'||action==='draft'){const res=E.compute(p());if(action==='xlsx'&&res.errors.length)throw Error('필수 검수 '+res.errors.length+'개를 완료하세요. 초안은 검토용 XLSX로 받을 수 있습니다.');await window.MixWorkbook.exportPlan(p(),res,action==='draft');return;}
      if(action==='template'){await window.MixWorkbook.template();return;}
      save();render();
    }catch(e){alert(e.message);}
  }
  function bindRows(){
    root().querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{selected=+b.dataset.edit;render();root().querySelector('.mix-editor')?.scrollIntoView({block:'nearest'});});
    root().querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(confirm('이 캠페인을 계획에서 제거할까요?')){p().rows.splice(+b.dataset.remove,1);selected=-1;save();render();}});
  }
  // Keep active inputs in place while recalculating, so blur never swallows a click.
  function refreshComputed(){
    const res=E.compute(p()),table=root().querySelector('#mix-campaign-table');
    if(table){const fragment=document.createElement('template');fragment.innerHTML=compose(res);const left=table.scrollLeft;table.innerHTML=fragment.content.querySelector('#mix-campaign-table').innerHTML;table.scrollLeft=left;bindRows();}
    const check=root().querySelector('#mix-check');if(check)check.innerHTML=checks(res);
    root().querySelector('#mix-save').textContent=notice;
    const approved=root().querySelector('[data-field="approved"]');if(approved)approved.checked=p().rows[selected]?.approved===true;
  }
  function bind(){
    root().querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>act(b.dataset.action));
    root().querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{page=b.dataset.view;render();});
    bindRows();
    root().querySelectorAll('[data-bench]').forEach(b=>b.onclick=()=>addBench(b.dataset.bench));
    root().querySelectorAll('[data-field]').forEach(el=>{
      const update=()=>{const obj=el.dataset.scope==='row'?p().rows[selected]:p();obj[el.dataset.field]=el.type==='checkbox'?el.checked:el.value;if(el.dataset.scope==='row'&&el.dataset.field!=='approved')obj.approved=false;if(el.dataset.scope==='plan')p().rows.forEach(r=>r.approved=false);save();if(el.dataset.field==='model')render();else refreshComputed();};
      if(el.tagName==='INPUT'&&el.type!=='checkbox')el.oninput=update;else el.onchange=update;
    });
    document.getElementById('mix-file').onchange=e=>importFile(e.target.files[0]);
    document.getElementById('mix-saved').onchange=e=>{if(e.target.value!==''&&confirm('현재 계획을 보관하고 선택한 계획을 열까요?')){const next=copy(db.saved[+e.target.value]);if(p().rows.length)db.saved.push(copy(p()));db.plan=next;selected=-1;save();render();}};
    for(const [id,set]of [['mix-brand',v=>brand=v],['mix-media-filter',v=>mediaFilter=v],['mix-filter',v=>filter=v]]){const e=document.getElementById(id);if(e)e.onchange=()=>{set(e.value);render();};}
  }
  window.renderMediamixTool=render;
  window.mediamixPrefill=function(o){filter=o?.industry||'';page='library';render();if(typeof showPage==='function')showPage('tool-mediamix');};
  const oldLookup=window.mmRenderLookup;
  window.mmRenderLookup=function(el){oldLookup(el);const block=document.createElement('div');block.className='mix-studio';block.innerHTML=`<section class="mix-section"><h2>브랜드별 캠페인 벤치마크</h2><p>브라우저에 등록된 자료 ${db.benchmarks.length}건</p><button id="mix-open-library">브랜드 / 캠페인 자료 열기</button></section>`;el.before(block);block.querySelector('button').onclick=()=>{page='library';render();showPage('tool-mediamix');};};
})();
