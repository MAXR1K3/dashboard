/* widgets.js — 顶部小组件：时钟/搜索/天气/日历/常用/最近 + 组件拖拽 */
"use strict";

/* ===== widgets ===== */
function anyWidgetOn(){ for(var i=0;i<WKEYS.length;i++){ if(state.settings.widgets[WKEYS[i]]) return true; } return false; }
function renderWidgets(){
  stopClockTimer();
  if(typeof stopMonTimer==="function") stopMonTimer();
  var head=$("#widgetsHead"), wrap=$("#widgetsWrap"), s=state.settings;
  if(s.widgetsHidden || !anyWidgetOn()){ wrap.style.display="none"; return; }
  wrap.style.display=""; head.classList.toggle("collapsed", !!s.widgetsCollapsed);
  if(s.widgetsCollapsed){ widgetsEl.classList.add("hidden"); widgetsEl.innerHTML=""; return; }
  widgetsEl.classList.remove("hidden");
  normalizeWidgetOrder();
  var html="", idx=0;
  s.widgetOrder.forEach(function(key){
    if(!s.widgets[key]) return;
    var body, icon, title;
    if(key==="clock"){ icon=ICONS.clock; title=t("clock"); body=clockBody(); }
    else if(key==="search"){ icon=ICONS.gsearch; title=t("webSearch"); body=searchBody(); }
    else if(key==="weather"){ icon=ICONS.cloud; title=t("weather"); body='<div id="wxBody">'+weatherBody()+'</div>'; }
    else if(key==="netinfo"){ icon=ICONS.globe; title=t("ipLocation"); body='<div id="netinfoBody">'+netinfoBody()+'</div>'; }
    else if(key==="calendar"){ icon=ICONS.cal; title=t("calendar"); body='<div id="calBody">'+calendarBody()+'</div>'; }
    else if(key==="frequent"){ icon=ICONS.star; title=t("frequentlyUsed"); body=listBody("frequent"); }
    else if(key==="monitor"){ icon=ICONS.server; title=t("monitorTitle"); body=monitorBody(); }
    else { icon=ICONS.history; title=t("recentlyOpened"); body=listBody("recent"); }
    var anim=s.animations?(' style="animation-delay:'+(idx*0.06).toFixed(2)+'s"'):'';
    html+='<div class="widget" data-w="'+key+'"'+anim+'>'+
      '<div class="w-head" draggable="true" title="'+escapeHtml(t("dragReorderW"))+'"><h3>'+icon+escapeHtml(title)+'</h3><span class="w-grip" aria-hidden="true">'+ICONS.grip+'</span></div>'+body+'</div>';
    idx++;
  });
  widgetsEl.innerHTML=html;
  if(s.widgets.clock){ startClockTimer(); }
  if(s.widgets.weather){ ensureWeather(); }
  if(s.widgets.netinfo){ ensureNetInfo(); }
  if(s.widgets.monitor && typeof ensureMonitor==="function"){ ensureMonitor(); }
  layoutWidgets(false);      // 初次渲染先稳定落位，避免从空布局飞入
  scheduleWidgetLayout(false); // 再排一帧，补上同步测量后可能发生的内容变化
}

