// GET /api/programme : script PowerShell du programme TweakUpp (fenêtre de clé + lancement).
import { PS1 } from "../_files.js";

export const onRequestGet = () =>
  new Response(PS1, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache" } });
