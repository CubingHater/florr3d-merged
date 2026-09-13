const fs = require("fs");
const { execSync } = require("child_process");

const log = fs.readFileSync("cloudflared.log", "utf8");

const match = log.match(/https:\/\/[a-z-]+\.trycloudflare\.com/);

if (!match) {
    console.log("Geen tunnel gevonden");
    process.exit(1);
}

const tunnel = match[0];

console.log("Tunnel gevonden:");
console.log(tunnel);

const code = `
let backend = "${tunnel}";

export default {
 async fetch(request) {
   const url = new URL(request.url);
   const target = new URL(backend);

   target.pathname = url.pathname;
   target.search = url.search;

   return fetch(new Request(target, request));
 }
}
`;

fs.writeFileSync("worker/worker.js", code);

execSync(
 "cd worker && wrangler deploy",
 {stdio:"inherit"}
);