'use strict';
// App de compradoras CreaTuSabor (ES). Sin clave: se entra directo. Desbloqueo por enlace ?p=<handles>&n=<nombre> (se suma en localStorage).
// Catalogo y precios en tienda.js. Contenido del +2000 en data/*.bin (gzip + AES; la clave comun va aqui, decision de Ibai 25-11: sin friccion).
const LANG=window.LANG||'es',T=window.I18N[LANG]||window.I18N.es,TD=window.TIENDA;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),norm=s=>String(s).toLowerCase().replace(/ł/g,'l').normalize('NFD').replace(/[̀-ͯ]/g,'');
const CATS=['Desayunos','Comidas','Cenas','Snacks','Bebidas','Sopas','Postres','Extras'],SEAS=['Primavera','Verano','Otoño','Invierno'],VIEWS=['inicio','explorar','libros','favoritos','semana','compra','guias'];
const R2000=['explorar','libros','book','guias'];
Object.assign(T.nav,{inicio:'Inicio',libros:'Colecciones +2000'});Object.assign(T.mnav,{inicio:'Inicio'});
const cn=k=>T.cat[k]||k,en=k=>T.est[k]||k;
let books,recipes,byId,lector,bookMap,view='inicio',tab='libros',page=0,query='',category='',season='',bookId=null,selectedRecipe=null,currentRead=null,storageKey,state={favorites:[],menu:{},checked:[],read:[]},renderId=0,statusTimer;
// ---- almacenamiento local ----
const ls={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};
function toast(t){const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(statusTimer);statusTimer=setTimeout(()=>e.style.display='none',3200)}
function persist(){ls.set(storageKey,JSON.stringify(state))}
// ---- productos de la compradora (enlace del correo) ----
const PROD=new Map(TD.products.map(p=>[p.h,p])),ALL=TD.products.map(p=>p.h);
let OWN=new Set(),NAME='';
function expand(hs){const o=new Set();for(const h of hs){o.add(h);(TD.alias[h]||[]).forEach(x=>o.add(x))}return o}
function initOwn(){
 const q=new URLSearchParams(location.search);let saved=[];try{saved=JSON.parse(ls.get('cts_own')||'[]')}catch(e){}
 const raw=(q.get('p')||'').split(',').map(s=>decodeURIComponent(s).trim().toLowerCase()).filter(Boolean);
 const add=raw.includes('all')?ALL:raw;
 const mine=[...new Set([...saved,...add])];if(add.length)ls.set('cts_own',JSON.stringify(mine));
 const n=(q.get('n')||'').trim().slice(0,40);if(n)ls.set('cts_name',n);NAME=ls.get('cts_name')||'';
 OWN=mine.length?expand(mine):new Set([TD.def]);
 // URL canonica: lleva todo lo comprado, para que la app instalada en el movil lo conserve
 const u=new URL(location.href);u.searchParams.delete('k');u.searchParams.delete('p');u.searchParams.delete('n');
 if(mine.length)u.search='?p='+mine.map(encodeURIComponent).join(',')+(NAME?'&n='+encodeURIComponent(NAME):'');
 history.replaceState(null,'',u.pathname+u.search+location.hash)}
