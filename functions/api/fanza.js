/**
 * Cloudflare Pages Functions: /api/fanza
 *
 * FANZA (DMM Affiliate API v3) から同人作品データを取得し、
 * 作品一覧・作家/サークル集計・市場データ分析（ジャンル傾向・価格帯・割引率）を返します。
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const sort = url.searchParams.get("sort") || "date"; // 'date' (新着) | 'rank' (人気ランキング)
  const keyword = url.searchParams.get("keyword") || "";
  const hits = Math.min(Number(url.searchParams.get("hits") || 40), 100);

  const apiId = env.DMM_API_ID;
  const affiliateId = env.DMM_AFFILIATE_ID;

  // APIキーが未設定の場合はステータスを返し、フロントエンド側でサンプルデータにフォールバックさせる
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

  try {
    const apiParams = new URLSearchParams({
      api_id: apiId,
      affiliate_id: affiliateId,
      site: "FANZA",
      service: "doujin",
      floor: "digital_doujin",
      hits: String(hits),
      sort: sort,
      output: "json"
    });

    if (keyword) {
      apiParams.set("keyword", keyword);
    }

    const dmmEndpoint = `https://api.dmm.com/affiliate/v3/ItemList?${apiParams.toString()}`;
    const res = await fetch(dmmEndpoint);

    if (!res.ok) {
      throw new Error(`DMM API HTTP Error: ${res.status}`);
    }

    const raw = await res.json();
    const items = raw?.result?.items || [];

    // 1. 作品データの正規化
    const works = items.map((item, idx) => {
      const genres = (item.iteminfo?.genre || []).map((g) => g.name);
      const makers = (item.iteminfo?.maker || []).map((m) => m.name);
      const circleName = makers[0] || "同人サークル";
      const circleId = item.iteminfo?.maker?.[0]?.id ? `maker_${item.iteminfo.maker[0].id}` : `c_${idx}`;

      // カテゴリ判定 (コミック / 音声 / CG)
      const isAudio =
        genres.some((g) => g.includes("音声") || g.includes("ASMR") || g.includes("バイノーラル")) ||
        (item.volume && String(item.volume).includes("分"));
      const isCg = genres.some((g) => g.includes("CG") || g.includes("イラスト"));
      const category = isAudio ? "audio" : isCg ? "cg" : "comic";

      // 価格・割引計算
      const priceStr = String(item.prices?.price || "0").replace(/[^0-9]/g, "");
      const listPriceStr = String(item.prices?.list_price || priceStr).replace(/[^0-9]/g, "");
      const price = Number(priceStr) || 0;
      const origPrice = Number(listPriceStr) || price;
      const discount = origPrice > price ? Math.round(((origPrice - price) / origPrice) * 100) : 0;

      // レビュー・評価
      const rating = Number(item.review?.average || 0);
      const reviewsCount = Number(item.review?.count || 0);

      return {
        id: item.content_id || `w_${idx}`,
        code: item.content_id || "",
        title: item.title || "",
        category,
        creatorId: circleId,
        author: circleName,
        circle: circleName,
        date: (item.date || "").split(" ")[0].replace(/-/g, "."),
        spec: item.volume ? `${item.volume}` : category === "audio" ? "VOICE" : "COMIC",
        price,
        origPrice,
        discount,
        rating: rating || 4.5,
        reviewsCount,
        dlCount: reviewsCount * 35,
        rank: idx + 1,
        imageUrl: item.imageURL?.large || item.imageURL?.list || "",
        affiliateUrl: item.affiliateURL || `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${item.content_id}/`,
        tags: genres.slice(0, 6)
      };
    });

    // 2. データ分析 (Analytics) の集計
    const analytics = analyzeWorks(works);

    return new Response(
      JSON.stringify({
        ok: true,
        mode: "live",
        totalCount: raw?.result?.total_count || works.length,
        works,
        analytics
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=600"
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

/**
 * 取得したFANZA同人作品の市場傾向・ジャンル・価格帯を分析する
 */
function analyzeWorks(works) {
  if (!works.length) {
    return {
      totalAnalyzed: 0,
      averagePrice: 0,
      averageRating: 0,
      saleRatioPercent: 0,
      categoryBreakdown: { comic: 0, audio: 0, cg: 0 },
      topGenres: [],
      priceDistribution: []
    };
  }

  let priceSum = 0;
  let ratingSum = 0;
  let saleCount = 0;
  const catCounts = { comic: 0, audio: 0, cg: 0 };
  const genreMap = new Map();
  const priceBuckets = {
    "〜¥500": 0,
    "¥501〜¥1,000": 0,
    "¥1,001〜¥1,500": 0,
    "¥1,501〜": 0
  };

  for (const w of works) {
    priceSum += w.price;
    ratingSum += w.rating;
    if (w.discount > 0) saleCount++;
    catCounts[w.category] = (catCounts[w.category] || 0) + 1;

    if (w.price <= 500) priceBuckets["〜¥500"]++;
    else if (w.price <= 1000) priceBuckets["¥501〜¥1,000"]++;
    else if (w.price <= 1500) priceBuckets["¥1,001〜¥1,500"]++;
    else priceBuckets["¥1,501〜"]++;

    for (const tag of w.tags) {
      const prev = genreMap.get(tag) || { name: tag, count: 0, totalPrice: 0, totalRating: 0 };
      prev.count++;
      prev.totalPrice += w.price;
      prev.totalRating += w.rating;
      genreMap.set(tag, prev);
    }
  }

  const topGenres = Array.from(genreMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((g) => ({
      name: g.name,
      count: g.count,
      avgPrice: Math.round(g.totalPrice / g.count),
      avgRating: Number((g.totalRating / g.count).toFixed(2))
    }));

  const priceDistribution = Object.entries(priceBuckets).map(([range, count]) => ({
    range,
    count,
    percent: Math.round((count / works.length) * 100)
  }));

  return {
    totalAnalyzed: works.length,
    averagePrice: Math.round(priceSum / works.length),
    averageRating: Number((ratingSum / works.length).toFixed(2)),
    saleRatioPercent: Math.round((saleCount / works.length) * 100),
    categoryBreakdown: catCounts,
    topGenres,
    priceDistribution
  };
}
