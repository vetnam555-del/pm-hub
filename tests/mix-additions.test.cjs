const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('../js/tools/mix-engine.js');

// ── 손익분기 ────────────────────────────────────────────
test('breakEven: 기타 변동비 없으면 마진율의 역수', () => {
  const b = E.breakEven(70000, 30, 0);
  assert.equal(b.marginValid, true);
  assert.ok(Math.abs(b.beRoas - 100 / 0.3) < 1e-9);   // 333.33%
  assert.equal(b.beCpa, 21000);                        // 70000 × 0.3
  assert.equal(b.unreachable, false);
});
test('breakEven: 기타 변동비는 공헌이익에서 차감', () => {
  const b = E.breakEven(70000, 30, 5000);
  assert.equal(b.beCpa, 16000);
  assert.ok(Math.abs(b.beRoas - 70000 / 16000 * 100) < 1e-9);
});
test('breakEven: 변동비가 마진금액을 넘으면 달성 불가', () => {
  const b = E.breakEven(70000, 30, 25000);
  assert.equal(b.beCpa, -4000);
  assert.equal(b.beRoas, null);
  assert.equal(b.unreachable, true);
});
test('breakEven: 마진율 0 이하·100 초과는 무효', () => {
  assert.equal(E.breakEven(70000, 0, 0).marginValid, false);
  assert.equal(E.breakEven(70000, 120, 0).marginValid, false);
  assert.equal(E.breakEven(70000, '', 0).marginValid, false);
});

const fixture = (plan = {}, row = {}) => ({
  ...E.plan(), client: 'QA', title: 'QA', date: '2026-09-07', start: '2026-09-01', end: '2026-09-30',
  budget: 1000000, rows: [{
    ...E.row(), amount: 1000000, markup: 0, rate: 100, ctr: 2, cvr: 1, aov: 50000,
    source: 'QA', sourceDate: '2026-09-01', sourceKind: '실적', approved: true, ...row
  }], ...plan
});

test('compute: 마진율이 없으면 손익분기 판정을 만들지 않는다', () => {
  assert.equal(E.compute(fixture()).be, null);
});
test('compute: 예상 ROAS 가 본전선을 넘으면 pass', () => {
  // 100만원 / CPC 100 → 클릭 1만 / CVR 1% → 전환 100건 / AOV 5만 → 매출 500만 → ROAS 500%
  const res = E.compute(fixture({ margin: 30 }));
  assert.equal(res.be.marginValid, true);
  assert.ok(Math.abs(res.be.beRoas - 333.333) < 0.01);
  assert.ok(Math.abs(res.totals.roas - 500) < 1e-6);
  assert.equal(res.be.pass, true);
});
test('compute: 본전 미달이면 pass=false 이고 경고가 붙는다', () => {
  const res = E.compute(fixture({ margin: 30 }, { cvr: 0.5 })); // ROAS 250% < 333%
  assert.equal(res.be.pass, false);
  assert.ok(res.warnings.some(w => w.includes('손익분기')));
});
test('compute: 객단가가 여러 행이면 전환 가중 평균으로 본전선을 잡는다', () => {
  const p = fixture({ margin: 50, budget: 2000000 });
  p.rows = [
    { ...p.rows[0], amount: 1000000, aov: 40000 },
    { ...p.rows[0], amount: 1000000, aov: 80000 }
  ];
  const res = E.compute(p);
  // 두 행 전환수가 같으므로 가중 평균 객단가 = 60,000 → 손익분기 CPA = 30,000
  assert.equal(res.be.aov, 60000);
  assert.equal(res.be.beCpa, 30000);
});
test('compute: 구매 전환이 없으면 판정을 생략하고 알린다', () => {
  const res = E.compute(fixture({ margin: 30 }, { goal: '리드', aov: '' }));
  assert.equal(res.be, null);
  assert.ok(res.warnings.some(w => w.includes('판정을 생략')));
});

// ── 성과 리포트 붙여넣기 ────────────────────────────────
const REPORT = [
  '매체\t캠페인\timps\tclick\tspending\tCTR\tCPC\tCPM\toder\trevenue\tCVR\tROAS\tAOV',
  '카카오비즈보드\t온라인_신발_트래픽\t2064155\t33196\t2104344\t1.61%\t63\t1019\t61\t9001900\t0.18%\t427.78%\t147572',
  '메타\t온라인_신발_트래픽\t549394\t45392\t2287736\t8.26%\t50\t4164\t29\t4825000\t0.06%\t210.91%\t166379'
].join('\n');

