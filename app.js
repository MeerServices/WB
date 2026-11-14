(function(){
"use strict";
const DRIVE="Google Drive";
// Folder ids are looked up by drive.js after login (Werkbonnen/Open, Werkbonnen/Getekend).
const FOLDER=()=>window.WBDrive.folders;
const PARSE_V=2; // bump when parseBon learns new fields; older work orders are re-read from their stored PDF
const $=id=>document.getElementById(id);
const I=n=>'<svg class="i" aria-hidden="true"><use href="#i-'+n+'"/></svg>';
// Snapshots from the store are frozen; work on a deep copy so edits can be made.
const thaw=o=>o==null?o:JSON.parse(JSON.stringify(o));
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let db=null, mcp=null, perms=null, downloads=null, user=null;
let bonnen=[], filter="open", cur=null, curId=null, unsubBon=null, unsubPh=null, photos=[];
let saveT=null, lastPdf=null;

/* ---------- helpers ---------- */
function b64ToBytes(b64){const bin=atob(b64);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u}
function bytesToB64(u){let s="";for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)}
function mins(t){if(!t||!/^\d{1,2}:\d{2}$/.test(t))return null;const[h,m]=t.split(":").map(Number);return h*60+m}
function dur(a,b){const x=mins(a),y=mins(b);if(x==null||y==null)return 0;let d=y-x;if(d<0)d+=1440;return d}
const num=v=>{const n=parseFloat(String(v||"").replace(",","."));return isFinite(n)&&n>0?n:0};
function kmTotal(v){v=v||{};const h=num(v.kmHeen);const t=String(v.kmTerug||"").trim()===""?h:num(v.kmTerug);return Math.round((h+t)*10)/10}
const kmStr=n=>String(n).replace(".",",");
const hm=m=>Math.floor(m/60)+":"+String(m%60).padStart(2,"0");
const dec=m=>(m/60).toFixed(2);
const today=()=>{const d=new Date();return String(d.getDate()).padStart(2,"0")+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+d.getFullYear()};
/* ---------- money ---------- */
// Amounts are typed Dutch style ("1.234,56", "0,23", "85"); "" means: use the calculated value.
function pnum(v){let t=String(v??"").trim().replace(/[€\s]/g,"");if(!t)return null;if(t.includes(","))t=t.replace(/\./g,"").replace(",",".");const n=parseFloat(t);return isFinite(n)&&n>=0?n:null}
const r2=n=>Math.round(n*100)/100;
function eur(n){const neg=n<0;n=Math.abs(r2(n));const[a,b]=n.toFixed(2).split(".");return (neg?"- ":"")+"€ "+a.replace(/\B(?=(\d{3})+(?!\d))/g,".")+","+b}
const qfmt=n=>String(r2(n)).replace(".",",");
const DEF_SET={uurtarief:"",reisTarief:"",kmTarief:"",btw:"21",afronden:"0",minUur:true,medewerkers:[]};
let SET=Object.assign({},DEF_SET);
const norm=s=>String(s||"").toLowerCase().replace(/\s+/g," ").trim();
function mwMatch(naam){const n=norm(naam);if(!n)return "";const L=SET.medewerkers||[];const m=L.find(x=>norm(x.naam)===n)||L.find(x=>norm(x.naam)&&(n.includes(norm(x.naam))||norm(x.naam).includes(n)));return m?m.naam:""}
function pdfTarief(v){const n=pnum(String((v&&v.tarief)||"").replace(/[^\d.,]/g,""));return n&&n!==999?n:null} // MSWMenuX prints 999 when no tarief is set
function kostCalc(bon){
  const v=bon.invoer||{},o=v.kosten||{},S=SET;
  const rnd=+S.afronden||0,up=m=>rnd?Math.ceil(m/rnd)*rnd:m;
  const wm=dur(v.werkVan,v.werkTot)+dur(v.voorbVan,v.voorbTot),rm=dur(v.heenVan,v.heenTot)+dur(v.terugVan,v.terugTot);
  let wAuto=wm?up(wm)/60:0;if(wm&&S.minUur!==false)wAuto=Math.max(1,wAuto);
  const rAuto=rm?up(rm)/60:0;
  const mwName=o.medewerker!=null&&o.medewerker!==""?(o.medewerker==="-"?"":o.medewerker):mwMatch((bon.velden||{}).medewerker);
  const mw=(S.medewerkers||[]).find(x=>x.naam===mwName);
  const uurAuto=pdfTarief(bon.velden)??(mw&&pnum(mw.uurtarief))??pnum(S.uurtarief)??0; // tarief on the bon wins; empty (or 999) falls back to the tarieven table
  const reisAuto=pnum(S.reisTarief)??uurAuto, kmAuto=pnum(S.kmTarief)??0;
  const val=(k,a)=>{const n=pnum(o[k]);return n==null?a:n};
  const isO=k=>pnum(o[k])!=null;
  const rows=[
    {k:"werk",label:"Werkuren",qty:val("werkUren",wAuto),rate:val("uurtarief",uurAuto),o:isO("werkUren")||isO("uurtarief"),unit:"uur"},
    {k:"reis",label:"Reistijd",qty:val("reisUren",rAuto),rate:val("reisTarief",reisAuto),o:isO("reisUren")||isO("reisTarief"),unit:"uur"},
    {k:"km",label:"Kilometers",qty:val("km",kmTotal(v)),rate:val("kmTarief",kmAuto),o:isO("km")||isO("kmTarief"),unit:"km"}];
  rows.forEach(r=>r.amt=r2(r.qty*r.rate));
  const overig=pnum(o.overig)||0;
  const sub=r2(rows.reduce((a,r)=>a+r.amt,0)+overig);
  const kt=o.kortingType==="€"?"€":"%",kv=pnum(o.korting)||0;
  const korting=Math.min(sub,r2(kt==="%"?sub*Math.min(kv,100)/100:kv));
  const ex=r2(sub-korting),btwPct=pnum(S.btw)??21,btw=r2(ex*btwPct/100);
  return {rows,overig,overigOms:o.overigOms||"",sub,kortingType:kt,kortingWaarde:kv,korting,ex,btwPct,btw,incl:r2(ex+btw),medewerker:mwName,auto:{werkUren:wAuto,uurtarief:uurAuto,reisUren:rAuto,reisTarief:reisAuto,km:kmTotal(v),kmTarief:kmAuto}};
}
function show(el,html,kind){el.hidden=!html;el.className="note"+(kind?" "+kind:"");el.innerHTML=html||""}
function driveErr(e){
  const c=e&&e.code;
  if(c==="needs_reauth")return "<b>Je Google-login is verlopen.</b> Kies bovenaan Opnieuw inloggen.";
  if(c==="offline")return "<b>Geen internet.</b> Je werk staat veilig op dit apparaat en gaat naar Drive zodra er weer verbinding is.";
  if(c==="forbidden")return "<b>Je hebt geen toegang tot deze Drive-map.</b> Vraag de beheerder om de map Werkbonnen met je te delen (als Bewerker).";
  if(c==="not_found")return "<b>Bestand of map niet gevonden in Drive.</b> Misschien is het verplaatst of verwijderd.";
  if(c==="server_unavailable"||c==="rate_limited")return "<b>Google Drive reageert even niet.</b> Probeer het over een minuut opnieuw.";
  if(c==="tool_error")return "<b>Google Drive gaf een fout:</b> "+esc(e.message);
  if(c==="not_granted")return "<b>Google Drive is niet bereikbaar.</b> Log opnieuw in met je Google-account.";
  return "<b>Er ging iets mis met Google Drive.</b> "+esc(e&&e.message||"");
}

/* ---------- PDF parsing (layout of MSWMenuX werkbon) ---------- */
async function pdfItems(bytes){
  const doc=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;
  const p=await doc.getPage(1);const tc=await p.getTextContent();
  const vp=p.getViewport({scale:1});
  return {H:vp.height,W:vp.width,items:tc.items.filter(i=>i.str&&i.str.trim()).map(i=>({s:i.str.trim(),x:i.transform[4],y:i.transform[5],w:i.width,size:Math.abs(i.transform[0])||8}))};
}
function parseBon(P){
  const it=P.items;
  const find=(s,pred)=>it.find(i=>i.s===s&&(!pred||pred(i)));
  const line=(y,x0,x1)=>it.filter(i=>Math.abs(i.y-y)<2.5&&i.x>=x0&&i.x<x1).sort((a,b)=>a.x-b.x);
  const right=(lab,x1,pred)=>{const l=typeof lab==="string"?find(lab,pred):lab;if(!l)return"";return line(l.y,l.x+l.w-0.5,x1).filter(i=>i!==l).map(i=>i.s).join(" ").trim()};
  const block=(yTop,yBot,x0,x1,skip)=>{const ls=it.filter(i=>i.y<yTop-1&&i.y>yBot+1&&i.x>=x0&&i.x<x1&&!(skip||[]).includes(i));const ys=[];ls.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(i=>{let g=ys.find(g=>Math.abs(g.y-i.y)<2.5);if(!g){g={y:i.y,a:[]};ys.push(g)}g.a.push(i)});return {text:ys.map(g=>g.a.sort((a,b)=>a.x-b.x).map(i=>i.s).join(" ")).join("\n"),lastY:ys.length?ys[ys.length-1].y:null}};
  const R={};
  const top=i=>i.x>350&&i.y>600;
  // werkbon number
  {const raw=right("Werkbon:",300)||"";const m=/\d{3,}/.exec(raw);R.nr=m?m[0]:raw}
  // klant block (top right)
  const deb=find("DebNr.:");R.debnr=deb?right(deb,600):"";
  const first=it.filter(i=>i.x>350&&i.y>P.H-40).sort((a,b)=>b.size-a.size)[0];
  R.klant=first?line(first.y,350,deb?deb.x-1:600).map(i=>i.s).join(" "):"";
  const addr=(yTop,yBot)=>{const ls=it.filter(i=>i.x>350&&i.y<yTop&&i.y>yBot);if(!ls.length)return"";
    const nrL=ls.find(i=>i.s==="Nr.:");const nr=nrL?line(nrL.y,nrL.x+nrL.w-0.5,600).map(i=>i.s).join(" "):"";
    const skipT=new Set(["Nr.:","Telefoon:","Fax:","Dhr.","Mevr.","Bezoekadres:"]);
    const rows=[];ls.sort((a,b)=>b.y-a.y||a.x-b.x).forEach(i=>{if(skipT.has(i.s)||(nrL&&Math.abs(i.y-nrL.y)<2.5&&i.x>nrL.x))return;let g=rows.find(g=>Math.abs(g.y-i.y)<2.5);if(!g){g={y:i.y,a:[]};rows.push(g)}g.a.push(i)});
    return {rows,nr};};
  const tel=find("Telefoon:",top), dhr=it.find(i=>top(i)&&/^(Dhr\.|Mevr\.|Fam\.)$/.test(i.s));
  R.contact=dhr?line(dhr.y,350,600).map(i=>i.s).join(" "):"";
  R.telefoon=tel?right(tel,600):"";
  const bz=find("Bezoekadres:");const mw=find("Medewerker:",top);
  // klant address: between contact line and Telefoon line
  if(dhr&&tel){const a=addr(dhr.y-1,tel.y+1);if(a){const street=a.rows[0]?a.rows[0].a.filter(i=>i.x<480).map(i=>i.s).join(" "):"";const pc=a.rows.slice(1).map(r=>r.a.map(i=>i.s).join(" ")).join(" ");R.adres=[street&&(street+(a.nr?" "+a.nr:"")),pc].filter(Boolean).join(", ")}}
  if(bz&&mw){const a=addr(bz.y-1,mw.y+1);if(a&&a.rows.length){const street=a.rows[0].a.filter(i=>i.x<470).map(i=>i.s).join(" ");const rest=a.rows.flatMap(r=>r.a.filter(i=>i.x>=470)).map(i=>i.s).join(" ");R.bezoekadres=[street&&(street+(a.nr?" "+a.nr:"")),rest].filter(Boolean).join(", ")}}
  if(!R.bezoekadres)R.bezoekadres=R.adres||"";
  R.medewerker=mw?right(mw,600):"";
  R.plandatum=right("Plandatum:",475,top);
  R.plantijd=right("Plantijd:",600,top);
  R.tarief=right("Tarief ex:",600,top).replace(/^€\s*/,"€ ");
  R.contractnr=right("Service contractnr.:",600,top);R.objectnr=right("Objectnr.:",600,top);R.projectnr=right("ProjectNr.",600,top);
  R._v=PARSE_V;
  R.opdracht=right("Opdracht:",330);
  R.afgesproken=right("Afgesproken met:",330);
  const red=it.find(i=>i.s.startsWith("Reden opdracht:"));R.reden=red?red.s.replace(/^Reden opdracht:\s*/,"").replace(/^Installatie \/ Detachering \/ Storing \/ \.\.\.$/,""):"";
  const con=find("Constatering:"),opl=find("Oplossing:"),nog=find("Nog in te plannen taken:");
  const labels=new Set(it.filter(i=>/:$/.test(i.s)));
  if(con&&opl){const b=block(con.y,opl.y,0,460,[...labels]);R.constatering=b.text;R._conLast=b.lastY}
  if(opl&&nog){const b=block(opl.y,nog.y,0,460,[...labels]);R.oplossing=b.text;R._oplLast=b.lastY}
  // preset werkuren van (MSWMenuX sometimes prints one)
  const wk=find("Werkuren:");
  if(wk){const v=it.filter(i=>i.s==="Van:"&&i.x>440&&i.y<wk.y).sort((a,b)=>b.y-a.y)[0];if(v)R.werkVanPreset=right(v,600)}
  return R;
}

/* ---------- PDF stamping ---------- */
const WIN=s=>String(s||"").replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—]/g,"-").replace(/…/g,"...").replace(/[^\x0A\x20-\x7E -ÿ€]/g,"");
function wrap(text,font,size,width){const out=[];String(text||"").split(/\n/).forEach(par=>{const words=par.split(/\s+/).filter(Boolean);let ln="";if(!words.length){out.push("");return}words.forEach(w=>{const t=ln?ln+" "+w:w;if(font.widthOfTextAtSize(t,size)<=width)ln=t;else{if(ln)out.push(ln);let ww=w;while(font.widthOfTextAtSize(ww,size)>width&&ww.length>1){let k=ww.length;while(k>1&&font.widthOfTextAtSize(ww.slice(0,k),size)>width)k--;out.push(ww.slice(0,k));ww=ww.slice(k)}ln=ww}});if(ln)out.push(ln)});return out}
async function buildPdf(bon,origBytes,phs,opts){
  const {PDFDocument,StandardFonts,rgb}=PDFLib;
  const doc=await PDFDocument.load(origBytes);
  const page=doc.getPage(0);const H=page.getHeight(),W=page.getWidth();
  const F=await doc.embedFont(StandardFonts.Helvetica), FB=await doc.embedFont(StandardFonts.HelveticaBold);
  const P=await pdfItems(origBytes);const it=P.items;
  const find=(s,pred)=>it.find(i=>i.s===s&&(!pred||pred(i)));
  const ink=rgb(0.05,0.12,0.45), grey=rgb(240/255,240/255,240/255);
  const v=bon.invoer||{};const extra=[];
  const put=(x,y,txt,o={})=>{txt=WIN(txt);if(!txt)return;if(o.cover)page.drawRectangle({x:o.cover[0],y:y-2.5,width:o.cover[1]-o.cover[0],height:10,color:o.bg||grey});page.drawText(txt,{x,y,size:o.size||8,font:o.bold?FB:F,color:ink})};
  const area=(x,yStart,yMin,width,text,size,title)=>{if(!text)return;const lines=wrap(WIN(text),F,size,width);let y=yStart;const lh=size*1.3;let i=0;for(;i<lines.length;i++){if(y<yMin)break;page.drawText(lines[i],{x,y,size,font:F,color:ink});y-=lh}if(i<lines.length){extra.push({title,text});const note="(vervolg op bijlage)";page.drawText(note,{x:x+width-F.widthOfTextAtSize(note,7),y:yMin-lh+2,size:7,font:F,color:ink})}};
  // right column times
  const col=it.filter(i=>i.x>440&&i.x<500);
  const reis=find("Reisuren:"),werk=find("Werkuren:");
  const cx=505,cx1=W-24;
  if(reis){const lab=col.filter(i=>i.y<reis.y&&(!werk||i.y>werk.y)).sort((a,b)=>b.y-a.y);
    const vans=lab.filter(i=>i.s==="Van:"),tots=lab.filter(i=>i.s==="Tot:"),tot=lab.find(i=>i.s==="Totaal:");
    if(vans[0])put(cx+7,vans[0].y,v.heenVan,{cover:[cx,cx1]});if(tots[0])put(cx+7,tots[0].y,v.heenTot,{cover:[cx,cx1]});
    if(vans[1])put(cx+7,vans[1].y,v.terugVan,{cover:[cx,cx1]});if(tots[1])put(cx+7,tots[1].y,v.terugTot,{cover:[cx,cx1]});
    const r=dur(v.heenVan,v.heenTot)+dur(v.terugVan,v.terugTot);if(tot&&r)put(cx+7,tot.y,dec(r),{cover:[cx,cx1],bold:true});}
  if(werk){const lab=col.filter(i=>i.y<werk.y&&i.y>werk.y-60).sort((a,b)=>b.y-a.y);
    const van=lab.find(i=>i.s==="Van:"),totl=lab.find(i=>i.s==="Tot:"),tot=lab.find(i=>i.s==="Totaal:");
    if(van&&v.werkVan)put(cx+7,van.y,v.werkVan,{cover:[cx,cx1]});if(totl)put(cx+7,totl.y,v.werkTot,{cover:[cx,cx1]});
    const w=dur(v.werkVan,v.werkTot);if(tot&&w)put(cx+7,tot.y,dec(w),{cover:[cx,cx1],bold:true});}
  const vb=find("Voorbereidingsuren:"),pm=dur(v.voorbVan,v.voorbTot);
  if(vb&&pm){const tot=col.find(i=>i.s==="Totaal:"&&i.y<vb.y&&i.y>vb.y-25);if(tot)put(cx+7,tot.y,dec(pm),{cover:[cx,cx1],bold:true});const dl=col.find(i=>i.s==="Data:"&&i.y<vb.y&&i.y>vb.y-40);if(dl)put(cx+7,dl.y,v.voorbVan+" - "+v.voorbTot,{cover:[cx,cx1]})}
  const kmL=find("KM:");const km=kmTotal(v);
  if(kmL&&km)put(kmL.x+kmL.w+8,kmL.y,kmStr(km),{cover:[kmL.x+kmL.w+4,cx1],bg:rgb(1,1,1),bold:true});
  // texts
  const con=find("Constatering:"),opl=find("Oplossing:"),nog=find("Nog in te plannen taken:"),gel=find("Gel. of ing. goederen:"),onk=find("Onkosten:");
  const lastIn=(yTop,yBot)=>{const ys=it.filter(i=>i.x<460&&i.y<yTop-1&&i.y>yBot+1).map(i=>i.y);return ys.length?Math.min(...ys):yTop};
  const tw=455-21;
  if(con&&opl&&v.constAanv)area(21,lastIn(con.y,opl.y)-11,opl.y+12,tw,v.constAanv,8,"Constatering (aanvulling)");
  if(opl&&nog&&v.oplAanv)area(21,lastIn(opl.y,nog.y)-11,nog.y+12,tw,v.oplAanv,8,"Oplossing (aanvulling)");
  const taken=(v.taken||[]).map(t=>t.t).filter(Boolean);
  if(nog&&taken.length){const x=nog.x+nog.w+6;const lines=wrap(WIN(taken.join("; ")),F,8,455-x);page.drawText(lines[0],{x,y:nog.y,size:8,font:F,color:ink});if(lines[1])page.drawText(lines.length>2?lines[1].replace(/.{0,22}$/,"")+" ... (zie bijlage)":lines[1],{x,y:nog.y-10,size:8,font:F,color:ink});if(lines.length>2)extra.push({title:"Nog in te plannen taken",list:taken})}
  if(gel&&v.materialen)area(21,gel.y-11,gel.y-30,455-21,v.materialen,8,"Geleverde of ingenomen goederen");
  if(onk&&v.onkosten)area(onk.x+onk.w+6,onk.y,onk.y-1,455-(onk.x+onk.w+6),v.onkosten,8,"Onkosten");
  // costs: total ex btw in the right column, changed hourly rate in the header, details on the bijlage
  const K=bon.kosten||kostCalc(bon);
  {const trL=find("Tarief ex:");const uur=K&&K.rows[0].rate;
    if(trL&&uur>0&&uur!==pdfTarief(bon.velden))put(trL.x+trL.w+8,trL.y,eur(uur),{cover:[trL.x+trL.w+4,trL.x+106],bg:rgb(1,1,1)});}
  if(K&&K.sub>0){
    const totL=find("Totaal:",i=>i.x>440&&i.y<200&&i.y>140);if(totL)put(cx+3,totL.y,eur(K.ex),{cover:[cx,cx1],bold:true});
    const lines=K.rows.filter(r=>r.amt||r.qty).map(r=>r.label+": "+qfmt(r.qty)+" "+r.unit+" x "+eur(r.rate)+" = "+eur(r.amt));
    if(K.overig)lines.push("Overig"+(K.overigOms?" ("+K.overigOms+")":"")+": "+eur(K.overig));
    if(pm)lines.unshift("Voorbereiding "+v.voorbVan+" - "+v.voorbTot+" ("+hm(pm)+" u), inbegrepen in werkuren");
    lines.push("Subtotaal: "+eur(K.sub));
    if(K.korting)lines.push("Korting"+(K.kortingType==="%"?" "+qfmt(K.kortingWaarde)+"%":"")+": "+eur(-K.korting));
    lines.push("Totaal ex. btw: "+eur(K.ex),"Btw "+qfmt(K.btwPct)+"%: "+eur(K.btw),"Totaal incl. btw: "+eur(K.incl));
    extra.unshift({title:"Kostenoverzicht (bedragen in euro)",rowsK:lines});
  }
  // signature row
  const hk=find("Handtekening klant:"),bl=find("Opdrachtgever in blokletters:"),dt=find("Datum:",i=>i.y<120),me=find("Medewerker:",i=>i.y<120);
  if(hk&&bon.handtekening){const png=await doc.embedPng(b64ToBytes(bon.handtekening.split(",")[1]));const maxW=(bl?bl.x:170)-hk.x-6,maxH=hk.y-12-50;const s=Math.min(maxW/png.width,maxH/png.height);page.drawImage(png,{x:hk.x,y:hk.y-6-png.height*s,width:png.width*s,height:png.height*s})}
  if(bl)put(bl.x,bl.y-16,(bon.klantNaam||"").toUpperCase(),{size:9,bold:true});
  if(dt)put(dt.x,dt.y-16,bon.getekendOp||today(),{size:9});
  if(me)put(me.x,me.y-16,bon.velden&&bon.velden.medewerker||"",{size:9});
  // appendix: overflow text, tasks, photos
  const A4=[595.28,841.89],M=40;const nr=bon.velden&&bon.velden.nr||"";
  let pg=null,y=0;
  const newPage=()=>{pg=doc.addPage(A4);y=A4[1]-M;pg.drawText(WIN("Werkbon "+nr+" - bijlage"),{x:M,y,size:14,font:FB,color:rgb(.1,.1,.15)});pg.drawText(WIN((bon.velden&&bon.velden.klant||"")+"   "+(bon.getekendOp||"")),{x:M,y:y-16,size:9,font:F,color:rgb(.35,.35,.4)});y-=40};
  const need=h=>{if(!pg||y-h<M)newPage()};
  if(opts&&opts.photosApart)extra.push({title:"Foto's",text:opts.photosApart+" foto's staan in een apart bestand in Google Drive › Werkbonnen › Getekend."});
  extra.forEach(e=>{need(40);pg.drawText(WIN(e.title),{x:M,y,size:11,font:FB,color:rgb(.1,.1,.15)});y-=16;const lines=e.rowsK?e.rowsK:e.list?e.list.map(t=>"- "+t).flatMap(t=>wrap(WIN(t),F,10,A4[0]-2*M)):wrap(WIN(e.text),F,10,A4[0]-2*M);lines.forEach(l=>{need(14);pg.drawText(l,{x:M,y,size:10,font:F,color:ink});y-=13.5});y-=12});
  if(phs.length)await addPhotoPages(doc,bon,phs,0);
  doc.setTitle("Werkbon "+nr+" getekend");
  return await doc.save();
}
async function recompress(dataUrl,max,q){try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=dataUrl});const s=Math.min(1,max/Math.max(img.width,img.height));const c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);return c.toDataURL("image/jpeg",q)}catch(e){return dataUrl}}
async function addPhotoPages(doc,bon,phs,startNo){
  const {StandardFonts,rgb}=PDFLib;const F=await doc.embedFont(StandardFonts.Helvetica),FB=await doc.embedFont(StandardFonts.HelveticaBold);
  const A4=[595.28,841.89],M=40,nr=bon.velden&&bon.velden.nr||"";const cw=A4[0]-2*M,ch=(A4[1]-2*M-50)/2-26;let pg=null,y=0;
  for(let k=0;k<phs.length;k++){if(k%2===0){pg=doc.addPage(A4);y=A4[1]-M;pg.drawText(WIN("Werkbon "+nr+" - foto's"),{x:M,y,size:14,font:FB,color:rgb(.1,.1,.15)});pg.drawText(WIN((bon.velden&&bon.velden.klant||"")+"   "+(bon.getekendOp||"")),{x:M,y:y-16,size:9,font:F,color:rgb(.35,.35,.4)});y-=40}
    const ph=phs[k];let img;try{img=await doc.embedJpg(b64ToBytes((await recompress(ph.d,1100,.6)).split(",")[1]))}catch(e){continue}
    const s=Math.min(cw/img.width,ch/img.height);const iw=img.width*s,ih=img.height*s;const top=y-(k%2)*(ch+26);
    pg.drawImage(img,{x:M+(cw-iw)/2,y:top-ih,width:iw,height:ih});
    pg.drawText(WIN("Foto "+(startNo+k+1)+(ph.bij?": "+ph.bij:"")),{x:M,y:top-ih-13,size:9.5,font:F,color:rgb(.2,.2,.25)})}
}
async function photoPdf(bon,phs,startNo){const doc=await PDFLib.PDFDocument.create();await addPhotoPages(doc,bon,phs,startNo);doc.setTitle("Werkbon "+(bon.velden&&bon.velden.nr||"")+" foto's");return await doc.save()}
async function renderPdf(bytes,box,maxPages){
  box.innerHTML="";
  try{const doc=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;const n=Math.min(doc.numPages,maxPages||10);
    for(let i=1;i<=n;i++){const p=await doc.getPage(i);const vp=p.getViewport({scale:1.6});const c=document.createElement("canvas");c.width=vp.width;c.height=vp.height;box.appendChild(c);await p.render({canvasContext:c.getContext("2d"),viewport:vp}).promise}
    if(doc.numPages>n){const s=document.createElement("p");s.className="muted";s.textContent="En nog "+(doc.numPages-n)+" pagina's.";box.appendChild(s)}
  }catch(e){box.innerHTML='<p class="muted">Voorbeeld kan niet getoond worden.</p>'}
}