/* ===== Masonry 布局：按内容高度给每个组件分配 grid-row span，消除拉伸留白、保持源顺序 ===== */
var _wLayoutRAF=0, _wMoveTimer=0;
function scheduleWidgetLayout(animate){ if(_wLayoutRAF) return; _wLayoutRAF=requestAnimationFrame(function(){ _wLayoutRAF=0; layoutWidgets(animate!==false); }); }
function widgetRectMap(){
  var m={};
  $all(".widget", widgetsEl).forEach(function(w){
    if(w.classList.contains("draggingw")) return;
    var k=w.getAttribute("data-w"), r=w.getBoundingClientRect();
    if(k&&r.width&&r.height) m[k]={left:r.left,top:r.top};
  });
  return m;
}
function animateWidgetMoves(before){
  if(!before||dragW||document.hidden) return;
  var changed=false, movers=[];
  $all(".widget", widgetsEl).forEach(function(w){
    if(w.classList.contains("draggingw")) return;
    var k=w.getAttribute("data-w"), b=before[k]; if(!b) return;
    var r=w.getBoundingClientRect(), dx=b.left-r.left, dy=b.top-r.top;
    if(Math.abs(dx)<1&&Math.abs(dy)<1) return;
    changed=true; movers.push(w);
    w.classList.add("movingw");
    w.style.transition="none";
    w.style.transform="translate3d("+dx+"px,"+dy+"px,0)";
  });
  if(!changed) return;
  if(_wMoveTimer){ clearTimeout(_wMoveTimer); _wMoveTimer=0; }
  widgetsEl.classList.add("layout-moving");
  // Force style commit before animating back to the natural grid position.
  void widgetsEl.offsetHeight;
  movers.forEach(function(w){
    w.style.transition="transform .32s cubic-bezier(.2,.8,.2,1), box-shadow .24s var(--ease), border-color .2s, background .2s";
    w.style.transform="";
  });
  _wMoveTimer=setTimeout(function(){
    _wMoveTimer=0;
    widgetsEl.classList.remove("layout-moving");
    $all(".widget.movingw", widgetsEl).forEach(function(w){ w.classList.remove("movingw"); w.style.transition=""; w.style.transform=""; });
  }, 380);
}
function layoutWidgets(animate){
  if(!widgetsEl) return;
  if(dragW) return;          // 拖拽进行中不重排，避免把被拖组件的占位高度算回去引起抖动
  var cs=getComputedStyle(widgetsEl);
  if(cs.display!=="grid") return;
  var before=animate===false?null:widgetRectMap();
  var rowH=parseFloat(cs.gridAutoRows)||6, gap=14;
  var ws=$all(".widget", widgetsEl);
  for(var i=0;i<ws.length;i++){
    var w=ws[i]; if(w.classList.contains("draggingw")) continue;
    var h=w.getBoundingClientRect().height; if(!h) continue;
    w.style.gridRowEnd="span "+Math.max(1, Math.ceil((h+gap)/rowH));
  }
  if(animate!==false) animateWidgetMoves(before);
}
window.addEventListener("resize", scheduleWidgetLayout, {passive:true});

function clockBody(){
  return '<div class="clock-wrap">'+
    '<div class="clock-digits" id="wTime"></div>'+
    '<div class="clock-date" id="wDate"></div>'+
    '<div class="clock-greet" id="wGreet"></div>'+
  '</div>';
}
function tickClock(){
  var el=$("#wTime"); if(!el) return;
  var d=new Date(), h=d.getHours(), m=d.getMinutes(), sec=d.getSeconds();
  var is24=!!state.settings.clock24h, ampm=h>=12?"PM":"AM", mm=m<10?("0"+m):m;
  var hh=is24?(h<10?("0"+h):h):(h%12||12);
  var html='<span class="ch">'+hh+'</span><span class="csep">:</span><span class="ch">'+mm+'</span>';
  if(!is24) html+='<span class="campm">'+ampm+'</span>';
  if(state.settings.clockSeconds){
    var ss=sec<10?("0"+sec):sec;
    html+='<span class="csec">:'+ss+'</span>';
  }
  el.innerHTML=html;
  var de=$("#wDate");
  if(de) de.textContent=d.toLocaleDateString(LOCALE[state.settings.lang],{weekday:"long",month:"long",day:"numeric"});
  var g=$("#wGreet");
  if(g) g.textContent=h<5?t("goodNight"):h<12?t("goodMorning"):h<18?t("goodAfternoon"):t("goodEvening");
}
function stopClockTimer(){
  if(clockTimer){ clearTimeout(clockTimer); clearInterval(clockTimer); clockTimer=null; }
}
function startClockTimer(){
  stopClockTimer();
  if(document.hidden || !$("#wTime")) return;
  tickClock();
  layoutWidgets();
  scheduleClockTick();
}
function scheduleClockTick(){
  var cadence=state.settings.clockSeconds?1000:60000;
  var delay=cadence-(Date.now()%cadence)+25;
  clockTimer=setTimeout(function(){ tickClock(); scheduleClockTick(); }, delay);
}
document.addEventListener("visibilitychange", function(){
  if(document.hidden) stopClockTimer();
  else if($("#wTime")) startClockTimer();
});
function currentEngine(){ var k=state.settings.searchEngine||"google"; return ENGINES[k]?k:"google"; }
function searchBody(){
  var cur=currentEngine(), chips="";
  engineDisplayOrder().forEach(function(k){ var e=ENGINES[k]; chips+='<button type="button" class="engine-pill'+(k===cur?" on":"")+'" data-engine="'+k+'"><span class="ed" style="background:'+e.c+'"></span>'+escapeHtml(e.label)+'</button>'; });
  return '<div class="engine-strip">'+chips+'</div><form class="gform" id="gForm"><input name="q" type="text" placeholder="'+escapeHtml(t("searchWebPh"))+'" autocomplete="off" /><button type="submit" title="'+escapeHtml(ENGINES[cur].label)+'">'+ICONS.gsearch+'</button></form><div class="g-hint">'+escapeHtml(t("searchHint",{engine:ENGINES[cur].label}))+'</div>';
}
function runWebSearch(q){ q=String(q||"").trim(); if(!q) return; var k=currentEngine(), e=ENGINES[k]||ENGINES.google; bumpEngineUsage(k); save(); window.open(e.url+encodeURIComponent(q),"_blank","noopener"); }

