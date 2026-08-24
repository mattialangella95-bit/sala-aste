const fs = require("fs");
const js = fs.readFileSync("build/app.js", "utf8");
const css = fs.readFileSync("build/app.css", "utf8");
/* Marchio di versione. Serve per capire al volo quale build sta online,
   soprattutto quando si lavora da due posti diversi. */
const d = new Date();
const due = (n) => String(n).padStart(2, "0");
const versione = `${d.getFullYear()}-${due(d.getMonth() + 1)}-${due(d.getDate())} ${due(d.getHours())}:${due(d.getMinutes())}`;

const html = `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#F7E9EC">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="Sala Aste">
<title>Sala Aste</title>
<link rel="manifest" href="manifest.json">
<style>${css}</style>
</head>
<body>
<div id="spia">pronto</div>
<div id="radice"></div>
<script>window.VERSIONE=${JSON.stringify(versione)}</script>\n<script>${js}</script>
</body>
</html>`;
fs.mkdirSync("dist", { recursive: true });
fs.writeFileSync("dist/index.html", html);
fs.writeFileSync("dist/manifest.json", JSON.stringify({
  name: "Sala Aste", short_name: "Sala Aste", start_url: ".", display: "standalone",
  background_color: "#F7E9EC", theme_color: "#F7E9EC", icons: []
}, null, 2));
console.log("index.html", (html.length / 1024).toFixed(0) + " kb, versione " + versione);