const own=h=>OWN.has(h),cart=p=>TD.shop+'/cart/'+p.v+':1';
// ---- cripto ----
const b64=x=>Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const KDEF='wF26Sbj4DgPwD03FQUKrskag2WgCr3SdXaH6mydMDQg';
let KEY=null,IKEY=null;const impKey=raw=>crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
const dec=(buf,key)=>crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(buf.slice(0,12))},key,buf.slice(12));
const gunz=async b=>{const u=new Uint8Array(b);if(u[0]!==0x1f||u[1]!==0x8b)return b;return await new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()};
async function initKey(){const m=location.hash.match(/^#k=([\w-]+)/);if(m)history.replaceState(null,'',location.pathname+location.search+'#inicio');try{KEY=await impKey(b64(KDEF));return true}catch(e){return false}}
const cache={};
async function J(n){if(!cache[n]){const r=await fetch('data/'+n+'.bin');if(!r.ok)throw Error(n);cache[n]=JSON.parse(new TextDecoder().decode(await gunz(await dec(await r.arrayBuffer(),KEY))))}return cache[n]}
const blobs=new Map();
async function imgBlob(src){if(blobs.has(src))return blobs.get(src);const url=(window.ASSETS??'../')+src.replace(/\.jpg$/,'.bin');let r=self.caches?await caches.match(url).catch(()=>null):null;
 if(!r){r=await fetch(url);if(!r.ok)throw 0;if(self.caches){const c=r.clone();caches.open('rc-img').then(x=>x.put(url,c)).catch(()=>{})}}
 const u=URL.createObjectURL(new Blob([await dec(await r.arrayBuffer(),IKEY)],{type:'image/jpeg'}));blobs.set(src,u);return u}
const io='IntersectionObserver' in window?new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);imgBlob(e.target.dataset.src).then(u=>{e.target.src=u}).catch(()=>{})}}),{rootMargin:'500px'}):null;
function hydrate(root=document){root.querySelectorAll('img[data-src]:not([src])').forEach(i=>{if(!io){imgBlob(i.dataset.src).then(u=>{i.src=u});return}io.observe(i);setTimeout(()=>{if(i.getAttribute('src'))return;const r=i.getBoundingClientRect();if(r.top<innerHeight+500&&r.bottom>-500)imgBlob(i.dataset.src).then(u=>{i.src=u}).catch(()=>{})},1500)})}
// ---- plantillas ----
const cover=b=>b.cover?`<img loading="lazy" data-src="${b.cover}" alt="${esc(b.t)}">`:'<img alt="">';
function recipeCard(r){const b=bookMap.get(r.b),fav=state.favorites.includes(r.id);return `<article class="recipe-card">${r.img?`<img class="recipe-photo" decoding="async" data-src="${r.img}" alt="${esc(r.t)}" data-recipe="${r.id}">`:''}<span class="tag">${esc(cn(r.c))}${r.s&&r.s.length?' · '+esc(en(r.s[0])):''}</span><h3>${esc(r.t)}</h3><p class="source">${esc(b.t)}${r.m?' · '+r.m+' '+T.min:''}</p><div class="row"><button class="primary" data-recipe="${r.id}">${T.abrir}</button><button class="${fav?'saved':''}" data-fav="${r.id}" aria-pressed="${fav}">${fav?'♥':'♡'}</button></div></article>`}
function bookCard(b){return `<article class="book-card">${cover(b)}<div><span class="tag">${esc(cn(b.cat))}</span><h3>${esc(b.t)}</h3><p class="muted">${b.n?b.n+' '+(b.n===1?T.receta:T.recetas)+' · ':''}${b.pages} ${T.pags}</p><button data-book="${b.id}" class="primary">${b.kind==='bonos'?T.abrirBono:T.expCol}</button></div></article>`}
const heading=(t,d='')=>`<div class="section-head"><div><h2>${t}</h2>${d?'<p class="muted">'+d+'</p>':''}</div></div>`;
const buyBtn=(p,label='Desbloquear')=>`<a class="buy" href="${esc(cart(p))}" data-buy="${esc(p.h)}">🔒 ${label} · ${esc(p.p)}</a>`;
const openBtn=(o,label='Abrir')=>o.app?`<button class="primary" data-view="explorar">${label}</button>`:o.book?`<button class="primary" data-book="${o.book}">${label}</button>`:`<a class="primary btn" href="${esc(o.url)}" target="_blank" rel="noopener">${label}</a>`;
function prodCard(p){const ok=own(p.h);return `<article class="prod ${ok?'mine':'locked'}"><div class="prod-cover"><img src="${p.img}" alt="${esc(p.t)}" loading="lazy">${ok?'':'<span class="lock" aria-hidden="true">🔒</span>'}</div><div class="prod-body"><h3>${esc(p.t)}</h3><p class="muted">${esc(p.s)}</p>${ok?`<div class="row">${openBtn(p)}${(p.app||p.book)&&p.url?`<a class="btn ghost" href="${esc(p.url)}" target="_blank" rel="noopener">PDF</a>`:''}</div>`:`<p class="price"><s>${esc(p.o)}</s></p>${buyBtn(p)}`}</div></article>`}
function bonoTile(it,ok,p){const b=it.book&&bookMap.get(it.book),img=b&&b.cover?`<img loading="lazy" data-src="${b.cover}" alt="">`:`<div class="tile-ph"><span>${esc(it.t)}</span></div>`;
 return `<article class="bono ${ok?'mine':'locked'}"><div class="prod-cover">${img}${ok?'':'<span class="lock" aria-hidden="true">🔒</span>'}</div><div class="prod-body"><h3>${esc(it.t)}</h3>${ok?openBtn(it):buyBtn(p)}</div></article>`}