var WMO={0:["Clear","☀️"],1:["Mainly clear","🌤️"],2:["Partly cloudy","⛅"],3:["Overcast","☁️"],45:["Fog","🌫️"],48:["Rime fog","🌫️"],51:["Light drizzle","🌦️"],53:["Drizzle","🌦️"],55:["Heavy drizzle","🌦️"],56:["Freezing drizzle","🌧️"],57:["Freezing drizzle","🌧️"],61:["Light rain","🌦️"],63:["Rain","🌧️"],65:["Heavy rain","🌧️"],66:["Freezing rain","🌧️"],67:["Freezing rain","🌧️"],71:["Light snow","🌨️"],73:["Snow","🌨️"],75:["Heavy snow","❄️"],77:["Snow grains","❄️"],80:["Showers","🌦️"],81:["Showers","🌦️"],82:["Heavy showers","⛈️"],85:["Snow showers","🌨️"],86:["Snow showers","🌨️"],95:["Thunderstorm","⛈️"],96:["Thunderstorm","⛈️"],99:["Thunderstorm","⛈️"]};
var weatherSearchResults=[], weatherSearching=false, weatherSearchQuery="";
function weatherLabel(g){
  return [g.name, g.admin2, g.admin1, g.country_code||g.country].filter(Boolean).filter(function(v,i,a){ return a.indexOf(v)===i; }).join(", ");
}
function weatherPanel(){
  if(ui.weatherPanel==="forecast") return weatherForecastPanel();
  if(ui.weatherPanel==="search") return weatherSearchPanel();
  return "";
}
function weatherForecastPanel(){
  var d=weatherCache&&weatherCache.data, daily=d&&d.daily;
  if(!daily||!daily.length) return "";
  var unit=state.settings.weatherUnit==="f"?"°F":"°C";
  var rows=daily.slice(0,7).map(function(day,i){
    var info=WMO[day.code]||["",""];
    var dt=new Date(day.date+"T12:00:00");
    var name=i===0?t("today"):dt.toLocaleDateString(LOCALE[state.settings.lang],{weekday:"short"});
    var pop=day.pop!=null?('<span class="wx-pop">'+Math.round(day.pop)+'%</span>'):"";
    return '<div class="wx-day"><span class="wx-day-name">'+escapeHtml(name)+'</span><span class="wx-day-ico">'+info[1]+'</span><span class="wx-day-temp">'+Math.round(day.max)+unit+' / '+Math.round(day.min)+unit+'</span>'+pop+'</div>';
  }).join("");
  return '<div class="wx-panel"><div class="wx-panel-head"><b>'+escapeHtml(t("forecast7"))+'</b><button class="link-btn" data-wact="closePanel">'+escapeHtml(t("close"))+'</button></div>'+rows+'</div>';
}
function weatherSearchPanel(){
  var results="";
  if(weatherSearching) results='<div class="wx-msg">'+escapeHtml(t("searchingArea"))+'</div>';
  else if(weatherSearchResults.length){
    results='<div class="wx-results">'+weatherSearchResults.map(function(g,i){
      return '<button type="button" data-wloc="'+i+'"><span>'+escapeHtml(weatherLabel(g))+'</span><small>'+escapeHtml([g.latitude&&Number(g.latitude).toFixed(2),g.longitude&&Number(g.longitude).toFixed(2)].filter(Boolean).join(", "))+'</small></button>';
    }).join("")+'</div>';
  } else if(weatherSearchQuery){
    results='<div class="wx-msg">'+escapeHtml(t("cityNotFound"))+'</div>';
  }
  return '<div class="wx-panel"><div class="wx-panel-head"><b>'+escapeHtml(t("areaSearch"))+'</b><button class="link-btn" data-wact="closePanel">'+escapeHtml(t("close"))+'</button></div><form class="wx-set" id="wxSearchForm"><input type="text" id="wxSearchCity" value="'+escapeHtml(weatherSearchQuery)+'" placeholder="'+escapeHtml(t("enterCity"))+'" /><button class="btn primary" type="submit" style="height:36px;padding:0 12px;">'+escapeHtml(t("searchArea"))+'</button></form>'+results+'<button class="link-btn" data-wact="geo" style="margin-top:8px;">'+escapeHtml(t("useMyLocation"))+'</button></div>';
}
function weatherBody(){
  var s=state.settings;
  if(weatherCache&&weatherCache.data){
    var d=weatherCache.data, info=WMO[d.code]||["",""], unit=s.weatherUnit==="f"?"°F":"°C";
    return '<div class="wx"><div class="emoji">'+info[1]+'</div><div><div class="temp">'+Math.round(d.temp)+unit+'</div><div class="desc">'+escapeHtml(info[0])+'</div><div class="loc">'+escapeHtml(s.weather?s.weather.label:"")+'</div></div></div>'+
      '<div class="wx-extra"><div>'+escapeHtml(t("wind"))+' <b>'+Math.round(d.wind)+(s.weatherUnit==="f"?" mph":" km/h")+'</b></div><div>'+escapeHtml(t("humidity"))+' <b>'+(d.hum!=null?d.hum+"%":"—")+'</b></div><div class="spacer"></div><button class="link-btn" data-wact="forecast">'+escapeHtml(t("forecast7"))+'</button><button class="link-btn" data-wact="changeWeather">'+escapeHtml(t("changeArea"))+'</button><div class="wx-unit"><button data-unit="c" class="'+(s.weatherUnit==="c"?"on":"")+'">°C</button><button data-unit="f" class="'+(s.weatherUnit==="f"?"on":"")+'">°F</button></div></div>'+weatherPanel();
  }
  if(weatherCache&&weatherCache.error==="locate"){
    ui.weatherPanel="search";
    return '<div class="wx-msg">'+escapeHtml(t("setLocation"))+'</div>'+weatherSearchPanel();
  }
  if(weatherCache&&weatherCache.error){
    return '<div class="wx-msg">'+escapeHtml(t("couldntLoad"))+' <button class="link-btn" data-wact="retry">'+escapeHtml(t("retry"))+'</button></div>'+weatherSearchPanel();
  }
  return '<div class="wx-skel"></div>';
}
function ensureWeather(){
  var s=state.settings;
  if(weatherCache&&weatherCache.data){ var key=s.weather?(s.weather.lat+","+s.weather.lon+","+s.weatherUnit):""; if(weatherCache.key===key&&(Date.now()-weatherCache.ts)<15*60*1000) return; }
  if(s.weather){ fetchWeather(s.weather.lat, s.weather.lon); return; }
  if(!ui.geoTried){
    ui.geoTried=true;
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(function(pos){ state.settings.weather={lat:pos.coords.latitude,lon:pos.coords.longitude,label:t("useMyLocation")}; save(); fetchWeather(state.settings.weather.lat,state.settings.weather.lon); },
        function(){ weatherCache={error:"locate"}; refreshWeatherDom(); }, {timeout:8000,maximumAge:600000});
    } else { weatherCache={error:"locate"}; refreshWeatherDom(); }
  } else if(!weatherCache){ weatherCache={error:"locate"}; refreshWeatherDom(); }
}
function fetchWeather(lat,lon){
  var s=state.settings, key=lat+","+lon+","+s.weatherUnit;
  var tu=s.weatherUnit==="f"?"fahrenheit":"celsius", wu=s.weatherUnit==="f"?"mph":"kmh";
  var url="https://api.open-meteo.com/v1/forecast?latitude="+lat+"&longitude="+lon+"&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7&timezone=auto&temperature_unit="+tu+"&wind_speed_unit="+wu;
  fetch(url).then(function(r){ return r.json(); }).then(function(j){
    var c=j.current||{}, dy=j.daily||{}, days=[];
    (dy.time||[]).forEach(function(day,i){ days.push({date:day, code:(dy.weather_code||[])[i], max:(dy.temperature_2m_max||[])[i], min:(dy.temperature_2m_min||[])[i], pop:(dy.precipitation_probability_max||[])[i]}); });
    weatherCache={key:key,ts:Date.now(),data:{temp:c.temperature_2m,code:c.weather_code,wind:c.wind_speed_10m,hum:c.relative_humidity_2m,daily:days}};
    refreshWeatherDom();
  }).catch(function(){ weatherCache={error:"net",ts:Date.now()}; refreshWeatherDom(); });
}
function refreshWeatherDom(){ var b=$("#wxBody"); if(b){ b.innerHTML=weatherBody(); layoutWidgets(); } }
function refreshCalDom(){ var b=$("#calBody"); if(b){ b.innerHTML=calendarBody(); layoutWidgets(); } }

