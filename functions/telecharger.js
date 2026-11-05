// GET /telecharger : télécharge le programme TweakUpp.bat
import { BAT } from "./_files.js";

export const onRequestGet = () =>
  new Response(BAT, {
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": 'attachment; filename="TweakUpp.bat"',
      "cache-control": "no-cache",
      "x-robots-tag": "noindex",
    },
  });
