/* Industry planning: source selection is explicit; allocation is a planning rule, not an optimizer. */
(function(root){
  'use strict';
  const E=root.MixEngine||(typeof require==='function'?require('./mix-engine.js'):null);
  const objectives=['트래픽','구매','리드','인지도','설치'];
  const aliases={'패션':'패션·잡화','스포츠':'패션·잡화','주얼리':'패션·잡화','교육':'교육·커리어','교육·학습':'교육·커리어','뷰티':'뷰티(화장품)','식음료':'식음료(F&B)','전체':'전 업종(통합)'};
  const industry=s=>aliases[String(s||'').trim()]||String(s||'').trim();
  const defaults=()=>({industry:'',objective:'트래픽',device:'MO',feed:false,audience:false,allowReference:true,minDaily:30000,maxChannels:4,markup:0});
  const med=arr=>{const a=arr.filter(Number.isFinite).sort((a,b)=>a-b),i=Math.floor(a.length/2);return a.length?(a.length%2?a[i]:(a[i-1]+a[i])/2):null;};
  const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return (h>>>0).toString(36);};
  function publicBench(data){
    const map={Search:'google-search',Shopping:'google-shopping',Display:'google-display',YouTube_Instream:'google-video',App_Android:'google-app',App_iOS:'google-app',Traffic:'meta-traffic',Catalog:'meta-catalog',Leads:'meta-leads',Awareness:'meta-awareness',VideoViews:'meta-video',AppInstalls:'meta-app'};
    return Object.values(data||{}).flatMap(ds=>ds.rows.filter(r=>map[r[2]]).map((r,i)=>{
      const product=map[r[2]],base=E.row(product),model=base.model;
      return {id:'public-'+ds.id+'-'+i,brand:'공통 참고',industry:r[0],device:r[2]==='App_Android'?'Android':r[2]==='App_iOS'?'iOS':r[1]==='통합'?'전체':r[1],product,model,goal:product==='meta-leads'?'리드':model==='CPI'?'설치':'',
        rate:model==='CPC'?r[3]:model==='CPM'?r[5]:model==='CPV'?r[6]:r[8],ctr:r[4],vtr:r[7],source:'기존 간편 플래너 2024~2025 / '+r[2],sourceDate:'',sourceKind:'참고값',publicReference:true,costBasis:'media-net'};
    }));
  }
  function catalogue(raw,asOf){
    const grouped=new Map(),now=Date.parse(asOf),seen=new Set();
    for(const b of raw){
      const prod=E.products.find(p=>p.id===b.product),sector=industry(b.industry);
      if(!prod||!sector)continue;
      const model=b.model||prod.model,goal=b.goal|| (model==='CPI'?'설치':b.product==='meta-leads'?'리드':'');
      // Same evidence under different IDs must not increase the apparent sample size.
      const fingerprint=JSON.stringify([b.source,b.sourceDate,b.sourceKind,sector,b.product,b.device,goal,model,b.rate,b.ctr,b.cvr,b.aov,b.costBasis]);
      if(seen.has(fingerprint))continue;seen.add(fingerprint);
      const date=Date.parse(b.sourceDate),age=(now-date)/86400000;
      if(Number.isFinite(age)&&age<0)continue;
      const kind=b.sourceKind||'참고값',tier=kind==='실적'?(age>=0&&age<=180?0:1):kind==='과거 제안'?2:kind==='참고값'?3:4;
      const key=JSON.stringify([sector,b.product,b.device||'전체',goal,model,b.costBasis==='media-net'?'media-net':'review-required',(b.sourceDate||'').slice(0,7)]);
      if(!grouped.has(key))grouped.set(key,[]);
      grouped.get(key).push({...b,goal,model,industry:sector,tier});
    }
    return [...grouped.entries()].map(([key,rows])=>{
      const tier=Math.min(...rows.map(r=>r.tier)),pool=rows.filter(r=>r.tier===tier),b=pool[0],prod=E.products.find(p=>p.id===b.product);
      const dates=pool.map(r=>r.sourceDate).filter(Boolean).sort();
      const out={...E.row(b.product),id:'sector-'+hash(key),industry:b.industry,device:b.device||'전체',model:b.model,goal:b.goal,
        media:prod.media,campaign:prod.campaign,sourceKind:b.sourceKind||'참고값',sourceDate:dates[0]||'',sampleCount:pool.length,
        source:`${b.industry} / ${b.publicReference?'간편 플래너 2024~2025 참고':'등록 '+(b.sourceKind||'참고값')} ${pool.length}행`,
        note:`동일 업종·상품·기기·전환 정의의 ${pool.length===1?'단일 자료':'항목별 중앙값'}. 업종 대표 실적 아님. ${dates.length?'근거 기간 '+dates[0]+' ~ '+dates[dates.length-1]:'기준일 미확인'}.`,
        benchmarkIds:pool.map(r=>r.id),benchmarkTier:tier,costBasis:pool.every(r=>r.costBasis==='media-net')?'media-net':'review-required'};
      if(out.costBasis!=='media-net')out.note+=' 단가의 VAT·수수료 기준 확인 필요. 자동 구성 제외.';
      // Conversion assumptions with a different or missing definition are never blended.
      for(const k of ['rate','ctr','vtr','cvr','aov'])out[k]=pool.every(r=>E.num(r[k])!=null)?med(pool.map(r=>E.num(r[k]))):'';
      if(!b.goal||b.goal==='기타'){out.cvr='';out.aov='';}
      if(b.goal!=='구매')out.aov='';
      if(b.model==='FIXED'){
        // A fixed quote cannot be transplanted to another advertiser by removing its name.
        out.rate='';out.fixedImpr='';out.fixedClicks='';out.note+=' 정액 견적·물량은 개별 확인 필요.';
      }
      out.approved=false;out.markup=0;return out;
    }).sort((a,b)=>a.industry.localeCompare(b.industry,'ko')||a.media.localeCompare(b.media,'ko')||a.id.localeCompare(b.id));
  }
  const order={
    '트래픽':['naver-search','google-search','meta-traffic','naver-gfa-traffic','kakao-biz','google-display','daangn','toss'],
    '구매':['naver-shopping','google-shopping','meta-sales','naver-search','google-search','meta-catalog','naver-gfa-catalog','google-pmax','naver-gfa','criteo-lf','meta-traffic','kakao-biz'],
    '리드':['naver-search','meta-leads','google-search','naver-gfa','daangn','meta-traffic','kakao-biz'],
    '인지도':['meta-awareness','google-video','google-display','meta-video','tiktok','toss'],
    '설치':['google-app','meta-app']
  };
  const feeds=new Set(['naver-shopping','google-shopping','meta-catalog','naver-gfa-catalog','criteo-lf','criteo-cca','criteo-lal']);
  const audiences=new Set(['criteo-lf','meta-catalog','naver-gfa-catalog']);
  const deviceMatches=(b,s)=>s.device==='전체'||b.device===s.device||b.device==='전체'||(s.device==='MO'&&b.model==='CPI'&&['Android','iOS'].includes(b.device));
  function availability(raw,settings,asOf){
    const s={...defaults(),...settings},sector=industry(s.industry),goal=['구매','리드','설치'].includes(s.objective)?s.objective:'기타';
    const result={rows:[],excluded:[],issues:[],sector,unclassified:raw.filter(b=>!industry(b.industry)).length,sourceCount:raw.filter(b=>industry(b.industry)===sector).length};
    if(!sector){result.issues.push({code:'industry',message:'먼저 업종을 선택하세요.'});return result;}
    if(!objectives.includes(s.objective)){result.issues.push({code:'objective',message:'캠페인 목표를 선택하세요.'});return result;}
    if(!Number.isFinite(Date.parse(asOf))){result.issues.push({code:'date',message:'제안 정보의 작성일을 확인하세요.'});return result;}
    const all=catalogue(raw,asOf).filter(b=>b.industry===sector),issue=(product,code,message)=>{
      const prod=E.products.find(x=>x.id===product),name=prod.media+' '+prod.campaign;
      result.issues.push({product,code,message:name+': '+message});result.excluded.push(name+': '+message);
    };
    const rank=(a,b)=>a.benchmarkTier-b.benchmarkTier||b.sourceDate.localeCompare(a.sourceDate)||(a.device===s.device?-1:1)-(b.device===s.device?-1:1)||(a.goal===goal?-1:1)-(b.goal===goal?-1:1)||a.id.localeCompare(b.id);
    for(const product of order[s.objective]){
      const population=all.filter(b=>b.product===product);
      if(!population.length){issue(product,'source','이 업종의 기준일 이전 자료 없음');continue;}
      let options=population.filter(b=>deviceMatches(b,s));
      if(!options.length){issue(product,'device','선택 기기 자료 없음 (등록: '+[...new Set(population.map(b=>b.device))].join(', ')+')');continue;}
      options=options.filter(b=>!b.goal||b.goal===goal||goal==='기타');
      if(!options.length){issue(product,'goal','전환 정의가 선택 목표와 다름');continue;}
      options=options.filter(b=>b.costBasis==='media-net');
      if(!options.length){issue(product,'cost','VAT·수수료 제외 단가 확인 필요');continue;}
      options=options.filter(b=>E.num(b.rate)>0);
      if(!options.length){issue(product,'rate','유효한 단가 없음');continue;}
      if(!s.allowReference)options=options.filter(b=>b.sourceKind==='실적'&&b.benchmarkTier===0);
      if(!options.length){issue(product,'reference','최근 180일 실적 없음; 과거 제안·참고값 허용 필요');continue;}
      if(feeds.has(product)&&!s.feed){issue(product,'feed','상품 피드 미확인');continue;}
      if(audiences.has(product)&&!s.audience){issue(product,'audience','리타겟팅 모수 미확인');continue;}
      options.sort(rank);
      // A combined-device population and its device splits must not both enter one plan.
      const combined=options.find(b=>b.device==='전체');
      const multi=s.device==='전체'||s.device==='MO'&&options[0].model==='CPI';
      const preferCombined=combined&&combined.benchmarkTier===options[0].benchmarkTier&&combined.sourceDate>=options[0].sourceDate;
      const pool=multi?(preferCombined?[combined]:options.filter(b=>b.device!=='전체')):options;
      const selected=multi?[...new Set(pool.map(b=>b.device))].map(device=>pool.find(b=>b.device===device)):[pool[0]];
      for(const b of selected){const row={...b,goal};if(b.goal!==goal){row.cvr='';row.aov='';}result.rows.push(row);}
    }
    return result;
  }
  function candidates(raw,settings,asOf){
    const s={...defaults(),...settings};
    if(!s.industry||!objectives.includes(s.objective))throw Error('업종과 캠페인 목표를 선택하세요.');
    return availability(raw,s,asOf);
  }
  function generate(p,raw,settings){
    const s={...defaults(),...settings},days=E.days(p.start,p.end);
    if(!days)throw Error('유효한 집행 기간이 필요합니다.');
    if(E.num(s.markup)==null||E.num(s.markup)<0||E.num(s.markup)>1000)throw Error('기본 마크업을 확인하세요.');
    if(!(E.num(s.minDaily)>0)||!Number.isInteger(E.num(s.maxChannels))||E.num(s.maxChannels)<1||E.num(s.maxChannels)>8)throw Error('일예산 기준과 캠페인 수를 확인하세요.');
    const budget=E.num(p.budget),tax=E.num(p.tax);
    if(!(budget>0)||!Number.isSafeInteger(budget)||tax==null||tax<0||tax>100)throw Error('예산과 청구 VAT를 확인하세요.');
    const supply=Math.round(p.vatMode==='in'?budget/(1+tax/100):budget),found=candidates(raw,s,p.date);
    if(!found.rows.length){const error=Error('선택 조건에 맞는 벤치마크가 없습니다. '+found.issues.map(x=>x.message).join(' / '));error.code='BENCHMARK_UNAVAILABLE';error.diagnostics=found;throw error;}
    const cap=Math.max(1,Math.min(E.num(s.maxChannels),Math.floor(supply/days/E.num(s.minDaily)))),rows=found.rows.slice(0,cap);
    const weights=[40,30,20,10,8,6,4,2];
    rows.forEach((r,i)=>{r.weight=weights[i];r.markup=E.num(s.markup);r.amount=0;r.locked=false;r.approved=false;r.note+=' 배분: 목표별 역할 우선순위·가중치 '+weights[i]+' (성과 최적화 결과 아님).';});
    const next={...p,rows,autoEnabled:true,autoSettings:s};E.allocate(next);
    const note=`${s.industry} · ${s.objective} · ${s.device}. ${days}일 / 최대 ${s.maxChannels}개 / 캠페인당 일 공급가 ${Number(s.minDaily).toLocaleString('ko-KR')}원 이상 권장(내부 분산 방지 기준, 매체 최소 집행액 아님). 가용 ${found.rows.length}개 중 ${rows.length}개를 목표별 역할 순서로 선택, 가중 배분. 마크업 ${s.markup}%. 매출·전환 근거가 없는 값은 미산출.`;
    next.autoSummary=note;next.autoExcluded=found.excluded;return next;
  }
  root.MixAuto={defaults,objectives,industry,publicBench,catalogue,availability,candidates,generate};
  if(typeof module!=='undefined')module.exports=root.MixAuto;
})(typeof window!=='undefined'?window:globalThis);
