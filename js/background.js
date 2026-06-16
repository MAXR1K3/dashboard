/* background.js — 液态玻璃外观 + 自定义背景图片 / 动态壁纸 */
"use strict";

var LIVE_PRESETS = ["aurora","sunset","ocean","mesh"];

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
  // 签名守卫：避免每次 render 都重设大体积的 dataURL，导致背景闪烁/重绘
  var sig=bg.type+"|"+live+"|"+(bg.type==="image"&&bg.image?bg.image.length:0);
  if(sig===_bgSig) return; _bgSig=sig;
  el.style.backgroundImage="";
  if(bg.type==="image"&&bg.image){
    el.className="image";
    el.style.backgroundImage="url('"+bg.image.replace(/'/g,"%27")+"')";
  } else if(bg.type==="live"){
    el.className="live live-"+live;
  } else {
    el.className="";
  }
  // 动态壁纸会放大玻璃重绘成本；body.bg-live 交给 CSS 做滚动/低功耗降级
  document.body.classList.toggle("bg-live", bg.type==="live");
}

/* ===== 设置面板同步 ===== */
function syncBgUI(){
  var bg=state.settings.background||{type:"gradient"};
  $all('#bgTypeSeg [data-bgtype]').forEach(function(b){ b.classList.toggle("on", b.getAttribute("data-bgtype")===bg.type); });
  $all('#bgLiveRow .bg-swatch').forEach(function(b){ b.classList.toggle("on", bg.type==="live"&&b.getAttribute("data-live")===(bg.live||"aurora")); });
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
  setBackground({ type:type, live:cur.live||"aurora", image:cur.image||null });
});

$("#bgLiveRow").addEventListener("click", function(e){
  var b=e.target.closest("[data-live]"); if(!b) return;
  var cur=state.settings.background||{};
  setBackground({ type:"live", live:b.getAttribute("data-live"), image:cur.image||null });
});

$("#bgUpload").addEventListener("click", function(){ $("#bgInput").click(); });

$("#bgRemove").addEventListener("click", function(){
  var cur=state.settings.background||{};
  setBackground({ type:"gradient", live:cur.live||"aurora", image:null });
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
        if(setBackground({ type:"image", live:cur.live||"aurora", image:data })) toast(t("bgImageSet"),"ok");
      }catch(err){ toast(t("couldntImage"),"err"); }
    };
    img.onerror=function(){ toast(t("couldntImage"),"err"); };
    img.src=String(reader.result);
  };
  reader.onerror=function(){ toast(t("couldntImage"),"err"); };
  reader.readAsDataURL(f);
});