function inicio(){
 const mine=TD.products.filter(p=>own(p.h)),rest=TD.products.filter(p=>!own(p.h));
 const hello=`<section class="hello"><h1>Hola${NAME?', '+esc(NAME):''}</h1><p class="muted">${mine.length===1?'Tienes 1 libro':'Tienes '+mine.length+' libros'} · todo funciona sin conexión</p></section>`;
 const tabs=`<div class="tabs" role="tablist"><button role="tab" class="tabbtn ${tab==='libros'?'on':''}" data-tab="libros" aria-selected="${tab==='libros'}">📚 Mis libros</button><button role="tab" class="tabbtn ${tab==='bonos'?'on':''}" data-tab="bonos" aria-selected="${tab==='bonos'}">🎁 Bonos</button></div>`;
 let body;
 if(tab==='libros')body=`<div class="prod-grid">${mine.map(prodCard).join('')}</div>`+(rest.length?`<h2 class="sub">Amplía tu cocina</h2><div class="prod-grid">${rest.map(prodCard).join('')}</div>`:'');
 else{const gs=[...TD.bonos].sort((a,b)=>own(b.h)-own(a.h));body=gs.map(g=>{const p=PROD.get(g.h),ok=own(g.h);return `<section class="bgroup"><h2 class="sub">Bonos de ${esc(p.t)} <small>${g.items.length}</small></h2><div class="prod-grid">${g.items.map(it=>bonoTile(it,ok,p)).join('')}</div></section>`}).join('')}
 return hello+tabs+installBox()+body}
function lockedRecetario(){const p=PROD.get('2000');return `<div class="empty lockbox"><img src="${p.img}" alt=""><h2>${esc(p.t)}</h2><p>Recetas, buscador por ingrediente, menú semanal y lista de la compra.</p>${buyBtn(p)}</div>`}
function filters(){return `<div class="filters"><label><span class="filter-label">${T.fBus}</span><input id="search" type="search" value="${esc(query)}" placeholder="${esc(T.fPh)}"></label><label><span class="filter-label">${T.fCat}</span><select id="category"><option value="">${T.fCatT}</option>${CATS.map(v=>`<option value="${v}" ${category===v?'selected':''}>${esc(cn(v))}</option>`).join('')}</select></label><label><span class="filter-label">${T.fEst}</span><select id="season"><option value="">${T.fEstT}</option>${SEAS.map(v=>`<option value="${v}" ${season===v?'selected':''}>${esc(en(v))}</option>`).join('')}</select></label></div><div id="results"></div>`}
function listResults(){const q=norm(query);let list=recipes.filter(r=>(view!=='favoritos'||state.favorites.includes(r.id))&&(!bookId||r.b===bookId)&&(!category||r.c===category)&&(!season||(r.s||[]).includes(season))&&(!q||r.sx.includes(q)));const total=Math.ceil(list.length/24);page=Math.min(page,Math.max(0,total-1));
 $('#results').innerHTML=`<p class="muted">${list.length.toLocaleString(LANG)} ${list.length===1?T.receta:T.recetas}${query?' '+T.paraQ+' «'+esc(query)+'»':''}</p>${list.length?'<div class="grid">'+list.slice(page*24,(page+1)*24).map(recipeCard).join('')+'</div>':'<div class="empty">'+(view==='favoritos'?T.vacioFav:T.vacioBus)+'</div>'}${total>1?`<div class="pagination"><button data-page="-1" ${page===0?'disabled':''}>${T.ant}</button><span class="muted">${page+1} / ${total}</span><button data-page="1" ${page===total-1?'disabled':''}>${T.sig}</button></div>`:''}`;hydrate($('#results'))}
