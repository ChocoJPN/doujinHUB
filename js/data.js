// ============================================================
// 同人ポータル「DoujinHub (同人ハブ)」 サンプルデータ & アフィリエイト設定
// ============================================================

const DEFAULT_AFFILIATE_CONFIG = {
  fanzaAffiliateId: "yourname-990",
  dlsiteAffiliateId: "your_dlsite_id",
  melonbooksAffiliateId: "your_melon_id"
};

// プラットフォーム定義
const PLATFORMS = {
  fanza: {
    id: "fanza",
    name: "FANZA同人",
    shortName: "FANZA",
    color: "#e5004f",
    bgLight: "rgba(229, 0, 79, 0.12)",
    borderLight: "rgba(229, 0, 79, 0.35)",
    baseUrl: "https://www.dmm.co.jp/dc/doujin/"
  },
  dlsite: {
    id: "dlsite",
    name: "DLsite",
    shortName: "DLsite",
    color: "#2b6cb0",
    bgLight: "rgba(43, 108, 176, 0.15)",
    borderLight: "rgba(43, 108, 176, 0.4)",
    baseUrl: "https://www.dlsite.com/maniax/"
  },
  melonbooks: {
    id: "melonbooks",
    name: "メロンブックス",
    shortName: "メロン",
    color: "#10b981",
    bgLight: "rgba(16, 185, 129, 0.14)",
    borderLight: "rgba(16, 185, 129, 0.38)",
    baseUrl: "https://www.melonbooks.co.jp/"
  }
};

// カテゴリ定義
const CATEGORIES = {
  comic: { id: "comic", name: "同人誌・コミック", icon: "📖" },
  audio: { id: "audio", name: "同人音声・ASMR", icon: "🎧" },
  cg: { id: "cg", name: "CG・イラスト集", icon: "🎨" },
  game: { id: "game", name: "同人ゲーム", icon: "🎮" }
};

// 有名作家・サークル・声優データ
const CREATORS = [
  {
    id: "creator-1",
    name: "月影アトリエ (月影レン)",
    role: "漫画家・イラストレーター",
    roleType: "author",
    avatarColor: "linear-gradient(135deg, #ec4899, #8b5cf6)",
    followersCount: 48200,
    worksCount: 34,
    latestReleaseDate: "2026-11-04",
    mainCategory: "comic",
    platforms: ["fanza", "dlsite", "melonbooks"],
    tags: ["純愛", "幼馴染", "フルカラー", "コミケ新刊"],
    bio: "繊細な塗りと圧倒的なヒロイン描写で人気の同人作家。電子版はFANZA・DLsite、書籍版はメロンブックス専売で展開。"
  },
  {
    id: "creator-2",
    name: "星空サウンドラボ (CV: 白雪みう)",
    role: "同人音声サークル / 声優",
    roleType: "voice",
    avatarColor: "linear-gradient(135deg, #3b82f6, #06b6d4)",
    followersCount: 62500,
    worksCount: 48,
    latestReleaseDate: "2026-11-04",
    mainCategory: "audio",
    platforms: ["dlsite", "fanza"],
    tags: ["バイノーラル", "耳かき", "ささやき", "KU100"],
    bio: "NEUMANN KU100マイクを使用した超高音質ASMR・同人音声サークル。DLsiteおよびFANZA同人にてランキング常連。"
  },
  {
    id: "creator-3",
    name: "琥珀亭 (琥珀クロエ)",
    role: "漫画家・同人サークル",
    roleType: "author",
    avatarColor: "linear-gradient(135deg, #f59e0b, #ef4444)",
    followersCount: 39100,
    worksCount: 27,
    latestReleaseDate: "2026-11-03",
    mainCategory: "comic",
    platforms: ["melonbooks", "fanza", "dlsite"],
    tags: ["ファンタジー", "異世界", "長編シリーズ", "メロン特典あり"],
    bio: "重厚な世界観と魅力的なキャラクターで累計30万部を突破する人気サークル。新刊タペストリーセットはメロンブックス限定。"
  },
  {
    id: "creator-4",
    name: "甘蜜ショコラティエ (CV: 結城ひなの / 琴音りり)",
    role: "音声サークル・Wキャスト声優",
    roleType: "voice",
    avatarColor: "linear-gradient(135deg, #a855f7, #ec4899)",
    followersCount: 53800,
    worksCount: 19,
    latestReleaseDate: "2026-11-03",
    mainCategory: "audio",
    platforms: ["dlsite", "fanza"],
    tags: ["Wキャスト", "両耳ささやき", "甘やかし", "添い寝"],
    bio: "人気声優2名による左右別チャンネル完全バイノーラル作品を中心に制作する音声特化サークル。"
  },
  {
    id: "creator-5",
    name: "蒼穹デジタルワークス (蒼井ハルカ)",
    role: "CGイラストレーター",
    roleType: "author",
    avatarColor: "linear-gradient(135deg, #10b981, #3b82f6)",
    followersCount: 28400,
    worksCount: 41,
    latestReleaseDate: "2026-11-02",
    mainCategory: "cg",
    platforms: ["fanza", "dlsite"],
    tags: ["高解像度CG", "差分多数", "学園", "アニメーション付き"],
    bio: "4K高解像度イラストと豊富な衣装差分で支持されるデジタルサークル。"
  },
  {
    id: "creator-6",
    name: "黒猫ノクターン (夜々アリス)",
    role: "漫画家・イラストレーター",
    roleType: "author",
    avatarColor: "linear-gradient(135deg, #6366f1, #ec4899)",
    followersCount: 44900,
    worksCount: 22,
    latestReleaseDate: "2026-11-01",
    mainCategory: "comic",
    platforms: ["melonbooks", "dlsite", "fanza"],
    tags: ["ラブコメ", "先輩・後輩", "描き下ろし収録", "コミケ109"],
    bio: "SNSで話題のショートラブコメをまとめた総集編シリーズが大ヒット中。"
  }
];

