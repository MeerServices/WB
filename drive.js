/* WB — Google-login en Google Drive als gedeelde opslag.
 *
 * De app-code (app.js) is gebouwd op een kleine set functies: db (documenten), mcp (Drive-bestanden),
 * user (wie is ingelogd), permissions en downloads. Dit bestand levert die functies, maar dan rechtstreeks
 * op Google Drive, zodat de app los van claude.ai werkt.
 *
 * In de Drive-map Werkbonnen (config.js › driveFolderId):
 *   Open/                PDF's uit MSWMenuX
 *   Getekend/            getekende PDF's
 *   WB-data/bonnen/      één JSON-bestand per werkbon (invoer, handtekening, status)
 *   WB-data/fotos/       foto's per werkbon (JSON met de foto)
 *   WB-data/instellingen/ tarieven, medewerkers en rechten
 *   WB-data/log/         één klein bestand per logregel
 * Alles wordt eerst op het toestel bewaard (IndexedDB) en daarna naar Drive gestuurd, dus de app werkt ook zonder internet.
 */
(() => {
  "use strict";
  const CFG = window.WB_CONFIG || {};
  const API = "https://www.googleapis.com/drive/v3", UP = "https://www.googleapis.com/upload/drive/v3";
  const SCOPE = "https://www.googleapis.com/auth/drive";
  const FOLDER = "application/vnd.google-apps.folder";
  const $ = (id) => document.getElementById(id);
  const err = (code, message) => Object.assign(new Error(message || code), { code });
  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  /* ---------- inloggen ---------- */
  let token = null, tokenExp = 0, tokenClient = null, me = null;
  try { const t = JSON.parse(localStorage.getItem("wb.tok") || "null"); if (t && t.e > Date.now() + 120000) { token = t.t; tokenExp = t.e; } } catch (e) {}
  function loadGis() {
    return new Promise((res, rej) => {
      if (window.google && google.accounts && google.accounts.oauth2) return res();
      const s = document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = () => res(); s.onerror = () => rej(err("offline", "Google-login kon niet laden")); document.head.appendChild(s);
    });
  }
  // Vraagt een toegangssleutel bij Google. Moet vanuit een tik of klik worden aangeroepen (anders blokkeert de browser het venster).
  async function signIn() {
    await loadGis();
    if (!tokenClient) tokenClient = google.accounts.oauth2.initTokenClient({ client_id: CFG.googleClientId, scope: SCOPE, callback: () => {} });
    return new Promise((res, rej) => {
      tokenClient.callback = (r) => {
        if (!r || r.error) return rej(err("auth", (r && r.error) || "geweigerd"));
        token = r.access_token; tokenExp = Date.now() + (+r.expires_in || 3600) * 1000;
        try { localStorage.setItem("wb.tok", JSON.stringify({ t: token, e: tokenExp })); } catch (e) {}
        res(token);
      };
      tokenClient.error_callback = (e) => rej(err("auth", (e && e.type) || "venster gesloten"));
      let hint = ""; try { hint = localStorage.getItem("wb.email") || ""; } catch (e) {}
      tokenClient.requestAccessToken(hint ? { prompt: "", login_hint: hint } : { prompt: "" });
    });
  }
  function signOut() {
    try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
    token = null; tokenExp = 0; try { localStorage.removeItem("wb.tok"); } catch (e) {}
    location.reload();
  }
  let reauthShown = false;
  function needReauth() {
    token = null; try { localStorage.removeItem("wb.tok"); } catch (e) {}
    if (reauthShown) return; reauthShown = true;
    const b = $("reauth"); if (b) b.hidden = false;
  }

  /* ---------- Drive REST ---------- */
  async function g(url, opt = {}, as) {
    if (!token || Date.now() > tokenExp - 30000) { needReauth(); throw err("needs_reauth", "Opnieuw inloggen nodig"); }
    let r;
    try { r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: "Bearer " + token } }); }
    catch (e) { throw err("offline", "Geen verbinding met Google Drive"); }
    if (r.status === 401) { needReauth(); throw err("needs_reauth", "Opnieuw inloggen nodig"); }
    if (!r.ok) {
      let m = ""; try { m = (await r.json()).error.message; } catch (e) {}
      throw err(r.status === 403 ? "forbidden" : r.status === 404 ? "not_found" : r.status === 429 ? "rate_limited" : r.status >= 500 ? "server_unavailable" : "tool_error", m || "HTTP " + r.status);
    }
    if (as === "raw") return r;
    if (as === "buf") return new Uint8Array(await r.arrayBuffer());
    if (as === "text") return r.text();
    return r.status === 204 ? null : r.json();
  }
  const qs = (o) => Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
  async function list(q, fields, extra) {
    const out = []; let pageToken;
    do {
      const r = await g(API + "/files?" + qs({ q, fields: "nextPageToken,files(" + fields + ")", pageSize: 1000, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true, ...(extra || {}) }));
      out.push(...(r.files || [])); pageToken = r.nextPageToken;
    } while (pageToken);
    return out;
  }
  const meta = (id, fields) => g(API + "/files/" + encodeURIComponent(id) + "?" + qs({ fields, supportsAllDrives: true }));
  const media = (id) => g(API + "/files/" + encodeURIComponent(id) + "?" + qs({ alt: "media", supportsAllDrives: true }), {}, "buf");
  function multipart(metaObj, blob) {
    const b = "wb" + Math.random().toString(36).slice(2);
    const body = new Blob(["--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metaObj) + "\r\n--" + b + "\r\nContent-Type: " + (blob.type || "application/octet-stream") + "\r\n\r\n", blob, "\r\n--" + b + "--"]);
    return { body, type: "multipart/related; boundary=" + b };
  }
  async function createFile(metaObj, blob, fields) {
    const m = multipart(metaObj, blob);
    return g(UP + "/files?" + qs({ uploadType: "multipart", fields: fields || "id,modifiedTime,webViewLink", supportsAllDrives: true }), { method: "POST", headers: { "Content-Type": m.type }, body: m.body });
  }
  async function updateFile(id, metaObj, blob, fields) {
    const m = multipart(metaObj || {}, blob);
    return g(UP + "/files/" + encodeURIComponent(id) + "?" + qs({ uploadType: "multipart", fields: fields || "id,modifiedTime", supportsAllDrives: true }), { method: "PATCH", headers: { "Content-Type": m.type }, body: m.body });
  }
  const trash = (id) => g(API + "/files/" + encodeURIComponent(id) + "?" + qs({ supportsAllDrives: true }), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) });
  const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  async function folder(name, parent, create) {
    const f = await list("'" + esc(parent) + "' in parents and name = '" + esc(name) + "' and mimeType = '" + FOLDER + "' and trashed = false", "id");
    if (f.length) return f[0].id;
    if (!create) return null;
    const r = await g(API + "/files?" + qs({ fields: "id", supportsAllDrives: true }), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, mimeType: FOLDER, parents: [parent] }) });
    return r.id;
  }

  /* ---------- lokale opslag (IndexedDB) ---------- */
  let idb = null;
  function openIdb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("wb", 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("docs", { keyPath: "path" }); d.createObjectStore("files"); d.createObjectStore("kv"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  const tx = (store, mode, fn) => new Promise((res, rej) => { const t = idb.transaction(store, mode); const s = t.objectStore(store); let out; const r = fn(s); if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
  const idbAll = () => tx("docs", "readonly", (s) => s.getAll());
  const idbPut = (rec) => tx("docs", "readwrite", (s) => s.put(rec)).catch(() => {});
  const idbDel = (path) => tx("docs", "readwrite", (s) => s.delete(path)).catch(() => {});
  const kvGet = (k) => tx("kv", "readonly", (s) => s.get(k)).catch(() => null);
  const kvSet = (k, v) => tx("kv", "readwrite", (s) => s.put(v, k)).catch(() => {});
  const fileGet = (k) => tx("files", "readonly", (s) => s.get(k)).catch(() => null);
  const fileSet = (k, v) => tx("files", "readwrite", (s) => s.put(v, k)).catch(() => {});

  /* ---------- documentenopslag op Drive ---------- */
  // path "bonnen/X" ligt in WB-data/bonnen, "bonnen/X/fotos/Y" in WB-data/fotos, "log/Y" in WB-data/log, enz.
  const cache = new Map(); // path -> {path, data, fileId, mt, dirty, deleted}
  const docL = new Map(), colL = new Map(); // path -> Set(callback)
  const F = { root: CFG.driveFolderId || "", open: "", signed: "", data: "", sub: {} };
  const kindOf = (path) => { const s = path.split("/"); return s.length >= 4 && s[2] === "fotos" ? "fotos" : s[0]; };
  const parentOf = (path) => path.split("/").slice(0, -1).join("/");
  const fileName = (path) => path.replace(/\//g, "~") + ".json";
  const live = (r) => r && !r.deleted;
  function snap(path) {
    const r = cache.get(path), id = path.split("/").pop();
    return { id, ref: { path }, exists: live(r), data: () => (live(r) ? clone(r.data) : undefined) };
  }
  function colSnap(cpath, filter) {
    const depth = cpath.split("/").length + 1;
    let docs = [...cache.values()].filter((r) => live(r) && r.path.startsWith(cpath + "/") && r.path.split("/").length === depth).map((r) => snap(r.path));
    if (filter) docs = filter(docs);
    return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
  }
  let notifyT = null; const notifyP = new Set();
  function notify(path) {
    notifyP.add(path);
    if (notifyT) return;
    notifyT = setTimeout(() => {
      notifyT = null; const ps = [...notifyP]; notifyP.clear();
      const cols = new Set();
      ps.forEach((p) => { (docL.get(p) || []).forEach((f) => { try { f(); } catch (e) { console.error(e); } }); cols.add(parentOf(p)); });
      cols.forEach((c) => (colL.get(c) || []).forEach((f) => { try { f(); } catch (e) { console.error(e); } }));
    }, 0);
  }
  function write(path, data, deleted) {
    const old = cache.get(path) || { path };
    const rec = { ...old, data: deleted ? null : clone(data), dirty: true, deleted: !!deleted, local: Date.now() };
    cache.set(path, rec); idbPut(rec); notify(path); schedulePush(); status();
  }
  const listen = (map, key, fn) => { if (!map.has(key)) map.set(key, new Set()); map.get(key).add(fn); return () => map.get(key).delete(fn); };

  function docRef(path) {
    return {
      id: path.split("/").pop(), path,
      get: async () => snap(path),
      set: async (d) => write(path, d),
      update: async (d) => { const r = cache.get(path); write(path, Object.assign({}, live(r) ? r.data : {}, clone(d))); },
      delete: async () => write(path, null, true),
      onSnapshot: (fn) => { const f = () => fn(snap(path)); const off = listen(docL, path, f); setTimeout(f, 0); return off; },
    };
  }
  function query(cpath, filters, order) {
    const run = (docs) => {
      let out = docs;
      filters.forEach(([f, op, v]) => { out = out.filter((d) => { const x = (d.data() || {})[f]; return op === ">=" ? x >= v : op === "<=" ? x <= v : op === ">" ? x > v : op === "<" ? x < v : op === "==" ? x === v : true; }); });
      if (order) out = out.slice().sort((a, b) => { const x = (a.data() || {})[order], y = (b.data() || {})[order]; return x > y ? 1 : x < y ? -1 : 0; });
      return out;
    };
    return {
      path: cpath,
      doc: (id) => docRef(cpath + "/" + (id || Math.random().toString(36).slice(2) + Date.now().toString(36))),
      add: async (d) => { const r = docRef(cpath + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)); await r.set(d); return r; },
      where: (f, op, v) => query(cpath, filters.concat([[f, op, v]]), order),
      orderBy: (f) => query(cpath, filters, f),
      limit: () => query(cpath, filters, order),
      get: async () => { await pullCollection(cpath).catch(() => {}); return colSnap(cpath, run); },
      onSnapshot: (fn) => { const f = () => fn(colSnap(cpath, run)); const off = listen(colL, cpath, f); setTimeout(f, 0); watch(cpath); return () => { off(); unwatch(cpath); }; },
    };
  }
  const db = { doc: docRef, collection: (p) => query(p, [], null) };

  /* ---------- versturen naar Drive ---------- */
  let pushing = false, pushT = null;
  function schedulePush(ms) { clearTimeout(pushT); pushT = setTimeout(push, ms == null ? 400 : ms); }
  async function push() {
    if (pushing || !token) return; pushing = true;
    try {
      for (const r of [...cache.values()].filter((x) => x.dirty)) {
        const stamp = r.local;
        if (r.deleted) { if (r.fileId) await trash(r.fileId).catch((e) => { if (e.code !== "not_found") throw e; }); }
        else {
          const blob = new Blob([JSON.stringify(r.data)], { type: "application/json" });
          const kind = kindOf(r.path);
          let res;
          if (r.fileId) res = await updateFile(r.fileId, {}, blob).catch((e) => { if (e.code === "not_found") return null; throw e; });
          if (!res) res = await createFile({ name: fileName(r.path), parents: [await sub(kind)], mimeType: "application/json", appProperties: { p: r.path.slice(0, 110), c: parentOf(r.path).slice(0, 110) } }, blob);
          r.fileId = res.id; r.mt = res.modifiedTime;
        }
        const now = cache.get(r.path);
        if (now === r && r.local === stamp) { r.dirty = false; if (r.deleted) { cache.delete(r.path); idbDel(r.path); } else idbPut(r); }
      }
      lastErr = null;
    } catch (e) { lastErr = e; if (e.code !== "needs_reauth") schedulePush(15000); }
    finally { pushing = false; status(); }
  }
  let lastErr = null;

  /* ---------- ophalen van Drive ---------- */
  const watched = new Map();
  function watch(c) { watched.set(c, (watched.get(c) || 0) + 1); pullCollection(c).catch(() => {}); }
  function unwatch(c) { const n = (watched.get(c) || 1) - 1; if (n > 0) watched.set(c, n); else watched.delete(c); }
  async function sub(kind) {
    if (F.sub[kind]) return F.sub[kind];
    F.sub[kind] = await folder(kind, F.data, true); return F.sub[kind];
  }
  async function absorb(files, scopeFilter) {
    // newest file per path wins; files the store no longer lists are gone
    const byPath = new Map();
    files.forEach((f) => { const p = f.appProperties && f.appProperties.p; if (!p) return; const o = byPath.get(p); if (!o || o.modifiedTime < f.modifiedTime) byPath.set(p, f); });
    for (const [p, f] of byPath) {
      const r = cache.get(p);
      if (r && (r.dirty || (r.fileId === f.id && r.mt >= f.modifiedTime))) continue;
      try {
        const txt = new TextDecoder().decode(await media(f.id));
        const cur = cache.get(p); if (cur && cur.dirty) continue;
        const rec = { path: p, data: JSON.parse(txt), fileId: f.id, mt: f.modifiedTime, dirty: false };
        cache.set(p, rec); idbPut(rec); notify(p);
      } catch (e) { if (e.code === "needs_reauth" || e.code === "offline") throw e; }
    }
    [...cache.values()].filter((r) => scopeFilter(r.path) && r.fileId && !r.dirty && !byPath.has(r.path)).forEach((r) => { cache.delete(r.path); idbDel(r.path); notify(r.path); });
  }
  async function pullKind(kind) {
    const files = await list("'" + (await sub(kind)) + "' in parents and trashed = false", "id,appProperties,modifiedTime");
    await absorb(files, (p) => kindOf(p) === kind);
  }
  async function pullCollection(c) {
    if (!token || !F.data) return;
    if (c.split("/").length >= 3 && c.split("/")[2] === "fotos") {
      const files = await list("'" + (await sub("fotos")) + "' in parents and trashed = false and appProperties has { key='c' and value='" + esc(c) + "' }", "id,appProperties,modifiedTime");
      return absorb(files, (p) => parentOf(p) === c);
    }
    if (c === "log") {
      const since = new Date(Date.now() - 92 * 864e5).toISOString();
      const files = await list("'" + (await sub("log")) + "' in parents and trashed = false and modifiedTime > '" + since + "'", "id,appProperties,modifiedTime");
      return absorb(files, (p) => kindOf(p) === "log" && (cache.get(p) || {}).mt > since);
    }
  }
  let pulling = false;
  async function pull() {
    if (pulling || !token || !F.data) return; pulling = true;
    try {
      await pullKind("instellingen"); await pullKind("bonnen");
      for (const c of watched.keys()) await pullCollection(c);
      lastPull = Date.now(); lastErr = null;
    } catch (e) { lastErr = e; }
    finally { pulling = false; status(); }
  }
  let lastPull = 0;
  setInterval(() => { if (document.visibilityState === "visible") { pull(); if ([...cache.values()].some((r) => r.dirty)) schedulePush(0); } }, 30000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); else push(); });
  window.addEventListener("online", () => { push(); pull(); });

  /* ---------- status rechtsboven ---------- */
  function status() {
    const el = $("netState"); if (!el) return;
    const n = [...cache.values()].filter((r) => r.dirty).length;
    if (lastErr && lastErr.code === "needs_reauth") el.textContent = "Opnieuw inloggen nodig";
    else if (n) el.textContent = n + (n === 1 ? " wijziging wacht" : " wijzigingen wachten") + (navigator.onLine === false || (lastErr && lastErr.code === "offline") ? " op internet" : " op Drive");
    else el.textContent = navigator.onLine === false ? "Offline" : "";
    el.hidden = !el.textContent;
  }

  /* ---------- wat app.js gebruikt ---------- */
  const b64 = (u) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const fromB64 = (s, type) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type }); };
  const mcp = {
    listTools: async () => ({ fileArgs: true, servers: [] }),
    async callTool(server, tool, input) {
      if (tool === "search_files") {
        const m = /parentId\s*=\s*'([^']+)'/.exec(input.query || ""); if (!m) throw err("bad_request", "geen map");
        let q = "'" + esc(m[1]) + "' in parents and trashed = false";
        const mt = /mimeType\s*=\s*'([^']+)'/.exec(input.query || ""); if (mt) q += " and mimeType = '" + esc(mt[1]) + "'";
        const files = await list(q, "id,name,mimeType,webViewLink,modifiedTime");
        return { payload: { files: files.map((f) => ({ id: f.id, title: f.name, mimeType: f.mimeType, viewUrl: f.webViewLink })) } };
      }
      if (tool === "download_file_content") {
        let u = await fileGet("pdf:" + input.fileId);
        if (!u) { u = await media(input.fileId); fileSet("pdf:" + input.fileId, u); }
        return { payload: { content: b64(u) } };
      }
      if (tool === "create_file") {
        const c = input.base64Content; const blob = c && c.$file ? c.$file.data : fromB64(String(c || ""), input.contentMimeType || "application/pdf");
        const r = await createFile({ name: input.title, parents: [input.parentId], mimeType: input.contentMimeType || blob.type }, blob);
        return { payload: { id: r.id, viewUrl: r.webViewLink } };
      }
      throw err("not_in_manifest", tool);
    },
  };
  let rootCaps = null, rootOwners = [];
  const user = {
    me: async () => ({ id: me && me.permissionId, name: (me && me.displayName) || "", email: (me && me.emailAddress) || "", avatarUrl: (me && me.photoLink) || "", isOwner: !!(me && rootOwners.includes((me.emailAddress || "").toLowerCase())) }),
    can: async (what) => (what === "data.write" ? (rootCaps ? !!rootCaps.canAddChildren : null) : null),
    canEdit: async () => !!(me && rootOwners.includes((me.emailAddress || "").toLowerCase())),
    isOwner: async () => !!(me && rootOwners.includes((me.emailAddress || "").toLowerCase())),
  };
  const permissions = { state: async () => (token ? "granted" : "prompt") };
  const downloads = {
    save: async ({ filename, data }) => { const a = document.createElement("a"); a.href = URL.createObjectURL(data); a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); },
  };

  /* ---------- opstarten ---------- */
  let resolveReady; const ready = new Promise((r) => (resolveReady = r));
  async function start() {
    const box = $("login"), msg = $("loginMsg");
    if (!CFG.googleClientId || !F.root) { box.hidden = false; $("loginBtn").hidden = true; msg.hidden = false; msg.innerHTML = "<b>Nog niet ingesteld.</b> Vul in <code>config.js</code> de Google-client-ID en de map Werkbonnen in. Hoe dat gaat staat in KOPPELINGEN.md."; return; }
    idb = await openIdb().catch(() => null);
    if (idb) (await idbAll().catch(() => [])).forEach((r) => cache.set(r.path, r));
    const k = (await kvGet("folders")) || null; if (k && k.root === F.root) Object.assign(F, k);
    const cachedMe = await kvGet("me"); if (cachedMe) { me = cachedMe.me; rootOwners = cachedMe.owners || []; rootCaps = cachedMe.caps || null; }
    if (token) { try { await connect(); } catch (e) { if (e.code === "needs_reauth" || e.code === "auth" || e.code === "forbidden" || e.code === "not_found") return askLogin(e); } }
    else if (!me) return askLogin();
    else needReauth();
    finish();
  }
  async function connect() {
    me = (await g(API + "/about?fields=user")).user;
    try { localStorage.setItem("wb.email", me.emailAddress || ""); } catch (e) {}
    const r = await meta(F.root, "id,name,owners(emailAddress),capabilities(canAddChildren,canEdit)");
    rootOwners = (r.owners || []).map((o) => (o.emailAddress || "").toLowerCase()); rootCaps = r.capabilities || null;
    F.open = F.open || (await folder("Open", F.root, true));
    F.signed = F.signed || (await folder("Getekend", F.root, true));
    F.data = F.data || (await folder("WB-data", F.root, true));
    kvSet("folders", { root: F.root, open: F.open, signed: F.signed, data: F.data, sub: F.sub });
    kvSet("me", { me, owners: rootOwners, caps: rootCaps });
    await pull();
  }
  function finish() { $("login").hidden = true; status(); resolveReady(); schedulePush(0); }
  function askLogin(e) {
    const box = $("login"), msg = $("loginMsg"); box.hidden = false;
    if (e && e.code === "not_found") { msg.hidden = false; msg.innerHTML = "<b>De map Werkbonnen is niet gevonden of niet met je gedeeld.</b> Vraag Martin om de map Werkbonnen in Google Drive met je Google-account te delen, als Bewerker."; }
    else if (e && e.code === "forbidden") { msg.hidden = false; msg.innerHTML = "<b>Google Drive weigert de toegang.</b> " + (e.message || ""); }
    else if (e && e.code === "auth") { msg.hidden = false; msg.innerHTML = "<b>Inloggen is niet gelukt.</b> Probeer het opnieuw. Werkt het niet, vraag Martin of je Google-account is toegevoegd."; }
    else msg.hidden = true;
  }
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("#loginBtn, #reauthBtn"); if (!b) return;
    b.disabled = true;
    try {
      await signIn(); await connect();
      reauthShown = false; const r = $("reauth"); if (r) r.hidden = true;
      if (b.id === "loginBtn") finish(); else { schedulePush(0); status(); }
    } catch (x) { if (b.id === "loginBtn") askLogin(x); else { const r = $("reauth"); if (r) r.hidden = false; } }
    finally { b.disabled = false; }
  });

  window.WBDrive = { folders: F, ready, signOut, pull, push, me: () => me };
  window.claude = { use: async (n) => { await ready; return { db, mcp, user, permissions, downloads }[n] || null; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
