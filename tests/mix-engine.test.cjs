const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../js/tools/mix-engine.js');
const fixture=(r={})=>({...E.plan(),client:'QA',date:'2026-09-07',start:'2026-09-01',end:'2026-09-30',budget:1100000,rows:[{...E.row(),amount:1100000,markup:10,rate:100,ctr:2,cvr:1,aov:50000,source:'QA fixture',approved:true,...r}]});
test('markup removed before forecast; advertiser ROAS uses invoice supply',()=>{const x=E.compute(fixture());assert.equal(x.errors.length,0);assert.ok(Math.abs(x.rows[0].media-1000000)<1e-8);assert.ok(Math.abs(x.rows[0].clicks-10000)<1e-8);assert.equal(Math.round(x.rows[0].conv),100);assert.equal(Math.round(x.rows[0].revenue),5000000);assert.equal(x.totals.gross,1210000);});
test('zero CVR retained, not missing/default',()=>{const x=E.compute(fixture({cvr:0}));assert.equal(x.rows[0].conv,0);assert.equal(x.rows[0].revenue,0);assert.equal(x.rows[0].roas,0);assert.equal(x.rows[0].cpa,null);});
test('unknown CVR does not turn into zero conversion',()=>assert.equal(E.compute(fixture({cvr:''})).totals.conv,null));
test('allocation reconciles integer won, preserves fixed budgets',()=>{const p=fixture();p.budget=100;p.rows=[{...E.row(),amount:1,locked:true},...Array.from({length:7},()=>E.row())];E.allocate(p);assert.equal(p.rows.reduce((s,r)=>s+r.amount,0),100);assert.equal(p.rows[0].amount,1);});
test('fixed budget over total fails closed',()=>assert.throws(()=>E.allocate({...fixture(),budget:10,rows:[{...E.row(),locked:true,amount:11}]})));
test('VAT inclusive conversion and zero tax',()=>{let p=fixture();p.vatMode='in';p.budget=1210000;assert.equal(E.compute(p).expected,1100000);p.tax=0;p.budget=1100000;assert.equal(E.compute(p).totals.gross,1100000);});
test('CPC and CPM consistent funnel',()=>{const x=E.compute(fixture({model:'CPM',rate:2000}));assert.equal(Math.round(x.rows[0].impr),500000);assert.equal(Math.round(x.rows[0].clicks),10000);});
test('CPV independent video metrics',()=>{const x=E.compute(fixture({model:'CPV',rate:20,vtr:25}));assert.equal(Math.round(x.rows[0].views),50000);assert.equal(Math.round(x.rows[0].impr),200000);});
test('message sends never become clicks or conversions',()=>{const x=E.compute(fixture({model:'SEND',rate:20,goal:'기타'}));assert.equal(Math.round(x.rows[0].sends),50000);assert.equal(x.rows[0].clicks,null);assert.equal(x.rows[0].conv,null);});
test('prepaid fixed zero budget can retain independent volume',()=>{const x=E.compute(fixture({model:'FIXED',amount:0,fixedClicks:1000,fixedImpr:10000}));assert.equal(x.rows[0].clicks,1000);assert.equal(x.rows[0].roas,null);});
test('CPI conversions are installations, not purchases',()=>{const p=fixture({model:'CPI',rate:1000,goal:'설치'});const x=E.compute(p);assert.equal(Math.round(x.rows[0].conv),1000);assert.equal(x.rows[0].revenue,null);p.rows[0].goal='구매';assert.ok(E.compute(p).errors.some(x=>x.includes('설치')));});
test('unmeasured totals suppressed, mixed conversion types not summed',()=>{const p=fixture();p.rows.push({...p.rows[0],goal:'리드',cvr:''});const x=E.compute(p);assert.equal(x.totals.conv,null);assert.equal(x.totals.revenue,null);});
test('calendar inclusive days and invalid dates',()=>{assert.equal(E.days('2026-09-01','2026-09-30'),30);assert.equal(E.days('2026-02-30','2026-03-01'),null);assert.equal(E.days('2026-09-30','2026-09-01'),null);});
test('strict numeric parser rejects trailing junk',()=>{assert.equal(E.num('1,000'),1000);assert.equal(E.num('100원'),null);assert.equal(E.num('Infinity'),null);assert.equal(E.num(''),null);});
test('invalid percentages and export approval block',()=>{const x=E.compute(fixture({ctr:101,approved:false}));assert.ok(x.errors.some(x=>x.includes('CTR')));assert.ok(x.errors.some(x=>x.includes('검토')));});
test('conservative unit-cost scenario reduces clicks',()=>{const p=fixture();p.scenario=120;assert.ok(Math.abs(E.compute(p).rows[0].clicks-10000/1.2)<1e-8);});
test('pack duplicate id rejected',()=>{const r={id:'x',brand:'x',source:'x',product:'naver-search'};assert.throws(()=>E.validatePack({version:1,benchmarks:[r,r]}));});
test('invalid text percentages do not pass via null coercion',()=>{
  for(const k of ['ctr','cvr','vtr'])assert.ok(E.compute(fixture({[k]:'garbage'})).errors.some(x=>x.includes(k.toUpperCase())));
});
test('missing or malformed markup and tax fail closed',()=>{
  for(const v of ['',null,'garbage']){assert.ok(E.compute(fixture({markup:v})).errors.some(x=>x.includes('마크업')));const p=fixture();p.tax=v;assert.ok(E.compute(p).errors.some(x=>x.includes('VAT')));assert.equal(E.compute(p).totals.tax,null);}
});
test('invalid optional amounts fail even with valid billable rate',()=>{
  for(const k of ['aov','fixedImpr','fixedClicks'])assert.ok(E.compute(fixture({[k]:'oops'})).errors.some(x=>x.includes(k)));
});
test('missing amount never becomes reported zero supply',()=>{const p=fixture({amount:''});assert.equal(E.compute(p).totals.amount,null);assert.ok(E.compute(p).errors.length);});
test('approval must be a boolean true',()=>{for(const approved of ['true','false',1])assert.ok(E.compute(fixture({approved})).errors.some(x=>x.includes('검토')));});
test('invalid source date and unknown goal block submission',()=>{
  assert.ok(E.compute(fixture({sourceDate:'2026-99-99'})).errors.some(x=>x.includes('기준일')));
  assert.ok(E.compute(fixture({goal:'signup'})).errors.some(x=>x.includes('전환 정의')));
});
test('zero inverse funnel rates rejected, forward zero CTR allowed',()=>{
  assert.ok(E.compute(fixture({ctr:0})).errors.some(x=>x.includes('역산')));
  assert.ok(E.compute(fixture({model:'CPV',rate:10,vtr:0})).errors.some(x=>x.includes('역산')));
  assert.equal(E.compute(fixture({model:'CPM',rate:100,ctr:0})).rows[0].clicks,0);
});
test('malformed comma grouping rejected rather than changing amount',()=>{for(const v of ['1,00','10,','1,2,3'])assert.equal(E.num(v),null);assert.equal(E.num('1,000.50'),1000.5);});
test('allocation rejects malformed inputs without mutating plan',()=>{
  for(const changes of [{weight:'oops'},{amount:1.5},{amount:''}]){const p=fixture(changes),before=JSON.stringify(p);assert.throws(()=>E.allocate(p));assert.equal(JSON.stringify(p),before);}
});
test('allocation rejects missing tax and unknown budget basis',()=>{
  for(const changes of [{tax:''},{vatMode:'unknown'},{budget:10.5}])assert.throws(()=>E.allocate({...fixture(),...changes}));
});
test('all six forecast models remain finite over a budget sweep',()=>{
  for(const model of ['CPC','CPM','CPV','CPI','SEND','FIXED'])for(const amount of [1,999,10000000]){
    const p=fixture({model,amount,rate:100,ctr:2,vtr:25,fixedClicks:100,fixedImpr:1000,goal:model==='CPI'?'설치':model==='SEND'?'기타':'구매'});p.budget=amount;
    const x=E.compute(p);assert.deepEqual(x.errors,[]);for(const k of ['media','fee','clicks','views','installs','sends','conv','revenue'])assert.ok(x.rows[0][k]==null||Number.isFinite(x.rows[0][k]),model+' '+k);
  }
});
test('pack rejects invalid rates percentages date and booleans as numbers',()=>{
  const b={id:'x',brand:'QA',source:'QA',product:'naver-search'};
  for(const changes of [{rate:'bad'},{ctr:101},{vtr:-1},{cvr:true},{sourceDate:'2026-02-30'},{model:'BOGUS'},{goal:'unknown'}])assert.throws(()=>E.validatePack({version:1,benchmarks:[{...b,...changes}]}));
});
test('backup validates every saved plan, not only active one',()=>{
  const db={plan:fixture(),saved:[fixture()],benchmarks:[]};assert.equal(E.validateBackup(db).saved.length,1);
  db.saved[0].rows=[null];assert.throws(()=>E.validateBackup(db));
});
test('backup blocks wrong object fields and nonboolean approval',()=>{
  assert.throws(()=>E.validatePlan({...fixture(),client:{name:'QA'}}));
  assert.throws(()=>E.validatePlan(fixture({approved:'false'})));
  assert.throws(()=>E.validatePlan(fixture({source:{text:'QA'}})));
});
test('backup accepts unfinished numeric inputs without treating them as valid',()=>{
  const p=E.validatePlan(fixture({rate:'oops'}));assert.ok(E.compute(p).errors.some(x=>x.includes('rate')||x.includes('단가')));
});
test('missing pack optional fields use defaults only at plan application',()=>{
  const pack={version:1,benchmarks:[{id:'x',brand:'QA',source:'QA',product:'meta-leads'}]};assert.equal(E.validatePack(pack),pack);
});
