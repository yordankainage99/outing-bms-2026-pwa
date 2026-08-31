(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const frame=$("outingFrame"),splash=$("splash"),status=$("splashStatus"),installButton=$("installButton"),iosSheet=$("iosInstallSheet"),errorPanel=$("errorPanel"),errorText=$("errorText"),retryButton=$("retryButton"),directLink=$("directLink");
  let deferredInstallPrompt=null,currentAppUrl="",frameLoaded=false,splashTimer=null;
  const isStandalone=window.matchMedia("(display-mode: standalone)").matches||window.navigator.standalone===true;
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent)&&!window.MSStream;

  function setTheme(brand){
    const root=document.documentElement,primary=brand.primaryColor||"#17324D",secondary=brand.secondaryColor||"#2D527C",background=brand.backgroundColor||"#F4F7FB",version=encodeURIComponent(String(brand.brandVersion||Date.now()));
    root.style.setProperty("--primary",primary);root.style.setProperty("--secondary",secondary);root.style.setProperty("--background",background);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content",primary);document.title=brand.appName||"OUTING BMS 2026";
    $("splashTitle").textContent=brand.appName||"OUTING BMS 2026";$("splashDate").textContent=brand.eventDate||"7–8 November 2026";
    $("splashLogo").src=`/icon/192?v=${version}`;$("appIcon").href=`/icon/192?v=${version}`;$("appleIcon").href=`/icon/180?v=${version}`;
  }
  function showSplash(message){frameLoaded=false;if(message)status.textContent=message;splash.classList.remove("is-hidden")}
  function hideSplash(){if(splashTimer)clearTimeout(splashTimer);splash.classList.add("is-hidden")}
  function showError(message){hideSplash();errorText.textContent=message||"Aplikasi belum dapat dibuka.";errorPanel.hidden=false;if(currentAppUrl){directLink.href=currentAppUrl;directLink.hidden=false}}

  async function loadApp(){
    errorPanel.hidden=true;showSplash("Menyiapkan OUTING BMS 2026…");
    try{
      const response=await fetch("/api/config",{cache:"no-store",headers:{accept:"application/json"}}),config=await response.json();
      if(!response.ok||!config.ok)throw new Error(config.error||"Konfigurasi aplikasi tidak tersedia.");
      currentAppUrl=String(config.appUrl||"").trim();
      if(!/^https:\/\/script\.google\.com\//i.test(currentAppUrl))throw new Error("APPS_SCRIPT_URL harus menggunakan URL deployment Apps Script /exec.");
      setTheme(config.brand||{});status.textContent="Membuka aplikasi…";frameLoaded=false;frame.src=currentAppUrl;
      splashTimer=setTimeout(()=>{if(!frameLoaded)status.textContent="Masih memuat data aplikasi…"},9000);
    }catch(error){showError(error&&error.message?error.message:"Aplikasi gagal dimuat.")}
  }
  frame.addEventListener("load",()=>{frameLoaded=true;setTimeout(hideSplash,280)});retryButton.addEventListener("click",loadApp);
  window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;if(!isStandalone)installButton.hidden=false});
  window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;installButton.hidden=true});
  installButton.addEventListener("click",async()=>{
    if(deferredInstallPrompt){installButton.disabled=true;try{await deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice}finally{deferredInstallPrompt=null;installButton.disabled=false;installButton.hidden=true}return}
    if(isIOS&&!isStandalone)iosSheet.hidden=false;
  });
  document.querySelectorAll("[data-close-install]").forEach(el=>el.addEventListener("click",()=>{iosSheet.hidden=true}));
  if(isIOS&&!isStandalone)installButton.hidden=false;
  if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
  loadApp();
})();
