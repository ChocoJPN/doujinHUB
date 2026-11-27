/**
 * Cloudflare Pages Functions: /work/[id]
 *
 * Google検索（作品名検索）＆ X(Twitter) シェアに最適化されたSSR（サーバーサイドレンダリング）作品詳細ページ。
 * - 作品名 <h1>・スペック表・紹介文・サンプル立ち読み画像・関連作品への内部リンクを完全なHTMLとして即時返却
 * - Product / Book JSON-LD + BreadcrumbList JSON-LD + 動的OGP (summary_large_image) を自動出力
 * - seo_index.json に無い古い作品IDは DMM Affiliate API (cid検索) へ自動フォールバック
 */

const SITE_NAME = "DOUJIN INDEX";
const DEFAULT_AFFILIATE_ID = "douzinINFO-001";

const CAT_META = {
  comic: { label: "同人誌・漫画", short: "同人誌", color: "#f43f5e" },
  books: { label: "ブックス（商業コミック）", short: "ブックス", color: "#2563eb" },
  audio: { label: "同人音声・ASMR", short: "音声・ASMR", color: "#06b6d4" },
  cg: { label: "CG・イラスト集", short: "CG集", color: "#f59e0b" },
  game: { label: "ゲーム・動画", short: "ゲーム", color: "#10b981" }
};

let cachedSeoIndex = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 10;

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function buildAffiliateUrl(directUrl, affiliateId) {
  if (!directUrl) return "";
  const afId = affiliateId || DEFAULT_AFFILIATE_ID;
  return `https://al.fanza.co.jp/?lurl=${encodeURIComponent(directUrl)}&af_id=${encodeURIComponent(afId)}&ch=toolbar&ch_id=link`;
}

function getWorkAffiliateUrl(workId, w, env) {
  const afId = env?.DMM_SITE_AFFILIATE_ID || DEFAULT_AFFILIATE_ID;
  const isBooks = w.s === "books" || w.cat === "books";
  if (isBooks) {
    const direct = w.u || `https://book.dmm.co.jp/detail/${workId}/`;
    return buildAffiliateUrl(direct, afId);
  }
  const direct = `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${workId}/`;
  return buildAffiliateUrl(direct, afId);
}

