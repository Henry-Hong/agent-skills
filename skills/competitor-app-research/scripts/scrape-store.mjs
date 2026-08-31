#!/usr/bin/env node
/**
 * 앱스토어 / 플레이스토어 크롤러
 * 앱 소개(메타데이터) + 리뷰를 수집해 market-research 포맷(reviews.json)으로 저장한다.
 *
 * 사용법:
 *   node scripts/scrape-store.mjs --store play --app com.rexyrex.kakaoparser
 *   node scripts/scrape-store.mjs --store appstore --app 1108026487 --countries kr,jp --reviews 200
 *   node scripts/scrape-store.mjs --store both --play com.foo --appstore 12345 --out market-research/my-app
 *
 * 옵션:
 *   --store       play | appstore | both (기본 play)
 *   --app         앱 ID (play: 패키지명, appstore: 숫자 ID)
 *   --play        store=both 일 때 플레이스토어 패키지명
 *   --appstore    store=both 일 때 앱스토어 숫자 ID
 *   --countries   국가 코드 목록 (기본 kr)
 *   --reviews     국가당 최대 리뷰 수 (기본 200)
 *   --out         출력 폴더 (기본 market-research/<앱이름-slug>)
 *   --assets      스크린샷/아이콘 다운로드 여부 (기본 켜짐, --no-assets 로 끔)
 *   --search      ID 대신 키워드로 앱 검색만 하고 종료 (예: --search "카톡 분석")
 *
 * 출력:
 *   <out>/reviews.json            수집 원본 (appInfo + byCountry.{cc}.reviews)
 *   <out>/APP_LISTING.md          스토어 소개문구/메타데이터 마크다운
 *   <out>/reviews-digest.md       리뷰 통계 + 저평점/고추천 리뷰 발췌 (인사이트 추출용 원료)
 *   <out>/screenshots/            스토어 스크린샷 (옵션)
 */

import fs from "node:fs/promises";
import path from "node:path";
import gplay from "google-play-scraper";
import appStore from "app-store-scraper";

// ---------- CLI 파싱 ----------
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith("--") ? true : v;
};
const store = opt("store", "play");
const countries = String(opt("countries", "kr")).split(",").map((s) => s.trim().toLowerCase());
const maxReviews = Number(opt("reviews", 200));
const downloadAssets = !args.includes("--no-assets");
const searchTerm = opt("search", null);

const slugify = (s) =>
  s
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

// ---------- 검색 모드 ----------
if (searchTerm && typeof searchTerm === "string") {
  if (store === "play" || store === "both") {
    const r = await gplay.search({ term: searchTerm, num: 10, country: countries[0], lang: "ko" });
    console.log("\n[Google Play]");
    r.forEach((a) => console.log(`  ${a.appId}  ★${a.score?.toFixed(2) ?? "-"}  ${a.title}`));
  }
  if (store === "appstore" || store === "both") {
    const r = await appStore.search({ term: searchTerm, num: 10, country: countries[0] });
    console.log("\n[App Store]");
    r.forEach((a) => console.log(`  ${a.id}  ★${a.score?.toFixed(2) ?? "-"}  ${a.title}`));
  }
  process.exit(0);
}

// ---------- 수집기 ----------
async function scrapePlay(appId) {
  const appInfo = await gplay.app({ appId, country: countries[0], lang: "ko" });
  const byCountry = {};
  for (const country of countries) {
    const collected = new Map();
    let token;
    while (collected.size < maxReviews) {
      const page = await gplay.reviews({
        appId,
        country,
        lang: country === "kr" ? "ko" : undefined,
        sort: gplay.sort.NEWEST,
        num: Math.min(150, maxReviews - collected.size),
        paginate: true,
        nextPaginationToken: token,
      });
      page.data.forEach((r) => collected.set(r.id, r));
      token = page.nextPaginationToken;
      if (!token || page.data.length === 0) break;
    }
    // 도움돼요 순도 병합 (베스트 리뷰 누락 방지)
    try {
      const helpful = await gplay.reviews({ appId, country, sort: gplay.sort.HELPFULNESS, num: 50 });
      helpful.data.forEach((r) => collected.set(r.id, r));
    } catch {}
    const reviews = [...collected.values()];
    byCountry[country] = {
      reviews,
      ratings: histogram(reviews),
    };
    console.log(`  [play/${country}] 리뷰 ${reviews.length}개 수집`);
  }
  return {
    store: "google-play",
    appId,
    appInfo: {
      title: appInfo.title,
      description: appInfo.description,
      summary: appInfo.summary,
      score: appInfo.score,
      ratings: appInfo.ratings,
      reviews: appInfo.reviews,
      currentVersion: appInfo.version,
      updated: appInfo.updated,
      developer: appInfo.developer,
      genre: appInfo.genre,
      price: appInfo.priceText,
      free: appInfo.free,
      installs: appInfo.installs,
      minInstalls: appInfo.minInstalls,
      containsAds: appInfo.adSupported,
      offersIAP: appInfo.offersIAP,
      IAPRange: appInfo.IAPRange,
      icon: appInfo.icon,
      headerImage: appInfo.headerImage,
      screenshots: appInfo.screenshots,
      url: appInfo.url,
    },
    byCountry,
  };
}

