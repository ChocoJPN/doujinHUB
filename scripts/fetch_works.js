/**
 * ============================================================
 * FANZA同人 データ取得・分析・有名サークル抽出バッチ
 * ============================================================
 *
 * 【ローカルでの実行方法】
 * 1. e:\douzin\.dev.vars ファイルを作成し、以下を記入:
 *    DMM_API_ID=あなたのAPI_ID
 *    DMM_AFFILIATE_ID=あなたのアフィリエイトID-990
 *
 * 2. コマンド実行:
 *    node scripts/fetch_works.js
 *
 * → data/fanza_latest.json に本番データが生成され、index.html に即反映されます。
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

async function fetchFanzaList({ sort = "rank", hits = 100, offset = 1, keyword = "" } = {}) {
  const params = new URLSearchParams({
    api_id: DMM_API_ID,
    affiliate_id: DMM_AFFILIATE_ID,
    site: "FANZA",
    service: "doujin",
    floor: "digital_doujin",
    hits: String(hits),
    offset: String(offset),
    sort: sort, // 'date' (新着順) | 'rank' (人気ランキング順)
    output: "json"
  });

  if (keyword) {
    params.set("keyword", keyword);
  }

  const url = `https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`FANZA API HTTP Error (${res.status}): ${errText}`);
  }
  const json = await res.json();
  return json?.result?.items || [];
}

/**
 * FANZA APIのアイテム1件を分析・正規化する
 */
function normalizeItem(item, rankNumber) {
  const genres = (item.iteminfo?.genre || []).map((g) => g.name);
  const makers = item.iteminfo?.maker || [];
  const circleName = makers[0]?.name || "同人サークル";
  const circleId = makers[0]?.id ? `maker_${makers[0].id}` : `circle_${circleName}`;

  // ジャンルや仕様から「同人誌(comic)」「同人音声(audio)」「CG集(cg)」を自動判定
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

  // 価格とセール割引率の計算
  const priceStr = String(item.prices?.price || "0").replace(/[^0-9]/g, "");
  const listPriceStr = String(item.prices?.list_price || priceStr).replace(/[^0-9]/g, "");
  const price = Number(priceStr) || 0;
  const origPrice = Number(listPriceStr) || price;
  const discount = origPrice > price ? Math.round(((origPrice - price) / origPrice) * 100) : 0;

  // レビュー評価と人気スコア算出
  const rating = Number(item.review?.average || 0);
  const reviewsCount = Number(item.review?.count || 0);

  // サンプル画像リストの抽出 (立ち読みプレビュー用)
  const sampleImages =
    item.sampleImageURL?.sample_s?.image ||
    item.sampleImageURL?.sample_l?.image ||
    [];

  // キャンペーン情報
  const campaignTitle = item.campaign?.[0]?.title || (discount > 0 ? `${discount}%OFFセール` : "");

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
    campaignTitle,
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

/**
 * 取得した作品群から「有名作家・人気サークル」を自動分析・ランキング化する
 */
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
      topWorkTitle: w.title,
      sampleImageUrl: w.imageUrl,
      tagsSet: new Set()
    };

    existing.works++;
    existing.totalReviews += w.reviewsCount || 0;
    existing.ratingSum += w.rating || 4.5;
    if (w.rank < existing.bestRank) {
      existing.bestRank = w.rank;
      existing.topWorkTitle = w.title;
      if (w.imageUrl) existing.sampleImageUrl = w.imageUrl;
    }
    if (w.date > existing.latest) {
      existing.latest = w.date;
    }
    w.tags.slice(0, 3).forEach((t) => existing.tagsSet.add(t));
    map.set(w.creatorId, existing);
  }

  // 人気スコア（ランクイン作品数・最高順位・総レビュー数）でソート
  return Array.from(map.values())
    .sort((a, b) => {
      const scoreA = a.works * 100 + a.totalReviews * 5 + (100 - Math.min(100, a.bestRank)) * 10;
      const scoreB = b.works * 100 + b.totalReviews * 5 + (100 - Math.min(100, b.bestRank)) * 10;
      return scoreB - scoreA;
    })
    .slice(0, 36)
    .map((c) => {
      const avgRating = (c.ratingSum / c.works).toFixed(2);
      const topTags = Array.from(c.tagsSet).slice(0, 4);
      return {
        id: c.id,
        name: c.name,
        circle: c.circle,
        category: c.category,
        works: c.works,
        totalReviews: c.totalReviews,
        avgRating: Number(avgRating),
        latest: c.latest,
        imageUrl: c.sampleImageUrl,
        tags: topTags,
        bio: `代表作『${c.topWorkTitle.slice(0, 28)}...』など計${c.works}作品がランクイン（平均評価 ★${avgRating} / レビュー計${c.totalReviews}件）。`
      };
    });
}

async function main() {
  const outDir = path.join(__dirname, "..", "data");
  const outFile = path.join(outDir, "fanza_latest.json");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  if (!DMM_API_ID || !DMM_AFFILIATE_ID || DMM_API_ID === "あなたのDMM_API_ID") {
    console.log("⚠️ DMM_API_ID または DMM_AFFILIATE_ID が未設定です。");
    console.log("   e:\\douzin\\.dev.vars ファイルを作成してキーを設定してください。");
    return;
  }

  if (!/99[0-9]$/.test(DMM_AFFILIATE_ID)) {
    console.warn("⚠️ 注意: DMM WebサービスAPIでは末尾が 990〜999 のアフィリエイトIDが必要です。現在の値:", DMM_AFFILIATE_ID);
  }

  console.log("📡 FANZA WebサービスAPIからデータを取得・分析しています...");

  const [rankItems, newItems, audioItems] = await Promise.all([
    fetchFanzaList({ sort: "rank", hits: 100 }),
    fetchFanzaList({ sort: "date", hits: 100 }),
    fetchFanzaList({ sort: "rank", hits: 60, keyword: "バイノーラル" })
  ]);

  const mergedMap = new Map();

  // 1. 総合ランキング上位を登録
  rankItems.forEach((item, idx) => {
    const norm = normalizeItem(item, idx + 1);
    mergedMap.set(norm.id, norm);
  });

  // 2. 新着作品をマージ
  newItems.forEach((item) => {
    if (!mergedMap.has(item.content_id)) {
      const norm = normalizeItem(item, 999);
      mergedMap.set(norm.id, norm);
    }
  });

  // 3. 同人音声・ASMR作品をマージ
  audioItems.forEach((item) => {
    if (!mergedMap.has(item.content_id)) {
      const norm = normalizeItem(item, 999);
      mergedMap.set(norm.id, norm);
    }
  });

  const works = Array.from(mergedMap.values());
  const creators = analyzeTopCreators(works);

  const payload = {
    updatedAt: new Date().toISOString(),
    mode: "live",
    totalCount: works.length,
    works,
    creators
  };

  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✅ 取得・分析完了！`);
  console.log(`   - 総作品数: ${works.length}件`);
  console.log(`   - 抽出された人気サークル数: ${creators.length}組`);
  console.log(`   - 保存先: data/fanza_latest.json`);
}

main().catch((err) => {
  console.error("❌ エラーが発生しました:", err.message);
  process.exit(1);
});