/* ---------- db ---------- */
async function loadOrig(id){const d=await mcp.callTool(DRIVE,"download_file_content",{fileId:id},{cache:false});return b64ToBytes(d.payload.content)}
const LS={get(k){try{return JSON.parse(localStorage.getItem(k)||"null")}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}},del(k){try{localStorage.removeItem(k)}catch(e){}}};
let dirty=false,retryT=null,captions={},restored=false,writing=null;
const hhmm=t=>new Date(t).toLocaleTimeString("nl-NL",{hour:"2-digit",minute:"2-digit"});
// Every change is kept on this device first, then written to the shared store; a failed write is retried.
function markDirty(){if(!cur||!curId)return;dirty=true;LS.set("wb:"+curId,{invoer:cur.invoer||{},klantNaam:cur.klantNaam||"",captions,ts:Date.now()});$("saved").textContent="Opslaan…";clearTimeout(saveT);saveT=setTimeout(flush,600)}
function queueSave(k,val){if(!cur||cur.status==="getekend"||!canWrite())return;logChange(k);cur.invoer=cur.invoer||{};cur.invoer[k]=val;markDirty()}
async function flush(){clearTimeout(saveT);clearTimeout(retryT);if(writing){await writing.catch(()=>{});return flush()}if(!curId||!dirty||!cur)return;writing=doFlush();try{await writing}finally{writing=null}}
async function doFlush(){dirty=false;const id=curId,ts=Date.now(),caps=captions;captions={};
  try{await db.doc("bonnen/"+id).update({invoer:cur.invoer||{},klantNaam:cur.klantNaam||"",bijgewerkt:ts});
    for(const [pid,bij] of Object.entries(caps))await db.doc("bonnen/"+id+"/fotos/"+pid).update({bij}).catch(()=>{});
    const l=LS.get("wb:"+id);if(l&&l.ts<=ts)LS.del("wb:"+id);
    if(id===curId)$("saved").textContent="Opgeslagen om "+hhmm(ts);logFlush(false)}
  catch(e){if(id!==curId)return;captions=Object.assign(caps,captions);dirty=true;
    if(e&&e.code==="invalid_argument"){$("saved").textContent="Niet opgeslagen";show($("bMsg"),"<b>Je kunt deze bon niet wijzigen.</b> Vraag Martin om je bewerkrechten op deze pagina te geven. Je wijzigingen staan nog op dit apparaat.","bad");return}
    $("saved").textContent="Bewaard op dit apparaat, nog niet online";retryT=setTimeout(flush,8000)}}
