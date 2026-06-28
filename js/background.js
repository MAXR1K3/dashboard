/* background.js — 液态玻璃外观 + 自定义背景图片 / 动态壁纸 */
"use strict";

var LIVE_PRESETS = ["aurora","sunset","ocean","mesh"];

/* ===== 在线壁纸（多图源，按主题分类，定时切换） ===== */
var WALL_CATS = ["nature","city","architecture","landscape","space","ocean","minimal","animals"];
var WALL_SOURCES = ["unsplash","bing","picsum","loremflickr"];
var WALL_ROTATE_OPTIONS = [0,15,30,60,180,360,1440];
var _wallShuffle = 0, _wallTimer = null;
function wallpaperRotateMin(bg){
  var v=Number(bg&&bg.wallpaperRotate);
  return WALL_ROTATE_OPTIONS.indexOf(v)>-1 ? v : 30;
}
function wallpaperBucket(bg){
  var min=wallpaperRotateMin(bg);
  return min>0 ? Math.floor(Date.now()/(min*60*1000)) : 0;
}
function wallpaperUrl(bg){
  var cat = WALL_CATS.indexOf(bg.wallpaperCat)>-1 ? bg.wallpaperCat : "nature";
  var source = WALL_SOURCES.indexOf(bg.wallpaperSource)>-1 ? bg.wallpaperSource : "unsplash";
  var seed = wallpaperBucket(bg) + (_wallShuffle||0); // 时间桶 + 手动“换一张”偏移
  var q = encodeURIComponent(cat+",wallpaper,high-resolution");
  if(source==="picsum") return "https://picsum.photos/seed/navi-"+encodeURIComponent(cat)+"-"+seed+"/2560/1440";
  if(source==="loremflickr") return "https://loremflickr.com/2560/1440/"+encodeURIComponent(cat)+",wallpaper?lock="+seed;
  if(source==="bing") return "https://bing.biturl.top/?resolution=1920&format=image&index="+(seed%8)+"&mkt=zh-CN";
  return "https://source.unsplash.com/2560x1440/?"+q+"&sig="+seed;
}
function wallpaperFileName(bg){
  var cat = WALL_CATS.indexOf(bg.wallpaperCat)>-1 ? bg.wallpaperCat : "nature";
  var source = WALL_SOURCES.indexOf(bg.wallpaperSource)>-1 ? bg.wallpaperSource : "unsplash";
  return "navi-wallpaper-"+source+"-"+cat+"-"+Date.now()+".jpg";
}
function downloadUrl(url, name){
  var a=document.createElement("a");
  a.href=url; a.download=name||""; a.rel="noopener";
  a.target="_blank";
  document.body.appendChild(a); a.click();
  setTimeout(function(){ a.remove(); },100);
}
function openWallpaperUrl(url){
  var w=window.open(url,"_blank","noopener");
  if(!w) location.href=url;
}
function downloadCurrentWallpaper(){
  var bg=state.settings.background||{};
  if(bg.type!=="wallpaper"){ toast(t("bgDownloadWallpaperUnavailable"),"err"); return; }
  var url=wallpaperUrl(bg), name=wallpaperFileName(bg);
  fetch(url,{mode:"cors",cache:"no-store"}).then(function(r){
    if(!r.ok) throw new Error("HTTP "+r.status);
    return r.blob();
  }).then(function(blob){
    var objectUrl=URL.createObjectURL(blob);
    downloadUrl(objectUrl,name);
    setTimeout(function(){ URL.revokeObjectURL(objectUrl); },1000);
    toast(t("bgDownloadWallpaperOk"),"ok");
  }).catch(function(){
    downloadUrl(url,name);
    toast(t("bgDownloadWallpaperFallback"),"");
  });
}
function startWallpaperTimer(){
  var bg=state.settings.background||{};
  var min=wallpaperRotateMin(bg);
  if(min<=0 || _wallTimer || document.hidden) return;
  _wallTimer = setInterval(function(){
    if(document.hidden) return;
    if((state.settings.background||{}).type!=="wallpaper"){ stopWallpaperTimer(); return; }
    _bgSig=null; applyBackground(); // 新时间桶 → 新图
  }, min*60*1000);
}
function stopWallpaperTimer(){ if(_wallTimer){ clearInterval(_wallTimer); _wallTimer=null; } }

/* ===== 应用外观 ===== */
// 不透明度滑块(8..85) → surface alpha(.08..~.85)；折射仅在玻璃开启时生效
function applyGlass(){
  var on=state.settings.glass!==false;
  document.body.classList.toggle("glass", on);
  document.body.classList.toggle("refract", on && state.settings.refraction!==false);
  var v=Math.max(8, Math.min(85, +state.settings.glassOpacity||45));
  document.documentElement.style.setProperty("--glass-a", (v/100).toFixed(3));
}

