/* Quadro Livre · MindMap AI (.mma) animated presentation (experimental).
   Additive, isolated, no data uploads or modifications to the Quadro workspace. */
(function () {
  'use strict';
  const CSS = `
#ql-mmap-open{white-space:nowrap;gap:6px;align-items:center;display:inline-flex}
#ql-mmap-overlay{position:fixed;inset:0;z-index:2147483000;display:none;flex-direction:column;background:#f5f7fb;color:#202b42;font:14px system-ui,-apple-system,'Segoe UI',sans-serif}
#ql-mmap-overlay.mm-open{display:flex}
#ql-mmap-overlay *{box-sizing:border-box}
#ql-mmap-overlay .mm-header{display:flex;align-items:center;gap:12px;padding:10px 18px;background:#fff;border-bottom:1px solid #dfe5ef;flex-wrap:wrap;min-height:60px;z-index:2}
#ql-mmap-overlay .mm-brand{font-weight:800;letter-spacing:-.3px;flex:1;min-width:160px}
#ql-mmap-overlay .mm-brand small{display:block;font-weight:400;font-size:11px;color:#6c7991;margin-top:3px}
#ql-mmap-overlay button,#ql-mmap-overlay select{background:#fff;border:1px solid #d8e0ec;color:#2e3b55;border-radius:9px;padding:8px 11px;font-size:13px;cursor:pointer}
#ql-mmap-overlay button:disabled{opacity:.4;cursor:not-allowed}
#ql-mmap-overlay button.mm-primary{background:#3659b5;color:#fff;border-color:#3659b5;font-weight:700}
#ql-mmap-overlay button:focus-visible{outline:3px solid #6e8bdb;outline-offset:2px}
#ql-mmap-overlay .mm-stage{position:relative;flex:1;overflow:hidden;background-color:#f9fbff;background-image:radial-gradient(#dce3ef 1px,transparent 1px);background-size:25px 25px;min-height:160px}
#ql-mmap-overlay .mm-world{position:absolute;top:0;left:0;width:0;height:0;transform-origin:0 0;will-change:transform;transition:transform .65s cubic-bezier(.2,.72,.2,1)}
#ql-mmap-overlay .mm-links{position:absolute;top:0;left:0;overflow:visible;width:1px;height:1px;pointer-events:none}
#ql-mmap-overlay .mm-node{position:absolute;transform:translate(-50%,-50%);box-shadow:0 3px 12px rgba(36,52,83,.09);border-radius:10px;border:1.5px solid var(--mm-color,#c5d3e8);background:var(--mm-bg,#fff);color:var(--mm-ink,#2e3b50);font-weight:600;display:grid;place-items:center;text-align:center;padding:5px 10px;line-height:1.2;white-space:normal;overflow-wrap:anywhere;cursor:pointer;transition:opacity .35s,box-shadow .35s,filter .35s;user-select:none}
#ql-mmap-overlay .mm-node.mm-root{border-width:3px;font-size:18px;font-weight:800;border-radius:15px}
#ql-mmap-overlay .mm-node.mm-level1{font-size:14px;font-weight:800}
#ql-mmap-overlay .mm-node.mm-muted{opacity:.20;filter:saturate(.7)}
#ql-mmap-overlay .mm-node.mm-hidden{opacity:0;pointer-events:none}
#ql-mmap-overlay .mm-node.mm-active{box-shadow:0 0 0 4px rgba(75,106,177,.2),0 6px 24px rgba(28,50,98,.16);z-index:2}
#ql-mmap-overlay .mm-link{fill:none;stroke:#c2cede;stroke-width:2.3;transition:opacity .3s}
#ql-mmap-overlay .mm-link.mm-muted{opacity:.12}
#ql-mmap-overlay .mm-link.mm-hidden{opacity:0}
#ql-mmap-overlay .mm-footer{border-top:1px solid #dfe5ef;background:#fff;display:flex;align-items:center;gap:9px;padding:10px 16px;min-height:62px;flex-wrap:wrap;z-index:2}
#ql-mmap-overlay .mm-progress{flex:1;min-width:150px;overflow:hidden}
#ql-mmap-overlay .mm-progress strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12.5px}
#ql-mmap-overlay .mm-progress span{display:block;color:#6f7e96;font-size:11px;margin-top:3px}
#ql-mmap-overlay .mm-counter{font-variant-numeric:tabular-nums;font-size:12px;color:#66758e;white-space:nowrap}
#ql-mmap-overlay .mm-message{position:absolute;top:15px;left:50%;transform:translateX(-50%);pointer-events:none;background:rgba(255,255,255,.95);border:1px solid #cbd5e5;border-radius:7px;padding:7px 11px;font-size:12px;box-shadow:0 4px 15px #9caac022;display:none;z-index:5}
#ql-mmap-overlay .mm-message.mm-visible{display:block}
#ql-mmap-overlay .mm-shortcuts{color:#7b889b;font-size:11px}
@media(max-width:740px){#ql-mmap-open{font-size:0!important;width:37px;min-width:37px;padding:0!important;justify-content:center}#ql-mmap-open span{font-size:19px}#ql-mmap-overlay .mm-header{padding:9px;gap:5px}#ql-mmap-overlay .mm-brand{font-size:12px;min-width:110px}#ql-mmap-overlay .mm-header button{padding:6px 7px}#ql-mmap-overlay .mm-shortcuts{display:none}#ql-mmap-overlay .mm-footer{gap:5px;padding:7px}#ql-mmap-overlay .mm-footer button{padding:8px}#ql-mmap-overlay .mm-progress{order:-1;flex-basis:100%}#ql-mmap-overlay .mm-counter{margin-left:auto}}
@media(prefers-reduced-motion:reduce){#ql-mmap-overlay .mm-world,#ql-mmap-overlay .mm-node,#ql-mmap-overlay .mm-link{transition:none}}
`;
  const $ = (s,root=document)=>root.querySelector(s);
  const el = (tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;};
  const ns='http://www.w3.org/2000/svg';
  let overlay,world,stage,links,progress,counter,playButton,openButton,fileInput,titleEl,message;
  let all=[],steps=[],itemById=new Map(),activeStep=0,timer=null,interval=4000,mapTitle='',lastFileName='';
  let loadCallback=null;
  const esc=(x)=>String(x??'');
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const children=(n)=>{const c=n&&n.children;return c && typeof c==='object' ? Object.values(c).filter(Array.isArray).flat() : Array.isArray(c)?c:[]};
  function totalNodes(root){let k=0;function visit(n,d){if(++k>1800||d>20)throw Error('Mapa excessivamente grande para esta prévia.');if(typeof n.topic!=='string'||n.topic.length>400)throw Error('Nó do mapa inválido.');children(n).forEach(ch=>visit(ch,d+1))}visit(root,0);return k}
  function pickColor(s, fallback){return /^#[0-9a-fA-F]{3,8}$/.test(String(s||''))?s:fallback}
  function buildData(doc){
    const chart=(doc.charts||[]).find(c=>c.primary)||doc.charts?.[0];
    if(!chart?.root)throw Error('O arquivo não contém um mapa mental reconhecível.');
    const root=chart.root;
    totalNodes(root);
    all=[];steps=[];itemById=new Map();
    const top=children(root);
    const half=Math.ceil(top.length/2);
    function addNode(n,id,parent,depth,side,x,y,accent,bg){
      const style=n.style||{};
      const ownAccent=pickColor(style.branch_color||style.border_color,accent);
      const ownBg=pickColor(style.background_color,bg);
      const topic=esc(n.topic);
      const width=depth===0?202:depth===1?Math.max(162,Math.min(236,topic.length*9+36)):Math.max(118,Math.min(224,topic.length*7.8+26));
      const height=depth===0?56:depth===1?47:topic.length>23?48:39;
      const o={id,parent,depth,side,x,y,width,height,text:topic,accent:ownAccent,bg:ownBg,source:n,children:[]};
      all.push(o);itemById.set(id,o); if(parent)parent.children.push(o);
      return o;
    }
    const central=addNode(root,'root',null,0,1,0,0,'#45536c','#fff8e4');
    const branches=[];
    top.forEach((n,i)=>{
      const side=i<half?1:-1;
      const pos=i<half?i:i-half;
      const count=side===1?half:top.length-half;
      const yy=(pos-(count-1)/2)*165;
      const id='branch_'+i;
      const b=addNode(n,id,central,1,side,side*300,yy,pickColor(n.style?.branch_color,'#596a86'),pickColor(n.style?.background_color,'#eef3fb'));
      branches.push(b);
      const sub=children(n);
      sub.forEach((s,j)=>{
        const sy=b.y+(j-(sub.length-1)/2)*82;
        const cid=id+'_node_'+j;
        const child=addNode(s,cid,b,2,side,b.x+side*245,sy,b.accent,'#fff');
        const leaves=children(s);
        leaves.forEach((leaf,k)=>{
          const ly=child.y+(k-(leaves.length-1)/2)*46;
          const leafItem=addNode(leaf,cid+'_leaf_'+k,child,3,side,child.x+side*240,ly,b.accent,'#f8fbff');
          // Support deeper levels without dropping source data.
          function deeper(parent,source,lev){
            children(source).forEach((part,m,arr)=>{
              const offset=(m-(arr.length-1)/2)*42;
              const nested=addNode(part,parent.id+'_child_'+m,parent,lev,side,parent.x+side*210,parent.y+offset,b.accent,'#fff');
              if(lev<15)deeper(nested,part,lev+1);
            });
          }
          deeper(leafItem,leaf,4);
        });
      });
    });
    steps.push({level:0,target:central,branch:null,label:root.topic});
    branches.forEach((branch)=>{
      steps.push({level:1,target:branch,branch,label:branch.text});
      branch.children.forEach(sub=>steps.push({level:2,target:sub,branch,label:branch.text+' / '+sub.text}));
    });
    return root.topic;
  }
  function makeUI(){
    if(overlay)return;
    const style=el('style');style.textContent=CSS;document.head.append(style);
    overlay=el('div');overlay.id='ql-mmap-overlay';overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Apresentação de mapa mental');
    overlay.innerHTML=`<div class="mm-header"><div class="mm-brand"><span id="mm-title">Mapa mental animado</span><small>Quadro Livre · apresentação experimental</small></div><button type="button" id="mm-import">Importar .mma</button><button type="button" id="mm-overview">Visão geral</button><button type="button" id="mm-fullscreen">Tela cheia</button><button type="button" id="mm-close" aria-label="Fechar apresentação">Fechar ×</button></div><div class="mm-stage" id="mm-stage"><div id="mm-world" class="mm-world"><svg class="mm-links" id="mm-links"></svg></div><div class="mm-message" id="mm-message" role="status"></div></div><div class="mm-footer"><button type="button" id="mm-back">‹ Anterior</button><button type="button" class="mm-primary" id="mm-next">Próximo ›</button><button type="button" id="mm-play">▶ Automático</button><label for="mm-speed">Intervalo</label><select id="mm-speed"><option value="2500">2,5 s</option><option value="4000" selected>4 s</option><option value="6500">6,5 s</option><option value="10000">10 s</option></select><div class="mm-progress"><strong id="mm-label">Carregue um mapa</strong><span id="mm-detail">Selecione um arquivo MindMap AI (.mma)</span></div><span class="mm-counter" id="mm-counter">0/0</span><span class="mm-shortcuts">Setas: avançar/voltar · Espaço: reproduzir · Esc: sair</span></div>`;
    document.body.append(overlay);
    stage=$('#mm-stage');world=$('#mm-world');links=$('#mm-links');progress=$('#mm-label');counter=$('#mm-counter');playButton=$('#mm-play');titleEl=$('#mm-title');message=$('#mm-message');
    fileInput=el('input');fileInput.type='file';fileInput.accept='.mma,.json';fileInput.hidden=true;document.body.append(fileInput);
    $('#mm-close').onclick=close;
    $('#mm-import').onclick=()=>fileInput.click();
    $('#mm-next').onclick=()=>gotoStep(activeStep+1);
    $('#mm-back').onclick=()=>gotoStep(activeStep-1);
    $('#mm-overview').onclick=()=>gotoStep(0);
    $('#mm-play').onclick=()=>{if(timer)pause();else play()};
    $('#mm-speed').onchange=e=>{interval=Number(e.target.value);if(timer){pause();play()}};
    $('#mm-fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen?.();else overlay.requestFullscreen?.().catch(()=>{})};
    fileInput.onchange=async()=>{const file=fileInput.files?.[0];if(file)await loadFile(file);fileInput.value=''};
    window.addEventListener('resize',()=>{if(overlay.classList.contains('mm-open')&&steps.length)focus()});
    document.addEventListener('keydown',e=>{
      if(!overlay?.classList.contains('mm-open'))return;
      if(e.target instanceof HTMLInputElement||e.target instanceof HTMLSelectElement)return;
      if(e.key==='Escape'){close();return}
      if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();gotoStep(activeStep+1)}
      if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();gotoStep(activeStep-1)}
      if(e.key==='Home'){e.preventDefault();gotoStep(0)}
      if(e.key===' '){e.preventDefault();timer?pause():play()}
    });
    const actions=$('.top-actions')||$('.topbar');
    if(actions){openButton=el('button','secondary','Mapa animado');openButton.id='ql-mmap-open';openButton.type='button';openButton.title='Importar e apresentar um mapa .mma';const ico=el('span','', '◎');ico.setAttribute('aria-hidden','true');openButton.prepend(ico);openButton.onclick=()=>{open();if(!steps.length)fileInput.click()};actions.append(openButton)}
  }
  function isDescendant(item,ancestor){for(let v=item;v;v=v.parent)if(v===ancestor)return true;return false}
  function visibility(item,st){
    if(item===st.target)return 'active';
    if(item.depth===0)return st.level===0?'normal':'muted';
    if(item.depth===1){return st.level===0?'normal':item===st.branch?'normal':'muted'}
    if(st.level===0||!st.branch||!isDescendant(item,st.branch))return 'hidden';
    if(st.level===1)return item.depth===2?'normal':'hidden';
    if(item.depth===2)return item===st.target?'normal':'muted';
    if(isDescendant(item,st.target))return 'normal';
    return 'hidden';
  }
  function draw(){
    world.querySelectorAll('.mm-node').forEach(n=>n.remove());links.replaceChildren();
    all.forEach(item=>{
      const node=el('button','mm-node'+(item.depth===0?' mm-root':item.depth===1?' mm-level1':''),item.text);
      node.type='button';node.style.left=item.x+'px';node.style.top=item.y+'px';node.style.width=item.width+'px';node.style.height=item.height+'px';node.style.setProperty('--mm-color',item.accent);node.style.setProperty('--mm-bg',item.bg);node.style.setProperty('--mm-ink',item.depth<2?item.accent:'#263750');node.dataset.itemId=item.id;
      node.title=item.text;node.onclick=()=>{const i=steps.findIndex(s=>s.target===item);if(i>=0)gotoStep(i);else if(item.parent){const j=steps.findIndex(s=>s.target===item.parent);if(j>=0)gotoStep(j)}};
      world.append(node);item.element=node;
      if(item.parent){const p=item.parent;const dx=item.x-p.x;const d=`M ${p.x} ${p.y} C ${p.x+dx*.56} ${p.y}, ${item.x-dx*.43} ${item.y}, ${item.x} ${item.y}`;const link=document.createElementNS(ns,'path');link.setAttribute('d',d);link.setAttribute('class','mm-link');link.style.stroke=item.accent;links.append(link);item.link=link}
    });
  }
  function showMessage(t){message.textContent=t;message.classList.add('mm-visible');}
  function bounds(items){
    const b={x1:Infinity,y1:Infinity,x2:-Infinity,y2:-Infinity};
    items.forEach(n=>{b.x1=Math.min(b.x1,n.x-n.width/2);b.x2=Math.max(b.x2,n.x+n.width/2);b.y1=Math.min(b.y1,n.y-n.height/2);b.y2=Math.max(b.y2,n.y+n.height/2)});return b;
  }
  function focus(){
    if(!steps.length)return;
    const st=steps[activeStep];const vis=[];
    all.forEach(item=>{const v=visibility(item,st);item.element.classList.toggle('mm-hidden',v==='hidden');item.element.classList.toggle('mm-muted',v==='muted');item.element.classList.toggle('mm-active',v==='active');if(item.link){item.link.setAttribute('class','mm-link'+(v==='hidden'?' mm-hidden':v==='muted'?' mm-muted':''))}if(v==='normal'||v==='active')vis.push(item)});
    let target=vis;
    if(st.level===2)target=[st.branch,st.target,...all.filter(n=>n!==st.target&&isDescendant(n,st.target))].filter(x=>x);
    const b=bounds(target);
    const w=Math.max(220,b.x2-b.x1+125),h=Math.max(160,b.y2-b.y1+130);
    const sw=Math.max(250,stage.clientWidth),sh=Math.max(170,stage.clientHeight);
    const zoom=clamp(Math.min(sw/w,sh/h),.13,st.level===0?1.35:st.level===1?1.45:1.65);
    const cx=(b.x1+b.x2)/2,cy=(b.y1+b.y2)/2;
    world.style.transform=`translate(${(sw/2-cx*zoom).toFixed(2)}px,${(sh/2-cy*zoom).toFixed(2)}px) scale(${zoom.toFixed(4)})`;
    progress.textContent=st.label;
    $('#mm-detail').textContent=st.level===0?'Panorama dos '+(all[0]?.children.length||0)+' ramos':st.level===1?'Abrindo os subtópicos deste ramo':'Destacando os conceitos e as palavras-chave';
    counter.textContent=(activeStep+1)+' / '+steps.length;
    $('#mm-back').disabled=activeStep===0;$('#mm-next').disabled=activeStep===steps.length-1;
    message.classList.remove('mm-visible');
  }
  function gotoStep(idx){if(!steps.length)return;activeStep=clamp(idx,0,steps.length-1);focus();if(timer&&activeStep===steps.length-1)pause()}
  function pause(){if(timer)clearInterval(timer);timer=null;if(playButton)playButton.textContent='▶ Automático'}
  function play(){if(!steps.length)return;if(activeStep===steps.length-1)gotoStep(0);pause();playButton.textContent='❚❚ Pausar';timer=setInterval(()=>gotoStep(activeStep+1),interval)}
  function open(){makeUI();overlay.classList.add('mm-open');document.body.style.setProperty('--mm-overlay-open','1');if(steps.length)requestAnimationFrame(focus);}
  function close(){pause();if(document.fullscreenElement===overlay)document.exitFullscreen?.();overlay?.classList.remove('mm-open')}
  async function extractMMA(file){
    if(file.size>12*1024*1024)throw Error('Arquivo acima do limite de 12 MB para este teste.');
    const buffer=await file.arrayBuffer();
    if(file.name.toLowerCase().endsWith('.json'))return JSON.parse(new TextDecoder().decode(buffer));
    if(window.JSZip){const z=await window.JSZip.loadAsync(buffer);const content=z.file('canvas.json');if(!content)throw Error('Arquivo MMA sem canvas.json');return JSON.parse(await content.async('string'))}
    // ZIP central directory fallback when the CDN copy of JSZip is unavailable.
    const v=new DataView(buffer);let eocd=-1;
    for(let i=buffer.byteLength-22;i>=Math.max(0,buffer.byteLength-65557);i--){if(v.getUint32(i,true)===0x06054b50){eocd=i;break}}
    if(eocd<0)throw Error('Arquivo MMA não é um ZIP válido.');
    let ptr=v.getUint32(eocd+16,true),num=v.getUint16(eocd+10,true);
    for(let n=0;n<num;n++){
      if(v.getUint32(ptr,true)!==0x02014b50)throw Error('Arquivo MMA danificado.');
      const method=v.getUint16(ptr+10,true),size=v.getUint32(ptr+20,true),fnlen=v.getUint16(ptr+28,true),exlen=v.getUint16(ptr+30,true),coLen=v.getUint16(ptr+32,true),local=v.getUint32(ptr+42,true);
      const filename=new TextDecoder().decode(new Uint8Array(buffer,ptr+46,fnlen));
      if(filename==='canvas.json'){
        if(v.getUint32(local,true)!==0x04034b50)throw Error('Arquivo MMA danificado.');
        const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
        let raw=buffer.slice(start,start+size);
        if(method===8){if(!('DecompressionStream' in window))throw Error('O navegador não suporta a descompactação deste mapa.');const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));raw=await new Response(stream).arrayBuffer()}
        else if(method!==0)throw Error('Compactação MMA não suportada.');
        return JSON.parse(new TextDecoder().decode(raw));
      }
      ptr+=46+fnlen+exlen+coLen;
    }
    throw Error('Este MMA não contém canvas.json.');
  }
  function loadData(doc,name='Mapa importado'){
    makeUI();pause();mapTitle=buildData(doc)||name;lastFileName=name;titleEl.textContent=mapTitle;draw();activeStep=0;open();focus();return {title:mapTitle,nodes:all.length,steps:steps.length,branches:all[0].children.length};
  }
  async function loadFile(file){try{const doc=await extractMMA(file);return loadData(doc,file.name)}catch(e){open();showMessage('Não foi possível importar: '+(e?.message||e));return null}}
  const API={open,close,loadData,loadFile,next:()=>gotoStep(activeStep+1),previous:()=>gotoStep(activeStep-1),overview:()=>gotoStep(0),getStatus:()=>({title:mapTitle,nodes:all.length,steps:steps.length,activeStep:activeStep+1,filename:lastFileName})};
  window.QuadroMindmapPresenter=API;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',makeUI,{once:true});else makeUI();
})();
