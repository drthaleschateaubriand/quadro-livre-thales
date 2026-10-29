import test from 'node:test';
import assert from 'node:assert/strict';
import {mcpHandler, TOOLS} from '../src/mcp-handler.js';

const base='https://quadro-livre-mcp.example.workers.dev/mcp';
function request(method,params,id=1,headers={}) {
  return new Request(base,{method:'POST',headers:{'content-type':'application/json',...headers},
    body:JSON.stringify({jsonrpc:'2.0',id,method,params})});
}
const auth={auth:{scope:['mcp:read'],audience:base,userId:'uid-123',token:'test'},
  props:{userId:'uid-123',email:'test@example.com',firebaseRefreshToken:'redacted'}};

test('inicialização MCP identifica protocolo e ferramentas',async()=>{
  const res=await mcpHandler(request('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'test',version:'1'}}),{},auth);
  const data=await res.json();
  assert.equal(res.status,200);
  assert.equal(data.result.serverInfo.name,'quadro-livre');
  assert.equal(data.result.capabilities.tools.listChanged,false);
});
test('tools/list publica nove ferramentas com esquemas JSON válidos',async()=>{
  const response=await mcpHandler(request('tools/list',{}),{},auth);
  const result=await response.json();
  assert.equal(response.status,200);
  assert.equal(result.result.tools.length,9);
  assert.equal(TOOLS.length,9);
  const names=new Set(TOOLS.map(t=>t.name));
  assert.equal(names.size,9);
  assert.ok(names.has('buscar_anotacoes'));
  assert.ok(names.has('criar_nota'));
  assert.ok(names.has('editar_nota'));
  for(const tool of TOOLS)assert.equal(tool.inputSchema.additionalProperties,false);
});
test('ferramentas de gravação exigem escopo de escrita',()=>{
  for(const name of ['criar_nota','editar_nota']){
    const tool=TOOLS.find(t=>t.name===name);
    assert.deepEqual(tool.securitySchemes[0].scopes,['mcp:read','mcp:write']);
  }
});
test('perfil usa exclusivamente identidade validada pelo provedor',async()=>{
  const res=await mcpHandler(request('tools/call',{name:'minha_conta',arguments:{}}),{},auth);
  const result=await res.json();
  assert.equal(res.status,200);
  assert.equal(result.result.structuredContent.email,'test@example.com');
  assert.equal(result.result.structuredContent.uid,'uid-123');
});
test('ferramenta desconhecida não executa operações',async()=>{
  const res=await mcpHandler(request('tools/call',{name:'execute_system',arguments:{}}),{},auth);
  assert.equal((await res.json()).error.code,-32601);
});
test('MCP recusa mensagens com JSON malformado e content type diferente',async()=>{
  const malformed=await mcpHandler(new Request(base,{method:'POST',headers:{'content-type':'application/json'},body:'invalid'}),{},auth);
  assert.equal((await malformed.json()).error.code,-32700);
  const wrong=await mcpHandler(new Request(base,{method:'POST',headers:{'content-type':'text/plain'},body:'hello'}),{},auth);
  assert.equal(wrong.status,415);
});
test('notificação MCP não gera resposta de dados',async()=>{
  const res=await mcpHandler(new Request(base,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})}),{},auth);
  assert.equal(res.status,202);
});

test('chamada de escrita sem mcp:write recebe 403 antes de acessar dados',async()=>{
 const challenge=(session,scopes)=>{
  assert.deepEqual(scopes,['mcp:read','mcp:write']);
  assert.deepEqual(session.scope,['mcp:read']);
  return new Response('insufficient_scope',{status:403,headers:{'www-authenticate':'Bearer error="insufficient_scope"'}});
 };
 const res=await mcpHandler(request('tools/call',{name:'criar_nota',arguments:{quadro_id:'root',texto:'Sem permissão'}}),{},auth,challenge);
 assert.equal(res.status,403);
 assert.match(res.headers.get('www-authenticate'),/insufficient_scope/);
});

test('a prévia visual do quadro está ligada a um recurso MCP Apps válido',async()=>{
 const preview=TOOLS.find(t=>t.name==='mostrar_quadro');
 assert.ok(preview);
 assert.equal(preview._meta.ui.resourceUri,'ui://quadro-livre/preview-v1.html');
 const listed=await mcpHandler(request('resources/list',{}),{},auth);
 const resources=(await listed.json()).result.resources;
 assert.equal(resources.length,1);
 assert.equal(resources[0].mimeType,'text/html;profile=mcp-app');
 const response=await mcpHandler(request('resources/read',{uri:preview._meta.ui.resourceUri}),{},auth);
 const content=(await response.json()).result.contents?.[0];
 assert.equal(content.mimeType,'text/html;profile=mcp-app');
 assert.match(content.text,/ui\/notifications\/tool-result/);
 assert.match(content.text,/<div id="viewport"/);
});
test('o servidor bloqueia recursos MCP Apps desconhecidos',async()=>{
 const response=await mcpHandler(request('resources/read',{uri:'ui://nao-autorizado/teste'}),{},auth);
 const body=await response.json();
 assert.equal(body.error.code,-32602);
});
