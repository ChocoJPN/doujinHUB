/**
 * Cloudflare Pages Functions: /api/community
 *
 * 同人作品の感想・レビュー・おすすめ紹介・雑談コミュニティ用API。
 * Cloudflare Pages の管理画面（Settings > Functions > KV namespace bindings）で
 * 変数名 `COMMUNITY_KV` にKVネームスペースをバインドすると、全ユーザー間で投稿がリアルタイム共有されます。
 * 未設定の場合は `mode: "local_fallback"` を返し、フロントエンドがローカル保存モードで安全に動作します。
 */

const KV_KEY = "posts_v1";
const MAX_POSTS = 300;
const MAX_REPLIES_PER_POST = 50;

const ALLOWED_TYPES = new Set(["review", "recommend", "question", "talk"]);

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function sanitizeText(str, maxLen) {
  return String(str || "")
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function hasSpamUrl(text) {
  return /https?:\/\/|www\./i.test(text);
}

async function loadPosts(kv) {
  try {
    const raw = await kv.get(KV_KEY, "text");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function savePosts(kv, posts) {
  await kv.put(KV_KEY, JSON.stringify(posts.slice(0, MAX_POSTS)));
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env || !env.COMMUNITY_KV) {
    return jsonResponse({
      ok: true,
      mode: "local_fallback",
      posts: []
    });
  }

  const posts = await loadPosts(env.COMMUNITY_KV);
  return jsonResponse({
    ok: true,
    mode: "cloud",
    posts
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let payload;
  try {
    payload = await request.json();
  } catch (e) {
    return jsonResponse({ ok: false, error: "リクエスト形式が正しくありません。" }, 400);
  }

  if (!env || !env.COMMUNITY_KV) {
    return jsonResponse({
      ok: true,
      mode: "local_fallback",
      message: "Cloudflare KV (COMMUNITY_KV) 未設定のためローカル保存モードで動作します。"
    });
  }

  const action = String(payload.action || "create");
  const posts = await loadPosts(env.COMMUNITY_KV);

  if (action === "create") {
    const nickname = sanitizeText(payload.nickname, 30) || "名無しの同人ファン";
    const postType = ALLOWED_TYPES.has(payload.postType) ? payload.postType : "review";
    const body = sanitizeText(payload.body, 1000);
    const spoiler = Boolean(payload.spoiler);
    const rawRating = Number(payload.rating);
    const rating =
      postType === "review" || postType === "recommend"
        ? Math.min(5, Math.max(1, Number.isFinite(rawRating) && rawRating > 0 ? Math.round(rawRating) : 5))
        : null;

    if (body.length < 4) {
      return jsonResponse({ ok: false, error: "感想・本文は4文字以上入力してください。" }, 400);
    }
    if (hasSpamUrl(body) || hasSpamUrl(nickname)) {
      return jsonResponse({ ok: false, error: "スパム対策のため、本文や名前にURLは含められません。" }, 400);
    }

    const workId = sanitizeText(payload.workId, 64) || null;
    const newPost = {
      id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      postType,
      nickname,
      rating,
      spoiler,
      body,
      workId,
      workTitle: workId ? sanitizeText(payload.workTitle, 160) : "",
      workCircle: workId ? sanitizeText(payload.workCircle, 80) : "",
      workImageUrl: workId ? sanitizeText(payload.workImageUrl, 300) : "",
      workCategory: workId ? sanitizeText(payload.workCategory, 20) : "",
      workIsAi: workId ? Boolean(payload.workIsAi) : false,
      workPrice: workId ? Number(payload.workPrice) || 0 : 0,
      workDiscount: workId ? Number(payload.workDiscount) || 0 : 0,
      likes: 0,
      replies: [],
      createdAt: new Date().toISOString()
    };

    posts.unshift(newPost);
    await savePosts(env.COMMUNITY_KV, posts);
    return jsonResponse({ ok: true, mode: "cloud", post: newPost });
  }

  if (action === "reply") {
    const postId = sanitizeText(payload.postId, 80);
    const nickname = sanitizeText(payload.nickname, 30) || "名無しの同人ファン";
    const body = sanitizeText(payload.body, 400);

    if (body.length < 2) {
      return jsonResponse({ ok: false, error: "返信は2文字以上入力してください。" }, 400);
    }
    if (hasSpamUrl(body) || hasSpamUrl(nickname)) {
      return jsonResponse({ ok: false, error: "スパム対策のため、返信にURLは含められません。" }, 400);
    }

    const target = posts.find((p) => p.id === postId);
    if (!target) {
      return jsonResponse({ ok: false, error: "対象の投稿が見つかりません。" }, 404);
    }

    if (!Array.isArray(target.replies)) target.replies = [];
    if (target.replies.length >= MAX_REPLIES_PER_POST) {
      return jsonResponse({ ok: false, error: "この投稿の返信上限に達しています。" }, 400);
    }

    const reply = {
      id: `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      nickname,
      body,
      createdAt: new Date().toISOString()
    };

    target.replies.push(reply);
    await savePosts(env.COMMUNITY_KV, posts);
    return jsonResponse({ ok: true, mode: "cloud", postId, reply });
  }

  if (action === "like") {
    const postId = sanitizeText(payload.postId, 80);
    const target = posts.find((p) => p.id === postId);
    if (!target) {
      return jsonResponse({ ok: false, error: "対象の投稿が見つかりません。" }, 404);
    }
    target.likes = (Number(target.likes) || 0) + 1;
    await savePosts(env.COMMUNITY_KV, posts);
    return jsonResponse({ ok: true, mode: "cloud", postId, likes: target.likes });
  }

  return jsonResponse({ ok: false, error: "不明なアクションです。" }, 400);
}