window.addEventListener("online",()=>flush());
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"){flush();logFlush(true)}});
window.addEventListener("pagehide",()=>{flush();logFlush(true)});

/* ---------- Drive sync ---------- */
async function syncDrive(){if(!canWrite())return;
  const msg=$("msg");if(!mcp){show(msg,driveErr({code:"not_granted"}),"warn");return}
  const btn=$("sync").querySelector(".txt");$("sync").disabled=true;btn.textContent="Ophalen…";show(msg,"");
  try{
    const r=await mcp.callTool(DRIVE,"search_files",{query:"parentId = '"+FOLDER().open+"' and mimeType = 'application/pdf'",excludeContentSnippets:true,pageSize:100},{cache:false});
    const files=(r.payload&&r.payload.files)||[];
    const known=new Set(bonnen.map(b=>b.id));const nieuw=files.filter(f=>!known.has(f.id));
    // open bonnen whose PDF is no longer in Werkbonnen/Open (deleted or moved in Drive) leave the app too; signed ones stay
    const inDrive=new Set(files.map(f=>f.id));const weg=bonnen.filter(b=>b.status!=="getekend"&&!inDrive.has(b.id));
    for(const b of weg){
      try{const ph=await db.collection("bonnen/"+b.id+"/fotos").get();for(const d of ph.docs)await db.doc("bonnen/"+b.id+"/fotos/"+d.id).delete()}catch(e){}
      await db.doc("bonnen/"+b.id).delete();LS.del("wb:"+b.id);LS.del("wbsig:"+b.id);
      logWrite("Verwijderd",(b.velden||{}).nr,"PDF niet meer in Drive › Werkbonnen › Open");
      if(curId===b.id)closeBon()}
    let ok=0,fail=[];
    for(const f of nieuw){btn.textContent="Inlezen "+(ok+fail.length+1)+" van "+nieuw.length+"…";
      try{const d=await mcp.callTool(DRIVE,"download_file_content",{fileId:f.id},{cache:false});const b64=d.payload&&d.payload.content;if(!b64)throw new Error("leeg bestand");
        const bytes=b64ToBytes(b64);const P=await pdfItems(bytes);const velden=parseBon(P);
        if(!velden.nr){const m=/(\d{4,})/.exec(f.title||"");velden.nr=m?m[1]:""}
        const invoer={taken:[]};if(velden.werkVanPreset)invoer.werkVan=velden.werkVanPreset;
        await db.doc("bonnen/"+f.id).set({bestand:f.title||"",chunks:1,status:"open",velden,invoer,klantNaam:"",geimporteerd:Date.now(),bijgewerkt:Date.now()});ok++;logWrite("Ingelezen uit Drive",velden.nr,f.title||"");
      }catch(e){fail.push((f.title||f.id)+": "+(e&&e.code?driveErr(e):esc(e&&e.message||e)))}}
    const parts=[];parts.push(nieuw.length?ok+" nieuwe "+(ok===1?"bon":"bonnen")+" ingelezen.":"Geen nieuwe bonnen in de map Open.");
    if(weg.length)parts.push(weg.length+" "+(weg.length===1?"bon":"bonnen")+" weggehaald, de PDF staat niet meer in de map Open.");
    if(fail.length)parts.push("<b>Niet gelukt:</b><br>"+fail.join("<br>"));
    show(msg,parts.join(" "),fail.length?"warn":"ok");
    // also retry uploads that are waiting
    for(const b of bonnen.filter(b=>b.status==="getekend"&&(!b.signedFileId||b.fotosInDrive===false)))await uploadSigned(b.id,true).catch(()=>{});
  }catch(e){show(msg,driveErr(e),e.code==="server_unavailable"?"warn":"bad")}
  finally{$("sync").disabled=false;btn.textContent="Bonnen ophalen uit Drive"}
}