function go(v){view=v;bookId=null;page=0;query='';category='';season='';location.hash=v==='inicio'&&tab==='bonos'?'bonos':v;render();window.scrollTo({top:0,behavior:'smooth'})}
async function render(){const id=++renderId,app=$('#app');
 document.body.classList.toggle('on-inicio',view==='inicio');
 document.querySelectorAll('[data-view]').forEach(n=>n.classList.toggle('active',n.dataset.view===(view==='book'?(bookMap.get(bookId)?.kind==='recetas'?'libros':'inicio'):view)));
 $('#breadcrumb').textContent=T.bc+' / '+(T.nav[view]||T.titulo);
 if(view==='inicio'){app.innerHTML=inicio();hydrate(app);return}
 const bk=view==='book'&&bookMap.get(bookId);
 if(R2000.includes(view)&&!own('2000')&&!(bk&&bk.kind!=='recetas')){app.innerHTML=lockedRecetario();return}
 if(view==='explorar'||view==='favoritos'){app.innerHTML=heading(view==='favoritos'?T.hFav:T.hExp)+filters();listResults();return}
 if(view==='libros'||view==='guias'){const kind=view==='libros'?'recetas':view;const subset=books.filter(b=>b.kind===kind);
  app.innerHTML=heading(view==='guias'?T.hGui:T.hLib,T.hDesc)+(view==='libros'?`<div class="chips"><button class="chip ${!category?'active':''}" data-cat="">${T.todo}</button>${CATS.map(c=>`<button class="chip ${category===c?'active':''}" data-cat="${c}">${esc(cn(c))}</button>`).join('')}</div>`:'')+`<div class="grid">${subset.filter(b=>!category||b.cat===category).map(bookCard).join('')}</div>`;hydrate(app);return}
 if(view==='book'){const b=bookMap.get(bookId);if(!b)return go('inicio');const rr=recipes.filter(r=>r.b===bookId),pages=lector[bookId];
  app.innerHTML=`<button data-backbooks>${T.volver}</button><div class="book-banner">${cover(b)}<div><p class="overline">${esc(cn(b.cat))}</p><h2>${esc(b.t)}</h2><p>${b.pages} ${T.pags}${b.n?' · '+b.n+' '+(b.n===1?T.receta:T.recetas):''}</p></div></div>`+(rr.length?heading(T.recCol)+'<div class="grid">'+rr.map(recipeCard).join('')+'</div>':'')+(pages?heading(T.leer)+`<div class="pages-list">${pages.map((tx,i)=>`<button class="page-link" data-read="${b.id}:${i+1}"><span>${esc(pageTitle(tx,i))}</span><small>${state.read.includes(b.id+':'+(i+1))?'✓ · ':''}${T.pag} ${i+1}</small></button>`).join('')}</div>`:'');hydrate(app);return}
 if(view==='semana'){app.innerHTML=heading(T.hSem,T.dSem)+`<p class="muted">${T.nSem}</p><div class="week">`+T.dias.map((day,d)=>`<section class="day"><h3>${day}</h3>${T.meals.map((m,mi)=>{const key=d+':'+mi,r=byId.get(state.menu[key]);return `<div class="slot">${r?`<button class="slot-name" data-recipe="${r.id}"><strong>${m}</strong>${esc(r.t)}</button><button class="remove" data-remove="${key}" aria-label="×">×</button>`:`<button class="slot-name" data-view="explorar"><strong>${m}</strong>${T.elegir}</button>`}</div>`}).join('')}</section>`).join('')+'</div>';return}
 if(view==='compra'){const g=shoppingGroups();app.innerHTML=heading(T.hCom,T.dCom)+`<div class="row"><button data-copyshop>${T.copiar}</button><button data-downloadshop>${T.descargar}</button><button data-print>${T.imprimir}</button></div><div id="shopping">`+(g.length?g.map(x=>`<section class="shop-group"><h3>${esc(x.t)}</h3><p class="muted">${esc(x.when.join(' · '))}</p>${x.items.map((s,i)=>{const key=x.id+':'+i;return typeof s==='string'?`<label class="shop-item ${state.checked.includes(key)?'checked':''}"><input type="checkbox" data-check="${key}" ${state.checked.includes(key)?'checked':''}><span>${esc(s)}</span></label>`:`<p class="tag" style="margin:12px 0 2px">${esc(s.h)}</p>`}).join('')}</section>`).join(''):`<div class="empty">${T.menuVacio} <button data-view="explorar">${T.elegirR}</button></div>`)+'</div>'}}
