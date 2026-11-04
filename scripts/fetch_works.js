/**
 * ============================================================
 * FANZA同人 新着・ランキング自動取得 & データ分析バッチ (GitHub Actions / ローカル両対応)
 * ============================================================
 *
 * 環境変数 DMM_API_ID, DMM_AFFILIATE_ID を使って FANZA API からデータ取得し、
 * data/fanza_latest.json を更新します。
 */

const fs = require("fs");
const path = require("path");

const DMM_API_ID = process.env.DMM_API_ID || "";
const DMM_AFFILIATE_ID = process.env.DMM_AFFILIATE_ID || "";

async function fetchFanzaList(sort = "rank", hits = 60) {
  const params = new URLSearchParams({
    api_id: DMM_API_ID,
    affiliate_id: DMM_AFFILIATE_ID,
    site: "FANZA",
    service: "doujin",
    floor: "digital_doujin",
    hits: String(hits),
    sort: sort, // 'date' | 'rank'
    output: "json"
  });

  const url = `https://api.dmm.com/affiliate/v3/ItemList?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`FANZA API HTTP Error: ${res.status}`);
  }
  const json = await res.json();
  return json?.result?.items || [];
}

function normalizeItem(item, rankIndex) {
  const genres = (item.iteminfo?.genre || []).map((g) => g.name);
  const makers = (item.iteminfo?.maker || []);
  const circleName = makers[0]?.name || "同人サークル";
  const circleId = makers[0]?.id ? `maker_${makers[0].id}` : `c_${rankIndex}`;

  const isAudio =
    genres.some((g) => g.includes("音声") || g.includes("ASMR") || g.includes("バイノーラル")) ||
    (item.volume && String(item.volume).includes("分"));
  const isCg = genres.some((g) => g.includes("CG") || g.includes("イラスト"));
  const category = isAudio ? "audio" : isCg ? "cg" : "comic";

  const priceStr = String(item.prices?.price || "0").replace(/[^0-9]/g, "");
  const listPriceStr = String(item.prices?.list_price || priceStr).replace(/[^0-9]/g, "");
  const price = Number(priceStr) || 0;
  const origPrice = Number(listPriceStr) || price;
  const discount = origPrice > price ? Math.round(((origPrice - price) / origPrice) * 100) : 0;

  const rating = Number(item.review?.average || 4.5);
  const reviewsCount = Number(item.review?.count || 0);

  return {
    id: item.content_id || `w_${rankIndex}`,
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
    rating,
    reviewsCount,
    dlCount: reviewsCount * 35,
    rank: rankIndex + 1,
    imageUrl: item.imageURL?.large || item.imageURL?.list || "",
    affiliateUrl: item.affiliateURL || `https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${item.content_id}/`,
    tags: genres.slice(0, 6)
  };
}

function buildCreatorsSummary(works) {
  const map = new Map();
  for (const w of works) {
    const cur = map.get(w.creatorId) || {
      id: w.creatorId,
      name: w.author,
      circle: w.circle,
      cat: w.category === "audio" ? "VOICE / ASMR" : w.category === "cg" ? "ILLUSTRATION" : "COMIC",
      works: 0,
      latest: w.date,
      bio: `FANZA同人にて『${w.title.slice(0, 24)}...』などを配信中の注目サークル。`
    };
    cur.works++;
    if (w.date > cur.latest) cur.latest = w.date;
    map.set(w.creatorId, cur);
  }
  return Array.from(map.values()).slice(0, 24);
}

async function main() {
  const outDir = path.join(__dirname, "..", "data");
  const outFile = path.join(outDir, "fanza_latest.json");
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  if (!DMM_API_ID || !DMM_AFFILIATE_ID) {
    console.log("[INFO] DMM_API_ID または DMM_AFFILIATE_ID が未設定のため、既存のJSONを維持します。");
    return;
  }

  console.log("FANZA API からランキング＆新着データを取得中...");
  const [rankItems, newItems] = await Promise.all([
    fetchFanzaList("rank", 50),
    fetchFanzaList("date", 50)
  ]);

  const mergedMap = new Map();
  rankItems.forEach((item, idx) => {
    const norm = normalizeItem(item, idx);
    mergedMap.set(norm.id, norm);
  });
  newItems.forEach((item, idx) => {
    if (!mergedMap.has(item.content_id)) {
      const norm = normalizeItem(item, rankItems.length + idx);
      mergedMap.set(norm.id, norm);
    }
  });

  const works = Array.from(mergedMap.values());
  const creators = buildCreatorsSummary(works);

  const payload = {
    updatedAt: new Date().toISOString(),
    mode: "live",
    totalCount: works.length,
    works,
    creators
  };

  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf8");
  console.log(`✅ 更新完了: ${works.length}作品を data/fanza_latest.json に保存しました。`);
}

main().catch((err) => {
  console.error("エラー:", err);
  process.exit(1);
});