var _bgSig=null;
function applyBackground(){
  var el=document.getElementById("bgLayer"); if(!el) return;
  var bg=state.settings.background||{type:"gradient"};
  var live=LIVE_PRESETS.indexOf(bg.live)>-1?bg.live:"aurora";
  var wallUrl=bg.type==="wallpaper"?wallpaperUrl(bg):"";
  // 签名守卫：避免每次 render 都重设大体积的 dataURL，导致背景闪烁/重绘（壁纸 URL 入签名以便定时切换）
  var sig=bg.type+"|"+live+"|"+(bg.type==="image"&&bg.image?bg.image.length:0)+"|"+wallUrl;
  if(sig===_bgSig) return; _bgSig=sig;
  el.style.backgroundImage="";
  if(bg.type==="image"&&bg.image){
    el.className="image";
    el.style.backgroundImage="url('"+bg.image.replace(/'/g,"%27")+"')";
  } else if(bg.type==="wallpaper"){
    el.className="image";
    el.style.backgroundImage="url('"+wallUrl+"')";
  } else if(bg.type==="live"){
    el.className="live live-"+live;
  } else {
    el.className="";
  }
  // 动态壁纸会放大玻璃重绘成本；body.bg-live 交给 CSS 做滚动/低功耗降级
  document.body.classList.toggle("bg-live", bg.type==="live");
  if(bg.type==="wallpaper"){ stopWallpaperTimer(); startWallpaperTimer(); } else stopWallpaperTimer();
}
// 回到前台时刷新到当前时间桶的壁纸（隐藏时定时回调会 no-op）
document.addEventListener("visibilitychange", function(){
  if(document.hidden) return;
  if((state.settings.background||{}).type==="wallpaper"){ _bgSig=null; applyBackground(); }
});

/* ===== 设置面板同步 ===== */
function syncBgUI(){
  var bg=state.settings.background||{type:"gradient"};
  $all('#bgTypeSeg [data-bgtype]').forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-bgtype")===bg.type); });
  $all('#bgLiveRow .bg-swatch').forEach(function(b){ b.classList.toggle("on", bg.type==="live"&&b.getAttribute("data-live")===(bg.live||"aurora")); });
  // 仅在对应类型下显示动态壁纸 / 在线壁纸的选项行
  var liveRow=$("#bgLiveRow"); if(liveRow) liveRow.style.display=bg.type==="live"?"":"none";
  var wallRow=$("#bgWallRow"); if(wallRow) wallRow.style.display=bg.type==="wallpaper"?"":"none";
  var wallSourceRow=$("#bgWallSourceRow"); if(wallSourceRow) wallSourceRow.style.display=bg.type==="wallpaper"?"":"none";
  var wallRotateRow=$("#bgWallRotateRow"); if(wallRotateRow) wallRotateRow.style.display=bg.type==="wallpaper"?"":"none";
  var wallDownloadRow=$("#bgWallDownloadRow"); if(wallDownloadRow) wallDownloadRow.style.display=bg.type==="wallpaper"?"":"none";
  $all('#bgWallRow [data-wallcat]').forEach(function(b){ b.classList.toggle("on", bg.type==="wallpaper"&&b.getAttribute("data-wallcat")===(bg.wallpaperCat||"nature")); });
  $all('#wallSourceSeg [data-wallsource]').forEach(function(b){ b.classList.toggle("on", (bg.wallpaperSource||"unsplash")===b.getAttribute("data-wallsource")); });
  $all('#wallRotateSeg [data-wallrotate]').forEach(function(b){ b.classList.toggle("on", String(wallpaperRotateMin(bg))===b.getAttribute("data-wallrotate")); });
  var g=$("#setGlass"); if(g) g.checked=state.settings.glass!==false;
  var rf=$("#setRefract"); if(rf) rf.checked=state.settings.refraction!==false;
  var op=$("#setGlassOpacity"), ov=$("#glassOpacityVal"), val=Math.max(8,Math.min(85,+state.settings.glassOpacity||45));
  if(op) op.value=val; if(ov) ov.textContent=val+"%";
  // 玻璃关闭时，不透明度/折射行置灰
  var on=state.settings.glass!==false;
  ["glassOpacityRow","glassRefractRow"].forEach(function(id){ var r=document.getElementById(id); if(r){ r.style.opacity=on?"":".45"; r.style.pointerEvents=on?"":"none"; } });
}

function setBackground(next){
  var prev=Object.assign({}, state.settings.background);
  state.settings.background=next;
  if(!save()){ state.settings.background=prev; applyBackground(); toast(t("bgTooLarge"),"err"); return false; }
  applyBackground(); syncBgUI(); return true;
}

/* ===== 事件绑定 ===== */
$("#setGlass").addEventListener("change", function(e){ state.settings.glass=e.target.checked; applyGlass(); syncBgUI(); save(); });
$("#setRefract").addEventListener("change", function(e){ state.settings.refraction=e.target.checked; applyGlass(); save(); });
$("#setGlassOpacity").addEventListener("input", function(e){
  var v=Math.max(8, Math.min(85, +e.target.value||45));
  state.settings.glassOpacity=v;
  var ov=$("#glassOpacityVal"); if(ov) ov.textContent=v+"%";
  document.documentElement.style.setProperty("--glass-a", (v/100).toFixed(3));
});
$("#setGlassOpacity").addEventListener("change", function(){ save(); });

