import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeFields,encodeValue,makeNote,searchBoard,summarizeBoard,validId,readBoard,saveBoard,listBoards} from '../src/firestore.js';

test('IDs válidos e bloqueio de traversal',()=>{
  assert.equal(validId('root'),true);
  assert.equal(validId('board_abc-93'),true);
  for(const id of ['../admin','a/b','',42,'%2F','hello world'])assert.equal(validId(id),false);
});
test('Nota preserva texto, tamanho e posição finita',()=>{
  const note=makeNote('Minha nota',12.8,32);
  assert.equal(note.type,'note');
  assert.equal(note.x,13);
  assert.equal(note.y,32);
  assert.equal(note.text,'Minha nota');
  assert.match(note.id,/^[0-9a-f-]{32,36}$/);
  assert.throws(()=>makeNote(''));
});
test('Busca apenas texto e subtemas sem dados de arquivos binários',()=>{
  const board={title:'Nutrologia',nodes:[
    {id:'a',type:'note',text:'Lipedema e diagnóstico'},
    {id:'b',type:'template',tree:[{label:'Endocrinologia',detail:'Hormônios'}]},
    {id:'c',type:'file',name:'exames.pdf'}
  ]};
  assert.deepEqual(summarizeBoard(board),{title:'Nutrologia',nodeCount:3,noteCount:1,fileCount:1});
  assert.equal(searchBoard(board,'LIPedema')[0].nodeId,'a');
  assert.equal(searchBoard(board,'hormônios')[0].nodeId,'b');
  assert.equal(searchBoard(board,'inexistente').length,0);
});
test('Firestore campos tipados são codificados e decodificados',()=>{
  const object={name:'Root',count:3,folders:[{id:'root'}],ready:true};
  const fields=Object.fromEntries(Object.entries(object).map(([key,val])=>[key,encodeValue(val)]));
  assert.deepEqual(decodeFields(fields),object);
});
test('Atualização remota usa revisão de documento, não escrita cega',async()=>{
  const prev=globalThis.fetch;
  const seen=[];
  globalThis.fetch=async(input,opts)=>{
    seen.push({url:String(input),opts});
    return new Response(JSON.stringify({name:'projects/p/databases/(default)/documents/workspaces/u/boards/root'}),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
    const env={FIREBASE_PROJECT_ID:'p'};
    await saveBoard(env,'u','id-token','root',{title:'Teste',nodes:[]},'2026-10-29T22:00:00.000000Z');
    assert.ok(seen[0].url.includes('currentDocument.updateTime='));
    assert.equal(seen[0].opts.method,'PATCH');
    assert.ok(seen[0].opts.headers.authorization==='Bearer id-token');
    const body=JSON.parse(seen[0].opts.body);
    assert.equal(JSON.parse(body.fields.payload.stringValue).title,'Teste');
  }finally{globalThis.fetch=prev}
});
test('Buscar quadro retorna somente o payload autenticado e a versão',async()=>{
  const old=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({
    updateTime:'2026-10-29T20:00:00Z',
    fields:{payload:{stringValue:JSON.stringify({title:'Meu quadro',nodes:[],paths:[]})}}
  }),{status:200});
  try{
    const result=await readBoard({FIREBASE_PROJECT_ID:'p'},'me','firebase-user-token','root');
    assert.equal(result.data.title,'Meu quadro');
    assert.equal(result.updateTime,'2026-10-29T20:00:00Z');
  }finally{globalThis.fetch=old}
});
test('Listagem Firestore apresenta apenas quadros válidos',async()=>{
 const old=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({documents:[
  {name:'projects/p/databases/(default)/documents/workspaces/u/boards/root',fields:{payload:{stringValue:'{"title":"Inicial","nodes":[]}'}}},
  {name:'projects/p/databases/(default)/documents/workspaces/u/boards/evil',fields:{payload:{stringValue:'not-json'}}}
 ]}),{status:200});
 try{
  const boards=await listBoards({FIREBASE_PROJECT_ID:'p'},'u','token',20);
  assert.equal(boards.length,1);
  assert.equal(boards[0].id,'root');
 }finally{globalThis.fetch=old}
});
