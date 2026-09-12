const TE = new TextEncoder();

function json(data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      "content-type":"application/json; charset=UTF-8",
      "cache-control":"no-store",
      "x-content-type-options":"nosniff"
    }
  });
}
function html(body,status=200){
  return new Response(body,{
    status,
    headers:{
      "content-type":"text/html; charset=UTF-8",
      "cache-control":"no-store",
      "x-content-type-options":"nosniff"
    }
  });
}
function b64uBytes(s){
  const x=String(s||"").replace(/-/g,"+").replace(/_/g,"/");
  const raw=atob(x+"=".repeat((4-x.length%4)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
function b64u(data){
  const a=data instanceof Uint8Array?data:new Uint8Array(data);
  let s="";
  for(const b of a)s+=String.fromCharCode(b);
  return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function cat(...parts){
  const arr=parts.map(x=>x instanceof Uint8Array?x:new Uint8Array(x));
  const out=new Uint8Array(arr.reduce((n,x)=>n+x.length,0));
  let p=0; for(const x of arr){out.set(x,p);p+=x.length}
  return out;
}
function u32be(n){
  const a=new Uint8Array(4);
  new DataView(a.buffer).setUint32(0,n,false);
  return a;
}
async function hmac(keyBytes,dataBytes){
  const key=await crypto.subtle.importKey("raw",keyBytes,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",key,dataBytes));
}
async function hkdfExpandOne(prk,info,length){
  return (await hmac(prk,cat(info,new Uint8Array([1])))).slice(0,length);
}
function parseJwk(value,name){
  try{
    const j=typeof value==="string"?JSON.parse(value):value;
    if(!j||j.kty!=="EC"||j.crv!=="P-256"||!j.x||!j.y)throw new Error();
    return j;
  }catch{
    throw new Error(name+" belum valid.");
  }
}
function publicRaw(j){
  const x=b64uBytes(j.x),y=b64uBytes(j.y);
  if(x.length!==32||y.length!==32)throw new Error("VAPID_PUBLIC_JWK tidak valid.");
  return cat(new Uint8Array([4]),x,y);
}
function vapidConfig(env){
  const pub=parseJwk(env.VAPID_PUBLIC_JWK,"VAPID_PUBLIC_JWK");
  const priv=parseJwk(env.VAPID_PRIVATE_JWK,"VAPID_PRIVATE_JWK");
  if(!priv.d)throw new Error("VAPID_PRIVATE_JWK tidak memiliki private key.");
  const subject=String(env.VAPID_SUBJECT||"").trim();
  if(!/^mailto:.+@.+\..+$/i.test(subject)&&!/^https:\/\//i.test(subject)){
    throw new Error("VAPID_SUBJECT belum valid.");
  }
  return {pub,priv,subject,raw:publicRaw(pub)};
}
async function vapidJwt(endpoint,env){
  const c=vapidConfig(env);
  const input=
    b64u(TE.encode(JSON.stringify({typ:"JWT",alg:"ES256"})))+"."+
    b64u(TE.encode(JSON.stringify({
      aud:new URL(endpoint).origin,
      exp:Math.floor(Date.now()/1000)+12*60*60,
      sub:c.subject
    })));
  const key=await crypto.subtle.importKey(
    "jwk",
    {kty:"EC",crv:"P-256",x:c.priv.x,y:c.priv.y,d:c.priv.d,ext:true},
    {name:"ECDSA",namedCurve:"P-256"},false,["sign"]
  );
  const sig=new Uint8Array(await crypto.subtle.sign(
    {name:"ECDSA",hash:"SHA-256"},key,TE.encode(input)
  ));
  return {jwt:input+"."+b64u(sig),publicKey:b64u(c.raw)};
}
async function encryptPush(subscription,payloadText){
  const k=subscription?.keys||{};
  const uaPublic=b64uBytes(k.p256dh||"");
  const auth=b64uBytes(k.auth||"");
  if(uaPublic.length!==65||uaPublic[0]!==4)throw new Error("p256dh subscription tidak valid.");
  if(auth.length<16)throw new Error("auth subscription tidak valid.");

  const uaKey=await crypto.subtle.importKey("raw",uaPublic,{name:"ECDH",namedCurve:"P-256"},false,[]);
  const pair=await crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},true,["deriveBits"]);
  const asPublic=new Uint8Array(await crypto.subtle.exportKey("raw",pair.publicKey));
  const shared=new Uint8Array(await crypto.subtle.deriveBits(
    {name:"ECDH",public:uaKey},pair.privateKey,256
  ));

  const prkKey=await hmac(auth,shared);
  const ikm=await hkdfExpandOne(
    prkKey,
    cat(TE.encode("WebPush: info"),new Uint8Array([0]),uaPublic,asPublic),
    32
  );

  const salt=crypto.getRandomValues(new Uint8Array(16));
  const prk=await hmac(salt,ikm);
  const cek=await hkdfExpandOne(prk,cat(TE.encode("Content-Encoding: aes128gcm"),new Uint8Array([0])),16);
  const nonce=await hkdfExpandOne(prk,cat(TE.encode("Content-Encoding: nonce"),new Uint8Array([0])),12);

  const payload=TE.encode(String(payloadText||""));
  if(payload.length>3500)throw new Error("Payload push terlalu besar.");
  const plaintext=cat(payload,new Uint8Array([2]));
  const aes=await crypto.subtle.importKey("raw",cek,{name:"AES-GCM"},false,["encrypt"]);
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt(
    {name:"AES-GCM",iv:nonce,tagLength:128},aes,plaintext
  ));

  return cat(salt,u32be(4096),new Uint8Array([asPublic.length]),asPublic,ciphertext);
}
function safeEndpoint(endpoint){
  try{
    const u=new URL(endpoint);
    return u.protocol==="https:" && !!u.hostname && u.hostname!=="localhost";
  }catch{return false}
}
async function sendOne(subscription,payload,env,priority){
  if(!safeEndpoint(subscription.endpoint))throw new Error("Push endpoint tidak valid.");
  const v=await vapidJwt(subscription.endpoint,env);
  const body=await encryptPush(subscription,payload);
  return fetch(subscription.endpoint,{
    method:"POST",
    headers:{
      "TTL":"3600",
      "Urgency":String(priority||"").toUpperCase()==="URGENT"?"high":"normal",
      "Content-Encoding":"aes128gcm",
      "Content-Type":"application/octet-stream",
      "Authorization":"vapid t="+v.jwt+", k="+v.publicKey
    },
    body
  });
}
async function hmacText(secret,text){
  return hmac(TE.encode(secret),TE.encode(text));
}
function timingEqual(a,b){
  if(a.length!==b.length)return false;
  let x=0;for(let i=0;i<a.length;i++)x|=a[i]^b[i];
  return x===0;
}
async function verifyToken(token,env){
  const secret=String(env.PUSH_BRIDGE_SECRET||"");
  if(!secret)throw new Error("PUSH_BRIDGE_SECRET belum diisi.");
  const parts=String(token||"").split(".");
  if(parts.length!==2)throw new Error("Token push tidak valid.");
  const expected=await hmacText(secret,parts[0]);
  const actual=b64uBytes(parts[1]);
  if(!timingEqual(expected,actual))throw new Error("Signature token push tidak valid.");
  const data=JSON.parse(new TextDecoder().decode(b64uBytes(parts[0])));
  if(!data.userKey||Number(data.exp||0)<Date.now())throw new Error("Token push kedaluwarsa.");
  return data;
}

const SETUP_HTML=`<!doctype html><html lang="id"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Outing BMS Push Setup</title>
<style>
body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f4f7fb;color:#17324d;margin:0;padding:24px}
.card{max-width:850px;margin:auto;background:#fff;border:1px solid #dfe7ee;border-radius:22px;padding:22px}
h1{font-size:1.15rem}p{color:#667b8e;line-height:1.55}
button{background:#17324d;color:#fff;border:0;border-radius:12px;padding:12px 16px;font-weight:800;cursor:pointer}
label{display:block;font-size:.75rem;font-weight:900;margin:16px 0 6px}
textarea{width:100%;height:110px;box-sizing:border-box;border:1px solid #d8e1e8;border-radius:12px;padding:10px;font:12px Consolas,monospace;background:#f8fafc}
.note{background:#fff6dc;border:1px solid #edd99f;padding:10px 12px;border-radius:12px;font-size:.8rem}
</style></head><body><div class="card">
<h1>OUTING BMS 2026 — Web Push Setup</h1>
<p>Generate satu kali. Key dibuat di browser Anda.</p>
<div class="note">Setelah user mulai subscribe, jangan generate ulang VAPID key.</div>
<p><button id="g">GENERATE KEYS & SECRET</button></p>
<label>VAPID_PUBLIC_JWK</label><textarea id="pub" readonly></textarea>
<label>VAPID_PRIVATE_JWK — Secret</label><textarea id="priv" readonly></textarea>
<label>PUSH_BRIDGE_SECRET — Secret</label><textarea id="sec" readonly style="height:65px"></textarea>
</div><script>
function b64u(a){let s="";new Uint8Array(a).forEach(b=>s+=String.fromCharCode(b));return btoa(s).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}
document.getElementById("g").onclick=async()=>{
 const p=await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},true,["sign","verify"]);
 const a=await crypto.subtle.exportKey("jwk",p.publicKey);
 const b=await crypto.subtle.exportKey("jwk",p.privateKey);
 document.getElementById("pub").value=JSON.stringify({kty:"EC",crv:"P-256",x:a.x,y:a.y});
 document.getElementById("priv").value=JSON.stringify({kty:"EC",crv:"P-256",x:b.x,y:b.y,d:b.d});
 document.getElementById("sec").value=b64u(crypto.getRandomValues(new Uint8Array(48)));
};
</script></body></html>`;

async function route(request,env){
  const u=new URL(request.url);
  const path=u.pathname;

  if(path==="/push-key-setup" && request.method==="GET"){
    return html(SETUP_HTML);
  }

  if(path==="/api/push/health" && request.method==="GET"){
    let db=false,vapid=false,dbError="",vapidError="";
    try{
      if(!env.DB)throw new Error("Binding DB belum tersedia.");
      await env.DB.prepare("SELECT 1 AS ok").first();
      db=true;
    }catch(e){dbError=String(e?.message||e)}
    try{vapidConfig(env);vapid=true}catch(e){vapidError=String(e?.message||e)}
    return json({
      ok:db&&vapid&&!!String(env.PUSH_BRIDGE_SECRET||""),
      db,
      vapid,
      bridgeSecret:!!String(env.PUSH_BRIDGE_SECRET||""),
      dbError,
      vapidError
    });
  }

  if(path==="/api/push/public-key" && request.method==="GET"){
    const c=vapidConfig(env);
    return json({ok:true,publicKey:b64u(c.raw)});
  }

  if(path==="/api/push/subscribe" && request.method==="POST"){
    if(!env.DB)throw new Error("Binding DB belum tersedia.");
    const body=await request.json();
    const auth=await verifyToken(body.token,env);
    if(String(body.userKey||"")!==String(auth.userKey||""))throw new Error("User key tidak sesuai.");
    const sub=body.subscription||{};
    if(!sub.endpoint||!sub.keys?.p256dh||!sub.keys?.auth)throw new Error("Subscription tidak lengkap.");
    const now=new Date().toISOString();
    await env.DB.prepare(`INSERT INTO push_subscriptions
      (endpoint,user_key,subscription_json,enabled,created_at,updated_at)
      VALUES(?1,?2,?3,1,?4,?4)
      ON CONFLICT(endpoint) DO UPDATE SET
        user_key=excluded.user_key,
        subscription_json=excluded.subscription_json,
        enabled=1,
        updated_at=excluded.updated_at`)
      .bind(String(sub.endpoint),String(auth.userKey),JSON.stringify(sub),now).run();
    return json({ok:true});
  }

  if(path==="/api/push/send" && request.method==="POST"){
    if(!env.DB)throw new Error("Binding DB belum tersedia.");
    const supplied=String(request.headers.get("x-outing-push-secret")||"");
    const expected=String(env.PUSH_BRIDGE_SECRET||"");
    if(!expected||supplied!==expected)return json({ok:false,error:"Unauthorized"},401);
    vapidConfig(env);

    const body=await request.json();
    const keys=[...new Set(Array.isArray(body.userKeys)?body.userKeys.filter(Boolean):[])].slice(0,1000);
    if(!keys.length)return json({ok:true,sent:0,failed:0,removed:0});

    const q=keys.map((_,i)=>`?${i+1}`).join(",");
    const rows=(await env.DB.prepare(
      `SELECT endpoint,subscription_json FROM push_subscriptions
       WHERE enabled=1 AND user_key IN (${q})`
    ).bind(...keys).all()).results||[];

    const payload=JSON.stringify({
      title:String(body.title||"OUTING BMS 2026"),
      body:String(body.body||""),
      notificationId:String(body.notificationId||""),
      actionPage:String(body.actionPage||"home"),
      actionTarget:String(body.actionTarget||""),
      priority:String(body.priority||"NORMAL")
    });

    let sent=0,failed=0,removed=0;
    const errors=[];
    for(const row of rows){
      try{
        const sub=JSON.parse(row.subscription_json);
        const r=await sendOne(sub,payload,env,body.priority);
        if(r.ok)sent++;
        else if(r.status===404||r.status===410){
          await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint=?1").bind(row.endpoint).run();
          removed++;
        }else{
          failed++; errors.push("HTTP "+r.status);
        }
      }catch(e){
        failed++; errors.push(String(e?.message||e).slice(0,150));
      }
    }
    return json({ok:true,sent,failed,removed,errors:errors.slice(0,5)});
  }

  return null;
}

export default{
  async fetch(request,env){
    try{
      const r=await route(request,env);
      if(r)return r;
      return env.ASSETS.fetch(request);
    }catch(e){
      return json({ok:false,error:String(e?.message||e)},500);
    }
  }
};
