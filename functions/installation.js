// GET /installation : télécharge le fichier d'installation propre TweakUpp (autounattend.xml)
import { XML } from "./_files.js";

export const onRequestGet = () =>
  new Response(XML, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "content-disposition": 'attachment; filename="autounattend.xml"',
      "cache-control": "no-cache",
      "x-robots-tag": "noindex",
    },
  });