/* ===== IP & location widget ===== */
function niRow(k,v){ return '<div class="ni-row"><span class="ni-k">'+escapeHtml(k)+'</span><span class="ni-v" title="'+escapeHtml(v)+'">'+escapeHtml(v)+'</span></div>'; }
function netinfoBody(){
  if(netInfoCache&&netInfoCache.data){
    var d=netInfoCache.data, loc=[d.city,d.region].filter(Boolean).join(", ");
    var rows=niRow("IP", d.ip||"—");
    if(d.isp) rows+=niRow(t("ipISP"), d.isp);
    return '<div class="netinfo">'+
      '<div class="ni-top">'+(d.flag?'<span class="ni-flag">'+escapeHtml(d.flag)+'</span>':ICONS.globe)+
        '<div class="ni-loc"><div class="ni-city">'+escapeHtml(loc||d.country||t("ipUnknown"))+'</div>'+
        '<div class="ni-country">'+escapeHtml(loc?d.country:"")+'</div></div></div>'+
      '<div class="ni-rows">'+rows+'</div></div>';
  }
  if(netInfoCache&&netInfoCache.error){
    return '<div class="wx-msg">'+escapeHtml(t("ipError"))+' <button class="link-btn" data-wact="ipretry">'+escapeHtml(t("retry"))+'</button></div>';
  }
  return '<div class="wx-skel"></div>';
}
function refreshNetInfoDom(){ var b=$("#netinfoBody"); if(b){ b.innerHTML=netinfoBody(); layoutWidgets(); } }
function ensureNetInfo(){
  if(netInfoCache&&netInfoCache.loading) return;
  if(netInfoCache&&netInfoCache.data&&(Date.now()-netInfoCache.ts)<30*60*1000) return;
  fetchNetInfo();
}
function fetchNetInfo(){
  netInfoCache={loading:true};
  fetch("https://ipwho.is/").then(function(r){ return r.json(); }).then(function(j){
    if(j&&j.success!==false&&j.ip) return { ip:j.ip, city:j.city, region:j.region, country:j.country, flag:(j.flag&&j.flag.emoji)||"", isp:(j.connection&&(j.connection.isp||j.connection.org))||"" };
    throw new Error("bad");
  }).catch(function(){
    return fetch("https://ipapi.co/json/").then(function(r){ return r.json(); }).then(function(j){
      if(j&&j.ip) return { ip:j.ip, city:j.city, region:j.region, country:j.country_name||j.country, flag:"", isp:j.org||"" };
      throw new Error("bad");
    });
  }).then(function(d){
    netInfoCache={ts:Date.now(),data:d}; refreshNetInfoDom();
  }).catch(function(){
    netInfoCache={error:1,ts:Date.now()}; refreshNetInfoDom();
  });
}

