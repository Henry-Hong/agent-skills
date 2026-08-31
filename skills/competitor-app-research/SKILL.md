---
name: "competitor-app-research"
description: "경쟁 앱 시장조사를 수행할 때 사용. 앱스토어/플레이스토어에서 소개문구·리뷰·스크린샷을 수집하고, 리뷰를 분류·분석해 market-research/<앱이름>/ 폴더에 PRODUCT_BRIEF.md로 정리한다. 트리거 예: '~앱 조사해줘', '경쟁앱 리뷰 분석', '시장조사 폴더 만들어줘'"
---

# 경쟁 앱 시장조사 (Competitor App Research)

앱스토어/플레이스토어 기반 경쟁 앱 조사 표준 워크플로우. 결과물은 `market-research/<앱이름>/`(또는 사용자 지정 폴더)에 저장한다.

## 1. 스토어 데이터 수집

수집 도구: 이 스킬 폴더의 `scripts/scrape-store.mjs`. 프로젝트 자체에 `scripts/scrape-store.mjs`가 이미 있으면 그것을 우선 사용한다.

의존성: `google-play-scraper`, `app-store-scraper` (Node 18+). 설치되어 있지 않으면 먼저 설치:

```bash
npm ls google-play-scraper app-store-scraper 2>/dev/null || npm i --no-save google-play-scraper app-store-scraper
```

```bash
# 1) 앱 ID 검색 (play: 패키지명, appstore: 숫자 ID)
node <스크립트경로>/scrape-store.mjs --store both --search "앱이름 키워드"

# 2) 양쪽 스토어 수집 (국가/리뷰 수 조절 가능)
node <스크립트경로>/scrape-store.mjs --store both --play <패키지명> --appstore <숫자ID> \
  --countries kr --reviews 200 --out "market-research/<앱이름>"
```

생성 파일: `reviews-{play,appstore}.json`(원본), `APP_LISTING-*.md`(소개문구), `reviews-digest-*.md`(별점분포+발췌), `screenshots-store-*/`(스토어 스크린샷).

한쪽 스토어만 있는 앱이면 `--store play --app <ID>` 형태로 실행 (파일명 suffix 없이 생성됨).

## 2. 앱 내부 스크린샷이 있는 경우

사용자가 제공한 앱 캡처 원본은 용량 최적화 후 `screenshots/`에 저장:

```bash
# macOS
sips -Z 1000 -s format jpeg -s formatOptions 72 <원본> --out screenshots/content-NN.jpg
# 기타 환경: ImageMagick 등 가용 도구로 최대 1000px, jpeg q70~75 수준으로 변환
```

각 이미지에서 추출할 것: 화면 제목, 콘텐츠 유형, 주요 문구(원문 인용), 데이터 시각화 종류, UX 패턴(CTA 문구/페이지네이션/잠금 표시), 수익화 단서(가격/코인/업셀 동선). 이미지가 10장 이상이면 visual 서브에이전트에 8장씩 분할 위임.

## 3. 리뷰 분석 방법론

`reviews-*.json`을 node로 로드해 분석한다. 규칙:

- **긍정 신호는 별점과 무관하게 캔다.** ★4~5 리뷰뿐 아니라 ★1 리뷰 속 회고("예전엔 좋았는데", "~기능은 유용했는데")에서 벤치마킹 포인트를 찾는다. 기능 요청(검색/스크랩/모아보기 등)은 별점 불문 수요 신호다.
- **결제·환불·CS는 하나의 카테고리로 통합한다.** "결제 후 미작동 → 환불 창구 없음 → 문의 무응답"은 하나의 문제 사슬이다. 쪼개서 세지 말 것.
- 부정 리뷰는 키워드 정규식으로 카테고리 분류(개인정보/버그/계정유실/커뮤니티/기능부재/방치 등)하고 건수를 센다. 중복 집계임을 명시한다.
- 대표 인용은 thumbsUp(추천수) 상위 리뷰를 우선 채택하고 추천수를 병기한다.
- 부정 리뷰 속에서도 "돈을 냈다"는 사실 자체는 지불 의사 검증 증거로 해석한다.

## 4. PRODUCT_BRIEF.md 작성

같은 market-research 폴더에 기존 브리프가 있으면 그 톤을 따르고, 없으면 아래 구조로 작성한다:

1. **앱 개요** — 표: 앱명/개발사/평점/설치수/가격/수익모델/플랫폼/현재상태
2. **기능·콘텐츠 구조** — 스크린샷 기반 기능 트리 (코드블록 트리 형식)
3. **핵심 패턴 분석** — 스토리텔링 공식 / 시각화 요소 표 / UX 패턴 / 수익화 구조
4. **우리 앱 적용 인사이트** — "즉시 적용 가능"(기존 데이터로 계산 가능한 것) vs "차별화 기회"(경쟁 앱 약점) vs "조심할 것"(법적·신뢰 리스크). 작성 전에 현재 프로젝트의 제품 강점(예: 기기 내 분석/무전송, 크로스플랫폼 등)을 파악해 그것과 연결할 것
5. **스토어 리뷰 인사이트** — 5.1 벤치마킹할 긍정 신호(원문 인용 근거) / 5.2 부정 피드백 분류 표(카테고리·건수·핵심내용) / 시사점
6. **스크린샷 인덱스** — 파일별 한 줄 설명 표

## 5. 마무리 체크

- 폴더 구성 확인: PRODUCT_BRIEF.md + reviews-*.json + reviews-digest-*.md + APP_LISTING-*.md + screenshots*/
- 수치(평점/리뷰 수/설치 수)는 수집 원본과 대조
- 브리프에 수집일과 수집 도구 경로 명시