async function scrapeAppStore(id) {
  const appInfo = await appStore.app({ id, country: countries[0], ratings: true });
  const byCountry = {};
  for (const country of countries) {
    const collected = new Map();
    for (const sort of [appStore.sort.RECENT, appStore.sort.HELPFUL]) {
      for (let page = 1; page <= 10 && collected.size < maxReviews; page++) {
        let data;
        try {
          data = await appStore.reviews({ id, country, sort, page });
        } catch {
          break; // 페이지 초과 시 종료
        }
        if (!data?.length) break;
        data.forEach((r) => collected.set(r.id, r));
      }
      if (collected.size >= maxReviews) break;
    }
    const reviews = [...collected.values()].slice(0, maxReviews);
    byCountry[country] = { reviews, ratings: histogram(reviews) };
    console.log(`  [appstore/${country}] 리뷰 ${reviews.length}개 수집`);
  }
  return {
    store: "app-store",
    appId: String(id),
    appInfo: {
      title: appInfo.title,
      description: appInfo.description,
      score: appInfo.score,
      ratings: appInfo.ratings,
      currentVersion: appInfo.version,
      updated: appInfo.updated,
      developer: appInfo.developer,
      genre: appInfo.primaryGenre,
      price: appInfo.price,
      free: appInfo.free,
      releaseNotes: appInfo.releaseNotes,
      icon: appInfo.icon,
      screenshots: appInfo.screenshots,
      ipadScreenshots: appInfo.ipadScreenshots,
      url: appInfo.url,
      histogram: appInfo.histogram,
    },
    byCountry,
  };
}

function histogram(reviews) {
  const h = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  reviews.forEach((r) => {
    if (h[r.score] !== undefined) h[r.score]++;
  });
  return h;
}

// ---------- 마크다운 생성 ----------
function listingMd(result) {
  const a = result.appInfo;
  return `# ${a.title} — 스토어 소개 (${result.store})

> 수집일: ${new Date().toISOString().slice(0, 10)} | ${a.url ?? ""}

| 항목 | 값 |
|------|-----|
| 개발사 | ${a.developer ?? "-"} |
| 평점 | ${a.score?.toFixed?.(2) ?? a.score ?? "-"} (${a.ratings ?? "-"}개 평가) |
| 버전 | ${a.currentVersion ?? "-"} |
| 카테고리 | ${a.genre ?? "-"} |
| 가격 | ${a.free ? "무료" : (a.price ?? "-")} |
| 설치 수 | ${a.installs ?? "-"} |
| 광고 포함 | ${a.containsAds ?? "-"} |
| 인앱결제 | ${a.offersIAP ?? "-"} ${a.IAPRange ?? ""} |

## 소개 문구 (원문)

${a.summary ? `> ${a.summary}\n` : ""}
\`\`\`
${a.description ?? ""}
\`\`\`

${a.releaseNotes ? `## 최근 릴리즈 노트\n\n\`\`\`\n${a.releaseNotes}\n\`\`\`\n` : ""}`;
}

