/**
 * Cloudflare Pages Functions Middleware: 動的OGP & SEOメタタグ・JSON-LD構造化データ生成
 *
 * 以下のURLアクセス時にHTMLの <head> 内メタタグを動的に最適化します：
 * - /?id=<workId>        : 作品ごとの表紙画像(og:image)・価格/割引・評価・Product JSON-LD
 * - /?creator=<id>       : サークル/作家ごとの代表画像・作品数・CollectionPage JSON-LD
 * - /?source=books|doujin, /?cat=..., /?ai=non_ai, /?tag=..., /?tab=... : 切り口別SEOメタ
 * - /                    : トップページの最新1位作品OGP & WebSite JSON-LD
 */

const DEFAULT_SITE_NAME = "DOUJIN INDEX";
const DEFAULT_TITLE = "DOUJIN INDEX — FANZA同人・ブックス 新着・ランキング・有名作家まとめ";
const DEFAULT_DESC =
  "FANZA同人（同人誌・音声ASMR・CG集・ゲーム）とFANZAブックス（商業コミック）の新着、人気ランキング、有名作家・サークル別まとめサイト。同人・ブックス切替とAI/非AIフィルター対応。";

const CAT_LABELS = {
  comic: "同人誌・漫画",
  books: "FANZAブックス（商業コミック）",
  audio: "同人音声・ASMR",
  cg: "CG・イラスト集",
  game: "同人ゲーム・動画"
};

const TAB_LABELS = {
  pop_ranking: "人気ランキング",
  sales_ranking: "新作・準新作・ロングセラー・販売数ランキング",
  format_ranking: "作品形式別ランキング",
  pickup: "ピックアップ作品",
  new: "新着作品一覧",
  creators: "有名作家・人気サークル一覧",
  sale: "セール・割引中作品まとめ",
  community: "感想・レビューコミュニティ"
};

// Isolate内キャッシュ（初回のみ軽量 seo_index.json を読み込み）
let cachedSeoIndex = null;
let cachedAt = 0;
const CACHE_TTL_MS = 1000 * 60 * 10;

function escapeAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
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
    // 読み込み失敗時はデフォルトメタにフォールバック
  }
  return null;
}

async function fetchSingleWorkFromDmmApi(workId, env) {
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
      const author = isBooks
        ? (it.iteminfo?.author || []).slice(0, 2).map((a) => a.name).join(" / ") ||
          it.iteminfo?.manufacture?.[0]?.name ||
          "商業コミック作家"
        : it.iteminfo?.maker?.[0]?.name || "同人サークル";
      const price = Number(String(it.prices?.price || "0").replace(/[^0-9]/g, "")) || 0;
      const origPrice = Number(String(it.prices?.list_price || price).replace(/[^0-9]/g, "")) || price;
      const discount = origPrice > price ? Math.round(((origPrice - price) / origPrice) * 100) : 0;

      return {
        t: it.title || "",
        c: author,
        pub: isBooks ? it.iteminfo?.manufacture?.[0]?.name || "" : "",
        s: isBooks ? "books" : "doujin",
        cat: isBooks ? "books" : "comic",
        pr: price,
        d: discount,
        sp: it.volume ? `${it.volume}P` : isBooks ? "商業コミック" : "同人作品",
        dt: (it.date || "").split(" ")[0].replace(/-/g, "."),
        r: Number(it.review?.average || 4.5),
        rc: Number(it.review?.count || 0),
        img: it.imageURL?.large || it.imageURL?.list || "",
        ai: false,
        tg: (it.iteminfo?.genre || []).slice(0, 5).map((g) => g.name)
      };
    } catch (e) {
      // ignore
    }
  }
  return null;
}

