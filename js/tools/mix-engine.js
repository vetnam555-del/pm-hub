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
  const num = v => { if (v === null || v === undefined || String(v).trim() === '') return null; const s=String(v).replace(/,/g,'').trim(); return /^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(s) && Number.isFinite(Number(s)) ? Number(s) : null; };
  const div = (a,b,m=1) => a != null && b > 0 ? a / b * m : null;
  const day = s => { if (!/^\d{4}-\d{2}-\d{2}$/.test(s||'')) return null; const t=Date.parse(s+'T00:00:00Z'); return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===s?t:null; };
  const days = (a,b) => day(a)!=null && day(b)>=day(a) ? (day(b)-day(a))/86400000+1 : null;
  const row = (id='naver-search') => ({product:id,media:'',campaign:'',device:'전체',goal:id==='meta-leads'?'리드':id.endsWith('-app')?'설치':id==='kakao-message'?'기타':'구매',model:(products.find(p=>p.id===id)||products[1]).model,amount:0,weight:1,locked:false,markup:0,rate:'',ctr:'',cvr:'',aov:'',vtr:'',fixedImpr:'',fixedClicks:'',start:'',end:'',target:'',note:'',source:'직접 입력',sourceDate:'',sourceKind:'가정',approved:false});
  const plan = () => ({version:1,client:'',title:'미디어믹스 제안',agency:'HLL중앙',date:'',start:'',end:'',budget:10000000,vatMode:'ex',tax:10,scenario:100,rows:[]});
  function allocate(p) {
    const budget=num(p.budget), tax=num(p.tax);
    if (!(budget>=0) || !(tax>=0&&tax<=100)) throw Error('예산·청구 VAT를 확인하세요.');
    const total=Math.round(p.vatMode==='in'?budget/(1+tax/100):budget);
    const locked=p.rows.filter(r=>r.locked).reduce((s,r)=>s+(num(r.amount)||0),0);
    if (locked>total) throw Error('고정 예산이 총 공급가를 초과합니다.');
    const free=p.rows.filter(r=>!r.locked), w=free.reduce((s,r)=>s+(num(r.weight)||0),0);
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
    if (!(tax>=0&&tax<=100)) errors.push('청구 VAT는 0~100%여야 합니다.');
    if (!(budget>0)) errors.push('총 예산은 0보다 커야 합니다.');
    if (!(factor>0)) errors.push('단가 시나리오 배율을 확인하세요.');
    if (!p.client?.trim() || !p.title?.trim() || day(p.date)==null) errors.push('광고주·제안명·유효한 작성일이 필요합니다.');
    if (days(p.start,p.end)==null) errors.push('집행 시작일·종료일을 확인하세요.');
    if (!p.rows.length) errors.push('캠페인을 추가하세요.');
    const expected=budget==null||tax==null?null:Math.round(p.vatMode==='in'?budget/(1+tax/100):budget);
    const rows=p.rows.map((r,i)=>{
      const product=products.find(x=>x.id===r.product)||products[products.length-1], prefix=`${i+1}행`;
      const amount=num(r.amount), markup=num(r.markup), rate=num(r.rate), ctr=num(r.ctr), cvr=num(r.cvr), aov=num(r.aov), vtr=num(r.vtr);
      if (!(amount>=0&&Number.isInteger(amount))) errors.push(prefix+': 예산은 0 이상의 정수 원 단위입니다.');
      if (!(markup>=0&&markup<=1000)) errors.push(prefix+': 마크업을 확인하세요.');
      for (const [k,v] of [['CTR',r.ctr],['CVR',r.cvr],['VTR',r.vtr]]) if (v!==''&&v!=null&&!(num(v)>=0&&num(v)<=100)) errors.push(prefix+': '+k+'는 0~100%입니다.');
      for (const k of ['rate','aov','fixedImpr','fixedClicks']) if(r[k]!==''&&r[k]!=null&&!(num(r[k])>=0)) errors.push(prefix+': '+k+' 값이 유효하지 않습니다.');
      if (!['CPC','CPM','CPV','CPI','SEND','FIXED'].includes(r.model)) errors.push(prefix+': 계산 기준을 선택하세요.');
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
      if(!r.approved) errors.push(prefix+': 단가·전환 정의·출처 검토 확인이 필요합니다.');
      if(!r.source?.trim()) errors.push(prefix+': 산출 근거를 기입하세요.');
      if(!r.sourceDate) warnings.push(prefix+': 근거 기준일 미입력');
      else if(day(r.sourceDate)!=null&&day(p.date)!=null&&day(p.date)-day(r.sourceDate)>180*86400000) warnings.push(prefix+': 6개월 이상 된 과거 근거입니다.');
      if(r.sourceKind!=='실적') warnings.push(prefix+': '+r.sourceKind+' 기반 예상치');
      if(r.goal==='구매'&&(cvr==null||aov==null)) warnings.push(prefix+': CVR/AOV 미입력, 전환·매출 일부 미산출');
      return {...r,name:r.media||product.media,type:r.campaign||product.campaign,amount,media,fee:amount-media,impr,clicks,views,installs,sends,conv,revenue,start,end,days:nDays,daily:div(amount,nDays),ctr:div(clicks,impr,100),cpc:div(media,clicks),cpm:div(media,impr,1000),cpa:div(amount,conv),roas:div(revenue,amount,100),effectiveRate};
    });
    const sum=k=>rows.reduce((s,r)=>s+(r[k]||0),0), complete=k=>rows.length&&rows.every(r=>r[k]!=null)?sum(k):null;
    const amount=sum('amount'), media=sum('media');
    if(expected!=null&&amount!==expected) errors.push(`예산 불일치: 공급가 ${expected.toLocaleString('ko-KR')}원 / 배분 ${amount.toLocaleString('ko-KR')}원`);
    const totals={amount,media,fee:amount-media,tax:Math.round(amount*(tax||0)/100),impr:complete('impr'),clicks:complete('clicks'),revenue:complete('revenue')};
    totals.gross=amount+totals.tax;
    totals.ctr=div(totals.clicks,totals.impr,100);totals.cpc=div(media,totals.clicks);totals.roas=div(totals.revenue,amount,100);
    totals.conv=new Set(rows.map(r=>r.goal)).size===1?complete('conv'):null;
    totals.cpa=div(amount,totals.conv);
    if(p.vatMode==='in'&&budget!=null&&totals.gross!==budget) warnings.push('원 단위 VAT 반올림으로 총액이 입력 예산과 '+(totals.gross-budget)+'원 다릅니다.');
    return {rows,totals,expected,errors:[...new Set(errors)],warnings:[...new Set(warnings)]};
  }
  function validatePack(pack) {
    if(pack?.version!==1||!Array.isArray(pack.benchmarks)||pack.benchmarks.length>3000) throw Error('지원하지 않는 데이터팩입니다.');
    pack.benchmarks.forEach((r,i)=>{if(!r.id||!r.brand||!r.source||!products.some(p=>p.id===r.product))throw Error((i+1)+'행의 ID·브랜드·출처·매체를 확인하세요.');for(const k of ['rate','ctr','cvr','aov','markup','amount','fixedClicks','fixedImpr'])if(r[k]!=null&&r[k]!==''&&!(num(r[k])>=0))throw Error((i+1)+'행의 '+k+' 오류');});
    if(new Set(pack.benchmarks.map(r=>r.id)).size!==pack.benchmarks.length) throw Error('중복 ID가 있습니다.');
    return pack;
  }
  root.MixEngine={products,num,days,row,plan,allocate,compute,validatePack};
  if(typeof module!=='undefined')module.exports=root.MixEngine;
})(typeof window!=='undefined'?window:globalThis);