function pageTitle(ps,i){const f=ps.find(s=>!/^\d+$/.test(s))||'';return f.length>110?f.slice(0,107)+'…':f}
const para=ps=>ps.map(p=>`<p>${esc(p)}</p>`).join('');
function recipeBody(r){if(r.ing&&r.pasos){return `<div class="recipe-detail"><section><h3>${T.ing}</h3><div class="text-block">${r.ing.map(i=>typeof i==='string'?`<p style="margin:0 0 9px">• ${esc(i)}</p>`:`<p class="tag" style="margin:16px 0 6px">${esc(i.h)}</p>`).join('')}</div></section><section><h3>${T.prep}</h3><ol class="text-block" style="padding-left:22px">${r.pasos.map(p=>`<li style="margin:0 0 12px">${esc(p)}</li>`).join('')}</ol></section></div>${r.tip?`<div class="guidance"><h3>${T.tip}</h3><div class="text-block">${esc(r.tip)}</div></div>`:''}`}
 return `<article class="reader-page">${(r.txt||[]).map(l=>`<p>${esc(l)}</p>`).join('')}</article>`}
function readRecipe(id){const r=byId.get(id);if(!r)return;const b=bookMap.get(r.b),fav=state.favorites.includes(id),d=$('#reader');currentRead=id;
 $('#readerbody').innerHTML=`<div class="modal-head"><div><p class="overline">${esc(cn(r.c))}${r.s&&r.s.length?' · '+esc(en(r.s[0])):''}${r.m?' · '+r.m+' '+T.min:''}</p><h2>${esc(r.t)}</h2></div><button data-close="reader" aria-label="${T.cerrar}">×</button></div><p class="muted">${esc(b.t)}</p><div class="reader-actions"><button data-fav="${id}" aria-pressed="${fav}">${fav?T.guardada:T.guardar}</button><button class="primary" data-add="${id}">${T.addSem}</button></div>${r.img?`<section class="recipe-gallery"><img class="recipe-hero-photo" data-src="${r.img}" alt="${esc(r.t)}"></section>`:''}${recipeBody(r)}<p class="source-note">${esc(b.t)}. ${T.fuente}</p>`;
 if(!d.open)d.showModal();hydrate($('#readerbody'))}
function readPage(id){const [bid,n0]=id.split(':'),n=+n0,b=bookMap.get(bid),pages=lector[bid];if(!b||!pages||n<1||n>pages.length)return;currentRead=id;const d=$('#reader'),text=pages[n-1];
 $('#readerbody').innerHTML=`<div class="modal-head"><div><p class="overline">${esc(cn(b.cat))} · ${T.pag} ${n}</p><h2>${esc(pageTitle(text,n-1)||b.t)}</h2></div><button data-close="reader" aria-label="${T.cerrar}">×</button></div><p class="muted">${esc(b.t)}</p><div class="reader-actions"><button data-readmark="${id}">${state.read.includes(id)?T.leida:T.marcar}</button></div><article class="reader-page">${para(text)}</article><div class="row"><button data-read="${bid}:${n-1}" ${n<=1?'disabled':''}>${T.pAnt}</button><button data-read="${bid}:${n+1}" ${n>=pages.length?'disabled':''}>${T.pSig}</button></div>`;if(!d.open)d.showModal()}
