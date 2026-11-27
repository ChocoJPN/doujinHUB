/**
 * ============================================================
 * FANZA同人 大量データ取得・カテゴリ精密分類・有名サークル抽出バッチ
 * ============================================================
 *
 * 【ローカルでの実行方法】
 *   node scripts/fetch_works.js
 *
 * → FANZA APIからランキング・新着・同人誌・同人音声(ASMR/KU100等)を
 *   複数ページ＆キーワードで大量取得し、既存データと統合・蓄積して
 *   data/fanza_latest.json と data/fanza_latest.js の両方に出力します。
 */

const fs = require("fs");
const path = require("path");

// .dev.vars または .env ファイルがあれば自動で読み込む
function loadLocalEnv() {
  const candidates = [".dev.vars", ".env"];
  for (const filename of candidates) {
    const filePath = path.join(__dirname, "..", filename);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  }
}

loadLocalEnv();

const DMM_API_ID = process.env.DMM_API_ID || "";
const DMM_AFFILIATE_ID = process.env.DMM_AFFILIATE_ID || "";
// サイト掲載用の通常アフィリエイトID（末尾を -001 に変換してリンク生成に使用）
const DMM_SITE_AFFILIATE_ID =
  process.env.DMM_SITE_AFFILIATE_ID ||
  (DMM_AFFILIATE_ID ? DMM_AFFILIATE_ID.replace(/-\d+$/, "-001") : "douzinINFO-001");
// サイトマップ・robots.txt・正規URL用のベースURL（独自ドメイン設定時は SITE_URL 環境変数を指定）
const SITE_URL = (process.env.SITE_URL || "https://doujin-index-17g.pages.dev").replace(/\/+$/, "");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFanzaList({
  service = "doujin",
  floor = "digital_doujin",
  sort = "rank",
  hits = 100,
  offset = 1,
  keyword = "",
  article = "",
  article_id = ""
} = {}) {
  const params = new URLSearchParams({
    api_id: DMM_API_ID,
    affiliate_id: DMM_AFFILIATE_ID,
    site: "FANZA",
    service,
    floor,
    hits: String(hits),
    offset: String(offset),
    sort: sort,
    output: "json"
  });

  if (keyword) params.set("keyword", keyword);
  if (article) params.set("article", article);
  if (article_id) params.set("article_id", article_id);

  const url = `https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, { headers: { Connection: "close" } });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`FANZA API HTTP Error (${res.status}): ${errText}`);
      }
      const json = await res.json();
      return json?.result?.items || [];
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(300 * (attempt + 1));
    }
  }
  return [];
}

function buildSiteAffiliateUrl(directUrl) {
  if (!directUrl) return "";
  return `https://al.fanza.co.jp/?lurl=${encodeURIComponent(directUrl)}&af_id=${encodeURIComponent(DMM_SITE_AFFILIATE_ID)}&ch=toolbar&ch_id=link`;
}

/**
 * FANZA APIのキーワード検索は「作品の概要欄（紹介文・コメント）」も全文検索対象になるため、
 * 概要欄によく書かれる「AIで作成しています」「生成AI」「AIを使用」「AI生成」などのフレーズで
 * 検索を実行し、概要欄にAI表記がある作品のIDとサークルIDを網羅的に収集する。
 */
