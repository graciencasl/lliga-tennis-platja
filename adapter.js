/* Adaptador Supabase para la web propia (fase 5b, D47-D53).
   Reproduce la parte de `claude.use("db"|"user"|"assets"|"sample")` que usa index.html, sobre Supabase,
   para no reescribir la interfaz. Solo usa la clave pública (publishable); la seguridad la dan las reglas RLS (supabase/01_schema.sql, 04_*.sql).
   Los datos se leen al abrir y se refrescan cada 60 s (solo lo que cambia) y tras cada escritura. */
(function () {
  const CFG = window.LCTP_CONFIG, lib = window.supabase;
  if (!CFG || !lib) { window.claude = { use: async () => null }; return; }
  const sb = lib.createClient(CFG.url, CFG.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
  let session = null, listo = false, recuperant = false;
  /* Si el correo lleva un enlace (plantilla por defecto), Supabase vuelve a la web con la sesión en el fragmento #access_token=...: se aprovecha. */
  const frag = new URLSearchParams(location.hash.replace(/^#/, "")); let enllac = null;
  if (frag.get("access_token") && frag.get("refresh_token")) {
    enllac = { access_token: frag.get("access_token"), refresh_token: frag.get("refresh_token"), tipus: frag.get("type") };
    history.replaceState(null, "", location.pathname + location.search);
  }
  const ready = (async () => {
    try {
      if (enllac) { const r = await sb.auth.setSession({ access_token: enllac.access_token, refresh_token: enllac.refresh_token }); if (!r.error && enllac.tipus === "recovery") window.LCTP_RECOVERY = true; }
      const r = await sb.auth.getSession(); session = r.data.session;
    } catch (e) { /* sin sesión */ } finally { listo = true; }
  })();
  const tornada = () => location.origin + location.pathname;
  sb.auth.onAuthStateChange((ev, s) => {
    const abans = session && session.user ? session.user.id : null, despres = s && s.user ? s.user.id : null;
    session = s; if (listo && !recuperant && abans !== despres) location.reload();
  });

  const fail = e => { const err = new Error(e.message || "error"); err.code = (e.code === "42501" || /row-level security|permission denied/i.test(e.message || "")) ? "invalid_argument" : (e.code || "error"); throw err; };
  const ck = r => { if (r.error) fail(r.error); return r.data; };
  const treu = (o, claus) => { const r = { ...o }; claus.forEach(k => delete r[k]); return r; };
  const uid = () => (session && session.user ? session.user.id : null);

  /* ---------- lectura ---------- */
  let privatOk = false;
  const fusiona = (d, p) => {
    if (!p) return d;
    const per = {}; (p.jugadors || []).forEach(j => { per[j.ordre] = j; });
    return { ...d, capitans: p.capitans || [], jugadors: (d.jugadors || []).map(j => per[j.ordre] ? { ...j, nom: per[j.ordre].nom, cognoms: per[j.ordre].cognoms, llicencia: per[j.ordre].llicencia } : j) };
  };
  async function llegeixColeccio(nom) {
    if (nom === "equips") {
      const rows = ck(await sb.from("equips").select("id,data")); const priv = {};
      /* nombres y licencias (D69): solo los devuelve la base de datos a capitanes, miembros aprobados y administrador */
      if (session) { const p = await sb.from("equips_privat").select("id,data"); if (!p.error) (p.data || []).forEach(r => { priv[r.id] = r.data; }); }
      privatOk = Object.keys(priv).length > 0;
      return rows.map(r => ({ id: r.id, data: fusiona(r.data, priv[r.id]) }));
    }
    if (nom === "calendari") {
      const rows = ck(await sb.from("eliminatories").select("id,divisio,jornada,data,local,visitant").order("divisio").order("jornada").order("id"));
      const g = {}; rows.forEach(r => { (g[r.divisio] = g[r.divisio] || { divisio: r.divisio, eliminatories: [] }).eliminatories.push({ id: r.id, jornada: r.jornada, data: r.data, local: r.local, visitant: r.visitant }); });
      return Object.keys(g).map(k => ({ id: k, data: g[k] }));
    }
    if (nom === "validades") return ck(await sb.from("validades").select("eliminatoria,data")).map(r => ({ id: r.eliminatoria, data: r.data }));
    if (nom === "sortejos") return ck(await sb.from("sortejos").select("divisio,data")).map(r => ({ id: r.divisio, data: r.data }));
    if (nom === "actes") return ck(await sb.from("actes").select("eliminatoria,estat,data,motiu,enviada_per,enviada_at")).map(r => ({
      id: r.eliminatoria, data: { ...r.data, eliminatoria: r.eliminatoria, estat: r.estat, ...(r.motiu ? { motiu: r.motiu } : {}), enviadaPer: r.enviada_per, enviadaAt: r.enviada_at } }));
    if (nom === "solicituds") return ck(await sb.from("solicituds").select("user_id,equips,nom_declarat,enviat_at,email")).map(r => ({
      id: r.user_id, data: { equips: r.equips, nomDeclarat: r.nom_declarat, enviatAt: r.enviat_at, email: r.email } }));
    if (nom === "membres") return ck(await sb.from("membres").select("user_id,equip,jugador,aprovat,email,enviat_at,nom_declarat")).map(r => ({
      id: r.user_id, data: { equip: r.equip, jugador: r.jugador, aprovat: r.aprovat, email: r.email, enviatAt: r.enviat_at, nomDeclarat: r.nom_declarat } }));
    if (nom === "contactes") { if (!session) return []; const r = await sb.rpc("contactes_capitans"); return (ck(r) || []).map(x => ({ id: x.equip + "|" + x.user_id, data: { equip: x.equip, nom: x.nom, telefon: x.telefon } })); }
    if (nom === "alineacions") return ck(await sb.from("alineacions").select("id,equip,eliminatoria,nom,data,updated_at").order("updated_at", { ascending: false })).map(r => ({
      id: r.id, data: { ...r.data, equip: r.equip, eliminatoria: r.eliminatoria, nom: r.nom, updatedAt: r.updated_at } }));
    if (nom === "esborranys") return ck(await sb.from("esborranys").select("eliminatoria,data,actualitzat_per,actualitzat_at")).map(r => ({
      id: r.eliminatoria, data: { ...r.data, actualitzatPer: r.actualitzat_per, actualitzatAt: r.actualitzat_at } }));
    if (nom === "incidencies") { if (!session) return []; return ck(await sb.from("incidencies").select("id,user_id,email,text,audio,estat,nota,created_at,updated_at,resolta_at").order("created_at", { ascending: false })).map(r => ({
      id: r.id, data: { userId: r.user_id, email: r.email, text: r.text, audio: r.audio, estat: r.estat, nota: r.nota, creadaAt: r.created_at, modificadaAt: r.updated_at, resoltaAt: r.resolta_at } })); }
    throw new Error("col·lecció desconeguda: " + nom);
  }
  let esFct = false; const fctNoms = {};
  async function llegeixRols() {
    if (esFct) {   // D73: convidat FCT, només equip i nom (mai el correu)
      const r = ck(await sb.rpc("rols_fct")) || []; const eq = {};
      r.forEach(x => { (eq[x.equip] = eq[x.equip] || []).push(x.user_id); fctNoms[x.user_id] = x.nom || ""; }); return { equips: eq };
    }
    const rows = ck(await sb.from("capitans").select("equip,user_id")); const eq = {};
    rows.forEach(r => { (eq[r.equip] = eq[r.equip] || []).push(r.user_id); }); return { equips: eq };
  }
  async function llegeixDoc(path) {
    const [c, id] = path.split("/");
    if (path === "lliga/config") { const r = ck(await sb.from("lliga_config").select("data").eq("id", 1).maybeSingle()); return r ? r.data : null; }
    if (path === "admin/avisos") { const r = ck(await sb.from("avisos").select("data").eq("id", 1).maybeSingle()); return r ? r.data : null; }
    if (path === "roles/capitans") return llegeixRols();
    if (c === "acords") { const r = ck(await sb.from("acords_dades").select("versio,acceptat_at").eq("user_id", id).maybeSingle()); return r ? { versio: r.versio, acceptatAt: r.acceptat_at } : null; }
    if (c === "telefons") { const r = ck(await sb.from("capitans_contacte").select("telefon").eq("user_id", id).maybeSingle()); return r ? { telefon: r.telefon } : null; }
    if (c === "solicituds") {
      const r = ck(await sb.from("solicituds").select("user_id,equips,nom_declarat,enviat_at,email").eq("user_id", id).maybeSingle());
      return r ? { equips: r.equips, nomDeclarat: r.nom_declarat, enviatAt: r.enviat_at, email: r.email } : null;
    }
    const r = (await llegeixColeccio(c)).find(x => x.id === id); return r ? r.data : null;
  }

  /* ---------- escriptura ---------- */
  async function desaRols(d) {
    const cur = (await llegeixRols()).equips, want = (d && d.equips) || {};
    for (const [equip, llista] of Object.entries(cur)) for (const u of llista) if (!(want[equip] || []).includes(u)) ck(await sb.from("capitans").delete().eq("equip", equip).eq("user_id", u));
    const noves = []; for (const [equip, llista] of Object.entries(want)) for (const u of llista) if (!(cur[equip] || []).includes(u)) noves.push({ equip, user_id: u });
    if (!noves.length) return;
    const ids = [...new Set(noves.map(n => n.user_id))];
    const sol = ck(await sb.from("solicituds").select("user_id,nom_declarat,email").in("user_id", ids)); const per = {}; sol.forEach(s => per[s.user_id] = s);
    ck(await sb.from("capitans").upsert(noves.map(n => ({ ...n, nom: per[n.user_id] ? per[n.user_id].nom_declarat : null, email: per[n.user_id] ? per[n.user_id].email : null })), { onConflict: "equip,user_id" }));
  }
  async function desa(path, d) {
    const [c, id] = path.split("/");
    if (path === "lliga/config") return ck(await sb.from("lliga_config").upsert({ id: 1, data: d }));
    if (path === "admin/avisos") return ck(await sb.from("avisos").upsert({ id: 1, data: d }));
    if (path === "roles/capitans") return desaRols(d);
    if (c === "equips") return ck(await sb.from("equips").upsert({ id, data: d }));
    if (c === "sortejos") return ck(await sb.from("sortejos").upsert({ divisio: id, data: d }));
    if (c === "validades") return ck(await sb.from("validades").upsert({
      eliminatoria: id, data: treu({ ...d, ...(d.arxiu ? { arxiu: treu(d.arxiu, ["url"]) } : {}) }, ["validadaPer", "corregidaPer"]),
      validada_at: d.validadaAt || new Date().toISOString(), corregida_at: d.corregidaAt || null }));
    if (c === "actes") return ck(await sb.from("actes").upsert({
      eliminatoria: id, local: "", estat: d.estat || "pendent", motiu: d.motiu || null,
      data: treu({ ...d, ...(d.arxiu ? { arxiu: treu(d.arxiu, ["url"]) } : {}) }, ["estat", "motiu", "enviadaAt", "enviadaPer", "eliminatoria"]) }, { onConflict: "eliminatoria" }));
    if (c === "solicituds") return ck(await sb.from("solicituds").upsert({ user_id: id, equips: d.equips, nom_declarat: d.nomDeclarat }, { onConflict: "user_id" }));
    if (c === "membres") return ck(await sb.from("membres").upsert({ user_id: id, equip: d.equip, jugador: d.jugador == null ? null : d.jugador, aprovat: !!d.aprovat, nom_declarat: d.nomDeclarat || null }, { onConflict: "user_id" }));
    if (c === "incidencies") {   /* D75: primero se intenta actualizar; si no existe, se crea (el servidor fija autor, correo y estado) */
      const camps = { text: d.text || null, audio: d.audio || null, estat: d.estat || "oberta", nota: d.nota || null };
      const u = ck(await sb.from("incidencies").update(camps).eq("id", id).select("id"));
      if (u && u.length) return;
      return ck(await sb.from("incidencies").insert({ id, text: camps.text, audio: camps.audio }));
    }
    if (c === "acords") return ck(await sb.rpc("accepta_acord"));
    if (c === "telefons") return ck(await sb.from("capitans_contacte").upsert({ user_id: id, telefon: d.telefon }, { onConflict: "user_id" }));
    if (c === "alineacions") return ck(await sb.from("alineacions").upsert({ id, equip: d.equip, eliminatoria: d.eliminatoria || null, nom: d.nom,
      data: treu(d, ["equip", "eliminatoria", "nom", "updatedAt"]) }, { onConflict: "id" }));
    if (c === "esborranys") return ck(await sb.from("esborranys").upsert({ eliminatoria: id, data: treu(d, ["actualitzatPer", "actualitzatAt"]) }, { onConflict: "eliminatoria" }));
    throw new Error("escriptura no permesa: " + path);
  }
  async function esborra(path) {
    const [c, id] = path.split("/");
    const t = { validades: ["validades", "eliminatoria"], solicituds: ["solicituds", "user_id"], actes: ["actes", "eliminatoria"], alineacions: ["alineacions", "id"], membres: ["membres", "user_id"], esborranys: ["esborranys", "eliminatoria"], telefons: ["capitans_contacte", "user_id"], incidencies: ["incidencies", "id"] }[c];
    if (!t) throw new Error("esborrat no permès: " + path);
    ck(await sb.from(t[0]).delete().eq(t[1], id));
  }

  /* ---------- subscripcions (lectura periòdica) ---------- */
  const oients = new Set(); let enCurs = false;
  const CANVIANT = p => p === "equips" ? (!!session && !privatOk) : !["lliga/config", "calendari"].includes(p);   /* con sesión y sin datos personales aún, se vuelve a mirar (por si te aprueban como miembro) */
  async function executa(o, forca) {
    if (!forca && o.fet && !CANVIANT(o.path)) return;
    try {
      let snap;
      if (o.tipus === "doc") { const d = await llegeixDoc(o.path); snap = { exists: d != null, data: () => d, metadata: { fromCache: false } }; }
      else { const docs = await llegeixColeccio(o.path); snap = { docs: docs.map(x => ({ id: x.id, data: () => x.data })), metadata: { fromCache: false } }; }
      const clau = JSON.stringify(o.tipus === "doc" ? snap.data() : snap.docs.map(x => [x.id, x.data()]));
      if (!o.fet || clau !== o.clau) { o.clau = clau; o.fet = true; o.cb(snap); } else o.fet = true;
    } catch (e) { if (!o.fet && o.err) o.err(e); }
  }
  let pendent = false;   /* una escriptura durant una lectura en curs obliga a tornar a llegir en acabar (si no, la pantalla es quedava amb dades velles fins al següent cicle) */
  async function refresca(forca) { if (enCurs) { if (forca) pendent = true; return; } enCurs = true; try { await Promise.all([...oients].map(o => executa(o, forca))); } finally { enCurs = false; if (pendent) { pendent = false; refresca(true); } } }
  setInterval(() => { if (!document.hidden) refresca(false); }, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresca(false); });
  const subscriu = (tipus, path) => ({ onSnapshot(cb, err) { const o = { tipus, path, cb, err, fet: false }; oients.add(o); ready.then(() => executa(o, true)); return () => oients.delete(o); } });
  const despres = async f => { try { return await f(); } finally { refresca(true); } };

  const db = {
    doc: path => ({ ...subscriu("doc", path),
      get: async () => { const d = await llegeixDoc(path); return { exists: d != null, data: () => d }; },
      set: d => despres(() => desa(path, d)),
      update: p => despres(async () => desa(path, { ...((await llegeixDoc(path)) || {}), ...p })),
      delete: () => despres(() => esborra(path)) }),
    collection: path => ({ ...subscriu("col", path) })
  };

  /* ---------- usuari ---------- */
  const user = {
    id: async () => { await ready; return uid(); },
    canEdit: async () => { await ready; if (!session) return false; const r = await sb.rpc("is_admin"); return !r.error && r.data === true; },
    isFct: async () => { await ready; if (!session) return false; const r = await sb.rpc("is_fct"); esFct = !r.error && r.data === true; return esFct; },
    can: async p => { await ready; return p === "data.write" ? !!session : false; },
    profiles: async ids => {
      const out = {}; if (!ids.length) return out;
      if (esFct) { ids.forEach(i => { if (fctNoms[i]) out[i] = { name: fctNoms[i] }; }); return out; }
      try {
        const c = await sb.from("capitans").select("user_id,nom,email").in("user_id", ids);
        const s = await sb.from("solicituds").select("user_id,nom_declarat,email").in("user_id", ids);
        (c.data || []).forEach(r => { if (r.nom) out[r.user_id] = { name: r.nom, email: r.email }; });
        (s.data || []).forEach(r => { if (!out[r.user_id]) out[r.user_id] = { name: r.nom_declarat, email: r.email }; });
      } catch (e) { /* sense noms */ }
      return out;
    }
  };

  /* ---------- fitxers (fotos d'actes, bucket privat) ---------- */
  const assets = {
    upload: async file => {
      const m = /^#acta-(.+)$/.exec(location.hash); if (!m) throw new Error("sense eliminatòria");
      const path = `${decodeURIComponent(m[1])}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
      const r = await sb.storage.from("actes").upload(path, file, { contentType: file.type, upsert: false });
      if (r.error) fail(r.error); return { id: path, url: null };
    },
    url: async path => { const r = await sb.storage.from("actes").createSignedUrl(path, 300); return r.error ? null : r.data.signedUrl; },
    /* D75: mensajes de voz de las incidencias (bucket privado «incidencies», carpeta = id del usuario) */
    pujaVeu: async blob => {
      const u = uid(); if (!u) throw new Error("sense sessió");
      const tipus = (blob.type || "audio/webm").split(";")[0];
      const ext = tipus.includes("mp4") ? "m4a" : tipus.includes("ogg") ? "ogg" : tipus.includes("mpeg") ? "mp3" : tipus.includes("wav") ? "wav" : "webm";
      const path = `${u}/${Date.now()}.${ext}`;
      const r = await sb.storage.from("incidencies").upload(path, blob, { contentType: tipus, upsert: false });
      if (r.error) fail(r.error); return path;
    },
    urlVeu: async path => { const r = await sb.storage.from("incidencies").createSignedUrl(path, 300); return r.error ? null : r.data.signedUrl; },
    esborraVeu: async path => { if (!path) return; const r = await sb.storage.from("incidencies").remove([path]); if (r.error) fail(r.error); },
    /* D74: el administrador borra todos los archivos de una eliminatoria */
    esborraCarpeta: async elim => {
      const l = await sb.storage.from("actes").list(elim); if (l.error) fail(l.error);
      const noms = (l.data || []).map(x => `${elim}/${x.name}`);
      if (noms.length) { const r = await sb.storage.from("actes").remove(noms); if (r.error) fail(r.error); }
    }
  };

  /* ---------- sessió (correu + contrasenya; el correu es confirma amb un codi, D57) ---------- */
  const err = (e, codi) => { const x = new Error(e.message || "error"); x.code = codi || e.code || e.status || "error"; return x; };
  const falta = e => /not confirmed/i.test(e.message || "") || e.code === "email_not_confirmed";
  window.LCTP_AUTH = {
    email: () => (session && session.user ? session.user.email : null),
    ready: () => ready,
    entra: async (email, password) => { const r = await sb.auth.signInWithPassword({ email, password }); if (r.error) throw err(r.error, falta(r.error) ? "email_not_confirmed" : null); },
    registra: async (email, password) => {
      const r = await sb.auth.signUp({ email, password, options: { emailRedirectTo: tornada() } });
      if (r.error) throw err(r.error, /already|registered/i.test(r.error.message || "") ? "user_already_exists" : null);
      return { sessio: !!(r.data && r.data.session) };
    },
    reenviaCodi: async email => { const r = await sb.auth.resend({ type: "signup", email }); if (r.error) throw err(r.error); },
    confirmaAlta: async (email, token) => { const r = await sb.auth.verifyOtp({ email, token, type: "signup" }); if (r.error) throw err(r.error); },
    demanaRecuperacio: async email => { const r = await sb.auth.resetPasswordForEmail(email, { redirectTo: tornada() }); if (r.error) throw err(r.error); },
    novaContrasenya: async (email, token, password) => {
      recuperant = true;                                   /* evita que la recàrrega per canvi de sessió talli el procés */
      try {
        let v = await sb.auth.verifyOtp({ email, token, type: "recovery" });
        /* una cuenta nunca confirmada recibe el código de alta en lugar del de recuperación: se prueba también */
        if (v.error) { const v2 = await sb.auth.verifyOtp({ email, token, type: "signup" }); if (!v2.error) v = v2; }
        if (v.error) throw err(v.error);
        const u = await sb.auth.updateUser({ password }); if (u.error) throw err(u.error);
      } catch (e) { recuperant = false; throw e; }
      location.reload();
    },
    canviaContrasenya: async password => {            /* tras entrar por el enlace de recuperación */
      recuperant = true;
      try { const u = await sb.auth.updateUser({ password }); if (u.error) throw err(u.error); } catch (e) { recuperant = false; throw e; }
      location.reload();
    },
    surt: async () => { await sb.auth.signOut(); }
  };

  window.claude = { use: async name => {
    await ready;
    if (name === "db") return db;
    if (name === "user") return user;
    if (name === "assets") return session ? assets : null;
    return null; /* "sample": la lectura automàtica de fotos no hi és (D50) */
  } };
})();
