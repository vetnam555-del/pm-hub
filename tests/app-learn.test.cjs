// 앱 마케팅 완전정복 — 링크 조립 규칙과 퀴즈 데이터 검증 (node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/tools/app-learn.js');

const full = {
  base: 'https://example.onelink.me/AbCd', pid: 'examplead_int', c: '2611_aos_ua_install',
  af_adset: 'benefit_new', af_ad: 'image_coupon_01', deep_link_value: 'summer_event',
  af_web_dp: 'https://www.example.com/event?id=10&tab=new', retarget: false,
};

test('조립한 링크를 다시 풀면 넣은 값이 그대로 나온다', () => {
  const r = A.buildLink(full);
  assert.deepEqual(r.warns, []);
  const u = new URL(r.url);
  assert.equal(u.origin + u.pathname, full.base);
  for (const k of ['pid', 'c', 'af_adset', 'af_ad', 'deep_link_value', 'af_web_dp']) assert.equal(u.searchParams.get(k), full[k], k);
  assert.equal(u.searchParams.has('is_retargeting'), false);
});

test('주소 안의 주소는 인코딩돼 바깥 파라미터와 섞이지 않는다', () => {
  const r = A.buildLink(full);
  assert.ok(r.url.includes('af_web_dp=https%3A%2F%2Fwww.example.com%2Fevent%3Fid%3D10%26tab%3Dnew'));
  assert.equal(new URL(r.url).searchParams.has('tab'), false, '안쪽 주소의 tab 이 바깥으로 새면 안 된다');
});

test('리타겟팅을 켜면 is_retargeting=true 가 붙는다', () => {
  assert.equal(new URL(A.buildLink({ ...full, retarget: true }).url).searchParams.get('is_retargeting'), 'true');
});

test('빈 값은 링크에 넣지 않고, pid 가 없으면 경고한다', () => {
  const r = A.buildLink({ base: full.base, pid: '', c: 'x' });
  assert.equal(new URL(r.url).search, '?c=x');
  assert.ok(r.warns.some((w) => w.includes('pid')));
});

test('네이밍 규칙을 어기면 이유를 알려 준다', () => {
  const w = A.buildLink({ base: 'http://x.example', pid: 'p', c: 'Spring Sale', af_ad: '배너', af_web_dp: 'www.example.com' }).warns.join(' | ');
  for (const word of ['https://', '띄어쓰기', '대문자', '한글', 'af_web_dp']) assert.ok(w.includes(word), word);
});

test('기본 주소가 없으면 링크를 만들지 않는다', () => {
  const r = A.buildLink({ base: '  ', pid: 'p' });
  assert.equal(r.url, '');
  assert.equal(r.warns.length, 1);
});

test('퀴즈는 문항마다 보기 4개와 범위 안의 정답 · 해설을 갖는다', () => {
  assert.ok(A.QUIZ.length >= 5);
  for (const q of A.QUIZ) {
    assert.equal(q.opts.length, 4);
    assert.ok(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < 4);
    assert.ok(q.q.length > 10 && q.why.length > 20);
    assert.equal(new Set(q.opts).size, 4, '보기가 겹치면 안 된다');
  }
});
