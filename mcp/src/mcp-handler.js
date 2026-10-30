import {
  refreshFirebaseToken, getWorkspaceMeta, readBoard, listBoards,
  saveBoard, makeNote, makeDocument, summarizeBoard, searchBoard
} from './firestore.js';
import { BOARD_RESOURCE_URI, BOARD_WIDGET_HTML } from './board-widget.js';

const PROTOCOL='2025-06-18';
const READ_SECURITY=[{type:'oauth2',scopes:['mcp:read']}];
const WRITE_SECURITY=[{type:'oauth2',scopes:['mcp:read','mcp:write']}];
const noCache={'cache-control':'no-store','x-content-type-options':'nosniff'};
function json(data,status=200,headers={}) {
  return Response.json(data,{status,headers:{...noCache,...headers}});
}
function originFromEnv(env) {
  const url=new URL(env.MCP_ORIGIN||'');
  if(url.protocol!=='https:'||url.pathname!=='/'||url.search)throw Error('MCP_ORIGIN deve ser URL HTTPS sem caminho.');
  return url.origin;
}
function tool(name,description,properties,required=[],write=false,extra={}) {
  return {name,title:name.replace(/_/g,' '),description,
    inputSchema:{type:'object',properties,required,additionalProperties:false},
    securitySchemes:write?WRITE_SECURITY:READ_SECURITY,...extra};
}
const STRING={type:'string'};
const BOARD_ID={type:'string',description:'Identificador da pasta/quadro, por exemplo root'};
const TOOLS=[
 tool('minha_conta','Identifica a conta Firebase conectada ao Quadro Livre.',{},[],false,{'_meta':{'openai/profile':true}}),
 tool('listar_pastas','Lista a estrutura de pastas do usuário, sincronizada no Firestore.',{}),
 tool('listar_quadros','Lista os quadros salvos no Firestore, com títulos e quantidades.',{}),
 tool('ler_quadro','Lê notas e organização de um quadro existente, sem baixar anexos binários.',
   {quadro_id:BOARD_ID},['quadro_id']),
 tool('mostrar_quadro','Mostra uma prévia visual interativa de navegação com zoom de um quadro sincronizado, sem alterar os dados.',
   {quadro_id:BOARD_ID},['quadro_id'],false,{'_meta':{ui:{resourceUri:BOARD_RESOURCE_URI}}}),
 tool('buscar_anotacoes','Busca conteúdo textual nos quadros sincronizados.',
   {termo:{...STRING,minLength:1,maxLength:160}},['termo']),
 tool('listar_documentos','Lista documentos anexados aos quadros (nome/tipo), sem revelar conteúdo dos PDFs.',
   {}),
 tool('criar_documento','Cria um documento textual organizado no quadro salvo, preservando título, subtítulos e conteúdo.',
   {quadro_id:BOARD_ID,titulo:{...STRING,minLength:1,maxLength:240},conteudo:{...STRING,minLength:1,maxLength:60000},
    x:{type:'number',description:'Posição horizontal opcional no quadro'},
    y:{type:'number',description:'Posição vertical opcional no quadro'}},
   ['quadro_id','titulo','conteudo'],true),
 tool('criar_nota','Cria nota adesiva num quadro salvo. Modifica somente o quadro do usuário autenticado.',
   {quadro_id:BOARD_ID,texto:{...STRING,minLength:1,maxLength:12000},
    x:{type:'number',description:'Posição horizontal opcional no quadro'},
    y:{type:'number',description:'Posição vertical opcional no quadro'}},
   ['quadro_id','texto'],true),
 tool('adicionar_imagem','Adiciona uma imagem (por exemplo um desenho gerado no ChatGPT) ao quadro salvo, como elemento de imagem visível no Quadro Livre. Envie o arquivo em "imagem" ou um link https em "imagem_url" ou o conteúdo em "imagem_base64".',
   {quadro_id:BOARD_ID,
    imagem:{type:'object',description:'Arquivo de imagem enviado pelo ChatGPT',properties:{download_url:STRING,file_id:STRING},required:['download_url'],additionalProperties:true},
    imagem_url:{...STRING,description:'Link https direto para PNG, JPEG, GIF ou WebP'},
    imagem_base64:{...STRING,description:'Imagem em base64 ou data URL (até ~8 MB)'},
    nome:{...STRING,maxLength:200},
    largura:{type:'number',description:'Largura no quadro em pixels (padrão 420)'},
    x:{type:'number',description:'Posição horizontal opcional no quadro'},
    y:{type:'number',description:'Posição vertical opcional no quadro'}},
   ['quadro_id'],true,{'_meta':{'openai/fileParams':['imagem']}}),
 tool('editar_nota','Altera o texto de uma nota já existente, preservando os demais elementos.',
   {quadro_id:BOARD_ID,nota_id:STRING,texto:{...STRING,maxLength:12000}},
   ['quadro_id','nota_id','texto'],true)
];
function result(data) {
  return {content:[{type:'text',text:JSON.stringify(data)}],structuredContent:data};
}
function paramsOK(params,required,allowed) {
  if(!params||typeof params!=='object'||Array.isArray(params))throw Error('Parâmetros inválidos.');
  if(!Object.keys(params).every(key=>allowed.includes(key)))throw Error('Parâmetro não permitido.');
  for(const key of required) if(!(key in params))throw Error('Falta o campo: '+key);
}
const MAX_IMAGE=8*1024*1024;
async function loadImageBytes(args){
  let url=typeof args.imagem==='string'?args.imagem:(args.imagem&&typeof args.imagem.download_url==='string'?args.imagem.download_url:null);
  url=url||(typeof args.imagem_url==='string'?args.imagem_url:null);
  if(typeof args.imagem_base64==='string'&&args.imagem_base64.length>20)url=null;
  if(url&&url.startsWith('data:')){args={imagem_base64:url};url=null}
  if(url){
    let u;try{u=new URL(url)}catch{throw Error('Link de imagem inválido.')}
    if(u.protocol!=='https:')throw Error('Use um link https.');
    const r=await fetch(u.toString(),{redirect:'follow'});
    if(!r.ok)throw Error('Não foi possível baixar a imagem ('+r.status+').');
    const len=Number(r.headers.get('content-length')||0);if(len>MAX_IMAGE)throw Error('Imagem maior que 8 MB.');
    const buf=new Uint8Array(await r.arrayBuffer());if(buf.length>MAX_IMAGE)throw Error('Imagem maior que 8 MB.');
    return buf;
  }
  if(typeof args.imagem_base64==='string'){
    const raw=args.imagem_base64.replace(/^data:[^,]*,/,'').replace(/\s+/g,'');
    let bin;try{bin=atob(raw)}catch{throw Error('Base64 inválido.')}
    if(bin.length>MAX_IMAGE)throw Error('Imagem maior que 8 MB.');
    const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out;
  }
  throw Error('Envie a imagem em "imagem", "imagem_url" ou "imagem_base64".');
}
function imageInfo(b){
  const u16=(i)=>(b[i]<<8)|b[i+1],u32=(i)=>((b[i]<<24)>>>0)+(b[i+1]<<16)+(b[i+2]<<8)+b[i+3],le16=(i)=>b[i]|(b[i+1]<<8),le24=(i)=>b[i]|(b[i+1]<<8)|(b[i+2]<<16);
  if(b.length>24&&b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)return {mime:'image/png',width:u32(16),height:u32(20)};
  if(b.length>10&&b[0]===0x47&&b[1]===0x49&&b[2]===0x46)return {mime:'image/gif',width:le16(6),height:le16(8)};
  if(b.length>30&&b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50){
    const t=String.fromCharCode(b[12],b[13],b[14],b[15]);
    if(t==='VP8X')return {mime:'image/webp',width:le24(24)+1,height:le24(27)+1};
    if(t==='VP8 ')return {mime:'image/webp',width:le16(26)&0x3fff,height:le16(28)&0x3fff};
    if(t==='VP8L')return {mime:'image/webp',width:1+(((b[22]&0x3f)<<8)|b[21]),height:1+(((b[24]&0xf)<<10)|(b[23]<<2)|((b[22]&0xc0)>>6))};
    return {mime:'image/webp',width:1,height:1};
  }
  if(b.length>4&&b[0]===0xff&&b[1]===0xd8){
    let i=2;while(i+9<b.length){if(b[i]!==0xff){i++;continue}const m=b[i+1];
      if(m>=0xc0&&m<=0xcf&&![0xc4,0xc8,0xcc].includes(m))return {mime:'image/jpeg',width:u16(i+7),height:u16(i+5)};
      i+=2+u16(i+2)}
    return {mime:'image/jpeg',width:1,height:1};
  }
  throw Error('Formato não suportado. Use PNG, JPEG, GIF ou WebP.');
}
async function performTool(name,args,env,props) {
  const uid=props.userId;
  if(name==='minha_conta') return {email:props.email,uid,conectada:true};
  const idToken=await refreshFirebaseToken(env,props);
  const meta=await getWorkspaceMeta(env,uid,idToken);
  if(!meta)return {mensagem:'Nenhum quadro sincronizado no Firebase. Abra o Quadro Livre e envie seus quadros locais para a nuvem.'};
  if(name==='listar_pastas') {
    return {pasta_principal:{id:'root',nome:meta.data.name||'Meu quadro principal'},
      pastas:(Array.isArray(meta.data.folders)?meta.data.folders:[]).slice(0,200),
      ativa:meta.data.activeFolderId||'root'};
  }
  if(name==='listar_quadros'){
    return {quadros:(await listBoards(env,uid,idToken)).map(q=>({id:q.id,...summarizeBoard(q.data)}))};
  }
  if(name==='ler_quadro'){
    paramsOK(args,['quadro_id'],['quadro_id']);
    const b=await readBoard(env,uid,idToken,args.quadro_id);
    return {id:b.id,...summarizeBoard(b.data),elementos:b.data.nodes.slice(0,80).map(n=>({
      id:n.id,tipo:n.type,texto:String(n.text||n.titleText||n.name||'').slice(0,1500),
      x:n.x,y:n.y,subtopicos:(n.tree||[]).slice(0,40).map(t=>({titulo:String(t.label||'').slice(0,180),detalhe:String(t.detail||'').slice(0,500)}))
    })),totalElementos:b.data.nodes.length};
  }
  if(name==='mostrar_quadro'){
    paramsOK(args,['quadro_id'],['quadro_id']);
    const b=await readBoard(env,uid,idToken,args.quadro_id);
    return {quadro:{id:b.id,title:String(b.data.title||b.id).slice(0,120),
      nodes:b.data.nodes.slice(0,120).map(n=>({
        id:n.id,tipo:n.type,x:n.x,y:n.y,w:n.w,h:n.h,color:n.color,
        texto:String(n.text||n.titleText||n.name||'').slice(0,750)
      }))},totalElementos:b.data.nodes.length,modo:'visualizacao'};
  }
  if(name==='buscar_anotacoes'){
    paramsOK(args,['termo'],['termo']);
    const term=String(args.termo).trim();
    if(!term||term.length>160)throw Error('Termo de busca inválido.');
    const found=[];
    for(const board of await listBoards(env,uid,idToken,60)){
      for(const hit of searchBoard(board.data,term,8)){
        found.push({quadro_id:board.id,quadro:board.data.title||board.id,...hit});
        if(found.length>=35)break;
      }
      if(found.length>=35)break;
    }
    return {termo:term,ocorrencias:found,limite:35};
  }
  if(name==='listar_documentos'){
    const found=[];
    for(const b of await listBoards(env,uid,idToken,70)){
      for(const n of b.data.nodes||[]) {
        if(n.type==='file')found.push({quadro_id:b.id,documento_id:n.id,
          nome:String(n.name||'Documento').slice(0,250),tipo:String(n.mime||'').slice(0,100),
          arquivo_binario_disponivel:false});
        if(found.length>=150)break;
      }
      if(found.length>=150)break;
    }
    return {documentos:found,aviso:'O conector lista metadados. PDFs, imagens e áudios precisam estar sincronizados no Cloud Storage para leitura remota.'};
  }
  if(name==='criar_documento'){
    paramsOK(args,['quadro_id','titulo','conteudo'],['quadro_id','titulo','conteudo','x','y']);
    const b=await readBoard(env,uid,idToken,args.quadro_id);
    if(b.data.nodes.length>=2000)throw Error('Limite de objetos no quadro atingido.');
    const document=makeDocument(args.titulo,args.conteudo,args.x,args.y);
    b.data.nodes.push(document);
    await saveBoard(env,uid,idToken,b.id,b.data,b.updateTime);
    return {criado:true,tipo:'documento',quadro_id:b.id,documento_id:document.id,
      titulo:document.documentTitle,mensagem:'Documento salvo no Firestore e disponível no Quadro Livre.'};
  }
  if(name==='criar_nota'){
    paramsOK(args,['quadro_id','texto'],['quadro_id','texto','x','y']);
    if(typeof args.texto!=='string'||args.texto.length>12000)throw Error('Nota inválida.');
    const b=await readBoard(env,uid,idToken,args.quadro_id);
    if(b.data.nodes.length>=2000)throw Error('Limite de objetos no quadro atingido.');
    const note=makeNote(args.texto,args.x,args.y);
    b.data.nodes.push(note);
    await saveBoard(env,uid,idToken,b.id,b.data,b.updateTime);
    return {criado:true,quadro_id:b.id,nota_id:note.id,texto:note.text,
      mensagem:'Nota salva no Firestore. Se o Quadro Livre já estiver aberto em outro aparelho, recarregue o quadro da nuvem para ver a mudança.'};
  }
  if(name==='adicionar_imagem'){
    paramsOK(args,['quadro_id'],['quadro_id','imagem','imagem_url','imagem_base64','nome','largura','x','y']);
    const bytes=await loadImageBytes(args);
    const info=imageInfo(bytes);
    if(!env.IMAGES)throw Error('Armazenamento de imagens não configurado.');
    const b=await readBoard(env,uid,idToken,args.quadro_id);
    if(b.data.nodes.length>=2000)throw Error('Limite de objetos no quadro atingido.');
    const imageId=crypto.randomUUID();
    await env.IMAGES.put('img:'+imageId,bytes,{metadata:{mime:info.mime,uid}});
    const src=originFromEnv(env)+'/img/'+imageId;
    const w=Math.round(Math.min(1400,Math.max(120,Number.isFinite(args.largura)?args.largura:420)));
    const h=Math.max(80,Math.min(1800,Math.round(w*info.height/info.width)));
    const num=(v,d)=>Number.isFinite(v)?Math.min(100000,Math.max(-100000,Math.round(v))):d;
    const node={id:crypto.randomUUID(),type:'file',x:num(args.x,120),y:num(args.y,120),w,h:h+29,
      preview:'image',src,mime:info.mime,name:String(args.nome||'Imagem do ChatGPT').slice(0,200)};
    b.data.nodes.push(node);
    await saveBoard(env,uid,idToken,b.id,b.data,b.updateTime);
    return {criado:true,tipo:'imagem',quadro_id:b.id,imagem_id:node.id,url:src,largura:info.width,altura:info.height,
      mensagem:'Imagem adicionada ao quadro. Ela aparece no Quadro Livre ao abrir/voltar para o site conectado à conta.'};
  }
  if(name==='editar_nota'){
    paramsOK(args,['quadro_id','nota_id','texto'],['quadro_id','nota_id','texto']);
    if(typeof args.texto!=='string'||args.texto.length>12000)throw Error('Texto inválido.');
    const b=await readBoard(env,uid,idToken,args.quadro_id);
    const n=b.data.nodes.find(v=>v.id===args.nota_id&&v.type==='note');
    if(!n)throw Error('Nota não encontrada.');
    n.text=args.texto;
    await saveBoard(env,uid,idToken,b.id,b.data,b.updateTime);
    return {alterado:true,quadro_id:b.id,nota_id:n.id,
      mensagem:'Alteração salva no Firebase. Recarregue a pasta no site para sincronizar a visualização.'};
  }
  throw Error('Ferramenta não reconhecida.');
}
async function mcpHandler(request,env,context,makeInsufficientScope) {
  if(request.method!=='POST')return new Response('Use POST JSON-RPC em /mcp.',{status:405,headers:noCache});
  if(!request.headers.get('content-type')?.includes('application/json'))return json({error:'Esperado JSON.'},415);
  const bodyText=await request.text();
  if(bodyText.length>12000000)return json({error:'Requisição muito grande.'},413);
  let msg;try{msg=JSON.parse(bodyText)}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'JSON inválido.'}})}
  if(!msg||Array.isArray(msg)||msg.jsonrpc!=='2.0')return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Requisição MCP inválida.'}});
  if(msg.method==='notifications/initialized'||msg.method==='notifications/cancelled')return new Response(null,{status:202,headers:noCache});
  const response=(value)=>json({jsonrpc:'2.0',id:msg.id??null,result:value});
  if(msg.method==='initialize')return response({protocolVersion:PROTOCOL,capabilities:{tools:{listChanged:false},resources:{listChanged:false}},
    serverInfo:{name:'quadro-livre',version:'0.1.0'},
    instructions:'Acessa exclusivamente quadros já sincronizados no Firebase; notas e documentos somente com permissão.'});
  if(msg.method==='ping')return response({});
  if(msg.method==='tools/list')return response({tools:TOOLS});
  if(msg.method==='resources/list')return response({resources:[{
    uri:BOARD_RESOURCE_URI,name:'Prévia do Quadro Livre',
    description:'Visualização de cartões e notas, com zoom e navegação; sem edição de documentos.',
    mimeType:'text/html;profile=mcp-app'
  }]});
  if(msg.method==='resources/read'){
    if(msg.params?.uri!==BOARD_RESOURCE_URI)return json({jsonrpc:'2.0',id:msg.id??null,error:{code:-32602,message:'Recurso não encontrado.'}});
    return response({contents:[{
      uri:BOARD_RESOURCE_URI,mimeType:'text/html;profile=mcp-app',
      text:BOARD_WIDGET_HTML,_meta:{ui:{prefersBorder:true}}
    }]});
  }
  if(msg.method==='tools/call'){
    const name=msg.params?.name,args=msg.params?.arguments||{};
    if(!TOOLS.some(x=>x.name===name))return json({jsonrpc:'2.0',id:msg.id??null,error:{code:-32601,message:'Ferramenta desconhecida.'}});
    const isWrite=['criar_documento','criar_nota','editar_nota','adicionar_imagem'].includes(name);
    const needed=isWrite?['mcp:read','mcp:write']:['mcp:read'];
    if(!needed.every(scope=>context.auth.scope.includes(scope)))return makeInsufficientScope(context.auth,needed);
    try{
      const data=await performTool(name,args,env,context.props);
      return response(result(data));
    }catch(e){
      const detail=String(e?.message||'Não foi possível acessar o quadro.');
      return response({isError:true,content:[{type:'text',text:detail.slice(0,300)}]});
    }
  }
  return json({jsonrpc:'2.0',id:msg.id??null,error:{code:-32601,message:'Método MCP desconhecido.'}});
}

export { mcpHandler, TOOLS };