// 作品サンプルデータ（3サイト横断・価格比較・ランキング対応）
const WORKS = [
  {
    id: "work-101",
    title: "放課後の図書室で、君と秘密のページをめくる総集編【描き下ろし32P追加】",
    category: "comic",
    creatorId: "creator-1",
    creatorName: "月影アトリエ (月影レン)",
    voiceActors: [],
    releaseDate: "2026-11-04",
    isNew: true,
    pageOrDuration: "148ページ",
    rating: 4.92,
    reviewCount: 342,
    favoritesCount: 12840,
    coverGradient: "linear-gradient(135deg, #db2777 0%, #7c3aed 100%)",
    coverBadge: "3サイト同時新着",
    tags: ["純愛", "幼馴染", "学園", "フルカラー", "総集編", "描き下ろし収録"],
    description: "シリーズ累計10万DL突破の『放課後の図書室』シリーズ第1話〜第5話に加え、完全新作描き下ろし32ページを収録した決定版！電子版は高解像度PDF/EPUB同梱、メロンブックスではB2タペストリー付き限定版も同時発売。",
    sampleSpec: {
      type: "comic",
      pages: [
        "P.1: 表紙（描き下ろしフルカラーイラスト）",
        "P.2-5: プロローグ「夕暮れの図書室にて」",
        "P.6-18: 第1章「雨宿りの距離感」",
        "P.116-148: 【新規描き下ろし】アフターストーリー"
      ]
    },
    availability: {
      fanza: {
        available: true,
        workCode: "d_410101",
        price: 1320,
        originalPrice: 1650,
        discountPercent: 20,
        saleLabel: "新着20%OFFセール",
        format: "電子版 (PDF/JPG)",
        rankDaily: 1,
        rankWeekly: 2
      },
      dlsite: {
        available: true,
        workCode: "RJ01290101",
        price: 1320,
        originalPrice: 1650,
        discountPercent: 20,
        saleLabel: "リリース記念20%OFF",
        format: "電子版 (ブラウザ/PDF)",
        rankDaily: 2,
        rankWeekly: 3
      },
      melonbooks: {
        available: true,
        workCode: "21000192831",
        price: 1980,
        originalPrice: 1980,
        discountPercent: 0,
        saleLabel: "会場限定4Pリーフレット特典付",
        format: "書籍版 (B5・148P) / DL版",
        rankDaily: 1,
        rankWeekly: 1
      }
    }
  },
  {
    id: "work-102",
    title: "【KU100バイノーラル】星空温泉宿でとろける極上耳かき＆密着ささやき添い寝SP",
    category: "audio",
    creatorId: "creator-2",
    creatorName: "星空サウンドラボ",
    voiceActors: ["白雪みう"],
    releaseDate: "2026-11-04",
    isNew: true,
    pageOrDuration: "収録時間 2時間45分 (WAV/FLAC/MP3)",
    rating: 4.96,
    reviewCount: 518,
    favoritesCount: 19420,
    coverGradient: "linear-gradient(135deg, #1d4ed8 0%, #0891b2 100%)",
    coverBadge: "音声デイリー1位",
    tags: ["バイノーラル", "耳かき", "ささやき", "添い寝", "KU100", "高音質FLAC", "セール中"],
    description: "最高峰ダミーヘッドマイク「NEUMANN KU100」で収録した極上の癒やし音声作品。温泉宿の静かな和室で、竹耳かき・梵天・炭酸泡耳洗浄から、心音付きの密着添い寝まで全7トラック・165分収録！",
    sampleSpec: {
      type: "audio",
      tracks: [
        { title: "Track 01: 温泉宿へようこそ（お茶出し＆肩もみ）", duration: "18:24" },
        { title: "Track 02: 膝枕でじっくり竹耳かき（右耳→左耳）", duration: "34:10" },
        { title: "Track 03: ふわふわ梵天＆耳ふー・吐息ささやき", duration: "28:45" },
        { title: "Track 04: 露天風呂あがりのオイル耳マッサージ", duration: "31:50" },
        { title: "Track 05: 布団に入って密着心音＆寝かしつけ（SEなし差分付）", duration: "51:51" }
      ]
    },
    availability: {
      dlsite: {
        available: true,
        workCode: "RJ01290205",
        price: 1540,
        originalPrice: 2200,
        discountPercent: 30,
        saleLabel: "初回30%OFF＋ポイント10%",
        format: "WAV / FLAC / MP3 + 高画質ジャケット",
        rankDaily: 1,
        rankWeekly: 1
      },
      fanza: {
        available: true,
        workCode: "d_410205",
        price: 1540,
        originalPrice: 2200,
        discountPercent: 30,
        saleLabel: "30%OFFキャンペーン",
        format: "WAV / MP3同梱",
        rankDaily: 3,
        rankWeekly: 4
      },
      melonbooks: {
        available: false
      }
    }
  },
  {
    id: "work-103",
    title: "銀翼の聖女と黒き竜騎士 IV ―王都奪還編―【メロン限定タペストリー特装版あり】",
    category: "comic",
    creatorId: "creator-3",
    creatorName: "琥珀亭 (琥珀クロエ)",
    voiceActors: [],
    releaseDate: "2026-11-03",
    isNew: true,
    pageOrDuration: "84ページ",
    rating: 4.88,
    reviewCount: 215,
    favoritesCount: 9630,
    coverGradient: "linear-gradient(135deg, #d97706 0%, #dc2626 100%)",
    coverBadge: "メロン予約1位",
    tags: ["ファンタジー", "異世界", "長編シリーズ", "メロン特典あり", "コミケ新刊"],
    description: "大人気ダークファンタジー同人誌シリーズ待望の第4巻！圧倒的な画力で描かれるバトルシーンとヒロインの葛藤。メロンブックスでは描き下ろしクリアファイル＆B2タペストリー特装版を展開、FANZA・DLsiteではデジタル特装版（ラフ画集20P付き）を同時配信！",
    sampleSpec: {
      type: "comic",
      pages: [
        "P.1-4: 巻頭カラーピンナップ",
        "P.5-32: 第一幕「城塞都市の夜明け」",
        "P.33-68: 第二幕「聖女の誓い」",
        "P.69-84: デジタル版限定 設定資料＆ラフ集"
      ]
    },
    availability: {
      melonbooks: {
        available: true,
        workCode: "21000192900",
        price: 1430,
        originalPrice: 1430,
        discountPercent: 0,
        saleLabel: "メロン専売クリアファイル特典",
        format: "書籍版 (B5・84P)",
        rankDaily: 2,
        rankWeekly: 2
      },
      fanza: {
        available: true,
        workCode: "d_410312",
        price: 1100,
        originalPrice: 1100,
        discountPercent: 0,
        saleLabel: "デジタル特典ラフ集20P付",
        format: "電子版 (PDF/JPG)",
        rankDaily: 4,
        rankWeekly: 5
      },
      dlsite: {
        available: true,
        workCode: "RJ01290312",
        price: 1100,
        originalPrice: 1100,
        discountPercent: 0,
        saleLabel: "デジタル特典ラフ集20P付",
        format: "電子版 (ブラウザ/PDF)",
        rankDaily: 5,
        rankWeekly: 6
      }
    }
  },
  {
    id: "work-104",
    title: "【Wキャスト両耳甘やかし】ダウナー系妹＆世話焼きお姉ちゃんに左右から挟まれる至福の休日",
    category: "audio",
    creatorId: "creator-4",
    creatorName: "甘蜜ショコラティエ",
    voiceActors: ["結城ひなの", "琴音りり"],
    releaseDate: "2026-11-03",
    isNew: true,
    pageOrDuration: "収録時間 3時間10分",
    rating: 4.94,
    reviewCount: 409,
    favoritesCount: 15800,
    coverGradient: "linear-gradient(135deg, #9333ea 0%, #db2777 100%)",
    coverBadge: "Wキャスト人気作",
    tags: ["Wキャスト", "両耳ささやき", "甘やかし", "添い寝", "バイノーラル", "セール中"],
    description: "右耳からは世話焼きなお姉ちゃん（CV:結城ひなの）、左耳からはちょっぴり塩対応だけど甘えんぼな妹（CV:琴音りり）！完全別録りバイノーラルによる掛け合いとW耳かき・Wマッサージで脳がとろける190分。",
    sampleSpec: {
      type: "audio",
      tracks: [
        { title: "Track 01: 寝起きドッキリ！左右からのモーニングコール", duration: "22:15" },
        { title: "Track 02: お姉ちゃんと妹の奪い合いW耳かき", duration: "41:30" },
        { title: "Track 03: 炭酸ヘッドスパ＆タッピング（3D音響）", duration: "36:05" },
        { title: "Track 04: 左右から挟まれて眠る夜（心音＆吐息）", duration: "50:10" }
      ]
    },
    availability: {
      dlsite: {
        available: true,
        workCode: "RJ01290488",
        price: 1848,
        originalPrice: 2640,
        discountPercent: 30,
        saleLabel: "新作30%OFFセール",
        format: "WAV / MP3 / 専用スマホ再生対応",
        rankDaily: 3,
        rankWeekly: 2
      },
      fanza: {
        available: true,
        workCode: "d_410488",
        price: 1848,
        originalPrice: 2640,
        discountPercent: 30,
        saleLabel: "新作30%OFFセール",
        format: "WAV / MP3",
        rankDaily: 5,
        rankWeekly: 3
      },
      melonbooks: {
        available: true,
        workCode: "21000192955",
        price: 2750,
        originalPrice: 2750,
        discountPercent: 0,
        saleLabel: "DLカード＋アクリルスタンド付",
        format: "DLカード＋グッズセット",
        rankDaily: 6,
        rankWeekly: 8
      }
    }
  },
  {
    id: "work-105",
    title: "【4K超高解像度CG集】憧れの生徒会長と二人きりの放課後アトリエ【アニメーション動画同梱】",
    category: "cg",
    creatorId: "creator-5",
    creatorName: "蒼穹デジタルワークス (蒼井ハルカ)",
    voiceActors: [],
    releaseDate: "2026-11-02",
    isNew: false,
    pageOrDuration: "基本CG 24枚（差分込み680枚）+ MP4動画",
    rating: 4.85,
    reviewCount: 189,
    favoritesCount: 8410,
    coverGradient: "linear-gradient(135deg, #059669 0%, #2563eb 100%)",
    coverBadge: "FANZA CG1位",
    tags: ["高解像度CG", "差分多数", "学園", "アニメーション付き", "フルカラー", "セール中"],
    description: "4K（3840×2160px）サイズで描かれた美麗CGイラスト集！文字なし差分・衣装差分・表情差分を含め全680枚収録。さらにLive2Dでぬるぬる動くショートアニメーション動画（60fps MP4）5本を同梱！",
    sampleSpec: {
      type: "comic",
      pages: [
        "CG 01-06: 生徒会室での日常シーン（表情差分30枚）",
        "CG 07-15: 美術室でのモデルデッサン（衣装差分多数）",
        "CG 16-24: 夕暮れのアトリエ特別イベント",
        "Bonus Movie: 60fps Live2Dアニメーション5本"
      ]
    },
    availability: {
      fanza: {
        available: true,
        workCode: "d_410599",
        price: 990,
        originalPrice: 1980,
        discountPercent: 50,
        saleLabel: "FANZA専売先行 50%OFF!",
        format: "JPG / PDF / MP4動画同梱",
        rankDaily: 2,
        rankWeekly: 1
      },
      dlsite: {
        available: true,
        workCode: "RJ01290599",
        price: 1386,
        originalPrice: 1980,
        discountPercent: 30,
        saleLabel: "30%OFFセール",
        format: "JPG / MP4動画同梱",
        rankDaily: 6,
        rankWeekly: 7
      },
      melonbooks: {
        available: false
      }
    }
  },
  {
    id: "work-106",
    title: "クールな黒猫先輩は私の前だけではしゃぎたい！ Complete Box (1〜3巻＋新規40P)",
    category: "comic",
    creatorId: "creator-6",
    creatorName: "黒猫ノクターン (夜々アリス)",
    voiceActors: [],
    releaseDate: "2026-11-01",
    isNew: false,
    pageOrDuration: "212ページ",
    rating: 4.91,
    reviewCount: 476,
    favoritesCount: 16200,
    coverGradient: "linear-gradient(135deg, #4f46e5 0%, #db2777 100%)",
    coverBadge: "殿堂入りベストセラー",
    tags: ["ラブコメ", "先輩・後輩", "純愛", "総集編", "描き下ろし収録", "メロン特典あり"],
    description: "SNSで累計50万いいねを獲得した大人気シリーズ『クールな黒猫先輩』が待望のコンプリートBOX化！既刊1〜3巻の全エピソードに加え、卒業旅行編40ページを完全新規描き下ろし。",
    sampleSpec: {
      type: "comic",
      pages: [
        "P.1-60: Vol.1「雨の日の黒猫先輩」",
        "P.61-120: Vol.2「夏祭りと秘密の浴衣」",
        "P.121-172: Vol.3「文化祭の後夜祭で」",
        "P.173-212: 【完全新作】卒業旅行編（40P）"
      ]
    },
    availability: {
      melonbooks: {
        available: true,
        workCode: "21000192100",
        price: 2420,
        originalPrice: 2420,
        discountPercent: 0,
        saleLabel: "収納BOX＋小冊子特典付",
        format: "書籍版 (B5・212P)",
        rankDaily: 3,
        rankWeekly: 3
      },
      dlsite: {
        available: true,
        workCode: "RJ01289900",
        price: 1540,
        originalPrice: 2200,
        discountPercent: 30,
        saleLabel: "30%OFFセール",
        format: "電子版 (ブラウザ/PDF)",
        rankDaily: 4,
        rankWeekly: 4
      },
      fanza: {
        available: true,
        workCode: "d_409900",
        price: 1540,
        originalPrice: 2200,
        discountPercent: 30,
        saleLabel: "30%OFFセール",
        format: "電子版 (PDF/EPUB)",
        rankDaily: 6,
        rankWeekly: 6
      }
    }
  }
];