function shoppingGroups(){const g=new Map();for(const [slot,id] of Object.entries(state.menu)){const r=byId.get(id);if(!r)continue;const [d,m]=slot.split(':'),w=T.dias[+d]+' · '+T.meals[+m];if(g.has(id)){g.get(id).when.push(w);continue}g.set(id,{id,t:r.t,when:[w],items:r.ing||[]})}return [...g.values()]}
function shoppingText(){return T.listaTit+'\n\n'+shoppingGroups().map(g=>g.t+'\n'+g.when.join(' · ')+'\n'+g.items.map(x=>typeof x==='string'?'□ '+x:'— '+x.h).join('\n')).join('\n\n')}
function download(name,text){const u=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
// ---- instalar en el movil ----
let deferredPrompt=null;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isIOS=()=>/iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function installBox(){if(standalone()||ls.get('cts_inst_off'))return '';
 if(deferredPrompt)return `<div class="install"><p><strong>Instala la app</strong> en tu móvil y ábrela sin conexión.</p><div class="row"><button class="primary" data-install>Instalar</button><button class="ghost" data-instoff>Ahora no</button></div></div>`;
 if(isIOS())return `<div class="install"><p><strong>Guárdala en tu iPhone:</strong> toca <b>Compartir</b> <span class="ios-share">⬆︎</span> y luego <b>«Añadir a pantalla de inicio»</b>.</p><button class="ghost" data-instoff>Entendido</button></div>`;
 if(/android/i.test(navigator.userAgent))return `<div class="install"><p><strong>Guárdala en tu móvil:</strong> abre el menú <b>⋮</b> del navegador y toca <b>«Añadir a pantalla de inicio»</b>.</p><button class="ghost" data-instoff>Entendido</button></div>`;
 return ''}
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;if(view==='inicio'&&books)render()});
document.addEventListener('click',async e=>{const el=e.target.closest('button,[data-recipe]');if(!el||!books)return;const d=el.dataset;try{
 if(d.tab){tab=d.tab;history.replaceState(null,'',location.pathname+location.search+'#'+(tab==='bonos'?'bonos':'inicio'));render();return}
 if(d.install!==undefined){if(deferredPrompt){deferredPrompt.prompt();await deferredPrompt.userChoice.catch(()=>{});deferredPrompt=null}render();return}
 if(d.instoff!==undefined){ls.set('cts_inst_off','1');render();return}
 if(d.close){$('#'+d.close).close();return}if(d.view){$('#reader').open&&$('#reader').close();if(d.view==='inicio')tab='libros';go(d.view);return}
 if(d.recipe){readRecipe(d.recipe);return}if(d.read){readPage(d.read);return}
 if(d.book){view='book';bookId=d.book;render();window.scrollTo({top:0,behavior:'smooth'});return}
 if(d.backbooks!==undefined){const k=bookMap.get(bookId).kind;if(k==='recetas')go('libros');else if(k==='guias')go('guias');else{tab=k==='bonos'&&!TD.products.some(p=>p.book===bookId)?'bonos':'libros';go('inicio')}return}
 if(d.cat!==undefined){category=d.cat;render();return}
 if(d.fav){state.favorites=state.favorites.includes(d.fav)?state.favorites.filter(x=>x!==d.fav):[...state.favorites,d.fav];persist();if($('#reader').open&&currentRead===d.fav)readRecipe(d.fav);if(view==='explorar'||view==='favoritos'||view==='book')view==='book'?render():listResults();toast(state.favorites.includes(d.fav)?T.favOk:T.favNo);return}
 if(d.readmark){state.read=state.read.includes(d.readmark)?state.read.filter(x=>x!==d.readmark):[...state.read,d.readmark];persist();readPage(currentRead);return}
 if(d.page){page+=+d.page;listResults();$('#results').scrollIntoView({behavior:'smooth',block:'start'});return}
 if(d.add){selectedRecipe=byId.get(d.add);$('#chosen-recipe').textContent=selectedRecipe.t;$('#menu-meal').value=String({Desayunos:0,Comidas:1,Cenas:2,Snacks:3,Bebidas:4,Postres:5}[selectedRecipe.c]??1);$('#add-menu').showModal();return}
 if(d.remove){delete state.menu[d.remove];state.checked=[];persist();render();return}
 if(d.copyshop!==undefined){const t=shoppingText();try{await navigator.clipboard.writeText(t);toast(T.copiada)}catch{download('compra-creatusabor.txt',t);toast(T.descargada)}return}
 if(d.downloadshop!==undefined){download('compra-creatusabor.txt',shoppingText());toast(T.descargada);return}
 if(d.print!==undefined){window.print();return}
 }catch(err){toast(T.err)}});