$("#bgTypeSeg").addEventListener("click", function(e){
  var b=e.target.closest("[data-bgtype]"); if(!b) return;
  var type=b.getAttribute("data-bgtype"), cur=state.settings.background||{};
  if(type==="image" && !cur.image){ $("#bgInput").click(); return; } // 无图片则先选图
  setBackground({ type:type, live:cur.live||"aurora", image:cur.image||null, wallpaperCat:cur.wallpaperCat||"nature", wallpaperSource:cur.wallpaperSource||"unsplash", wallpaperRotate:wallpaperRotateMin(cur) });
});

$("#bgLiveRow").addEventListener("click", function(e){
  var b=e.target.closest("[data-live]"); if(!b) return;
  var cur=state.settings.background||{};
  setBackground({ type:"live", live:b.getAttribute("data-live"), image:cur.image||null, wallpaperCat:cur.wallpaperCat||"nature", wallpaperSource:cur.wallpaperSource||"unsplash", wallpaperRotate:wallpaperRotateMin(cur) });
});

$("#bgWallRow").addEventListener("click", function(e){
  var cur=state.settings.background||{};
  var cat=e.target.closest("[data-wallcat]");
  if(cat){ setBackground({ type:"wallpaper", live:cur.live||"aurora", image:cur.image||null, wallpaperCat:cat.getAttribute("data-wallcat"), wallpaperSource:cur.wallpaperSource||"unsplash", wallpaperRotate:wallpaperRotateMin(cur) }); return; }
  if(e.target.closest("[data-wallshuffle]")){ _wallShuffle++; _bgSig=null; applyBackground(); toast(t("bgShuffled"),"ok"); }
});

$("#wallSourceSeg").addEventListener("click", function(e){
  var b=e.target.closest("[data-wallsource]"); if(!b) return;
  var cur=state.settings.background||{};
  setBackground({ type:"wallpaper", live:cur.live||"aurora", image:cur.image||null, wallpaperCat:cur.wallpaperCat||"nature", wallpaperSource:b.getAttribute("data-wallsource"), wallpaperRotate:wallpaperRotateMin(cur) });
});

$("#wallRotateSeg").addEventListener("click", function(e){
  var b=e.target.closest("[data-wallrotate]"); if(!b) return;
  var cur=state.settings.background||{}, rot=Number(b.getAttribute("data-wallrotate"));
  if(WALL_ROTATE_OPTIONS.indexOf(rot)===-1) rot=30;
  setBackground({ type:"wallpaper", live:cur.live||"aurora", image:cur.image||null, wallpaperCat:cur.wallpaperCat||"nature", wallpaperSource:cur.wallpaperSource||"unsplash", wallpaperRotate:rot });
});

$("#bgDownloadWall").addEventListener("click", downloadCurrentWallpaper);
$("#bgUpload").addEventListener("click", function(){ $("#bgInput").click(); });

$("#bgRemove").addEventListener("click", function(){
  var cur=state.settings.background||{};
  setBackground({ type:"gradient", live:cur.live||"aurora", image:null, wallpaperCat:cur.wallpaperCat||"nature", wallpaperSource:cur.wallpaperSource||"unsplash", wallpaperRotate:wallpaperRotateMin(cur) });
  toast(t("bgImageReset"),"ok");
});

$("#bgInput").addEventListener("change", function(e){
  var f=e.target.files&&e.target.files[0]; e.target.value=""; if(!f) return;
  if(!/^image\//.test(f.type)){ toast(t("chooseImage"),"err"); return; }
  var reader=new FileReader();
  reader.onload=function(){
    var img=new Image();
    img.onload=function(){
      try{
        var max=1920, scale=Math.min(1, max/Math.max(img.width,img.height));
        var w=Math.max(1,Math.round(img.width*scale)), h=Math.max(1,Math.round(img.height*scale));
        var cv=document.createElement("canvas"); cv.width=w; cv.height=h;
        cv.getContext("2d").drawImage(img,0,0,w,h);
        var data=cv.toDataURL("image/jpeg",0.82);
        var cur=state.settings.background||{};
        if(setBackground({ type:"image", live:cur.live||"aurora", image:data, wallpaperCat:cur.wallpaperCat||"nature", wallpaperSource:cur.wallpaperSource||"unsplash", wallpaperRotate:wallpaperRotateMin(cur) })) toast(t("bgImageSet"),"ok");
      }catch(err){ toast(t("couldntImage"),"err"); }
    };
    img.onerror=function(){ toast(t("couldntImage"),"err"); };
    img.src=String(reader.result);
  };
  reader.onerror=function(){ toast(t("couldntImage"),"err"); };
  reader.readAsDataURL(f);
});