function buildMetaContext(url, seoIndex, fallbackWork, baseOrigin) {
  const params = url.searchParams;
  const workId = params.get("id") || params.get("work") || params.get("cid");
  const creatorId = params.get("creator");
  const source = params.get("source");
  const cat = params.get("cat");
  const ai = params.get("ai");
  const tag = params.get("tag");
  const tab = params.get("tab");

  const defaultImg = seoIndex?.defaultImage || "";
  const canonicalBase = `${baseOrigin}/`;

  // 1. 個別作品ページ (?id=...)
  if (workId) {
    const w = seoIndex?.works?.[workId] || fallbackWork;
    if (w) {
      const isBooks = w.s === "books" || w.cat === "books";
      const storeLabel = isBooks ? "FANZAブックス" : "FANZA同人";
      const discountBadge = w.d > 0 ? `【${w.d}%OFF】` : "";
      const priceText = w.pr ? `¥${Number(w.pr).toLocaleString()}` : "";
      const aiText = w.ai ? "【AI】" : "";
      const creatorInfo = isBooks && w.pub ? `${w.c}（${w.pub}）` : w.c;
      const title = `${discountBadge}${w.t} / ${w.c} | ${storeLabel} - ${DEFAULT_SITE_NAME}`;
      const tagsStr = Array.isArray(w.tg) && w.tg.length > 0 ? ` タグ: ${w.tg.slice(0, 4).map((x) => `#${x}`).join(" ")}` : "";
      const desc = `${discountBadge}${aiText}${storeLabel}「${w.t}」（${creatorInfo}）。${w.sp ? `${w.sp} / ` : ""}${priceText}${w.rc ? ` / ★${Number(w.r || 4.5).toFixed(1)}(${w.rc}件)` : ""}。${isBooks ? "無料立ち読み・詳細情報はこちら。" : "サンプル立ち読み・感想レビュー掲載中。"}${tagsStr}`;
      const canonical = `${baseOrigin}/?id=${encodeURIComponent(workId)}`;
      const image = w.img || defaultImg;

      const jsonLd = {
        "@context": "https://schema.org",
        "@type": isBooks ? "Book" : "Product",
        name: w.t,
        description: desc,
        image: image ? [image] : undefined,
        sku: workId,
        brand: {
          "@type": "Organization",
          name: isBooks && w.pub ? w.pub : w.c
        },
        author: {
          "@type": "Person",
          name: w.c
        },
        offers: {
          "@type": "Offer",
          url: canonical,
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

      return {
        title,
        description: desc,
        ogType: "article",
        canonical,
        image,
        jsonLd
      };
    }
  }

  // 2. 作家・サークル別ページ (?creator=...)
  if (creatorId) {
    const c = seoIndex?.creators?.[creatorId];
    if (c) {
      const isBooks = c.s === "books" || c.cat === "books";
      const label = isBooks ? "作家（FANZAブックス）" : "サークル（FANZA同人）";
      const title = `${c.n}${isBooks && c.pub ? `（${c.pub}）` : ""}の作品一覧・人気ランキング | ${DEFAULT_SITE_NAME}`;
      const desc = `${label}「${c.n}」の配信作品${c.w}件まとめ（平均評価 ★${Number(c.r || 4.5).toFixed(2)} / レビュー計${c.rc || 0}件）。新着・人気作・セール作品を一覧でチェック。`;
      const canonical = `${baseOrigin}/?creator=${encodeURIComponent(creatorId)}`;
      const image = c.img || defaultImg;
      const jsonLd = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: title,
        description: desc,
        url: canonical,
        primaryImageOfPage: image || undefined
      };
      return { title, description: desc, ogType: "website", canonical, image, jsonLd };
    }
  }

  // 3. 切り口別（同人/ブックス・ジャンル・非AI・セール・タグ）
  const parts = [];
  if (ai === "non_ai") parts.push("非AI（手描き・通常）");
  else if (ai === "ai") parts.push("AI生成作品");

  if (tag) parts.push(`#${tag}`);
  if (cat && CAT_LABELS[cat]) parts.push(CAT_LABELS[cat]);
  else if (source === "books") parts.push("FANZAブックス（商業コミック）");
  else if (source === "doujin") parts.push("FANZA同人");

  if (tab && TAB_LABELS[tab]) parts.push(TAB_LABELS[tab]);

  if (parts.length > 0) {
    const heading = parts.join(" ");
    const title = `${heading} | ${DEFAULT_SITE_NAME}`;
    const desc = `${heading}の最新まとめ。人気ランキング・新作・高評価・セール割引作品を毎日自動更新で掲載しています。`;
    const kept = new URLSearchParams();
    for (const key of ["source", "cat", "ai", "tag", "tab"]) {
      if (params.get(key)) kept.set(key, params.get(key));
    }
    const qs = kept.toString();
    const canonical = qs ? `${baseOrigin}/?${qs}` : canonicalBase;
    const image =
      source === "books" || cat === "books"
        ? seoIndex?.booksImage || defaultImg
        : defaultImg;
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: title,
      description: desc,
      url: canonical
    };
    return { title, description: desc, ogType: "website", canonical, image, jsonLd };
  }

  // 4. トップページ
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: DEFAULT_SITE_NAME,
    url: canonicalBase,
    description: DEFAULT_DESC,
    potentialAction: {
      "@type": "SearchAction",
      target: `${baseOrigin}/?q={search_term_string}`,
      "query-input": "required name=search_term_string"
    }
  };
  return {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    ogType: "website",
    canonical: canonicalBase,
    image: defaultImg,
    jsonLd
  };
}