function easterDate(y){ var a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),mo=Math.floor((h+l-7*m+114)/31),da=((h+l-7*m+114)%31)+1; return new Date(y,mo-1,da); }
function addDays(d,n){ var x=new Date(d); x.setDate(x.getDate()+n); return x; }
function md(d){ return (d.getMonth()+1)+"-"+d.getDate(); }
// day-of-month for the nth given weekday of a month (dow: 0=Sun..6=Sat), and for the last such weekday
function nthDow(y,month0,dow,n){ var first=new Date(y,month0,1).getDay(); return 1+((dow-first+7)%7)+(n-1)*7; }
function lastDow(y,month0,dow){ var last=new Date(y,month0+1,0), ld=last.getDate(); return ld-((last.getDay()-dow+7)%7); }
function holidayMap(y){
  var l=state.settings.lang, m={};
  function add(month,day,en,zh,es){ if(day>=1) m[month+"-"+day]=l==="zh"?zh:(l==="es"?es:en); }
  add(1,1,"New Year’s Day","元旦","Año Nuevo");
  if(l==="zh"){
    add(2,14,"Valentine’s Day","情人节","San Valentín");
    add(3,8,"Women’s Day","妇女节","Día de la Mujer");
    add(5,1,"Labour Day","劳动节","Día del Trabajo");
    add(5,4,"Youth Day","青年节","Día de la Juventud");
    add(6,1,"Children’s Day","儿童节","Día del Niño");
    add(9,10,"Teachers’ Day","教师节","Día del Maestro");
    add(10,1,"National Day","国庆节","Día Nacional");
    add(12,24,"Christmas Eve","平安夜","Nochebuena");
    add(12,25,"Christmas","圣诞节","Navidad");
  } else if(l==="es"){
    add(1,6,"Epiphany","主显节","Reyes Magos");
    var e1=easterDate(y); m[md(addDays(e1,-2))]="Viernes Santo"; m[md(addDays(e1,1))]="Lunes de Pascua";
    add(5,1,"Labour Day","劳动节","Día del Trabajo");
    add(8,15,"Assumption Day","圣母升天节","Asunción");
    add(10,12,"National Day of Spain","西班牙国庆日","Día de la Hispanidad");
    add(11,1,"All Saints’ Day","诸圣节","Todos los Santos");
    add(12,6,"Constitution Day","宪法日","Día de la Constitución");
    add(12,8,"Immaculate Conception","圣母无染原罪节","Inmaculada Concepción");
    add(12,25,"Christmas","圣诞节","Navidad");
  } else {
    add(1,nthDow(y,0,1,3),"MLK Jr. Day","马丁·路德·金纪念日","Día de MLK");
    add(2,14,"Valentine’s Day","情人节","San Valentín");
    add(2,nthDow(y,1,1,3),"Presidents’ Day","总统日","Día de los Presidentes");
    add(5,lastDow(y,4,1),"Memorial Day","阵亡将士纪念日","Día de los Caídos");
    add(6,19,"Juneteenth","六月节","Juneteenth");
    add(7,4,"Independence Day","独立日","Día de la Independencia");
    add(9,nthDow(y,8,1,1),"Labor Day","劳动节","Día del Trabajo");
    add(10,31,"Halloween","万圣节前夜","Halloween");
    add(11,11,"Veterans Day","退伍军人节","Día de los Veteranos");
    add(11,nthDow(y,10,4,4),"Thanksgiving","感恩节","Acción de Gracias");
    add(12,25,"Christmas","圣诞节","Navidad");
    add(12,31,"New Year’s Eve","跨年夜","Nochevieja");
  }
  return m;
}

