/* Pure forecast engine. All rate inputs: net media spend, KRW, percent points. */
(function (root) {
  'use strict';
  const products = [
    ['naver-brand','네이버','브랜드검색','FIXED'],['naver-search','네이버','파워링크','CPC'],['naver-shopping','네이버','쇼핑검색','CPC'],
    ['naver-gfa','네이버 GFA','전환','CPC'],['naver-gfa-catalog','네이버 GFA','카탈로그','CPC'],['naver-gfa-traffic','네이버 GFA','트래픽','CPC'],
    ['google-search','구글','검색','CPC'],['google-shopping','구글','쇼핑','CPC'],['google-pmax','구글','Performance Max','CPC'],['google-demand','구글','Demand Gen','CPC'],['google-display','구글','디스플레이','CPM'],['google-video','구글','YouTube','CPV'],['google-app','구글','앱 설치','CPI'],
    ['meta-sales','메타','판매','CPC'],['meta-traffic','메타','트래픽','CPC'],['meta-catalog','메타','카탈로그','CPC'],['meta-leads','메타','잠재고객','CPC'],['meta-awareness','메타','인지도','CPM'],
    ['meta-video','메타','동영상 조회','CPV'],['meta-app','메타','앱 설치','CPI'],
    ['kakao-biz','카카오','비즈보드','CPC'],['kakao-display','카카오','디스플레이','CPC'],['kakao-search','카카오','검색','CPC'],['kakao-message','카카오','채널 메시지','SEND'],
    ['criteo-lf','크리테오','리타겟팅 LF','CPC'],['criteo-cca','크리테오','신규 고객 CCA','CPC'],['criteo-lal','크리테오','유사 고객','CPC'],
    ['daangn','당근','지역 광고','CPC'],['tiktok','틱톡','인피드','CPM'],['toss','토스','디스플레이','CPM'],['custom','직접 입력','기타','CPC']
  ].map(([id,media,campaign,model]) => ({id,media,campaign,model}));
  const num = v => { if (!['number','string'].includes(typeof v) || String(v).trim() === '') return null; const s=String(v).trim(); return /^[-+]?(?:(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d*)?|\.\d+)$/.test(s) && Number.isFinite(Number(s.replace(/,/g,''))) ? Number(s.replace(/,/g,'')) : null; };
  const valid = (v,min=0,max=Number.MAX_SAFE_INTEGER) => num(v)!=null && num(v)>=min && num(v)<=max;
  const present = v => v!=='' && v!=null;
  const models=['CPC','CPM','CPV','CPI','SEND','FIXED'], goals=['구매','리드','설치','기타'], kinds=['실적','과거 제안','참고값','가정'];
  const div = (a,b,m=1) => a != null && b > 0 ? a / b * m : null;
  const day = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) return null; const t=Date.parse(s+'T00:00:00Z'); return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:null; };
  const days = (a,b) => day(a)!=null && day(b)!=null && day(b)>=day(a) ? (day(b)-day(a))/86400000+1 : null;
  const row = (id='naver-search') => ({product:id,media:'',campaign:'',device:'전체',goal:id==='meta-leads'?'리드':id.endsWith('-app')?'설치':id==='kakao-message'?'기타':'구매',model:(products.find(p=>p.id===id)||products[1]).model,amount:0,weight:1,locked:false,markup:0,rate:'',ctr:'',cvr:'',aov:'',vtr:'',fixedImpr:'',fixedClicks:'',start:'',end:'',target:'',note:'',source:'직접 입력',sourceDate:'',sourceKind:'가정',approved:false});
  const plan = () => ({version:1,client:'',title:'미디어믹스 제안',agency:'HLL중앙',date:'',start:'',end:'',budget:10000000,vatMode:'ex',tax:10,scenario:100,margin:'',otherCost:'',rows:[]});
  // 손익분기 — 광고비를 빼고도 남는지 판정하는 기준선.
  //   손익분기 CPA  = 객단가 × 마진율/100 − 건당 기타 변동비  (= 건당 공헌이익)
  //   손익분기 ROAS = 기타 변동비 0 이면 100 ÷ (마진율/100), 아니면 객단가 ÷ 공헌이익 × 100
  //   공헌이익 ≤ 0 이면 광고비가 0이어도 적자라 본전 자체가 불가능하다(unreachable).
  // 이 프로젝트에서 손익분기 공식은 여기 한 곳에만 둔다(budget.js 가 이 함수를 호출한다).
  function breakEven(aov, margin, other) {
    const a=num(aov), m=num(margin), o=num(other)==null?0:num(other);
    const marginValid = m!=null && m>0 && m<=100 && o>=0;
    const beCpa = (a!=null && a>0 && marginValid) ? a*(m/100)-o : null;
    const hasOther = o>0;
    let beRoas=null, unreachable=false;
    if (marginValid) {
      if (hasOther) {
        if (beCpa!=null && beCpa>0) beRoas=a/beCpa*100;
        else if (beCpa!=null) unreachable=true;
      } else if (a!=null && a>0) beRoas=100/(m/100);
      else beRoas=100/(m/100);
    }
    return {marginValid,beCpa,beRoas,unreachable,other:o,hasOther,margin:m,aov:a};
  }
  function allocate(p) {
    const budget=num(p.budget), tax=num(p.tax);
    if (!valid(budget) || !Number.isSafeInteger(budget) || !valid(tax,0,100) || !['in','ex'].includes(p.vatMode)) throw Error('예산·청구 VAT를 확인하세요.');
    if (p.rows.some(r=>!valid(r.amount)||!Number.isSafeInteger(num(r.amount))||(!r.locked&&!valid(r.weight)))) throw Error('행 예산은 정수 원, 가중치는 0 이상의 숫자로 입력하세요.');
    const total=Math.round(p.vatMode==='in'?budget/(1+tax/100):budget);
    const locked=p.rows.filter(r=>r.locked===true).reduce((s,r)=>s+num(r.amount),0);
    if (locked>total) throw Error('고정 예산이 총 공급가를 초과합니다.');
    const free=p.rows.filter(r=>r.locked!==true), w=free.reduce((s,r)=>s+num(r.weight),0);
    if (free.some(r=>num(r.weight)<0) || p.rows.some(r=>num(r.amount)<0)) throw Error('예산·가중치는 음수일 수 없습니다.');
    if (total>locked && w<=0) throw Error('잔여 예산을 배분할 행과 양의 가중치가 필요합니다.');
    const splits=free.map(r=>{const exact=(total-locked)*(num(r.weight)||0)/(w||1);return {r,value:Math.floor(exact),fraction:exact%1};});
    let rest=total-locked-splits.reduce((s,x)=>s+x.value,0);
    splits.sort((a,b)=>b.fraction-a.fraction).forEach(x=>{if(rest>0){x.value++;rest--;} x.r.amount=x.value;});
    return p;
  }
  function compute(p) {
    const errors=[], warnings=[];
    const tax=num(p.tax), budget=num(p.budget), factor=num(p.scenario)/100;
    if (!valid(tax,0,100)) errors.push('청구 VAT는 0~100%여야 합니다.');
    if (!(budget>0&&Number.isSafeInteger(budget))) errors.push('총 예산은 0보다 큰 정수 원 단위여야 합니다.');
    if (!['in','ex'].includes(p.vatMode)) errors.push('예산의 VAT 포함·별도 기준을 선택하세요.');
    if (!(factor>0)) errors.push('단가 시나리오 배율을 확인하세요.');
    if (!p.client?.trim() || !p.title?.trim() || day(p.date)==null) errors.push('광고주·제안명·유효한 작성일이 필요합니다.');
    if (days(p.start,p.end)==null) errors.push('집행 시작일·종료일을 확인하세요.');
    if (!p.rows.length) errors.push('캠페인을 추가하세요.');
    const expected=budget==null||tax==null?null:Math.round(p.vatMode==='in'?budget/(1+tax/100):budget);
    const rows=p.rows.map((r,i)=>{
      const product=products.find(x=>x.id===r.product)||products[products.length-1], prefix=`${i+1}행`;
      const amount=num(r.amount), markup=num(r.markup), rate=num(r.rate), ctr=num(r.ctr), cvr=num(r.cvr), aov=num(r.aov), vtr=num(r.vtr);
      if (!valid(amount)||!Number.isSafeInteger(amount)) errors.push(prefix+': 예산은 0 이상의 정수 원 단위입니다.');
      if (!valid(markup,0,1000)) errors.push(prefix+': 마크업을 확인하세요.');
      for (const [k,v] of [['CTR',r.ctr],['CVR',r.cvr],['VTR',r.vtr]]) if (present(v)&&!valid(v,0,100)) errors.push(prefix+': '+k+'는 0~100%입니다.');
      for (const k of ['rate','aov','fixedImpr','fixedClicks']) if(present(r[k])&&!valid(r[k])) errors.push(prefix+': '+k+' 값이 유효하지 않습니다.');
      if (!models.includes(r.model)) errors.push(prefix+': 계산 기준을 선택하세요.');
      if (!goals.includes(r.goal)) errors.push(prefix+': 전환 정의를 선택하세요.');
      if (!products.some(x=>x.id===r.product)) errors.push(prefix+': 매체 유형이 유효하지 않습니다.');
      if (!kinds.includes(r.sourceKind)) errors.push(prefix+': 근거 성격을 확인하세요.');
      const start=r.start||p.start,end=r.end||p.end,nDays=days(start,end);
      if (!nDays || day(start)<day(p.start) || day(end)>day(p.end)) errors.push(prefix+': 행 기간이 전체 기간 안에 있어야 합니다.');
      const media=amount!=null&&markup!=null?amount/(1+markup/100):null, effectiveRate=rate>0?rate*factor:null;
      let impr=null,clicks=null,views=null,installs=null,sends=null;
      if(r.model==='CPC') {clicks=div(media,effectiveRate); impr=div(clicks,ctr,100);}
      if(r.model==='CPM') {impr=div(media,effectiveRate,1000);clicks=impr!=null&&ctr!=null?impr*ctr/100:null;}
      if(r.model==='CPV') {views=div(media,effectiveRate);impr=div(views,vtr,100);clicks=impr!=null&&ctr!=null?impr*ctr/100:null;}
      if(r.model==='CPI') installs=div(media,effectiveRate);
      if(r.model==='SEND') sends=div(media,effectiveRate);
      if(r.model==='FIXED') {impr=num(r.fixedImpr);clicks=num(r.fixedClicks);if(clicks==null&&impr!=null&&ctr!=null) clicks=impr*ctr/100;if(impr==null&&clicks!=null) impr=div(clicks,ctr,100);}
      if(r.model!=='FIXED'&&amount>0&&!(rate>0)) errors.push(prefix+': 단가가 필요합니다.');
      if(r.model==='FIXED'&&amount>0&&impr==null&&clicks==null) warnings.push(prefix+': 정액 계약의 예상 물량이 없습니다.');
      if(clicks!=null&&impr!=null&&clicks>impr) errors.push(prefix+': 예상 클릭이 노출보다 큽니다.');
      const conv=r.model==='CPI'?installs:(clicks!=null&&cvr!=null?clicks*cvr/100:null);
      const revenue=r.goal==='구매'&&conv!=null&&aov!=null?conv*aov:null;
      if(r.model==='CPI'&&r.goal!=='설치') errors.push(prefix+': CPI 기준의 전환 정의는 설치여야 합니다.');
      if(r.approved!==true) errors.push(prefix+': 단가·전환 정의·출처 검토 확인이 필요합니다.');
      if(!r.source?.trim()) errors.push(prefix+': 산출 근거를 기입하세요.');
      if(!r.sourceDate) warnings.push(prefix+': 근거 기준일 미입력');
      else if(day(r.sourceDate)==null) errors.push(prefix+': 근거 기준일이 유효하지 않습니다.');
      else if(day(p.date)!=null&&day(p.date)-day(r.sourceDate)>180*86400000) warnings.push(prefix+': 6개월 이상 된 과거 근거입니다.');
      else if(day(r.sourceDate)>day(p.date)) warnings.push(prefix+': 근거 기준일이 작성일보다 미래입니다.');
      if(r.sourceKind!=='실적') warnings.push(prefix+': '+r.sourceKind+' 기반 예상치');
      if(r.goal==='구매'&&(cvr==null||aov==null)) warnings.push(prefix+': CVR/AOV 미입력, 전환·매출 일부 미산출');
      if(r.goal==='리드'&&cvr==null) warnings.push(prefix+': 리드 CVR 미입력, 리드·CPA 미산출');
      if((r.model==='CPC'&&ctr===0)||(r.model==='CPV'&&vtr===0)) errors.push(prefix+': 역산에 사용하는 CTR/VTR은 0보다 커야 합니다.');
      for(const v of [media,impr,clicks,views,installs,sends,conv,revenue]) if(v!=null&&!Number.isFinite(v)) errors.push(prefix+': 산출 범위를 초과했습니다. 단가·예산을 확인하세요.');
      return {...r,name:r.media||product.media,type:r.campaign||product.campaign,amount,media,fee:amount!=null&&media!=null?amount-media:null,impr,clicks,views,installs,sends,conv,revenue,start,end,days:nDays,daily:div(amount,nDays),ctr:div(clicks,impr,100),cpc:div(media,clicks),cpm:div(media,impr,1000),cpa:div(amount,conv),roas:div(revenue,amount,100),effectiveRate};
    });
    const sum=k=>rows.reduce((s,r)=>s+(r[k]||0),0), complete=k=>rows.length&&rows.every(r=>Number.isFinite(r[k]))?sum(k):null;
    const amount=complete('amount'), media=complete('media');
    if(expected!=null&&amount!==expected) errors.push(`예산 불일치: 공급가 ${expected.toLocaleString('ko-KR')}원 / 배분 ${amount==null?'미산출':amount.toLocaleString('ko-KR')}원`);
    const totals={amount,media,fee:amount!=null&&media!=null?amount-media:null,tax:amount!=null&&valid(tax,0,100)?Math.round(amount*tax/100):null,impr:complete('impr'),clicks:complete('clicks'),revenue:complete('revenue')};
    totals.gross=amount!=null&&totals.tax!=null?amount+totals.tax:null;
    totals.ctr=div(totals.clicks,totals.impr,100);totals.cpc=div(media,totals.clicks);totals.roas=div(totals.revenue,amount,100);
    totals.conv=new Set(rows.map(r=>r.goal)).size===1?complete('conv'):null;
    totals.cpa=div(amount,totals.conv);
    if(p.vatMode==='in'&&budget!=null&&totals.gross!=null&&totals.gross!==budget) warnings.push('원 단위 VAT 반올림으로 총액이 입력 예산과 '+(totals.gross-budget)+'원 다릅니다.');
    // 손익분기 — 마진율이 있을 때만 판정한다. 계획 전체를 대표할 객단가가 필요해
    // 구매 목적 행들의 '전환 가중 평균 객단가'를 쓴다(행마다 객단가가 다를 수 있다).
    let be=null;
    if(present(p.margin)&&!valid(p.margin,0,100)) errors.push('마진율은 0~100%여야 합니다.');
    if(present(p.otherCost)&&!valid(p.otherCost)) errors.push('건당 기타 변동비를 확인하세요.');
    if(present(p.margin)&&num(p.margin)>0){
      if(!valid(p.margin,0,100)) errors.push('마진율은 0~100%여야 합니다.');
      if(present(p.otherCost)&&!valid(p.otherCost)) errors.push('건당 기타 변동비를 확인하세요.');
      const buy=rows.filter(r=>r.goal==='구매'&&num(r.aov)>0&&r.conv!=null&&r.conv>0);
      const convSum=buy.reduce((a,r)=>a+r.conv,0);
      const aovAvg=convSum>0?buy.reduce((a,r)=>a+num(r.aov)*r.conv,0)/convSum:null;
      if(aovAvg!=null){
        be=breakEven(aovAvg,p.margin,p.otherCost);
        be.roas=totals.roas;
        be.pass=(totals.roas!=null&&be.beRoas!=null)?totals.roas>=be.beRoas:null;
        if(be.unreachable) warnings.push('기타 변동비가 마진금액을 넘어, 광고비가 0이어도 본전 도달이 불가능한 조건입니다.');
        else if(be.pass===false) warnings.push('예상 ROAS가 손익분기 ROAS에 못 미칩니다.');
      } else warnings.push('손익분기 판정에 필요한 구매 전환·객단가가 없어 판정을 생략했습니다.');
    }
    return {rows,totals,expected,be,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
  }
  function validatePlan(p) {
    if(!p||typeof p!=='object'||Array.isArray(p)||!Array.isArray(p.rows)||p.rows.length>300) throw Error('계획 구조 또는 캠페인 수(최대 300개) 오류');
    const text=(o,keys)=>keys.forEach(k=>{if(o[k]!=null&&(typeof o[k]!=='string'||o[k].length>20000))throw Error(k+' 텍스트 형식 오류');});
    text(p,['client','title','agency','date','start','end','vatMode','autoSummary']);
    if(p.autoEnabled!=null&&typeof p.autoEnabled!=='boolean')throw Error('자동 배분 설정 오류');
    if(p.autoSettings!=null){
      const a=p.autoSettings;if(typeof a!=='object'||Array.isArray(a))throw Error('업종 설정 오류');
      text(a,['industry','objective','device']);
      for(const k of ['feed','audience','allowReference'])if(a[k]!=null&&typeof a[k]!=='boolean')throw Error('업종 설정 오류');
      for(const k of ['minDaily','maxChannels','markup'])if(a[k]!=null&&!['number','string'].includes(typeof a[k]))throw Error('자동 배분 수치 오류');
    }
    if(p.autoExcluded!=null&&(!Array.isArray(p.autoExcluded)||p.autoExcluded.length>100||p.autoExcluded.some(x=>typeof x!=='string'||x.length>2000)))throw Error('제외 매체 형식 오류');
    for(const k of ['budget','tax','scenario','margin','otherCost'])if(p[k]!=null&&!['string','number'].includes(typeof p[k]))throw Error(k+' 입력 형식 오류');
    const result={...plan(),...p};
    result.rows=p.rows.map(r=>{
      if(!r||typeof r!=='object'||Array.isArray(r)||!products.some(x=>x.id===r.product))throw Error('캠페인 구조 오류');
      text(r,['media','campaign','device','goal','model','start','end','target','note','source','sourceDate','sourceKind']);
      for(const k of ['amount','weight','markup','rate','ctr','cvr','aov','vtr','fixedImpr','fixedClicks'])if(r[k]!=null&&!['string','number'].includes(typeof r[k]))throw Error(k+' 입력 형식 오류');
      for(const k of ['approved','locked'])if(r[k]!=null&&typeof r[k]!=='boolean')throw Error(k+' 확인 형식 오류');
      return {...row(r.product),...r};
    });
    return result;
  }
  function validateBackup(db) {
    if(!db||!Array.isArray(db.saved)||db.saved.length>500)throw Error('저장 계획 구조 또는 수(최대 500개) 오류');
    validatePack({version:1,benchmarks:db.benchmarks});
    if(db.preferences!=null)validatePlan({...plan(),autoSettings:db.preferences});
    return {...db,plan:validatePlan(db.plan),saved:db.saved.map(validatePlan)};
  }
  function validatePack(pack) {
    if(pack?.version!==1||!Array.isArray(pack.benchmarks)||pack.benchmarks.length>3000) throw Error('지원하지 않는 데이터팩입니다.');
    pack.benchmarks.forEach((r,i)=>{
      if(!r||!['id','source'].every(k=>typeof r[k]==='string'&&r[k].trim())||!(r.brand?.trim()||r.industry?.trim())||!products.some(p=>p.id===r.product))throw Error((i+1)+'행의 ID·업종(또는 기존 브랜드)·출처·매체를 확인하세요.');
      for(const k of ['id','brand','source','media','campaign','device','industry','note','sourceDate','sourceKind','goal','model'])if(r[k]!=null&&(typeof r[k]!=='string'||r[k].length>20000))throw Error((i+1)+'행의 '+k+' 텍스트 오류');
      for(const k of ['rate','ctr','cvr','vtr','aov','markup','amount','fixedClicks','fixedImpr'])if(present(r[k])&&!valid(r[k],0,['ctr','cvr','vtr'].includes(k)?100:k==='markup'?1000:Number.MAX_SAFE_INTEGER))throw Error((i+1)+'행의 '+k+' 오류');
      if(present(r.amount)&&!Number.isSafeInteger(num(r.amount)))throw Error((i+1)+'행 예산은 정수 원 단위입니다.');
      if(present(r.model)&&!models.includes(r.model))throw Error((i+1)+'행 계산 기준 오류');
      if(present(r.goal)&&!goals.includes(r.goal))throw Error((i+1)+'행 전환 정의 오류');
      if(present(r.sourceKind)&&!kinds.includes(r.sourceKind))throw Error((i+1)+'행 근거 성격 오류');
      if(present(r.costBasis)&&!['media-net','review-required'].includes(r.costBasis))throw Error((i+1)+'행 비용 기준 오류');
      if(present(r.sourceDate)&&day(r.sourceDate)==null)throw Error((i+1)+'행 근거 기준일 오류');
    });
    if(new Set(pack.benchmarks.map(r=>r.id)).size!==pack.benchmarks.length) throw Error('중복 ID가 있습니다.');
    return pack;
  }
  // ── 성과 리포트 붙여넣기 파서 ─────────────────────────────
  // 매체 리포트 표(TSV/CSV)를 그대로 붙여넣으면 벤치마크 데이터팩으로 바꾼다.
  // imps·click·spending 만 있어도 CTR·CPC·CPM 을 역산하고, order·revenue 가 있으면 CVR·AOV 까지 만든다.
  const REPORT_KEYS={
    media:/^(매체|media|채널|플랫폼)$/i, campaign:/^(캠페인|campaign|그룹|group|광고그룹)$/i,
    imps:/^(imps|impressions?|노출|노출수)$/i, clicks:/^(clicks?|클릭|클릭수)$/i,
    cost:/^(spending|spend|cost|비용|광고비|소진|소진액|집행비)$/i,
    ctr:/^ctr$/i, cpc:/^cpc$/i, cpm:/^cpm$/i, cvr:/^cvr$/i, aov:/^aov$/i,
    conv:/^(oder|orders?|conversions?|전환|전환수|주문|주문수)$/i, revenue:/^(revenue|매출|매출액)$/i
  };
  function matchProduct(text,campaign=''){
    const media=String(text||''),t=media+' '+campaign;
    // The media column owns the platform. Campaign words such as "lead" do not override it.
    if(/네이버|naver|gfa|파워링크|브랜드\s*검색|쇼핑\s*검색/i.test(media)){
      if(/gfa/i.test(t))return /카탈로그|catalog/i.test(t)?'naver-gfa-catalog':/트래픽|traffic/i.test(t)?'naver-gfa-traffic':'naver-gfa';
      return /브랜드\s*검색/i.test(t)?'naver-brand':/쇼핑/i.test(t)?'naver-shopping':'naver-search';
    }
    if(/구글|google|유튜브|youtube|gdn|pmax/i.test(media)){
      if(/pmax|퍼포먼스\s*맥스/i.test(t))return 'google-pmax';
      if(/유튜브|youtube|쇼츠|shorts|video/i.test(t))return 'google-video';
      if(/디맨드|demand/i.test(t))return 'google-demand';
      if(/쇼핑|shopping/i.test(t))return 'google-shopping';
      if(/앱|app/i.test(t))return 'google-app';
      return /gdn|디스플레이|display/i.test(t)?'google-display':'google-search';
    }
    if(/메타|meta|페이스북|facebook|인스타/i.test(media)){
      if(/카탈로그|catalog|dpa|다이내믹/i.test(t))return 'meta-catalog';
      if(/잠재고객|리드|lead/i.test(t))return 'meta-leads';
      if(/인지|도달|awareness|reach/i.test(t))return 'meta-awareness';
      if(/영상|릴스|reels|video/i.test(t))return 'meta-video';
      if(/앱|app/i.test(t))return 'meta-app';
      return /판매|sales|purchase/i.test(t)?'meta-sales':'meta-traffic';
    }
    if(/크리테오|criteo/i.test(media))return /cca/i.test(t)?'criteo-cca':/lal|유사/i.test(t)?'criteo-lal':'criteo-lf';
    if(/카카오|kakao/i.test(media))return /메시지|톡|message/i.test(t)?'kakao-message':/검색|search/i.test(t)?'kakao-search':/디스플레이|display|포커스/i.test(t)?'kakao-display':'kakao-biz';
    if(/틱톡|tiktok/i.test(media))return 'tiktok';if(/당근/i.test(media))return 'daangn';if(/토스|toss/i.test(media))return 'toss';
    return null;
  }
  function reportCells(text,sep){
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
      else if(c===sep&&!quoted){row.push(cell.trim());cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(quoted)throw Error('닫히지 않은 CSV 따옴표가 있습니다.');
    row.push(cell.trim());if(row.some(Boolean))rows.push(row);return rows;
  }
  function parseReport(text,opt){
    opt=opt||{};
    const sourceText=String(text||'');let lines;
    try{lines=reportCells(sourceText,sourceText.split(/\r?\n/)[0].includes('\t')?'\t':',');}catch(e){return {error:e.message};}
    if(lines.length<2) return {error:'표를 2줄 이상 붙여넣으세요(헤더 + 데이터).'};
    const cut=l=>l;
    let head=-1,cols=null;
    for(let i=0;i<Math.min(lines.length,12);i++){
      const cells=cut(lines[i]),map={};let hits=0;
      cells.forEach((c,ci)=>{for(const k of Object.keys(REPORT_KEYS))if(map[k]==null&&REPORT_KEYS[k].test(c)){map[k]=ci;hits++;}});
      if(hits>=3){head=i;cols=map;break;}
    }
    if(head<0) return {error:'헤더를 찾지 못했습니다. 매체·imps·click·spending 같은 컬럼명이 있어야 합니다.'};
    const brand=(opt.brand||'').trim();
    if(!brand&&!opt.industry?.trim()) return {error:'업종을 입력하세요. 기존 자료는 브랜드 구분도 지원합니다.'};
    if(opt.percentUnit&&!['points','fraction'].includes(opt.percentUnit))return {error:'비율 표기 기준을 확인하세요.'};
    const costFactor=opt.costFactor==null?1:num(opt.costFactor);
    if(!(costFactor>0))return {error:'비용 환산 계수를 확인하세요.'};
    const benchmarks=[],skipped=[];
    for(let r=head+1;r<lines.length;r++){
      const c=cut(lines[r]);
      const get=k=>cols[k]!=null?num(c[cols[k]]):null;
      // 비율은 "1.61%"(퍼센트)와 0.0161(소수)이 섞여 들어온다. 값 크기로 판단하면
      // CVR 0.18% 같은 작은 퍼센트를 18% 로 부풀린다 → 원본의 '%' 유무로 구분한다.
      const pctOf=k=>{if(cols[k]==null)return null;const raw=c[cols[k]],v=num(String(raw).replace(/%/g,''));
        if(v==null)return null;return String(raw).includes('%')?v:opt.percentUnit==='fraction'?v*100:v;};
      const rawMedia=cols.media!=null?c[cols.media]:'',rawCamp=cols.campaign!=null?c[cols.campaign]:'';
      const label=String(rawMedia||rawCamp||'').trim();
      if(!label||/^(합계|total|계)$/i.test(label))continue;
      const id=matchProduct(rawMedia||rawCamp,rawMedia?rawCamp:'');
      if(!id){skipped.push(label);continue;}
      const prod=products.find(x=>x.id===id);
      const imps=get('imps'),clicks=get('clicks'),rawCost=get('cost'),cost=rawCost==null?null:rawCost/costFactor,conv=get('conv'),revenue=get('revenue');
      let ctr=pctOf('ctr'),cvr=pctOf('cvr'),cpc=get('cpc'),cpm=get('cpm'),aov=get('aov');
      if([imps,clicks,cost,conv,revenue].some(v=>v!=null&&v<0)||(imps!=null&&clicks>imps))return {error:(r+1)+'행 원시 수치가 유효하지 않습니다.'};
      if(imps>0&&clicks!=null)ctr=clicks/imps*100;
      cpc=clicks>0&&cost!=null?cost/clicks:cpc==null?null:cpc/costFactor;
      cpm=imps>0&&cost!=null?cost/imps*1000:cpm==null?null:cpm/costFactor;
      if(clicks>0&&conv!=null)cvr=conv/clicks*100;
      if(conv>0&&revenue!=null)aov=revenue/conv;
      // rate 는 상품의 과금 기준에 맞춰 담는다(CPC 상품이면 CPC, CPM 상품이면 CPM …)
      const rate=prod.model==='CPM'?cpm:prod.model==='CPC'?cpc:null;
      if(rate==null||!(rate>0)){skipped.push(label+'(단가 없음)');continue;}
      const round=(v,d)=>v==null||!Number.isFinite(v)?'':Math.round(v*10**d)/10**d;
      benchmarks.push({
        id:'ref-'+id+'-'+(brand||opt.industry).replace(/\s+/g,'_')+'-'+(opt.sourceDate||'undated')+'-'+(benchmarks.length+1),
        brand,industry:opt.industry||'',device:opt.device||'전체',product:id,
        media:prod.media,campaign:(rawCamp||prod.campaign).slice(0,120),model:prod.model,
        rate:round(rate,6),ctr:round(ctr,6),cvr:opt.goal==='기타'?'':round(cvr,6),aov:opt.goal&&opt.goal!=='구매'?'':round(aov,6),vtr:'',
        goal:opt.goal||(id==='meta-leads'?'리드':prod.model==='CPI'?'설치':'구매'),
        source:(opt.source||'성과 리포트 붙여넣기')+' / '+label,
        sourceDate:opt.sourceDate||'',sourceKind:opt.sourceKind||'실적',costBasis:'media-net',note:'실매체비 환산: 입력 비용 / '+costFactor+'; 비율 '+(opt.percentUnit==='fraction'?'소수':'퍼센트포인트')+'; 원시 분자·분모 우선 역산'
      });
    }
    if(!benchmarks.length) return {error:'매체를 알아보지 못했습니다. 매체 칸에 "카카오 비즈보드", "메타", "네이버 GFA" 처럼 매체명이 들어가야 합니다.',skipped};
    return {pack:{version:1,benchmarks},skipped};
  }

  root.MixEngine={products,num,days,row,plan,allocate,compute,validatePack,validatePlan,validateBackup,breakEven,parseReport,matchProduct};
  if(typeof module!=='undefined')module.exports=root.MixEngine;
})(typeof window!=='undefined'?window:globalThis);