async function scanAiWorksFromDescriptions() {
  console.log("🔍 作品の概要欄（商品説明文）に「AIで作成」「生成AI」「AIを使用」等の記載がある作品をスキャン中...");

  const aiQueries = [
    { keyword: "AI生成", sort: "rank", offset: 1 },
    { keyword: "AI生成", sort: "rank", offset: 101 },
    { keyword: "AI生成", sort: "rank", offset: 201 },
    { keyword: "AI生成", sort: "rank", offset: 301 },
    { keyword: "AI生成", sort: "rank", offset: 401 },
    { keyword: "AI生成", sort: "date", offset: 1 },
    { keyword: "AI生成", sort: "date", offset: 101 },
    { keyword: "AI生成", sort: "date", offset: 201 },
    { keyword: "AI生成", sort: "date", offset: 301 },
    { keyword: "生成AI", sort: "rank", offset: 1 },
    { keyword: "生成AI", sort: "rank", offset: 101 },
    { keyword: "生成AI", sort: "rank", offset: 201 },
    { keyword: "生成AI", sort: "rank", offset: 301 },
    { keyword: "生成AI", sort: "rank", offset: 401 },
    { keyword: "生成AI", sort: "date", offset: 1 },
    { keyword: "生成AI", sort: "date", offset: 101 },
    { keyword: "生成AI", sort: "date", offset: 201 },
    { keyword: "生成AI", sort: "date", offset: 301 },
    { keyword: "AIイラスト", sort: "rank", offset: 1 },
    { keyword: "AIイラスト", sort: "rank", offset: 101 },
    { keyword: "AIイラスト", sort: "date", offset: 1 },
    { keyword: "AIイラスト", sort: "date", offset: 101 },
    { keyword: "AI加筆", sort: "rank", offset: 1 },
    { keyword: "AI加筆", sort: "date", offset: 1 },
    { keyword: "AI出力", sort: "rank", offset: 1 },
    { keyword: "AI出力", sort: "date", offset: 1 },
    { keyword: "AIグラビア", sort: "rank", offset: 1 },
    { keyword: "AI美女", sort: "rank", offset: 1 },
    { keyword: "AI漫画", sort: "rank", offset: 1 },
    { keyword: "AIコミック", sort: "rank", offset: 1 },
    { keyword: "AI音声", sort: "rank", offset: 1 },
    { keyword: "AIボイス", sort: "rank", offset: 1 },
    { keyword: "Stable Diffusion", sort: "rank", offset: 1 },
    { keyword: "NovelAI", sort: "rank", offset: 1 },
    { keyword: "フルカラー AI生成", sort: "rank", offset: 1 },
    { keyword: "フルカラー 生成AI", sort: "rank", offset: 1 },
    { keyword: "フルカラー AIイラスト", sort: "rank", offset: 1 },
    { keyword: "CG集 AI生成", sort: "rank", offset: 1 },
    { keyword: "CG集 生成AI", sort: "rank", offset: 1 },
    { keyword: "CG集 AIイラスト", sort: "rank", offset: 1 },
    { keyword: "CG集 AI加筆", sort: "rank", offset: 1 },
    { keyword: "総集編 AI生成", sort: "rank", offset: 1 },
    { keyword: "総集編 生成AI", sort: "rank", offset: 1 },
    { keyword: "バイノーラル AI生成", sort: "rank", offset: 1 },
    { keyword: "バイノーラル 生成AI", sort: "rank", offset: 1 },
    { keyword: "耳かき AI生成", sort: "rank", offset: 1 },
    { keyword: "描き下ろし AI生成", sort: "rank", offset: 1 },
    { article: "genre", article_id: "160132", sort: "rank", offset: 1 }
  ];

  const aiCidMap = new Map();
  const aiMakerSet = new Set();

  const chunkSize = 4;
  for (let i = 0; i < aiQueries.length; i += chunkSize) {
    const chunk = aiQueries.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (q) => {
        try {
          const items = await fetchFanzaList({
            sort: q.sort,
            hits: 100,
            offset: q.offset,
            keyword: q.keyword || "",
            article: q.article || "",
            article_id: q.article_id || ""
          });
          return { q, items };
        } catch (e) {
          return { q, items: [] };
        }
      })
    );

    for (const { q, items } of results) {
      const label = q.keyword || "AI生成ジャンル";
      for (const it of items) {
        if (!aiCidMap.has(it.content_id)) {
          aiCidMap.set(it.content_id, label);
        }
        const makerId = it.iteminfo?.maker?.[0]?.id;
        if (makerId) {
          aiMakerSet.add(`maker_${makerId}`);
        }
      }
    }

    if (i + chunkSize < aiQueries.length) {
      await sleep(220);
    }
  }

  console.log(`   ✔ 概要欄AIスキャン完了: AI記載作品 ${aiCidMap.size}件 / AI使用確認サークル ${aiMakerSet.size}組 を特定`);
  return { aiCidMap, aiMakerSet };
}

/**
 * 画像URLのディレクトリ構造とジャンルから正確にカテゴリを判定する
 * - /digital/comic/ -> comic (同人誌・漫画)
 * - /digital/voice/ -> audio (同人音声・ASMR)
 * - /digital/cg/    -> cg    (CG・イラスト集)
 * - /digital/game/  -> game  (同人ゲーム・動画)
 */
function detectCategory(imageUrl, genres, volumeStr, titleStr) {
  const url = String(imageUrl || "");
  if (url.includes("/digital/voice/")) return "audio";
  if (url.includes("/digital/comic/")) return "comic";
  if (url.includes("/digital/cg/")) return "cg";
  if (url.includes("/digital/game/")) return "game";

  const isAudio =
    genres.some((g) => g.includes("ボイス") || g.includes("ASMR") || g.includes("バイノーラル")) ||
    volumeStr.includes("分") ||
    titleStr.includes("【音声】") ||
    titleStr.includes("KU100");
  if (isAudio) return "audio";

  const isCg =
    genres.some((g) => g.includes("CG") || g.includes("イラスト")) ||
    volumeStr.includes("画像") ||
    titleStr.includes("CG集");
  if (isCg) return "cg";

  return "comic";
}

/**
 * ジャンル配列・タイトル・サークル名からAI生成作品かどうかを判定する
 */
function detectIsAi(genres, titleStr, circleName) {
  const genreHit = (genres || []).some(
    (g) => g.includes("AI生成") || g === "AI" || g.includes("AIイラスト") || g.includes("AI使用")
  );
  if (genreHit) return true;
  const text = `${titleStr || ""} ${circleName || ""}`;
  return /(^|[^a-zA-Z0-9])AI([^a-zA-Z0-9]|$)|AI生成|AIイラスト|AI使用|AIグラビア|AI美女|ai$/i.test(text);
}

/**
 * ページ数や収録時間の表記を見やすく整形する
 */
function formatSpec(rawSpec, category) {
  const s = String(rawSpec || "").trim();
  if (!s || s === "同人誌" || s === "ボイス・ASMR" || s === "CG集" || s === "商業コミック") {
    if (category === "books") return "商業コミック";
    if (category === "audio") return "ボイス・ASMR";
    if (category === "cg") return "CG・イラスト集";
    if (category === "game") return "同人ゲーム・動画";
    return "同人誌・漫画";
  }
  // 数字のみの場合はカテゴリに応じた単位を付与
  if (/^\d+$/.test(s)) {
    if (category === "books") return `コミック ${s}P`;
    if (category === "comic") return `漫画 ${s}P`;
    if (category === "cg") return `CG ${s}枚`;
    if (category === "audio") return `音声 ${s}分`;
    return `${s}P`;
  }
  return s;
}

/**
 * FANZA同人 APIのアイテム1件を分析・正規化する
 */
