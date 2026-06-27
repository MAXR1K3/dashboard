/* chrome-sync.js — Browser bookmark sync (Chrome / Edge extension, Safari file fallback) */
"use strict";

var BROWSER_ROOTS=["Bookmarks bar","Bookmarks Bar","Other bookmarks","Other Bookmarks","Mobile bookmarks","Mobile Bookmarks",
  "Favorites bar","Favorites Bar","Other favorites","Other Favorites","Mobile favorites","Mobile Favorites",
  "书签栏","其他书签","移动设备书签","收藏夹栏","其他收藏夹","移动收藏夹"];

function getExtApi(){ return (typeof chrome!=="undefined"&&chrome&&chrome.bookmarks)?chrome:((typeof browser!=="undefined"&&browser&&browser.bookmarks)?browser:null); }
function isPromiseExtApi(api){ return typeof browser!=="undefined"&&api===browser; }
function hasChromeAPI(){ return !!(getExtApi()&&getExtApi().bookmarks&&typeof getExtApi().bookmarks.getTree==="function"); }
function currentExtensionSource(){
  var ua=(typeof navigator!=="undefined"&&navigator.userAgent)||"";
  if(/Edg\//.test(ua)) return "edge";
  if(/Safari\//.test(ua)&&!/Chrome\//.test(ua)&&!/Chromium\//.test(ua)) return "safari";
  return "chrome";
}
function syncSource(){ return state.settings.browserSyncSource||defaultBrowserSyncSource(); }
function syncMode(){ return state.settings.browserSyncMode||"merge"; }
function sourceLabel(src){
  if(src==="edge") return t("syncSourceEdge");
  if(src==="safari") return t("syncSourceSafari");
  if(src==="file") return t("import");
  return t("syncSourceChrome");
}
function sourceCat(src,cat,mode){
  cat=cleanCatName(cat)||"Uncategorized";
  if(isReservedCat(cat)) cat="Uncategorized";
  return mode==="separate" ? (sourceLabel(src)+" / "+cat) : cat;
}
function syncNormForDup(u){ return normalizeUrl(u).replace(/\/+$/,"").toLowerCase(); }
function bookmarkSource(b){ return b.syncSource||(b.chromeSyncId?"chrome":(b.edgeSyncId?"edge":(b.safariSyncId?"safari":"manual"))); }
function bookmarkSyncId(b){ return b.syncId||b.chromeSyncId||b.edgeSyncId||b.safariSyncId||""; }
function isSourceBookmark(b,src){ return bookmarkSource(b)===src; }
function canReadSelectedSource(){
  var src=syncSource();
  if(!hasChromeAPI()) return false;
  if(src==="safari") return currentExtensionSource()==="safari";
  return currentExtensionSource()===src;
}
function addSyncCat(out, seen, cat){
  cat=cleanCatName(cat)||"Uncategorized";
  if(isReservedCat(cat)) cat="Uncategorized";
  var key=cat.toLowerCase();
  if(!seen[key]){ seen[key]=true; out.push(cat); }
}
function walkBrowserTree(nodes, parentCat, out){
  (nodes||[]).forEach(function(n){
    if(n.url){
      if(isWebUrl(n.url)) out.push({ sid:String(n.id||n.url), title:(n.title||"").trim()||getDomain(n.url), url:n.url, cat:parentCat||"Uncategorized" });
    } else if(n.children){
      var title=(n.title||"").trim();
      var isRoot=(!n.parentId||n.parentId==="0"||BROWSER_ROOTS.indexOf(title)>-1);
      walkBrowserTree(n.children, isRoot?null:(chromeSafeCatName(title)||null)||parentCat, out);
    }
  });
}
function syncBookmarkFromItem(item, source, mode){
  var cat=sourceCat(source,item.cat,mode);
  var bm={ id:uid(), syncSource:source, syncId:String(item.sid||syncNormForDup(item.url)), title:item.title, url:normalizeUrl(item.url), category:cat, description:smartSummary(item.url,item.title,cat,""), clicks:0, lastOpened:0 };
  if(source==="chrome") bm.chromeSyncId=bm.syncId;
  if(source==="edge") bm.edgeSyncId=bm.syncId;
  if(source==="safari") bm.safariSyncId=bm.syncId;
  return bm;
}
function markSyncedBookmark(b,item,source,mode){
  var cat=sourceCat(source,item.cat,mode);
  b.syncSource=source; b.syncId=String(item.sid||syncNormForDup(item.url));
  if(source==="chrome") b.chromeSyncId=b.syncId;
  if(source==="edge") b.edgeSyncId=b.syncId;
  if(source==="safari") b.safariSyncId=b.syncId;
  delete b._seed;
  if(item.title&&b.title!==item.title) b.title=item.title;
  if(b.url!==normalizeUrl(item.url)) b.url=normalizeUrl(item.url);
  if(b.category!==cat) b.category=cat;
}
function applyBookmarkItems(items, source, mode){
  source=source||syncSource(); mode=mode||syncMode();
  if(mode==="replace") mode="replaceAll";
  var oldCats=state.categories.slice(), added=0, skipped=0;
  if(mode==="replaceAll"){
    state.bookmarks=[]; state.categories=[];
  } else if(mode==="replaceSource"){
    state.bookmarks=state.bookmarks.filter(function(b){ return !isSourceBookmark(b,source); });
  }

  var byUrl={}, bySourceUrl={}, bySid={}, ordered=[], used={}, seenIncoming={}, sourceCats=[], sourceCatSeen={};
  state.bookmarks.forEach(function(b){
    var urlKey=syncNormForDup(b.url), src=bookmarkSource(b), sid=bookmarkSyncId(b);
    if(!byUrl[urlKey]) byUrl[urlKey]=b;
    if(src===source){
      bySourceUrl[urlKey]=b;
      if(sid) bySid[String(sid)]=b;
    }
  });
  (items||[]).forEach(function(item){
    if(!item||!isWebUrl(item.url)) return;
    var urlKey=syncNormForDup(item.url), sid=String(item.sid||urlKey), incomingKey=(mode==="merge"?"url:":"source:")+source+"|"+(mode==="merge"?urlKey:(sid||urlKey));
    if(seenIncoming[incomingKey]){ skipped++; return; }
    seenIncoming[incomingKey]=true;
    var cat=sourceCat(source,item.cat,mode);
    addSyncCat(sourceCats,sourceCatSeen,cat);
    var ex=null;
    if(mode==="merge") ex=bySid[sid]||byUrl[urlKey];
    else if(mode==="separate") ex=bySid[sid]||bySourceUrl[urlKey];
    else if(mode==="replaceSource"||mode==="replaceAll") ex=null;
    if(ex){
      markSyncedBookmark(ex,item,source,mode);
      ordered.push(ex); used[ex.id]=true; skipped++;
    } else {
      var bm=syncBookmarkFromItem(item,source,mode);
      ordered.push(bm); used[bm.id]=true; added++;
    }
  });
  var rest=[];
  state.bookmarks.forEach(function(b){
    if(used[b.id]||b._seed) return;
    if(isSourceBookmark(b,source)) return;
    rest.push(b);
  });
  var seenCats={};
  state.categories=sourceCats.slice();
  state.categories.forEach(function(c){ seenCats[String(c).toLowerCase()]=true; });
  state.bookmarks=ordered.concat(rest);
  if(mode!=="replaceAll") oldCats.forEach(function(c){ addSyncCat(state.categories,seenCats,c); });
  state.bookmarks.forEach(function(b){ addSyncCat(state.categories,seenCats,b.category); });
  rebuildCategories();
  return {added:added, skipped:skipped, total:ordered.length};
}

function getBookmarkTree(cb){
  var api=getExtApi();
  if(!api||!api.bookmarks){ cb("noext"); return; }
  try{
    if(isPromiseExtApi(api)){
      api.bookmarks.getTree().then(function(tree){ cb(null,tree); }).catch(function(){ cb("noext"); });
      return;
    }
    var r=api.bookmarks.getTree(function(tree){ cb(null,tree); });
    if(r&&typeof r.then==="function") r.then(function(tree){ cb(null,tree); }).catch(function(){ cb("noext"); });
  }catch(e){ cb("noext"); }
}
function storageGet(keys, cb){
  var api=getExtApi();
  if(!api||!api.storage||!api.storage.local){ cb({}); return; }
  try{
    if(isPromiseExtApi(api)){
      api.storage.local.get(keys).then(function(data){ cb(data||{}); }).catch(function(){ cb({}); });
      return;
    }
    var r=api.storage.local.get(keys,function(data){ cb(data||{}); });
    if(r&&typeof r.then==="function") r.then(function(data){ cb(data||{}); }).catch(function(){ cb({}); });
  }catch(e){ cb({}); }
}
function storageRemove(key){
  var api=getExtApi();
  if(!api||!api.storage||!api.storage.local) return;
  try{ api.storage.local.remove(key); }catch(e){}
}
function runChromeSync(onDone){ runBrowserSync(onDone); }
function runBrowserSync(onDone){
  var source=syncSource();
  if(!canReadSelectedSource()){ if(onDone) onDone("noext"); return; }
  _csSyncing=true; updateSyncUI();
  getBookmarkTree(function(err,tree){
    if(err){ _csSyncing=false; updateSyncUI(); if(onDone) onDone(err); return; }
    var items=[]; walkBrowserTree(tree, null, items);
    var res=applyBookmarkItems(items,source,syncMode());
    if(!state.settings.browserSyncLastSync) state.settings.browserSyncLastSync={};
    if(!state.settings.browserSyncCounts) state.settings.browserSyncCounts={};
    state.settings.browserSyncLastSync[source]=Date.now();
    state.settings.browserSyncCounts[source]=state.bookmarks.filter(function(b){ return isSourceBookmark(b,source); }).length;
    if(source==="chrome"){
      state.settings.chromeSyncLastSync=state.settings.browserSyncLastSync[source];
      state.settings.chromeSyncCount=state.settings.browserSyncCounts[source];
    }
    _csSyncing=false;
    save(); render(); updateSyncUI();
    if(onDone) onDone(null, res.added, res);
  });
}

function applyPendingChrome(){
  if(!hasChromeAPI()) return;
  storageGet(["naviPending"], function(data){
    var q=(data&&data.naviPending)||[]; if(!q.length) return;
    storageRemove("naviPending");
    runBrowserSync(null);
  });
}

var _csLive=false, _csSyncing=false, _csSyncTimer=null, _csSyncDebounce=null;
function queueChromeSync(delay){
  if(!state.settings.chromeSync||!canReadSelectedSource()) return;
  if(_csSyncDebounce) clearTimeout(_csSyncDebounce);
  _csSyncDebounce=setTimeout(function(){
    _csSyncDebounce=null;
    if(state.settings.chromeSync&&canReadSelectedSource()&&!_csSyncing) runBrowserSync(null);
  }, delay||180);
}
function attachChromeLive(){
  var api=getExtApi();
  if(!api||!api.bookmarks||_csLive) return; _csLive=true;
  api.bookmarks.onCreated.addListener(function(id, node){
    if(!state.settings.chromeSync||!node.url||!isWebUrl(node.url)) return;
    queueChromeSync(180);
  });
  api.bookmarks.onRemoved.addListener(function(){
    if(!state.settings.chromeSync) return;
    queueChromeSync(180);
  });
  api.bookmarks.onChanged.addListener(function(){
    if(!state.settings.chromeSync) return;
    queueChromeSync(180);
  });
  api.bookmarks.onMoved.addListener(function(){
    if(!state.settings.chromeSync) return;
    queueChromeSync(180);
  });
}

var _syncUiTimer=null;
function syncModeText(){
  var m=syncMode();
  return t("syncModeDesc_"+m);
}
function updateSyncUI(){
  var tog=document.getElementById("setChromeSync");
  var statusEl=document.getElementById("csSyncStatus");
  var syncBtn=document.getElementById("csSyncNow");
  var safariBtn=document.getElementById("safariImportBtn");
  var noteEl=document.getElementById("csNote");
  var source=syncSource(), canRead=canReadSelectedSource(), last=(state.settings.browserSyncLastSync||{})[source]||0, count=(state.settings.browserSyncCounts||{})[source]||0;
  $all("#syncSourceSeg [data-sync-source]").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-sync-source")===source); });
  $all("#syncModeSeg [data-sync-mode]").forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-sync-mode")===syncMode()); });
  var desc=document.getElementById("syncModeDesc"); if(desc) desc.textContent=syncModeText();
  if(tog){ tog.checked=!!state.settings.chromeSync; tog.disabled=!canRead; }
  if(statusEl){
    if(_csSyncing){
      statusEl.innerHTML='<span style="display:inline-flex;align-items:center;gap:5px"><svg class="spin" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.5"/></svg>'+escapeHtml(t("syncing"))+'</span>';
    } else if(source==="safari"&&!canRead){
      statusEl.textContent=t("syncSafariNote");
    } else if(!canRead){
      statusEl.textContent=t("syncOpenInBrowser",{browser:sourceLabel(source)});
    } else if(!state.settings.chromeSync){
      statusEl.textContent=t("browserSyncSec");
    } else if(!last){
      statusEl.textContent=t("neverSynced")+" · "+t("autoSyncDesc");
    } else {
      statusEl.textContent=t("lastSynced",{t:timeAgo(last)})+
        (count?" · "+t("syncedCount",{n:count}):"")+
        " · "+t("autoSyncDesc");
    }
  }
  if(syncBtn) syncBtn.style.display=(canRead&&state.settings.chromeSync&&!_csSyncing)?"inline-flex":"none";
  if(safariBtn) safariBtn.style.display=(source==="safari"&&!canRead)?"inline-flex":"none";
  if(noteEl) noteEl.style.display=(!canRead&&source!=="safari")?"":"none";
  var lk=document.getElementById("csSetupLink"); if(lk) lk.textContent=t("extensionSetup");
  if(!_syncUiTimer&&state.settings.chromeSync&&last){
    _syncUiTimer=setInterval(function(){
      if(document.getElementById("csSyncStatus")) updateSyncUI();
      else{ clearInterval(_syncUiTimer); _syncUiTimer=null; }
    }, 60*1000);
  }
}

function downloadText(fn, txt){ var a=document.createElement("a"); a.href="data:text/plain;charset=utf-8,"+encodeURIComponent(txt); a.download=fn; document.body.appendChild(a); a.click(); setTimeout(function(){ a.remove(); }, 100); }
function extensionBackgroundText(){
  return [
    "// Navi background.js v1.5 — queues bookmark events while the dashboard is closed.",
    "const api=(typeof browser!=='undefined'&&browser.bookmarks)?browser:chrome;",
    "const MAX_QUEUE=500;",
    "function asPromise(v){ return v&&typeof v.then==='function'?v:Promise.resolve(v); }",
    "api.action.onClicked.addListener(async()=>{",
    "  const dashUrl=api.runtime.getURL('index.html');",
    "  try{",
    "    const tabs=await asPromise(api.tabs.query({}));",
    "    const existing=(tabs||[]).find(t=>t.url&&t.url.indexOf(dashUrl)===0);",
    "    if(existing){ await asPromise(api.tabs.update(existing.id,{active:true})); if(existing.windowId!=null) await asPromise(api.windows.update(existing.windowId,{focused:true})); }",
    "    else await asPromise(api.tabs.create({url:dashUrl}));",
    "  }catch(_){ api.tabs.create({url:dashUrl}); }",
    "});",
    "async function enqueue(ev){",
    "  try{ const d=await asPromise(api.storage.local.get('naviPending')); const q=(d&&d.naviPending)||[]; q.push(ev); await asPromise(api.storage.local.set({naviPending:q.length>MAX_QUEUE?q.slice(q.length-MAX_QUEUE):q})); }catch(_){}",
    "}",
    "api.bookmarks.onCreated.addListener(async(id,node)=>{ if(!node.url) return; await enqueue({type:'created',id,node}); });",
    "api.bookmarks.onRemoved.addListener(async(id,info)=>{ if(info&&info.node&&!info.node.url) return; await enqueue({type:'removed',id}); });",
    "api.bookmarks.onChanged.addListener(async(id,changes)=>{ await enqueue({type:'changed',id,changes}); });",
    "api.bookmarks.onMoved.addListener(async(id,info)=>{ await enqueue({type:'moved',id,parentId:info.parentId}); });"
  ].join("\n");
}
function downloadExtFiles(){
  var mf=JSON.stringify({ manifest_version:3, name:"Navi — Private Bookmark Dashboard", version:"1.5", description:"Private bookmark dashboard with read-only browser bookmark sync. Open from the toolbar icon.", permissions:["bookmarks","storage","tabs"], host_permissions:["http://*/*","https://*/*"], action:{ default_title:"Navi", default_icon:{ "16":"icons/icon-192.png","32":"icons/icon-192.png","48":"icons/icon-192.png","128":"icons/icon-512.png" } }, icons:{ "192":"icons/icon-192.png","512":"icons/icon-512.png" }, background:{service_worker:"background.js"} }, null, 2);
  downloadText("manifest.json", mf);
  setTimeout(function(){ downloadText("background.js", extensionBackgroundText()); }, 250);
}

function showExtSetupGuide(){
  var lang=state.settings.lang, source=syncSource(), browserName=sourceLabel(source), page=source==="edge"?"edge://extensions":"chrome://extensions";
  if(source==="safari"){
    var safariLines=lang==="zh"?[
      "Safari 目前通过书签 HTML 文件接入：",
      "1. 在 Safari 中打开“文件”菜单，选择“导出书签…”",
      "2. 保存得到的 HTML 文件",
      "3. 回到这里点击“导入 Safari 文件”",
      "4. 导入时会使用上方选择的同步规则"
    ]:lang==="es"?[
      "Safari se conecta mediante un archivo HTML de marcadores:",
      "1. En Safari, abre Archivo y elige Exportar marcadores…",
      "2. Guarda el archivo HTML",
      "3. Vuelve aquí y pulsa Importar archivo de Safari",
      "4. Se usará la regla de sincronización seleccionada arriba"
    ]:[
      "Safari is connected through a bookmarks HTML file:",
      "1. In Safari, open File and choose Export Bookmarks…",
      "2. Save the HTML file",
      "3. Return here and click Import Safari file",
      "4. The selected sync rule above will be used"
    ];
    openConfirm(t("extensionSetup"), safariLines.join("\n"), t("syncSafariImport"), function(){ openImport("safari"); });
  } else {
    var lines=lang==="zh"?[
      "1. 把下载的 manifest.json 和 background.js 覆盖到本项目根目录（与 index.html 同一文件夹）",
      "2. 打开 "+page+"，右上角开启开发者模式",
      "3. 点击加载已解压的扩展程序，选择该文件夹（已装过则点扩展卡片上的刷新图标重新加载）",
      "4. 固定扩展图标到工具栏",
      "5. 点击固定后的扩展图标打开导航页",
      "6. 在设置中选择 "+browserName+" 并开启浏览器书签同步"
    ]:lang==="es"?[
      "1. Copia manifest.json y background.js en la raíz del proyecto",
      "2. Abre "+page+" y activa el modo desarrollador",
      "3. Carga la carpeta como extensión sin empaquetar",
      "4. Fija el icono de la extensión en la barra",
      "5. Abre el panel desde ese icono",
      "6. Elige "+browserName+" en ajustes y activa la sincronización"
    ]:[
      "1. Copy manifest.json and background.js into the project root",
      "2. Open "+page+" and enable Developer mode",
      "3. Load this folder as an unpacked extension",
      "4. Pin the extension icon to the toolbar",
      "5. Open the dashboard from that pinned icon",
      "6. Choose "+browserName+" in Settings and turn on browser bookmark sync"
    ];
    openConfirm(t("extensionSetup"), lines.join("\n"), t("downloadFiles"), function(){ downloadExtFiles(); });
  }
  var msgEl=document.getElementById("confirmMsg");
  if(msgEl) msgEl.style.whiteSpace="pre-line";
}

function ensureSyncTimer(){
  if(!_csSyncTimer){
    _csSyncTimer=setInterval(function(){
      if(state.settings.chromeSync&&canReadSelectedSource()&&!_csSyncing) runBrowserSync(null);
    }, 30*60*1000);
  }
}
function initChromeSync(){
  updateSyncUI();
  if(!canReadSelectedSource()||!state.settings.chromeSync) return;
  applyPendingChrome();
  attachChromeLive();
  var last=(state.settings.browserSyncLastSync||{})[syncSource()]||0, age=Date.now()-last;
  if(age>30*60*1000){
    runBrowserSync(function(err, added){
      if(!err&&added) toast(t("importedToast",{a:added}),"ok");
    });
  }
  ensureSyncTimer();
}

var sourceSeg=document.getElementById("syncSourceSeg");
if(sourceSeg) sourceSeg.addEventListener("click", function(e){
  var b=e.target.closest("[data-sync-source]"); if(!b) return;
  state.settings.browserSyncSource=b.getAttribute("data-sync-source");
  save(); updateSyncUI();
});
var modeSeg=document.getElementById("syncModeSeg");
if(modeSeg) modeSeg.addEventListener("click", function(e){
  var b=e.target.closest("[data-sync-mode]"); if(!b) return;
  state.settings.browserSyncMode=b.getAttribute("data-sync-mode");
  state.settings.chromeSyncReplace=state.settings.browserSyncMode==="replaceAll";
  save(); updateSyncUI();
});
var syncToggle=document.getElementById("setChromeSync");
if(syncToggle) syncToggle.addEventListener("change", function(e){
  state.settings.chromeSync=e.target.checked; save(); updateSyncUI();
  if(e.target.checked&&canReadSelectedSource()){
    runBrowserSync(function(err){
      if(err) toast(t("chromeSyncError"),"err");
      else{ attachChromeLive(); ensureSyncTimer(); toast(t("browserSyncEnabled"),"ok"); }
    });
  } else {
    if(_csSyncTimer){ clearInterval(_csSyncTimer); _csSyncTimer=null; }
    toast(t("browserSyncDisabled"),"ok");
  }
});
var syncNow=document.getElementById("csSyncNow");
if(syncNow) syncNow.addEventListener("click", function(){
  var btn=this; btn.disabled=true; btn.textContent=t("syncing");
  runBrowserSync(function(err){
    btn.disabled=false; btn.textContent=t("syncNow");
    if(err) toast(t("chromeSyncError"),"err");
    else toast(t("syncedCount",{n:(state.settings.browserSyncCounts||{})[syncSource()]||0}),"ok");
  });
});
var safariImport=document.getElementById("safariImportBtn");
if(safariImport) safariImport.addEventListener("click", function(){ openImport("safari"); });
var setupLink=document.getElementById("csSetupLink");
if(setupLink) setupLink.addEventListener("click", function(e){ e.preventDefault(); showExtSetupGuide(); });
