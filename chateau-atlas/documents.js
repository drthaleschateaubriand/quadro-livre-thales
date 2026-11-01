/* Chateau Atlas - documentos visíveis sobre o editor diagrams.net.
   Arquivos permanecem privados no Google Drive; apenas posição, tamanho e ID
   são guardados em um JSON próprio. Nenhum token é salvo. */
(() => {
  "use strict";
  const LAYOUT_NAME="Posicoes do Atlas.json";
  const MAX_LOCAL_PREVIEW=30*1024*1024;
  const IMAGE_TYPES=["image/png","image/jpeg","image/gif","image/webp","image/svg+xml"];
  const AUDIO_TYPES=["audio/mpeg","audio/mp4","audio/ogg","audio/wav","audio/x-wav","audio/webm","audio/flac"];
  const VIDEO_TYPES=["video/mp4","video/webm","video/ogg"];
  const TEXT_TYPES=["text/plain","text/markdown","text/csv","application/json","text/xml"];
  const STORE="chateau-atlas:document-layout:v1";
  const validFileId=id=>typeof id==="string" && /^[a-zA-Z0-9_-]{5,200}$/.test(id);
  const number=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  function create({api,jsonApi,uploadMedia,getFolderId,getToken,notice}){
    const layer=document.getElementById("documentLayer");
    let layoutId=null, list=[], saveTimer=null, busy=false, layoutDirty=false;
    const objectUrls=new Map(), cards=new Map(), pending=new Map();
    const readLocal=()=>{
      try {let value=JSON.parse(localStorage.getItem(STORE)||"[]");return Array.isArray(value)?value:[];}
      catch{return [];}
    };
    const normalize=doc=>{
      if(!doc||!validFileId(doc.id))return null;
      return {id:doc.id,name:String(doc.name||"Documento").slice(0,250),
        mime:String(doc.mime||"application/octet-stream").slice(0,180),
        size:Math.max(0,number(doc.size,0)),x:Math.max(0,number(doc.x,30)),
        y:Math.max(0,number(doc.y,30)),w:Math.max(260,number(doc.w,560)),
        h:Math.max(190,number(doc.h,500))};
    };
    function persistLocal(){try{localStorage.setItem(STORE,JSON.stringify(list));}catch{}}
    function scheduleSave(){
      layoutDirty=true;persistLocal();clearTimeout(saveTimer);
      if(getToken())saveTimer=setTimeout(()=>void saveLayout(),1000);
      else notice("Posições guardadas neste navegador; conecte o Drive para sincronizar.");
    }
    async function saveLayout(){
      clearTimeout(saveTimer);
      if(!getToken()||!getFolderId()||busy||!layoutDirty)return;
      layoutDirty=false;busy=true;
      try {
        const blob=new Blob([JSON.stringify({version:1,documents:list},null,2)],{type:"application/json"});
        if(!layoutId)layoutId=(await uploadMedia(LAYOUT_NAME,"application/json",blob)).id;
        else await api("/upload/drive/v3/files/"+encodeURIComponent(layoutId)+"?uploadType=media",{
          method:"PATCH",headers:{"Content-Type":"application/json"},body:blob
        });
      }catch(e){layoutDirty=true;notice("Não foi possível salvar a posição dos documentos: "+e.message);}
      finally{busy=false;if(layoutDirty&&getToken())saveTimer=setTimeout(()=>void saveLayout(),1800);}
    }
    async function loadLayout(){
      const folder=getFolderId();
      if(!folder||!getToken())return;
      const query="'"+folder+"' in parents and name='"+LAYOUT_NAME+"' and trashed=false";
      const res=await jsonApi("/drive/v3/files?spaces=drive&fields="+encodeURIComponent("files(id,name)")+"&q="+encodeURIComponent(query));
      layoutId=res.files?.[0]?.id||null;
      let documents=readLocal();
      if(layoutId){
        try{
          const response=await api("/drive/v3/files/"+encodeURIComponent(layoutId)+"?alt=media");
          const saved=await response.json();
          if(saved.version===1&&Array.isArray(saved.documents))documents=saved.documents;
        }catch(e){notice("Não foi possível recuperar as posições do Drive: "+e.message);}
      }
      list=documents.map(normalize).filter(Boolean).slice(0,150);
      persistLocal();
      for(const file of list)mount(file);
    }
    function updateSize(card,doc){
      card.style.left=doc.x+"px";card.style.top=doc.y+"px";
      card.style.width=doc.w+"px";card.style.height=doc.h+"px";
    }
    function makeButton(label,handler){
      const b=document.createElement("button");
      b.type="button";b.textContent=label;b.addEventListener("click",handler);
      return b;
    }
    function beginMove(event,element,doc){
      if(event.button!==undefined&&event.button!==0)return;
      if(event.target.closest("button"))return;
      event.preventDefault();
      const originX=event.clientX,originY=event.clientY;
      const startX=doc.x,startY=doc.y;
      const move=e=>{
        doc.x=Math.max(0,startX+e.clientX-originX);doc.y=Math.max(0,startY+e.clientY-originY);
        updateSize(element,doc);
      };
      const stop=()=>{
        window.removeEventListener("pointermove",move);
        window.removeEventListener("pointerup",stop);
        window.removeEventListener("pointercancel",stop);
        scheduleSave();
      };
      window.addEventListener("pointermove",move);
      window.addEventListener("pointerup",stop);
      window.addEventListener("pointercancel",stop);
    }
    function mount(doc,localBlob=null){
      let card=cards.get(doc.id);
      if(card){card.style.zIndex=String(++create.z);card.scrollIntoView({block:"nearest",inline:"nearest"});return card;}
      card=document.createElement("section");
      card.className="atlas-document";card.dataset.fileId=doc.id;card.style.zIndex=String(++create.z);
      updateSize(card,doc);
      const head=document.createElement("div");head.className="atlas-document-head";
      const title=document.createElement("span");title.className="atlas-document-title";title.textContent=doc.name;title.title=doc.name;
      const body=document.createElement("div");body.className="atlas-document-body";
      head.append(title,
        makeButton("Drive",()=>window.open("https://drive.google.com/file/d/"+encodeURIComponent(doc.id)+"/view","_blank","noopener,noreferrer")),
        makeButton("Ocultar",()=>{
          card.remove();cards.delete(doc.id);
          list=list.filter(x=>x.id!==doc.id);
          const url=objectUrls.get(doc.id);if(url)URL.revokeObjectURL(url);
          objectUrls.delete(doc.id);scheduleSave();
        })
      );
      head.addEventListener("pointerdown",e=>beginMove(e,card,doc));
      card.addEventListener("pointerdown",()=>{card.style.zIndex=String(++create.z);});
      card.append(head,body);layer.append(card);cards.set(doc.id,card);
      const observer=new ResizeObserver(()=>{
        if(!cards.has(doc.id))return;
        const w=Math.round(card.offsetWidth),h=Math.round(card.offsetHeight);
        if(w!==doc.w||h!==doc.h){doc.w=w;doc.h=h;scheduleSave();}
      });
      observer.observe(card);
      void renderBody(doc,body,localBlob);
      return card;
    }
    function typeOf(doc){
      const ext=doc.name.toLowerCase().split(".").pop();
      if(doc.mime==="application/pdf"||ext==="pdf")return "pdf";
      if(IMAGE_TYPES.includes(doc.mime)||["png","jpg","jpeg","gif","webp","svg"].includes(ext))return "img";
      if(VIDEO_TYPES.includes(doc.mime)||["mp4","webm","ogv"].includes(ext))return "video";
      if(AUDIO_TYPES.includes(doc.mime)||["mp3","wav","m4a","ogg","flac"].includes(ext))return "audio";
      if(TEXT_TYPES.includes(doc.mime)||["txt","md","csv","json"].includes(ext))return "text";
      return "drive";
    }
    function useDrivePreview(doc,body){
      body.replaceChildren();
      const info=document.createElement("p");info.className="atlas-document-hint";
      info.textContent="Visualizador do Google Drive. Se não carregar, clique em Drive no cabeçalho.";
      const iframe=document.createElement("iframe");
      iframe.title="Documento: "+doc.name;iframe.loading="lazy";
      iframe.referrerPolicy="strict-origin-when-cross-origin";
      iframe.src="https://drive.google.com/file/d/"+encodeURIComponent(doc.id)+"/preview";
      body.append(info,iframe);
    }
    async function renderBody(doc,body,localBlob){
      const type=typeOf(doc);
      body.textContent="Carregando arquivo…";
      if(type==="drive"||(!localBlob&&doc.size>MAX_LOCAL_PREVIEW)){useDrivePreview(doc,body);return;}
      try{
        let blob=localBlob;
        if(!blob){
          if(!getToken()) {useDrivePreview(doc,body);return;}
          const response=await api("/drive/v3/files/"+encodeURIComponent(doc.id)+"?alt=media");
          blob=await response.blob();
        }
        if(!cards.has(doc.id))return;
        if(blob.size>MAX_LOCAL_PREVIEW){useDrivePreview(doc,body);return;}
        const url=URL.createObjectURL(blob);
        const old=objectUrls.get(doc.id);if(old)URL.revokeObjectURL(old);
        objectUrls.set(doc.id,url);
        body.replaceChildren();
        if(type==="text"){
          const pre=document.createElement("pre");pre.textContent=await blob.text();body.append(pre);
        } else {
          const tag=type==="pdf"?"iframe":type==="img"?"img":type==="video"?"video":"audio";
          const elem=document.createElement(tag);elem.src=url;
          if(tag==="iframe"){elem.title=doc.name;}
          if(tag==="audio"||tag==="video"){elem.controls=true;elem.preload="metadata";}
          if(tag==="img")elem.alt=doc.name;
          body.append(elem);
        }
      }catch(e){if(cards.has(doc.id)){useDrivePreview(doc,body);notice("Visualização local falhou; tentando o Google Drive.");}}
    }
    function addFile(file,localBlob=null){
      if(!validFileId(file?.id))throw Error("Arquivo sem ID válido no Google Drive.");
      let doc=list.find(x=>x.id===file.id);
      if(!doc){
        const count=list.length;
        doc=normalize({id:file.id,name:file.name,mime:file.mimeType||localBlob?.type,
          size:file.size||localBlob?.size||0,x:30+(count%5)*42,y:35+(count%5)*36,w:560,h:480});
        list.push(doc);scheduleSave();
      }
      mount(doc,localBlob);
      notice("Documento aberto dentro do Chateau Atlas: "+doc.name);
    }
    function showFile(file){addFile(file);}
    window.addEventListener("beforeunload",event=>{
      if(layoutDirty&&getToken()){event.preventDefault();event.returnValue="";}
    });
    return {loadLayout,addFile,showFile,saveLayout,isVisible:id=>cards.has(id)};
  }
  create.z=30;
  window.AtlasDocuments={create};
})();