document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;page=0;listResults()}});
document.addEventListener('change',e=>{if(e.target.id==='category'){category=e.target.value;page=0;listResults()}if(e.target.id==='season'){season=e.target.value;page=0;listResults()}if(e.target.dataset.check){const k=e.target.dataset.check;state.checked=e.target.checked?[...new Set([...state.checked,k])]:state.checked.filter(x=>x!==k);e.target.closest('label').classList.toggle('checked',e.target.checked);persist()}});
$('#menu-form').addEventListener('submit',e=>{e.preventDefault();if(!selectedRecipe)return;state.menu[$('#menu-day').value+':'+$('#menu-meal').value]=selectedRecipe.id;state.checked=[];persist();$('#add-menu').close();toast(T.menuOk);if(view==='semana'||view==='compra')render()});
// ---- cascara (textos) ----
function shell(){document.documentElement.lang=LANG;document.title='Mis libros · CreaTuSabor';$('#t-over').textContent=T.over;$('#t-nota').innerHTML=esc(T.nota1)+'<br>'+esc(T.nota2);$('#t-nota3').textContent=T.nota3;$('#t-introover').textContent=T.introOver;$('#t-h1').innerHTML=esc(T.h1a)+'<br><em>'+esc(T.h1b)+'</em>';$('#t-introp').textContent=T.introP;$('#t-load').textContent=T.cargando;
 const ic={inicio:'⌂',explorar:'▦',libros:'▤',favoritos:'♡',semana:'▦',compra:'♧',guias:'◎'};$('#nav-side').innerHTML=VIEWS.map(v=>`<button data-view="${v}">${ic[v]} ${esc(T.nav[v])}</button>`).join('');$('#nav-mob').innerHTML=VIEWS.map(v=>`<button data-view="${v}">${esc(T.mnav[v])}</button>`).join('');
 $('#t-dlg').textContent=T.dlgAdd;$('#t-dia').textContent=T.dia;$('#t-mom').textContent=T.momento;$('#t-cambiar').textContent=T.cambiar;$('#t-guardar').textContent=T.guardarMenu;$('#menu-day').innerHTML=T.dias.map((d,i)=>`<option value="${i}">${esc(d)}</option>`).join('');$('#menu-meal').innerHTML=T.meals.map((d,i)=>`<option value="${i}">${esc(d)}</option>`).join('')}
function route(h){if(h==='bonos'){view='inicio';tab='bonos'}else if(h==='inicio'||h===''){view='inicio';tab='libros'}else if(VIEWS.includes(h))view=h}
async function init(){initOwn();shell();
 if(!await initKey()){$('#app').innerHTML=`<div class="empty"><p>${T.err}</p></div>`;return}
 try{const c=await J('catalogo');IKEY=await impKey(b64(c.ik));books=c.books;recipes=c.recipes;lector=await J('lector');bookMap=new Map(books.map(b=>[b.id,b]));byId=new Map(recipes.map(r=>[r.id,r]));
  for(const r of recipes)r.sx=norm(r.t+' '+(r.ing?r.ing.map(i=>typeof i==='string'?i:i.h).join(' '):(r.txt||[]).join(' '))+' '+bookMap.get(r.b).t);
  storageKey='cts-r2000-'+LANG;try{const s=JSON.parse(ls.get(storageKey));if(s&&Array.isArray(s.favorites)&&s.menu&&Array.isArray(s.checked)&&Array.isArray(s.read)){state=s;state.favorites=state.favorites.filter(x=>byId.has(x));for(const [k,id] of Object.entries(state.menu))if(!byId.has(id))delete state.menu[k]}}catch{}
  $('#stats').innerHTML=`<span><strong>${recipes.length.toLocaleString(LANG)}</strong>${T.stRec}</span><span><strong>${books.filter(b=>b.kind==='recetas').length}</strong>${T.stCol}</span><span><strong>6</strong>${T.stBon}</span>`;
  route(location.hash.slice(1));render();window.addEventListener('hashchange',()=>{const h=location.hash.slice(1),pv=view,pt=tab;route(h);if(view!==pv||tab!==pt){bookId=null;render()}})
 }catch(e){$('#app').innerHTML=`<div class="empty"><p>${T.err}</p></div>`}}
init();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