/* ---------- list ---------- */
function statusOf(b){if(b.status==="getekend")return b.signedFileId&&b.fotosInDrive!==false?["done","In Drive"]:["signed","Wacht op upload"];const v=b.invoer||{};const busy=["voorbVan","heenVan","werkVan","werkTot","constAanv","oplAanv"].some(k=>v[k]&&!(k==="werkVan"&&v[k]===(b.velden||{}).werkVanPreset))||(b.fotos>0)||(v.taken||[]).length;return busy?["busy","Bezig"]:["new","Nieuw"]}
function renderList(){
  const q=$("q").value.trim().toLowerCase();
  const open=bonnen.filter(b=>b.status!=="getekend"),signed=bonnen.filter(b=>b.status==="getekend");
  $("cOpen").textContent=open.length;$("cSigned").textContent=signed.length;
  let rows=(filter==="open"?open:signed).filter(b=>{if(!q)return true;const v=b.velden||{};return [v.nr,v.klant,v.medewerker,v.opdracht,v.bezoekadres].join(" ").toLowerCase().includes(q)});
  rows.sort((a,b)=>filter==="open"?String((a.velden||{}).nr).localeCompare(String((b.velden||{}).nr),"nl",{numeric:true}):(b.getekendTs||0)-(a.getekendTs||0));
  const L=$("list");
  if(!rows.length){L.innerHTML='<p class="empty">'+(q?"Geen bonnen gevonden voor deze zoekopdracht.":filter==="open"?"Geen open bonnen. Zet een PDF uit MSWMenuX in de map Werkbonnen/Open en kies Bonnen ophalen uit Drive.":"Nog geen getekende bonnen.")+"</p>";return}
  L.innerHTML=rows.map(b=>{const v=b.velden||{};const[c,t]=statusOf(b);return '<button class="card" data-id="'+esc(b.id)+'"><span class="no" data-no-i18n>'+esc(v.nr||"?")+'</span><span class="k" data-no-i18n>'+esc(v.klant||b.bestand||"Onbekende klant")+'</span><span class="pill '+c+'">'+t+'</span><span class="d">'+esc([v.opdracht,v.bezoekadres].filter(Boolean).join(" · "))+'<br>'+esc([v.medewerker,v.plandatum,b.getekendOp&&("getekend "+b.getekendOp)].filter(Boolean).join(" · "))+'</span></button>'}).join("");
}

/* ---------- detail ---------- */
function openBon(id){
  curId=id;cur=thaw(bonnen.find(b=>b.id===id))||null;lastPdf=null;$("signPrev").innerHTML="";$("origPrev").innerHTML="";$("bMsg").hidden=true;$("signMsg").hidden=true;clearErrs();$("saved").textContent="";$("reopenAsk").hidden=true;
  $("listView").hidden=true;$("bonView").hidden=false;window.scrollTo(0,0);
  if(unsubBon)unsubBon();if(unsubPh)unsubPh();
  restored=false;captions={};dirty=false;strokes=(LS.get("wbsig:"+id)||[]);
  unsubBon=db.doc("bonnen/"+id).onSnapshot(s=>{if(!s.exists){closeBon();return}const d=Object.assign({id},thaw(s.data()));
    if(cur&&curId===id&&dirty){d.invoer=cur.invoer;d.klantNaam=cur.klantNaam}
    cur=d;
    if(!restored){restored=true;if((cur.velden&&cur.velden._v||1)<PARSE_V&&cur.chunks)reparse(id);const l=LS.get("wb:"+id);if(l&&cur.status!=="getekend"&&l.ts>(cur.bijgewerkt||0)){cur.invoer=l.invoer||{};cur.klantNaam=l.klantNaam||"";captions=l.captions||{};dirty=true;flush();show($("bMsg"),"Wijzigingen die nog op dit apparaat stonden zijn teruggezet en opgeslagen.","ok")}else if(l)LS.del("wb:"+id)}
    fillBon()},()=>{});
  unsubPh=db.collection("bonnen/"+id+"/fotos").orderBy("at").onSnapshot(s=>{photos=s.docs.map(d=>Object.assign({id:d.id},thaw(d.data())));renderPhotos()},()=>{});
  fillBon();redraw();
}
async function reparse(id){try{const b=cur;const nv=parseBon(await pdfItems(await loadOrig(id,b.chunks)));const old=b.velden||{};
  const velden=Object.assign({},old,nv,{nr:old.nr||nv.nr});if(id!==curId)return;await db.doc("bonnen/"+id).update({velden});}catch(e){}}
function closeBon(){flush();logFlush(true);if(unsubBon)unsubBon();if(unsubPh)unsubPh();unsubBon=unsubPh=null;curId=null;cur=null;$("bonView").hidden=true;$("listView").hidden=false;renderList()}
function fillBon(){
  if(!cur)return;const v=cur.velden||{},inv=cur.invoer||{};const signed=cur.status==="getekend";
  $("bNr").textContent=v.nr||"";$("bSub").textContent=[v.klant,v.plandatum].filter(Boolean).join(" · ");
  const tr=pdfTarief(v)!=null?v.tarief:(()=>{const K=signed&&cur.kosten?cur.kosten:kostCalc(cur);return K.rows[0].rate?eur(K.rows[0].rate)+" (uit tarieventabel)":"leeg, vul tarieven in via de gebruikersknop"})();
  const f=[["Debiteurnr.",v.debnr],["Tarief ex. btw",tr],["Klant",[v.klant,v.contact].filter(Boolean).join(", ")],["Bezoekadres",v.bezoekadres],["Telefoon",v.telefoon],["Opdracht",v.opdracht],["Reden",v.reden],["Afgesproken met",v.afgesproken],["Medewerker",v.medewerker],["Servicecontract",v.contractnr],["Objectnr.",v.objectnr],["Projectnr.",v.projectnr],["Gepland",[v.plandatum,v.plantijd&&v.plantijd!=="0:00"?v.plantijd:""].filter(Boolean).join(" om ")]].filter(x=>x[1]);
  $("facts").innerHTML=f.map(x=>'<div class="fact"><span>'+x[0]+'</span><b data-no-i18n>'+esc(x[1])+'</b></div>').join("");
  $("oConst").textContent=v.constatering||"";$("oOpl").textContent=v.oplossing||"";
  document.querySelectorAll("[data-k]").forEach(el=>{const k=el.dataset.k;const val=k==="klantNaam"?(cur.klantNaam||""):(inv[k]||"");if(document.activeElement!==el&&el.value!==val)el.value=val});
  $("edit").disabled=signed||!canWrite();
  renderTimes();renderTasks();renderRoute();renderPhotos();
  $("signDate").textContent=cur.getekendOp||today();
  $("signOpen").hidden=signed||!canWrite();$("signDone").hidden=!signed;$("roNote").hidden=signed||canWrite();$("reopenBtn").hidden=!isAdmin();
  if(signed){$("sigImg").src=cur.handtekening||"";$("signWho").textContent=(cur.klantNaam||"").toUpperCase();$("signWhen").textContent="Getekend op "+(cur.getekendOp||"");
    const up=!!cur.signedFileId&&cur.fotosInDrive!==false;$("driveState").innerHTML=up?'<span class="pill done">Opgeslagen in Werkbonnen/Getekend</span>':'<span class="pill signed">Nog niet in Google Drive</span>';
    $("uploadBtn").hidden=up;$("driveLink").hidden=!(up&&cur.signedUrl);if(cur.signedUrl)$("driveLink").href=cur.signedUrl;$("saveBtn").hidden=!downloads;}
}
function renderTimes(){const v=(cur&&cur.invoer)||{};$("kmTot").textContent=kmStr(kmTotal(v))+" km";const h=dur(v.heenVan,v.heenTot),p=dur(v.voorbVan,v.voorbTot),w=dur(v.werkVan,v.werkTot)+p,t=dur(v.terugVan,v.terugTot);
  $("tot_p").textContent=p?hm(p):"";$("tot_h").textContent=h?hm(h):"";$("tot_w").textContent=w-p?hm(w-p):"";$("tot_t").textContent=t?hm(t):"";
  $("sumR").textContent=hm(h+t)+" ("+dec(h+t).replace(".",",")+" u)";$("sumW").textContent=hm(w)+" ("+dec(w).replace(".",",")+" u)";renderKosten()}
function renderKosten(){if(!cur)return;const signed=cur.status==="getekend"||!canWrite();const K=signed&&cur.kosten?cur.kosten:kostCalc(cur);const o=((cur.invoer||{}).kosten)||{};
  const L=SET.medewerkers||[];$("kMwF").hidden=!L.length&&!K.medewerker;
  const opts=[["-","Standaard uurtarief"]].concat(L.map(m=>[m.naam,m.naam+(pnum(m.uurtarief)!=null?" ("+eur(pnum(m.uurtarief))+")":"")]));
  if(K.medewerker&&!L.some(m=>m.naam===K.medewerker))opts.push([K.medewerker,K.medewerker]);
  const sel=$("kMw"),oh=opts.map(x=>'<option value="'+esc(x[0])+'">'+esc(x[1])+'</option>').join("");if(sel.dataset.oh!==oh){sel.innerHTML=oh;sel.dataset.oh=oh}
  if(document.activeElement!==sel)sel.value=K.medewerker||"-";
  const shown={werkUren:K.rows[0].qty,uurtarief:K.rows[0].rate,reisUren:K.rows[1].qty,reisTarief:K.rows[1].rate,km:K.rows[2].qty,kmTarief:K.rows[2].rate};
  document.querySelectorAll("[data-kk]").forEach(el=>{if(document.activeElement===el)return;const k=el.dataset.kk;let val;
    if(signed&&cur.kosten){val=k in shown?qfmt(shown[k]):k==="overig"?(K.overig?qfmt(K.overig):""):k==="overigOms"?K.overigOms:k==="korting"?(K.kortingWaarde?qfmt(K.kortingWaarde):""):k==="kortingType"?K.kortingType:""}
    else if(k in shown)val=o[k]!=null&&o[k]!==""?String(o[k]):qfmt(shown[k]);
    else if(k==="kortingType")val=o.kortingType==="€"?"€":"%";else val=o[k]||"";
    if(el.value!==val)el.value=val});
  $("kWh").textContent=K.auto.werkUren?"berekend "+qfmt(K.auto.werkUren)+" u":"";$("kRh").textContent=K.auto.reisUren?"berekend "+qfmt(K.auto.reisUren)+" u":"";$("kKh").textContent=K.auto.km?"berekend "+qfmt(K.auto.km)+" km":"";
  ["werk","reis","km"].forEach((k,i)=>$("kA_"+k).textContent=eur(K.rows[i].amt));
  document.querySelectorAll("[data-kr]").forEach(b=>{b.style.visibility=signed||!b.dataset.kr.split(",").some(k=>o[k]!=null&&o[k]!=="")?"hidden":"visible"});
  const kl=K.korting?"Korting"+(K.kortingType==="%"?" "+qfmt(K.kortingWaarde)+"%":""):"";
  $("kSum").innerHTML='<span>Subtotaal</span><b>'+eur(K.sub)+'</b>'+(K.korting?'<span>'+esc(kl)+'</span><b>'+eur(-K.korting)+'</b>':'')+'<span>Totaal ex. btw</span><b>'+eur(K.ex)+'</b><span>Btw '+qfmt(K.btwPct)+'%</span><b>'+eur(K.btw)+'</b><span class="big">Totaal incl. btw</span><b class="big">'+eur(K.incl)+'</b>';
}
function renderRoute(){const v=(cur&&cur.velden)||{},inv=(cur&&cur.invoer)||{};const u=new URL("https://www.google.com/maps/dir/");u.searchParams.set("api","1");if(inv.vertrekadres)u.searchParams.set("origin",inv.vertrekadres);u.searchParams.set("destination",v.bezoekadres||"");u.searchParams.set("travelmode","driving");$("routeBtn").href=u.toString()}
function renderTasks(){const t=((cur&&cur.invoer)||{}).taken||[];const signed=!cur||cur.status==="getekend"||!canWrite();
  const ins=[...$("tasks").querySelectorAll("[data-ti]")];
  if(!signed&&ins.length===t.length&&ins.length&&$("tasks").contains(document.activeElement)){ins.forEach((el,i)=>{if(el!==document.activeElement&&el.value!==t[i].t)el.value=t[i].t});return}
  $("tasks").innerHTML=t.length?t.map((x,i)=>'<li>'+(signed?'<span>'+esc(x.t)+'</span>':'<input class="tin2" data-ti="'+i+'" value="'+esc(x.t)+'" maxlength="200" aria-label="Taak '+(i+1)+'"><button type="button" data-del="'+i+'" aria-label="Taak verwijderen">'+I("trash")+'</button>')+'</li>').join(""):'<li class="muted" style="border:0">Geen taken.</li>';$("taskForm").hidden=signed}
