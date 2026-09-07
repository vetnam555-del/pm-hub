const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const E=require('../js/tools/mix-engine.js'),A=require('../js/tools/mix-autoplan.js');
const date='2026-09-07',plan=()=>({...E.plan(),date,start:'2026-09-01',end:'2026-09-30',client:'QA',budget:1e7});
const b=(o={})=>({id:'one',brand:'PRIVATE_CLIENT',industry:'패션',product:'naver-search',device:'MO',model:'CPC',rate:500,ctr:2,cvr:1,aov:50000,goal:'구매',source:'PRIVATE_FILE_PATH',sourceDate:date,sourceKind:'실적',costBasis:'media-net',...o});
const settings=o=>({...A.defaults(),industry:'패션·잡화',objective:'구매',...o});
const dataset={window:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../js/data/mediamix-data.js'),'utf8'),dataset);
const common=A.publicBench(dataset.window.MM_DATA);
test('industry alias and client labels do not leak into generated rows',()=>{
 const p=A.generate(plan(),[b()],settings());assert.equal(p.rows.length,1);assert.equal(p.rows[0].industry,'패션·잡화');
 // Original private IDs stay in local lineage, never client/source text in a proposal.
 assert.ok(!JSON.stringify(p).includes('PRIVATE_CLIENT'));assert.ok(!JSON.stringify(p).includes('PRIVATE_FILE_PATH'));
 assert.equal(p.rows[0].sourceKind,'실적');assert.equal(p.rows[0].approved,false);
});
test('does not mix purchase and lead CVRs or unrelated industries',()=>{
 const rows=[b(),b({id:'two',goal:'리드',cvr:80}),b({id:'three',industry:'교육',rate:1})];
 assert.equal(A.generate(plan(),rows,settings()).rows[0].cvr,1);
 assert.equal(A.generate(plan(),rows,settings({objective:'리드'})).rows[0].cvr,80);
});
test('missing conversion definition never becomes purchase CVR',()=>{
 const r=A.generate(plan(),[b({goal:''})],settings()).rows[0];assert.equal(r.cvr,'');assert.equal(r.aov,'');
});
test('traffic conversion assumptions removed, zero purchase CVR retained',()=>{
 assert.equal(A.generate(plan(),[b()],settings({objective:'트래픽'})).rows[0].cvr,'');
 assert.equal(A.generate(plan(),[b({cvr:0})],settings()).rows[0].cvr,0);
});
test('new actual evidence preferred to estimates, not best performing value',()=>{
 const rows=[b({rate:500}),b({id:'old',sourceDate:'2024-01-01',rate:10}),b({id:'quote',sourceKind:'과거 제안',rate:1})];
 assert.equal(A.generate(plan(),rows,settings()).rows[0].rate,500);
});
test('duplicates do not inflate sample count, compatible samples use median',()=>{
 const rows=[b(),b({id:'duplicate'}),b({id:'two',source:'second',rate:1000})];
 const c=A.catalogue(rows,date)[0];assert.equal(c.sampleCount,2);assert.equal(c.rate,750);
});
test('different months are not blended and the most recent comparable cohort is selected',()=>{
 const rows=[b({sourceDate:'2026-08-01',rate:900}),b({id:'older',sourceDate:'2026-07-31',rate:1})];
 assert.equal(A.catalogue(rows,date).length,2);assert.equal(A.generate(plan(),rows,settings()).rows[0].rate,900);
});
test('future evidence rejected and references can be disallowed',()=>{
 assert.throws(()=>A.generate(plan(),[b({sourceDate:'2026-09-08'})],settings()),/없습니다/);
 assert.throws(()=>A.generate(plan(),common,settings({allowReference:false})),/없습니다/);
});
test('unconfirmed cost basis never becomes an auto benchmark, even if marked actual',()=>{
 assert.throws(()=>A.generate(plan(),[b({costBasis:''})],settings()),/없습니다/);
 assert.equal(A.catalogue([b({costBasis:''})],date)[0].costBasis,'review-required');
});
test('fixed quotes never auto-transplant or retain private forecast volume',()=>{
 const fixed=b({product:'naver-brand',model:'FIXED',fixedClicks:9999,amount:900000});
 assert.throws(()=>A.generate(plan(),[fixed],settings()),/없습니다/);
 assert.equal(A.catalogue([fixed],date)[0].fixedClicks,'');
});
test('feed and audience gating excludes catalog when not ready',()=>{
 const cat=b({product:'meta-catalog'});
 assert.throws(()=>A.generate(plan(),[cat],settings()),/없습니다/);
 assert.throws(()=>A.generate(plan(),[cat],settings({feed:true})),/없습니다/);
 assert.equal(A.generate(plan(),[cat],settings({feed:true,audience:true})).rows.length,1);
});
test('small budget consolidates, allocations reconcile exact integer supply',()=>{
 const rows=['naver-search','google-search','meta-sales','meta-traffic'].map((product,i)=>b({id:String(i),product}));
 const small=A.generate({...plan(),budget:300000},rows,settings());assert.equal(small.rows.length,1);
 const large=A.generate({...plan(),budget:11000003,vatMode:'in'},rows,settings());assert.equal(large.rows.length,4);
 assert.equal(large.rows.reduce((s,r)=>s+r.amount,0),Math.round(11000003/1.1));
});
test('Android and iOS cost populations stay distinct',()=>{
 const records=common.filter(b=>b.product==='google-app'&&b.industry==='전 업종(통합)');
 assert.ok(records.some(b=>b.device==='Android'));assert.ok(records.some(b=>b.device==='iOS'));
 const s=settings({industry:'전 업종(통합)',objective:'설치',device:'Android'});
 assert.ok(A.generate(plan(),records,s).rows.every(b=>b.device==='Android'&&b.goal==='설치'));
});
test('education aliases permit same-category Google/Meta comparison without cross-industry fallback',()=>{
 const p=A.generate(plan(),common,settings({industry:'교육·커리어',objective:'리드'}));
 assert.ok(p.rows.some(r=>r.product==='meta-leads'));assert.ok(p.rows.some(r=>r.product==='google-search'));
 assert.ok(p.rows.every(r=>r.industry==='교육·커리어'));assert.ok(p.rows.every(r=>r.cvr===''));
});
test('public dataset industry/objective sweep returns finite forecasts or an explicit data gap',()=>{
 let success=0;for(const sector of [...new Set(common.map(b=>A.industry(b.industry)))])for(const objective of A.objectives){
   try {const p=A.generate(plan(),common,settings({industry:sector,objective,device:objective==='설치'?'Android':'MO',feed:true,audience:true}));
     p.rows.forEach(r=>r.approved=true);const res=E.compute(p);assert.deepEqual(res.errors,[]);assert.equal(res.totals.amount,1e7);success++;
   }catch(e){if(e.message.includes('벤치마크가 없습니다'))continue;throw e;}
 }assert.ok(success>70);
});
test('GFA catalog and Criteo do not resolve to Meta',()=>{
 assert.equal(E.matchProduct('네이버 GFA 카탈로그'),'naver-gfa-catalog');assert.equal(E.matchProduct('크리테오 카탈로그'),'criteo-lf');assert.equal(E.matchProduct('메타 판매'),'meta-sales');
});
test('campaign words never override the explicit media platform',()=>{
 assert.equal(E.matchProduct('구글','잠재고객'),'google-search');
 assert.equal(E.matchProduct('카카오','도달'),'kakao-biz');
 assert.equal(E.matchProduct('메타','Google audience'),'meta-traffic');
 assert.equal(E.matchProduct('카탈로그'),null);
});
test('quoted commas and newlines parsed without shifting numeric columns',()=>{
 const r=E.parseReport('매체,캠페인,imps,click,spending\n메타,"a,b\nnext","1,000",20,"2,000"',{industry:'패션'});
 assert.equal(r.pack.benchmarks[0].rate,100);assert.equal(r.pack.benchmarks[0].campaign,'a,b\nnext');
});
test('percent points below 1 are not guessed as fractions',()=>{
 const t='매체\tCPC\tCTR\tCVR\n메타\t100\t0.18\t0.05';
 assert.equal(E.parseReport(t,{industry:'패션'}).pack.benchmarks[0].ctr,.18);
 assert.equal(E.parseReport(t,{industry:'패션',percentUnit:'fraction'}).pack.benchmarks[0].ctr,18);
});
test('actual counters supersede rounded published ratios and explicit VAT factor applies',()=>{
 const t='매체\timps\tclick\tspending\tCTR\tCPC\n메타\t1000\t20\t2200\t1%\t110';
 const r=E.parseReport(t,{industry:'패션',costFactor:1.1,goal:'리드'}).pack.benchmarks[0];assert.equal(r.rate,100);assert.equal(r.ctr,2);assert.equal(r.goal,'리드');assert.equal(r.aov,'');
});
test('brand optional when industry is set, legacy brand-only data accepted but excluded until classified',()=>{
 assert.doesNotThrow(()=>E.validatePack({version:1,benchmarks:[b({brand:''})]}));
 assert.equal(A.catalogue([b({industry:''})],date).length,0);
});
test('new config survives validated backup; malformed auto config rejected',()=>{
 const p=A.generate(plan(),[b()],settings());assert.deepEqual(E.validateBackup({plan:p,saved:[],benchmarks:[]}).plan.autoSettings,p.autoSettings);
 assert.throws(()=>E.validatePlan({...p,autoSettings:[]}));assert.throws(()=>E.validatePlan({...p,autoEnabled:'yes'}));
});
test('negative or nonnumeric margin and other cost cannot silently pass',()=>{
 for(const margin of [-1,'NaN',101])assert.ok(E.compute({...plan(),margin}).errors.some(x=>x.includes('마진율')));
 assert.ok(E.compute({...plan(),otherCost:-1}).errors.some(x=>x.includes('변동비')));
});
test('all devices includes PC and MO without blending their unit costs',()=>{
 const rows=[b({device:'PC',rate:800}),b({id:'mobile',device:'MO',rate:300})];
 const p=A.generate(plan(),rows,settings({device:'전체'}));
 assert.deepEqual(Object.fromEntries(p.rows.map(r=>[r.device,r.rate])),{PC:800,MO:300});
 assert.equal(p.rows.reduce((sum,r)=>sum+r.amount,0),1e7);
});
test('a valid combined device population does not double-count device splits',()=>{
 const rows=[b({device:'전체'}),b({id:'pc',device:'PC',rate:800}),b({id:'mobile',device:'MO',rate:300})];
 const p=A.generate(plan(),rows,settings({device:'전체'}));assert.equal(p.rows.length,1);assert.equal(p.rows[0].device,'전체');
});
test('older combined reference does not displace newer actual device evidence',()=>{
 const rows=[b({device:'전체',sourceKind:'참고값',sourceDate:'2024-01-01'}),b({id:'pc',device:'PC',rate:800})];
 assert.equal(A.generate(plan(),rows,settings({device:'전체'})).rows[0].device,'PC');
});
test('mobile app setup includes Android and iOS but preserves platform populations',()=>{
 const rows=[b({product:'google-app',model:'CPI',goal:'설치',device:'Android',rate:2000}),b({id:'ios',product:'google-app',model:'CPI',goal:'설치',device:'iOS',rate:3000})];
 const p=A.generate(plan(),rows,settings({objective:'설치',device:'MO'}));assert.equal(p.rows.length,2);
 assert.deepEqual(new Set(p.rows.map(r=>r.device)),new Set(['Android','iOS']));
});
test('empty states identify missing industry, cost and reference policy separately',()=>{
 assert.equal(A.availability([],A.defaults(),date).issues[0].code,'industry');
 assert.ok(A.availability([b({costBasis:''})],settings(),date).issues.some(x=>x.code==='cost'));
 assert.ok(A.availability([b({sourceKind:'참고값'})],settings({allowReference:false}),date).issues.some(x=>x.code==='reference'));
 assert.ok(A.availability([b({device:'PC'})],settings(),date).issues.some(x=>x.code==='device'));
 assert.ok(A.availability([b({goal:'리드'})],settings(),date).issues.some(x=>x.code==='goal'));
 assert.equal(A.availability([b({industry:''})],settings(),date).unclassified,1);
});
test('structured no-source diagnostics do not weaken source validation',()=>{
 let failure;try{A.generate(plan(),[b({costBasis:''})],settings({device:'전체'}));}catch(e){failure=e;}
 assert.equal(failure.code,'BENCHMARK_UNAVAILABLE');assert.ok(failure.diagnostics.issues.some(x=>x.code==='cost'));
 assert.equal(failure.diagnostics.rows.length,0);assert.equal(A.availability([b()],settings(),'').issues[0].code,'date');
});
test('all-device common-source industry sweep supports every traffic-capable industry',()=>{
 let checked=0;for(const sector of [...new Set(common.map(b=>A.industry(b.industry)))]){
  const s=settings({industry:sector,objective:'트래픽'}),mobile=A.availability(common,s,date),pc=A.availability(common,{...s,device:'PC'},date);
  if(mobile.rows.length||pc.rows.length){assert.ok(A.availability(common,{...s,device:'전체'},date).rows.length,sector);checked++;}
 }assert.ok(checked>20);
});