function injectSeoMeta(html, meta) {
  const safeTitle = escapeAttr(meta.title);
  const safeDesc = escapeAttr(meta.description);
  const safeCanonical = escapeAttr(meta.canonical);
  const safeImage = escapeAttr(meta.image || "");

  const seoBlock = [
    `<title>${safeTitle}</title>`,
    `<meta name="description" content="${safeDesc}" />`,
    `<link rel="canonical" href="${safeCanonical}" />`,
    `<meta property="og:site_name" content="${DEFAULT_SITE_NAME}" />`,
    `<meta property="og:type" content="${escapeAttr(meta.ogType || "website")}" />`,
    `<meta property="og:title" content="${safeTitle}" />`,
    `<meta property="og:description" content="${safeDesc}" />`,
    `<meta property="og:url" content="${safeCanonical}" />`,
    safeImage ? `<meta property="og:image" content="${safeImage}" />` : "",
    `<meta name="twitter:card" content="${safeImage ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${safeTitle}" />`,
    `<meta name="twitter:description" content="${safeDesc}" />`,
    safeImage ? `<meta name="twitter:image" content="${safeImage}" />` : "",
    meta.jsonLd ? `<script type="application/ld+json">${escapeJsonLd(meta.jsonLd)}</script>` : ""
  ]
    .filter(Boolean)
    .join("\n  ");

  // マーカー <!-- SEO_META_START --> ... <!-- SEO_META_END --> があれば丸ごと置換
  const markerRegex = /<!-- SEO_META_START -->[\s\S]*?<!-- SEO_META_END -->/;
  if (markerRegex.test(html)) {
    return html.replace(markerRegex, `<!-- SEO_META_START -->\n  ${seoBlock}\n  <!-- SEO_META_END -->`);
  }

  // フォールバック: </head> の直前に挿入
  return html.replace("</head>", `  ${seoBlock}\n</head>`);
}

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

  // API・静的アセット（JS/CSS/JSON/XML/TXT/画像等）はそのまま透過
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/data/") ||
    pathname.startsWith("/js/") ||
    pathname.startsWith("/css/") ||
    (pathname !== "/" && pathname !== "/index.html")
  ) {
    return next();
  }

  const response = await next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  const baseOrigin = (env && env.SITE_URL ? String(env.SITE_URL).replace(/\/+$/, "") : "") || url.origin;
  const seoIndex = await loadSeoIndex(url, env);

  const workId = url.searchParams.get("id") || url.searchParams.get("work") || url.searchParams.get("cid");
  let fallbackWork = null;
  if (workId && !(seoIndex && seoIndex.works && seoIndex.works[workId])) {
    fallbackWork = await fetchSingleWorkFromDmmApi(workId, env);
  }

  const meta = buildMetaContext(url, seoIndex, fallbackWork, baseOrigin);
  const originalHtml = await response.text();
  const updatedHtml = injectSeoMeta(originalHtml, meta);

  const headers = new Headers(response.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=300, s-maxage=900");

  return new Response(updatedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
