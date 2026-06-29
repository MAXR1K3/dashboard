/* health.js — 链接健康检查：每个书签维护 health:{status,ts}，批量检测带并发限制。
   扩展环境（有 host_permissions）直接 fetch 看状态码；PWA/网页环境用 no-cors 探测可达性。 */
"use strict";

var _healthRun=null;
var healthIssueFilter="all";

function healthTip(b){
  if(!b.health||!b.health.status||b.health.status==="unknown") return t("hUnknown");
  var ago=(typeof timeAgo==="function"&&b.health.ts)?timeAgo(b.health.ts):"";
  var key=b.health.status==="ok"?"hOk":(b.health.status==="bad"?"hBad":"hWarn");
  var tip=t(key,{ago:ago});
  return b.health.manual ? (t("healthManual")+" · "+tip) : tip;
}

function checkLink(url, cb){
  var direct=(typeof hasChromeAPI==="function")&&hasChromeAPI();
  var ctrl=window.AbortController?new AbortController():null;
  var to=setTimeout(function(){ if(ctrl){ try{ ctrl.abort(); }catch(e){} } },12000);
  var opts={redirect:"follow",cache:"no-store"};
  if(ctrl) opts.signal=ctrl.signal;
  if(!direct) opts.mode="no-cors"; // 网页环境跨域读不到状态码，能连通即视为正常
  fetch(url,opts).then(function(r){
    clearTimeout(to);
    if(r.type==="opaque"){ cb("ok"); return; }
    if(r.ok||(r.status>=300&&r.status<400)) cb("ok");
    else if(r.status===404||r.status===410||r.status===451) cb("bad");
    else cb("warn"); // 403/429/5xx 等：站点活着但当前请求被拒
  }).catch(function(){
    clearTimeout(to);
    cb(direct?"bad":"warn"); // 网页环境的网络错误可能是站点策略所致，标记“存疑”避免误杀
  });
}

function updateHealthDot(b){
  if(typeof gridEl==="undefined"||!gridEl) return;
  var nameEl=gridEl.querySelector('.card[data-id="'+cssEscape(b.id)+'"] .name');
  if(!nameEl) return;
  var dot=nameEl.querySelector(".hdot");
  if(!dot){ dot=document.createElement("span"); nameEl.insertBefore(dot,nameEl.firstChild); }
  dot.className="hdot "+b.health.status; dot.title=healthTip(b);
}

function healthCheckAll(){
  if(_healthRun){ toast(t("healthBusy"),""); return; }
  var list=state.bookmarks.slice();
  if(!list.length) return;
  _healthRun=true;
  toast(t("healthRunning"),"");
  var total=list.length, done=0, counts={ok:0,bad:0,warn:0}, qi=0;
  function finishOne(b,st,keepManual){
    if(!keepManual) b.health={status:st,ts:Date.now()};
    counts[st]=(counts[st]||0)+1; done++;
    updateHealthDot(b);
    if(done>=total){
      _healthRun=null; save(); renderContent();
      toast(t("healthDone",{ok:counts.ok,warn:counts.warn,bad:counts.bad}), (counts.bad||counts.warn)?"":"ok");
      if(counts.bad||counts.warn) openHealthIssues();
      return;
    }
    next();
  }
  function next(){
    if(qi>=list.length) return;
    var b=list[qi++], url=normalizeUrl(b.url);
    if(b.health&&b.health.manual&&b.health.status){ finishOne(b,b.health.status,true); return; }
    if(!isWebUrl(url)){ finishOne(b,"bad"); return; }
    checkLink(url, function(st){ finishOne(b,st); });
  }
  for(var i=0;i<Math.min(6,total);i++) next();
}

function setBookmarkHealth(id,status){
  var b=byId(id); if(!b) return;
  if(!status||status==="unknown") delete b.health;
  else b.health={status:status,ts:Date.now(),manual:true};
  save(); renderContent(); toast(t("statusUpdated"),"ok");
  if($("#healthOverlay")&&$("#healthOverlay").classList.contains("open")) renderHealthIssues();
}

