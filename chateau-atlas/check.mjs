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

// Simula o protocolo básico do editor em um ambiente isolado, sem credenciais Google.
const nodes = new Map();
const messages = [];
const draft = new Map();
const windows = new Map();
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    id, hidden: false, textContent: "", attributes: {},
    handlers: new Map(),
    addEventListener(type, fn) { this.handlers.set(type, fn); },
    setAttribute(key, value) { this.attributes[key] = value; },
    replaceChildren() {}
  });
  return nodes.get(id);
}
const frame = node("editor");
frame.contentWindow = {
  postMessage(payload, origin) { messages.push({ ...JSON.parse(payload), origin }); }
};
const sandbox = {
  document: { getElementById: node },
  window: {
    addEventListener(type, fn) { windows.set(type, fn); },
    open() {}
  },
  localStorage: {
    getItem(key) { return draft.get(key) ?? null; },
    setItem(key, val) { draft.set(key, val); },
    removeItem(key) { draft.delete(key); }
  },
  console, setTimeout, clearTimeout, Blob, URL, Headers,
};
new vm.Script(inlineScripts[0]).runInNewContext(sandbox);
function editorEvent(msg, origin = "https://embed.diagrams.net") {
  windows.get("message")({
    origin, source: frame.contentWindow, data: JSON.stringify(msg)
  });
}
editorEvent({ event: "init" });
assert.equal(messages.at(-1).action, "load", "Editor deve receber load ao iniciar");
assert.equal(messages.at(-1).autosave, 1, "Autosave do editor deve estar ativo");

const original = draft.get("chateau-atlas:rascunho");
editorEvent({ event: "autosave", xml: '<mxGraphModel id="teste"/>' }, "https://origem-nao-autorizada.example");
assert.equal(draft.get("chateau-atlas:rascunho"), original, "Mensagens externas devem ser ignoradas");
editorEvent({ event: "autosave", xml: '<mxGraphModel id="teste"/>' });
assert.equal(draft.get("chateau-atlas:rascunho"), '<mxGraphModel id="teste"/>', "Editor deve salvar rascunho local");

node("save").handlers.get("click")();
assert.equal(messages.at(-1).action, "export", "Salvar deve pedir XML atual ao editor");
assert.equal(messages.at(-1).format, "xml", "Exportação para salvar precisa ser XML");
console.log("Chateau Atlas: protocolo do editor, isolamento de origem e rascunho local aprovados.");

console.log("Chateau Atlas: " + required.length + " verificações estáticas e sintaxe JavaScript aprovadas.");
console.log("Pendente: login OAuth real, uploads, salvamento, visualização e teste em navegador.");