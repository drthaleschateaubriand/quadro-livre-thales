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
  // Mescla na cópia local objetos criados fora deste aparelho (ex.: ChatGPT/MCP) sem apagar nada local.
  const syncedKey=id=>'quadro-cloud-synced-ids:'+id;
  function loadSynced(id){try{return new Set(JSON.parse(localStorage.getItem(syncedKey(id))||'[]'))}catch{return new Set()}}
  function saveSynced(id,workspace){
    const ids=Object.values(workspace.canvases||{}).flatMap(b=>(b.nodes||[]).map(n=>n&&n.id)).filter(Boolean);
    try{localStorage.setItem(syncedKey(id),JSON.stringify(ids))}catch{}
  }
  async function fetchCloudBoards(id){
    const all=await workspaceRef(id).collection('boards').get();const canvases={};
    all.forEach(doc=>{try{const b=JSON.parse(doc.data().payload||'null');if(b&&typeof b==='object')canvases[doc.id]=b}catch{}});
    return canvases;
  }
  async function mergeRemote(id,info){
    if(!info?.exists||!info.role)return 0;
    const cloud=await fetchCloudBoards(id),local=host.getWorkspace(),synced=loadSynced(id);
    local.canvases=local.canvases||{};let added=0;
    for(const [key,board] of Object.entries(cloud)){
      const mine=local.canvases[key];
      if(!mine){local.canvases[key]=board;added+=(board.nodes||[]).length||1;
        if(Array.isArray(info.meta?.folders)&&Array.isArray(local.folders)){const f=info.meta.folders.find(x=>x&&x.id===key);if(f&&!local.folders.some(x=>x&&x.id===key))local.folders.push(f)}
        continue}
      mine.nodes=Array.isArray(mine.nodes)?mine.nodes:[];
      const have=new Set(mine.nodes.map(n=>n&&n.id));
      for(const n of board.nodes||[]){if(n&&n.id&&!have.has(n.id)&&!synced.has(n.id)){mine.nodes.push(n);added++}}
    }
    if(added){suppressLocalEvent=true;try{await host.replaceWorkspace(local)}finally{suppressLocalEvent=false}
      host.toast?.(added===1?'1 item novo da nuvem adicionado ao quadro.':added+' itens novos da nuvem adicionados ao quadro.')}
    return added;
  }
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
      const info=await access(id);
      if(info.exists&&!info.role)throw Error('Acesso ao quadro não autorizado.');
      if(info.exists&&info.role==='viewer')throw Error('Esta conta possui acesso somente de leitura.');
      if(info.exists)await mergeRemote(id,info);
      const workspace=host.getWorkspace(),boards=Object.entries(workspace.canvases||{});
      if(!boards.length||boards.length>300)throw Error('Quantidade de pastas incompatível com esta operação.');
      const payloads=boards.map(([key,val])=>[key,JSON.stringify(val)]);
      const encoder=new TextEncoder();
      for(const [key,payload] of payloads){
        if(encoder.encode(payload).length>750000)throw Error('O quadro “'+key+'” ultrapassa o limite do Firestore. Faça um backup ZIP e reduza as imagens embutidas antes de sincronizar.');
      }
      const batch=store.batch(),ref=workspaceRef(id);
      if(!info.exists){
        if(id!==user.uid)throw Error('Só o proprietário pode criar o quadro inicial.');
        batch.set(ref,{ownerUid:user.uid,name:workspace.canvases.root?.title||'Quadro Livre',
          members:{},folders:workspace.folders||[],activeFolderId:workspace.activeFolderId||'root',
          updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      }else if(id===user.uid){
        batch.update(ref,{name:workspace.canvases.root?.title||'Quadro Livre',
          folders:workspace.folders||[],activeFolderId:workspace.activeFolderId||'root',
          updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
      }
      for(const [key,payload] of payloads){
        if(!/^[A-Za-z0-9_-]{1,140}$/.test(key))throw Error('Identificador de pasta inválido para sincronizar.');
        batch.set(ref.collection('boards').doc(key),{payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()})
      }
      await batch.commit();
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
