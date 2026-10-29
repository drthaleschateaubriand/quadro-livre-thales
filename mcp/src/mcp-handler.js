import {
  refreshFirebaseToken, getWorkspaceMeta, readBoard, listBoards,
  saveBoard, makeNote, summarizeBoard, searchBoard
} from './firestore.js';

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
 tool('buscar_anotacoes','Busca conteúdo textual nos quadros sincronizados.',
   {termo:{...STRING,minLength:1,maxLength:160}},['termo']),
 tool('listar_documentos','Lista documentos anexados aos quadros (nome/tipo), sem revelar conteúdo dos PDFs.',
   {}),
 tool('criar_nota','Cria nota adesiva num quadro salvo. Modifica somente o quadro do usuário autenticado.',
   {quadro_id:BOARD_ID,texto:{...STRING,minLength:1,maxLength:12000},
    x:{type:'number',description:'Posição horizontal opcional no quadro'},
    y:{type:'number',description:'Posição vertical opcional no quadro'}},
   ['quadro_id','texto'],true),
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
  if(bodyText.length>65000)return json({error:'Requisição muito grande.'},413);
  let msg;try{msg=JSON.parse(bodyText)}catch{return json({jsonrpc:'2.0',id:null,error:{code:-32700,message:'JSON inválido.'}})}
  if(!msg||Array.isArray(msg)||msg.jsonrpc!=='2.0')return json({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Requisição MCP inválida.'}});
  if(msg.method==='notifications/initialized'||msg.method==='notifications/cancelled')return new Response(null,{status:202,headers:noCache});
  const response=(value)=>json({jsonrpc:'2.0',id:msg.id??null,result:value});
  if(msg.method==='initialize')return response({protocolVersion:PROTOCOL,capabilities:{tools:{listChanged:false}},
    serverInfo:{name:'quadro-livre',version:'0.1.0'},
    instructions:'Acessa exclusivamente quadros já sincronizados no Firebase; notas e documentos somente com permissão.'});
  if(msg.method==='ping')return response({});
  if(msg.method==='tools/list')return response({tools:TOOLS});
  if(msg.method==='tools/call'){
    const name=msg.params?.name,args=msg.params?.arguments||{};
    if(!TOOLS.some(x=>x.name===name))return json({jsonrpc:'2.0',id:msg.id??null,error:{code:-32601,message:'Ferramenta desconhecida.'}});
    const isWrite=['criar_nota','editar_nota'].includes(name);
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