function calendarBody(){
  var y=ui.calYear, m=ui.calMonth, first=new Date(y,m,1), startDow=first.getDay(), days=new Date(y,m+1,0).getDate();
  var today=new Date(), isThis=(today.getFullYear()===y&&today.getMonth()===m);
  var monthName=first.toLocaleDateString(LOCALE[state.settings.lang],{month:"long",year:"numeric"});
  var dows=DOWS[state.settings.lang]||DOWS.en;
  var atToday=isThis;
  var h='<div class="cal-head"><button class="cal-title" data-cal="today" title="'+escapeHtml(t("today"))+'"><span class="m">'+escapeHtml(monthName)+'</span></button><div class="cal-nav"><button data-cal="prev" title="‹">'+ICONS.chevL+'</button><button data-cal="today" class="cal-now'+(atToday?" cur":"")+'" title="'+escapeHtml(t("today"))+'"><span class="dot"></span></button><button data-cal="next" title="›">'+ICONS.chevR+'</button></div></div><div class="cal-grid">';
  dows.forEach(function(d,i){ h+='<div class="dow'+(i===0||i===6?" we":"")+'">'+escapeHtml(d)+'</div>'; });
  for(var i=0;i<startDow;i++){ h+='<div class="day blank"></div>'; }
  var holidays=state.settings.showHolidays===false?{}:holidayMap(y);
  var monthHols=[];
  for(var dd=1;dd<=days;dd++){
    var dow=new Date(y,m,dd).getDay(), we=(dow===0||dow===6);
    var tdy=isThis&&dd===today.getDate(), hn=holidays[(m+1)+"-"+dd];
    if(hn) monthHols.push({d:dd,name:hn});
    h+='<div class="day'+(tdy?" today":"")+(we?" we":"")+(hn?" holiday":"")+'"'+(hn?' title="'+escapeHtml(hn)+'"':'')+'>'+dd+'</div>';
  }
  for(var tail=startDow+days; tail<42; tail++){ h+='<div class="day blank"></div>'; }
  h+='</div>';
  if(monthHols.length){
    h+='<div class="cal-hols">';
    monthHols.forEach(function(o){ h+='<div class="cal-hol"'+( (isThis&&o.d===today.getDate())?' data-tdy="1"':'')+'><span class="hd">'+o.d+'</span><span class="hn">'+escapeHtml(o.name)+'</span></div>'; });
    h+='</div>';
  }
  return h;
}
function listBody(kind){
  var items,empty;
  if(kind==="frequent"){ items=state.bookmarks.filter(function(b){return (b.clicks||0)>0;}).sort(function(a,b){return (b.clicks||0)-(a.clicks||0);}).slice(0,5); empty=t("frequentEmpty"); }
  else { items=state.bookmarks.filter(function(b){return (b.lastOpened||0)>0;}).sort(function(a,b){return (b.lastOpened||0)-(a.lastOpened||0);}).slice(0,5); empty=t("recentEmpty"); }
  if(!items.length){ return '<div class="w-empty">'+escapeHtml(empty)+'</div>'; }
  var h='<div class="mini-list">';
  items.forEach(function(b,i){
    var dom=getDomain(b.url), hue=hashHue(dom||b.title), letter=(b.title||dom||"?").trim().charAt(0)||"?", fav=faviconUrl(b.url);
    var badge = kind==="frequent"?'<span class="mbadge">'+b.clicks+'</span>':'<span class="msub mini-time">'+escapeHtml(timeAgo(b.lastOpened))+'</span>';
    var sub = prettyUrl(b.url);
    h+='<div class="mini" style="--i:'+i+'" data-open="'+escapeHtml(b.id)+'" title="'+escapeHtml(b.url)+'"><div class="fav" style="--c:'+hue+'"><span class="letter">'+escapeHtml(letter)+'</span>'+(fav?'<img class="fav-img" loading="lazy" alt="" src="'+escapeHtml(fav)+'"/>':'')+'</div><div class="mtext"><div class="mname">'+escapeHtml(b.title||dom)+'</div><div class="msub">'+escapeHtml(sub)+'</div></div>'+badge+'</div>';
  });
  return h+'</div>';
}

