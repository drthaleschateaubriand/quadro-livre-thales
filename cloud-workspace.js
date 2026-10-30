/* Sincronização EXPLÍCITA entre quadros locais e Firestore do próprio usuário.
   Mantém anexos originais no IndexedDB e não ativa Cloud Storage ou cobranças. */
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const host=window.QuadroCloudHost;
  const controls=$('#cloud-workspace-controls');
  const status=$('#cloud-sync-message');
  const maxBoardBytes=750000;
  const encoding=new TextEncoder();
  let busy=false;
  const notify=(message)=>{status.textContent=message||''};
  const validId=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,140}$/.test(x);
  function context(){
    const auth=window.QuadroFirebaseAuth?.getAuth?.();
    const user=window.QuadroFirebaseAuth?.getUser?.();
    if(!auth||!user||!user.emailVerified)throw Error('Entre com sua conta Firebase e confirme o e-mail.');
    if(!window.firebase?.firestore)throw Error('Firestore não carregou neste navegador.');
    return {user,firestore:firebase.firestore()};
  }
  function updateUI(){
    const user=window.QuadroFirebaseAuth?.getUser?.();
    controls.hidden=!user||!user.emailVerified;
    if(controls.hidden)notify('');
  }
  window.addEventListener('quadro:auth-changed',updateUI);
  updateUI();
  $('#cloud-backup').onclick=()=>host.backup();
  async function cloudUpload(){
    if(busy)return;
    busy=true;notify('Validando quadros antes do envio...');
    try{
      const {user,firestore}=context(),data=host.getWorkspace();
      if(data.version!==2||!Array.isArray(data.folders)||!data.canvases?.root)throw Error('Quadro local inválido.');
      const boardEntries=Object.entries(data.canvases);
      if(boardEntries.length>300)throw Error('Há mais pastas que o limite desta sincronização.');
      const encoded=boardEntries.map(([id,board])=>{
        if(!validId(id)||!board||!Array.isArray(board.nodes))throw Error('Uma pasta está inválida.');
        const payload=JSON.stringify(board);
        if(encoding.encode(payload).length>maxBoardBytes)throw Error('A pasta '+id+' é maior que 750 kB. Faça um backup ZIP antes de reduzir o conteúdo.');
        return [id,payload];
      });
      const ref=firestore.collection('workspaces').doc(user.uid);
      const previous=await ref.get();
      if(previous.exists){
        const remote=previous.data();
        if(remote.ownerUid!==user.uid)throw Error('Acesso negado para este workspace.');
        if(!confirm('Já existem quadros na nuvem. Enviar esta cópia local pode substituir alterações feitas por outros dispositivos ou pelo ChatGPT. Deseja continuar?'))return;
      }else if(!confirm('Enviar todas as pastas, anotações e quadros deste navegador para seu Firebase? Anexos PDF/imagem não serão enviados sem Cloud Storage.'))return;
      const meta={ownerUid:user.uid,name:String(data.canvases.root.title||'Quadro Livre').slice(0,100),
        folders:data.folders,activeFolderId:data.activeFolderId||'root',
        updatedAt:firebase.firestore.FieldValue.serverTimestamp()};
      if(!previous.exists){
        await ref.set({...meta,members:{}});
      }
      const batch=firestore.batch();
      const remoteBoards=await ref.collection('boards').get();
      const keep=new Set(encoded.map(([id])=>id));
      remoteBoards.forEach(snapshot=>{if(!keep.has(snapshot.id))batch.delete(snapshot.ref)});
      batch.set(ref,meta,{merge:true});
      for(const [id,payload] of encoded)
        batch.set(ref.collection('boards').doc(id),{
          payload,updatedAt:firebase.firestore.FieldValue.serverTimestamp()
        });
      await batch.commit();
      notify('Quadros sincronizados! Entre em outro computador e escolha “Abrir quadros da nuvem”. Anexos binários continuam locais.');
    }catch(e){
      console.warn('Erro ao sincronizar quadros',e?.code||'');
      notify('Falha ao enviar: '+(e.code==='permission-denied'?'acesso negado pelas regras Firestore.':String(e.message||'erro desconhecido').slice(0,180)));
    }finally{busy=false}
  }
  async function cloudDownload(){
    if(busy)return;
    busy=true;notify('Consultando suas pastas na nuvem...');
    try{
      const {user,firestore}=context();
      const ref=firestore.collection('workspaces').doc(user.uid);
      const doc=await ref.get();
      if(!doc.exists)throw Error('Ainda não há quadros enviados para esta conta.');
      const meta=doc.data();
      if(meta.ownerUid!==user.uid)throw Error('Acesso indevido.');
      const folderIds=['root',...(Array.isArray(meta.folders)?meta.folders:[]).map(x=>x.id)]
        .filter(validId);
      const allowed=new Set(folderIds);
      const result=await ref.collection('boards').get();
      const canvases={};
      result.forEach(snapshot=>{
        if(!allowed.has(snapshot.id))return;
        const payload=snapshot.data()?.payload;
        if(typeof payload!=='string'||encoding.encode(payload).length>maxBoardBytes)return;
        try{
          const board=JSON.parse(payload);
          if(board&&Array.isArray(board.nodes))canvases[snapshot.id]=board;
        }catch{}
      });
      if(!canvases.root)throw Error('Pasta principal não encontrada na nuvem.');
      const data={version:2,folders:(Array.isArray(meta.folders)?meta.folders:[]).filter(f=>allowed.has(f.id)),
        canvases,activeFolderId:canvases[meta.activeFolderId]?meta.activeFolderId:'root'};
      if(!confirm('Substituir os quadros que estão abertos neste dispositivo pelos salvos na nuvem? O aplicativo fará uma cópia local de segurança antes de carregar. Recomendamos também baixar um backup ZIP.'))return;
      await host.restoreWorkspace(data);
      notify('Quadro carregado da nuvem. Anexos de outros dispositivos exigem Cloud Storage.');
    }catch(e){
      console.warn('Erro ao abrir quadro na nuvem',e?.code||'');
      notify('Falha ao abrir: '+(e.code==='permission-denied'?'acesso negado pelas regras Firestore.':String(e.message||'erro desconhecido').slice(0,180)));
    }finally{busy=false}
  }
  $('#cloud-upload').onclick=cloudUpload;
  $('#cloud-download').onclick=cloudDownload;
})();
