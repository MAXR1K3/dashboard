// Navi background.js v1.5 — queues bookmark events while the dashboard is closed.
const api=(typeof browser!=='undefined'&&browser.bookmarks)?browser:chrome;
const MAX_QUEUE=500;

function asPromise(v){ return v&&typeof v.then==='function'?v:Promise.resolve(v); }

api.action.onClicked.addListener(async()=>{
  const dashUrl=api.runtime.getURL('index.html');
  try{
    const tabs=await asPromise(api.tabs.query({}));
    const existing=(tabs||[]).find(t=>t.url&&t.url.indexOf(dashUrl)===0);
    if(existing){
      await asPromise(api.tabs.update(existing.id,{active:true}));
      if(existing.windowId!=null) await asPromise(api.windows.update(existing.windowId,{focused:true}));
    }else{
      await asPromise(api.tabs.create({url:dashUrl}));
    }
  }catch(_){ api.tabs.create({url:dashUrl}); }
});

async function enqueue(ev){
  try{
    const d=await asPromise(api.storage.local.get('naviPending'));
    const q=(d&&d.naviPending)||[];
    q.push(ev);
    await asPromise(api.storage.local.set({naviPending:q.length>MAX_QUEUE?q.slice(q.length-MAX_QUEUE):q}));
  }catch(_){}
}

api.bookmarks.onCreated.addListener(async(id,node)=>{
  if(!node.url) return;
  await enqueue({type:'created',id,node});
});

api.bookmarks.onRemoved.addListener(async(id,info)=>{
  if(info&&info.node&&!info.node.url) return;
  await enqueue({type:'removed',id});
});

api.bookmarks.onChanged.addListener(async(id,changes)=>{
  await enqueue({type:'changed',id,changes});
});

api.bookmarks.onMoved.addListener(async(id,info)=>{
  await enqueue({type:'moved',id,parentId:info.parentId});
});