// widget interactions
widgetsEl.addEventListener("click", function(e){
  var eng=e.target.closest("[data-engine]"); if(eng){ state.settings.searchEngine=eng.getAttribute("data-engine"); save(); refreshSearchWidget(); return; }
  var open=e.target.closest("[data-open]"); if(open){ openBookmark(open.getAttribute("data-open")); return; }
  var cal=e.target.closest("[data-cal]"); if(cal){ var a=cal.getAttribute("data-cal"); if(a==="prev"){ ui.calMonth--; if(ui.calMonth<0){ui.calMonth=11;ui.calYear--;} } else if(a==="next"){ ui.calMonth++; if(ui.calMonth>11){ui.calMonth=0;ui.calYear++;} } else { ui.calMonth=new Date().getMonth(); ui.calYear=new Date().getFullYear(); } refreshCalDom(); return; }
  var unit=e.target.closest("[data-unit]"); if(unit){ state.settings.weatherUnit=unit.getAttribute("data-unit"); save(); if(state.settings.weather) fetchWeather(state.settings.weather.lat,state.settings.weather.lon); return; }
  var wloc=e.target.closest("[data-wloc]"); if(wloc){ selectWeatherResult(+wloc.getAttribute("data-wloc")); return; }
  var wact=e.target.closest("[data-wact]"); if(wact){ var act=wact.getAttribute("data-wact"); if(act==="geo"){ ui.geoTried=false; ui.weatherPanel=""; weatherSearchResults=[]; weatherSearchQuery=""; weatherCache=null; state.settings.weather=null; save(); refreshWeatherDom(); ensureWeather(); } else if(act==="retry"){ weatherCache=null; ui.geoTried=false; refreshWeatherDom(); ensureWeather(); } else if(act==="forecast"){ ui.weatherPanel=ui.weatherPanel==="forecast"?"":"forecast"; refreshWeatherDom(); } else if(act==="changeWeather"){ ui.weatherPanel=ui.weatherPanel==="search"?"":"search"; refreshWeatherDom(); } else if(act==="closePanel"){ ui.weatherPanel=""; refreshWeatherDom(); } else if(act==="ipretry"){ netInfoCache=null; refreshNetInfoDom(); ensureNetInfo(); } return; }
});
widgetsEl.addEventListener("submit", function(e){ if(e.target.id==="wxForm"||e.target.id==="wxSearchForm"){ e.preventDefault(); var inp=e.target.querySelector("input"); var city=inp&&inp.value.trim(); if(city) geocodeCity(city); } if(e.target.id==="gForm"){ e.preventDefault(); runWebSearch(e.target.elements.q&&e.target.elements.q.value); } });
function refreshSearchWidget(){ var w=widgetsEl.querySelector('.widget[data-w="search"]'); if(w){ var head=w.querySelector('.w-head'); w.innerHTML=(head?head.outerHTML:"")+searchBody(); } }
widgetsEl.addEventListener("error", function(e){ var tg=e.target; if(tg&&tg.classList&&tg.classList.contains("fav-img")) tg.classList.add("hide"); }, true);

