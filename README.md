# agent-skills

Reusable agent skills for Claude Code, Codex, Cursor, and other AI coding agents.

## Install

```bash
# Install all skills
npx skills add Henry-Hong/agent-skills

# Install a specific skill
npx skills add Henry-Hong/agent-skills --skill competitor-app-research
```

## Skills

### competitor-app-research

경쟁 앱 시장조사 워크플로우. 앱스토어/플레이스토어에서 앱 소개문구, 리뷰, 스크린샷을 수집하고 리뷰를 카테고리 분류·분석해서 `market-research/<앱이름>/PRODUCT_BRIEF.md`로 정리합니다.

- 수집 스크립트 번들 (`google-play-scraper` + `app-store-scraper` 기반, 양대 스토어 동시 수집)
- 리뷰 분석 방법론 내장: 긍정 신호는 별점 무관하게 발굴, 결제·환불·CS는 하나의 문제 사슬로 통합 분류
- 앱 내부 스크린샷 분석 및 용량 최적화 가이드 포함

Requirements: Node 18+

## License

MIT