let phKey="";
function renderPhotos(){const signed=!cur||cur.status==="getekend"||!canWrite();
  const key=photos.map(p=>p.id).join(",")+"|"+signed+"|"+phBusy;
  if(key===phKey&&$("photos").childElementCount){document.querySelectorAll("[data-phbij]").forEach(i=>{const p=photos.find(x=>x.id===i.dataset.phbij);const v=captions[i.dataset.phbij]??(p&&p.bij)??"";if(document.activeElement!==i&&i.value!==v)i.value=v});return}
  phKey=key;
  $("photos").innerHTML=photos.map(p=>'<div class="ph"><div class="im"><img src="'+p.d+'" alt="'+esc(p.bij||"Foto")+'">'+(signed?"":'<button class="x" type="button" data-phdel="'+esc(p.id)+'" aria-label="Foto verwijderen">'+I("x")+'</button>')+'</div><input data-phbij="'+esc(p.id)+'" value="'+esc(captions[p.id]??p.bij??"")+'" placeholder="Omschrijving" maxlength="120" '+(signed?"disabled":"")+'></div>').join("")+(signed?"":phBusy?'<div class="addph busy"><span class="spin"></span>'+esc(phBusy)+'</div>':'<div class="addbtns"><label class="addph">'+I("camera")+'Foto maken<input type="file" id="phCam" accept="image/*" capture="environment" hidden></label><label class="addph alt">'+I("image")+'Kies uit galerij<input type="file" id="phIn" accept="image/*" multiple hidden></label></div>');
  $("phCount").textContent=photos.length?photos.length+" "+(photos.length===1?"foto":"foto's")+", komen als bijlage in de PDF":"Komen als bijlage in de PDF";
  ["phIn","phCam"].forEach(id=>{const inp=$(id);if(inp)inp.onchange=e=>{const f=[...e.target.files];e.target.value="";if(f.length)addPhotos(f)}});}
// Phone photos are large (12+ MP): decode once, scale to 1280 px, then only lower the JPEG quality until it fits one stored document.
async function shrink(file){
  const MAX=1280,LIM=230000;let src,w,h,done=()=>{};
  try{const bm=await createImageBitmap(file,{imageOrientation:"from-image"});src=bm;w=bm.width;h=bm.height;done=()=>{try{bm.close()}catch(e){}}}
  catch(e){const url=URL.createObjectURL(file);src=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=()=>rej(new Error("Dit bestand is geen leesbare foto"));i.src=url});w=src.naturalWidth;h=src.naturalHeight;done=()=>URL.revokeObjectURL(url)}
  try{const s=Math.min(1,MAX/Math.max(w,h));const c=document.createElement("canvas");c.width=Math.round(w*s);c.height=Math.round(h*s);const g=c.getContext("2d");g.fillStyle="#fff";g.fillRect(0,0,c.width,c.height);g.drawImage(src,0,0,c.width,c.height);done();done=()=>{};
    let q=.72,out=c.toDataURL("image/jpeg",q);while(out.length>LIM&&q>.42){q-=.1;out=c.toDataURL("image/jpeg",q)}
    if(out.length>LIM){const c2=document.createElement("canvas");c2.width=Math.round(c.width*.7);c2.height=Math.round(c.height*.7);c2.getContext("2d").drawImage(c,0,0,c2.width,c2.height);out=c2.toDataURL("image/jpeg",.6);c2.width=c2.height=0}
    c.width=c.height=0;return out}finally{done()}}
let phBusy="";
async function addPhotos(files){const m=$("phMsg");m.textContent="";const fails=[];
  for(let k=0;k<files.length;k++){phBusy="Foto "+(files.length>1?(k+1)+" van "+files.length+" ":"")+"verwerken…";phKey="";renderPhotos();await new Promise(r=>setTimeout(r,40));
    try{const d=await shrink(files[k]);phBusy="Foto opslaan…";phKey="";renderPhotos();await db.collection("bonnen/"+curId+"/fotos").add({d,bij:"",at:Date.now()});logChange("foto's toegevoegd")}
    catch(e){fails.push((files[k].name||"foto")+(e&&e.message?" ("+e.message+")":""))}}
  phBusy="";phKey="";renderPhotos();
  if(fails.length)m.textContent="Niet toegevoegd: "+fails.join(", ")+". Een foto toevoegen lukt alleen met internet.";
  db.doc("bonnen/"+curId).update({fotos:photos.length,bijgewerkt:Date.now()}).catch(()=>{})}

/* ---------- signature pad ---------- */
const cv=$("sig");let strokes=[],drawing=false;
const INK="#0d1f73";
function sizeSig(){const r=cv.getBoundingClientRect();if(!r.width||!r.height)return;const d=window.devicePixelRatio||1;const w=Math.round(r.width*d),h=Math.round(r.height*d);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}redraw()}
function paint(g,scale){g.lineCap="round";g.lineJoin="round";g.strokeStyle=INK;g.fillStyle=INK;g.lineWidth=2.4*scale;strokes.forEach(st=>{if(st.length===1){g.beginPath();g.arc(st[0].x*scale,st[0].y*scale,1.3*scale,0,7);g.fill();return}g.beginPath();g.moveTo(st[0].x*scale,st[0].y*scale);for(let i=1;i<st.length;i++)g.lineTo(st[i].x*scale,st[i].y*scale);g.stroke()})}
function redraw(){const r=cv.getBoundingClientRect();const g=cv.getContext("2d");g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,cv.width,cv.height);if(r.width&&r.height){g.setTransform(cv.width/r.width,0,0,cv.height/r.height,0,0);paint(g,1)}$("sigHint").hidden=strokes.length>0}
const pos=e=>{const r=cv.getBoundingClientRect();return{x:Math.max(0,Math.min(r.width,e.clientX-r.left)),y:Math.max(0,Math.min(r.height,e.clientY-r.top))}};
cv.addEventListener("pointerdown",e=>{e.preventDefault();markErr($("sigBox"),false);try{cv.setPointerCapture(e.pointerId)}catch(_){}sizeSig();drawing=true;strokes.push([pos(e)]);redraw()});
cv.addEventListener("pointermove",e=>{if(!drawing)return;e.preventDefault();strokes[strokes.length-1].push(pos(e));redraw()});
["pointerup","pointercancel"].forEach(t=>cv.addEventListener(t,()=>{if(drawing&&curId)LS.set("wbsig:"+curId,strokes);drawing=false}));
function clearSig(){strokes=[];if(curId)LS.del("wbsig:"+curId);redraw()}
function sigPng(){const pts=strokes.flat();if(pts.length<2)return null;const pad=6;let x0=Math.min(...pts.map(p=>p.x))-pad,y0=Math.min(...pts.map(p=>p.y))-pad,x1=Math.max(...pts.map(p=>p.x))+pad,y1=Math.max(...pts.map(p=>p.y))+pad;
  const s=Math.min(3,600/(x1-x0));const c=document.createElement("canvas");c.width=Math.max(1,Math.round((x1-x0)*s));c.height=Math.max(1,Math.round((y1-y0)*s));const g=c.getContext("2d");g.translate(-x0*s,-y0*s);paint(g,s);return c.toDataURL("image/png")}