function geocodeCity(city){
  weatherSearching=true; weatherSearchQuery=city; weatherSearchResults=[]; ui.weatherPanel="search"; refreshWeatherDom();
  fetch("https://geocoding-api.open-meteo.com/v1/search?count=8&language="+encodeURIComponent(state.settings.lang==="zh"?"zh":state.settings.lang)+"&name="+encodeURIComponent(city)).then(function(r){return r.json();}).then(function(j){
    weatherSearching=false;
    weatherSearchResults=(j&&j.results)||[];
    if(weatherSearchResults.length===1){ selectWeatherResult(0); return; }
    if(!weatherSearchResults.length) toast(t("cityNotFound"),"err");
    refreshWeatherDom();
  }).catch(function(){ weatherSearching=false; refreshWeatherDom(); toast(t("couldntLookup"),"err"); });
}
function selectWeatherResult(idx){
  var g=weatherSearchResults[idx]; if(!g) return;
  var label=weatherLabel(g);
  state.settings.weather={lat:g.latitude,lon:g.longitude,label:label};
  save(); weatherCache=null; weatherSearchResults=[]; weatherSearchQuery=""; ui.weatherPanel="";
  refreshWeatherDom(); fetchWeather(g.latitude,g.longitude); toast(t("weatherSetTo",{city:g.name}),"ok");
}

// widget reorder — drag the header area (entire .w-head, excluding buttons)
var dragW=null;
widgetsEl.addEventListener("dragstart", function(e){
  // Buttons have draggable="false" but prevent from them anyway
  if(e.target.closest("button")){ e.preventDefault(); return; }
  var head=e.target.closest(".w-head"); if(!head){ e.preventDefault(); return; }
  dragW=head.closest(".widget"); if(!dragW) return;
  e.dataTransfer.effectAllowed="move";
  try{ e.dataTransfer.setData("text/plain", dragW.getAttribute("data-w")); }catch(_){}
  try{ e.dataTransfer.setDragImage(dragW, 28, 16); }catch(_){}
  widgetsEl.classList.add("dragging-active");
  document.body.classList.add("no-select");
  wLastMove=null;
  // 拖拽时把被拖组件压成细条占位：移动它几乎不改变其它组件的瀑布流高度，避免重排抖动
  setTimeout(function(){ if(dragW){ dragW.classList.add("draggingw"); dragW.style.gridRowEnd="span 9"; } },0);
});
var wLastMove=null;
widgetsEl.addEventListener("dragover", function(e){
  if(!dragW) return; e.preventDefault(); e.dataTransfer.dropEffect="move";
  // 抖动抑制（迟滞）：上次成功重排后，指针需再移动一段距离才重新判定，避免重排反馈循环
  if(wLastMove&&Math.hypot(e.clientX-wLastMove.x,e.clientY-wLastMove.y)<16) return;
  var pos=widgetAfter(e.clientX,e.clientY), moved=false;
  if(!pos.el){ if(widgetsEl.lastElementChild!==dragW){ widgetsEl.appendChild(dragW); moved=true; } }
  else if(pos.before){ if(pos.el!==dragW&&dragW.nextElementSibling!==pos.el){ widgetsEl.insertBefore(dragW,pos.el); moved=true; } }
  else { if(pos.el!==dragW&&pos.el.nextElementSibling!==dragW){ widgetsEl.insertBefore(dragW,pos.el.nextSibling); moved=true; } }
  if(moved) wLastMove={x:e.clientX,y:e.clientY};
});
widgetsEl.addEventListener("drop", function(e){ if(dragW) e.preventDefault(); });
widgetsEl.addEventListener("dragend", function(){ if(dragW){ dragW.classList.remove("draggingw"); dragW.style.gridRowEnd=""; } widgetsEl.classList.remove("dragging-active"); document.body.classList.remove("no-select"); commitWidgetOrder(); dragW=null; wLastMove=null; layoutWidgets(); });
// 最近中心点判定：取指针到各组件中心距离最近者，再按指针处于其左/右半侧决定前/后插入。
// 整块组件区域都参与命中（判定范围更大、更跟手），并适配瀑布流的错位高度。
function widgetAfter(x,y){
  var els=$all(".widget:not(.draggingw)",widgetsEl);
  if(!els.length) return {el:null,before:true};
  var best=null, bestD=Infinity, before=true;
  for(var i=0;i<els.length;i++){
    var b=els[i].getBoundingClientRect(), cx=b.left+b.width/2, cy=b.top+b.height/2;
    var dx=x-cx, dy=y-cy, d=dx*dx+dy*dy;
    if(d<bestD){ bestD=d; best=els[i]; before=(x<cx); }
  }
  return {el:best,before:before};
}
function commitWidgetOrder(){
  var order=$all(".widget",widgetsEl).map(function(el){ return el.getAttribute("data-w"); });
  WKEYS.forEach(function(k){ if(order.indexOf(k)===-1) order.push(k); });
  state.settings.widgetOrder=order; save();
}

function openBookmark(id){ var b=byId(id); if(!b) return; var url=normalizeUrl(b.url); if(!isWebUrl(url)){ toast(t("invalidUrl"),"err"); return; } b.clicks=(b.clicks||0)+1; b.lastOpened=Date.now(); save(); window.open(url,"_blank","noopener"); }
