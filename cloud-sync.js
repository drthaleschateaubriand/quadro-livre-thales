/* Quadro Livre: Firebase Authentication + Firestore (projeto opcional).
   NÃO contém chaves privadas. O servidor Firebase valida cada acesso por Security Rules.
   Cloud Storage exige Blaze; arquivos locais nunca são apagados após falha de upload. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const host=window.QuadroCloudHost;
  const cfg=window.QUADRO_FIREBASE_CONFIG;
  const panel=$('#cloud-dialog'),error=$('#cloud-error'),gate=$('#cloud-gate');
  const toggle=$('#cloud-toggle');
  const show=(id,visible)=>{$(id).hidden=!visible};
  const status=(text)=>{$('#cloud-status').textContent=text};
  const report=(message)=>{
    error.textContent=message||'';
    error.hidden=!message;
    if(message)console.warn('[Quadro Livre Firebase]',message);
  };
  const friendly=err=>{
    const code=String(err?.code||'');
    if(code.startsWith('auth/')) {
      if(code==='auth/invalid-credential'||code==='auth/wrong-password')return 'E-mail ou senha incorretos.';
      if(code==='auth/email-already-in-use')return 'Já existe uma conta para este e-mail.';
      if(code==='auth/weak-password')return 'Escolha uma senha mais forte.';
      if(code==='auth/too-many-requests')return 'Muitas tentativas. Tente novamente mais tarde.';
      return 'Falha na autenticação. Verifique os dados e tente novamente.';
    }
    if(code==='permission-denied')return 'Permissão negada pelas regras do Firebase. Confirme o convite e o e-mail verificado.';
    if(code.includes('quota')||code.includes('unauthorized')||code.includes('unknown'))return 'A nuvem não autorizou a operação. Confira as regras e o plano do projeto.';
    return err?.message||'Ocorreu uma falha. Os dados locais foram preservados.';
  };
  let auth=null,store=null,storage=null,user=null,cloudWorkspaceId=null,cloudEnabled=false;
  let activeRole=null,autoSync=false,suppressLocalEvent=false,syncTimer=null,busy=false,pendingSync=false,metaCache=null;
  let emailVerified=false;
  function showDialog(){report('');if(!panel.open)panel.showModal()}
  toggle.addEventListener('click',showDialog);
  $('#cloud-close').addEventListener('click',()=>panel.close());
  $('#cloud-gate-login').addEventListener('click',showDialog);
  const normalizeEmail=x=>String(x||'').trim().toLowerCase();
  function updateAuthUI(){
    const configured=cloudEnabled;
    show('#cloud-unconfigured',!configured);
    show('#cloud-signed-out',configured&&!user);
    show('#cloud-verification',configured&&!!user&&!emailVerified);
    show('#cloud-signed-in',configured&&!!user&&emailVerified);
    if(configured){
      // Bloqueia a visualização na interface enquanto a sessão está ausente/não verificada.
      gate.hidden=!!user&&emailVerified;
      document.body.classList.toggle('cloud-login-required',!user||!emailVerified);
    }else{gate.hidden=true;document.body.classList.remove('cloud-login-required')}
    if(user){
      $('#cloud-user-email').textContent=user.email||'Conta conectada';
      if(emailVerified&&cloudWorkspaceId)status('Quadro '+cloudWorkspaceId+(activeRole==='viewer'?' · somente leitura':' · sincronização disponível'));
      else if(emailVerified)status('Conta conectada. Escolha o quadro a abrir.');
    }
    $('#cloud-owner-controls').hidden=!user||!emailVerified||cloudWorkspaceId!==user?.uid;
    $('#cloud-sync-attachments').disabled=!storage||!autoSync||activeRole==='viewer';
    $('#cloud-save-now').disabled=!autoSync||activeRole==='viewer';
    if(!user||!emailVerified){autoSync=false;cloudWorkspaceId=null;activeRole=null}
  }
  function requireVerified(){
    if(!user||!emailVerified){report('É necessário entrar com e-mail verificado.');return false}
    return true;
  }
  const noConfig=!cfg||!cfg.apiKey||!cfg.authDomain||!cfg.projectId||!cfg.appId;
  if(noConfig){updateAuthUI();return;}
  if(!window.firebase?.initializeApp){report('Firebase não foi carregado. Confira a conexão e atualize a página.');return}
  try {
    const app=firebase.apps.length?firebase.app():firebase.initializeApp(cfg);
    auth=app.auth();store=app.firestore();
    if(cfg.storageBucket)storage=app.storage();
    cloudEnabled=true;
    updateAuthUI();
  }catch(e){report('Configuração Firebase inválida. '+friendly(e));return}
  $('#cloud-login-form').addEventListener('submit',async e=>{
    e.preventDefault();report('');
    const email=normalizeEmail($('#cloud-email').value),password=$('#cloud-password').value;
    try{await auth.signInWithEmailAndPassword(email,password);$('#cloud-password').value=''}catch(e){report(friendly(e))}
  });
  $('#cloud-register').addEventListener('click',async()=>{
    report('');
    const email=normalizeEmail($('#cloud-email').value),password=$('#cloud-password').value;
    if(!email||password.length<8)return report('Informe um e-mail válido e senha com pelo menos 8 caracteres.');
    if(!confirm('Criar uma conta Firebase para '+email+'?'))return;
    try{
      const account=await auth.createUserWithEmailAndPassword(email,password);
      await account.user.sendEmailVerification();
      $('#cloud-password').value='';
      report('Enviamos um link de confirmação para seu e-mail.');
    }catch(e){report(friendly(e))}
  });
  $('#cloud-reset-password').addEventListener('click',async()=>{
    report('');const email=normalizeEmail($('#cloud-email').value);
    if(!email)return report('Informe seu e-mail primeiro.');
    try{await auth.sendPasswordResetEmail(email);report('Se existir uma conta, enviaremos instruções para redefinir a senha.')}catch(e){report(friendly(e))}
  });
  $('#cloud-send-verification').addEventListener('click',async()=>{
    try{await user.sendEmailVerification();report('Mensagem de confirmação enviada.')}catch(e){report(friendly(e))}
  });
  $('#cloud-check-verification').addEventListener('click',async()=>{
    if(!user)return;
    try{await user.reload();await user.getIdToken(true);user=auth.currentUser;emailVerified=!!user?.emailVerified;
      updateAuthUI();if(!emailVerified)report('O e-mail ainda não foi verificado.')}catch(e){report(friendly(e))}
  });
  const logout=async()=>{autoSync=false;pendingSync=false;cloudWorkspaceId=null;activeRole=null;clearTimeout(syncTimer);
    window.QuadoCloudRemoteFile=null;await auth.signOut();};
  $('#cloud-signout').onclick=logout;
  $('#cloud-signout-unverified').onclick=logout;
  auth.onAuthStateChanged(async next=>{
    user=next;emailVerified=!!next?.emailVerified;
    autoSync=false;cloudWorkspaceId=null;activeRole=null;metaCache=null;
    clearTimeout(syncTimer);window.QuadoCloudRemoteFile=null;
    updateAuthUI();
    if(next&&emailVerified){
      const url=new URL(window.location.href);
      const shared=url.searchParams.get('workspace');
      if(shared&&/^[A-Za-z0-9_-]{5,128}$/.test(shared)){
        $('#cloud-share-workspace').value=shared;
        status('Convite detectado. Use “Abrir quadro compartilhado” para continuar.')
      }else autoConnect();
    }
  });
  function workspaceRef(id){return store.collection('workspaces').doc(id)}
  // Sincronização com exclusões: guarda "lápides" (IDs apagados) para que itens removidos não voltem da nuvem.
  // known = IDs presentes localmente na última reconciliação; tomb = IDs apagados (locais e vindos da nuvem).
  const knownKey=id=>'quadro-cloud-known:'+id,tombKey=id=>'quadro-cloud-tomb:'+id,legacyKey=id=>'quadro-cloud-synced-ids:'+id;
  const TOMB_CAP=5000;
  const readJSON=(k,f)=>{try{const v=JSON.parse(localStorage.getItem(k)||'null');return v??f}catch{return f}};
  function loadKnown(id){
    const k=readJSON(knownKey(id),null);
    if(k&&Array.isArray(k.nodes))return {nodes:new Set(k.nodes),boards:new Set(k.boards||[])};
    return {nodes:new Set(readJSON(legacyKey(id),[])),boards:new Set()}; // migração da versão anterior
  }
  function loadTomb(id){const t=readJSON(tombKey(id),{});return {nodes:new Set(t.nodes||[]),boards:new Set(t.boards||[])}}
  function saveTomb(id,t){const cap=s=>[...s].slice(-TOMB_CAP);
    try{localStorage.setItem(tombKey(id),JSON.stringify({nodes:cap(t.nodes),boards:cap(t.boards)}))}catch{}}
  const nodeIds=b=>(b?.nodes||[]).map(n=>n&&n.id).filter(Boolean);
  function saveSynced(id,workspace){
    const cs=Object.entries(workspace.canvases||{});
    try{localStorage.setItem(knownKey(id),JSON.stringify({nodes:cs.flatMap(([,b])=>nodeIds(b)),boards:cs.map(([k])=>k)}))}catch{}
  }
  async function fetchCloudBoards(id){
    const all=await workspaceRef(id).collection('boards').get();const canvases={},raw={};
    all.forEach(doc=>{try{const p=doc.data().payload;const b=JSON.parse(p||'null');if(b&&typeof b==='object'){canvases[doc.id]=b;raw[doc.id]=p}}catch{}});
    return {canvases,raw};
  }
  const WELCOME=[['note',/^Bem-vindo ao Quadro Livre!/],['text',/^Meu espaço de estudos$/]];
  // Reconciliação local x nuvem. Retorna {changed,added,removed,tomb,cloud}.
  async function reconcile(id,info){
    const tomb=loadTomb(id);
    if(!info?.exists||!info.role)return {changed:false,added:0,removed:0,tomb,cloud:{canvases:{},raw:{}}};
    const cloud=await fetchCloudBoards(id),local=host.getWorkspace(),known=loadKnown(id);
    local.canvases=local.canvases||{};local.folders=Array.isArray(local.folders)?local.folders:[];
    // 1) Exclusões feitas neste aparelho desde a última reconciliação.
    const localIds=new Set(Object.values(local.canvases).flatMap(nodeIds));
    for(const n of known.nodes)if(!localIds.has(n))tomb.nodes.add(n);
    for(const b of known.boards)if(b!=='root'&&!local.canvases[b])tomb.boards.add(b);
    // 2) Exclusões vindas da nuvem (outros aparelhos).
    const remoteNodeTomb=new Set(Object.values(cloud.canvases).flatMap(b=>Array.isArray(b.deletedNodeIds)?b.deletedNodeIds:[]));
    const remoteBoardTomb=new Set(Array.isArray(info.meta?.deletedBoardIds)?info.meta.deletedBoardIds:[]);
    // Itens restaurados aqui (ex.: desfazer) depois de apagados: presentes localmente, ausentes em known e com lápide.
    for(const n of localIds)if(!known.nodes.has(n)&&(tomb.nodes.has(n)||remoteNodeTomb.has(n))){tomb.nodes.delete(n);remoteNodeTomb.delete(n)}
    remoteNodeTomb.forEach(x=>tomb.nodes.add(x));remoteBoardTomb.forEach(x=>{if(x!=='root')tomb.boards.add(x)});
    let added=0,removed=0;
    for(const key of Object.keys(local.canvases)){
      if(key!=='root'&&remoteBoardTomb.has(key)){delete local.canvases[key];local.folders=local.folders.filter(f=>f?.id!==key);removed++;continue}
      const b=local.canvases[key];if(!Array.isArray(b.nodes))continue;
      const before=b.nodes.length;b.nodes=b.nodes.filter(n=>!(n&&remoteNodeTomb.has(n.id)));removed+=before-b.nodes.length;
    }
    // 3) Itens novos da nuvem (ex.: ChatGPT/MCP) que não foram apagados.
    for(const [key,board] of Object.entries(cloud.canvases)){
      if(tomb.boards.has(key))continue;
      const mine=local.canvases[key];
      if(!mine){
        const copy={...board,nodes:(board.nodes||[]).filter(n=>n&&!tomb.nodes.has(n.id))};delete copy.deletedNodeIds;
        local.canvases[key]=copy;added+=copy.nodes.length||1;
        const f=Array.isArray(info.meta?.folders)&&info.meta.folders.find(x=>x&&x.id===key);
        if(f&&!local.folders.some(x=>x&&x.id===key))local.folders.push(f);
        continue}
      mine.nodes=Array.isArray(mine.nodes)?mine.nodes:[];
      const have=new Set(mine.nodes.map(n=>n&&n.id));
      for(const n of board.nodes||[]){if(n&&n.id&&!have.has(n.id)&&!tomb.nodes.has(n.id)){mine.nodes.push(n);have.add(n.id);added++}}
    }
    // 4) Remove duplicatas idênticas da nota de boas-vindas/título padrão (mesmo tipo e mesmo texto).
    let deduped=0;const root=local.canvases.root;
    if(root&&Array.isArray(root.nodes)){
      const seen=new Set();
      root.nodes=root.nodes.filter(n=>{
        const w=n&&WELCOME.find(([t,re])=>n.type===t&&re.test(String(n.text||'').trim()));
        if(!w)return true;const sig=n.type+'|'+String(n.text||'').trim();
        if(!seen.has(sig)){seen.add(sig);return true}
        tomb.nodes.add(n.id);deduped++;return false;
      });
    }
    const changed=!!(added||removed||deduped);
    if(changed){suppressLocalEvent=true;try{await host.replaceWorkspace(local)}finally{suppressLocalEvent=false}
      if(added)host.toast?.(added===1?'1 item novo da nuvem adicionado ao quadro.':added+' itens novos da nuvem adicionados ao quadro.')}
    saveTomb(id,tomb);saveSynced(id,changed?local:host.getWorkspace());
    return {changed,added,removed:removed+deduped,tomb,cloud};
  }
  async function mergeRemote(id,info){const r=await reconcile(id,info);return r.changed}
  async function autoConnect(){
    if(!user||!emailVerified||busy||cloudWorkspaceId)return;
    busy=true;
    try{
      const info=await access(user.uid);
      if(!info.exists||!info.role)return;
      await mergeRemote(user.uid,info);
      cloudWorkspaceId=user.uid;activeRole=info.role;metaCache=info.meta;autoSync=true;
      window.QuadoCloudRemoteFile=async attachmentId=>downloadRemoteAttachment(attachmentId);
      updateAuthUI();renderMembers();status('Sincronização ativada · itens da nuvem mesclados');
    }catch(e){report(friendly(e))}
    finally{busy=false}
    queueSync();
  }
  async function pullRemote(){
    if(!user||!emailVerified||busy||!cloudWorkspaceId)return;
    busy=true;
    try{const info=await access(cloudWorkspaceId);if(await mergeRemote(cloudWorkspaceId,info))pendingSync=true}
    catch(e){console.warn('pull',e)}
    finally{busy=false;if(pendingSync&&autoSync){pendingSync=false;queueSync()}}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')cloudWorkspaceId?pullRemote():autoConnect()});
  setInterval(()=>{if(document.visibilityState==='visible')pullRemote()},60000);
  async function access(id){
    const snapshot=await workspaceRef(id).get();
    if(!snapshot.exists)return {exists:false,role:id===user.uid?'owner':null,meta:null};
    const meta=snapshot.data(),role=id===user.uid?'owner':(meta.members||{})[normalizeEmail(user.email)]||null;
    return {exists:true,role,meta};
  }
  async function loadCloud(id){
    if(!requireVerified()||busy)return;
    busy=true;report('');status('Carregando quadros...');
    try{
      const info=await access(id);
      if(!info.exists)throw Error('Não há um quadro nessa conta. Use “Enviar quadros locais” para começar.');
      if(!info.role)throw Error('Sua conta não tem permissão para abrir esse quadro.');
      const all=await workspaceRef(id).collection('boards').get();
      const canvases={};
      all.forEach(doc=>{
        const entry=doc.data();
        const board=JSON.parse(entry.payload||'null');
        if(board&&typeof board==='object')canvases[doc.id]=board;
      });
      if(!canvases.root)throw Error('A pasta principal não foi encontrada no Firestore.');
      const next={version:2,folders:Array.isArray(info.meta.folders)?info.meta.folders:[],
        canvases,activeFolderId:canvases[info.meta.activeFolderId]?info.meta.activeFolderId:'root'};
      if(!confirm('Carregar este quadro da nuvem no dispositivo? Seus quadros locais serão substituídos nesta sessão. Faça backup ZIP antes de continuar.'))return;
      // Não envia conteúdo local por acidente durante a restauração.
      suppressLocalEvent=true;await host.replaceWorkspace(next);suppressLocalEvent=false;saveSynced(id,next);
      cloudWorkspaceId=id;activeRole=info.role;metaCache=info.meta;autoSync=info.role!=='viewer';
      window.QuadoCloudRemoteFile=async attachmentId=>downloadRemoteAttachment(attachmentId);
      if(info.role==='viewer')host.setRemoteReadOnly(true);
      updateAuthUI();renderMembers();status(info.role==='viewer'?'Quadro carregado · visualização':'Quadro carregado · sincronização ativada');
      panel.close();
    }catch(e){suppressLocalEvent=false;status('Não foi possível carregar');report(friendly(e))}
    finally{busy=false}
  }
  async function uploadWorkspace(){
    if(!requireVerified()||activeRole==='viewer')return;
    if(busy){pendingSync=true;return}
    busy=true;report('');status('Enviando alterações...');
    try{
      const id=cloudWorkspaceId||user.uid;
      let info=await access(id);
      if(info.exists&&!info.role)throw Error('Acesso ao quadro não autorizado.');
      if(info.exists&&info.role==='viewer')throw Error('Esta conta possui acesso somente de leitura.');
      const ref=workspaceRef(id),isOwner=id===user.uid;
      let workspace=null;
      for(let attempt=0;;attempt++){
        const r=await reconcile(id,info);
        workspace=host.getWorkspace();const boards=Object.entries(workspace.canvases||{});
        if(!boards.length||boards.length>300)throw Error('Quantidade de pastas incompatível com esta operação.');
        const tombNodes=[...r.tomb.nodes].slice(-TOMB_CAP),tombBoards=[...r.tomb.boards].filter(b=>b!=='root').slice(-TOMB_CAP);
        const payloads=boards.map(([key,val])=>{
          const out={...val};delete out.deletedNodeIds;
          if(key==='root')out.deletedNodeIds=tombNodes; // lápides ficam no quadro principal
          return [key,JSON.stringify(out)];
        });
        const encoder=new TextEncoder();
        for(const [key,payload] of payloads){
          if(!/^[A-Za-z0-9_-]{1,140}$/.test(key))throw Error('Identificador de pasta inválido para sincronizar.');
          if(encoder.encode(payload).length>750000)throw Error('O quadro “'+key+'” ultrapassa o limite do Firestore. Faça um backup ZIP e reduza as imagens embutidas antes de sincronizar.');
        }
        const changedPayloads=payloads.filter(([key,p])=>r.cloud.raw[key]!==p);
        const staleBoards=isOwner?Object.keys(r.cloud.raw).filter(k=>k!=='root'&&!workspace.canvases[k]&&r.tomb.boards.has(k)):[];
        try{
          await store.runTransaction(async tx=>{
            // Confere se a nuvem mudou (ex.: ChatGPT/MCP gravou) desde a leitura; se mudou, reconcilia de novo.
            const refs=changedPayloads.map(([key])=>ref.collection('boards').doc(key));
            const snaps=await Promise.all(refs.map(x=>tx.get(x)));
            snaps.forEach((snap,i)=>{const key=changedPayloads[i][0];
              const now=snap.exists?snap.data().payload:undefined;if(now!==r.cloud.raw[key])throw Object.assign(Error('conflict'),{code:'sync-conflict'})});
            if(!info.exists){
              if(!isOwner)throw Error('Só o proprietário pode criar o quadro inicial.');
              tx.set(ref,{ownerUid:user.uid,name:workspace.canvases.root?.title||'Quadro Livre',
                members:{},folders:workspace.folders||[],activeFolderId:workspace.activeFolderId||'root',deletedBoardIds:tombBoards,
                updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
            }else if(isOwner){
              tx.update(ref,{name:workspace.canvases.root?.title||'Quadro Livre',
                folders:workspace.folders||[],activeFolderId:workspace.activeFolderId||'root',deletedBoardIds:tombBoards,
                updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
            }
            changedPayloads.forEach(([,payload],i)=>tx.set(refs[i],{payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()}));
            staleBoards.forEach(k=>tx.delete(ref.collection('boards').doc(k)));
          });
          break;
        }catch(e){
          if(e?.code!=='sync-conflict'||attempt>=3)throw e;
          info=await access(id);
        }
      }
      saveSynced(id,workspace);
      cloudWorkspaceId=id;activeRole=info.role||'owner';autoSync=true;
      const fresh=await access(id);metaCache=fresh.meta;
      updateAuthUI();renderMembers();status('Sincronizado: '+new Date().toLocaleTimeString('pt-BR'));
    }catch(e){status('Não sincronizado; dados locais preservados');report(friendly(e))}
    finally{busy=false;if(pendingSync&&autoSync){pendingSync=false;queueSync()}}
  }
  function queueSync(){
    if(!autoSync||activeRole==='viewer'||suppressLocalEvent)return;
    if(busy){pendingSync=true;return}
    clearTimeout(syncTimer);syncTimer=setTimeout(()=>{if(!busy)uploadWorkspace();},3500)
  }
  window.addEventListener('quadro:local-saved',queueSync);
  $('#cloud-load-mine').onclick=()=>loadCloud(user.uid);
  $('#cloud-open-shared').onclick=()=>{
    const id=$('#cloud-share-workspace').value.trim();
    if(!/^[A-Za-z0-9_-]{5,128}$/.test(id))return report('ID do quadro inválido. Peça o link ao proprietário.');
    loadCloud(id);
  };
  $('#cloud-upload-local').onclick=()=>{
    if(!requireVerified())return;
    if(cloudWorkspaceId&&cloudWorkspaceId!==user.uid)return report('Para enviar seu quadro pessoal, entre em sua própria área primeiro.');
    if(!confirm('Enviar todas as pastas e anotações locais para sua nuvem? Os arquivos binários precisarão ser enviados separadamente. Se já existir uma cópia na nuvem, ela será atualizada.'))return;
    cloudWorkspaceId=user.uid;activeRole='owner';uploadWorkspace()
  };
  $('#cloud-save-now').onclick=uploadWorkspace;
  $('#cloud-download-backup').onclick=()=>host.exportBackup();
  function renderMembers(){
    const owner=user&&cloudWorkspaceId===user.uid;
    $('#cloud-owner-controls').hidden=!owner;
    const list=$('#cloud-member-list');list.replaceChildren();
    if(!owner)return;
    const members=metaCache?.members||{};
    for(const [email,role] of Object.entries(members)){
      const div=document.createElement('div');div.className='member';
      const name=document.createElement('span');name.textContent=email+' · '+(role==='editor'?'Pode editar':'Somente visualizar');
      const del=document.createElement('button');del.type='button';del.textContent='Revogar';del.onclick=async()=>{
        if(!confirm('Remover acesso de '+email+'?'))return;
        const next={...members};delete next[email];
        try{await workspaceRef(user.uid).update({members:next});metaCache.members=next;renderMembers();status('Acesso revogado.')}catch(e){report(friendly(e))}
      };
      div.append(name,del);list.append(div)
    }
  }
  $('#cloud-invite-add').onclick=async()=>{
    if(!requireVerified()||cloudWorkspaceId!==user.uid)return report('Apenas o proprietário gerencia permissões.');
    const email=normalizeEmail($('#cloud-invite-email').value),role=$('#cloud-invite-role').value;
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['editor','viewer'].includes(role))return report('Digite um e-mail válido.');
    if(email===normalizeEmail(user.email))return report('Você já é o proprietário.');
    const next={...(metaCache?.members||{}),[email]:role};
    if(Object.keys(next).length>30)return report('Limite de convites atingido.');
    try{await workspaceRef(user.uid).update({members:next});
      metaCache.members=next;renderMembers();$('#cloud-invite-email').value='';
      status('Acesso configurado. Envie à pessoa o link do quadro para que possa entrar.');
    }catch(e){report(friendly(e))}
  };
  $('#cloud-share-link').onclick=async()=>{
    if(cloudWorkspaceId!==user?.uid)return;
    const link=new URL(location.href);link.searchParams.set('workspace',user.uid);
    try{await navigator.clipboard.writeText(link.toString());status('Link copiado. Compartilhe apenas com convidados.')}
    catch{prompt('Copie o link:',link.toString())}
  };
  async function uploadAttachments(){
    if(!requireVerified()||!autoSync||activeRole==='viewer')return;
    if(!storage)return report('Não há um bucket Cloud Storage configurado neste Firebase.');
    if(busy)return;
    busy=true;status('Enviando anexos...');
    let copied=0,failed=0;
    try{
      const ws=host.getWorkspace();
      const ids=new Set(Object.values(ws.canvases||{}).flatMap(b=>
        (b.nodes||[]).flatMap(n=>[n.attachmentId,...(n.tree||[]).flatMap(t=>(t.blocks||[]).map(x=>x.attachmentId))])).filter(Boolean));
      for(const id of ids){
        const blob=await host.getLocalAttachment(id);
        if(!blob)continue;
        if(blob.size>25*1024*1024){failed++;continue}
        const ref=storage.ref('workspaces/'+cloudWorkspaceId+'/attachments/'+id);
        try{await ref.put(blob,{contentType:blob.type||'application/octet-stream'});copied++}
        catch(e){failed++;console.warn('Cloud Storage upload failed',e);break}
      }
      status('Anexos enviados: '+copied+'. Falhas/limite: '+failed+'.');
      if(failed)report('Alguns arquivos não puderam ser enviados. Cloud Storage requer o plano Blaze com faturamento; os arquivos locais foram preservados.')
    }catch(e){report(friendly(e))}
    finally{busy=false}
  }
  $('#cloud-sync-attachments').onclick=uploadAttachments;
  async function downloadRemoteAttachment(id){
    if(!cloudWorkspaceId||!storage)return null;
    if(!/^[A-Za-z0-9_-]{1,120}$/.test(id))return null;
    try{
      const uri=await storage.ref('workspaces/'+cloudWorkspaceId+'/attachments/'+id).getDownloadURL();
      const response=await fetch(uri);if(!response.ok)throw Error('Falha no download.');
      const blob=await response.blob();await host.storeAttachment(id,blob);return blob;
    }catch(e){console.warn('Anexo não disponível na nuvem',e);return null}
  }
})();
