/* palette.js — 命令面板（⌘/Ctrl-K）：模糊搜书签、跑命令、跳分类、网页/URL 兜底 */
"use strict";

/* ===== command palette ===== */
var palState={ items:[], sel:0, open:false, wired:false, lastFocus:null };

function paletteCommands(){
  return [
    { icon:ICONS.plus,     label:t("addBookmark"),       kw:"add new create bookmark",        run:openAdd },
    { icon:ICONS.folder,   label:t("newCategory"),        kw:"new category folder",            run:addCategory },
    { icon:ICONS.history,  label:t("summarizeMissing"),   kw:"summary description ai generate", run:summarizeMissingDescriptions },
    { icon:ICONS.star,     label:t("aiSuggest"),          kw:"ai suggest category",            run:openSuggest },
    { icon:ICONS.bookmark, label:t("healthCheck"),        kw:"health check links broken",      run:healthCheckAll },
    { icon:ICONS.info,     label:t("healthIssues"),       kw:"invalid broken dead unsure links", run:openHealthIssues },
    { icon:ICONS.globe,    label:t("import"),             kw:"import file browser",            run:openImport },
    { icon:ICONS.globe,    label:t("exportBm"),           kw:"export backup download",         run:exportBookmarks },
    { icon:ICONS.trash,    label:t("trash"),              kw:"trash deleted recycle",          run:openTrash },
    { icon:ICONS.cog||ICONS.layers, label:t("settings"),  kw:"settings preferences options",   run:function(){ openSettings("general"); } },
    { icon:ICONS.moon,     label:t("theme"),              kw:"theme dark light auto",          run:function(){ $("#themeBtn").click(); } }
  ];
}

function ensurePaletteDom(){
  if($("#paletteOverlay")) return;
  var ov=document.createElement("div");
  ov.className="overlay palette-overlay"; ov.id="paletteOverlay";
  ov.innerHTML=
    '<div class="palette" role="dialog" aria-modal="true" aria-label="'+escapeHtml(t("palTitle"))+'">'+
      '<div class="pal-search">'+ICONS.gsearch+
        '<input id="palInput" type="text" autocomplete="off" spellcheck="false" placeholder="'+escapeHtml(t("palPlaceholder"))+'" />'+
        '<kbd class="pal-kbd">esc</kbd>'+
      '</div>'+
      '<div class="pal-results" id="palResults" role="listbox"></div>'+
      '<div class="pal-foot"><span><b>↑↓</b> '+escapeHtml(t("palNav"))+'</span><span><b>↵</b> '+escapeHtml(t("palOpen"))+'</span><span><b>esc</b> '+escapeHtml(t("palClose"))+'</span></div>'+
    '</div>';
  document.body.appendChild(ov);
  wirePalette();
}

function groupLabel(g){ return g==="cmd"?t("palCmds"):g==="cat"?t("palCategories"):g==="web"?t("palWeb"):t("palBookmarks"); }

