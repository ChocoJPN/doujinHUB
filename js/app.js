// ============================================================
// DoujinHub メインアプリケーションロジック (安全ストレージ & イベント委譲対応版)
// ============================================================

const memoryStore = {};
function safeGetItem(key, fallbackObj) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    if (memoryStore[key] !== undefined) return memoryStore[key];
  }
  return fallbackObj;
}

function safeSetItem(key, valObj) {
  memoryStore[key] = valObj;
  try {
    window.localStorage.setItem(key, JSON.stringify(valObj));
  } catch (e) {
    // file:// 等の制限環境ではメモリ上で保持
  }
}

const state = {
  activeTab: "new",
  platformFilter: "all",
  categoryFilter: "all",
  selectedTag: null,
  selectedCreatorId: null,
  searchQuery: "",
  onlySale: false,
  sortBy: "newest",
  rankingPeriod: "daily",
  favoriteWorks: safeGetItem("doujinhub_fav_works", ["work-101", "work-102"]),
  followedCreators: safeGetItem("doujinhub_follow_creators", ["creator-1", "creator-2"]),
  affiliateConfig: safeGetItem("doujinhub_affiliate_config", DEFAULT_AFFILIATE_CONFIG)
};

function saveStorage() {
  safeSetItem("doujinhub_fav_works", state.favoriteWorks);
  safeSetItem("doujinhub_follow_creators", state.followedCreators);
  safeSetItem("doujinhub_affiliate_config", state.affiliateConfig);
}