function normalizeItem(item, rankNumber) {
  const genres = (item.iteminfo?.genre || []).map((g) => g.name);
  const makers = item.iteminfo?.maker || [];
  const circleName = makers[0]?.name || "同人サークル";
  const circleId = makers[0]?.id ? `maker_${makers[0].id}` : `circle_${circleName}`;

  const imageUrl = item.imageURL?.large || item.imageURL?.list || "";
  const volumeStr = String(item.volume || "");
  const titleStr = String(item.title || "");

  const category = detectCategory(imageUrl, genres, volumeStr, titleStr);
  const spec = formatSpec(volumeStr, category);
  const isAi = detectIsAi(genres, titleStr, circleName);

  // タグ抽出（AI生成が含まれる場合は先頭6件から漏れないよう優先保持）
  const baseTags = genres.slice(0, 6);
  if (isAi && genres.includes("AI生成") && !baseTags.includes("AI生成")) {
    baseTags.pop();
    baseTags.push("AI生成");
  }

  // 価格とセール割引率の計算
  const priceStr = String(item.prices?.price || "0").replace(/[^0-9]/g, "");
  const listPriceStr = String(item.prices?.list_price || priceStr).replace(/[^0-9]/g, "");
  const price = Number(priceStr) || 0;
  const origPrice = Number(listPriceStr) || price;
  const discount = origPrice > price ? Math.round(((origPrice - price) / origPrice) * 100) : 0;

  // レビュー評価と人気スコア算出
  const rating = Number(item.review?.average || 0);
  const reviewsCount = Number(item.review?.count || 0);

  // サンプル画像リストの抽出 (立ち読みプレビュー用・高画質jp優先、最大20ページまで保持)
  const sampleLarge = item.sampleImageURL?.sample_l?.image || [];
  const sampleSmall = (item.sampleImageURL?.sample_s?.image || []).map((u) =>
    String(u).replace(/js-(\d+\.jpg)$/i, "jp-$1")
  );
  const sampleImages = (sampleLarge.length > 0 ? sampleLarge : sampleSmall).slice(0, 20);

  // キャンペーン情報
  const campaignTitle = item.campaign?.[0]?.title || (discount > 0 ? `${discount}%OFFセール` : "");

  // サイト掲載用のアフィリエイトリンク（承認済みサイトID -001 の形式）を生成
  const directUrl = `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${item.content_id}/`;
  const siteAffiliateUrl = buildSiteAffiliateUrl(directUrl);

  return {
    id: item.content_id,
    code: item.content_id,
    source: "doujin",
    title: titleStr,
    category,
    isAi,
    creatorId: circleId,
    author: circleName,
    circle: circleName,
    publisher: "",
    series: item.iteminfo?.series?.[0]?.name || "",
    date: (item.date || "").split(" ")[0].replace(/-/g, "."),
    spec,
    price,
    origPrice,
    discount,
    campaignTitle,
    rating: rating > 0 ? Number(rating.toFixed(2)) : 4.5,
    reviewsCount,
    dlCount: reviewsCount * 35 + (rankNumber && rankNumber <= 300 ? Math.max(0, 310 - rankNumber) * 30 : 120),
    rank: rankNumber || 999,
    imageUrl,
    sampleImages,
    directUrl,
    affiliateUrl: siteAffiliateUrl,
    tachiyomiUrl: "",
    tags: baseTags
  };
}

/**
 * FANZAブックス（コミック）APIのアイテム1件を分析・正規化する
 */
function normalizeBooksItem(item, rankNumber) {
  const genres = (item.iteminfo?.genre || []).map((g) => g.name);
  const authors = item.iteminfo?.author || [];
  const manufactures = item.iteminfo?.manufacture || [];
  const publisherName = manufactures[0]?.name || "";
  const seriesName = item.iteminfo?.series?.[0]?.name || "";
  const authorName =
    authors.length > 0
      ? authors
          .slice(0, 2)
          .map((a) => a.name)
          .join(" / ")
      : publisherName || "商業コミック作家";
  const creatorId = authors[0]?.id
    ? `author_${authors[0].id}`
    : manufactures[0]?.id
      ? `pub_${manufactures[0].id}`
      : `books_${authorName}`;

  const imageUrl = item.imageURL?.large || item.imageURL?.list || "";
  const volumeStr = String(item.volume || "");
  const titleStr = String(item.title || "");

  const category = "books";
  const spec = formatSpec(volumeStr, category);
  const isAi = detectIsAi(genres, titleStr, authorName);

  const baseTags = genres.slice(0, 6);
  if (isAi && genres.includes("AI生成") && !baseTags.includes("AI生成")) {
    baseTags.pop();
    baseTags.push("AI生成");
  }

  const priceStr = String(item.prices?.price || "0").replace(/[^0-9]/g, "");
  const listPriceStr = String(item.prices?.list_price || priceStr).replace(/[^0-9]/g, "");
  const price = Number(priceStr) || 0;
  const origPrice = Number(listPriceStr) || price;
  const discount = origPrice > price ? Math.round(((origPrice - price) / origPrice) * 100) : 0;

  const rating = Number(item.review?.average || 0);
  const reviewsCount = Number(item.review?.count || 0);
  const campaignTitle = item.campaign?.[0]?.title || (discount > 0 ? `${discount}%OFFセール` : "");

  const directUrl = item.URL || `https://book.dmm.co.jp/detail/${item.content_id}/`;
  const siteAffiliateUrl = buildSiteAffiliateUrl(directUrl);
  const tachiyomiRawUrl = item.tachiyomi?.URL || "";
  const tachiyomiUrl = tachiyomiRawUrl ? buildSiteAffiliateUrl(tachiyomiRawUrl) : "";

  return {
    id: item.content_id,
    code: item.content_id,
    source: "books",
    title: titleStr,
    category,
    isAi,
    creatorId,
    author: authorName,
    circle: authorName,
    publisher: publisherName,
    series: seriesName,
    date: (item.date || "").split(" ")[0].replace(/-/g, "."),
    spec,
    price,
    origPrice,
    discount,
    campaignTitle,
    rating: rating > 0 ? Number(rating.toFixed(2)) : 4.5,
    reviewsCount,
    dlCount: reviewsCount * 35 + (rankNumber && rankNumber <= 300 ? Math.max(0, 310 - rankNumber) * 30 : 120),
    rank: rankNumber || 999,
    imageUrl,
    sampleImages: [],
    directUrl,
    affiliateUrl: siteAffiliateUrl,
    tachiyomiUrl,
    tags: baseTags
  };
}