function buildPalette(q){
  q=(q||"").trim();
  var items=[];
  if(!q){
    // 空查询：常用命令 + 最近打开
    paletteCommands().forEach(function(c){ items.push(cmdItem(c)); });
    state.bookmarks.filter(function(b){ return (b.lastOpened||0)>0; })
      .sort(function(a,b){ return (b.lastOpened||0)-(a.lastOpened||0); }).slice(0,5)
      .forEach(function(b){ items.push(bmItem(b)); });
  } else {
    var cq=compactSearch(q);
    // 书签：模糊打分，最匹配在前
    var bms=[];
    state.bookmarks.forEach(function(b){ var sc=fuzzyScore(q,bookmarkHaystack(b)); if(sc>0) bms.push({b:b,sc:sc}); });
    bms.sort(function(a,b){ return b.sc-a.sc; });
    bms.slice(0,8).forEach(function(x){ items.push(bmItem(x.b)); });
    // 命令
    var cmds=[];
    paletteCommands().forEach(function(c){ var sc=fuzzyScore(q,c.label+" "+(c.kw||"")); if(sc>0) cmds.push({c:c,sc:sc}); });
    cmds.sort(function(a,b){ return b.sc-a.sc; }).forEach(function(x){ items.push(cmdItem(x.c)); });
    // 分类
    var cats=[];
    state.categories.forEach(function(c){ var sc=fuzzyScore(q,catLabel(c)+" "+c); if(sc>0) cats.push({c:c,sc:sc}); });
    cats.sort(function(a,b){ return b.sc-a.sc; }).forEach(function(x){ items.push(catItem(x.c)); });
    // 网页 / URL 兜底
    var eng=ENGINES[currentEngine()]||ENGINES.google;
    items.push({ group:"web", icon:ICONS.gsearch, label:t("palSearchWeb",{q:q}), sub:eng.label, run:function(){ closePalette(); runWebSearch(q); } });
    if(isWebUrl(q)) items.push({ group:"web", icon:ICONS.globe, label:t("palOpenUrl",{url:prettyUrl(q)}), sub:"", run:function(){ closePalette(); window.open(normalizeUrl(q),"_blank","noopener"); } });
  }
  palState.items=items; palState.sel=0; renderPalette();
}
function cmdItem(c){ return { group:"cmd", icon:c.icon, label:c.label, sub:"", run:function(){ closePalette(); c.run(); } }; }
function catItem(c){ return { group:"cat", icon:ICONS.folder, label:catLabel(c), sub:countLabelFor(c), run:function(){ closePalette(); setActiveCat(c); } }; }
function bmItem(b){ var id=b.id; return { group:"bm", fav:b.url, label:b.title||getDomain(b.url), sub:prettyUrl(b.url), run:function(){ closePalette(); openBookmark(id); } }; }
function countLabelFor(cat){ var n=0; state.bookmarks.forEach(function(b){ if(b.category===cat) n++; }); return String(n); }

function renderPalette(){
  var list=$("#palResults"); if(!list) return;
  if(!palState.items.length){ list.innerHTML='<div class="pal-empty">'+escapeHtml(t("palEmpty"))+'</div>'; return; }
  var html="", lastGroup=null;
  palState.items.forEach(function(it,i){
    if(it.group!==lastGroup){ html+='<div class="pal-group">'+escapeHtml(groupLabel(it.group))+'</div>'; lastGroup=it.group; }
    var fav=it.fav!=null?faviconUrl(it.fav):"";
    var ico = it.fav!=null
      ? '<span class="pal-fav" style="--c:'+hashHue(getDomain(it.fav)||it.label)+'"><span class="pal-fav-l">'+escapeHtml((it.label||"?").trim().charAt(0)||"?")+'</span>'+(fav?'<img loading="lazy" alt="" src="'+escapeHtml(fav)+'"/>':'')+'</span>'
      : '<span class="pal-ico">'+(it.icon||"")+'</span>';
    html+='<div class="pal-item'+(i===palState.sel?" sel":"")+'" id="palOpt'+i+'" data-i="'+i+'" role="option" aria-selected="'+(i===palState.sel)+'">'+
      ico+
      '<span class="pal-txt"><span class="pal-label">'+escapeHtml(it.label)+'</span>'+(it.sub?'<span class="pal-sub">'+escapeHtml(it.sub)+'</span>':'')+'</span>'+
      '<span class="pal-enter">↵</span>'+
    '</div>';
  });
  list.innerHTML=html;
  list.setAttribute("aria-activedescendant","palOpt"+palState.sel);
  ensureSelVisible();
}
function setSel(i){
  if(!palState.items.length) return;
  palState.sel=Math.max(0,Math.min(i,palState.items.length-1));
  $all(".pal-item",$("#palResults")).forEach(function(el){ var on=+el.getAttribute("data-i")===palState.sel; el.classList.toggle("sel",on); el.setAttribute("aria-selected",on); });
  var list=$("#palResults"); if(list) list.setAttribute("aria-activedescendant","palOpt"+palState.sel);
  ensureSelVisible();
}
function ensureSelVisible(){
  var el=$("#palResults .pal-item.sel"); if(el&&el.scrollIntoView) el.scrollIntoView({block:"nearest"});
}
function runSel(){ var it=palState.items[palState.sel]; if(it&&it.run) it.run(); }

