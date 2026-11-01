// Verificação estática do Chateau Atlas. Execute: node chateau-atlas/check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.html"), "utf8");
const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .map(match => match[1].trim()).filter(Boolean);
assert.equal(inlineScripts.length, 1, "Exatamente um script local para facilitar auditoria");
new vm.Script(inlineScripts[0], { filename: "chateau-atlas/index.html" });

const required = [
  ["identidade Chateau Atlas", /CHATEAU ATLAS/],
  ["editor oficial", /https:\/\/embed\.diagrams\.net\/\?embed=1/],
  ["mensagens restritas à origem", /event\.origin !== EDITOR_ORIGIN/],
  ["login Google de escopo mínimo", /https:\/\/www\.googleapis\.com\/auth\/drive\.file/],
  ["upload retomável", /uploadType=resumable/],
  ["salvamento XML", /format:"xml"/],
  ["cartões de documentos", /function addCard\(file\)/],
  ["visualizador de PDF", /mime==="application\/pdf"/],
  ["visualizador de mídia", /function previewFile\(file\)/],
  ["limpeza de URLs temporárias", /URL\.revokeObjectURL/],
  ["aviso de alterações pendentes", /beforeunload/]
];
for (const [description, pattern] of required) {
  assert.match(html, pattern, "Falhou: " + description);
}
assert.doesNotMatch(html, /AIza[0-9A-Za-z_-]{35}/, "Não incluir API keys no Chateau Atlas");
assert.doesNotMatch(html, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, "Não incluir chaves privadas");
assert.doesNotMatch(html, /localStorage\.setItem\([^,]*token/i, "Não guardar token OAuth em localStorage");

console.log("Chateau Atlas: " + required.length + " verificações estáticas e sintaxe JavaScript aprovadas.");
console.log("Pendente: login OAuth real, uploads, salvamento, visualização e teste em navegador.");