function healthIssueBookmarks(){
  return state.bookmarks.filter(function(b){
    var st=b.health&&b.health.status;
    if(st!=="bad"&&st!=="warn") return false;
    return healthIssueFilter==="all" || st===healthIssueFilter;
  });
}
function healthIssueCounts(){
  var out={bad:0,warn:0};
  state.bookmarks.forEach(function(b){ var st=b.health&&b.health.status; if(st==="bad") out.bad++; else if(st==="warn") out.warn++; });
  return out;
}
function healthStatusLabel(st){ return st==="bad"?t("healthIssueBad"):st==="warn"?t("healthIssueWarn"):t("hUnknown"); }
function renderHealthIssues(){
  var listEl=$("#healthIssueList"); if(!listEl) return;
  var counts=healthIssueCounts(), list=healthIssueBookmarks();
  $all("#healthIssueFilter [data-health-filter]").forEach(function(b){
    var f=b.getAttribute("data-health-filter"), n=f==="bad"?counts.bad:(f==="warn"?counts.warn:(counts.bad+counts.warn));
    b.classList.toggle("on", f===healthIssueFilter);
    b.innerHTML='<span>'+escapeHtml(f==="all"?t("healthIssueAll"):(f==="bad"?t("healthIssueBad"):t("healthIssueWarn")))+'</span><span class="health-count">'+escapeHtml(n)+'</span>';
  });
  if(!counts.bad&&!counts.warn){
    listEl.innerHTML='<div class="w-empty">'+escapeHtml(t("healthIssueEmpty"))+'</div>';
    return;
  }
  if(!list.length){
    listEl.innerHTML='<div class="w-empty">'+escapeHtml(t("healthIssueFilteredEmpty"))+'</div>';
    return;
  }
  listEl.innerHTML=list.map(function(b){
    var st=b.health&&b.health.status, dom=getDomain(b.url), hue=hashHue(dom||b.title), letter=(b.title||dom||"?").trim().charAt(0)||"?";
    var ago=(typeof timeAgo==="function"&&b.health&&b.health.ts)?timeAgo(b.health.ts):"";
    return '<div class="health-item '+escapeHtml(st)+'" data-id="'+escapeHtml(b.id)+'">'+
      '<div class="fav" style="--c:'+hue+'"><span class="letter">'+escapeHtml(letter)+'</span></div>'+
      '<div class="min0"><div class="tt">'+escapeHtml(b.title||dom)+'</div>'+
        '<div class="tu">'+escapeHtml(prettyUrl(b.url))+'</div>'+
        '<div class="texp"><span class="health-badge '+escapeHtml(st)+'">'+escapeHtml(healthStatusLabel(st))+'</span> '+escapeHtml(catLabel(b.category))+(ago?" · "+escapeHtml(ago):"")+(b.health&&b.health.manual?" · "+escapeHtml(t("healthManual")):"")+'</div></div>'+
      '<div class="acts">'+
        '<button class="btn sm" data-health-open="'+escapeHtml(b.id)+'">'+escapeHtml(t("healthIssueOpen"))+'</button>'+
        '<button class="btn sm" data-health-edit="'+escapeHtml(b.id)+'">'+escapeHtml(t("healthIssueEdit"))+'</button>'+
        '<button class="btn sm" data-health-ok="'+escapeHtml(b.id)+'">'+escapeHtml(t("healthSetOk"))+'</button>'+
        '<button class="btn sm danger" data-health-delete="'+escapeHtml(b.id)+'">'+escapeHtml(t("delete"))+'</button>'+
      '</div></div>';
  }).join("");
}
function openHealthIssues(){
  healthIssueFilter="all";
  renderHealthIssues();
  openOverlay("healthOverlay");
}

$("#healthIssueFilter").addEventListener("click", function(e){
  var b=e.target.closest("[data-health-filter]"); if(!b) return;
  healthIssueFilter=b.getAttribute("data-health-filter")||"all";
  renderHealthIssues();
});
$("#healthRecheckBtn").addEventListener("click", healthCheckAll);
$("#healthIssueList").addEventListener("click", function(e){
  var idBtn=e.target.closest("[data-health-open],[data-health-edit],[data-health-ok],[data-health-delete]");
  if(!idBtn) return;
  var id=idBtn.getAttribute("data-health-open")||idBtn.getAttribute("data-health-edit")||idBtn.getAttribute("data-health-ok")||idBtn.getAttribute("data-health-delete");
  if(idBtn.hasAttribute("data-health-open")){ openBookmark(id); return; }
  if(idBtn.hasAttribute("data-health-edit")){ closeOverlay("healthOverlay"); openEdit(id); return; }
  if(idBtn.hasAttribute("data-health-ok")){ setBookmarkHealth(id,"ok"); return; }
  if(idBtn.hasAttribute("data-health-delete")){ deleteBookmark(id); renderHealthIssues(); }
});
