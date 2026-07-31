# 🚀 퍼포먼스 마케팅 실무 허브

HLL중앙 퍼포먼스마케팅팀 인턴/주니어를 위한 **실무 작업대 + 온보딩 허브**입니다.
빌드 없이 바로 열리는 순수 정적 사이트(HTML/CSS/JS)이며, GitHub Pages로 배포됩니다.

## ✨ 구성

### 🧰 실무 도구 (현업에서 바로 사용)
| 도구 | 설명 |
|------|------|
| 📊 KPI 계산기 | 노출·클릭·비용·전환·매출 → CTR·CPC·CPM·CVR·CPA·ROAS 자동 계산 + 목표 역산 |
| 🔗 UTM 빌더 | 네이밍 규칙(소문자·언더스코어) 강제, 대량 생성(엑셀 TSV 복사), 캠페인명 생성기 |
| 💰 손익분기·예산 시뮬레이터 | 마진 기반 손익분기 ROAS/CPA 역산 + 퍼널별 예산 배분·성과 추정 |
| 📝 주간 리포트 빌더 | 매체별 수치(전주 대비) → 요약·매체비교·자동 인사이트·다음 액션 + 인쇄/복사 |
| 🩺 트러블슈팅 진단기 | 증상 선택 → 원인·액션 단계별 진단 |
| 🧪 A/B 유의성 검정 | 두 그룹 전환율 차이의 통계적 유의성(양측 z-검정) 판정 |
| 📈 적정 입찰가 계산기 | 목표 CPA·CVR(또는 목표 ROAS·객단가)로 적정 최대 CPC 역산 |
| ⏱️ 예산 페이싱 계산기 | 소진 페이스(과속/적정/저조) 진단 + 예상 착지액·권장 일소진 |

### 📘 학습
- **UTM 완전정복** — 개념·5개 파라미터·자주 하는 실수·퀴즈
- **12주(60일) 온보딩 커리큘럼** — 기초부터 독립 캠페인 리딩까지, 진도 자동 저장

### 📚 참고 자료
- 매체 가이드 · **매체 벤치마크(CTR/CVR/CPC 정상 범위)** · 광고 용어 사전 · 소재 규격표 · **네이밍 규칙** · **마케팅 인사이트 소스(뉴스레터·사이트)** · FAQ

## 🔧 주요 기능
- 🔍 **전역 검색** (`Ctrl/⌘ + K`) — 도구·용어·매체·커리큘럼 한 번에
- 🔗 **딥링크** — `#tool-kpi`, `#week7`, `#glossary` 등 해시로 특정 페이지 공유·북마크
- 💾 도구 입력값·커리큘럼 진도 **localStorage 자동 저장**
- ♿ 키보드 접근성, 🖨 인쇄/PDF, 📱 반응형

## 🖥️ 로컬에서 열기
별도 설치 없이 `index.html`을 브라우저로 열면 됩니다.
로컬 서버로 보려면:
```bash
python -m http.server 8777
# http://localhost:8777
```

## 📁 구조
```
index.html
css/   base.css · beginner.css · tools.css
js/    app.js(라우터·검색·헬퍼) · curriculum.js(커리큘럼·참고 데이터)
js/tools/  kpi · utm · budget · report · diagnose · abtest · bid · pacing · utm-learn
```

## 🚀 배포 (GitHub Pages)

주소: <https://vetnam555-del.github.io/pm-hub/>

**`main` 에 푸시하면 자동 배포된다.**

```bash
git push origin main
```

`.github/workflows/deploy-pages.yml` 이 `main` 을 `gh-pages` 로 미러링하고,
Pages 가 `gh-pages` 브랜치를 빌드해 게시한다. 보통 1~2분 걸린다.

### 만져도 되는 것과 안 되는 것

- **`gh-pages` 브랜치를 직접 수정하지 않는다.** 다음 미러링에서 강제로 덮어써진다. 항상 `main` 에서 작업한다.
- **Settings → Pages 의 Source 를 바꾸지 않는다.** 현재 `gh-pages` / `/ (root)` 로 서비스 중이다. 여기를 건드리면 사이트가 다시 404 가 될 수 있다.
- 경로는 모두 **상대경로**(`css/base.css` 형태)로 유지한다. `/css/...` 처럼 절대경로로 쓰면 `/pm-hub/` 하위 경로 배포에서 404 가 된다.
- 루트의 `.nojekyll` 을 지우지 않는다. Jekyll 처리를 건너뛰게 하는 파일이다.

### 404 가 날 때 확인 순서 (2026-07 실제 사고 기록)

1. **리포지토리가 공개인지** — 비공개로 바꾸면 무료 플랜에서는 Pages 가 즉시 중단된다.
2. **Pages 가 활성화돼 있는지** — `has_pages` 가 `false` 면 파일이 정상이어도 전체가 404 다.
   ```bash
   curl -s https://api.github.com/repos/vetnam555-del/pm-hub | grep has_pages
   ```
   Settings 화면의 브랜치 소스 저장이 반영되지 않는 일이 있었다. 그때는 `gh-pages` 브랜치를
   푸시하면 Pages 가 자동 활성화된다(이 방법으로 복구했다).
   ```bash
   git push origin main:gh-pages
   ```
3. **Actions 실행 결과** — Actions 탭에서 `Mirror main to gh-pages` 와 `pages build and deployment` 가 모두 성공인지 본다.

> `actions/deploy-pages` 방식은 쓰지 않는다. Actions 토큰에 Pages 생성·설정 권한이 없어
> `Resource not accessible by integration` 으로 실패한다(2026-07-27 확인).

---
© 2026 HLL중앙 퍼포먼스마케팅팀 · 내부 교육용