test('parseReport: 매체명을 상품 id 로 매칭한다', () => {
  const r = E.parseReport(REPORT, { brand: '뉴발란스', sourceDate: '2026-01-31' });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.pack.benchmarks.map(b => b.product), ['kakao-biz', 'meta-traffic']);
});
test('parseReport: 퍼센트 표기(0.18%)를 소수로 오인하지 않는다', () => {
  const r = E.parseReport(REPORT, { brand: '뉴발란스' });
  assert.ok(Math.abs(r.pack.benchmarks[0].cvr-61/33196*100)<1e-6);
  assert.ok(Math.abs(r.pack.benchmarks[1].cvr-29/45392*100)<1e-6);
  assert.ok(Math.abs(r.pack.benchmarks[0].ctr-33196/2064155*100)<1e-6);
});
test('parseReport: 소수 표기(0.0161)는 퍼센트로 환산한다', () => {
  const r = E.parseReport('매체\tCPC\tCTR\n메타\t50\t0.0161', { brand: 'B',percentUnit:'fraction' });
  assert.equal(r.pack.benchmarks[0].ctr, 1.61);
});
test('parseReport: 원자료만 있어도 CTR·CPC·CPM·CVR·AOV 를 역산한다', () => {
  const r = E.parseReport(
    '매체\timps\tclick\tspending\torder\trevenue\n네이버 GFA\t872439\t12000\t2000000\t20\t3000000',
    { brand: 'B' });
  const b = r.pack.benchmarks[0];
  assert.equal(b.product, 'naver-gfa');
  assert.ok(Math.abs(b.rate-2000000/12000)<1e-6);
  assert.ok(Math.abs(b.ctr-12000/872439*100)<1e-6);
  assert.ok(Math.abs(b.cvr-20/12000*100)<1e-6);
  assert.equal(b.aov, 150000);                     // 3,000,000 ÷ 20
});
test('parseReport: CPM 과금 상품은 rate 에 CPM 을 담는다', () => {
  const r = E.parseReport('매체\timps\tclick\tspending\n구글 디스플레이\t1000000\t3000\t2000000', { brand: 'B' });
  const b = r.pack.benchmarks[0];
  assert.equal(b.product, 'google-display');
  assert.equal(b.model, 'CPM');
  assert.equal(b.rate, 2000);                      // 2,000,000 ÷ 1,000,000 × 1000
});
test('parseReport: 결과 팩이 기존 검증을 통과한다', () => {
  const r = E.parseReport(REPORT, { brand: '뉴발란스', sourceDate: '2026-01-31' });
  assert.doesNotThrow(() => E.validatePack(r.pack));
});
test('parseReport: 브랜드명이 없으면 거부한다', () => {
  assert.ok(E.parseReport(REPORT, {}).error.includes('업종'));
});
test('parseReport: 알 수 없는 매체는 건너뛰고 알려준다', () => {
  const r = E.parseReport('매체\timps\tclick\tspending\n알수없는매체\t100\t10\t1000', { brand: 'B' });
  assert.ok(r.error);
  assert.deepEqual(r.skipped, ['알수없는매체']);
});
test('parseReport: 단가를 만들 수 없는 행은 건너뛴다', () => {
  const r = E.parseReport('매체\timps\tclick\tspending\n메타\t1000\t0\t0\n카카오\t1000\t10\t5000', { brand: 'B' });
  assert.equal(r.pack.benchmarks.length, 1);
  assert.ok(r.skipped[0].includes('단가 없음'));
});
test('parseReport: 합계 행은 제외한다', () => {
  const r = E.parseReport(REPORT + '\n합계\t\t2613549\t78588\t4392080\t\t\t\t90\t13826900\t\t\t', { brand: 'B' });
  assert.equal(r.pack.benchmarks.length, 2);
});
test('parseReport: CSV 도 읽는다', () => {
  const r = E.parseReport('매체,imps,click,spending\n메타,1000,20,2000', { brand: 'B' });
  assert.equal(r.pack.benchmarks[0].rate, 100);
});
test('parseReport: id 가 중복되지 않는다', () => {
  const r = E.parseReport(REPORT, { brand: '뉴발란스' });
  const ids = r.pack.benchmarks.map(b => b.id);
  assert.equal(new Set(ids).size, ids.length);
});
