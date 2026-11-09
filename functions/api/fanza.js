/**
 * Cloudflare Pages Functions: /api/fanza
 *
 * FANZA (DMM Affiliate API v3) から同人作品（ランキング・新着・同人音声・同人誌）を大量取得し、
 * 画像URLパスに基づく正確なカテゴリ判定と人気サークル/作家の自動集計データを返します。
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
        message: "DMM_API_ID が未設定のためローカルデータまたはデモデータを表示しています。"
      }),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }

  async function callFanza({ sort = "rank", hits = 100, offset = 1, keyword = "" }) {
    const params = new URLSearchParams({
      api_id: apiId,
      affiliate_id: affiliateId,
      site: "FANZA",
      service: "doujin",
      floor: "digital_doujin",
      hits: String(hits),
      offset: String(offset),
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
    const [rank1, rank2, new1, new2, audio1, audio2, comic1, ai1, ai2, ai3, ai4] = await Promise.all([
      callFanza({ sort: "rank", hits: 100, offset: 1 }),
      callFanza({ sort: "rank", hits: 100, offset: 101 }),
      callFanza({ sort: "date", hits: 100, offset: 1 }),
      callFanza({ sort: "date", hits: 100, offset: 101 }),
      callFanza({ sort: "rank", hits: 100, offset: 1, keyword: "バイノーラル" }),
      callFanza({ sort: "rank", hits: 100, offset: 1, keyword: "KU100" }),
      callFanza({ sort: "rank", hits: 100, offset: 1, keyword: "総集編" }),
      callFanza({ sort: "rank", hits: 100, offset: 1, keyword: "AI生成" }),
      callFanza({ sort: "rank", hits: 100, offset: 1, keyword: "生成AI" }),
      callFanza({ sort: "date", hits: 100, offset: 1, keyword: "AI生成" }),
      callFanza({ sort: "date", hits: 100, offset: 1, keyword: "生成AI" })
    ]);

    const aiCidSet = new Set();
    const aiMakerSet = new Set();
    for (const list of [ai1, ai2, ai3, ai4]) {
      list.forEach((it) => {
        aiCidSet.add(it.content_id);
        const mId = it.iteminfo?.maker?.[0]?.id;
        if (mId) aiMakerSet.add(`maker_${mId}`);
      });
    }

    const mergedMap = new Map();

    rank1.forEach((item, idx) => {
      const norm = normalizeItem(item, idx + 1);
      mergedMap.set(norm.id, norm);
    });
    rank2.forEach((item, idx) => {
      const norm = normalizeItem(item, idx + 101);
      if (!mergedMap.has(norm.id)) mergedMap.set(norm.id, norm);
    });
    for (const list of [new1, new2, audio1, audio2, comic1]) {
      list.forEach((item) => {
        if (!mergedMap.has(item.content_id)) {
          mergedMap.set(item.content_id, normalizeItem(item, 999));
        }
      });
    }

    const works = Array.from(mergedMap.values()).map((w) => {
      if (aiCidSet.has(w.id) || aiMakerSet.has(w.creatorId)) {
        w.isAi = true;
        if (!w.tags.includes("AI生成")) {
          if (w.tags.length >= 6) w.tags.pop();
          w.tags.push("AI生成");
        }
      }
      return w;
    });
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

function formatSpec(rawSpec, category) {
  const s = String(rawSpec || "").trim();
  if (!s || s === "同人誌" || s === "ボイス・ASMR" || s === "CG集") {
    if (category === "audio") return "ボイス・ASMR";
    if (category === "cg") return "CG・イラスト集";
    if (category === "game") return "同人ゲーム・動画";
    return "同人誌・漫画";
  }
  if (/^\d+$/.test(s)) {
    if (category === "comic") return `漫画 ${s}P`;
    if (category === "cg") return `CG ${s}枚`;
    if (category === "audio") return `音声 ${s}分`;
    return `${s}P`;
  }
  return s;
}

function detectIsAi(genres, titleStr, circleName) {
  const genreHit = (genres || []).some(
    (g) => g.includes("AI生成") || g === "AI" || g.includes("AIイラスト") || g.includes("AI使用")
  );
  if (genreHit) return true;
  const text = `${titleStr || ""} ${circleName || ""}`;
  return /(^|[^a-zA-Z0-9])AI([^a-zA-Z0-9]|$)|AI生成|AIイラスト|AI使用|AIグラビア|AI美女|ai$/i.test(text);
}

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
  const sampleLarge = item.sampleImageURL?.sample_l?.image || [];
  const sampleSmall = item.sampleImageURL?.sample_s?.image || [];
  const sampleImages = (sampleLarge.length > 0 ? sampleLarge : sampleSmall).slice(0, 10);

  const cid = item.content_id;
  const directUrl = `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${cid}/`;
  const siteAffiliateUrl = `https://al.fanza.co.jp/?lurl=${encodeURIComponent(directUrl)}&af_id=douzinINFO-001&ch=toolbar&ch_id=link`;

  return {
    id: cid,
    code: cid,
    title: titleStr,
    category,
    isAi,
    creatorId: circleId,
    author: circleName,
    circle: circleName,
    date: (item.date || "").split(" ")[0].replace(/-/g, "."),
    spec,
    price,
    origPrice,
    discount,
    rating: rating > 0 ? Number(rating.toFixed(2)) : 4.5,
    reviewsCount,
    dlCount: reviewsCount * 35 + (rankNumber && rankNumber <= 300 ? Math.max(0, 310 - rankNumber) * 30 : 120),
    rank: rankNumber || 999,
    imageUrl,
    sampleImages,
    affiliateUrl: siteAffiliateUrl,
    tags: baseTags
  };
}

function analyzeTopCreators(works) {
  const map = new Map();
  for (const w of works) {
    const existing = map.get(w.creatorId) || {
      id: w.creatorId,
      name: w.author,
      circle: w.circle,
      categoryCounts: { comic: 0, audio: 0, cg: 0, game: 0 },
      works: 0,
      totalReviews: 0,
      ratingSum: 0,
      bestRank: 999,
      latest: w.date || "",
      topWorkTitle: w.title || "",
      sampleImageUrl: w.imageUrl || ""
    };
    existing.works++;
    existing.categoryCounts[w.category] = (existing.categoryCounts[w.category] || 0) + 1;
    existing.totalReviews += w.reviewsCount || 0;
    existing.ratingSum += w.rating || 4.5;
    if (w.rank < existing.bestRank) {
      existing.bestRank = w.rank;
      existing.topWorkTitle = w.title;
      if (w.imageUrl) existing.sampleImageUrl = w.imageUrl;
    }
    if ((w.date || "") > existing.latest) existing.latest = w.date;
    map.set(w.creatorId, existing);
  }

  return Array.from(map.values())
    .sort((a, b) => {
      const scoreA = a.works * 120 + a.totalReviews * 5 + (300 - Math.min(300, a.bestRank)) * 8;
      const scoreB = b.works * 120 + b.totalReviews * 5 + (300 - Math.min(300, b.bestRank)) * 8;
      return scoreB - scoreA;
    })
    .slice(0, 60)
    .map((c) => {
      const avgRating = (c.ratingSum / c.works).toFixed(2);
      const mainCategory = Object.entries(c.categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "comic";
      const shortTitle = c.topWorkTitle.length > 30 ? `${c.topWorkTitle.slice(0, 30)}...` : c.topWorkTitle;
      return {
        id: c.id,
        name: c.name,
        circle: c.circle,
        category: mainCategory,
        works: c.works,
        totalReviews: c.totalReviews,
        avgRating: Number(avgRating),
        latest: c.latest,
        imageUrl: c.sampleImageUrl,
        bio: `代表作『${shortTitle}』など計${c.works}作品を配信中（平均評価 ★${avgRating} / レビュー計${c.totalReviews}件）。`
      };
    });
}
