// Espace admin TweakUpp (protégé par le mot de passe ADMIN_PASSWORD défini dans Netlify).
// GET  /api/admin            -> liste des clés + script enregistré
// POST /api/admin {action}   -> "create" | "revoke" | "reset" | "save-script"
import { getStore } from "@netlify/blobs";
import { randomInt, timingSafeEqual, createHash } from "node:crypto";

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const block = () => Array.from({ length: 4 }, () => ALPHA[randomInt(ALPHA.length)]).join("");
const newKey = () => `TWK-${block()}-${block()}-${block()}`;

function authorized(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  const given = req.headers.get("x-admin-password") || "";
  if (expected.length < 8) return false;
  const a = createHash("sha256").update(expected).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

export default async (req) => {
  if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 8) {
    return json(503, { ok: false, error: "Mot de passe admin non configuré dans Netlify (ADMIN_PASSWORD, 8 caractères minimum)." });
  }
  if (!authorized(req)) return json(401, { ok: false, error: "Mot de passe incorrect." });

  const keys = getStore("keys");
  const config = getStore("config");

  if (req.method === "GET") {
    const { blobs } = await keys.list();
    const list = await Promise.all(blobs.map(async (b) => ({ key: b.key, ...(await keys.get(b.key, { type: "json" })) })));
    list.sort((x, y) => String(y.createdAt).localeCompare(String(x.createdAt)));
    const script = (await config.get("windows", { type: "text" })) || "";
    return json(200, { ok: true, keys: list, script });
  }

  if (req.method !== "POST") return json(405, { ok: false, error: "Méthode non autorisée." });
  let body;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "Requête invalide." }); }

  switch (body.action) {
    case "create": {
      let key = newKey();
      while (await keys.get(key)) key = newKey();
      const rec = { status: "new", product: "windows", note: String(body.note || "").slice(0, 80), createdAt: new Date().toISOString() };
      await keys.setJSON(key, rec);
      return json(200, { ok: true, key, ...rec });
    }
    case "revoke":
    case "reset": {
      const key = String(body.key || "");
      const rec = await keys.get(key, { type: "json" });
      if (!rec) return json(404, { ok: false, error: "Clé inconnue." });
      if (body.action === "revoke") rec.status = "revoked";
      else { rec.status = "new"; delete rec.hwid; delete rec.usedAt; }
      await keys.setJSON(key, rec);
      return json(200, { ok: true, key, ...rec });
    }
    case "save-script": {
      const script = String(body.script || "");
      if (script.length > 200000) return json(400, { ok: false, error: "Script trop long." });
      await config.set("windows", script);
      return json(200, { ok: true });
    }
    default:
      return json(400, { ok: false, error: "Action inconnue." });
  }
};

export const config = { path: "/api/admin" };