// 人気タグ一覧
const POPULAR_TAGS = [
  "純愛",
  "バイノーラル",
  "耳かき",
  "ささやき",
  "フルカラー",
  "総集編",
  "Wキャスト",
  "KU100",
  "ファンタジー",
  "ラブコメ",
  "メロン特典あり",
  "描き下ろし収録",
  "高解像度CG",
  "添い寝"
];

// アフィリエイトURL生成ヘルパー
function buildAffiliateUrl(platformId, workCode, config = DEFAULT_AFFILIATE_CONFIG) {
  if (platformId === "fanza") {
    const afId = encodeURIComponent(config.fanzaAffiliateId || "yourname-990");
    const target = encodeURIComponent(`https://www.dmm.co.jp/dc/doujin/-/detail/=/cid=${workCode}/`);
    return `https://al.dmm.co.jp/?lurl=${target}&af_id=${afId}&ch=link_tool&ch_id=link`;
  }
  if (platformId === "dlsite") {
    const afId = encodeURIComponent(config.dlsiteAffiliateId || "your_dlsite_id");
    return `https://dlaf.jp/maniax/dlaf/=/t/n/link/work/aid/${afId}/id/${workCode}.html`;
  }
  if (platformId === "melonbooks") {
    const afId = encodeURIComponent(config.melonbooksAffiliateId || "your_melon_id");
    return `https://www.melonbooks.co.jp/detail/detail.php?product_id=${workCode}&aff_id=${afId}`;
  }
  return "#";
}
