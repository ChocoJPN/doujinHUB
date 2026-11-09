/**
 * Cloudflare Pages Functions: /api/fanza
 *
 * FANZA (DMM Affiliate API v3) から同人作品（ランキング・新着・音声）を取得し、
 * 作品一覧と人気サークル/作家の自動集計データを返します。
 */

export async function onRequestGet(context) {
  const { env } = context;

  const apiId = env.DMM_API_ID;
  const affiliateId = env.DMM_AFFILIATE_ID;

  if (!apiId || !affiliateId || apiId === "あなたのDMM_API_ID") {
    return new Response(
      JSON.stringify({
        ok: true,
        mode: "sample",
        message: "DMM_API_ID が未設定のためデモデータを表示しています。"
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  async function callFanza({ sort = "rank", hits = 80, keyword = "" }) {
    const params = new URLSearchParams({
      api_id: apiId,
      affiliate_id: affiliateId,
      site: "FANZA",
      service: "doujin",
      floor: "digital_doujin",
      hits: String(hits),
      sort,
      output: "json"
    });
    if (keyword) params.set("keyword", keyword);

    const res = await fetch(`https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`);
    if (!res.ok) throw new Error(`DMM API HTTP Error: ${res.status}`);
    const json = await res.json();
    return json?.result?.items || [];
  }

  try {
    const [rankItems, newItems, audioItems] = await Promise.all([
      callFanza({ sort: "rank", hits: 80 }),
      callFanza({ sort: "date", hits: 80 }),
      callFanza({ sort: "rank", hits: 50, keyword: "バイノーラル" })
    ]);

    const mergedMap = new Map();

    rankItems.forEach((item, idx) => {
      const norm = normalizeItem(item, idx + 1);
      mergedMap.set(norm.id, norm);
    });
    newItems.forEach((item) => {
      if (!mergedMap.has(item.content_id)) {
        mergedMap.set(item.content_id, normalizeItem(item, 999));
      }
    });
    audioItems.forEach((item) => {
      if (!mergedMap.has(item.content_id)) {
        mergedMap.set(item.content_id, normalizeItem(item, 999));
      }
    });

    const works = Array.from(mergedMap.values());
    const creators = analyzeTopCreators(works);

    return new Response(
      JSON.stringify({
        ok: true,
        mode: "live",
        totalCount: works.length,
        works,
        creators
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=900"
        }
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        mode: "error",
        error: err.message
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      }
    );
  }
}

function normalizeItem(item, rankNumber) {
  const genres = (item.iteminfo?.genre || []).map((g) => g.name);
  const makers = item.iteminfo?.maker || [];
  const circleName = makers[0]?.name || "同人サークル";
  const circleId = makers[0]?.id ? `maker_${makers[0].id}` : `circle_${circleName}`;

  const volumeStr = String(item.volume || "");
  const titleStr = String(item.title || "");
  const isAudio =
    genres.some((g) => g.includes("音声") || g.includes("ASMR") || g.includes("バイノーラル") || g.includes("ボイス")) ||
    volumeStr.includes("分") ||
    titleStr.includes("【音声】") ||
    titleStr.includes("バイノーラル");
  const isCg =
    !isAudio &&
    (genres.some((g) => g.includes("CG") || g.includes("イラスト")) || titleStr.includes("CG集"));

  const category = isAudio ? "audio" : isCg ? "cg" : "comic";

  const priceStr = String(item.prices?.price || "0").replace(/[^0-9]/g, "");
  const listPriceStr = String(item.prices?.list_price || priceStr).replace(/[^0-9]/g, "");
  const price = Number(priceStr) || 0;
  const origPrice = Number(listPriceStr) || price;
  const discount = origPrice > price ? Math.round(((origPrice - price) / origPrice) * 100) : 0;

  const rating = Number(item.review?.average || 0);
  const reviewsCount = Number(item.review?.count || 0);
  const sampleImages = item.sampleImageURL?.sample_s?.image || [];

  return {
    id: item.content_id,
    code: item.content_id,
    title: item.title || "",
    category,
    creatorId: circleId,
    author: circleName,
    circle: circleName,
    date: (item.date || "").split(" ")[0].replace(/-/g, "."),
    spec: volumeStr ? volumeStr : category === "audio" ? "ボイス・ASMR" : category === "cg" ? "CG集" : "同人誌",
    price,
    origPrice,
    discount,
    rating: rating > 0 ? rating : 4.5,
    reviewsCount,
    dlCount: reviewsCount * 30 + (rankNumber ? Math.max(0, 100 - rankNumber) * 50 : 100),
    rank: rankNumber || 999,
    imageUrl: item.imageURL?.large || item.imageURL?.list || "",
    sampleImages: sampleImages.slice(0, 8),
    affiliateUrl: item.affiliateURL,
    tags: genres.slice(0, 6)
  };
}

function analyzeTopCreators(works) {
  const map = new Map();
  for (const w of works) {
    const existing = map.get(w.creatorId) || {
      id: w.creatorId,
      name: w.author,
      circle: w.circle,
      category: w.category,
      works: 0,
      totalReviews: 0,
      ratingSum: 0,
      bestRank: 999,
      latest: w.date,
      topWorkTitle: w.title
    };
    existing.works++;
    existing.totalReviews += w.reviewsCount || 0;
    existing.ratingSum += w.rating || 4.5;
    if (w.rank < existing.bestRank) {
      existing.bestRank = w.rank;
      existing.topWorkTitle = w.title;
    }
    if (w.date > existing.latest) existing.latest = w.date;
    map.set(w.creatorId, existing);
  }

  return Array.from(map.values())
    .sort((a, b) => {
      const scoreA = a.works * 100 + a.totalReviews * 5 + (100 - Math.min(100, a.bestRank)) * 10;
      const scoreB = b.works * 100 + b.totalReviews * 5 + (100 - Math.min(100, b.bestRank)) * 10;
      return scoreB - scoreA;
    })
    .slice(0, 36)
    .map((c) => {
      const avgRating = (c.ratingSum / c.works).toFixed(2);
      return {
        id: c.id,
        name: c.name,
        circle: c.circle,
        category: c.category,
        works: c.works,
        latest: c.latest,
        bio: `代表作『${c.topWorkTitle.slice(0, 28)}...』など計${c.works}作品がランクイン（平均評価 ★${avgRating} / レビュー計${c.totalReviews}件）。`
      };
    });
}
