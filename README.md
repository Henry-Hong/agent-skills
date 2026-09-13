# agent-skills

Reusable agent skills for Claude Code, Codex, Cursor, and other AI coding agents.

## Install

```bash
# Install all skills
npx skills add Henry-Hong/agent-skills

# Install a specific skill
npx skills add Henry-Hong/agent-skills --skill competitor-app-research
npx skills add Henry-Hong/agent-skills --skill linkedin-games
```

`stop-bullshit`은 서브모듈이라 tarball 기반 설치(`npx skills add` 포함)로는 빈 폴더로 받아집니다.
받으려면 클론하세요.

```bash
git clone --recursive https://github.com/Henry-Hong/agent-skills.git
# 이미 클론했다면
git submodule update --init --recursive
```

## Skills

### competitor-app-research

경쟁 앱 시장조사 워크플로우. 앱스토어/플레이스토어에서 앱 소개문구, 리뷰, 스크린샷을 수집하고 리뷰를 카테고리 분류·분석해서 `market-research/<앱이름>/PRODUCT_BRIEF.md`로 정리합니다.

- 수집 스크립트 번들 (`google-play-scraper` + `app-store-scraper` 기반, 양대 스토어 동시 수집)
- 리뷰 분석 방법론 내장: 긍정 신호는 별점 무관하게 발굴, 결제·환불·CS는 하나의 문제 사슬로 통합 분류
- 앱 내부 스크린샷 분석 및 용량 최적화 가이드 포함

Requirements: Node 18+

### linkedin-games

LinkedIn 데일리 게임(Queens, Mini Sudoku, Tango, Zip, Patches)을 DOM에서 보드를 읽어 풀고 자동으로 입력합니다. 스크린샷을 보고 퍼즐을 다시 추론하지 않고, 게임당 한 번의 호출로 끝냅니다.

- 호스트 의존 코드가 `scripts/aside.js` 한 파일에만 몰려 있는 레이어 구조 (추출·풀이·입력은 순수 로직)
- 액션 플랜이 선언형(`tap`/`key`/`drag`)이라 새 호스트 이식은 ~20줄이면 충분
- 실제 보드 픽스처 + 셀프테스트 내장 (`scripts/selftest.js`), 솔버 버그와 브라우저 버그를 한 번에 분리
- 성능: 탭 입력은 인페이지 배치 1회, 상태 폴링은 경량 프로브(~2ms)

Requirements: JS 실행과 포인터 입력이 가능한 브라우저 자동화 환경(Playwright/Puppeteer/CDP) + 로그인된 LinkedIn 세션

### stop-bullshit (submodule)

[preference-kim/stop-bullshit](https://github.com/preference-kim/stop-bullshit) 을 서브모듈로
참조합니다. 에이전트가 근거 없는 주장을 하거나, 검증한 척하거나, 꾸며낸 확신을 보일 때
스스로 감사하고 수정하게 하는 스킬입니다. 업스트림에 라이선스가 명시돼 있지 않아
복사 대신 서브모듈로 둡니다.

## Using these with Aside

Aside는 `~/.aside/u/<account>/skills/user/` 아래만 인덱싱하지만 심링크는 따라갑니다.
레포를 단일 소스로 두고 심링크만 걸면 새 세션부터 인식됩니다.

```bash
ln -s ~/devheerim/agent-skills/skills/<name> ~/.aside/u/1/skills/user/<name>
```

## License

MIT for the skills in this repository. `skills/stop-bullshit` is a submodule and keeps its
own upstream terms.
