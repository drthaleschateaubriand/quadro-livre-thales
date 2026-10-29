export const BOARD_RESOURCE_URI = 'ui://quadro-livre/preview-v1.html';
export const BOARD_WIDGET_HTML = String.raw`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Prévia do Quadro Livre</title>
<style>
:root{font-family:Inter,system-ui,-apple-system,sans-serif;color:#273953;background:#f8faff;font-size:14px}
*{box-sizing:border-box}body{margin:0}
header{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:10px 13px;border-bottom:1px solid #dce5f1;background:rgba(255,255,255,.78)}
h1{font-size:14px;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
small{color:#6b7d97;font-size:11px}.tools{display:flex;align-items:center;gap:4px}
button{border:1px solid #d9e2f0;background:#fff;color:#364e76;border-radius:9px;min-width:31px;height:31px;cursor:pointer}
button:focus-visible{outline:2px solid #637ee4}
#viewport{height:380px;max-height:60vh;position:relative;overflow:hidden;touch-action:none;cursor:grab;
background:radial-gradient(#dbe2ed 1px,transparent 1px);background-size:24px 24px}
#viewport.moving{cursor:grabbing}
#world{position:absolute;left:0;top:0;transform-origin:0 0}
.card{position:absolute;box-sizing:border-box;overflow:hidden;border:1px solid rgba(35,58,94,.18);border-radius:11px;
box-shadow:0 3px 12px #1d365317;padding:12px 14px;background:#fff}
.card .kind{font-size:10px;text-transform:uppercase;font-weight:700;color:#67809d;margin-bottom:7px}
.card .content{font-size:14px;white-space:pre-wrap;overflow-wrap:anywhere;max-height:calc(100% - 17px);overflow:hidden;line-height:1.38}
footer{padding:8px 12px;border-top:1px solid #e0e8f4;background:#fff;color:#75849a;font-size:11px}
#empty{position:absolute;inset:0;display:grid;place-items:center;color:#7f8eab;font-size:13px;text-align:center;pointer-events:none;padding:25px}
#empty[hidden]{display:none}
@media(max-width:460px){header{padding:9px}#viewport{height:310px}h1{max-width:130px}.tools button{min-width:29px}}
</style></head>
<body>
<header><div><h1 id="title">Quadro Livre</h1><small id="counter">Prévia visual</small></div>
<div class="tools"><button id="minus" aria-label="Diminuir zoom">−</button><button id="fit" title="Enquadrar" aria-label="Enquadrar">⌖</button>
<button id="plus" aria-label="Aumentar zoom">＋</button><small id="zoom">100%</small></div></header>
<div id="viewport" role="region" aria-label="Prévia do quadro; arraste para navegar" tabindex="0">
<div id="world"></div><div id="empty">Selecione um quadro para visualizar os cartões aqui.</div></div>
<footer>Visualização de notas e cartões sincronizados. Para editar um quadro completo, abra o Quadro Livre.</footer>
<script>
(() => {
 const doc=document;
 const view=doc.getElementById('viewport'),world=doc.getElementById('world'),empty=doc.getElementById('empty');
 let items=[],panX=0,panY=0,scale=1,down=null,bounds={minX:0,minY:0,maxX:400,maxY:300};
 function safeColor(v){return /^#[0-9a-f]{6}$/i.test(String(v||''))?v:'#ffffff'}
 function clamp(x,a,b){return Math.min(b,Math.max(a,x))}
 function render(){
  world.replaceChildren();empty.hidden=items.length>0;
  for(const n of items){
   const card=doc.createElement('div');card.className='card';
   card.style.left=clamp(Number(n.x)||0,-100000,100000)+'px';
   card.style.top=clamp(Number(n.y)||0,-100000,100000)+'px';
   card.style.width=clamp(Number(n.w)||260,110,1500)+'px';
   card.style.height=clamp(Number(n.h)||140,70,900)+'px';
   card.style.backgroundColor=safeColor(n.color);
   const label=doc.createElement('div');label.className='kind';label.textContent=String(n.tipo||'Nota').slice(0,45);
   const text=doc.createElement('div');text.className='content';text.textContent=String(n.texto||'').slice(0,750);
   card.append(label,text);world.append(card);
  }
  updateTransform()
 }
 function updateTransform(){world.style.transform='translate('+panX+'px,'+panY+'px) scale('+scale+')';
  doc.getElementById('zoom').textContent=Math.round(scale*100)+'%'}
 function fit(){
  const w=view.clientWidth||500,h=view.clientHeight||350;
  const bw=Math.max(1,bounds.maxX-bounds.minX),bh=Math.max(1,bounds.maxY-bounds.minY);
  scale=clamp(Math.min((w-30)/bw,(h-30)/bh),.02,2);
  panX=w/2-(bounds.minX+bw/2)*scale;panY=h/2-(bounds.minY+bh/2)*scale;
  updateTransform()
 }
 function setData(obj){
  if(!obj || !obj.quadro || !Array.isArray(obj.quadro.nodes))return;
  const q=obj.quadro;items=q.nodes.slice(0,120);
  doc.getElementById('title').textContent=String(q.title||'Quadro Livre').slice(0,120);
  doc.getElementById('counter').textContent=items.length+' objetos • somente leitura';
  if(items.length){
   bounds={
    minX:Math.min(...items.map(n=>Number(n.x)||0)),
    minY:Math.min(...items.map(n=>Number(n.y)||0)),
    maxX:Math.max(...items.map(n=>(Number(n.x)||0)+clamp(Number(n.w)||260,110,1500))),
    maxY:Math.max(...items.map(n=>(Number(n.y)||0)+clamp(Number(n.h)||140,70,900)))
   }
  }
  render();fit()
 }
 function zoomTo(next){const w=view.clientWidth/2,h=view.clientHeight/2;const delta=next/scale;
  panX=w-(w-panX)*delta;panY=h-(h-panY)*delta;scale=next;updateTransform()}
 doc.getElementById('minus').onclick=()=>zoomTo(clamp(scale/1.3,.02,4));
 doc.getElementById('plus').onclick=()=>zoomTo(clamp(scale*1.3,.02,4));
 doc.getElementById('fit').onclick=fit;
 view.addEventListener('pointerdown',e=>{if(e.button!==0)return;down={id:e.pointerId,x:e.clientX,y:e.clientY,panX,panY};view.setPointerCapture(e.pointerId);view.classList.add('moving')});
 view.addEventListener('pointermove',e=>{if(!down||down.id!==e.pointerId)return;panX=down.panX+e.clientX-down.x;panY=down.panY+e.clientY-down.y;updateTransform()});
 for(const eventName of ['pointerup','pointercancel'])view.addEventListener(eventName,e=>{if(down?.id===e.pointerId){down=null;view.classList.remove('moving')}});
 view.addEventListener('wheel',e=>{e.preventDefault();zoomTo(clamp(scale*(e.deltaY>0?1/1.1:1.1),.02,4))},{passive:false});
 let rpcId=0;
 const pending=new Map();
 function rpcNotify(method,params){window.parent.postMessage({jsonrpc:'2.0',method,params},'*')}
 function rpcRequest(method,params){return new Promise((resolve,reject)=>{const id=++rpcId;pending.set(id,{resolve,reject});
   window.parent.postMessage({jsonrpc:'2.0',id,method,params},'*')})}
 window.addEventListener('message',event=>{
  if(event.source!==window.parent||!event.data||event.data.jsonrpc!=='2.0')return;
  const m=event.data;
  if(typeof m.id==='number'){
   const p=pending.get(m.id);if(!p)return;pending.delete(m.id);if(m.error)p.reject(m.error);else p.resolve(m.result);return
  }
  if(m.method==='ui/notifications/tool-result')setData(m.params?.structuredContent);
 });
 (async()=>{try{await rpcRequest('ui/initialize',{appInfo:{name:'quadro-livre-preview',version:'0.1.0'},appCapabilities:{},protocolVersion:'2026-01-26'});
   rpcNotify('ui/notifications/initialized',{})}catch(e){console.warn('Não foi possível inicializar a prévia do Quadro Livre')}})();
})();
</script></body></html>`;