// 面板外壳是惰性创建并复用的，语言切换后这里的静态文案不会自动更新，故每次打开时刷新
function localizePalette(){
  var pal=$("#paletteOverlay .palette"); if(pal) pal.setAttribute("aria-label",t("palTitle"));
  var inp=$("#palInput"); if(inp) inp.setAttribute("placeholder",t("palPlaceholder"));
  var foot=$("#paletteOverlay .pal-foot");
  if(foot) foot.innerHTML='<span><b>↑↓</b> '+escapeHtml(t("palNav"))+'</span><span><b>↵</b> '+escapeHtml(t("palOpen"))+'</span><span><b>esc</b> '+escapeHtml(t("palClose"))+'</span>';
}
function openPalette(){
  ensurePaletteDom();
  if(palState.open) return;
  palState.open=true;
  palState.lastFocus=document.activeElement;
  if(typeof closeMenu==="function") closeMenu();
  localizePalette();
  $("#paletteOverlay").classList.add("open");
  var inp=$("#palInput"); inp.value=""; buildPalette("");
  setTimeout(function(){ inp.focus(); },20);
}
function closePalette(){
  if(!palState.open) return;
  palState.open=false;
  var ov=$("#paletteOverlay"); if(ov) ov.classList.remove("open");
  if(palState.lastFocus&&palState.lastFocus.focus&&document.contains(palState.lastFocus)){
    try{ palState.lastFocus.focus({preventScroll:true}); }catch(e){}
  }
  palState.lastFocus=null;
}
function togglePalette(){ palState.open?closePalette():openPalette(); }

function wirePalette(){
  if(palState.wired) return; palState.wired=true;
  var ov=$("#paletteOverlay"), inp=$("#palInput"), list=$("#palResults");
  list.setAttribute("tabindex","-1");
  inp.addEventListener("input", function(){ buildPalette(inp.value); });
  inp.addEventListener("keydown", function(e){
    if(e.key==="ArrowDown"){ e.preventDefault(); setSel(palState.sel+1); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); setSel(palState.sel-1); }
    else if(e.key==="Enter"){ e.preventDefault(); runSel(); }
    else if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); closePalette(); }
  });
  list.addEventListener("mousemove", function(e){ var it=e.target.closest(".pal-item"); if(it) setSel(+it.getAttribute("data-i")); });
  list.addEventListener("click", function(e){ var it=e.target.closest(".pal-item"); if(it){ setSel(+it.getAttribute("data-i")); runSel(); } });
  // 隐藏加载失败的 favicon，露出字母占位
  list.addEventListener("error", function(e){ var tg=e.target; if(tg&&tg.tagName==="IMG") tg.classList.add("hide"); }, true);
  ov.addEventListener("click", function(e){ if(e.target===ov) closePalette(); });
}

// 全局快捷键：⌘K / Ctrl-K 打开或关闭
document.addEventListener("keydown", function(e){
  if(e.isComposing||e.repeat) return;
  if((e.metaKey||e.ctrlKey) && !e.altKey && (e.key==="k"||e.key==="K")){ e.preventDefault(); e.stopPropagation(); togglePalette(); }
  else if(e.key==="Escape"&&palState.open){ e.preventDefault(); e.stopPropagation(); closePalette(); }
}, true);

// 搜索栏内的命令面板入口：触屏/鼠标都能发现 ⌘K（键盘党之外的可达入口）
(function(){
  var btn=$("#searchCmdBtn"); if(!btn) return;
  var ico=btn.querySelector(".sc-ico"); if(ico) ico.innerHTML=ICONS.cmd;
  var kbd=$("#searchCmdKbd");
  if(kbd){ var mac=/Mac|iPhone|iPad|iPod/.test(navigator.platform||navigator.userAgent||""); kbd.textContent=mac?"⌘K":"Ctrl K"; }
  btn.addEventListener("click", function(e){ e.preventDefault(); e.stopPropagation(); openPalette(); });
})();