/**
 * 既存の保存済みワークデータも最新ルールで再正規化する
 */
function renormalizeExistingWork(w) {
  const isBooks =
    w.source === "books" ||
    w.category === "books" ||
    String(w.imageUrl || "").includes("/digital/e-book/") ||
    String(w.directUrl || "").includes("book.dmm.co.jp");

  if (isBooks) {
    const cleanTags = Array.isArray(w.tags) ? w.tags : [];
    const spec = formatSpec(w.spec, "books");
    const isAi = detectIsAi(cleanTags, w.title || "", w.author || w.circle || "");
    const code = w.code || w.id;
    const directUrl = w.directUrl || `https://book.dmm.co.jp/detail/${code}/`;
    const affiliateUrl = buildSiteAffiliateUrl(directUrl);
    return {
      ...w,
      source: "books",
      category: "books",
      spec,
      isAi,
      directUrl,
      affiliateUrl,
      sampleImages: Array.isArray(w.sampleImages) ? w.sampleImages : []
    };
  }

  const cleanTags = (w.tags || []).filter((t) => t !== "AI生成");
  const category = detectCategory(w.imageUrl, cleanTags, w.spec || "", w.title || "");
  const spec = formatSpec(w.spec, category);
  const isAi = detectIsAi(cleanTags, w.title || "", w.circle || w.author || "");
  const code = w.code || w.id;
  const directUrl = `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${code}/`;
  const affiliateUrl = buildSiteAffiliateUrl(directUrl);
  const sampleImages = (w.sampleImages || []).map((u) => String(u).replace(/js-(\d+\.jpg)$/i, "jp-$1"));
  return {
    ...w,
    source: "doujin",
    tags: cleanTags,
    category,
    spec,
    isAi,
    directUrl,
    sampleImages,
    affiliateUrl
  };
}

/**
 * 取得した作品群から「有名作家・人気サークル」を同人・ブックス別に自動分析・ランキング化する
 */
