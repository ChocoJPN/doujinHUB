# DOUJIN INDEX

FANZA同人の新着作品・人気ランキング・作家/サークル別アーカイブ・市場データ分析サイト。

## 構成
- [index.html](./index.html) : フロントエンド画面（新着・ランキング・作家一覧・データ分析）
- [functions/api/fanza.js](./functions/api/fanza.js) : Cloudflare Pages Functions（FANZA API 取得＆データ分析エンドポイント）
- [scripts/fetch_works.js](./scripts/fetch_works.js) : GitHub Actions 定期データ更新スクリプト
- [.github/workflows/update-fanza-data.yml](./.github/workflows/update-fanza-data.yml) : 6時間ごとの自動更新ワークフロー