function digestMd(result) {
  const lines = [`# ${result.appInfo.title} — 리뷰 다이제스트 (${result.store})`, ""];
  for (const [cc, { reviews, ratings }] of Object.entries(result.byCountry)) {
    const avg = reviews.length
      ? (reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(2)
      : "-";
    lines.push(`## ${cc.toUpperCase()} — ${reviews.length}개, 평균 ★${avg}`);
    lines.push("", `별점 분포: ${[5, 4, 3, 2, 1].map((s) => `★${s}=${ratings[s]}`).join(" / ")}`, "");
    const low = reviews.filter((r) => r.score <= 2).slice(0, 20);
    const top = [...reviews]
      .sort((a, b) => (b.thumbsUp ?? 0) - (a.thumbsUp ?? 0))
      .slice(0, 15);
    lines.push(`### 저평점 리뷰 (불만/기회 포인트, ${low.length}개 발췌)`, "");
    low.forEach((r) =>
      lines.push(`- ★${r.score} ${r.title ? `**${r.title}** ` : ""}${(r.text ?? "").replace(/\n/g, " ").slice(0, 300)}`)
    );
    lines.push("", "### 반응 좋은 리뷰 (핵심 가치 포인트)", "");
    top.forEach((r) =>
      lines.push(
        `- ★${r.score}${r.thumbsUp ? ` (👍${r.thumbsUp})` : ""} ${r.title ? `**${r.title}** ` : ""}${(r.text ?? "").replace(/\n/g, " ").slice(0, 300)}`
      )
    );
    lines.push("");
  }
  return lines.join("\n");
}

// ---------- 에셋 다운로드 ----------
async function saveAssets(result, dir, suffix = "") {
  const scDir = path.join(dir, `screenshots${suffix}`);
  await fs.mkdir(scDir, { recursive: true });
  const dl = async (url, file) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      await fs.writeFile(path.join(scDir, file), Buffer.from(await res.arrayBuffer()));
    } catch {}
  };
  const a = result.appInfo;
  const jobs = [];
  if (a.icon) jobs.push(dl(a.icon, "icon.png"));
  if (a.headerImage) jobs.push(dl(a.headerImage, "header.png"));
  (a.screenshots ?? []).forEach((u, i) =>
    jobs.push(dl(u, `store-screenshot-${String(i + 1).padStart(2, "0")}.png`))
  );
  await Promise.all(jobs);
  console.log(`  스크린샷 ${jobs.length}개 저장 → ${scDir}`);
}

// ---------- 실행 ----------
async function run(kind, appId) {
  console.log(`\n${kind === "play" ? "Google Play" : "App Store"} 수집 시작: ${appId}`);
  const result = kind === "play" ? await scrapePlay(appId) : await scrapeAppStore(appId);
  result.scrapedAt = new Date().toISOString();
  result.summary = Object.fromEntries(
    Object.entries(result.byCountry).map(([cc, { reviews }]) => [
      cc,
      {
        totalReviews: reviews.length,
        averageScore: reviews.length
          ? (reviews.reduce((s, r) => s + r.score, 0) / reviews.length).toFixed(2)
          : null,
      },
    ])
  );

  const dir = opt("out", null) ?? path.join("market-research", slugify(result.appInfo.title));
  await fs.mkdir(dir, { recursive: true });

  const suffix = store === "both" ? `-${kind}` : "";
  await fs.writeFile(path.join(dir, `reviews${suffix}.json`), JSON.stringify(result, null, 1));
  await fs.writeFile(path.join(dir, `APP_LISTING${suffix}.md`), listingMd(result));
  await fs.writeFile(path.join(dir, `reviews-digest${suffix}.md`), digestMd(result));
  if (downloadAssets) await saveAssets(result, dir, suffix ? `-store${suffix}` : "-store");
  console.log(`완료 → ${dir}/`);
}

try {
  if (store === "both") {
    const p = opt("play", null);
    const a = opt("appstore", null);
    if (!p && !a) throw new Error("--play <패키지명> 또는 --appstore <ID> 를 지정하세요");
    if (p) await run("play", p);
    if (a) await run("appstore", a);
  } else {
    const appId = opt("app", null);
    if (!appId) throw new Error("--app <ID> 를 지정하세요 (또는 --search '키워드' 로 검색)");
    await run(store === "appstore" ? "appstore" : "play", appId);
  }
} catch (e) {
  console.error("에러:", e.message);
  process.exit(1);
}