/* ---------- sign + upload ---------- */
function busy(t){$("signBusy").hidden=!t;$("signBusyTxt").textContent=t||""}
// Messages about signing appear at the top and next to the sign button; fields that block signing turn light red.
function say(html,kind){show($("bMsg"),html,kind);show($("signMsg"),html,kind)}
function markErr(el,on){el.classList.toggle("err",!!on);if(on)el.setAttribute("aria-invalid","true");else el.removeAttribute("aria-invalid")}
function clearErrs(){document.querySelectorAll("#bonView .err").forEach(el=>markErr(el,false))}
async function sign(){if(!canWrite())return;
  clearErrs();const naam=$("klantNaam").value.trim();const png=sigPng();const errs=[];
  if(!naam)errs.push([$("klantNaam"),"vul de <b>naam van de klant</b> in blokletters in"]);
  if(!png)errs.push([$("sigBox"),"laat de klant <b>tekenen</b> in het vak Handtekening klant"]);
  if(errs.length){errs.forEach(x=>markErr(x[0],true));say("<b>Ondertekenen lukt nog niet:</b> "+errs.map(x=>x[1]).join(" en ")+".","bad");if(!naam)$("klantNaam").focus({preventScroll:true});errs[0][0].scrollIntoView({block:"center",behavior:"smooth"});return}
  say("");$("signBtn").disabled=true;busy("PDF maken…");const before=thaw(cur);
  try{await flush();
    const upd={status:"getekend",kosten:kostCalc(cur),klantNaam:naam.toUpperCase(),handtekening:png,getekendOp:today(),getekendTs:Date.now(),bijgewerkt:Date.now()};
    Object.assign(cur,upd);
    const orig=await loadOrig(curId,cur.chunks);const bytes=await buildPdf(cur,orig,photos);lastPdf=bytes;
    await db.doc("bonnen/"+curId).update(upd);logFlush(true);logWrite("Ondertekend",(cur.velden||{}).nr,"door "+upd.klantNaam+(upd.kosten&&upd.kosten.sub?", totaal "+eur(upd.kosten.ex)+" ex. btw":""));LS.del("wbsig:"+curId);LS.del("wb:"+curId);
    renderPdf(bytes,$("signPrev"),3);
    await uploadSigned(curId,false,bytes);
  }catch(e){if(cur&&cur.status==="getekend"&&!cur.signedFileId&&before.status!=="getekend"&&curId===before.id){const s=await db.doc("bonnen/"+curId).get().catch(()=>null);if(!s||!s.exists||s.data().status!=="getekend"){cur=before;fillBon()}}
    say("<b>Ondertekenen lukte niet.</b> "+(e&&e.code==="invalid_argument"?"Je hebt geen rechten om deze bon op te slaan.":"Probeer het opnieuw.")+' <span class="mono" style="font-size:12px">('+esc([e&&e.code,e&&e.message||String(e)].filter(Boolean).join(": ").slice(0,300))+')</span>',"bad")}
  finally{busy("");$("signBtn").disabled=false}
}
const MAXB64=600000; // keep each Drive call well under the connector's request limit
const b64len=u=>Math.ceil(u.length/3)*4;
async function driveUpload(title,bytes){
  const base={title,parentId:FOLDER().signed,contentMimeType:"application/pdf",disableConversionToGoogleType:true};
  let fa=false;try{fa=!!(await mcp.listTools()).fileArgs}catch(e){}
  if(fa){try{const r=await mcp.callTool(DRIVE,"create_file",Object.assign({},base,{base64Content:{$file:{data:new Blob([bytes],{type:"application/pdf"}),name:"werkbon.pdf",type:"application/pdf"}}}),{cache:false});return r.payload||{}}
    catch(e){if(!["bad_request","capability_disabled","transform_error"].includes(e&&e.code))throw e}}
  if(b64len(bytes)>MAXB64*1.6)throw {code:"too_big"};
  const r=await mcp.callTool(DRIVE,"create_file",Object.assign({},base,{base64Content:bytesToB64(bytes)}),{cache:false});return r.payload||{};
}
async function uploadSigned(id,silent,bytes){
  const b=id===curId?cur:bonnen.find(x=>x.id===id);if(!b)return;
  if(!mcp){if(!silent)say("<b>Getekend en bewaard.</b> Google Drive is hier niet beschikbaar; de PDF gaat naar Drive zodra iemand met Google Drive op Bonnen ophalen drukt.","warn");return}
  if(!silent)busy("Opslaan in Google Drive…");
  try{
    const phs=id===curId?photos:(await db.collection("bonnen/"+id+"/fotos").orderBy("at").get()).docs.map(d=>d.data());
    const orig=await loadOrig(id,b.chunks);
    const name="Werkbon "+((b.velden||{}).nr||"")+" getekend "+(b.getekendOp||today()).replace(/\//g,"-");
    if(!b.signedFileId){
      if(!bytes)bytes=await buildPdf(b,orig,phs);
      let apart=false;
      if(b64len(bytes)>MAXB64&&phs.length){bytes=await buildPdf(b,orig,[],{photosApart:phs.length});apart=true}
      if(!silent)busy("Werkbon naar Google Drive sturen…");
      const p=await driveUpload(name+".pdf",bytes);
      b.signedFileId=p.id||"onbekend";b.signedUrl=p.viewUrl||"";b.fotosApart=apart?phs.length:0;b.fotosInDrive=!apart;
      logWrite("Naar Drive gestuurd",(b.velden||{}).nr,name+".pdf"+(apart?", foto's apart":""));
      await db.doc("bonnen/"+id).update({signedFileId:b.signedFileId,signedUrl:b.signedUrl,fotosApart:b.fotosApart,fotosInDrive:b.fotosInDrive,bijgewerkt:Date.now()});
    }
    if(b.fotosInDrive===false&&phs.length){
      // photos in their own files, as many per file as fit in one Drive call
      let group=[],no=0,part=1;const groups=[];
      for(const ph of phs){const t=await photoPdf(b,group.concat([ph]),no);if(group.length&&b64len(t)>MAXB64){groups.push(group);group=[ph]}else group.push(ph)}
      if(group.length)groups.push(group);
      for(const g of groups){if(!silent)busy("Foto's naar Google Drive sturen ("+part+" van "+groups.length+")…");await driveUpload(name+" foto's"+(groups.length>1?" "+part:"")+".pdf",await photoPdf(b,g,no));no+=g.length;part++}
      b.fotosInDrive=true;await db.doc("bonnen/"+id).update({fotosInDrive:true,bijgewerkt:Date.now()});
    }
    if(!silent)say("<b>Klaar.</b> De getekende werkbon staat in Google Drive › Werkbonnen › Getekend"+(b.fotosApart?", de foto's in een apart bestand ernaast":"")+".","ok");
  }catch(e){if(silent)throw e;
    const detail=e&&(e.code||e.message)?' <span class="mono" style="font-size:12px">('+esc([e.code,e.message].filter(Boolean).join(": ").slice(0,300))+')</span>':"";
    say(e&&e.code==="too_big"?"<b>De PDF is te groot voor Google Drive.</b> Verwijder een paar foto's en kies Opnieuw naar Drive sturen.":"<b>Getekend en bewaard, maar nog niet (helemaal) in Google Drive.</b> "+driveErr(e)+" Kies daarna Opnieuw naar Drive sturen."+detail,"warn")}
  finally{if(!silent)busy("");if(id===curId)fillBon()}
}

/* ---------- zoomable viewer (pinch, drag, double tap, buttons) ---------- */
const LB={el:$("lb"),img:$("lbImg"),s:1,x:0,y:0,fit:1,pts:new Map(),start:null,lastTap:0};
function lbApply(){LB.img.style.transform="translate("+LB.x+"px,"+LB.y+"px) scale("+LB.s+")"}
function lbClamp(){const W=LB.el.clientWidth,H=LB.el.clientHeight,w=LB.img.naturalWidth*LB.s,h=LB.img.naturalHeight*LB.s;LB.x=w<=W?(W-w)/2:Math.min(0,Math.max(W-w,LB.x));LB.y=h<=H?(H-h)/2:Math.min(0,Math.max(H-h,LB.y))}
function lbFit(){const W=LB.el.clientWidth,H=LB.el.clientHeight;LB.fit=Math.min(W/LB.img.naturalWidth,H/LB.img.naturalHeight,1e9);LB.s=LB.fit;lbClamp();lbApply()}
function lbZoom(f,cx,cy){const W=LB.el.clientWidth,H=LB.el.clientHeight;cx=cx??W/2;cy=cy??H/2;const ns=Math.max(LB.fit,Math.min(LB.fit*8,LB.s*f));const k=ns/LB.s;LB.x=cx-(cx-LB.x)*k;LB.y=cy-(cy-LB.y)*k;LB.s=ns;lbClamp();lbApply()}
function openLb(src,cap){LB.img.onload=()=>lbFit();LB.img.src=src;$("lbCap").textContent=cap||"";$("lbCap").hidden=!cap;LB.el.hidden=false;LB.pts.clear()}
function closeLb(){LB.el.hidden=true;LB.img.removeAttribute("src")}
LB.el.addEventListener("pointerdown",e=>{if(e.target.closest("button"))return;LB.el.setPointerCapture(e.pointerId);LB.pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const now=Date.now();if(LB.pts.size===1&&now-LB.lastTap<300){lbZoom(LB.s>LB.fit*1.05?LB.fit/LB.s:2.5,e.clientX,e.clientY);LB.lastTap=0}else LB.lastTap=now;LB.start=null});
LB.el.addEventListener("pointermove",e=>{const p=LB.pts.get(e.pointerId);if(!p)return;const prev={x:p.x,y:p.y};p.x=e.clientX;p.y=e.clientY;
  if(LB.pts.size>=2){const [a,b]=[...LB.pts.values()];const d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;if(LB.start){lbZoom(d/LB.start.d,mx,my);LB.x+=mx-LB.start.mx;LB.y+=my-LB.start.my;lbClamp();lbApply()}LB.start={d,mx,my}}
  else{LB.x+=p.x-prev.x;LB.y+=p.y-prev.y;lbClamp();lbApply()}});
["pointerup","pointercancel"].forEach(t=>LB.el.addEventListener(t,e=>{LB.pts.delete(e.pointerId);LB.start=null}));
LB.el.addEventListener("wheel",e=>{e.preventDefault();lbZoom(e.deltaY<0?1.15:1/1.15,e.clientX,e.clientY)},{passive:false});
$("lbClose").onclick=closeLb;$("lbIn").onclick=()=>lbZoom(1.6);$("lbOut").onclick=()=>lbZoom(1/1.6);$("lbFit").onclick=lbFit;
document.addEventListener("keydown",e=>{if(LB.el.hidden)return;if(e.key==="Escape")closeLb();if(e.key==="+"||e.key==="=")lbZoom(1.4);if(e.key==="-")lbZoom(1/1.4)});
window.addEventListener("resize",()=>{if(!LB.el.hidden)lbFit()});
$("photos").addEventListener("click",e=>{const im=e.target.closest(".ph img");if(!im)return;const id=im.closest(".ph").querySelector("[data-phbij]");const p=photos.find(x=>id&&x.id===id.dataset.phbij);openLb(p?p.d:im.src,(p&&(captions[p.id]??p.bij))||"")});
["origPrev","signPrev"].forEach(b=>$(b).addEventListener("click",e=>{const c=e.target.closest("canvas");if(c)openLb(c.toDataURL("image/png"),"")}));
$("sigImg").addEventListener("click",()=>{if($("sigImg").src)openLb($("sigImg").src,"Handtekening klant")});

/* ---------- events ---------- */
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{filter=b.dataset.f;document.querySelectorAll(".tabs button").forEach(x=>x.setAttribute("aria-pressed",x===b?"true":"false"));renderList()});
$("q").oninput=renderList;
$("list").onclick=e=>{const c=e.target.closest(".card");if(c&&db)openBon(c.dataset.id)};
$("back").onclick=closeBon;
$("sync").onclick=syncDrive;
document.querySelectorAll("[data-k]").forEach(el=>el.addEventListener("input",()=>{if(!cur)return;const k=el.dataset.k;
  if(k==="klantNaam"){markErr(el,!el.value.trim()&&el.classList.contains("err"));if(cur.status==="getekend"||!canWrite())return;cur.klantNaam=el.value;logChange(k);markDirty();return}
  queueSave(k,el.value);if(el.type==="time"||k==="kmHeen"||k==="kmTerug")renderTimes();if(k==="vertrekadres")renderRoute()}));