function analyzeTopCreators(works) {
  function aggregateGroup(groupWorks, sourceType, limit) {
    const map = new Map();

    for (const w of groupWorks) {
      const existing = map.get(w.creatorId) || {
        id: w.creatorId,
        source: sourceType,
        name: w.author,
        circle: w.circle,
        publisher: w.publisher || "",
        categoryCounts: { comic: 0, books: 0, audio: 0, cg: 0, game: 0 },
        works: 0,
        totalReviews: 0,
        ratingSum: 0,
        bestRank: 999,
        latest: w.date || "",
        topWorkTitle: w.title || "",
        sampleImageUrl: w.imageUrl || "",
        tagsSet: new Set()
      };

      existing.works++;
      existing.categoryCounts[w.category] = (existing.categoryCounts[w.category] || 0) + 1;
      existing.totalReviews += w.reviewsCount || 0;
      existing.ratingSum += w.rating || 4.5;
      if (!existing.publisher && w.publisher) existing.publisher = w.publisher;

      if (w.rank < existing.bestRank) {
        existing.bestRank = w.rank;
        existing.topWorkTitle = w.title;
        if (w.imageUrl) existing.sampleImageUrl = w.imageUrl;
      }
      if ((w.date || "") > existing.latest) {
        existing.latest = w.date;
      }
      (w.tags || []).slice(0, 4).forEach((t) => existing.tagsSet.add(t));
      map.set(w.creatorId, existing);
    }

    return Array.from(map.values())
      .sort((a, b) => {
        const scoreA = a.works * 120 + a.totalReviews * 5 + (300 - Math.min(300, a.bestRank)) * 8;
        const scoreB = b.works * 120 + b.totalReviews * 5 + (300 - Math.min(300, b.bestRank)) * 8;
        return scoreB - scoreA;
      })
      .slice(0, limit)
      .map((c) => {
        const avgRating = (c.ratingSum / c.works).toFixed(2);
        const topTags = Array.from(c.tagsSet).slice(0, 4);
        const mainCategory =
          sourceType === "books"
            ? "books"
            : Object.entries(c.categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "comic";
        const shortTitle = c.topWorkTitle.length > 30 ? `${c.topWorkTitle.slice(0, 30)}...` : c.topWorkTitle;
        const pubNote = sourceType === "books" && c.publisher ? `【${c.publisher}】` : "";
        return {
          id: c.id,
          source: sourceType,
          name: c.name,
          circle: c.circle,
          publisher: c.publisher,
          category: mainCategory,
          works: c.works,
          totalReviews: c.totalReviews,
          avgRating: Number(avgRating),
          latest: c.latest,
          imageUrl: c.sampleImageUrl,
          tags: topTags,
          bio: `${pubNote}代表作『${shortTitle}』など計${c.works}作品を配信中（平均評価 ★${avgRating} / レビュー計${c.totalReviews}件）。`
        };
      });
  }

  const doujinCreators = aggregateGroup(
    works.filter((w) => w.source !== "books"),
    "doujin",
    120
  );
  const booksCreators = aggregateGroup(
    works.filter((w) => w.source === "books"),
    "books",
    120
  );
  return [...doujinCreators, ...booksCreators];
}

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toIsoDate(dateStr, fallbackIso) {
  const m = String(dateStr || "").match(/^(\d{4})[./-](\d{2})[./-](\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return String(fallbackIso || new Date().toISOString()).slice(0, 10);
}

/**
 * 動的OGP & SEO用の軽量インデックス (data/seo_index.json)、
 * 検索エンジン向け sitemap.xml、robots.txt を自動生成する
 */
function generateSeoAssets(works, creators, updatedAt) {
  const rootDir = path.join(__dirname, "..");
  const outDir = path.join(rootDir, "data");
  const seoIndexFile = path.join(outDir, "seo_index.json");
  const sitemapFile = path.join(rootDir, "sitemap.xml");
  const robotsFile = path.join(rootDir, "robots.txt");
  const todayIso = String(updatedAt || new Date().toISOString()).slice(0, 10);

  // 1. 軽量 OGP/SEO インデックス（Cloudflare Workers で高速ロード可能な最小構造：上位5,000件を常駐・残りはAPIフォールバック）
  const worksIndex = {};
  const doujinSorted = works
    .filter((w) => w.source !== "books")
    .sort((a, b) => (a.rank || 999) - (b.rank || 999) || (b.date || "").localeCompare(a.date || "") || (b.reviewsCount || 0) - (a.reviewsCount || 0));
  const booksSorted = works
    .filter((w) => w.source === "books")
    .sort((a, b) => (a.rank || 999) - (b.rank || 999) || (b.date || "").localeCompare(a.date || "") || (b.reviewsCount || 0) - (a.reviewsCount || 0));

  const seoWorksPool = [...doujinSorted.slice(0, 3500), ...booksSorted.slice(0, 1500)];
  for (const w of seoWorksPool) {
    if (!w || !w.id) continue;
    worksIndex[w.id] = {
      t: w.title || "",
      c: w.circle || w.author || "",
      cid: w.creatorId || "",
      pub: w.publisher || "",
      ser: w.series || "",
      s: w.source === "books" ? "books" : "doujin",
      cat: w.category || "comic",
      pr: Number(w.price) || 0,
      op: Number(w.origPrice) || Number(w.price) || 0,
      d: Number(w.discount) || 0,
      sp: w.spec || "",
      dt: w.date || "",
      r: Number(w.rating) || 4.5,
      rc: Number(w.reviewsCount) || 0,
      img: w.imageUrl || "",
      ai: Boolean(w.isAi),
      u: w.directUrl || "",
      tu: w.tachiyomiUrl || "",
      sm: Array.isArray(w.sampleImages) ? w.sampleImages.slice(0, 4) : [],
      tg: Array.isArray(w.tags) ? w.tags.slice(0, 6) : []
    };
  }

  const creatorsIndex = {};
  for (const c of creators) {
    if (!c || !c.id) continue;
    creatorsIndex[c.id] = {
      n: c.circle || c.name || "",
      pub: c.publisher || "",
      s: c.source === "books" ? "books" : "doujin",
      cat: c.category || "comic",
      w: Number(c.works) || 0,
      r: Number(c.avgRating) || 4.5,
      rc: Number(c.totalReviews) || 0,
      img: c.imageUrl || ""
    };
  }

  const seoIndexPayload = {
    updatedAt: updatedAt || new Date().toISOString(),
    defaultImage: doujinSorted.find((w) => !w.isAi && w.imageUrl)?.imageUrl || doujinSorted[0]?.imageUrl || "",
    booksImage: booksSorted.find((w) => w.imageUrl)?.imageUrl || "",
    works: worksIndex,
    creators: creatorsIndex
  };

  fs.writeFileSync(seoIndexFile, JSON.stringify(seoIndexPayload), "utf8");

  // 2. sitemap.xml 生成（トップ + 主要切り口 + 作家/サークル + 人気タグ + 人気/最新作品）
  const urlEntries = [];
  const addedLocs = new Set();
  function addUrl(loc, lastmod, changefreq, priority) {
    if (addedLocs.has(loc)) return;
    addedLocs.add(loc);
    urlEntries.push({ loc, lastmod: lastmod || todayIso, changefreq, priority });
  }

  // トップ & 主要切り口ページ
  addUrl(`${SITE_URL}/`, todayIso, "hourly", "1.0");
  const landingQueries = [
    "?source=doujin",
    "?source=books",
    "?source=doujin&ai=non_ai",
    "?cat=comic&ai=non_ai",
    "?cat=audio",
    "?cat=cg",
    "?cat=game",
    "?tab=pop_ranking",
    "?tab=sale",
    "?tab=creators",
    "?tab=community"
  ];
  for (const q of landingQueries) {
    addUrl(`${SITE_URL}/${q}`, todayIso, "daily", "0.9");
  }

  // 人気サークル・作家ページ
  for (const c of creators) {
    addUrl(`${SITE_URL}/?creator=${encodeURIComponent(c.id)}`, toIsoDate(c.latest, todayIso), "weekly", "0.7");
  }

  // 人気タグページ（上位60タグ）
  const tagCounts = new Map();
  for (const w of works) {
    for (const t of w.tags || []) {
      if (!t || t.length > 24) continue;
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60);
  for (const [tagName] of topTags) {
    addUrl(`${SITE_URL}/?tag=${encodeURIComponent(tagName)}`, todayIso, "daily", "0.7");
  }

  // 個別作品ページ（クリーンなSSR専用URL /work/<id>：同人上位1,000件 + ブックス上位500件）
  const selectedWorks = [...doujinSorted.slice(0, 1000), ...booksSorted.slice(0, 500)];
  for (const w of selectedWorks) {
    addUrl(`${SITE_URL}/work/${encodeURIComponent(w.id)}`, toIsoDate(w.date, todayIso), "weekly", "0.8");
  }

  const sitemapXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urlEntries.map(
      (u) =>
        `  <url><loc>${escapeXml(u.loc)}</loc><lastmod>${u.lastmod}</lastmod><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`
    ),
    "</urlset>",
    ""
  ].join("\n");

  fs.writeFileSync(sitemapFile, sitemapXml, "utf8");

  // 3. robots.txt 生成
  const robotsTxt = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "",
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    ""
  ].join("\n");

  fs.writeFileSync(robotsFile, robotsTxt, "utf8");

  return {
    seoIndexBytes: Buffer.byteLength(JSON.stringify(seoIndexPayload), "utf8"),
    sitemapUrlCount: urlEntries.length
  };
}

async function main() {
  const outDir = path.join(__dirname, "..", "data");
  const outJsonFile = path.join(outDir, "fanza_latest.json");
  const outJsFile = path.join(outDir, "fanza_latest.js");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // --seo-only 指定時は既存の fanza_latest.json から SEO/OGP アセットのみ即時生成
  if (process.argv.includes("--seo-only")) {
    if (!fs.existsSync(outJsonFile)) {
      throw new Error("data/fanza_latest.json が見つかりません。先に通常実行してください。");
    }
    const existingData = JSON.parse(fs.readFileSync(outJsonFile, "utf8"));
    const seoRes = generateSeoAssets(existingData.works || [], existingData.creators || [], existingData.updatedAt);
    console.log(`✅ SEO/OGPアセットを再生成しました！`);
    console.log(`   - data/seo_index.json: ${(seoRes.seoIndexBytes / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - sitemap.xml: ${seoRes.sitemapUrlCount} URLs (BASE: ${SITE_URL})`);
    console.log(`   - robots.txt: 更新完了`);
    return;
  }

  if (!DMM_API_ID || !DMM_AFFILIATE_ID || DMM_API_ID === "あなたのDMM_API_ID") {
    console.log("⚠️ DMM_API_ID または DMM_AFFILIATE_ID が未設定です。");
    console.log("   e:\\douzin\\.dev.vars ファイルを作成してキーを設定してください。");
    return;
  }

  const mergedMap = new Map();

  // 既存データがあれば読み込み、最新ルールで再分類してベースにする（実行するたび作品が蓄積される）
  if (fs.existsSync(outJsonFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outJsonFile, "utf8"));
      if (Array.isArray(prev.works)) {
        for (const w of prev.works) {
          if (w && w.id) {
            mergedMap.set(w.id, renormalizeExistingWork(w));
          }
        }
        console.log(`📂 既存データ ${mergedMap.size}件 を読み込みました（新規取得データと統合します）`);
      }
    } catch (e) {
      console.warn("⚠️ 既存JSONの読み込みをスキップしました:", e.message);
    }
  }

  console.log("📡 FANZA WebサービスAPIから同人・ブックス(コミック)の大量作品データを取得しています...");

  // バッチ取得クエリ定義（同人: ランキング1000件・新着800件・高評価500件・各ジャンル特化 + ブックス: コミックランキング・新着・高評価・人気ジャンル）
  const fetchPlan = [
    // --- FANZA同人 ---
    // 1. 総合人気ランキング 1〜1000位
    { label: "【同人】総合人気ランキング 1〜100位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, isRankBase: true, rankOffset: 0 },
    { label: "【同人】総合人気ランキング 101〜200位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 101, isRankBase: true, rankOffset: 100 },
    { label: "【同人】総合人気ランキング 201〜300位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 201, isRankBase: true, rankOffset: 200 },
    { label: "【同人】総合人気ランキング 301〜400位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 301, isRankBase: true, rankOffset: 300 },
    { label: "【同人】総合人気ランキング 401〜500位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 401, isRankBase: true, rankOffset: 400 },
    { label: "【同人】総合人気ランキング 501〜600位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 501, isRankBase: true, rankOffset: 500 },
    { label: "【同人】総合人気ランキング 601〜700位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 601, isRankBase: true, rankOffset: 600 },
    { label: "【同人】総合人気ランキング 701〜800位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 701, isRankBase: true, rankOffset: 700 },
    { label: "【同人】総合人気ランキング 801〜900位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 801, isRankBase: true, rankOffset: 800 },
    { label: "【同人】総合人気ランキング 901〜1000位", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 901, isRankBase: true, rankOffset: 900 },

    // 2. 最新作（新着順）1〜800件
    { label: "【同人】最新作（新着順）1〜100件", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 1 },
    { label: "【同人】最新作（新着順）101〜200件", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 101 },
    { label: "【同人】最新作（新着順）201〜300件", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 201 },
    { label: "【同人】最新作（新着順）301〜400件", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 301 },
    { label: "【同人】最新作（新着順）401〜500件", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 401 },
    { label: "【同人】最新作（新着順）501〜600件", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 501 },
    { label: "【同人】最新作（新着順）601〜700件", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 601 },
    { label: "【同人】最新作（新着順）701〜800件", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 701 },

    // 3. レビュー高評価・ロングセラー名作 1〜500件
    { label: "【同人】レビュー高評価順 1〜100件", service: "doujin", floor: "digital_doujin", sort: "review", hits: 100, offset: 1 },
    { label: "【同人】レビュー高評価順 101〜200件", service: "doujin", floor: "digital_doujin", sort: "review", hits: 100, offset: 101 },
    { label: "【同人】レビュー高評価順 201〜300件", service: "doujin", floor: "digital_doujin", sort: "review", hits: 100, offset: 201 },
    { label: "【同人】レビュー高評価順 301〜400件", service: "doujin", floor: "digital_doujin", sort: "review", hits: 100, offset: 301 },
    { label: "【同人】レビュー高評価順 401〜500件", service: "doujin", floor: "digital_doujin", sort: "review", hits: 100, offset: 401 },

    // 4. 同人音声・ASMR 強化取得
    { label: "【同人】音声・バイノーラル人気 1〜100", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "バイノーラル" },
    { label: "【同人】音声・バイノーラル人気 101〜200", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 101, keyword: "バイノーラル" },
    { label: "【同人】音声・バイノーラル人気 201〜300", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 201, keyword: "バイノーラル" },
    { label: "【同人】音声・KU100高音質作品", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "KU100" },
    { label: "【同人】音声・耳かき/ささやきASMR", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "耳かき" },
    { label: "【同人】音声・ささやきボイス", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "ささやき" },
    { label: "【同人】音声・新着ボイス 1〜100", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 1, keyword: "バイノーラル" },
    { label: "【同人】音声・新着ボイス 101〜200", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 101, keyword: "バイノーラル" },

    // 5. 同人誌・漫画 強化取得
    { label: "【同人】同人誌・人気総集編 1〜100", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "総集編" },
    { label: "【同人】同人誌・人気総集編 101〜200", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 101, keyword: "総集編" },
    { label: "【同人】同人誌・フルカラー人気 1〜100", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "フルカラー" },
    { label: "【同人】同人誌・フルカラー人気 101〜200", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 101, keyword: "フルカラー" },
    { label: "【同人】同人誌・描き下ろし特典付き 1〜100", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "描き下ろし" },
    { label: "【同人】同人誌・描き下ろし特典付き 101〜200", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 101, keyword: "描き下ろし" },
    { label: "【同人】同人誌・FANZA専売人気作品", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "専売" },

    // 6. CG・イラスト集 強化取得
    { label: "【同人】CG・イラスト集人気 1〜100", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "CG集" },
    { label: "【同人】CG・イラスト集人気 101〜200", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 101, keyword: "CG集" },
    { label: "【同人】CG・イラスト集新着 1〜100", service: "doujin", floor: "digital_doujin", sort: "date", hits: 100, offset: 1, keyword: "CG集" },

    // 7. 同人ゲーム・動画 強化取得
    { label: "【同人】ゲーム・RPG人気作品", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "RPG" },
    { label: "【同人】ゲーム・シミュレーション人気", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "シミュレーション" },
    { label: "【同人】ゲーム・スマホ対応人気", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "スマホ対応" },
    { label: "【同人】動画・アニメーション人気", service: "doujin", floor: "digital_doujin", sort: "rank", hits: 100, offset: 1, keyword: "アニメーション" },

    // --- FANZAブックス（コミックのみ） ---
    // 8. ブックス コミック人気ランキング 1〜600位
    { label: "【ブックス】コミック人気ランキング 1〜100位", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 1, isRankBase: true, rankOffset: 0 },
    { label: "【ブックス】コミック人気ランキング 101〜200位", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 101, isRankBase: true, rankOffset: 100 },
    { label: "【ブックス】コミック人気ランキング 201〜300位", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 201, isRankBase: true, rankOffset: 200 },
    { label: "【ブックス】コミック人気ランキング 301〜400位", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 301, isRankBase: true, rankOffset: 300 },
    { label: "【ブックス】コミック人気ランキング 401〜500位", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 401, isRankBase: true, rankOffset: 400 },
    { label: "【ブックス】コミック人気ランキング 501〜600位", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 501, isRankBase: true, rankOffset: 500 },

    // 9. ブックス コミック新着順 1〜500件
    { label: "【ブックス】コミック新着 1〜100件", service: "ebook", floor: "comic", sort: "date", hits: 100, offset: 1 },
    { label: "【ブックス】コミック新着 101〜200件", service: "ebook", floor: "comic", sort: "date", hits: 100, offset: 101 },
    { label: "【ブックス】コミック新着 201〜300件", service: "ebook", floor: "comic", sort: "date", hits: 100, offset: 201 },
    { label: "【ブックス】コミック新着 301〜400件", service: "ebook", floor: "comic", sort: "date", hits: 100, offset: 301 },
    { label: "【ブックス】コミック新着 401〜500件", service: "ebook", floor: "comic", sort: "date", hits: 100, offset: 401 },

    // 10. ブックス コミック高評価・ロングセラー 1〜300件
    { label: "【ブックス】コミック高評価 1〜100件", service: "ebook", floor: "comic", sort: "review", hits: 100, offset: 1 },
    { label: "【ブックス】コミック高評価 101〜200件", service: "ebook", floor: "comic", sort: "review", hits: 100, offset: 101 },
    { label: "【ブックス】コミック高評価 201〜300件", service: "ebook", floor: "comic", sort: "review", hits: 100, offset: 201 },

    // 11. ブックス コミック強化取得（単行本・フルカラー・アンソロジー）
    { label: "【ブックス】単行本人気 1〜100", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 1, keyword: "単行本" },
    { label: "【ブックス】単行本人気 101〜200", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 101, keyword: "単行本" },
    { label: "【ブックス】フルカラー人気 1〜100", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 1, keyword: "フルカラー" },
    { label: "【ブックス】アンソロジー・雑誌人気 1〜100", service: "ebook", floor: "comic", sort: "rank", hits: 100, offset: 1, keyword: "アンソロジー" }
  ];

  // API負荷を抑えつつ3並列ずつ順番に取得
  const chunkSize = 3;
  for (let i = 0; i < fetchPlan.length; i += chunkSize) {
    const chunk = fetchPlan.slice(i, i + chunkSize);
    const results = await Promise.all(
      chunk.map(async (q) => {
        try {
          const items = await fetchFanzaList(q);
          console.log(`   ✔ ${q.label}: ${items.length}件取得`);
          return { q, items };
        } catch (err) {
          console.warn(`   ⚠️ ${q.label} 取得スキップ: ${err.message}`);
          return { q, items: [] };
        }
      })
    );

    for (const { q, items } of results) {
      const isBooksQuery = q.service === "ebook";
      items.forEach((item, idx) => {
        const existing = mergedMap.get(item.content_id);
        const rankNum = q.isRankBase ? q.rankOffset + idx + 1 : existing?.rank || 999;
        const norm = isBooksQuery ? normalizeBooksItem(item, rankNum) : normalizeItem(item, rankNum);
        mergedMap.set(norm.id, norm);
      });
    }

    if (i + chunkSize < fetchPlan.length) {
      await sleep(350);
    }
  }

  // 作品の概要欄（商品説明文）からのAI表記スキャンを実行して同人作品へ反映
  const { aiCidMap, aiMakerSet } = await scanAiWorksFromDescriptions();

  const works = Array.from(mergedMap.values()).map((w) => {
    const isBooks = w.source === "books" || w.category === "books";
    const summaryAiHit = !isBooks && aiCidMap.has(w.id);
    const makerAiHit = !isBooks && aiMakerSet.has(w.creatorId);
    const isAi = Boolean(w.isAi || summaryAiHit || makerAiHit);
    const tags = Array.isArray(w.tags) ? [...w.tags] : [];
    if (isAi && !tags.includes("AI生成") && !tags.includes("AI使用")) {
      if (tags.length >= 6) tags.pop();
      tags.push("AI生成");
    }
    return {
      ...w,
      source: isBooks ? "books" : "doujin",
      isAi,
      tags
    };
  });

  // ストア別・カテゴリ別＆AI/非AI集計
  const sourceCounts = { doujin: 0, books: 0 };
  const stats = { comic: 0, books: 0, audio: 0, cg: 0, game: 0 };
  let aiTotal = 0;
  let nonAiTotal = 0;
  works.forEach((w) => {
    sourceCounts[w.source === "books" ? "books" : "doujin"]++;
    stats[w.category] = (stats[w.category] || 0) + 1;
    if (w.isAi) aiTotal++;
    else nonAiTotal++;
  });

  const creators = analyzeTopCreators(works);

  const payload = {
    updatedAt: new Date().toISOString(),
    mode: "live",
    totalCount: works.length,
    sourceCounts,
    aiCount: aiTotal,
    nonAiCount: nonAiTotal,
    categoryCounts: stats,
    works,
    creators
  };

  // 1. JSONファイル出力（Fetch API / Cloudflare Pages 用）
  fs.writeFileSync(outJsonFile, JSON.stringify(payload, null, 2), "utf8");

  // 2. JSファイル出力（ローカル file:// 直開きでもCORSエラーなしで100%即時反映される用）
  const jsContent = `// 自動生成ファイル: node scripts/fetch_works.js により出力\nwindow.FANZA_LIVE_DATA = ${JSON.stringify(payload)};\n`;
  fs.writeFileSync(outJsFile, jsContent, "utf8");

  // 3. 動的OGP/SEOインデックス・sitemap.xml・robots.txt を自動生成
  const seoRes = generateSeoAssets(works, creators, payload.updatedAt);

  console.log(`\n✅ 大量取得・同人/ブックス分離・カテゴリ分類・SEO生成が完了しました！`);
  console.log(`   - 総作品数: ${works.length}件（FANZA同人: ${sourceCounts.doujin}件 / FANZAブックス: ${sourceCounts.books}件）`);
  console.log(`   - AI分別: 非AI ${nonAiTotal}件 / AI作品 ${aiTotal}件`);
  console.log(`     ・同人誌・漫画 (comic): ${stats.comic}件`);
  console.log(`     ・ブックス 商業コミック (books): ${stats.books}件`);
  console.log(`     ・同人音声・ASMR (audio): ${stats.audio}件`);
  console.log(`     ・CG・イラスト集 (cg): ${stats.cg}件`);
  console.log(`     ・同人ゲーム・動画 (game): ${stats.game}件`);
  console.log(`   - 抽出された人気サークル/作家数: ${creators.length}組`);
  console.log(`   - SEO/OGP生成: data/seo_index.json (${(seoRes.seoIndexBytes / 1024 / 1024).toFixed(2)} MB) / sitemap.xml (${seoRes.sitemapUrlCount} URLs) / robots.txt`);
  console.log(`   - 保存先: data/fanza_latest.json および data/fanza_latest.js`);
}

main().catch((err) => {
  console.error("❌ エラーが発生しました:", err.message);
  process.exit(1);
});
