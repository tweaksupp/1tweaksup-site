// Activation d'une clé TweakUpp : une clé = un seul PC.
// POST /api/activate  { key, hwid }
//  - clé neuve        -> liée à ce PC, renvoie le script d'optimisation
//  - même PC relancé  -> autorisé (en cas de plantage pendant l'opti)
//  - autre PC         -> refusé
import { getStore } from "@netlify/blobs";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const KEY_RE = /^TWK-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/;

export default async (req) => {
  if (req.method !== "POST") return json(405, { ok: false, error: "Méthode non autorisée." });

  let body;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "Requête invalide." }); }

  const key = String(body.key || "").trim().toUpperCase();
  const hwid = String(body.hwid || "").trim();
  if (!KEY_RE.test(key)) return json(400, { ok: false, error: "Format de clé invalide." });
  if (!/^[a-f0-9]{64}$/.test(hwid)) return json(400, { ok: false, error: "Identifiant du PC invalide." });

  const keys = getStore("keys");
  const rec = await keys.get(key, { type: "json" });
  if (!rec) return json(404, { ok: false, error: "Clé inconnue." });
  if (rec.status === "revoked") return json(403, { ok: false, error: "Clé désactivée." });

  if (rec.status === "used" && rec.hwid !== hwid) {
    return json(403, { ok: false, error: "Cette clé a déjà été utilisée sur un autre PC." });
  }

  if (rec.status === "new") {
    rec.status = "used";
    rec.hwid = hwid;
    rec.usedAt = new Date().toISOString();
  }
  rec.runs = (rec.runs || 0) + 1;
  rec.lastRunAt = new Date().toISOString();
  await keys.setJSON(key, rec);

  const config = getStore("config");
  const script = (await config.get(rec.product || "windows", { type: "text" })) || "";

  return json(200, { ok: true, product: rec.product || "windows", note: rec.note || "", script });
};

export const config = { path: "/api/activate" };
