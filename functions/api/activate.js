// POST /api/activate { key, hwid } : une clé = un seul PC.
import { json, KEY_RE, getKey, putKey, noStore } from "../_lib.js";

export async function onRequestPost({ request, env }) {
  const missing = noStore(env); if (missing) return missing;

  let body;
  try { body = await request.json(); } catch { return json(400, { ok: false, error: "Requête invalide." }); }
  const key = String(body.key || "").trim().toUpperCase();
  const hwid = String(body.hwid || "").trim();
  if (!KEY_RE.test(key)) return json(400, { ok: false, error: "Format de clé invalide." });
  if (!/^[a-f0-9]{64}$/.test(hwid)) return json(400, { ok: false, error: "Identifiant du PC invalide." });

  const rec = await getKey(env, key);
  if (!rec) return json(404, { ok: false, error: "Clé inconnue." });
  if (rec.status === "revoked") return json(403, { ok: false, error: "Clé désactivée." });
  if (rec.status === "used" && rec.hwid !== hwid) return json(403, { ok: false, error: "Cette clé a déjà été utilisée sur un autre PC." });

  if (rec.status === "new") { rec.status = "used"; rec.hwid = hwid; rec.usedAt = new Date().toISOString(); }
  rec.runs = (rec.runs || 0) + 1;
  rec.lastRunAt = new Date().toISOString();
  await putKey(env, key, rec);

  const script = (await env.TWK.get("config:" + (rec.product || "windows"))) || "";
  return json(200, { ok: true, product: rec.product || "windows", note: rec.note || "", script });
}

export const onRequest = () => json(405, { ok: false, error: "Méthode non autorisée." });