document.querySelectorAll("[data-now]").forEach(b=>b.onclick=()=>{const el=$(b.dataset.now);const d=new Date();el.value=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");el.dispatchEvent(new Event("input"))});
$("taskForm").onsubmit=e=>{e.preventDefault();const t=$("taskIn").value.trim();if(!t||!cur)return;const list=((cur.invoer||{}).taken||[]).concat([{t}]);$("taskIn").value="";queueSave("taken",list);renderTasks()};
$("tasks").addEventListener("input",e=>{const el=e.target.closest("[data-ti]");if(!el||!cur)return;const list=((cur.invoer||{}).taken||[]).map(x=>({t:x.t}));const i=+el.dataset.ti;if(!list[i])return;list[i].t=el.value;queueSave("taken",list)});
$("tasks").addEventListener("focusout",e=>{const el=e.target.closest("[data-ti]");if(!el||!cur||el.value.trim())return;setTimeout(()=>{const list=((cur.invoer||{}).taken||[]).slice();list.splice(+el.dataset.ti,1);queueSave("taken",list);renderTasks()},0)});
$("tasks").addEventListener("keydown",e=>{if(e.key==="Enter"&&e.target.closest("[data-ti]")){e.preventDefault();e.target.blur()}});
$("tasks").onclick=async e=>{const b=e.target.closest("[data-del]");if(!b||!cur)return;const t=(((cur.invoer||{}).taken||[])[+b.dataset.del]||{}).t||"";if(!await askSure("Taak \u201c"+t+"\u201d verwijderen?"))return;const list=((cur.invoer||{}).taken||[]).slice();list.splice(+b.dataset.del,1);queueSave("taken",list);renderTasks()};
$("photos").addEventListener("click",async e=>{const b=e.target.closest("[data-phdel]");if(!b||!canWrite())return;if(!await askSure("Deze foto verwijderen? Dat kan niet ongedaan worden gemaakt."))return;logChange("foto verwijderd");db.doc("bonnen/"+curId+"/fotos/"+b.dataset.phdel).delete().then(()=>db.doc("bonnen/"+curId).update({fotos:Math.max(0,photos.length),bijgewerkt:Date.now()})).catch(()=>{})});
$("photos").addEventListener("input",e=>{const i=e.target.closest("[data-phbij]");if(!i)return;if(!canWrite())return;captions[i.dataset.phbij]=i.value;logChange("foto");markDirty()});
function kSave(patch){if(!cur||cur.status==="getekend")return;const k=Object.assign({},((cur.invoer||{}).kosten)||{},patch);queueSave("kosten",k)}
$("kostSec").addEventListener("input",e=>{const el=e.target.closest("[data-kk]");if(!el)return;kSave({[el.dataset.kk]:el.value});renderKosten()});
$("kostSec").addEventListener("focusout",e=>{if(e.target.closest("[data-kk]"))setTimeout(renderKosten,0)});
$("kostSec").addEventListener("click",e=>{const b=e.target.closest("[data-kr]");if(!b)return;const p={};b.dataset.kr.split(",").forEach(k=>p[k]="");kSave(p);renderKosten()});
$("kMw").onchange=()=>{const n=$("kMw").value;const p={medewerker:n,uurtarief:""};kSave(p);renderKosten()};
function askSure(txt){const d=$("askDlg");$("askTxt").textContent=txt;return new Promise(res=>{const done=v=>{d.close();res(v)};$("askYes").onclick=()=>done(true);$("askNo").onclick=()=>done(false);d.oncancel=e=>{e.preventDefault();done(false)};d.showModal();$("askNo").focus()})}
/* ---------- rights, same model as the Weekplanner: the Google account is the login, matched to a medewerker by e-mail (or by name) ---------- */
function isMe(m){if(!acct||!acct.me||!m)return false;const e=norm(acct.me.email);if(m.login&&e&&norm(m.login)===e)return true;const n=norm(acct.me.name);return !!n&&norm(m.login||m.naam)===n}
const ROLES=[["admin","Admin"],["gebruiker","Gebruiker"],["lezen","Alleen lezen"]];
let acct=undefined,role="lezen",roleMw=null;
const isAdmin=()=>role==="admin",canWrite=()=>role!=="lezen";
const roleName=r=>(ROLES.find(x=>x[0]===r)||[0,""])[1];
function myName(){return (roleMw&&roleMw.naam)||(acct&&acct.me&&acct.me.name)||"Onbekend"}
function computeRole(){roleMw=null;
  if(acct===undefined){role="lezen";return}
  if(acct===null){role="gebruiker";return} // the platform tells this view nothing about the viewer
  if(acct.me.isOwner){role="admin";roleMw=(SET.medewerkers||[]).find(isMe)||null;return}
  roleMw=(SET.medewerkers||[]).find(isMe)||null;
  role=roleMw?(roleMw.rol||"gebruiker"):"lezen";if(acct.write===false)role="lezen"}
function applyRole(){computeRole();
  document.querySelectorAll("[data-drive]").forEach(b=>b.hidden=!isAdmin());$("userAdmin").hidden=!isAdmin();
  $("sync").disabled=!canWrite();
  const w=$("whoami");if(acct){$("userWrap").hidden=false;$("userName").textContent=String(myName()).split(" ")[0];$("userEmail").textContent=acct.me.email||"";w.innerHTML="Ingelogd als <b>"+esc(myName())+"</b> ("+(acct.me.isOwner?"Admin":roleName(role))+")"+(!acct.me.isOwner&&!roleMw?" · niet als medewerker herkend, alleen lezen":"")}else $("userWrap").hidden=true;
  if(cur)fillBon()}
/* ---------- log ---------- */
function logWrite(what,item,detail){if(!db)return;const at=new Date().toISOString();const r={at,day:at.slice(0,10),by:myName(),what,item:String(item||"").slice(0,80)};if(detail)r.detail=String(detail).slice(0,300);
  db.collection("log").doc(at.replace(/\D/g,"")+Math.random().toString(36).slice(2,6)).set(r).catch(()=>{})}
const LOGK={voorbVan:"voorbereiding",voorbTot:"voorbereiding",heenVan:"heenreis",heenTot:"heenreis",werkVan:"aankomst",werkTot:"vertrek",terugVan:"terugreis",terugTot:"terugreis",vertrekadres:"vertrekadres",kmHeen:"km",kmTerug:"km",constAanv:"constatering",oplAanv:"oplossing",taken:"taken",materialen:"materialen",onkosten:"onkosten",kosten:"uren en bedragen",klantNaam:"naam klant",foto:"fotobeschrijving"};
let logPend={},logPendT=0;
function logChange(k){if(!curId)return;(logPend[curId]=logPend[curId]||new Set()).add(LOGK[k]||k);if(!logPendT)logPendT=Date.now()}
function logFlush(force){if(!force&&(!logPendT||Date.now()-logPendT<120000))return;for(const[id,set]of Object.entries(logPend)){if(!set.size)continue;const b=id===curId?cur:bonnen.find(x=>x.id===id);logWrite("Aangepast",b&&b.velden&&b.velden.nr,[...set].join(", "))}logPend={};logPendT=0}
let logRows=[],logUnsub=null;
function drawLog(){const q=$("logQ").value.trim().toLowerCase();const rows=logRows.filter(r=>!q||[r.by,r.what,r.item,r.detail,r.at].join(" ").toLowerCase().includes(q)).sort((a,b)=>String(b.at).localeCompare(String(a.at)));
  $("logBody").innerHTML=rows.slice(0,500).map(r=>{const d=new Date(r.at);return "<tr><td>"+esc(isNaN(d)?r.at:d.toLocaleDateString("nl-NL",{day:"2-digit",month:"2-digit",year:"2-digit"})+" "+hhmm(d))+"</td><td>"+esc(r.by)+"</td><td>"+esc(r.what)+"</td><td class=\"mono\">"+esc(r.item||"")+"</td><td>"+esc(r.detail||"")+"</td></tr>"}).join("");
  $("logEmpty").hidden=rows.length>0}
function openLogTab(){if(logUnsub)return;const since=new Date(Date.now()-90*864e5).toISOString().slice(0,10);
  try{logUnsub=db.collection("log").where("day",">=",since).onSnapshot(sn=>{logRows=(sn.docs||[]).map(d=>thaw(d.data()));drawLog()},()=>{})}catch(e){}}
$("logQ").oninput=drawLog;
/* ---------- Drive folders ---------- */
const isFolder=f=>/folder/.test(String(f.mimeType||f.mime_type||""));
async function listFolder(id){const r=await mcp.callTool(DRIVE,"search_files",{query:"parentId = '"+id+"'",excludeContentSnippets:true,pageSize:100},{cache:false});return ((r.payload&&r.payload.files)||[]).slice().sort((a,b)=>(isFolder(b)-isFolder(a))||String(a.title||"").localeCompare(String(b.title||""),"nl",{numeric:true}))}
function fileNote(f){const b=bonnen.find(x=>x.id===f.id||x.signedFileId===f.id);if(!b)return "";const st=b.signedFileId===f.id?"getekende bon":b.status==="getekend"?"in app: getekend":"in app: open";return '<span class="pill '+(b.status==="getekend"?"done":"new")+'">'+st+'</span>'}
async function fillFolder(id,ul){ul.innerHTML='<li class="busyline"><span class="spin"></span>Laden…</li>';
  try{const files=await listFolder(id);
    ul.innerHTML=files.length?files.map(f=>isFolder(f)?'<li><details data-fid="'+esc(f.id)+'"><summary>'+I("folder")+esc(f.title||"map")+'</summary><ul class="tree"></ul></details></li>':'<li class="f">'+I("file")+'<a target="_blank" rel="noopener" href="'+esc(f.viewUrl||("https://drive.google.com/file/d/"+f.id+"/view"))+'">'+esc(f.title||f.id)+'</a>'+fileNote(f)+'</li>').join(""):'<li class="f muted">Lege map</li>';
    const sum=ul.parentElement&&ul.parentElement.querySelector(":scope>summary");if(sum){let c=sum.querySelector(".cnt");if(!c){c=document.createElement("span");c.className="cnt";sum.append(" ",c)}c.textContent="("+files.length+")"}}
  catch(e){ul.innerHTML='<li class="f">'+driveErr(e)+'</li>'}}
function openDriveTab(force){const box=$("driveTree");if(box.childElementCount&&!force)return;
  if(!mcp){box.innerHTML='<p class="muted">'+driveErr({code:"not_granted"})+'</p>';return}
  box.innerHTML='<ul class="tree"><li><details open data-fid="'+FOLDER().root+'"><summary>'+I("folder")+'Werkbonnen</summary><ul class="tree"></ul></details></li></ul>';
  const d=box.querySelector("details");fillFolder(FOLDER().root,d.querySelector("ul"));d.dataset.loaded="1";$("driveOpen").href="https://drive.google.com/drive/folders/"+FOLDER().root}
$("driveTree").addEventListener("toggle",e=>{const d=e.target;if(!d.open||d.dataset.loaded)return;d.dataset.loaded="1";fillFolder(d.dataset.fid,d.querySelector("ul"))},true);
$("driveReload").onclick=()=>openDriveTab(true);
(function(){const b=$("userBtn"),m=$("userMenu");const set=o=>{m.hidden=!o;b.setAttribute("aria-expanded",String(o))};
  b.onclick=e=>{e.stopPropagation();set(m.hidden)};document.addEventListener("click",e=>{if(!m.hidden&&!e.target.closest("#userWrap"))set(false)});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!m.hidden){set(false);b.focus()}})})();
(function(){const t=$("appTitle"),d=$("infoDlg"),hov=matchMedia("(hover:hover) and (pointer:fine)");let ot,ct;
  const pop=()=>d.classList.contains("pop");
  const closeSoon=()=>{clearTimeout(ct);ct=setTimeout(()=>{if(pop())d.close()},350)};
  t.onmouseenter=()=>{clearTimeout(ct);if(!hov.matches||d.open)return;ot=setTimeout(()=>{const r=t.getBoundingClientRect();d.style.top=Math.round(r.bottom+8)+"px";d.style.left=Math.round(Math.max(12,r.left))+"px";d.classList.add("pop");d.show();if(d.contains(document.activeElement))document.activeElement.blur()},200)};
  t.onmouseleave=()=>{clearTimeout(ot);closeSoon()};
  d.onmouseenter=()=>clearTimeout(ct);d.onmouseleave=()=>{if(pop())closeSoon()};
  d.addEventListener("close",()=>{d.classList.remove("pop");d.style.top=d.style.left=""});
  t.onclick=()=>{clearTimeout(ot);if(pop())d.close();if(!d.open)d.showModal()};
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&pop())d.close()});})();
$("signOut").onclick=()=>askSure("Uitloggen op dit apparaat? Wat nog niet in Drive staat blijft hier bewaard tot je weer inlogt.").then(ok=>{if(ok)window.WBDrive.signOut()});
/* ---------- settings (⋯, admin only) ---------- */
function setTab(t){document.querySelectorAll("[data-st]").forEach(b=>b.setAttribute("aria-selected",b.dataset.st===t?"true":"false"));document.querySelectorAll("[data-sp]").forEach(p=>p.hidden=p.dataset.sp!==t);show($("setMsg"),"");
  if(t==="drive")openDriveTab();if(t==="log")openLogTab()}
