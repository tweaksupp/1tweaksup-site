// Espace admin (mot de passe = variable secrète ADMIN_PASSWORD du projet Cloudflare).
import { json, getKey, putKey, noStore } from "../_lib.js";

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const block = () => { const b = crypto.getRandomValues(new Uint32Array(4)); return Array.from(b, (n) => ALPHA[n % ALPHA.length]).join(""); };
const newKey = () => `TWK-${block()}-${block()}-${block()}`;

async function sha(s) { return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))); }
async function authorized(request, env) {
  const a = await sha(env.ADMIN_PASSWORD || ""), b = await sha(request.headers.get("x-admin-password") || "");
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Blocage après 3 mauvais mots de passe : 1 heure, par adresse IP.
const MAX_FAILS = 3;
const BLOCK_SECONDS = 3600;

async function guard(request, env) {
  const missing = noStore(env); if (missing) return missing;
  if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 8)
    return json(503, { ok: false, error: "Mot de passe admin non configuré dans Cloudflare (ADMIN_PASSWORD, 8 caractères minimum)." });

  const ip = request.headers.get("cf-connecting-ip") || "inconnue";
  const failKey = "fail:" + ip;
  const raw = await env.TWK.get(failKey);
  const fails = raw ? JSON.parse(raw) : { count: 0, until: 0 };
  const now = Date.now();

  if (fails.until > now) {
    const min = Math.ceil((fails.until - now) / 60000);
    return json(429, { ok: false, error: `Trop d'essais ratés. Accès bloqué encore ${min} min.` });
  }

  if (!(await authorized(request, env))) {
    fails.count = (fails.until && fails.until <= now) ? 1 : fails.count + 1;
    fails.until = 0;
    if (fails.count >= MAX_FAILS) {
      fails.until = now + BLOCK_SECONDS * 1000;
      await env.TWK.put(failKey, JSON.stringify(fails), { expirationTtl: BLOCK_SECONDS + 60 });
      return json(429, { ok: false, error: "Trop d'essais ratés. Accès bloqué pendant 1 heure." });
    }
    await env.TWK.put(failKey, JSON.stringify(fails), { expirationTtl: BLOCK_SECONDS });
    const left = MAX_FAILS - fails.count;
    return json(401, { ok: false, error: `Mot de passe incorrect. Encore ${left} essai${left > 1 ? "s" : ""} avant blocage.` });
  }

  if (raw) await env.TWK.delete(failKey);
  return null;
}

export async function onRequestGet({ request, env }) {
  const g = await guard(request, env); if (g) return g;
  const list = [];
  let cursor;
  do {
    const page = await env.TWK.list({ prefix: "key:", cursor });
    for (const k of page.keys) { const key = k.name.slice(4); list.push({ key, ...(await getKey(env, key)) }); }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  list.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
  const script = (await env.TWK.get("config:windows")) || "";
  return json(200, { ok: true, keys: list, script });
}

export async function onRequestPost({ request, env }) {
  const g = await guard(request, env); if (g) return g;
  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "Requête invalide." }); }

  switch (body.action) {
    case "create": {
      let key = newKey();
      while (await getKey(env, key)) key = newKey();
      const rec = { status: "new", product: "windows", note: String(body.note || "").slice(0, 80), createdAt: new Date().toISOString() };
      await putKey(env, key, rec);
      return json(200, { ok: true, key, ...rec });
    }
    case "revoke":
    case "reset": {
      const key = String(body.key || "");
      const rec = await getKey(env, key);
      if (!rec) return json(404, { ok: false, error: "Clé inconnue." });
      if (body.action === "revoke") rec.status = "revoked";
      else { rec.status = "new"; delete rec.hwid; delete rec.usedAt; }
      await putKey(env, key, rec);
      return json(200, { ok: true, key, ...rec });
    }
    case "save-script": {
      const script = String(body.script || "");
      if (script.length > 200000) return json(400, { ok: false, error: "Script trop long." });
      await env.TWK.put("config:windows", script);
      return json(200, { ok: true });
    }
    default:
      return json(400, { ok: false, error: "Action inconnue." });
  }
}

export const onRequest = () => json(405, { ok: false, error: "Méthode non autorisée." });