async function loadSeoIndex(requestUrl, env) {
  const now = Date.now();
  if (cachedSeoIndex && now - cachedAt < CACHE_TTL_MS) {
    return cachedSeoIndex;
  }
  try {
    if (env && env.ASSETS) {
      const assetUrl = new URL("/data/seo_index.json", requestUrl.origin);
      const res = await env.ASSETS.fetch(new Request(assetUrl.toString()));
      if (res.ok) {
        const data = await res.json();
        if (data && data.works) {
          cachedSeoIndex = data;
          cachedAt = now;
          return cachedSeoIndex;
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function fetchWorkFromDmmApi(workId, env) {
  const apiId = env?.DMM_API_ID;
  const affiliateId = env?.DMM_AFFILIATE_ID;
  if (!apiId || !affiliateId || apiId === "あなたのDMM_API_ID") return null;

  const isBooksLikely = !String(workId).startsWith("d_");
  const targets = isBooksLikely
    ? [
        { service: "ebook", floor: "comic", source: "books" },
        { service: "doujin", floor: "digital_doujin", source: "doujin" }
      ]
    : [
        { service: "doujin", floor: "digital_doujin", source: "doujin" },
        { service: "ebook", floor: "comic", source: "books" }
      ];

  for (const t of targets) {
    try {
      const p = new URLSearchParams({
        api_id: apiId,
        affiliate_id: affiliateId,
        site: "FANZA",
        service: t.service,
        floor: t.floor,
        cid: workId,
        hits: "1",
        output: "json"
      });
      const r = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${p.toString()}`);
      if (!r.ok) continue;
      const j = await r.json();
      const it = j?.result?.items?.[0];
      if (!it) continue;

      const isBooks = t.source === "books";
      const genres = (it.iteminfo?.genre || []).map((g) => g.name);
      const img = it.imageURL?.large || it.imageURL?.list || "";
      let cat = isBooks ? "books" : "comic";
      if (!isBooks) {
        if (img.includes("/digital/voice/")) cat = "audio";
        else if (img.includes("/digital/cg/")) cat = "cg";
        else if (img.includes("/digital/game/")) cat = "game";
      }

      const authors = it.iteminfo?.author || [];
      const makers = it.iteminfo?.maker || [];
      const pubs = it.iteminfo?.manufacture || [];
      const circleName = isBooks
        ? authors.length > 0
          ? authors.slice(0, 2).map((a) => a.name).join(" / ")
          : pubs[0]?.name || "商業コミック作家"
        : makers[0]?.name || "同人サークル";
      const creatorId = isBooks
        ? authors[0]?.id
          ? `author_${authors[0].id}`
          : pubs[0]?.id
            ? `pub_${pubs[0].id}`
            : ""
        : makers[0]?.id
          ? `maker_${makers[0].id}`
          : "";

      const price = Number(String(it.prices?.price || "0").replace(/[^0-9]/g, "")) || 0;
      const origPrice = Number(String(it.prices?.list_price || price).replace(/[^0-9]/g, "")) || price;
      const discount = origPrice > price ? Math.round(((origPrice - price) / origPrice) * 100) : 0;

      const sampleLarge = it.sampleImageURL?.sample_l?.image || [];
      const sampleSmall = (it.sampleImageURL?.sample_s?.image || []).map((u) =>
        String(u).replace(/js-(\d+\.jpg)$/i, "jp-$1")
      );
      const samples = (sampleLarge.length > 0 ? sampleLarge : sampleSmall).slice(0, 6);
      const afId = env?.DMM_SITE_AFFILIATE_ID || DEFAULT_AFFILIATE_ID;
      const tachiyomiUrl = it.tachiyomi?.URL ? buildAffiliateUrl(it.tachiyomi.URL, afId) : "";

      const isAi =
        genres.some((g) => g.includes("AI生成") || g === "AI" || g.includes("AIイラスト")) ||
        /(^|[^a-zA-Z0-9])AI([^a-zA-Z0-9]|$)|AI生成|AIイラスト/i.test(`${it.title || ""} ${circleName}`);

      return {
        t: it.title || "",
        c: circleName,
        cid: creatorId,
        pub: isBooks ? pubs[0]?.name || "" : "",
        ser: it.iteminfo?.series?.[0]?.name || "",
        s: isBooks ? "books" : "doujin",
        cat,
        pr: price,
        op: origPrice,
        d: discount,
        sp: it.volume ? (cat === "audio" ? `音声 ${it.volume}分` : cat === "cg" ? `CG ${it.volume}枚` : `${it.volume}P`) : CAT_META[cat].label,
        dt: (it.date || "").split(" ")[0].replace(/-/g, "."),
        r: Number(it.review?.average || 4.5),
        rc: Number(it.review?.count || 0),
        img,
        ai: isAi,
        u: it.URL || "",
        tu: tachiyomiUrl,
        sm: samples,
        tg: genres.slice(0, 6)
      };
    } catch (e) {
      // ignore
    }
  }
  return null;
}

function findRelatedWorks(workId, w, seoIndex) {
  const worksMap = seoIndex?.works;
  if (!worksMap) return { sameCreator: [], similar: [] };

  const sameCreator = [];
  const similarScored = [];
  const myTags = new Set(Array.isArray(w.tg) ? w.tg : []);

  for (const [id, item] of Object.entries(worksMap)) {
    if (id === workId) continue;

    if ((w.cid && item.cid && item.cid === w.cid) || (w.c && item.c === w.c && item.s === w.s)) {
      sameCreator.push({ id, ...item });
      continue;
    }

    if (item.s !== w.s) continue;
    let score = 0;
    if (item.cat === w.cat) score += 2;
    if (!w.ai && !item.ai) score += 1;
    if (Array.isArray(item.tg)) {
      for (const tg of item.tg) {
        if (myTags.has(tg)) score += 3;
      }
    }
    if (score >= 4) {
      score += Math.min(3, (item.rc || 0) / 30);
      similarScored.push({ id, ...item, _score: score });
    }
  }

  sameCreator.sort((a, b) => (b.rc || 0) - (a.rc || 0));
  similarScored.sort((a, b) => b._score - a._score);

  return {
    sameCreator: sameCreator.slice(0, 5),
    similar: similarScored.slice(0, 10)
  };
}

function renderRelatedCard(item) {
  const isBooks = item.s === "books" || item.cat === "books";
  const catMeta = CAT_META[item.cat] || CAT_META.comic;
  return `
    <a href="/work/${encodeURIComponent(item.id)}" class="rel-card">
      <div class="rel-thumb ${isBooks ? "is-books" : ""}" style="background-image:url('${esc(item.img)}');">
        ${isBooks && item.img ? `<img src="${esc(item.img)}" alt="${esc(item.t)}" class="rel-books-img" loading="lazy" />` : ""}
        <div class="rel-badges">
          <span class="badge cat-${esc(item.cat)}">${esc(catMeta.short)}</span>
          ${item.d > 0 ? `<span class="badge sale">${item.d}%OFF</span>` : ""}
        </div>
      </div>
      <div class="rel-body">
        <div class="rel-creator">${esc(item.c)}</div>
        <div class="rel-title">${esc(item.t)}</div>
        <div class="rel-foot">
          <span class="rel-price ${item.d > 0 ? "is-sale" : ""}">¥${Number(item.pr || 0).toLocaleString()}</span>
          <span class="rel-rate">★${Number(item.r || 4.5).toFixed(1)}</span>
        </div>
      </div>
    </a>
  `;
}

function buildXPostText(workId, w, canonicalUrl) {
  const isBooks = w.s === "books" || w.cat === "books";
  const badge =
    w.d > 0
      ? `🔥【${w.d}%OFFセール中！】`
      : isBooks
        ? "📚【FANZAブックス注目作】"
        : !w.ai
          ? "✨【手描き・非AIおすすめ】"
          : "📘【FANZA同人注目作】";
  const shortTitle = w.t.length > 42 ? `${w.t.slice(0, 42)}…` : w.t;
  const creatorLine = isBooks && w.pub ? `${w.c}（${w.pub}）` : w.c;
  const priceLine = `${w.sp ? `${w.sp} / ` : ""}¥${Number(w.pr || 0).toLocaleString()}${w.d > 0 ? `（${w.d}%OFF）` : ""}${w.rc ? ` / ★${Number(w.r || 4.5).toFixed(1)}(${w.rc}件)` : ""}`;
  const baseTag = isBooks ? "#FANZAブックス #商業コミック" : "#FANZA同人 #同人誌";
  const extraTags = (w.tg || [])
    .filter((t) => t && !/[ #/\\]/.test(t) && t.length <= 12)
    .slice(0, 2)
    .map((t) => `#${t}`)
    .join(" ");

  return [
    badge,
    `『${shortTitle}』`,
    `${isBooks ? "著者" : "サークル"}: ${creatorLine}`,
    priceLine,
    isBooks ? "📖無料立ち読み＆作品詳細👇" : "📖サンプル立ち読み＆感想はこちら👇",
    canonicalUrl,
    `${baseTag}${extraTags ? ` ${extraTags}` : ""} #PR`
  ].join("\n");
}

function renderNotFoundHtml(workId, baseOrigin) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>作品が見つかりませんでした | ${SITE_NAME}</title>
  <meta name="robots" content="noindex, follow" />
  <style>
    body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Noto Sans JP",sans-serif; background:#0b0b10; color:#fafafa; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:20px; }
    .box { max-width:520px; width:100%; background:#14141d; border:1px solid #2a2a3c; border-radius:14px; padding:28px; text-align:center; }
    h1 { font-size:1.2rem; margin-bottom:10px; }
    p { font-size:0.86rem; color:#b4b4c7; line-height:1.6; margin-bottom:20px; }
    a { display:inline-block; padding:10px 22px; border-radius:8px; background:linear-gradient(135deg,#e11d48,#f43f5e); color:#fff; text-decoration:none; font-weight:800; font-size:0.88rem; }
  </style>
</head>
<body>
  <div class="box">
    <h1>指定された作品が見つかりませんでした</h1>
    <p>作品ID「${esc(workId)}」は配信終了または未収録の可能性があります。トップページから最新ランキング・検索をお試しください。</p>
    <a href="${esc(baseOrigin)}/">DOUJIN INDEX トップページへ戻る</a>
  </div>
</body>
</html>`;
}

function renderWorkPageHtml(workId, w, related, baseOrigin, env) {
  const isBooks = w.s === "books" || w.cat === "books";
  const catMeta = CAT_META[w.cat] || CAT_META.comic;
  const storeName = isBooks ? "FANZAブックス" : "FANZA同人";
  const storeQuery = isBooks ? "/?source=books" : "/?source=doujin";
  const canonicalUrl = `${baseOrigin}/work/${encodeURIComponent(workId)}`;
  const fanzaUrl = getWorkAffiliateUrl(workId, w, env);
  const officialPromoUrl = buildAffiliateUrl(
    isBooks ? "https://book.dmm.co.jp/" : "https://www.dmm.co.jp/dc/doujin/",
    env?.DMM_SITE_AFFILIATE_ID || DEFAULT_AFFILIATE_ID
  );

  const discountPrefix = w.d > 0 ? `【${w.d}%OFF】` : "";
  const pageTitle = `${discountPrefix}『${w.t}』立ち読み・感想・作品詳細 / ${w.c} | ${storeName} - ${SITE_NAME}`;
  const tagsList = Array.isArray(w.tg) ? w.tg : [];
  const tagsText = tagsList.length > 0 ? tagsList.slice(0, 5).join("・") : catMeta.label;
  const pageDesc = `${discountPrefix}${storeName}『${w.t}』（${isBooks ? "著者" : "サークル"}: ${w.c}${w.pub ? ` / ${w.pub}` : ""}）の作品詳細・立ち読み・最安価格情報。${w.sp ? `${w.sp}、` : ""}価格¥${Number(w.pr || 0).toLocaleString()}${w.rc ? `、レビュー評価★${Number(w.r || 4.5).toFixed(2)}(${w.rc}件)` : ""}。ジャンル：${tagsText}。`;

  const xPostText = buildXPostText(workId, w, canonicalUrl);
  const xIntentUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(xPostText)}`;

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": isBooks ? "Book" : "Product",
    name: w.t,
    description: pageDesc,
    image: w.img ? [w.img] : undefined,
    sku: workId,
    url: canonicalUrl,
    brand: {
      "@type": "Organization",
      name: isBooks && w.pub ? w.pub : w.c
    },
    author: {
      "@type": "Person",
      name: w.c
    },
    datePublished: w.dt ? String(w.dt).replace(/\./g, "-") : undefined,
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "JPY",
      price: Number(w.pr || 0),
      availability: "https://schema.org/InStock"
    },
    aggregateRating:
      Number(w.rc) > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: Number(w.r || 4.5),
            reviewCount: Number(w.rc),
            bestRating: 5,
            worstRating: 1
          }
        : undefined
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "ホーム", item: `${baseOrigin}/` },
      { "@type": "ListItem", position: 2, name: storeName, item: `${baseOrigin}${storeQuery}` },
      {
        "@type": "ListItem",
        position: 3,
        name: catMeta.label,
        item: `${baseOrigin}/?cat=${encodeURIComponent(w.cat)}`
      },
      { "@type": "ListItem", position: 4, name: w.t, item: canonicalUrl }
    ]
  };

  const samples = Array.isArray(w.sm) ? w.sm : [];
  const creatorFilterUrl = w.cid ? `/?creator=${encodeURIComponent(w.cid)}` : `/?q=${encodeURIComponent(w.c)}`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(pageDesc)}" />
  <link rel="canonical" href="${esc(canonicalUrl)}" />
  <meta property="og:site_name" content="${SITE_NAME}" />
  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(pageTitle)}" />
  <meta property="og:description" content="${esc(pageDesc)}" />
  <meta property="og:url" content="${esc(canonicalUrl)}" />
  ${w.img ? `<meta property="og:image" content="${esc(w.img)}" />` : ""}
  <meta name="twitter:card" content="${w.img ? "summary_large_image" : "summary"}" />
  <meta name="twitter:title" content="${esc(pageTitle)}" />
  <meta name="twitter:description" content="${esc(pageDesc)}" />
  ${w.img ? `<meta name="twitter:image" content="${esc(w.img)}" />` : ""}
  <script type="application/ld+json">${escJsonLd(productJsonLd)}</script>
  <script type="application/ld+json">${escJsonLd(breadcrumbJsonLd)}</script>
  <style>
    :root {
      --bg: #0b0b10;
      --surface: #14141d;
      --surface-2: #1a1a28;
      --border: #2a2a3c;
      --text: #fafafa;
      --text-sub: #b4b4c7;
      --text-muted: #7c7c94;
      --accent: #f43f5e;
      --accent-grad: linear-gradient(135deg, #e11d48 0%, #f43f5e 55%, #fb7185 100%);
      --books-grad: linear-gradient(135deg, #2563eb 0%, #4f46e5 100%);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Inter", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif;
      background-color: var(--bg);
      background-image:
        radial-gradient(ellipse 80% 40% at 15% -5%, rgba(244, 63, 94, 0.12), transparent 60%),
        radial-gradient(ellipse 70% 40% at 85% 0%, rgba(59, 130, 246, 0.12), transparent 60%);
      color: var(--text);
      line-height: 1.55;
      padding-bottom: 64px;
    }
    a { color: inherit; }
    .container { max-width: 1180px; margin: 0 auto; padding: 0 18px; }
    .site-header {
      background: rgba(18, 18, 27, 0.96);
      border-bottom: 1px solid var(--border);
      padding: 13px 0;
      position: sticky;
      top: 0;
      z-index: 40;
      backdrop-filter: blur(10px);
    }
    .header-inner { display: flex; align-items: center; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
    .brand { display: inline-flex; align-items: center; gap: 9px; text-decoration: none; }
    .brand-bar { width: 5px; height: 24px; border-radius: 3px; background: linear-gradient(180deg, #f43f5e, #8b5cf6); }
    .brand-name { font-weight: 900; font-size: 1.05rem; letter-spacing: -0.01em; }
    .top-nav { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .nav-pill {
      padding: 5px 11px; border-radius: 7px; border: 1px solid var(--border);
      background: var(--surface); color: var(--text-sub); text-decoration: none;
      font-size: 0.78rem; font-weight: 700; transition: all 0.15s;
    }
    .nav-pill:hover { color: #fff; border-color: #f43f5e; }
    .breadcrumb {
      display: flex; align-items: center; flex-wrap: wrap; gap: 6px;
      font-size: 0.76rem; color: var(--text-muted); margin: 16px 0 14px;
    }
    .breadcrumb a { color: var(--text-sub); text-decoration: none; }
    .breadcrumb a:hover { color: #fda4af; text-decoration: underline; }
    .hero-card {
      background: linear-gradient(180deg, rgba(24, 24, 36, 0.96), rgba(17, 17, 26, 0.98));
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 22px;
      display: grid;
      grid-template-columns: minmax(0, 420px) minmax(0, 1fr);
      gap: 24px;
      margin-bottom: 26px;
    }
    @media (max-width: 840px) {
      .hero-card { grid-template-columns: 1fr; padding: 16px; }
    }
    .hero-cover-wrap {
      border-radius: 12px; overflow: hidden; border: 1px solid var(--border);
      background: #09090d; display: flex; align-items: center; justify-content: center;
    }
    .hero-cover { width: 100%; height: auto; display: block; object-fit: contain; max-height: 560px; }
    .badge-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
    .badge {
      font-size: 0.72rem; font-weight: 800; padding: 3px 9px; border-radius: 6px;
      background: #27272a; color: #fff; display: inline-flex; align-items: center;
    }
    .badge.cat-comic { background: rgba(244, 63, 94, 0.9); }
    .badge.cat-books { background: rgba(37, 99, 235, 0.92); }
    .badge.cat-audio { background: rgba(6, 182, 212, 0.9); }
    .badge.cat-cg { background: rgba(245, 158, 11, 0.92); color: #18181b; }
    .badge.cat-game { background: rgba(16, 185, 129, 0.9); }
    .badge.non-ai { background: rgba(16, 185, 129, 0.16); border: 1px solid rgba(16, 185, 129, 0.45); color: #6ee7b7; }
    .badge.is-ai { background: linear-gradient(135deg, #7c3aed, #a855f7); }
    .badge.sale { background: linear-gradient(135deg, #f43f5e, #f97316); }
    h1 { font-size: 1.42rem; font-weight: 900; line-height: 1.4; margin-bottom: 14px; letter-spacing: -0.01em; }
    .meta-table {
      display: grid; grid-template-columns: 110px 1fr; gap: 7px 12px;
      font-size: 0.84rem; padding: 12px 14px; border-radius: 10px;
      background: rgba(9, 9, 14, 0.65); border: 1px solid var(--border); margin-bottom: 16px;
    }
    .meta-label { color: var(--text-muted); font-weight: 700; }
    .meta-val a { color: #93c5fd; text-decoration: none; font-weight: 700; }
    .meta-val a:hover { text-decoration: underline; }
    .price-box {
      display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px;
      margin-bottom: 16px;
    }
    .price-now { font-size: 1.75rem; font-weight: 900; }
    .price-now.is-sale { color: #fb7185; }
    .price-orig { font-size: 0.95rem; color: var(--text-muted); text-decoration: line-through; }
    .cta-row { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
    .btn-primary {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 13px 22px; border-radius: 10px; background: var(--accent-grad);
      color: #fff; font-size: 0.95rem; font-weight: 800; text-decoration: none;
      box-shadow: 0 4px 16px rgba(244, 63, 94, 0.4); flex: 1; min-width: 210px;
    }
    .btn-primary.is-books { background: var(--books-grad); box-shadow: 0 4px 16px rgba(37, 99, 235, 0.45); }
    .btn-tachiyomi {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 13px 20px; border-radius: 10px; background: linear-gradient(135deg, #0ea5e9, #2563eb);
      color: #fff; font-size: 0.92rem; font-weight: 800; text-decoration: none;
      box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35);
    }
    .share-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
    .btn-sub {
      padding: 8px 13px; border-radius: 8px; border: 1px solid var(--border);
      background: var(--surface-2); color: var(--text-sub); font-size: 0.78rem;
      font-weight: 700; text-decoration: none; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;
    }
    .btn-sub:hover { color: #fff; border-color: #64748b; }
    .btn-x { background: #0f1419; border-color: #38444d; color: #fff; }
    .tags-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .tag-link {
      font-size: 0.75rem; padding: 3px 9px; border-radius: 6px;
      background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border);
      color: var(--text-sub); text-decoration: none;
    }
    .tag-link:hover { color: #fda4af; border-color: rgba(244, 63, 94, 0.5); }
    .promo-note {
      margin-top: 12px; padding: 10px 13px; border-radius: 9px;
      background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(251, 191, 36, 0.35);
      font-size: 0.78rem; color: #fde68a;
    }
    .promo-note a { color: #fff; font-weight: 800; margin-left: 6px; }
    .section-box {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 14px; padding: 20px; margin-bottom: 24px;
    }
    .section-h2 {
      font-size: 1.08rem; font-weight: 800; margin-bottom: 14px;
      display: flex; align-items: center; gap: 8px;
    }
    .section-bar { width: 5px; height: 18px; border-radius: 3px; background: var(--accent-grad); display: inline-block; }
    .sample-stack { display: flex; flex-direction: column; align-items: center; gap: 16px; }
    .sample-img-wrap { width: 100%; max-width: 720px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); background: #070709; }
    .sample-img-cap { padding: 6px 12px; font-size: 0.74rem; color: var(--text-sub); background: #181822; border-bottom: 1px solid var(--border); }
    .sample-img-wrap img { width: 100%; height: auto; display: block; }
    .summary-p { font-size: 0.88rem; color: #e4e4e7; line-height: 1.8; }
    .rel-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
    @media (max-width: 1024px) { .rel-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 640px) { .rel-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .rel-card {
      background: #181824; border: 1px solid var(--border); border-radius: 10px;
      overflow: hidden; text-decoration: none; display: flex; flex-direction: column;
      transition: transform 0.15s, border-color 0.15s;
    }
    .rel-card:hover { transform: translateY(-2px); border-color: rgba(244, 63, 94, 0.55); }
    .rel-thumb {
      aspect-ratio: 4/3; background-size: cover; background-position: center top;
      position: relative; padding: 6px; overflow: hidden;
    }
    .rel-thumb.is-books::after {
      content: ""; position: absolute; inset: 0; backdrop-filter: blur(8px) brightness(0.45); z-index: 0;
    }
    .rel-books-img { position: absolute; inset: 4px 0; width: 100%; height: calc(100% - 8px); object-fit: contain; z-index: 1; }
    .rel-badges { position: relative; z-index: 2; display: flex; gap: 4px; flex-wrap: wrap; }
    .rel-body { padding: 8px 10px; display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .rel-creator { font-size: 0.7rem; color: #93c5fd; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .rel-title {
      font-size: 0.78rem; font-weight: 700; line-height: 1.35;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
    }
    .rel-foot { margin-top: auto; display: flex; justify-content: space-between; align-items: center; padding-top: 4px; font-size: 0.76rem; }
    .rel-price { font-weight: 800; }
    .rel-price.is-sale { color: #fb7185; }
    .rel-rate { color: #fbbf24; font-weight: 700; font-size: 0.72rem; }
    .site-footer {
      margin-top: 40px; padding: 22px 0; border-top: 1px solid var(--border);
      color: var(--text-muted); font-size: 0.75rem; line-height: 1.7;
    }
  </style>
</head>
<body>
  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand">
        <span class="brand-bar"></span>
        <span class="brand-name">${SITE_NAME}</span>
      </a>
      <nav class="top-nav" aria-label="サイトナビゲーション">
        <a href="/" class="nav-pill">総合トップ</a>
        <a href="/?source=doujin" class="nav-pill">📘 FANZA同人</a>
        <a href="/?source=books" class="nav-pill">📚 FANZAブックス</a>
        <a href="/?source=doujin&ai=non_ai" class="nav-pill">✨ 非AI（手描き）</a>
        <a href="/?tab=sale" class="nav-pill">🔥 セール・割引中</a>
      </nav>
    </div>
  </header>

  <main class="container">
    <nav class="breadcrumb" aria-label="パンくずリスト">
      <a href="/">ホーム</a><span>›</span>
      <a href="${storeQuery}">${esc(storeName)}</a><span>›</span>
      <a href="/?cat=${encodeURIComponent(w.cat)}">${esc(catMeta.label)}</a><span>›</span>
      <a href="${creatorFilterUrl}">${esc(w.c)}</a><span>›</span>
      <span>${esc(w.t)}</span>
    </nav>

    <article class="hero-card">
      <div class="hero-cover-wrap">
        ${w.img ? `<img src="${esc(w.img)}" alt="${esc(w.t)}" class="hero-cover" />` : ""}
      </div>

      <div>
        <div class="badge-row">
          <span class="badge cat-${esc(w.cat)}">${esc(catMeta.label)}</span>
          ${w.ai ? `<span class="badge is-ai">AI生成作品</span>` : `<span class="badge non-ai">非AI（手描き・通常）</span>`}
          ${w.d > 0 ? `<span class="badge sale">${w.d}%OFF セール中</span>` : ""}
        </div>

        <h1>${esc(w.t)}</h1>

        <div class="meta-table">
          <div class="meta-label">${isBooks ? "著者" : "サークル"}</div>
          <div class="meta-val"><a href="${creatorFilterUrl}">${esc(w.c)}</a></div>
          ${w.pub ? `<div class="meta-label">出版社</div><div class="meta-val"><a href="/?q=${encodeURIComponent(w.pub)}">${esc(w.pub)}</a></div>` : ""}
          ${w.ser && w.ser !== w.t ? `<div class="meta-label">シリーズ</div><div class="meta-val">${esc(w.ser)}</div>` : ""}
          <div class="meta-label">仕様・分量</div>
          <div class="meta-val">${esc(w.sp || catMeta.label)}</div>
          <div class="meta-label">配信開始日</div>
          <div class="meta-val">${esc(w.dt || "-")}</div>
          <div class="meta-label">評価・レビュー</div>
          <div class="meta-val" style="color:#fbbf24; font-weight:800;">★${Number(w.r || 4.5).toFixed(2)}${w.rc ? `（${w.rc}件のレビュー）` : ""}</div>
          <div class="meta-label">作品ID</div>
          <div class="meta-val" style="font-family:ui-monospace,monospace;">${esc(workId)}</div>
        </div>

        <div class="price-box">
          <span class="price-now ${w.d > 0 ? "is-sale" : ""}">¥${Number(w.pr || 0).toLocaleString()}</span>
          ${w.d > 0 && w.op > w.pr ? `<span class="price-orig">¥${Number(w.op).toLocaleString()}</span><span class="badge sale">${w.d}%OFF</span>` : ""}
        </div>

        <div class="cta-row">
          ${isBooks && w.tu ? `<a href="${esc(w.tu)}" target="_blank" rel="noopener" class="btn-tachiyomi">📖 無料立ち読みする ↗</a>` : ""}
          <a href="${esc(fanzaUrl)}" target="_blank" rel="noopener" class="btn-primary ${isBooks ? "is-books" : ""}">
            ${isBooks ? "📚 FANZAブックス公式で見る ↗" : "📘 FANZA公式で本編・詳細を見る ↗"}
          </a>
        </div>

        <div class="share-row">
          <a href="${esc(xIntentUrl)}" target="_blank" rel="noopener" class="btn-sub btn-x">𝕏 Xに投稿する</a>
          <button type="button" id="copyXBtn" class="btn-sub">📋 X紹介文をコピー</button>
          <a href="/?tab=community" class="btn-sub">💬 コミュニティで感想を見る</a>
        </div>

        ${tagsList.length > 0
          ? `<div class="tags-wrap">
              ${tagsList.map((tg) => `<a href="/?tag=${encodeURIComponent(tg)}" class="tag-link">#${esc(tg)}</a>`).join("")}
            </div>`
          : ""}

        <div class="promo-note">
          🎁 初回購入限定クーポンや期間限定の大幅割引セールはFANZA公式にて随時開催中です。
          <a href="${esc(officialPromoUrl)}" target="_blank" rel="noopener">公式キャンペーンを確認 ↗</a>
        </div>
      </div>
    </article>

    ${samples.length > 0
      ? `<section class="section-box">
          <h2 class="section-h2"><span class="section-bar"></span>📖 サンプル立ち読みプレビュー（${samples.length}枚）</h2>
          <div class="sample-stack">
            ${samples
              .map(
                (src, idx) => `
              <div class="sample-img-wrap">
                <div class="sample-img-cap">サンプル ${idx + 1} / ${samples.length} ページ</div>
                <img src="${esc(src)}" alt="${esc(w.t)} サンプル画像 ${idx + 1}" loading="${idx === 0 ? "eager" : "lazy"}" />
              </div>`
              )
              .join("")}
            <a href="${esc(fanzaUrl)}" target="_blank" rel="noopener" class="btn-primary ${isBooks ? "is-books" : ""}" style="max-width:420px; width:100%; margin-top:6px;">
              続きの全ページをFANZA公式で見る ↗
            </a>
          </div>
        </section>`
      : ""}

    <section class="section-box">
      <h2 class="section-h2"><span class="section-bar" style="background:#3b82f6;"></span>作品の概要・おすすめポイント</h2>
      <p class="summary-p">
        『${esc(w.t)}』は、${esc(w.c)}${w.pub ? `（出版社：${esc(w.pub)}）` : ""}により${esc(storeName)}にて配信されている${esc(catMeta.label)}作品です（作品ID：${esc(workId)}）。
        収録ボリュームは「${esc(w.sp || catMeta.label)}」、現在の販売価格は ¥${Number(w.pr || 0).toLocaleString()}${w.d > 0 ? `（通常価格から${w.d}%OFFのセール割引中）` : ""}となっています。
        ${w.rc ? `ユーザーレビューは計${w.rc}件、平均評価 ★${Number(w.r || 4.5).toFixed(2)} を獲得しています。` : ""}
        ${tagsList.length > 0 ? `主なジャンル・特徴タグは「${esc(tagsList.join("」「"))}」です。` : ""}
        ${isBooks ? "FANZAブックス公式ページでは、無料立ち読みビューアや初回限定クーポンの適用可否も確認できます。" : "FANZA公式ページでは、全ページの高画質ダウンロード版・ブラウザ閲覧版をお楽しみいただけます。"}
      </p>
    </section>

    ${related.sameCreator.length > 0
      ? `<section class="section-box">
          <h2 class="section-h2"><span class="section-bar" style="background:#10b981;"></span>${esc(w.c)}の他の人気作品</h2>
          <div class="rel-grid">
            ${related.sameCreator.map(renderRelatedCard).join("")}
          </div>
        </section>`
      : ""}

    ${related.similar.length > 0
      ? `<section class="section-box">
          <h2 class="section-h2"><span class="section-bar" style="background:#8b5cf6;"></span>似たジャンル・タグのおすすめ作品</h2>
          <div class="rel-grid">
            ${related.similar.map(renderRelatedCard).join("")}
          </div>
        </section>`
      : ""}

    <footer class="site-footer">
      <div>${SITE_NAME} — FANZA同人・ブックス 新着・ランキング・有名作家まとめ（R18 / 広告 PR）</div>
      <div>※当サイトは成人向け（18歳未満閲覧禁止）であり、アフィリエイト広告（DMMアフィリエイト）を利用しています。</div>
      <div><a href="https://affiliate.dmm.com/api/" target="_blank" rel="noopener">Powered by FANZA Webサービス</a></div>
    </footer>
  </main>

  <script>
    const copyBtn = document.getElementById("copyXBtn");
    if (copyBtn) {
      const postText = ${JSON.stringify(xPostText)};
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(postText).then(() => {
          copyBtn.textContent = "✅ 紹介文をコピーしました！";
        });
      });
    }
  </script>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const workId = decodeURIComponent(String(params?.id || "")).trim();

  // 独自ドメイン（SITE_URL）設定時、旧ドメイン (*.pages.dev 等) からのアクセスを自動301リダイレクト
  if (env && env.SITE_URL) {
    try {
      const canonicalOrigin = new URL(String(env.SITE_URL)).origin;
      const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
      if (!isLocal && url.origin !== canonicalOrigin) {
        return Response.redirect(`${canonicalOrigin}${url.pathname}${url.search}`, 301);
      }
    } catch (e) { }
  }

  const baseOrigin = (env && env.SITE_URL ? String(env.SITE_URL).replace(/\/+$/, "") : "") || url.origin;
  if (!workId || !/^[a-zA-Z0-9_-]{3,40}$/.test(workId)) {
    return new Response(renderNotFoundHtml(workId || "-", baseOrigin), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  const seoIndex = await loadSeoIndex(url, env);
  let work = seoIndex?.works?.[workId] || null;
  if (!work) {
    work = await fetchWorkFromDmmApi(workId, env);
  }

  if (!work) {
    return new Response(renderNotFoundHtml(workId, baseOrigin), {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8" }
    });
  }

  const related = findRelatedWorks(workId, work, seoIndex);
  const html = renderWorkPageHtml(workId, work, related, baseOrigin, env);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=1800"
    }
  });
}