document.querySelectorAll("[data-st]").forEach(b=>b.onclick=()=>setTab(b.dataset.st));
function mwRow(m){return '<div class="mw" data-mwid="'+esc(m.id||"")+'"><span class="grip" tabindex="0" role="button" aria-label="Verslepen (of pijltjes omhoog en omlaag)" title="Sleep om de volgorde te veranderen">'+I("grip")+'</span><input class="inp" data-mwn value="'+esc(m.naam||"")+'" placeholder="Naam" aria-label="Naam medewerker" maxlength="80"><input class="inp" data-mwl value="'+esc(m.login||"")+'" placeholder="naam@bedrijf.nl" aria-label="E-mail (Google)" type="email" autocomplete="off" maxlength="80"><select class="inp" data-mwr aria-label="Rechten">'+ROLES.map(r=>'<option value="'+r[0]+'"'+((m.rol||"gebruiker")===r[0]?" selected":"")+'>'+r[1]+'</option>').join("")+'</select><input class="inp mono" data-mwt value="'+esc(m.uurtarief||"")+'" inputmode="decimal" placeholder="standaard" aria-label="Uurtarief"><button type="button" data-mwdel aria-label="Medewerker verwijderen">'+I("trash")+'</button></div>'}
const SET_TTL={tar:"Tarieven en rechten",drive:"Drive-mappen",log:"Log"};
function openSet(tab){if(!isAdmin())return;tab=SET_TTL[tab]?tab:"tar";$("setTtl").textContent=SET_TTL[tab];const S=SET;$("s_uur").value=S.uurtarief||"";$("s_reis").value=S.reisTarief||"";$("s_km").value=S.kmTarief||"";$("s_btw").value=S.btw??"21";$("s_rnd").value=S.afronden||"0";$("s_min").checked=S.minUur!==false;
  $("s_mws").innerHTML=(S.medewerkers||[]).map(mwRow).join("");setTab(tab);
  if(!$("setDlg").open)$("setDlg").showModal()}
document.querySelectorAll("[data-drive]").forEach(b=>b.onclick=()=>openSet("drive"));
document.querySelectorAll("[data-open]").forEach(b=>b.onclick=()=>{$("userMenu").hidden=true;$("userBtn").setAttribute("aria-expanded","false");openSet(b.dataset.open)});
$("setForm").addEventListener("submit",e=>{if(!e.submitter||e.submitter.value!=="cancel"){e.preventDefault();if(!$("setSave").closest("[data-sp]").hidden)$("setSave").click()}});
$("s_add").onclick=()=>{$("s_mws").insertAdjacentHTML("beforeend",mwRow({}));$("s_mws").lastElementChild.querySelector("input").focus()};
$("s_mws").onclick=async e=>{const b=e.target.closest("[data-mwdel]");if(!b)return;const row=b.parentElement;const n=row.querySelector("[data-mwn]").value.trim()||"deze medewerker";if(await askSure(n+" uit de lijst verwijderen? Dit wordt definitief bij Opslaan."))row.remove()};
// reorder by dragging the grip (mouse or finger), or with the arrow keys on it
let mwDrag=null;
$("s_mws").addEventListener("pointerdown",e=>{const g=e.target.closest(".grip");if(!g)return;e.preventDefault();const row=g.parentElement;mwDrag={row,id:e.pointerId};row.classList.add("dragging");try{g.setPointerCapture(e.pointerId)}catch(_){}});
$("s_mws").addEventListener("pointermove",e=>{if(!mwDrag||e.pointerId!==mwDrag.id)return;const rows=[...$("s_mws").children].filter(r=>r!==mwDrag.row);
  const after=rows.find(r=>{const b=r.getBoundingClientRect();return e.clientY<b.top+b.height/2});if(after)$("s_mws").insertBefore(mwDrag.row,after);else $("s_mws").appendChild(mwDrag.row);
  const L=$("setDlg").getBoundingClientRect();if(e.clientY<L.top+40)$("setDlg").scrollBy(0,-12);else if(e.clientY>L.bottom-40)$("setDlg").scrollBy(0,12)});
["pointerup","pointercancel"].forEach(t=>$("s_mws").addEventListener(t,()=>{if(mwDrag){mwDrag.row.classList.remove("dragging");mwDrag=null}}));
$("s_mws").addEventListener("keydown",e=>{const g=e.target.closest(".grip");if(!g||!/^Arrow(Up|Down)$/.test(e.key))return;e.preventDefault();const r=g.parentElement;if(e.key==="ArrowUp"&&r.previousElementSibling)r.parentElement.insertBefore(r,r.previousElementSibling);else if(e.key==="ArrowDown"&&r.nextElementSibling)r.parentElement.insertBefore(r.nextElementSibling,r);g.focus()});
function setDiff(a,b){const out=[];const lab={uurtarief:"standaard uurtarief",reisTarief:"reistarief",kmTarief:"km-vergoeding",btw:"btw",afronden:"afronden",minUur:"minimaal 1 uur"};
  Object.keys(lab).forEach(k=>{if(String(a[k]??"")!==String(b[k]??""))out.push(lab[k]+" "+(a[k]??"")+" → "+(b[k]??""))});
  const am=new Map((a.medewerkers||[]).map(m=>[m.id||m.naam,m])),bm=new Map((b.medewerkers||[]).map(m=>[m.id||m.naam,m]));
  bm.forEach((m,k)=>{const o=am.get(k);if(!o)out.push(m.naam+" toegevoegd ("+roleName(m.rol)+")");else{if(o.naam!==m.naam)out.push(o.naam+" heet nu "+m.naam);if((o.rol||"gebruiker")!==(m.rol||"gebruiker"))out.push(m.naam+": rechten "+roleName(o.rol||"gebruiker")+" → "+roleName(m.rol));if((o.uurtarief||"")!==(m.uurtarief||""))out.push(m.naam+": uurtarief "+(o.uurtarief||"standaard")+" → "+(m.uurtarief||"standaard"));if((o.login||"")!==(m.login||""))out.push(m.naam+": e-mail "+(m.login||"leeg"))}});
  am.forEach((m,k)=>{if(!bm.has(k))out.push(m.naam+" verwijderd")});return out.join("; ")}
$("setSave").onclick=async()=>{if(!isAdmin())return;
  const bad=[...$("setDlg").querySelectorAll("#s_uur,#s_reis,#s_km,#s_btw,[data-mwt]")].find(i=>i.value.trim()&&pnum(i.value)==null);
  if(bad){show($("setMsg"),"<b>Dit is geen geldig bedrag.</b> Gebruik bijvoorbeeld 75,00.","warn");bad.focus();return}
  const mws=[...$("s_mws").children].map(r=>({id:r.dataset.mwid||"m"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),naam:r.querySelector("[data-mwn]").value.trim(),login:r.querySelector("[data-mwl]").value.trim(),rol:r.querySelector("[data-mwr]").value,uurtarief:r.querySelector("[data-mwt]").value.trim()})).filter(m=>m.naam);
  if(acct&&!acct.me.isOwner){const me=mws.find(isMe);if(!me||me.rol!=="admin"){show($("setMsg"),"<b>Je kunt je eigen adminrechten niet weghalen.</b> Laat dat een andere admin doen.","warn");return}}
  const doc={uurtarief:$("s_uur").value.trim(),reisTarief:$("s_reis").value.trim(),kmTarief:$("s_km").value.trim(),btw:$("s_btw").value.trim()||"21",afronden:$("s_rnd").value,minUur:$("s_min").checked,medewerkers:mws,bijgewerkt:Date.now()};
  const b=$("setSave");b.disabled=true;b.textContent="Opslaan…";const old=SET;
  try{await db.doc("instellingen/tarieven").set(doc);SET=Object.assign({},DEF_SET,doc);const d=setDiff(old,SET);if(d)logWrite("Instellingen aangepast","",d);$("setDlg").close();applyRole();renderList()}
  catch(e){show($("setMsg"),e&&e.code==="invalid_argument"?"<b>Opslaan geweigerd.</b> Je hebt geen schrijfrechten op de Drive-map Werkbonnen. Vraag Martin om je daar Bewerker te maken.":"<b>Opslaan lukte niet.</b> Controleer je internetverbinding en probeer het opnieuw.","bad")}
  finally{b.disabled=false;b.textContent="Opslaan"}};
$("sigClear").onclick=clearSig;
$("signBtn").onclick=sign;
$("uploadBtn").onclick=()=>uploadSigned(curId,false,null);
$("saveBtn").onclick=async()=>{try{busy("PDF maken…");const bytes=lastPdf||await buildPdf(cur,await loadOrig(curId),photos);lastPdf=bytes;busy("");await downloads.save({filename:"Werkbon "+((cur.velden||{}).nr||"")+" getekend.pdf",data:new Blob([bytes],{type:"application/pdf"})})}catch(e){busy("")}};
$("reopenBtn").onclick=()=>{$("reopenAsk").hidden=false};
$("reopenNo").onclick=()=>{$("reopenAsk").hidden=true};
$("reopenYes").onclick=async()=>{$("reopenAsk").hidden=true;if(!isAdmin())return;logWrite("Weer opengezet",(cur.velden||{}).nr,"was getekend door "+(cur.klantNaam||"?")+" op "+(cur.getekendOp||"?"));await db.doc("bonnen/"+curId).update({status:"open",kosten:null,handtekening:"",signedFileId:"",signedUrl:"",fotosApart:0,fotosInDrive:true,getekendOp:"",getekendTs:0,bijgewerkt:Date.now()}).catch(()=>{});lastPdf=null;$("signPrev").innerHTML="";clearSig()};
document.querySelector("details.origpdf").addEventListener("toggle",async e=>{if(!e.target.open||$("origPrev").childElementCount||!curId)return;$("origPrev").innerHTML='<div class="busyline"><span class="spin"></span>Laden…</div>';renderPdf(await loadOrig(curId),$("origPrev"),1)});
window.addEventListener("resize",()=>{if(!$("bonView").hidden)sizeSig()});
new ResizeObserver(()=>sizeSig()).observe($("sigBox"));

/* ---------- boot ---------- */
(async function boot(){
  if(!window.claude||!claude.use){$("list").innerHTML='<p class="empty">De app kon niet starten. Ververs de pagina.</p>';return}
  [db,mcp,perms,downloads,user]=await Promise.all([claude.use("db"),claude.use("mcp"),claude.use("permissions"),claude.use("downloads"),claude.use("user").catch(()=>null)]);
  if(!db){$("list").innerHTML='<p class="empty">Log in met je Google-account om de werkbonnen te zien.</p>';$("sync").disabled=true;return}
  if(!user)acct=null;else{try{const[me,wr]=await Promise.all([user.me(),user.can("data.write").catch(()=>null)]);acct={me,write:wr}}catch(e){acct=null}}
  let setFirst;const setReady=new Promise(r=>setFirst=r);setTimeout(()=>setFirst(),4000);
  db.doc("instellingen/tarieven").onSnapshot(s=>{SET=Object.assign({},DEF_SET,s.exists?thaw(s.data()):{});applyRole();setFirst()},()=>{applyRole();setFirst()});
  await setReady;
  let first;const ready=new Promise(r=>first=r);
  db.collection("bonnen").onSnapshot(s=>{bonnen=s.docs.map(d=>Object.assign({id:d.id},thaw(d.data())));renderList();first()},e=>{first();$("list").innerHTML='<p class="empty">De werkbonnen konden niet geladen worden. Ververs de pagina.</p>'});
  await ready;
  if(!mcp)show($("msg"),driveErr({code:"not_granted"}),"warn");
  else{let st="prompt";try{st=await perms.state("mcp:"+DRIVE)}catch(e){}if(st==="granted"&&canWrite()){syncDrive();let lastSync=Date.now();
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&!$("listView").hidden&&Date.now()-lastSync>60000&&!$("sync").disabled){lastSync=Date.now();syncDrive()}})}}
})();
})();
