/* Firebase REST usando apenas o token autenticado do usuário.
   IMPORTANTE: não usar service account; Firestore Security Rules continuam aplicadas. */
const MAX_BOARD_BYTES = 750000;
const encoder = new TextEncoder();
export function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,140}$/.test(value);
}
export function decodeValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) return decodeFields(value.mapValue.fields || {});
  return null;
}
export function decodeFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]));
}
export function encodeValue(value) {
  if (value === null || value === undefined) return {nullValue: null};
  if (typeof value === 'string') return {stringValue: value};
  if (typeof value === 'boolean') return {booleanValue: value};
  if (typeof value === 'number') return Number.isInteger(value) ? {integerValue: String(value)} : {doubleValue: value};
  if (Array.isArray(value)) return {arrayValue: {values: value.map(encodeValue)}};
  if (typeof value === 'object') return {mapValue: {fields: Object.fromEntries(Object.entries(value).map(([k,v]) => [k, encodeValue(v)]))}};
  throw Error('Tipo de dado não suportado.');
}
async function fetchJSON(url, options={}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(13000)});
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) {
    const error = new Error(response.status===401||response.status===403 ? 'Acesso negado pelo Firebase.' :
      response.status===404 ? 'Arquivo ou quadro não encontrado.' :
      response.status===409||response.status===412 ? 'Este quadro foi alterado em outro dispositivo. Reabra a versão atual antes de editar novamente.' :
      'Erro na nuvem ('+response.status+').');
    error.status=response.status;
    throw error;
  }
  return data;
}
export async function refreshFirebaseToken(env, props) {
  const value = await fetchJSON('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(env.FIREBASE_API_KEY), {
    method:'POST', headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'refresh_token',refresh_token:props.firebaseRefreshToken}).toString()
  });
  if (!value.id_token || value.user_id !== props.userId) throw Error('Sessão Firebase inválida. Reconecte a conta.');
  return value.id_token;
}
export async function lookupFirebaseUser(env, idToken) {
  const data=await fetchJSON('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key='+encodeURIComponent(env.FIREBASE_API_KEY), {
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({idToken})
  });
  const user=data.users?.[0];
  if (!user?.localId) throw Error('Conta Firebase inválida.');
  return {userId:user.localId,email:user.email};
}
export async function validateFirebasePair(env,idToken,refreshToken) {
  const idUser=await lookupFirebaseUser(env,idToken);
  const renewed=await refreshFirebaseToken(env,{userId:idUser.userId,firebaseRefreshToken:refreshToken});
  const refreshUser=await lookupFirebaseUser(env,renewed);
  if(refreshUser.userId!==idUser.userId)throw Error('Credenciais Firebase inconsistentes.');
  return idUser;
}
function documentsBase(env,userId) {
  if (!/^[a-zA-Z0-9_-]{1,140}$/.test(env.FIREBASE_PROJECT_ID || ''))throw Error('Projeto Firebase inválido.');
  if (!validId(userId))throw Error('Identidade Firebase inválida.');
  return 'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(env.FIREBASE_PROJECT_ID)+
    '/databases/(default)/documents/workspaces/'+encodeURIComponent(userId);
}
async function firestoreCall(env,userId,idToken,path='',options={}) {
  const base=documentsBase(env,userId);
  const url=base+path;
  return fetchJSON(url,{...options,headers:{
    authorization:'Bearer '+idToken,
    'content-type':'application/json',
    ...(options.headers||{})
  }});
}
export async function getWorkspaceMeta(env,uid,idToken) {
  try {
    const result=await firestoreCall(env,uid,idToken);
    return {data:decodeFields(result.fields),updateTime:result.updateTime};
  }catch(e){if(e.status===404)return null;throw e}
}
export async function readBoard(env,uid,idToken,boardId) {
  if(!validId(boardId)) throw Error('Identificador de quadro inválido.');
  const doc=await firestoreCall(env,uid,idToken,'/boards/'+encodeURIComponent(boardId));
  const payload=doc.fields?.payload?.stringValue;
  if(typeof payload!=='string'||encoder.encode(payload).length>MAX_BOARD_BYTES)throw Error('Formato de quadro incompatível.');
  const board=JSON.parse(payload);
  if(!board || typeof board!=='object' || !Array.isArray(board.nodes))throw Error('Quadro inválido.');
  return {id:boardId,data:board,updateTime:doc.updateTime};
}
export async function listBoards(env,uid,idToken,cap=80) {
  const docs=[];let next='';
  do {
    const params=new URLSearchParams({pageSize:String(Math.min(100,cap-docs.length))});
    if(next)params.set('pageToken',next);
    const response=await firestoreCall(env,uid,idToken,'/boards?'+params.toString());
    docs.push(...(response.documents||[]));
    next=response.nextPageToken||'';
  }while(next&&docs.length<cap);
  return docs.slice(0,cap).flatMap(doc=>{
    const id=decodeURIComponent(doc.name?.split('/').pop()||'');
    if(!validId(id))return [];
    const payload=doc.fields?.payload?.stringValue;
    if(typeof payload!=='string'||encoder.encode(payload).length>MAX_BOARD_BYTES)return [];
    try{
      const board=JSON.parse(payload);
      if(!board||!Array.isArray(board.nodes))return [];
      return [{id,data:board,updateTime:doc.updateTime}];
    }catch{return []}
  });
}
export async function saveBoard(env,uid,idToken,boardId,board,updateTime) {
  if(!validId(boardId)||!updateTime)throw Error('Quadro ou revisão inválidos.');
  const payload=JSON.stringify(board);
  if(encoder.encode(payload).length>MAX_BOARD_BYTES)throw Error('Quadro excede 750 kB; faça backup e libere espaço.');
  const params=new URLSearchParams();
  params.append('updateMask.fieldPaths','payload');
  params.append('updateMask.fieldPaths','updatedAt');
  params.set('currentDocument.updateTime',updateTime);
  return firestoreCall(env,uid,idToken,'/boards/'+encodeURIComponent(boardId)+'?'+params.toString(),{
    method:'PATCH',body:JSON.stringify({fields:{
      payload:{stringValue:payload},
      updatedAt:{timestampValue:new Date().toISOString()}
    }})
  });
}
export function makeDocument(title, text, x=90, y=80) {
  const heading=String(title||'Documento Quadro Livre').trim().slice(0,240);
  const body=String(text||'').trim().slice(0,60000);
  if(!heading||!body)throw Error('Título e conteúdo são obrigatórios.');
  const note=makeNote('## '+heading+'\n\n'+body,x,y);
  note.document=true;
  note.documentTitle=heading;
  note.w=620;
  note.h=Math.min(900,Math.max(260,Math.ceil(body.length/3.2)));
  note.color='#ffffff';
  return note;
}
export function makeNote(text,x=90,y=80) {
  const title=String(text||'').slice(0,12000);
  if(!title.trim())throw Error('Informe o texto da anotação.');
  const px=Number.isFinite(x)?Math.min(100000,Math.max(-100000,Math.round(x))):90;
  const py=Number.isFinite(y)?Math.min(100000,Math.max(-100000,Math.round(y))):80;
  return {id:crypto.randomUUID(),type:'note',x:px,y:py,w:320,h:200,
    color:'#fff1b8',text:title};
}
export function summarizeBoard(board) {
  const nodes=Array.isArray(board.nodes)?board.nodes:[];
  return {title:String(board.title||'Quadro'),nodeCount:nodes.length,
    noteCount:nodes.filter(n=>n.type==='note').length,
    fileCount:nodes.filter(n=>n.type==='file').length};
}
export function searchBoard(board,query,limit=15) {
  const q=String(query||'').trim().toLocaleLowerCase('pt-BR');
  if(!q||q.length>160)throw Error('Informe um termo de busca até 160 caracteres.');
  const hits=[];
  for(const n of board.nodes||[]) {
    const fields=[n.text,n.titleText,n.name,n.note, ...(n.items||[]).flatMap(v=>[v.label,v.detail]),
      ...(n.tree||[]).flatMap(v=>[v.label,v.detail])];
    const matches=fields.filter(t=>typeof t==='string' && t.toLocaleLowerCase('pt-BR').includes(q));
    if(matches.length)hits.push({nodeId:n.id,type:n.type,excerpt:matches[0].slice(0,360)});
    if(hits.length>=limit)break;
  }
  return hits;
}
