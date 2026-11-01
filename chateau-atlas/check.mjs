// Verificação estática do Chateau Atlas. Execute: node chateau-atlas/check.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "index.html"), "utf8");
const documentScript = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "documents.js"), "utf8");
new vm.Script(documentScript, {filename:"chateau-atlas/documents.js"});
assert.match(html, /<script src="\.\/documents\.js"><\/script>/, "Biblioteca de documentos precisa ser carregada");
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
    AtlasDocuments: {create:()=>({loadLayout:async()=>{},addFile(){},showFile(){}})},
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

// Confirma que os arquivos aparecem na camada visual e não como texto base64 no draw.io.
const visualLayer={children:[],append(...children){this.children.push(...children);}};
const visualStore=new Map();
function element(tag="div"){
  return {
    tagName:tag.toUpperCase(),style:{},dataset:{},className:"",textContent:"",
    children:[],events:{},
    append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;},
    addEventListener(type,fn){this.events[type]=fn;},
    scrollIntoView(){},remove(){},
    get offsetWidth(){return parseInt(this.style.width)||560;},
    get offsetHeight(){return parseInt(this.style.height)||500;}
  };
}
const simulatedWindow={addEventListener(){},open(){}};
const viewerContext={
  window:simulatedWindow,
  document:{getElementById:id=>id==="documentLayer"?visualLayer:element(),createElement:element},
  localStorage:{getItem:id=>visualStore.get(id)||null,setItem:(id,val)=>visualStore.set(id,val)},
  ResizeObserver:class{observe(){}},
  Blob,URL,console,setTimeout,clearTimeout
};
new vm.Script(documentScript).runInNewContext(viewerContext);
const viewer=simulatedWindow.AtlasDocuments.create({
  getFolderId:()=>null,getToken:()=>null,notice(){},
  api:async()=>{throw Error("API não deve ser chamada para visualização local");},
  jsonApi:async()=>({files:[]}),uploadMedia:async()=>({id:"test"})
});
for(const [name,mime,tag] of [
  ["apostila.pdf","application/pdf","IFRAME"],
  ["foto.png","image/png","IMG"],
  ["aula.mp4","video/mp4","VIDEO"],
  ["gravacao.mp3","audio/mpeg","AUDIO"]
]){
  viewer.addFile({id:"file-test-"+name.replaceAll(".","-"),name,mimeType:mime,size:18},new Blob(["teste"],{type:mime}));
  const card=visualLayer.children.at(-1);
  assert.equal(card.className,"atlas-document",name+" deve entrar na área do quadro");
  assert.equal(card.children[1].children.at(0).tagName,tag,name+" deve ter visualizador no quadro");
}
viewer.addFile({id:"file-test-docx",name:"relatorio.docx",
  mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document",size:150});
assert.equal(visualLayer.children.at(-1).children[1].children.at(1).tagName,"IFRAME",
  "Word deve tentar pré-visualização do Google Drive dentro do quadro");
assert.equal(visualLayer.children.length,5,"Cinco documentos devem aparecer sobre o editor");
console.log("Chateau Atlas: 5 formatos visuais simulados e posições locais verificados.");
console.log("Chateau Atlas: " + required.length + " verificações estáticas e sintaxe JavaScript aprovadas.");
console.log("Pendente: login OAuth real, uploads, salvamento, visualização e teste em navegador.");