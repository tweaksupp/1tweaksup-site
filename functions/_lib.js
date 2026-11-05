// Outils communs : réponses JSON et accès au stockage des clés (Cloudflare KV, binding "TWK").
export const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const KEY_RE = /^TWK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export const getKey = async (env, key) => {
  const v = await env.TWK.get("key:" + key);
  return v ? JSON.parse(v) : null;
};
export const putKey = (env, key, rec) => env.TWK.put("key:" + key, JSON.stringify(rec));

export const noStore = (env) =>
  !env.TWK ? json(503, { ok: false, error: "Stockage TWK non relié au projet Cloudflare." }) : null;
