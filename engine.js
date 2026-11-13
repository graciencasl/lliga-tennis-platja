/* Motor de càlcul de la Lliga Catalana de Tennis Platja.
 * Funcions pures, sense accés a la base de dades: es fan servir a la pàgina i als tests (node).
 * Regles: Reglament FCT (apartats f, g) + decisions D1-D21 de SPEC.md.
 */
(function (root) {
  "use strict";

  // Ordre de joc (Reglament f). Posicions 1-4 dins del torn; L = equip local (equip A de l'acta), V = visitant.
  const PARTITS = [
    { torn: 1, L: [1, 4], V: [2, 3] }, { torn: 1, L: [2, 3], V: [1, 4] },
    { torn: 2, L: [1, 3], V: [1, 3] }, { torn: 2, L: [2, 4], V: [2, 4] },
    { torn: 3, L: [1, 2], V: [1, 2] }, { torn: 3, L: [3, 4], V: [3, 4] },
  ];
  const etiqueta = (p) => p.join("/");

  // Estats d'un partit
  // jugat        : es va jugar sencer
  // retirada_L/V : es retira la parella local/visitant; el resultat anotat ja inclou els jocs restants per al guanyador (Reglament g)
  // wo_L/V       : la parella local/visitant no es presenta o no es pot formar (equip amb 3 jugadors, D3) -> 6-0 6-0 per a l'altra (D10)
  const ESTATS = ["jugat", "retirada_L", "retirada_V", "wo_L", "wo_V"];

  // Set amb tie-break a 6 jocs (D19): 6-0..6-4, 7-5, 7-6
  function setValid(a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
  }
  // Match tie-break a 10 punts amb diferència de 2 (Reglament f)
  function mtbValid(a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return false;
    const hi = Math.max(a, b), lo = Math.min(a, b);
    return hi >= 10 && hi - lo >= 2 && (hi === 10 || hi - lo === 2);
  }

  // Resultat d'un partit -> qui guanya, sets i jocs de cada costat.
  // El match tie-break compta com a set però no com a joc (D2). Un WO compta 6-0 6-0 (Reglament g, D10).
  function resultatPartit(p) {
    if (p.estat === "wo_L" || p.estat === "wo_V") {
      const gV = p.estat === "wo_L";
      return { guanya: gV ? "V" : "L", setsL: gV ? 0 : 2, setsV: gV ? 2 : 0, jocsL: gV ? 0 : 12, jocsV: gV ? 12 : 0 };
    }
    const s = p.sets || [];
    let setsL = 0, setsV = 0, jocsL = 0, jocsV = 0;
    s.forEach(([l, v], i) => {
      if (l > v) setsL++; else setsV++;
      if (i < 2) { jocsL += l; jocsV += v; }
    });
    return { guanya: setsL > setsV ? "L" : "V", setsL, setsV, jocsL, jocsV };
  }

  // Comprovacions d'una acta abans d'enviar-la o validar-la.
  // acta: {dataJoc, partits:[6 x {estat, L:[ordre,ordre]|null, V:[...]|null, sets:[[l,v],[l,v],[l,v]?]}]}
  // rosters: {L:[{ordre,...}], V:[...]}
  function validarActa(acta, rosters) {
    const errors = [], avisos = [];
    if (!acta || typeof acta !== "object") return { errors: ["Acta buida"], avisos };
    if (!acta.dataJoc) errors.push("Falta la data de joc.");
    if (!Array.isArray(acta.partits) || acta.partits.length !== 6) {
      errors.push("L'acta ha de tenir els 6 partits.");
      return { errors, avisos };
    }
    const parelles = { L: new Set(), V: new Set() };
    acta.partits.forEach((p, i) => {
      const nom = `Partit ${i + 1} (torn ${PARTITS[i].torn}, ${etiqueta(PARTITS[i].L)} vs ${etiqueta(PARTITS[i].V)})`;
      if (!ESTATS.includes(p.estat)) { errors.push(`${nom}: indica com ha acabat.`); return; }
      for (const c of ["L", "V"]) {
        const noJuga = p.estat === "wo_" + c;
        const par = p[c];
        if (noJuga && (!par || par.length === 0)) continue; // parella absent: pot no tenir jugadors
        if (!Array.isArray(par) || par.length !== 2 || par.some((x) => x == null || x === "")) {
          errors.push(`${nom}: falten jugadors de l'equip ${c === "L" ? "local" : "visitant"}.`); continue;
        }
        if (par[0] === par[1]) errors.push(`${nom}: el mateix jugador apareix dos cops a la parella ${c === "L" ? "local" : "visitant"}.`);
        const roster = (rosters && rosters[c]) || [];
        if (roster.length && par.some((o) => !roster.find((j) => j.ordre === o)))
          errors.push(`${nom}: hi ha un jugador que no és a la llista de l'equip ${c === "L" ? "local" : "visitant"}.`);
        const key = [...par].sort((a, b) => a - b).join("-");
        if (parelles[c].has(key)) errors.push(`${nom}: la parella ${c === "L" ? "local" : "visitant"} es repeteix (no es pot repetir parella a l'eliminatòria).`);
        parelles[c].add(key);
      }
      if (p.estat === "wo_L" || p.estat === "wo_V") return;
      const s = p.sets || [];
      if (s.length < 2 || s.length > 3) { errors.push(`${nom}: cal anotar 2 sets, o 3 si van 1-1.`); return; }
      if (s.some((x) => !Array.isArray(x) || !Number.isFinite(x[0]) || !Number.isFinite(x[1]))) { errors.push(`${nom}: falta el resultat d'algun set.`); return; }
      if (!setValid(s[0][0], s[0][1])) errors.push(`${nom}: el 1r set (${s[0].join("-")}) no és vàlid.`);
      if (!setValid(s[1][0], s[1][1])) errors.push(`${nom}: el 2n set (${s[1].join("-")}) no és vàlid.`);
      const unUn = (s[0][0] > s[0][1]) !== (s[1][0] > s[1][1]);
      if (unUn && s.length !== 3) errors.push(`${nom}: amb 1-1 en sets cal el match tie-break.`);
      if (!unUn && s.length === 3) errors.push(`${nom}: no hi ha match tie-break si un equip guanya els dos sets.`);
      if (s.length === 3 && !mtbValid(s[2][0], s[2][1])) errors.push(`${nom}: el match tie-break (${s[2].join("-")}) no és vàlid (a 10 punts, diferència de 2).`);
      if (p.estat.startsWith("retirada_")) {
        const r = resultatPartit(p), qui = p.estat.slice(-1);
        if (r.guanya === qui) errors.push(`${nom}: la parella que es retira no pot guanyar el partit.`);
      }
    });
    // Dins d'un torn, les dues parelles d'un equip han de ser 4 jugadors diferents
    for (let t = 0; t < 3; t++) {
      for (const c of ["L", "V"]) {
        const a = acta.partits[2 * t][c] || [], b = acta.partits[2 * t + 1][c] || [];
        if (a.length === 2 && b.length === 2 && a.some((x) => b.includes(x)))
          errors.push(`Torn ${t + 1}: un jugador de l'equip ${c === "L" ? "local" : "visitant"} juga els dos partits del torn.`);
        // Ordre segons classificació (avís, no error: Reglament d manté els partits disputats)
        if (a.length === 2 && b.length === 2 && !a.some((x) => b.includes(x))) {
          const quatre = [...a, ...b].sort((x, y) => x - y);
          const pos = (o) => quatre.indexOf(o) + 1;
          const espA = PARTITS[2 * t][c], espB = PARTITS[2 * t + 1][c];
          const ok = (par, esp) => [...par].map(pos).sort().join() === [...esp].sort().join();
          if (!ok(a, espA) || !ok(b, espB))
            avisos.push(`Torn ${t + 1}: les parelles de l'equip ${c === "L" ? "local" : "visitant"} no segueixen l'ordre de classificació (${etiqueta(espA)} i ${etiqueta(espB)}).`);
        }
      }
    }
    return { errors, avisos };
  }

  // Resultat d'una eliminatòria validada.
  // v: {tipus:"jugada", partits:[...]} | {tipus:"wo_equip", noPresentat:"L"|"V"}
  function resultatEliminatoria(v) {
    if (v.tipus === "wo_equip") {
      const L = v.noPresentat === "V";
      return { partitsL: L ? 6 : 0, partitsV: L ? 0 : 6, setsL: L ? 12 : 0, setsV: L ? 0 : 12, jocsL: L ? 72 : 0, jocsV: L ? 0 : 72,
        puntsL: L ? 3 : -1, puntsV: L ? -1 : 3, guanya: L ? "L" : "V" };
    }
    const r = { partitsL: 0, partitsV: 0, setsL: 0, setsV: 0, jocsL: 0, jocsV: 0 };
    for (const p of v.partits) {
      const x = resultatPartit(p);
      if (x.guanya === "L") r.partitsL++; else r.partitsV++;
      r.setsL += x.setsL; r.setsV += x.setsV; r.jocsL += x.jocsL; r.jocsV += x.jocsV;
    }
    r.guanya = r.partitsL > r.partitsV ? "L" : r.partitsV > r.partitsL ? "V" : null;
    r.puntsL = r.guanya === "L" ? 3 : r.guanya === "V" ? 1 : 2;
    r.puntsV = r.guanya === "V" ? 3 : r.guanya === "L" ? 1 : 2;
    return r;
  }

  const CRITERIS = [["punts", "punts"], ["partitsG", "partits guanyats"], ["setsG", "sets guanyats"], ["jocsG", "jocs guanyats"]];

  function estadistiques(equips, fixtures, validades, nomesEntre) {
    const st = {};
    for (const e of equips) st[e] = { equip: e, punts: 0, pj: 0, pg: 0, pe: 0, pp: 0, partitsG: 0, partitsP: 0, setsG: 0, setsP: 0, jocsG: 0, jocsP: 0 };
    for (const f of fixtures) {
      const v = validades[f.id];
      if (!v) continue;
      if (nomesEntre && !(nomesEntre.has(f.local) && nomesEntre.has(f.visitant))) continue;
      if (!st[f.local] || !st[f.visitant]) continue;
      const r = resultatEliminatoria(v);
      const add = (e, c, o) => {
        const s = st[e];
        s.punts += r["punts" + c]; s.pj++;
        if (r.guanya === c) s.pg++; else if (r.guanya === null) s.pe++; else s.pp++;
        s.partitsG += r["partits" + c]; s.partitsP += r["partits" + o];
        s.setsG += r["sets" + c]; s.setsP += r["sets" + o];
        s.jocsG += r["jocs" + c]; s.jocsP += r["jocs" + o];
      };
      add(f.local, "L", "V"); add(f.visitant, "V", "L");
    }
    return st;
  }

  // Desfà un empat entre `grup` amb els enfrontaments directes (Reglament g).
  // Retorna una llista de blocs ordenats: [{equips:[...], criteri}] ; un bloc de >1 equips és un empat no resolt.
  // Si es passa `traca` (un array), s'hi afegeix un pas per cada ronda del procediment (per explicar l'empat):
  // {equips, stats:{equip:{punts,partitsG,partitsP,setsG,setsP,jocsG,jocsP}}, criteri, blocs:[[equips]], pendents:[{local,visitant}], sorteig}
  function desempatar(grup, fixtures, validades, sortejos, traca) {
    if (grup.length === 1) return [{ equips: grup, criteri: null }];
    const h2h = estadistiques(grup, fixtures, validades, new Set(grup));
    const set = new Set(grup);
    const entre = fixtures.filter((f) => set.has(f.local) && set.has(f.visitant));
    const pendents = entre.filter((f) => !validades[f.id]).map((f) => ({ id: f.id, local: f.local, visitant: f.visitant }));
    const pas = traca ? { equips: [...grup], stats: h2h, criteri: null, blocs: null, pendents, sorteig: null } : null;
    if (traca) traca.push(pas);
    for (const [camp, nom] of CRITERIS) {
      const valors = [...new Set(grup.map((e) => h2h[e][camp]))].sort((a, b) => b - a);
      if (valors.length === 1) continue;
      const out = [];
      if (pas) { pas.criteri = nom; pas.blocs = valors.map((val) => grup.filter((e) => h2h[e][camp] === val)); }
      for (const val of valors) {
        const sub = grup.filter((e) => h2h[e][camp] === val);
        // Si queden empatats més d'un, es repeteix el procediment només entre ells
        if (sub.length > 1) out.push(...desempatar(sub, fixtures, validades, sortejos, traca));
        else out.push({ equips: sub, criteri: nom });
      }
      return out;
    }
    // 5. Sorteig: l'ordre l'introdueix l'administrador (D21)
    const key = [...grup].sort().join("|");
    const ordre = sortejos && sortejos[key];
    if (Array.isArray(ordre) && ordre.length === grup.length && grup.every((e) => ordre.includes(e))) {
      if (pas) { pas.criteri = "sorteig"; pas.sorteig = ordre; pas.blocs = ordre.map((e) => [e]); }
      return ordre.map((e) => ({ equips: [e], criteri: "sorteig" }));
    }
    // Només cal sorteig quan ja s'han validat tots els enfrontaments entre ells; abans l'empat és provisional
    const complet = entre.length > 0 && entre.every((f) => validades[f.id]);
    if (pas) pas.blocs = [[...grup].sort()];
    return [{ equips: [...grup].sort(), criteri: null, pendentSorteig: complet ? key : null }];
  }

  // Com es desfà (o no) l'empat de punts d'un equip: els equips amb els mateixos punts i, per a cada ronda del
  // procediment del reglament, les estadístiques només dels enfrontaments entre ells. Retorna
  // {punts, grup:[equips amb els mateixos punts], passos:[...]} ; sense empat de punts, passos és buit.
  function explicacioEmpat(equip, equips, fixtures, validades, sortejos) {
    const st = estadistiques(equips, fixtures, validades, null);
    const punts = st[equip].punts;
    const grup = equips.filter((e) => st[e].punts === punts);
    if (grup.length === 1) return { punts, grup, passos: [] };
    const traca = [];
    desempatar(grup, fixtures, validades, sortejos, traca);
    return { punts, grup, passos: traca.filter((p) => p.equips.includes(equip)) };
  }

  // Detall d'un equip: una fila per jornada de la seva divisió (jugada o no) i el seu resum (punts, partits, sets, jocs).
  function detallEquip(equip, equips, fixtures, validades) {
    const resum = estadistiques(equips, fixtures, validades, null)[equip];
    const jornades = fixtures
      .filter((f) => f.local === equip || f.visitant === equip)
      .sort((a, b) => a.jornada - b.jornada || (a.id < b.id ? -1 : 1))
      .map((f) => {
        const c = f.local === equip ? "L" : "V", o = c === "L" ? "V" : "L";
        const base = { id: f.id, jornada: f.jornada, data: f.data, rival: f[o === "L" ? "local" : "visitant"], local: c === "L", jugada: false };
        const v = validades[f.id];
        if (!v) return base;
        const r = resultatEliminatoria(v);
        return { ...base, jugada: true, wo: v.tipus === "wo_equip", noPresentat: v.tipus === "wo_equip" ? v.noPresentat === c : false,
          dataJoc: v.dataJoc || null, punts: r["punts" + c], resultat: r.guanya === null ? "E" : r.guanya === c ? "G" : "P",
          partitsG: r["partits" + c], partitsP: r["partits" + o], setsG: r["sets" + c], setsP: r["sets" + o], jocsG: r["jocs" + c], jocsP: r["jocs" + o] };
      });
    return { equip, resum, jornades };
  }

  // Classificació d'una divisió, sempre calculada des de les actes validades.
  function classificacio(equips, fixtures, validades, sortejos) {
    const st = estadistiques(equips, fixtures, validades, null);
    const perPunts = {};
    for (const e of equips) (perPunts[st[e].punts] = perPunts[st[e].punts] || []).push(e);
    const punts = Object.keys(perPunts).map(Number).sort((a, b) => b - a);
    const files = [];
    let pos = 1;
    for (const p of punts) {
      const blocs = desempatar(perPunts[p], fixtures, validades, sortejos);
      for (const b of blocs) {
        for (const e of b.equips)
          files.push({ ...st[e], pos, empat: b.equips.length > 1, criteri: perPunts[p].length > 1 ? b.criteri : null, pendentSorteig: b.pendentSorteig || null });
        pos += b.equips.length;
      }
    }
    return files;
  }

  // Converteix la lectura d'una foto d'acta (JSON que torna la IA) en un esborrany del formulari.
  // No es fia de res: només accepta jugadors que són a la llista de l'equip, estats coneguts i números enters.
  // Retorna {dataJoc, partits:[6 x {estat, L:[ordre|null x2], V, sets:[3 x [l,v]]}], dubtes:[text]}; el que no es reconeix queda buit.
  function sanejaLectura(raw, rosters) {
    const r = raw && typeof raw === "object" ? raw : {};
    const dubtes = [];
    const num = (x) => (x === "" || x == null || typeof x === "boolean" ? NaN : Number(x));
    let dataJoc = "";
    if (typeof r.dataJoc === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.dataJoc) && !Number.isNaN(Date.parse(r.dataJoc))) dataJoc = r.dataJoc;
    else dubtes.push("No s'ha pogut llegir la data de joc.");
    const src = Array.isArray(r.partits) ? r.partits : [];
    if (src.length !== 6) dubtes.push(`S'han llegit ${src.length} partits en lloc de 6.`);
    const partits = PARTITS.map((def, i) => {
      const p = src[i] && typeof src[i] === "object" ? src[i] : {};
      const nom = `Partit ${i + 1}`;
      let estat = p.estat;
      if (!ESTATS.includes(estat)) { estat = "jugat"; if (src[i]) dubtes.push(`${nom}: no s'ha entès com va acabar; s'ha posat «Jugat».`); }
      const q = { estat, L: [null, null], V: [null, null], sets: [["", ""], ["", ""], ["", ""]] };
      for (const c of ["L", "V"]) {
        const arr = Array.isArray(p[c]) ? p[c] : [];
        const roster = (rosters && rosters[c]) || [];
        [0, 1].forEach((k) => {
          const n = num(arr[k]);
          if (Number.isInteger(n) && roster.find((j) => j.ordre === n)) q[c][k] = n;
          else if (estat !== "wo_" + c) dubtes.push(`${nom}: no s'ha pogut identificar el jugador ${k + 1} de l'equip ${c === "L" ? "local" : "visitant"}.`);
        });
      }
      if (!estat.startsWith("wo_")) {
        const s = Array.isArray(p.sets) ? p.sets.slice(0, 3) : [];
        s.forEach((x, k) => {
          const a = num(Array.isArray(x) ? x[0] : NaN), b = num(Array.isArray(x) ? x[1] : NaN);
          if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a <= 30 && b <= 30) q.sets[k] = [a, b];
          else dubtes.push(`${nom}: no s'ha pogut llegir el ${k < 2 ? "set " + (k + 1) : "match tie-break"}.`);
        });
        if (s.length < 2) dubtes.push(`${nom}: falten sets per llegir.`);
      }
      return q;
    });
    (Array.isArray(r.dubtes) ? r.dubtes : []).slice(0, 20).forEach((d) => { if (typeof d === "string" && d.trim()) dubtes.push(d.trim().slice(0, 200)); });
    return { dataJoc, partits, dubtes };
  }

  const api = { PARTITS, ESTATS, etiqueta, setValid, mtbValid, resultatPartit, validarActa, resultatEliminatoria, estadistiques, desempatar, sanejaLectura, explicacioEmpat, detallEquip, classificacio };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.LligaEngine = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
