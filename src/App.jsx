import { useState, useEffect, useMemo, useCallback, useRef } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────
const SUPA_URL = "https://oltwaosdzgvbbvermilk.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHdhb3Nkemd2YmJ2ZXJtaWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NDU3MjksImV4cCI6MjA5NDEyMTcyOX0.WbDR65w6eywTgLc4Lwii_63RrJwKPN9oj1DsgjxeFBo";
// Cliente padrão "pico". Para testar sem mexer nos dados reais, abra o link com ?cliente=pico-teste
const CID = (() => { try { return new URLSearchParams(window.location.search).get("cliente") || "pico"; } catch { return "pico"; } })();
const H = {
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer": "return=representation",
};
async function sbGet(mes) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lancamentos?cliente_id=eq.${CID}&mes=eq.${mes}&order=data.desc`, { headers: H });
    return r.ok ? r.json() : null;   // null = falhou (a tela mantém o que já tinha)
  } catch { return null; }
}
// `programado` (conta a pagar) e `meta_id` (vínculo com meta) são opcionais: se a coluna ainda não existir no banco, o lançamento é salvo igual, sem ela.
const semProg = ({programado, meta_id, ...resto}) => resto;
async function sbPost(body) {
  try {
    let r = await fetch(`${SUPA_URL}/rest/v1/lancamentos`, { method: "POST", headers: H, body: JSON.stringify(body) });
    if (r.status>=400 && r.status<500 && ("programado" in body || "meta_id" in body)) r = await fetch(`${SUPA_URL}/rest/v1/lancamentos`, { method: "POST", headers: H, body: JSON.stringify(semProg(body)) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
async function sbPatch(id, body) {
  try {
    const u = `${SUPA_URL}/rest/v1/lancamentos?id=eq.${id}`;
    let r = await fetch(u, { method: "PATCH", headers: { ...H, "Prefer": "return=minimal" }, body: JSON.stringify(body) });
    if (r.status>=400 && r.status<500 && ("programado" in body || "meta_id" in body)) r = await fetch(u, { method: "PATCH", headers: { ...H, "Prefer": "return=minimal" }, body: JSON.stringify(semProg(body)) });
    return r.ok;
  } catch { return false; }
}
async function rcGet(mes) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/receitas?cliente_id=eq.${CID}&mes=eq.${mes}&order=semana.desc`, { headers: H });
    return r.ok ? r.json() : null;   // null = falhou (a tela mantém o que já tinha)
  } catch { return null; }
}
async function rcPost(body) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/receitas`, { method: "POST", headers: H, body: JSON.stringify(body) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
async function rcPatch(id, body) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/receitas?id=eq.${id}`, { method: "PATCH", headers: { ...H, "Prefer": "return=minimal" }, body: JSON.stringify(body) });
    return r.ok;
  } catch { return false; }
}
async function rcDelete(id) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/receitas?id=eq.${id}`, { method: "DELETE", headers: H });
    return r.ok;
  } catch { return false; }
}
// Receita com centro (PJ/PF). Se a coluna "centro" ainda não existir no banco, grava sem ela (vira PJ).
const semCentro = ({centro, ...resto}) => resto;
async function rcPostC(body) { return (await rcPost(body)) ?? rcPost(semCentro(body)); }
async function rcPatchC(id, body) { return (await rcPatch(id, body)) || rcPatch(id, semCentro(body)); }
// Exclusão de receita: marca excluido=true + motivo (não apaga a linha).
// Se as colunas ainda não existirem no banco, cai no DELETE antigo para não travar o app.
async function rcExcluir(id, motivo) {
  const ok = await rcPatch(id, { excluido: true, motivo_exclusao: motivo });
  return ok ? true : rcDelete(id);
}
async function fetchCategorias() {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/categorias?cliente_id=eq.${CID}&order=nome.asc`, { headers: H });
    return r.ok ? r.json() : [];
  } catch { return []; }
}
const uid = () => (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now());

// ─── TABELAS NOVAS (transferencias, metas) + categorias ─────────────────────
// Se uma tabela ainda não existir no banco, a busca volta vazia e o resto do app segue normal.
async function tbGet(tabela, q="") {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${tabela}?cliente_id=eq.${CID}${q?"&"+q:""}`, { headers: H });
    if (r.status>=400 && r.status<500) return [];   // tabela ainda não existe: segue vazio
    return r.ok ? r.json() : null;                   // erro de servidor/rede: mantém o que já tinha
  } catch { return null; }
}
async function tbPost(tabela, body) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${tabela}`, { method: "POST", headers: H, body: JSON.stringify(body) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
async function tbPatch(tabela, id, body) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/${tabela}?id=eq.${id}`, { method: "PATCH", headers: { ...H, "Prefer": "return=minimal" }, body: JSON.stringify(body) });
    return r.ok;
  } catch { return false; }
}

// Fallback mínimo — só usado se a busca de categorias falhar ou vier vazia
let CATEGORIAS = ["Outros"];
let CAT_CENTRO = {};   // nome -> lista de centros onde a categoria existe (null = aparece nos dois)
let CAT_ROWS = [];     // linhas completas da tabela categorias (cor, centro, orçamento)
const catsDoCentro = c => CATEGORIAS.filter(n=>{ const cs=CAT_CENTRO[n]; return !cs || cs.some(x=>!x||x===c||x==="ambos"); });
const CAT_CORES = { "Outros": "#8792A8" };
function aplicarCategorias(res) {
  CAT_ROWS = res;
  CATEGORIAS = [...new Set(res.map(r => r.nome))];
  CAT_CENTRO = {};
  res.forEach(r => { (CAT_CENTRO[r.nome] = CAT_CENTRO[r.nome] || []).push(r.centro || null); CAT_CORES[r.nome] = r.cor || CAT_CORES[r.nome] || "#999"; });
}
const CORES_CAT = ["#CC0000","#B4483C","#E07A1F","#A6822E","#00875A","#0F8C8C","#2F65AC","#6B4FBB","#B0457E","#5F6B7A","#1A1A1A","#8792A8",
  "#D9534F","#F0A500","#7CB342","#26A69A","#29B6F6","#5C6BC0","#AB47BC","#EC407A","#8D6E63","#78909C","#C0CA33","#FF7043"];
// Sorteia uma cor que ainda não está em uso por nenhuma categoria; se todas estiverem, gera uma nova
function corLivre() {
  const usadas = new Set(CAT_ROWS.map(r=>String(r.cor||"").toUpperCase()));
  const livres = CORES_CAT.filter(c=>!usadas.has(c.toUpperCase()));
  if (livres.length) return livres[Math.floor(Math.random()*livres.length)];
  for (let k=0; k<50; k++) {
    const h=Math.floor(Math.random()*360), sat=55+Math.floor(Math.random()*25), l=38+Math.floor(Math.random()*14);
    const a=sat*Math.min(l,100-l)/10000, f=n=>{ const kk=(n+h/30)%12; return Math.round(255*(l/100-a*Math.max(-1,Math.min(kk-3,9-kk,1)))).toString(16).padStart(2,"0"); };
    const c=`#${f(0)}${f(8)}${f(4)}`.toUpperCase();
    if (!usadas.has(c)) return c;
  }
  return "#8792A8";
}

const MEIOS = ["Crédito","Débito","Dinheiro","Pix"];
// ─── VISÕES (PJ = centro empresa · PF = centro pessoal · Ambos = consolidado) ──
const VISOES = {
  empresa: { nome:"Pico Barbershop", curto:"Pico",   ini:"P", desc:"Só os dados da barbearia",       cor:"#CC0000", fundo:"#FDECEC" },
  pessoal: { nome:"Isaque",          curto:"Isaque", ini:"I", desc:"Só os dados pessoais do Isaque",  cor:"#2F65AC", fundo:"#EEF3FB" },
  ambos:   { nome:"Ambos",           curto:"Ambos",  ini:"A", desc:"Barbearia e Isaque, lado a lado", cor:"#1A1A1A", fundo:"#F0F0F0" },
};
const VISAO_KEY = "pico_visao";
const lerVisao = () => { try { const v=localStorage.getItem(VISAO_KEY); return VISOES[v]?v:"ambos"; } catch { return "ambos"; } };
const centroDe = x => x.centro==="pessoal" ? "pessoal" : "empresa";   // sem centro = empresa (dados antigos)
const naVisao  = (v,x) => v==="ambos" || centroDe(x)===v;

// ─── REGRAS: TRANSFERÊNCIAS PJ → PF ──────────────────────────────────────────
// Uma linha só. Na PJ é saída, na PF é entrada, no consolidado não muda nada (não duplica).
const efeitoTransf = (visao, valor) => visao==="empresa" ? -valor : visao==="pessoal" ? valor : 0;
const TIPOS_TRANSF = { pro_labore:"Pró-labore", retirada:"Retirada" };

// ─── REGRAS: SALDO, PREVISÃO, METAS, ALERTAS (usam os dados de todo o período) ─
const addDias = (s, n) => { const [y,m,d]=s.split("-").map(Number); const x=new Date(y,m-1,d+n); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
const diasEntre = (a, b) => { const [y1,m1,d1]=a.split("-").map(Number), [y2,m2,d2]=b.split("-").map(Number); return Math.round((new Date(y2,m2-1,d2)-new Date(y1,m1-1,d1))/86400000); };
const dataRec = r => r.data_de || r.semana;
const recProg = r => (dataRec(r)||"") > hoje();   // receita futura = a receber (fora dos totais até a data)
const despesaConta = l => !l.excluido && normC(l.categoria)!=="liquidacao de fatura";
// Saldo acumulado registrado no app (receitas − despesas ± transferências) num intervalo de datas
function saldoPeriodo(g, visao, de, ate) {
  const dentro = d => d && (!de || d>=de) && d<=ate;
  const rec  = g.r.filter(r=>naVisao(visao,r)&&dentro(dataRec(r))).reduce((s,r)=>s+r.valor,0);
  const desp = g.l.filter(l=>despesaConta(l)&&naVisao(visao,l)&&dentro(l.data)).reduce((s,l)=>s+l.valor,0);
  const tr   = g.t.filter(t=>dentro(t.data)).reduce((s,t)=>s+efeitoTransf(visao,t.valor),0);
  return rec - desp + tr;
}
// Previsão: real (saldo hoje + contas programadas) e estimativa de entradas (média dos últimos 90 dias)
function previsao(g, visao, dias) {
  const hj = hoje(), fim = addDias(hj, dias);
  const saldoHoje = saldoPeriodo(g, visao, null, hj);
  const progs = g.l.filter(l=>despesaConta(l)&&naVisao(visao,l)&&l.data>hj&&l.data<=fim);
  const saidas = progs.reduce((s,l)=>s+l.valor,0);
  const transf = g.t.filter(t=>t.data>hj&&t.data<=fim).reduce((s,t)=>s+efeitoTransf(visao,t.valor),0);
  const recFut = g.r.filter(r=>naVisao(visao,r)&&dataRec(r)>hj&&dataRec(r)<=fim);
  const entradasProg = recFut.reduce((s,r)=>s+r.valor,0);
  const recs = g.r.filter(r=>naVisao(visao,r)&&dataRec(r));
  const ini90 = addDias(hj,-89);
  const primeira = recs.map(dataRec).sort()[0];
  const base = primeira ? Math.min(90, Math.max(1, diasEntre(primeira>ini90?primeira:ini90, hj)+1)) : 0;
  const rec90 = recs.filter(r=>dataRec(r)>=ini90&&dataRec(r)<=hj).reduce((s,r)=>s+r.valor,0);
  const entradasEst = base ? Math.max(0, (rec90/base)*dias - entradasProg) : 0;
  const semEstimativa = saldoHoje - saidas + transf + entradasProg;
  return { saldoHoje, saidas, nProg:progs.length, transf, entradasProg, nRecProg:recFut.length, entradasEst, semEstimativa, comEstimativa: semEstimativa + entradasEst, baseDias: base };
}
const GRUPOS_META = {
  financeira: { nome:"Financeira", icone:"💰", desc:"Valores em R$: faturamento, reserva, patrimônio, limite de gasto ou um valor livre." },
  objetiva:   { nome:"Objetiva",   icone:"🎯", desc:"Conquistas e hábitos: contar, cumprir etapas, marcar os dias no calendário." },
};
const TIPOS_META = {
  faturamento: { grupo:"financeira", nome:"Faturamento mensal", icone:"📈", desc:"Receita recebida no mês até chegar no alvo. Renova todo mês.", auto:true, mensal:true },
  acumular:    { grupo:"financeira", nome:"Reserva",            icone:"🏦", desc:"Soma a sobra de caixa desde a data de início.", auto:true },
  patrimonio:  { grupo:"financeira", nome:"Quitar patrimônio", icone:"🏠", desc:"Quitar um veículo ou imóvel parcelado. Cada despesa vinculada à meta conta como parcela paga.", auto:true },
  limite:      { grupo:"financeira", nome:"Limite de gasto",    icone:"🛡️", desc:"Gastar no máximo o limite no mês (total ou de uma categoria). Renova todo mês.", auto:true, mensal:true },
  valor:       { grupo:"financeira", nome:"Valor livre",        icone:"💵", desc:"Você informa quanto já tem (ex.: juntar para a reforma).", auto:false },
  objetiva:    { grupo:"objetiva",   nome:"Objetiva",           icone:"🎯", desc:"", auto:false },
};
const BENS = { veiculo:{nome:"Veículo",icone:"🚗"}, imovel:{nome:"Imóvel",icone:"🏠"}, outro:{nome:"Outro bem",icone:"🏷️"} };
// Conta a pagar = programada e ainda não executada
const pendConta = (l, hj) => despesaConta(l) && (l.programado===true || (l.programado==null && l.data>hj));
// Medidores da meta objetiva — dá para usar mais de um na mesma meta
const MEDIDORES = {
  quantidade: { nome:"Quantidade", icone:"🔢", desc:"Contar até um número (ex.: 100 assinantes)." },
  etapas:     { nome:"Etapas",     icone:"✅", desc:"Checklist: cada etapa concluída avança." },
  calendario: { nome:"Calendário", icone:"📅", desc:"Marcar no calendário cada dia cumprido (ex.: postar todo dia)." },
};
const tipoMeta = t => (t==="quantidade"||t==="etapas"||t==="objetiva") ? "objetiva" : t==="manual" ? "valor" : (TIPOS_META[t] ? t : "valor");
const lerJson = (v, padrao) => { let e=v; if(typeof e==="string"){ try{ e=JSON.parse(e); }catch{ e=padrao; } } return e ?? padrao; };
const lerEtapas = m => { const e=lerJson(m.etapas, []); return Array.isArray(e)?e:[]; };
const lerCheckins = m => { const e=lerJson(m.checkins, []); return Array.isArray(e)?[...new Set(e)].sort():[]; };
const medidoresDe = m => { const md=lerJson(m.medidores, null); if(Array.isArray(md)&&md.length) return md.filter(k=>MEDIDORES[k]); return (m.tipo==="quantidade"||m.tipo==="etapas") ? [m.tipo] : []; };
// Quantidade por período: acumulado (total) ou renovada todo dia / semana / mês
const QTD_PER = { total:"Acumulado", dia:"Por dia", semana:"Por semana", mes:"Por mês" };
const qtdPer = m => QTD_PER[m.qtd_per] ? m.qtd_per : "total";
const lerLog = m => { const e=lerJson(m.qtd_log, {}); return e && typeof e==="object" && !Array.isArray(e) ? e : {}; };
const iniPeriodo = (per, d) => { if(per==="mes") return d.slice(0,7)+"-01"; if(per==="semana"){ const [y,mo,dd]=d.split("-").map(Number); const w=new Date(y,mo-1,dd).getDay(); return addDias(d, -((w+6)%7)); } return d; };
const qiVazio = { nome:"", alvo:"", atual:"", unidade:"", per:"total", fonte:"" };
// Uma meta pode ter várias atividades com quantidade (ex.: 100 flexões por dia + 2 copos de água por dia)
const qtdItens = m => {
  const a = lerJson(m.qtd_itens, []);
  if (Array.isArray(a) && a.length) return a.filter(x=>x&&typeof x==="object");
  const alvo = Number(m.valor_alvo)||0;
  return alvo>0 && medidoresDe(m).includes("quantidade") ? [{ id:"legacy", nome:"", alvo, atual:Number(m.valor_atual)||0, unidade:m.unidade||"", per:qtdPer(m), log:lerLog(m) }] : [];
};
// Quantas parcelas já venceram (antes de hoje) para um financiamento que começou em `ini`
const decorridas = (ini, np) => { if(!ini||!(np>0)) return 0; let n=0; for(let i=0;i<np;i++) if(addMesesData(ini,i)<hoje()) n++; return n; };
const itensDoForm = f => { const q=f.qi, rasc = parseInt(q.alvo)>0 ? [{ id:"rasc", nome:q.nome.trim(), alvo:parseInt(q.alvo), atual:q.per==="total"?(parseInt(q.atual)||0):0, unidade:q.unidade.trim(), per:q.per, fonte:q.per==="total"?q.fonte:"", log:{} }] : []; return [...f.qtdItens, ...rasc]; };
function progItemQtd(it, todos=[]) {
  const per = QTD_PER[it.per] ? it.per : "total", alvo = Number(it.alvo)||0, hj = hoje();
  const n = v => Math.round(v).toLocaleString("pt-BR"), un = it.unidade ? " "+it.unidade : "";
  let atual, rot="", extra="";
  let auto = false;
  const src = per==="total" && it.fonte ? todos.find(x=>x.id===it.fonte) : null;
  if (per==="total" && src) {   // soma automática: tudo que foi marcado na atividade de origem (ex.: flexões por dia)
    auto = true;
    atual = (Number(it.atual)||0) + Object.values(src.log||{}).reduce((s,v)=>s+(Number(v)||0),0);
    extra = `🔗 soma automática de ${src.nome||"outra atividade"}`;
  }
  else if (per==="total") atual = Number(it.atual)||0;
  else {
    const log = it.log && typeof it.log==="object" ? it.log : {}, ini = iniPeriodo(per,hj);
    atual = Object.entries(log).filter(([d])=>d>=ini&&d<=hj).reduce((s,[,v])=>s+(Number(v)||0),0);
    const grupos = {}; Object.entries(log).forEach(([d,v])=>{ const c=iniPeriodo(per,d); grupos[c]=(grupos[c]||0)+(Number(v)||0); });
    const bat = Object.values(grupos).filter(v=>alvo>0&&v>=alvo).length, u = {dia:["dia","dias"],semana:["semana","semanas"],mes:["mês","meses"]}[per];
    rot = {dia:"hoje",semana:"nesta semana",mes:"neste mês"}[per];
    extra = `${QTD_PER[per]} · ${bat} ${bat===1?u[0]:u[1]} com a meta batida`;
  }
  return { id:it.id, nome:it.nome||"", per, auto, recorr:per!=="total", atual, alvo, pct: alvo>0?atual/alvo:0,
    txt:`${n(atual)} de ${n(alvo)}${un}${rot?" "+rot:""}`, falta: alvo>atual?`${it.nome?it.nome+": ":""}faltam ${n(alvo-atual)}${un}${rot?" "+rot:""}`:"", extra };
}
const fmtQtd = (m, v) => `${Math.round(v).toLocaleString("pt-BR")}${m.unidade?" "+m.unidade:""}`;
const fmtMeta = (m, v) => tipoMeta(m.tipo)==="objetiva" ? `${Math.round(v)}%` : fmt(v);
const fracMes = () => { const h=hoje(), [y,m,d]=h.split("-").map(Number); return d/new Date(y,m,0).getDate(); };
// Calendário: quantos dias marcados são necessários entre o início e o prazo
function alvoCalendario(m) {
  const ini = m.data_inicio || (m.criado_em||"").slice(0,10) || hoje();
  if (!m.prazo || m.prazo<ini) return 0;
  const dias = diasEntre(ini, m.prazo) + 1;
  if (m.cal_freq==="periodo") return Math.min(dias, Math.max(1, Number(m.cal_vezes)||1));
  return m.cal_freq==="semana" ? Math.max(1, Math.ceil(dias/7*(Number(m.cal_vezes)||1))) : dias;
}
// Sequência de dias seguidos marcados, contando de hoje (ou de ontem, se hoje ainda não foi marcado)
function sequencia(lista) {
  const s=new Set(lista); let d=hoje(); if(!s.has(d)) d=addDias(d,-1);
  let n=0; while(s.has(d)){ n++; d=addDias(d,-1); } return n;
}
// Progresso de cada medidor da meta objetiva
function progMedidores(m) {
  return medidoresDe(m).map(k=>{
    if (k==="quantidade") {
      const arr = qtdItens(m), its = arr.map(it=>progItemQtd(it,arr)), pct = its.length ? its.reduce((s,x)=>s+Math.min(1,x.pct),0)/its.length : 0, bat = its.filter(x=>x.pct>=1).length;
      return { k, itens:its, recorr:its.some(x=>x.recorr), atual:bat, alvo:its.length, pct,
        txt: its.length===1 ? `${its[0].nome?its[0].nome+": ":""}${its[0].txt}` : `${its.length} atividades · ${bat} no alvo`,
        falta: its.map(x=>x.falta).filter(Boolean).join(" · ") };
    }
    if (k==="etapas") { const e=lerEtapas(m), alvo=e.length, atual=e.filter(x=>x.ok).length;
      return { k, atual, alvo, pct: alvo>0?atual/alvo:0, txt:`${atual} de ${alvo} etapas`, falta: alvo>atual?`falta${alvo-atual>1?"m":""} ${alvo-atual} etapa${alvo-atual>1?"s":""}`:"" }; }
    const ini = m.data_inicio || (m.criado_em||"").slice(0,10) || hoje();
    const ck = lerCheckins(m).filter(d=>d>=ini && (!m.prazo||d<=m.prazo)), alvo=alvoCalendario(m), atual=ck.length;
    return { k, atual, alvo, pct: alvo>0?atual/alvo:0, txt:`${atual} de ${alvo} dias marcados`, falta: alvo>atual?`faltam ${alvo-atual} dias${m.cal_freq==="periodo"&&m.prazo&&m.prazo>=hoje()?` · restam ${diasEntre(hoje(),m.prazo)+1} no prazo`:""}`:"", seq: sequencia(ck), hojeOk: ck.includes(hoje()) };
  });
}
function progMeta(mt, g) {
  const hj=hoje(), mh=hj.slice(0,7), tipo=tipoMeta(mt.tipo), T=TIPOS_META[tipo], c=mt.centro||"empresa";
  const [yy,mm]=mh.split("-").map(Number), fimMes=`${mh}-${String(new Date(yy,mm,0).getDate()).padStart(2,"0")}`;
  let alvo=Number(mt.valor_alvo)||0, atual=0, detalhe="", meds=null, patr=null;
  if (tipo==="faturamento") {
    atual = g.r.filter(r=>naVisao(c,r)&&(dataRec(r)||"").slice(0,7)===mh&&!recProg(r)).reduce((s,r)=>s+r.valor,0);
    detalhe = "recebido neste mês";
  } else if (tipo==="acumular") {
    atual = (Number(mt.valor_inicial)||0) + saldoPeriodo(g, c, mt.data_inicio||null, hj);
    detalhe = `sobra de caixa desde ${mt.data_inicio?fmtDate(mt.data_inicio):"o início"}`;
  } else if (tipo==="patrimonio") {
    const np = Number(mt.parcelas)||0, ent = Number(mt.valor_inicial)||0, antes = Math.min(np, Math.max(0, Number(mt.parc_pagas)||0));
    const parcEst = np>0 ? Math.max(0, alvo-ent)/np : 0;
    const pg = g.l.filter(l=>l.meta_id===mt.id && despesaConta(l) && !pendConta(l,hj) && l.data<=hj);
    atual = ent + antes*parcEst + pg.reduce((s,l)=>s+l.valor,0);
    const pagasTot = Math.min(np||Infinity, antes + pg.length);
    let esperado = 0;
    if (np>0 && mt.data_inicio) for (let i=0;i<np;i++) if (addMesesData(mt.data_inicio,i)<=hj) esperado++;
    patr = { np, pagas:pagasTot, restam:Math.max(0,np-pagasTot), esperado, ent, antes };
    detalhe = `${pagasTot}${np?` de ${np}`:""} parcela${pagasTot===1?"":"s"} paga${pagasTot===1?"":"s"}${ent>0?` · entrada ${fmt(ent)}`:""}`;
  } else if (tipo==="limite") {
    atual = g.l.filter(l=>despesaConta(l)&&naVisao(c,l)&&l.mes===mh&&l.data<=hj&&(!mt.categoria||l.categoria===mt.categoria)).reduce((s,l)=>s+l.valor,0);
    detalhe = mt.categoria ? `gasto em ${mt.categoria} neste mês` : "despesa total deste mês";
  } else if (tipo==="objetiva") {
    meds = progMedidores(mt);
    const media = meds.length ? meds.reduce((s,x)=>s+Math.min(1,x.pct),0)/meds.length : 0;
    atual = Math.round(media*100); alvo = 100;
    detalhe = meds.map(x=>x.txt).join(" · ");
  } else {
    atual = Number(mt.valor_atual)||0; detalhe = "atualizado por você";
  }
  const pct = alvo>0 ? atual/alvo : 0;
  const fim = T.mensal ? fimMes : (mt.prazo||null);
  const diasRest = fim ? diasEntre(hj, fim) : null;
  const falta = Math.max(0, alvo-atual), diasCont = Math.max(1, (diasRest??0)+1);
  let dica = "";
  if (tipo==="faturamento") dica = falta>0 ? `Faltam ${fmt(falta)} · ${fmt(falta/diasCont)} por dia até o fim do mês` : "Alvo do mês batido!";
  else if (tipo==="limite") dica = atual<=alvo ? `Pode gastar ${fmt((alvo-atual)/diasCont)} por dia até o fim do mês` : `${fmt(atual-alvo)} acima do limite`;
  else if (tipo==="patrimonio") dica = falta>0 && patr.restam>0 ? `Faltam ${fmt(falta)} · ${patr.restam} parcela${patr.restam>1?"s":""} de cerca de ${fmt(falta/patr.restam)}` : falta>0 ? `Faltam ${fmt(falta)}` : "Patrimônio quitado! 🎉";
  else if (falta>0 && (tipo==="acumular"||tipo==="valor")) dica = diasRest>0 ? `Faltam ${fmt(falta)} · cerca de ${fmt(falta/Math.max(1,diasRest/30))} por mês` : `Faltam ${fmt(falta)}`;
  else if (tipo==="objetiva" && meds) { const f=meds.map(x=>x.falta).filter(Boolean); dica = f.length ? f.join(" · ").replace(/^./,x=>x.toUpperCase()) : ""; }
  const realizada = !!mt.concluida_em || ((tipo==="acumular"||tipo==="patrimonio") && alvo>0 && pct>=1) || (tipo==="patrimonio" && patr.np>0 && patr.pagas>=patr.np);
  const OK={cor:"#00875A",fundo:"#E6F4EE",nivel:0}, AT={cor:"#A6822E",fundo:"#FBF3E4",nivel:1}, CR={cor:"#B4483C",fundo:"#FBECEA",nivel:2};
  let status;
  if (realizada) status = {...OK, txt:"realizada"};
  else if (tipo==="limite") status = pct>1 ? {...CR,txt:"estourou"} : pct>fracMes()+0.1 ? {...AT,txt:"gastando rápido"} : {...OK,txt:"dentro do limite"};
  else if (tipo==="faturamento" && pct>=1) status = {...OK, txt:"batida no mês"};
  else if (pct>=1) status = {...OK, txt: meds&&meds.some(x=>x.recorr) ? "meta do período batida" : "alvo atingido"};
  else if (tipo==="patrimonio" && patr.esperado-patr.pagas>=1) { const at=patr.esperado-patr.pagas; status = at>=2 ? {...CR,txt:`${at} parcelas em aberto`} : {...AT,txt:"1 parcela em aberto"}; }
  else if (tipo==="patrimonio") status = {...OK, txt:"em dia"};
  else if (diasRest!=null && diasRest<0) status = {...CR, txt:"atrasada"};
  else {
    let esperado = null;
    const ini = mt.data_inicio || (mt.criado_em||"").slice(0,10);
    if (tipo==="faturamento") esperado = fracMes();
    else if (meds&&meds.some(x=>x.recorr)) esperado = null;
    else if (mt.prazo && ini && mt.prazo>ini) esperado = Math.min(1, Math.max(0, diasEntre(ini,hj)/diasEntre(ini,mt.prazo)));
    status = esperado!=null && pct < esperado-0.15 ? {...AT,txt:"abaixo do ritmo"} : {...OK,txt:"no ritmo"};
  }
  return { tipo, atual, alvo, pct, status, detalhe, dica, diasRest, mensal:!!T.mensal, realizada, meds, patr, recorr: !!(meds&&meds.some(x=>x.recorr)) };
}
// Central de alertas: SEMPRE olha os dois lados (Pico Barbershop e Isaque), qualquer que seja o perfil
// selecionado no topo. Cada alerta sai com o "centro" de quem é, para a etiqueta.
// Conta a pagar = programada e ainda não executada: ao executar (ou excluir) ela sai dos alertas sozinha.
function gerarAlertas(g, metas) {
  const hj=hoje(), mh=hj.slice(0,7), out=[], centros=["empresa","pessoal"];
  const pend = l => pendConta(l,hj);
  const soma = a => a.reduce((s,l)=>s+l.valor,0);
  const lista = (a,n,f) => a.slice(0,n).map(f).join(", ")+(a.length>n?"…":"");
  const plural = (n,s,p) => n>1?p:s;
  centros.forEach(c=>{
    const gl = g.l.filter(l=>centroDe(l)===c);
    // 0) Atrasadas (venceram e não foram executadas)
    const atras = gl.filter(l=>pend(l)&&l.data<hj).sort((a,b)=>a.data.localeCompare(b.data));
    if (atras.length) out.push({ centro:c, nivel:2, key:c+"atr:"+atras.map(l=>l.id).join(","), ids:atras.map(l=>l.id), titulo:`${atras.length} ${plural(atras.length,"conta atrasada","contas atrasadas")}`,
      motivo: lista(atras,4,l=>`${l.descricao} (${fmtDate(l.data)})`), impacto:`${fmt(soma(atras))} vencido e ainda não executado`,
      acao:"Pague e use “Mover para executado”. Se já pagou, mova para executado para sair daqui." });
    // 1) Vencem hoje
    const hojeL = gl.filter(l=>pend(l)&&l.data===hj);
    if (hojeL.length) out.push({ centro:c, nivel:2, key:c+"hoje:"+hojeL.map(l=>l.id).join(","), ids:hojeL.map(l=>l.id), hoje:true, qtd:hojeL.length, titulo:`${hojeL.length} ${plural(hojeL.length,"conta","contas")} para pagar hoje`,
      motivo: lista(hojeL,4,l=>`${l.descricao} (${fmt(l.valor)})`), total: soma(hojeL), impacto:`${fmt(soma(hojeL))} vencendo hoje`,
      acao:"Pague hoje e mova para executado — o alerta some sozinho." });
    // 2) Próximos 3 dias
    const vence = gl.filter(l=>pend(l)&&l.data>hj&&l.data<=addDias(hj,3)).sort((a,b)=>a.data.localeCompare(b.data));
    if (vence.length) out.push({ centro:c, nivel:1, key:c+"venc:"+vence.map(l=>l.id).join(","), ids:vence.map(l=>l.id), titulo:`${vence.length} ${plural(vence.length,"conta vencendo","contas vencendo")} nos próximos 3 dias`,
      motivo: lista(vence,3,l=>`${l.descricao} (${fmtDate(l.data)})`),
      impacto:`${fmt(soma(vence))} saindo do caixa`, acao:"Confira se há saldo e execute no dia certo." });
    // 3) Caixa previsto negativo em 30 dias (real, sem contar estimativa de entradas)
    const p = previsao(g, c, 30);
    if (p.semEstimativa<0) out.push({ centro:c, nivel: p.comEstimativa<0?2:1, key:c+"caixa:"+mh, titulo:`Caixa pode ficar negativo em 30 dias`,
      motivo:`Saldo hoje ${fmt(p.saldoHoje)}, contas programadas ${fmt(p.saidas)}.`,
      impacto: p.comEstimativa<0 ? `Mesmo com as entradas estimadas, fecha em ${fmt(p.comEstimativa)}.` : `Fecha em ${fmt(p.semEstimativa)} se não entrar dinheiro; com a média de entradas, ${fmt(p.comEstimativa)}.`,
      acao:"Reveja contas programadas ou antecipe recebimentos." });
    // 4) Queda de receita vs mesmo período do mês anterior (a partir do dia 7)
    const dia = parseInt(hj.slice(8,10),10);
    if (dia>=7) {
      const [y,m]=mh.split("-").map(Number), ma=`${m===1?y-1:y}-${String(m===1?12:m-1).padStart(2,"0")}`;
      const ate = (r,mk)=>{ const d=dataRec(r)||""; return d.slice(0,7)===mk && parseInt(d.slice(8,10),10)<=dia; };
      const atual = g.r.filter(r=>centroDe(r)===c&&ate(r,mh)).reduce((s,r)=>s+r.valor,0);
      const ant   = g.r.filter(r=>centroDe(r)===c&&ate(r,ma)).reduce((s,r)=>s+r.valor,0);
      if (ant>0 && atual<ant*0.8) out.push({ centro:c, nivel: atual<ant*0.6?2:1, key:c+"rec:"+mh, titulo:`Receita ${(((ant-atual)/ant)*100).toFixed(0)}% abaixo do mês passado`,
        motivo:`Até o dia ${dia}: ${fmt(atual)} agora contra ${fmt(ant)} no mês anterior.`, impacto:`Diferença de ${fmt(ant-atual)}.`,
        acao:"Verifique se todas as receitas foram lançadas e o movimento da agenda." });
    }
  });
  // 5) Metas atrasadas ou fora do ritmo (de quem for a meta)
  metas.filter(m=>!m.excluido).forEach(m=>{
    const p = progMeta(m, g);
    if (p.status.nivel>0) out.push({ centro:m.centro||"empresa", nivel:p.status.nivel, key:"meta:"+m.id+":"+p.status.txt, titulo:`Meta "${m.nome}": ${p.status.txt}`,
      motivo:`${fmtMeta(m,p.atual)} de ${fmtMeta(m,p.alvo)} (${(p.pct*100).toFixed(0)}%) — ${p.detalhe}.`,
      impacto: m.tipo==="limite"?"Despesa acima do planejado.":"Objetivo pode não ser atingido no prazo.",
      acao: m.tipo==="limite"?"Reduza os gastos ligados a essa meta.":m.tipo==="patrimonio"?"Pague a parcela e vincule a despesa a esta meta ao lançar.":"Reveja o plano ou ajuste o prazo da meta." });
  });
  return out.sort((a,b)=>b.nivel-a.nivel || (a.centro==="empresa"?-1:1));
}
const MESES_NOMES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MES_INICIO = "2026-05";
const FECHADOS = [];
function gerarMeses(){
  const [ay,am] = MES_INICIO.split("-").map(Number);
  const hoje = new Date();
  let ly = hoje.getFullYear() + 2, lm = hoje.getMonth()+1;
  const arr=[];
  let y=ay, m=am;
  while(y<ly || (y===ly && m<=lm)){
    const key=`${y}-${String(m).padStart(2,"0")}`;
    arr.push({ label:`${MESES_NOMES_FULL[m-1]} ${y}`, mes:key, fechado:FECHADOS.includes(key) });
    m++; if(m>12){ m=1; y++; }
  }
  return arr;
}
const MESES = gerarMeses();

const fmt     = v => v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmtDate = d => { const[,m,day]=d.split("-"); return `${day}/${m}`; };
const dLocal  = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const hoje    = () => dLocal(new Date());
const amanha  = () => { const d=new Date(); d.setDate(d.getDate()+1); return dLocal(d); };
const d2brl   = d => { const n=parseInt(d||"0",10); return `${Math.floor(n/100).toLocaleString("pt-BR")},${String(n%100).padStart(2,"0")}`; };
const d2float = d => parseInt(d||"0",10)/100;
const float2d = v => String(Math.round(v*100));
const normC   = x => String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
const isLiq   = t => normC(t.categoria)==="liquidacao de fatura";   // pagamento de fatura: não soma (evita duplicar o cartão)
const soma    = arr => arr.filter(t=>!t.excluido && !isLiq(t) && t.data<=hoje()).reduce((s,t)=>s+t.valor,0);
const padN    = n => String(n).padStart(2,"0");
const addMesesData = (dataStr, n) => {
  const [y,m,d] = dataStr.split("-").map(Number);
  const tot = (m-1)+n;
  const ny = y + Math.floor(tot/12);
  const nm = (tot%12)+1;
  const ult = new Date(ny, nm, 0).getDate();
  return `${ny}-${padN(nm)}-${padN(Math.min(d,ult))}`;
};
const semanasDoMes = mesKey => {
  const [ano,mes] = mesKey.split("-").map(Number);
  const ultDia = new Date(ano, mes, 0).getDate();
  return [
    { ini:1,  fim:Math.min(7,ultDia),  label:"Sem 1" },
    { ini:8,  fim:Math.min(14,ultDia), label:"Sem 2" },
    { ini:15, fim:Math.min(21,ultDia), label:"Sem 3" },
    { ini:22, fim:Math.min(28,ultDia), label:"Sem 4" },
    ...(ultDia>28 ? [{ ini:29, fim:ultDia, label:"Sem 5" }] : []),
  ];
};

const CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0} html,body{background:#F5F5F5}
input,select,textarea{-webkit-appearance:none;appearance:none}
input:focus,select:focus,textarea:focus{outline:none;border-color:#CC0000!important;box-shadow:0 0 0 3px #CC000020}
.tab:hover{color:#CC0000!important}
.btn-primary{background:#CC0000;color:#F5F5F5;border:none;border-radius:12px;padding:16px;font-size:15px;font-family:'Inter',sans-serif;font-weight:700;cursor:pointer;width:100%;transition:all .2s}
.btn-primary:hover{background:#A80000}
.btn-success{background:#00875A;color:#fff;border:none;border-radius:12px;padding:16px;font-size:15px;font-family:'Inter',sans-serif;font-weight:700;cursor:pointer;width:100%;transition:all .2s}
.btn-success:hover{background:#00704B}
.btn-ghost{background:none;border:2px solid #E0E0E0;border-radius:12px;padding:14px;font-size:14px;font-family:'Inter',sans-serif;font-weight:600;cursor:pointer;width:100%;color:#666666;transition:all .2s;margin-top:10px}
.btn-ghost:hover{border-color:#aaa;color:#333}
.btn-danger{background:none;border:2px solid #B4483C;border-radius:12px;padding:14px;font-size:14px;font-family:'Inter',sans-serif;font-weight:600;cursor:pointer;width:100%;color:#B4483C;transition:all .2s;margin-top:10px}
.btn-danger:hover{background:#B4483C;color:#fff}
.app-wrap{max-width:480px}
.kpi-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
@media (min-width:900px){.kpi-grid{grid-template-columns:repeat(6,1fr);gap:8px}.app-wrap.wide{max-width:1240px}}
.kpi-v{font-size:22px;overflow-wrap:anywhere}
@media (max-width:420px){.kpi-v{font-size:18px}.badge-mes{display:none!important}}
.metas-grid{display:grid;grid-template-columns:1fr;gap:0 12px}
.meta-form{display:grid;grid-template-columns:1fr;gap:18px}
@media (min-width:900px){.metas-grid{grid-template-columns:1fr 1fr}.meta-form{grid-template-columns:1.3fr 1fr;align-items:start}.meta-form>div:last-child{position:sticky;top:180px}}
.so-cel{display:none}
@media (max-width:420px){.so-pc{display:none}.so-cel{display:inline}}
.prev-grid{display:grid;grid-template-columns:1fr;gap:0}
@media (min-width:900px){.prev-grid{grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px}}
.navtabs{scrollbar-width:none}.navtabs::-webkit-scrollbar{display:none}
html,body{background:#F5F5F5}
@media (min-width:900px){.app-wrap{max-width:900px}.sheet{max-width:520px}}
.fab{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:linear-gradient(135deg,#CC0000,#E02020);color:#F5F5F5;border:none;border-radius:50px;padding:15px 28px;font-size:14px;font-family:'Inter',sans-serif;font-weight:700;cursor:pointer;box-shadow:0 6px 24px #1A1A1A45;z-index:90;display:flex;align-items:center;gap:8px;transition:all .2s;white-space:nowrap}
.fab-gold{background:linear-gradient(135deg,#00875A,#00A870);box-shadow:0 6px 24px #00875A40}
.fab:hover{transform:translateX(-50%) translateY(-2px)} .fab:active{transform:translateX(-50%) scale(.98)}
.ctx-item{display:flex;align-items:center;gap:12px;width:100%;background:none;border:none;color:#F3F3F3;font-size:13px;font-family:'Inter',sans-serif;padding:9px 12px;border-radius:6px;cursor:default;text-align:left}.ctx-item:hover{background:#FFFFFF14}.ctx-item.ctx-red{color:#FF9A92}
.overlay{position:fixed;inset:0;background:#00000055;z-index:200;display:flex;align-items:center;justify-content:center;padding:16px}
.sheet{background:#fff;border-radius:20px;padding:22px 20px 20px;width:100%;max-width:440px;margin:0 auto;animation:popIn .2s ease-out;max-height:88vh;overflow-y:auto;box-shadow:0 12px 40px #00000040}
.sheet .handle{display:none}
@keyframes popIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
.overlay-top{position:fixed;inset:0;background:#00000055;z-index:200;display:flex;align-items:flex-start;padding-top:120px}
.handle{width:40px;height:4px;background:#e8e8e8;border-radius:2px;margin:12px auto 20px}
.row-item{transition:background .12s;border-radius:8px} .row-item:active{background:#F5F5F5}
.row-excluido{opacity:.4}
.badge{display:inline-flex;align-items:center;border-radius:20px;padding:2px 9px;font-size:10px;font-weight:700;font-family:'Inter',sans-serif;margin-top:3px}
.icon-btn{background:none;border:2px solid #E0E0E0;border-radius:8px;width:30px;height:30px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;color:#666666}
.icon-btn:hover{border-color:#CC0000;color:#CC0000}
.icon-btn-danger:hover{border-color:#B4483C;color:#B4483C}
.arrow-btn{background:none;border:2px solid #E0E0E0;border-radius:8px;width:34px;height:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#666666;transition:all .2s;flex-shrink:0}
.arrow-btn:hover:not(:disabled){border-color:#CC0000;color:#CC0000} .arrow-btn:disabled{opacity:.3;cursor:not-allowed}
.mes-btn{background:none;border:2px solid #E0E0E0;border-radius:10px;padding:8px 16px;cursor:pointer;font-family:'Inter',sans-serif;font-size:14px;font-weight:700;color:#1A1A1A;display:flex;align-items:center;gap:8px;transition:border .2s}
.mes-btn:hover{border-color:#CC0000}
.month-picker{position:absolute;top:110%;left:50%;transform:translateX(-50%);background:#fff;border-radius:16px;padding:20px;box-shadow:0 8px 32px #00000022;z-index:300;width:280px;animation:fadeIn .15s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
.mc{border:none;border-radius:8px;padding:10px 4px;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;cursor:pointer;transition:all .15s;color:#333;background:none;width:100%}
.mc:hover:not(.mc-dis){background:#F5F5F5} .mc-act{background:#CC0000!important;color:#fff!important} .mc-dis{opacity:.3;cursor:not-allowed}
.toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1A1A1A;color:#fff;padding:12px 24px;border-radius:50px;font-family:'Inter',sans-serif;font-size:13px;font-weight:700;z-index:500;white-space:nowrap;animation:toastIn .25s ease;pointer-events:none}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
::-webkit-scrollbar{width:3px} ::-webkit-scrollbar-thumb{background:#CC0000;border-radius:2px}`;

function Logo({size=48}) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <circle cx="50" cy="50" r="48" fill="#1A1A1A"/>
      <polyline points="26,38 34,24 42,34 50,20 58,34 66,24 74,38" stroke="#CC0000" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="24" y="44" width="52" height="20" rx="2" fill="#CC0000"/>
      <text x="50" y="60" textAnchor="middle" fontFamily="'Inter',sans-serif" fontSize="19" fill="#fff" letterSpacing="2">PICO</text>
      <text x="50" y="78" textAnchor="middle" fontFamily="'Inter',sans-serif" fontSize="9.5" fontStyle="italic" fill="#fff">barbershop</text>
    </svg>
  );
}
function Bar({percent,color="#00875A"}) {
  return (
    <div style={{background:"#E8E8E8",borderRadius:4,height:6,width:"100%",overflow:"hidden"}}>
      <div style={{width:`${Math.min(Math.max(percent,0),100)}%`,background:color,height:"100%",borderRadius:4}}/>
    </div>
  );
}
function Comparativo({atual,anterior,isParcial,inverterCores}) {
  if(!anterior) return null;
  const diff=((atual-anterior)/anterior)*100;
  const baixo=diff<0;
  const bom = inverterCores ? !baixo : baixo;
  const cor=bom?"#00875A":"#B4483C";
  return (
    <div style={{display:"inline-flex",alignItems:"center",gap:6,background:bom?"#E6F4EE":"#FBECEA",border:`1px solid ${cor}30`,borderRadius:8,padding:"4px 10px",marginTop:8}}>
      <span style={{fontSize:14,color:cor,fontWeight:800,fontFamily:"'Inter',sans-serif"}}>{baixo?"▼":"▲"} {Math.abs(diff).toFixed(1)}%</span>
      <span style={{fontSize:10,color:"#666666",letterSpacing:"0.06em",textTransform:"uppercase",fontWeight:700}}>{isParcial?"vs mesmo período ant.":"vs mês anterior"}</span>
    </div>
  );
}
function MonthPicker({mesAtual,onSelect,onClose}) {
  const [anoView,setAnoView]=useState(parseInt(mesAtual.slice(0,4)));
  const disp=MESES.map(m=>m.mes);
  const anosDisp=[...new Set(disp.map(k=>parseInt(k.slice(0,4))))];
  const podeAnt=anosDisp.includes(anoView-1);
  const podeProx=anosDisp.includes(anoView+1);
  const MESES_ABREV = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  return (
    <>
      <div style={{position:"fixed",inset:0,zIndex:299}} onClick={onClose}/>
      <div className="month-picker">
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:14}}>
          <button className="arrow-btn" style={{width:26,height:26}} disabled={!podeAnt} onClick={()=>setAnoView(a=>a-1)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{fontSize:15,fontFamily:"'Inter',sans-serif",fontWeight:800,color:"#1A1A1A"}}>{anoView}</div>
          <button className="arrow-btn" style={{width:26,height:26}} disabled={!podeProx} onClick={()=>setAnoView(a=>a+1)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
          {MESES_ABREV.map((nome,i)=>{
            const key=`${anoView}-${padN(i+1)}`;
            const isAct=key===mesAtual;
            const isDis=!disp.includes(key);
            return <button key={key} className={`mc${isAct?" mc-act":""}${isDis?" mc-dis":""}`} disabled={isDis} onClick={()=>{if(!isDis){onSelect(key);onClose();}}}>{nome}</button>;
          })}
        </div>
      </div>
    </>
  );
}
const emptyForm=()=>({centro:"empresa",descricao:"",valorDigits:"",categoria:"",meio:"",data:hoje(),obs:"",recorrente:false,repeticoes:"",meta_id:""});
const emptyFormReceita=()=>({centro:"empresa",descricao:"",valorDigits:"",data:hoje(),dataAte:"",obs:""});
function SeletorCentro({valor,onChange}) {
  return (
    <div style={{display:"flex",gap:4,background:"#F0F0F0",borderRadius:10,padding:4,marginBottom:16}}>
      {["empresa","pessoal"].map(k=>[k,VISOES[k].nome]).map(([k,l])=>(
        <button key={k} type="button" onClick={()=>onChange(k)}
          style={{flex:1,border:"none",borderRadius:8,padding:"10px 4px",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:13.5,fontWeight:700,background:valor===k?VISOES[k].cor:"transparent",color:valor===k?"#fff":"#666"}}>{l}</button>
      ))}
    </div>
  );
}
const INP=err=>({background:"#FAFAFA",border:`2px solid ${err?"#B4483C":"#E0E0E0"}`,borderRadius:10,color:"#1A1A1A",padding:"13px 14px",fontSize:15,fontFamily:"'Inter',sans-serif",width:"100%",transition:"border .2s"});
const FL={fontSize:11,color:"#666666",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7,display:"block",fontWeight:700,fontFamily:"'Inter',sans-serif"};
function FormBody({form,setForm,erro,setErro,permiteRecorrencia,metasVinc=[]}) {
  const Err=({k})=>erro[k]?<div style={{fontSize:11,color:"#B4483C",marginTop:4,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{erro[k]}</div>:null;
  return (
    <>
      <SeletorCentro valor={form.centro} onChange={k=>setForm(f=>({...f,centro:k,categoria:catsDoCentro(k).includes(f.categoria)?f.categoria:""}))}/>
      <div style={{marginBottom:16}}>
        <label style={FL}>Descrição *</label>
        <input style={INP(erro.descricao)} placeholder="Ex: Compra de lâminas" value={form.descricao}
          onChange={e=>{setForm(f=>({...f,descricao:e.target.value}));setErro(r=>({...r,descricao:null}));}}/>
        <Err k="descricao"/>
      </div>
      <div style={{marginBottom:16}}>
        <label style={FL}>Valor *</label>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#666666",fontFamily:"'Inter',sans-serif",fontWeight:700}}>R$</span>
          <input style={{...INP(erro.valor),paddingLeft:40,fontSize:20,fontWeight:800}} placeholder="0,00"
            value={form.valorDigits?d2brl(form.valorDigits):""} inputMode="numeric"
            onChange={e=>{setForm(f=>({...f,valorDigits:e.target.value.replace(/\D/g,"")}));setErro(r=>({...r,valor:null}));}}/>
        </div>
        <Err k="valor"/>
      </div>
      <div style={{marginBottom:16}}>
        <label style={FL}>Categoria *</label>
        <select style={INP(erro.categoria)} value={form.categoria}
          onChange={e=>{setForm(f=>({...f,categoria:e.target.value}));setErro(r=>({...r,categoria:null}));}}>
          <option value="">Selecione...</option>
          {(()=>{const l=catsDoCentro(form.centro||"empresa");return (!form.categoria||l.includes(form.categoria)?l:[...l,form.categoria]).map(c=><option key={c} value={c}>{c}</option>);})()}
        </select>
        <Err k="categoria"/>
        {catsDoCentro(form.centro||"empresa").filter(c=>c!=="Outros").length===0 && <div style={{fontSize:11,color:"#A6822E",marginTop:6,fontFamily:"'Inter',sans-serif"}}>Nenhuma categoria cadastrada ainda — peça pro seu mentor cadastrar pelo Painel.</div>}
      </div>
      {metasVinc.filter(m=>(m.centro||"empresa")===(form.centro||"empresa")).length>0&&(
        <div style={{marginBottom:16}}>
          <label style={FL}>Vincular a uma meta (opcional)</label>
          <select style={INP(false)} value={form.meta_id||""} onChange={e=>setForm(f=>({...f,meta_id:e.target.value}))}>
            <option value="">Sem vínculo</option>
            {metasVinc.filter(m=>(m.centro||"empresa")===(form.centro||"empresa")).map(m=><option key={m.id} value={m.id}>{(BENS[m.unidade]||BENS.outro).icone} {m.nome}</option>)}
          </select>
          {form.meta_id&&<div style={{background:"#E6F4EE",border:"1px solid #B5DCCB",borderRadius:10,padding:"10px 12px",marginTop:8,fontSize:11.5,color:"#00704B",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>
            🏠 Esta despesa conta como parcela paga da meta{form.data>hoje()?" assim que for movida para executado":""}. Continua somando normalmente nas despesas.
          </div>}
        </div>
      )}
      <div style={{marginBottom:16}}>
        <label style={FL}>Meio de Pagamento *</label>
        <select style={INP(erro.meio)} value={form.meio}
          onChange={e=>{setForm(f=>({...f,meio:e.target.value}));setErro(r=>({...r,meio:null}));}}>
          <option value="">Selecione...</option>
          {(!form.meio||MEIOS.includes(form.meio)?MEIOS:[...MEIOS,form.meio]).map(m=><option key={m} value={m}>{m}</option>)}
        </select>
        <Err k="meio"/>
      </div>
      <div style={{marginBottom:16}}>
        <label style={FL}>Data *</label>
        <input type="date" style={INP(erro.data)} value={form.data}
          onChange={e=>{setForm(f=>({...f,data:e.target.value}));setErro(r=>({...r,data:null}));}}/>
        <Err k="data"/>
        {form.data>hoje()&&(
          <div style={{background:"#FBECEA",border:"1px solid #EBBDB6",borderRadius:10,padding:"10px 12px",marginTop:8,fontSize:11.5,color:"#8A3A30",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>
            📅 Data futura — essa despesa fica "agendada" e só entra no total a partir de {fmtDate(form.data)}.
          </div>
        )}
      </div>
      <div style={{marginBottom:8}}>
        <label style={FL}>Observação</label>
        <textarea style={{...INP(false),minHeight:72,resize:"none",fontSize:14}} placeholder="Detalhes, referência, etc."
          value={form.obs} onChange={e=>setForm(f=>({...f,obs:e.target.value}))}/>
      </div>
      {permiteRecorrencia&&(
        <>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 0",borderTop:"2px solid #EEEEEE",marginTop:8}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:"#1A1A1A",fontFamily:"'Inter',sans-serif"}}>Despesa Recorrente</div>
              <div style={{fontSize:11,color:"#888888",marginTop:2,fontFamily:"'Inter',sans-serif"}}>Repete automaticamente nos próximos meses</div>
            </div>
            <div style={{width:44,height:24,borderRadius:12,cursor:"pointer",background:form.recorrente?"#00875A":"#ddd",display:"flex",alignItems:"center",padding:2,transition:"background .2s",flexShrink:0}}
              onClick={()=>{setForm(f=>({...f,recorrente:!f.recorrente}));setErro(r=>({...r,repeticoes:null}));}}>
              <div style={{width:20,height:20,borderRadius:"50%",background:"#fff",boxShadow:"0 1px 4px #0003",transition:"transform .2s",transform:form.recorrente?"translateX(20px)":"translateX(0)"}}/>
            </div>
          </div>
          {form.recorrente&&(
            <div style={{background:"#E6F4EE",border:"1.5px solid #B5DCCB",borderRadius:12,padding:16,marginTop:4}}>
              <label style={FL}>Repetir por quantos meses? *</label>
              <input type="number" inputMode="numeric" min="1" max="60" style={{...INP(erro.repeticoes),width:"50%"}} placeholder="Ex: 6"
                value={form.repeticoes}
                onChange={e=>{setForm(f=>({...f,repeticoes:e.target.value.replace(/\D/g,"").slice(0,2)}));setErro(r=>({...r,repeticoes:null}));}}/>
              <Err k="repeticoes"/>
              {parseInt(form.repeticoes)>=1&&form.data&&(
                <div style={{fontSize:11.5,color:"#00704B",fontWeight:600,marginTop:10,fontFamily:"'Inter',sans-serif"}}>
                  🔁 Além deste, será lançado nos próximos {parseInt(form.repeticoes)} mês{parseInt(form.repeticoes)>1?"es":""} — último em {addMesesData(form.data,parseInt(form.repeticoes)).slice(5,7)}/{addMesesData(form.data,parseInt(form.repeticoes)).slice(0,4)}, sempre no dia {form.data.slice(8,10)} (ou no último dia do mês, se for menor).
                </div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
}
function FormBodyReceita({form,setForm,erro,setErro}) {
  const Err=({k})=>erro[k]?<div style={{fontSize:11,color:"#B4483C",marginTop:4,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{erro[k]}</div>:null;
  return (
    <>
      <SeletorCentro valor={form.centro||"empresa"} onChange={k=>setForm(f=>({...f,centro:k}))}/>
      <div style={{marginBottom:16}}>
        <label style={FL}>Descrição *</label>
        <input style={INP(erro.descricao)} placeholder="Ex: Aluguel recebido — Imóvel Centro" value={form.descricao}
          onChange={e=>{setForm(f=>({...f,descricao:e.target.value}));setErro(r=>({...r,descricao:null}));}}/>
        <Err k="descricao"/>
      </div>
      <div style={{marginBottom:16}}>
        <label style={FL}>Valor Recebido *</label>
        <div style={{position:"relative"}}>
          <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#666666",fontFamily:"'Inter',sans-serif",fontWeight:700}}>R$</span>
          <input style={{...INP(erro.valor),paddingLeft:40,fontSize:22,fontWeight:800,color:"#00875A"}} placeholder="0,00"
            value={form.valorDigits?d2brl(form.valorDigits):""} inputMode="numeric"
            onChange={e=>{setForm(f=>({...f,valorDigits:e.target.value.replace(/\D/g,"")}));setErro(r=>({...r,valor:null}));}}/>
        </div>
        <Err k="valor"/>
      </div>
      <div style={{marginBottom:16}}>
        <label style={FL}>Recebido de *</label>
        <input type="date" style={INP(erro.data)} value={form.data}
          onChange={e=>{setForm(f=>({...f,data:e.target.value}));setErro(r=>({...r,data:null}));}}/>
        <Err k="data"/>
        {form.data>hoje()&&(
          <div style={{background:"#E6F4EE",border:"1px solid #B5DCCB",borderRadius:10,padding:"10px 12px",marginTop:8,fontSize:11.5,color:"#00704B",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>
            📅 Data futura — fica "a receber" e só entra no fluxo de caixa a partir de {fmtDate(form.data)}.
          </div>
        )}
      </div>
      <div style={{marginBottom:16}}>
        <label style={FL}>Até (opcional — se for um período)</label>
        <input type="date" style={INP(erro.dataAte)} min={form.data||undefined} value={form.dataAte||""}
          onChange={e=>{setForm(f=>({...f,dataAte:e.target.value}));setErro(r=>({...r,dataAte:null}));}}/>
        <Err k="dataAte"/>
      </div>
      <div style={{marginBottom:8}}>
        <label style={FL}>Observação</label>
        <textarea style={{...INP(false),minHeight:64,resize:"none",fontSize:14}} placeholder="Opcional — origem, etc."
          value={form.obs} onChange={e=>setForm(f=>({...f,obs:e.target.value}))}/>
      </div>
    </>
  );
}
// ─── RELATÓRIO (Dashboard + Relatório do Painel do Mentor, com visão por período) ──
const perRec = r => { const a=r.data_de||r.semana, b=r.data_ate||a; return b&&b!==a ? `${fmtDate(a)} → ${fmtDate(b)}` : fmtDate(a); };
const f2 = d => d.split("-").reverse().join("/");
const MES_AB = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const PERIODOS = [["mes","Mês",1],["tri","Trimestre",3],["sem","Semestre",6],["ano","Ano",12]];
const mAdd = (key, n) => { const [y,m]=key.split("-").map(Number); const t=y*12+(m-1)+n; return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,"0")}`; };
function rangeDe(tipo, mesKey) {
  const len = {mes:1,tri:3,sem:6,ano:12}[tipo];
  const [y,m] = mesKey.split("-").map(Number);
  const ini = `${y}-${String(Math.floor((m-1)/len)*len+1).padStart(2,"0")}`;
  return { ini, fim: mAdd(ini,len-1), len };
}
function labelPeriodo(tipo, ini, len) {
  const [y,m] = ini.split("-").map(Number);
  const ab = i => ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][(m-1+i)%12];
  if (tipo==="mes") return `${MESES_NOMES_FULL[m-1]} ${y}`;
  if (tipo==="tri") return `${Math.floor((m-1)/3)+1}º trimestre ${y} · ${ab(0)}–${ab(len-1)}`;
  if (tipo==="sem") return `${Math.floor((m-1)/6)+1}º semestre ${y} · ${ab(0)}–${ab(len-1)}`;
  return `Ano ${y}`;
}
async function fetchRange(ini, fim) {
  try {
    const [a,b] = await Promise.all([
      fetch(`${SUPA_URL}/rest/v1/lancamentos?cliente_id=eq.${CID}&mes=gte.${ini}&mes=lte.${fim}&excluido=eq.false&order=data.desc`, { headers: H }),
      fetch(`${SUPA_URL}/rest/v1/receitas?cliente_id=eq.${CID}&mes=gte.${ini}&mes=lte.${fim}&order=semana.desc`, { headers: H }),
    ]);
    const t = await tbGet("transferencias", `mes=gte.${ini}&mes=lte.${fim}&order=data.desc`);
    return { l: a.ok ? await a.json() : [], r: b.ok ? (await b.json()).filter(x=>!x.excluido) : [], t: (t||[]).filter(x=>!x.excluido) };
  } catch { return { l: [], r: [], t: [] }; }
}
const somaV = a => a.reduce((s,x)=>s+x.valor,0);
const agCat = list => { const m={}; list.forEach(l=>{m[l.categoria]=(m[l.categoria]||0)+l.valor;}); return Object.entries(m).map(([cat,val])=>({cat,val,cor:CAT_CORES[cat]||"#999"})).sort((a,b)=>b.val-a.val); };
function Donut({ segs, size=124 }) {
  const r=28, cx=45, cy=45, circ=2*Math.PI*r;
  const total=segs.reduce((s,x)=>s+x.val,0);
  let off=0;
  return (
    <svg width={size} height={size} viewBox="0 0 90 90">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#E8E8E8" strokeWidth="10"/>
      {segs.map((sg,i)=>{
        const len=total>0?(sg.val/total)*circ:0;
        const el=<circle key={i} cx={cx} cy={cy} r={r} fill="none" stroke={sg.cor} strokeWidth="10"
          strokeDasharray={`${Math.max(len-1.5,0)} ${circ}`} strokeDashoffset={-off}
          style={{transform:"rotate(-90deg)",transformOrigin:"50% 50%"}}/>;
        off+=len; return el;
      })}
    </svg>
  );
}
function Relatorio({ mesKey, goPeriodo, visao }) {
  const [tipo,setTipo]   = useState("mes");
  const [bruto,setDados] = useState(null);
  const dados = useMemo(()=>{
    if(!bruto) return null;
    const f = p => ({ l:p.l.filter(x=>naVisao(visao,x)), r:p.r.filter(x=>naVisao(visao,x)), t:p.t||[] });
    return { cur:f(bruto.cur), prev:f(bruto.prev) };
  },[bruto,visao]);
  const [ab,setAb]       = useState({pan:false,dist:false,det:false});
  const [catAb,setCatAb] = useState({});
  const { ini, fim, len } = rangeDe(tipo, mesKey);
  useEffect(()=>{
    let ativo=true; setDados(null);
    Promise.all([fetchRange(ini,fim), fetchRange(mAdd(ini,-len), mAdd(ini,-1))])
      .then(([cur,prev])=>{ if(ativo) setDados({cur,prev}); });
    return ()=>{ ativo=false; };
  },[ini,fim,len]);

  const card={background:"#fff",borderRadius:14,padding:"4px 16px",boxShadow:"0 2px 8px #1A1A1A10",marginBottom:12};
  const hj=hoje(), mesHoje=hj.slice(0,7);
  const primeiro = MESES[0].mes, ultimo = MESES[MESES.length-1].mes;
  const podeAnt = mAdd(ini,-1) >= primeiro, podeProx = mAdd(fim,1) <= ultimo;
  const navBtn = (dir,ok,txt)=>(
    <button onClick={()=>ok&&goPeriodo(dir*len)} disabled={!ok} style={{width:38,height:38,borderRadius:10,border:"2px solid #E0E0E0",background:"#fff",color:ok?"#1A1A1A":"#CFCBBE",fontSize:18,cursor:ok?"pointer":"default",fontFamily:"'Inter',sans-serif"}}>{txt}</button>
  );
  const Sec = ({k,titulo,children}) => (
    <div style={{marginBottom:6}}>
      <div role="button" onClick={()=>setAb(a=>({...a,[k]:!a[k]}))} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:"#888888",letterSpacing:"0.2em",textTransform:"uppercase",margin:"16px 0 10px",fontWeight:700,cursor:"pointer",userSelect:"none"}}>
        <span>{titulo}</span>
        <span style={{display:"inline-block",transform:ab[k]?"rotate(90deg)":"none",transition:"transform .15s",fontSize:9}}>▶</span>
      </div>
      {ab[k]&&children}
    </div>
  );
  const header = (
    <>
      <div style={{display:"flex",gap:4,background:"#fff",borderRadius:10,padding:4,boxShadow:"0 2px 8px #1A1A1A10",marginBottom:12}}>
        {PERIODOS.map(([k,l])=>(
          <button key={k} onClick={()=>setTipo(k)} style={{flex:1,border:"none",borderRadius:8,padding:"9px 2px",fontSize:12,fontWeight:700,fontFamily:"'Inter',sans-serif",cursor:"pointer",background:tipo===k?"#1A1A1A":"transparent",color:tipo===k?"#fff":"#888888"}}>{l}</button>
        ))}
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,marginBottom:14}}>
        {navBtn(-1,podeAnt,"‹")}
        <div style={{fontSize:16,fontWeight:800,color:"#1A1A1A",fontFamily:"'Inter',sans-serif",textAlign:"center"}}>{labelPeriodo(tipo,ini,len)}</div>
        {navBtn(1,podeProx,"›")}
      </div>
    </>
  );
  if (!dados) return <>{header}<div style={{...card,padding:24,textAlign:"center",color:"#888888",fontSize:14,fontWeight:700}}>Carregando…</div></>;

  const contFn = l => !isLiq(l) && l.data<=hj;
  const lc = dados.cur.l.filter(contFn), lp = dados.prev.l.filter(contFn);
  const agend = dados.cur.l.filter(l=>!isLiq(l)&&l.data>hj);
  const total=somaV(lc), totAnt=somaV(lp), temAnt=lp.length>0;
  const diff = totAnt>0 ? ((total-totAnt)/totAnt)*100 : null;
  const trEf = list => list.filter(t=>t.data<=hj).reduce((s,t)=>s+efeitoTransf(visao,t.valor),0);
  const recOk=dados.cur.r.filter(r=>!recProg(r)), recFut=dados.cur.r.filter(recProg);
  const transf=trEf(dados.cur.t), receita=somaV(recOk), saldo=receita-total+transf;
  const emp=somaV(lc.filter(l=>l.centro!=="pessoal")), pes=somaV(lc.filter(l=>l.centro==="pessoal"));
  const meses = Array.from({length:len},(_,i)=>mAdd(ini,i));
  const decorridos = Math.max(1, meses.filter(k=>k<=mesHoje).length);
  const linhas = meses.map(k=>{
    const d=somaV(lc.filter(l=>l.mes===k)), r=somaV(recOk.filter(x=>x.mes===k));
    return {k,d,r,s:r-d+trEf(dados.cur.t.filter(t=>t.mes===k))};
  });
  const maxD = Math.max(1,...linhas.map(x=>x.d));
  const cats = agCat(lc);
  const prevMap = {}; agCat(lp).forEach(({cat,val})=>{prevMap[cat]=val;});
  const zeraram = Object.keys(prevMap).filter(k=>!cats.some(x=>x.cat===k)).sort((a,b)=>prevMap[b]-prevMap[a]).map(cat=>({cat,val:0,cor:CAT_CORES[cat]||"#999"}));
  const linhasCat=[...cats,...zeraram];
  const rotAnt = len===1?"mês anterior":"período anterior";
  const variacao=(cat,val)=>{
    if(!temAnt) return null;
    const ant=prevMap[cat]||0;
    if(ant===0) return val>0?{txt:`novo — sem lançamento no ${rotAnt}`,cor:"#A6822E"}:null;
    if(val===ant) return {txt:`= igual ao ${rotAnt}`,cor:"#888888"};
    const d=((val-ant)/ant)*100, subiu=d>0;
    return {txt:`${subiu?"▲ +":"▼ "}${d.toFixed(1)}% vs ${rotAnt} · ant. ${fmt(ant)}`,cor:subiu?"#B4483C":"#00875A"};
  };
  const pc=(a,b)=>b>0?((a/b)*100).toFixed(1):"0.0";
  const vazio = total===0 && receita===0 && agend.length===0;
  const kpis = [
    {l:"Saldo (receita − despesa)",v:fmt(saldo),sub:(saldo>=0?"positivo":"negativo")+(transf?` · ${transf>0?"+":"−"} ${fmt(Math.abs(transf))} transf. Pico → Isaque`:""),cor:saldo>=0?"#1A1A1A":"#B4483C"},
    {l:`vs ${rotAnt}`,v:diff!=null?`${diff>0?"+":""}${diff.toFixed(1)}%`:"—",sub:diff!=null?(diff<0?"↓ reduziu":"↑ aumentou"):"sem comparativo",cor:diff!=null?(diff<0?"#00875A":"#B4483C"):"#888888"},
    {l:"Receita",v:fmt(receita),sub:`${recOk.length} entrada(s)`+(recFut.length?` · + ${fmt(somaV(recFut))} a receber`:""),cor:"#00875A"},
    {l:"Despesa",v:fmt(total),sub:`${lc.length} lançamentos${len>1?` · média ${fmt(total/decorridos)}/mês`:""}`,cor:"#1A1A1A"},
    visao==="ambos"
      ? {l:`Despesa ${VISOES.empresa.nome}`,v:fmt(emp),sub:`${VISOES.pessoal.nome} ${fmt(pes)}`,cor:"#CC0000"}
      : {l:"Maior categoria",v:cats[0]?fmt(cats[0].val):"—",sub:cats[0]?`${cats[0].cat} · ${pc(cats[0].val,total)}%`:"sem despesas",cor:VISOES[visao].cor},
    {l:"A executar (programado)",v:fmt(somaV(agend)),sub:`${agend.length} conta(s)`,cor:"#8A6A1F"},
  ];
  return (
    <>
      {header}
      {vazio
        ?<div style={{...card,padding:24,textAlign:"center"}}><div style={{fontSize:32,marginBottom:8}}>📭</div><div style={{color:"#888888",fontSize:14,fontWeight:700}}>Nenhum lançamento neste período.</div></div>
        :<>
          <div className="kpi-grid" style={{marginBottom:6}}>
            {kpis.map((k,i)=>(
              <div key={i} style={{background:"#fff",borderRadius:14,padding:"14px",boxShadow:"0 2px 8px #1A1A1A10"}}>
                <div style={{fontSize:9,color:"#888888",letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:700,marginBottom:5,lineHeight:1.3}}>{k.l}</div>
                <div style={{fontSize:k.v.length>12?14:16,fontWeight:800,color:k.cor,fontFamily:"'Inter',sans-serif",lineHeight:1.1}}>{k.v}</div>
                <div style={{fontSize:10,color:"#888888",marginTop:5,fontWeight:600,lineHeight:1.3}}>{k.sub}</div>
              </div>
            ))}
          </div>
          {len>1&&<Sec k="pan" titulo="Panorama mês a mês">
            <div style={{...card,padding:"8px 16px 12px"}}>
              {linhas.map((x,i)=>(
                <div key={x.k} style={{padding:"10px 0",borderBottom:i<linhas.length-1?"1px solid #EEEEEE":"none",opacity:x.k>mesHoje&&x.d===0&&x.r===0?0.45:1}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:5}}>
                    <span style={{fontSize:13,fontWeight:x.k===mesKey?800:700,color:"#1A1A1A"}}>{MESES_NOMES_FULL[parseInt(x.k.slice(5),10)-1]}{x.k===mesKey?" ·":""}{x.k===mesKey&&<span style={{fontSize:10,color:"#888888",fontWeight:600}}> selecionado</span>}</span>
                    <span style={{fontSize:13,fontWeight:800,color:"#1A1A1A"}}>{fmt(x.d)}</span>
                  </div>
                  <Bar percent={(x.d/maxD)*100} color={x.k===mesKey?"#CC0000":"#E8A0A0"}/>
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:5,fontSize:10,fontWeight:600}}>
                    <span style={{color:"#00875A"}}>Receita {fmt(x.r)}</span>
                    <span style={{color:x.s>=0?"#1A1A1A":"#B4483C"}}>Saldo {fmt(x.s)}</span>
                  </div>
                </div>
              ))}
              <div style={{display:"flex",justifyContent:"space-between",paddingTop:10,borderTop:"2px solid #E0E0E0",marginTop:2,fontSize:12,fontWeight:800,color:"#1A1A1A"}}>
                <span>Total do período</span><span>{fmt(total)}</span>
              </div>
            </div>
          </Sec>}
          <Sec k="dist" titulo="Distribuição por categoria">
            <div style={{...card,padding:"18px 16px"}}>
              {total===0
                ?<div style={{textAlign:"center",color:"#888888",fontSize:13,fontWeight:700}}>Sem despesas no período.</div>
                :<>
                  <div style={{display:"flex",justifyContent:"center",marginBottom:14}}>
                    <div style={{position:"relative"}}>
                      <Donut segs={cats}/>
                      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
                        <div style={{fontSize:8,color:"#888888",fontWeight:700,textTransform:"uppercase"}}>total</div>
                        <div style={{fontSize:fmt(total).length>12?8:9,fontWeight:800,color:"#1A1A1A",fontFamily:"'Inter',sans-serif",textAlign:"center",lineHeight:1.2,maxWidth:62}}>{fmt(total)}</div>
                      </div>
                    </div>
                  </div>
                  {linhasCat.map(({cat,val,cor},i)=>{
                    const v=variacao(cat,val);
                    return (
                      <div key={cat} style={{padding:"10px 0",borderTop:i?"1px solid #EEEEEE":"none",opacity:val===0?0.7:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,marginBottom:5}}>
                          <span style={{display:"flex",alignItems:"center",gap:7,minWidth:0}}>
                            <span style={{width:8,height:8,borderRadius:2,background:cor,flexShrink:0}}/>
                            <span style={{fontSize:13,fontWeight:700,color:"#1A1A1A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cat}</span>
                          </span>
                          <span style={{display:"flex",alignItems:"baseline",gap:8,flexShrink:0}}>
                            <span style={{fontSize:13,fontWeight:800,color:"#1A1A1A"}}>{fmt(val)}</span>
                            <span style={{fontSize:11,fontWeight:800,color:cor,minWidth:44,textAlign:"right"}}>{pc(val,total)}%</span>
                          </span>
                        </div>
                        <Bar percent={total>0?(val/total)*100:0} color={cor}/>
                        {v&&<div style={{fontSize:10,fontWeight:700,color:v.cor,marginTop:5}}>{v.txt}</div>}
                      </div>
                    );
                  })}
                </>}
            </div>
          </Sec>
          <Sec k="det" titulo="Detalhamento por categoria">
            {cats.length===0
              ?<div style={{...card,padding:20,textAlign:"center",color:"#888888",fontSize:13,fontWeight:700}}>Sem lançamentos.</div>
              :cats.map(({cat,val,cor})=>{
                const itens=lc.filter(l=>l.categoria===cat).sort((a,b)=>b.data.localeCompare(a.data));
                const open=!!catAb[cat];
                return (
                  <div key={cat} style={{...card,padding:0,overflow:"hidden",marginBottom:8}}>
                    <div onClick={()=>setCatAb(p=>({...p,[cat]:!p[cat]}))} style={{padding:"12px 16px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:4,alignSelf:"stretch",background:cor,borderRadius:2}}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                          <span style={{fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{cat}</span>
                          <span style={{fontSize:13,fontWeight:800,color:"#1A1A1A"}}>{fmt(val)}</span>
                        </div>
                        <Bar percent={total>0?(val/total)*100:0} color={cor}/>
                        <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:10,color:"#888888",fontWeight:600}}>
                          <span>{itens.length} item(ns)</span><span>{pc(val,total)}%</span>
                        </div>
                      </div>
                      <span style={{color:"#888888",fontSize:12,transition:"transform .2s",transform:open?"rotate(180deg)":"none"}}>▾</span>
                    </div>
                    {open&&(
                      <div style={{borderTop:"1px solid #EEEEEE",background:"#FAFAFA"}}>
                        {itens.map((it,i)=>(
                          <div key={it.id} style={{padding:"10px 16px 10px 30px",borderBottom:i<itens.length-1?"1px solid #EEEEEE":"none",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                            <div style={{minWidth:0,flex:1}}>
                              <div style={{fontSize:12,fontWeight:600,color:"#1A1A1A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.descricao}</div>
                              <div style={{fontSize:10,color:"#888888",marginTop:2}}>{fmtDate(it.data)} · {it.meio}</div>
                              {it.obs&&<div style={{fontSize:10,color:"#888888",fontStyle:"italic",marginTop:1}}>{it.obs}</div>}
                            </div>
                            <div style={{fontSize:13,fontWeight:800,color:"#1A1A1A",flexShrink:0}}>{fmt(it.valor)}</div>
                          </div>
                        ))}
                        <div style={{padding:"9px 16px 9px 30px",background:`${cor}14`,display:"flex",justifyContent:"space-between"}}>
                          <span style={{fontSize:11,fontWeight:800,color:"#1A1A1A",letterSpacing:"0.06em",textTransform:"uppercase"}}>Subtotal</span>
                          <span style={{fontSize:13,fontWeight:800,color:"#1A1A1A"}}>{fmt(val)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </Sec>
        </>}
    </>
  );
}

// ─── COMPONENTES DAS ETAPAS 1 E 2 ────────────────────────────────────────────
function Modal({onClose, children}) {
  return (
    <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="sheet"><div className="handle"/>{children}</div>
    </div>
  );
}
const ErrTxt = ({msg}) => msg ? <div style={{fontSize:11,color:"#B4483C",marginTop:4,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{msg}</div> : null;
function CampoValor({label, digits, onChange, err, cor="#1A1A1A"}) {
  return (
    <div style={{marginBottom:16}}>
      <label style={FL}>{label}</label>
      <div style={{position:"relative"}}>
        <span style={{position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#666666",fontWeight:700}}>R$</span>
        <input style={{...INP(err),paddingLeft:40,fontSize:20,fontWeight:800,color:cor}} placeholder="0,00" inputMode="numeric"
          value={digits?d2brl(digits):""} onChange={e=>onChange(e.target.value.replace(/\D/g,""))}/>
      </div>
      <ErrTxt msg={err}/>
    </div>
  );
}
function Chips({opcoes, valor, onChange}) {
  return (
    <div style={{display:"flex",gap:4,background:"#F0F0F0",borderRadius:10,padding:4,marginBottom:16,flexWrap:"wrap"}}>
      {opcoes.map(([k,l,cor])=>(
        <button key={k} type="button" onClick={()=>onChange(k)}
          style={{flex:"1 1 0",minWidth:70,border:"none",borderRadius:8,padding:"9px 6px",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:12.5,fontWeight:700,background:valor===k?(cor||"#1A1A1A"):"transparent",color:valor===k?"#fff":"#666"}}>{l}</button>
      ))}
    </div>
  );
}
function Anel({pct, cor, size=88, centro}) {
  const r=36, circ=2*Math.PI*r, p=Math.max(0,Math.min(pct,1));
  return (
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} viewBox="0 0 90 90">
        <circle cx="45" cy="45" r={r} fill="none" stroke="#EEEEEE" strokeWidth="9"/>
        <circle cx="45" cy="45" r={r} fill="none" stroke={cor} strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${p*circ} ${circ}`} style={{transform:"rotate(-90deg)",transformOrigin:"50% 50%",transition:"stroke-dasharray .6s ease"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
        {centro || <><div style={{fontSize:19,fontWeight:800,color:"#1A1A1A",lineHeight:1}}>{Math.round(pct*100)}%</div></>}
      </div>
    </div>
  );
}
const MARCOS = [[0.25,"🥉","25%"],[0.5,"🥈","50%"],[0.75,"🥇","75%"],[1,"🏆","100%"]];
function Medalhas({pct}) {
  return (
    <div style={{display:"flex",gap:6}}>
      {MARCOS.map(([v,ic,l])=>{ const on=pct>=v; return (
        <div key={l} title={l} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"6px 2px",borderRadius:10,background:on?"#FBF3E4":"#F5F5F5",border:`1px solid ${on?"#EAD9AE":"#EEEEEE"}`}}>
          <span style={{fontSize:18,filter:on?"none":"grayscale(1)",opacity:on?1:0.35}}>{ic}</span>
          <span style={{fontSize:9.5,fontWeight:800,color:on?"#8A6A1F":"#BBBBBB"}}>{l}</span>
        </div>
      );})}
    </div>
  );
}
function Prazo({p, m}) {
  let txt, cor="#666666", fundo="#F0F0F0";
  if (p.mensal) { txt = p.diasRest===0 ? "renova amanhã" : `renova em ${p.diasRest+1} dias`; }
  else if (p.diasRest==null) txt = "sem prazo";
  else if (p.diasRest<0) { txt = `atrasada há ${-p.diasRest} dia${p.diasRest===-1?"":"s"}`; cor="#B4483C"; fundo="#FBECEA"; }
  else if (p.diasRest===0) { txt = "vence hoje"; cor="#B4483C"; fundo="#FBECEA"; }
  else { txt = `faltam ${p.diasRest} dia${p.diasRest===1?"":"s"}`; if (p.diasRest<=7) { cor="#8A6A1F"; fundo="#FBF3E4"; } }
  return <span style={{display:"inline-flex",alignItems:"center",gap:4,background:fundo,color:cor,borderRadius:20,padding:"3px 9px",fontSize:10.5,fontWeight:800,whiteSpace:"nowrap"}}>⏳ {txt}{!p.mensal&&m.prazo?` · ${f2(m.prazo)}`:""}</span>;
}
function MiniCalendario({m, onDia}) {
  const hj=hoje(), ini=m.data_inicio||(m.criado_em||"").slice(0,10)||hj, fimMeta=m.prazo||hj;
  const marcados = new Set(lerCheckins(m));
  const modoMes = false;   // só a semana (sem o mapa do mês inteiro)
  const clamp = d => d<ini?ini:d>fimMeta?fimMeta:d;
  const [ref,setRef] = useState(clamp(hj));            // um dia da semana exibida
  const mesV = ref.slice(0,7);
  const [y,mo] = mesV.split("-").map(Number), nDias=new Date(y,mo,0).getDate(), pad=new Date(y,mo-1,1).getDay();
  const dow = new Date(...ref.split("-").map((v,i)=>i===1?v-1:+v)).getDay(), semIni = addDias(ref,-dow);
  const podeAnt = modoMes ? mAdd(mesV,-1)>=ini.slice(0,7) : addDias(semIni,-1)>=ini;
  const podeProx = modoMes ? mAdd(mesV,1)<=fimMeta.slice(0,7) : addDias(semIni,7)<=fimMeta;
  const ir = dir => setRef(r => modoMes ? clamp(`${mAdd(r.slice(0,7),dir)}-01`<ini?ini:`${mAdd(r.slice(0,7),dir)}-01`) : addDias(r,7*dir));
  const cel = modoMes
    ? [...Array(pad).fill(null), ...Array.from({length:nDias},(_,i)=>`${mesV}-${String(i+1).padStart(2,"0")}`)]
    : Array.from({length:7},(_,i)=>addDias(semIni,i));
  const rotulo = modoMes ? `${MESES_NOMES_FULL[mo-1]} ${y}` : `${fmtDate(cel[0])} – ${fmtDate(cel[6])}`;
  const nb = (ok,dir,txt)=><button onClick={()=>ok&&ir(dir)} disabled={!ok} style={{background:"none",border:"none",fontSize:16,color:ok?"#1A1A1A":"#DDD",cursor:ok?"pointer":"default",padding:"0 8px"}}>{txt}</button>;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        {nb(podeAnt,-1,"‹")}<span style={{fontSize:12,fontWeight:800,color:"#1A1A1A"}}>{rotulo}</span>{nb(podeProx,1,"›")}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(0,1fr))",gap:3}}>
        {["D","S","T","Q","Q","S","S"].map((d,i)=><div key={i} style={{fontSize:9,fontWeight:800,color:"#888888",textAlign:"center"}}>{d}</div>)}
        {cel.map((d,i)=>{
          if(!d) return <div key={i}/>;
          const dentro = d>=ini && d<=fimMeta, passado = d<=hj, ok = marcados.has(d), clicavel = dentro && passado && !!onDia;
          return (
            <button key={i} onClick={()=>clicavel&&onDia(m,d)} disabled={!clicavel}
              style={{aspectRatio:modoMes?"1":"auto",height:modoMes?"auto":34,borderRadius:8,border:d===hj?"2px solid #1A1A1A":"1px solid "+(ok?"#00875A":"#EEEEEE"),
                background:ok?"#00875A":dentro?(passado?"#FAFAFA":"#fff"):"#F5F5F5",color:ok?"#fff":dentro?"#1A1A1A":"#CCCCCC",
                fontSize:11,fontWeight:800,cursor:clicavel?"pointer":"default",padding:0,fontFamily:"'Inter',sans-serif",opacity:dentro?1:0.5}}>
              {ok?"✓":parseInt(d.slice(8),10)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
function BlocoMedidor({m, x, onQtd, onEtapa, onDia}) {
  const M = MEDIDORES[x.k], cor = x.pct>=1 ? "#00875A" : "#00875A";
  return (
    <div style={{border:"1px solid #EEEEEE",borderRadius:12,padding:"10px 12px",marginTop:10}}>
      {x.k!=="quantidade"&&<>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,marginBottom:6}}>
          <span style={{fontSize:12.5,fontWeight:800,color:"#1A1A1A",display:"inline-flex",alignItems:"center",gap:8}}>{M.icone} {M.nome}
          </span>
          <span style={{fontSize:11.5,fontWeight:800,color:x.pct>=1?"#00704B":"#666"}}>{x.txt} · {Math.round(Math.min(1,x.pct)*100)}%</span>
        </div>
        <Bar percent={x.pct*100} color={cor}/>
      </>}
      {x.k==="quantidade"&&x.itens.map((it,ix)=>(
        <div key={it.id} style={{marginTop:ix>0?12:0,borderTop:ix>0?"1px solid #EEEEEE":"none",paddingTop:ix>0?12:0}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",gap:8,marginBottom:6}}>
            <span style={{fontSize:12.5,fontWeight:800,color:"#1A1A1A"}}>🔢 {it.nome||"Atividade"}</span>
            <span style={{fontSize:11.5,fontWeight:800,color:it.pct>=1?"#00704B":"#666"}}>{it.txt} · {Math.round(Math.min(1,it.pct)*100)}%</span>
          </div>
          <Bar percent={it.pct*100} color={cor}/>
          {it.extra&&<div style={{fontSize:11,fontWeight:700,color:"#888888",marginTop:6}}>{it.auto?"":"🔁 "}{it.extra}</div>}
          {onQtd&&!it.auto&&<div style={{display:"flex",gap:8,marginTop:8}}>
            {[-1,1,5,10,50].map(d=>(
              <button key={d} onClick={()=>onQtd(m,d,it.id)} style={{flex:1,border:`2px solid ${d>0?"#00875A":"#E0E0E0"}`,background:d>0?"#E6F4EE":"#fff",color:d>0?"#00704B":"#666",borderRadius:10,padding:"8px 4px",fontSize:15,fontWeight:800,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>{d>0?`+ ${d}`:`− ${Math.abs(d)}`}</button>
            ))}
          </div>}
        </div>
      ))}
      {x.k==="etapas"&&(
        <div style={{marginTop:10,display:"flex",flexDirection:"column",gap:4}}>
          {lerEtapas(m).map((e,i)=>(
            <button key={i} onClick={()=>onEtapa&&onEtapa(m,i)} style={{display:"flex",alignItems:"center",gap:10,background:e.ok?"#E6F4EE":"#FAFAFA",border:`1px solid ${e.ok?"#B5DCCB":"#EEEEEE"}`,borderRadius:10,padding:"8px 10px",cursor:onEtapa?"pointer":"default",textAlign:"left",fontFamily:"'Inter',sans-serif"}}>
              <span style={{width:20,height:20,borderRadius:6,border:`2px solid ${e.ok?"#00875A":"#CCCCCC"}`,background:e.ok?"#00875A":"#fff",color:"#fff",fontSize:12,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{e.ok?"✓":""}</span>
              <span style={{fontSize:13,fontWeight:700,color:e.ok?"#00704B":"#1A1A1A",textDecoration:e.ok?"line-through":"none"}}>{e.t}</span>
            </button>
          ))}
        </div>
      )}
      {x.k==="calendario"&&(
        <div style={{marginTop:10}}>
          <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
            <span style={{flex:1,display:"inline-flex",alignItems:"center",gap:6,background:x.seq>0?"#FFF1E6":"#F5F5F5",borderRadius:10,padding:"8px 10px",fontSize:12,fontWeight:800,color:x.seq>0?"#C2410C":"#999"}}>
              🔥 {x.seq} dia{x.seq===1?"":"s"} seguido{x.seq===1?"":"s"}
            </span>
            {onDia&&m.prazo&&hoje()<=m.prazo&&hoje()>=(m.data_inicio||"")&&(
              <button onClick={()=>onDia(m,hoje())} style={{flex:1,border:"none",borderRadius:10,padding:"9px 10px",fontSize:12.5,fontWeight:800,cursor:"pointer",fontFamily:"'Inter',sans-serif",
                background:x.hojeOk?"#E6F4EE":"#00875A",color:x.hojeOk?"#00704B":"#fff"}}>{x.hojeOk?"✓ Hoje feito":"Marcar hoje"}</button>
            )}
          </div>
          <MiniCalendario m={m} onDia={onDia}/>
        </div>
      )}
    </div>
  );
}
function CardMeta({m, p, onClick, onQtd, onEtapa, onDia}) {
  const T = TIPOS_META[p.tipo], v = VISOES[m.centro||"empresa"], limite = p.tipo==="limite", obj = p.tipo==="objetiva";
  const corAnel = limite ? p.status.cor : p.pct>=1 ? "#00875A" : p.status.nivel===2 ? "#B4483C" : p.status.nivel===1 ? "#A6822E" : "#00875A";
  const meds = p.meds || [];
  const icone = obj ? (meds.length===1 ? MEDIDORES[meds[0].k].icone : "🎯") : p.tipo==="patrimonio" ? (BENS[m.unidade]||BENS.outro).icone : T.icone;
  const subtitulo = obj ? (meds.length ? meds.map(x=>MEDIDORES[x.k].nome).join(" + ") : "sem medidor") : T.nome;
  return (
    <div onClick={onClick} style={{background:"#fff",borderRadius:16,padding:"16px",boxShadow:"0 2px 10px #1A1A1A12",marginBottom:12,cursor:"pointer"}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10,marginBottom:12}}>
        <span style={{width:38,height:38,borderRadius:12,background:v.fundo,display:"flex",alignItems:"center",justifyContent:"center",fontSize:19,flexShrink:0}}>{icone}</span>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:15,fontWeight:800,color:"#1A1A1A",lineHeight:1.25}}>{m.nome}</div>
          <div style={{display:"flex",gap:6,alignItems:"center",marginTop:4,flexWrap:"wrap"}}>
            <span style={{fontSize:10.5,color:"#888888",fontWeight:700}}>{GRUPOS_META[T.grupo].nome} · {subtitulo}</span>
            <span className="badge" style={{marginTop:0,background:v.fundo,color:v.cor,border:`1px solid ${v.cor}33`}}>{v.curto}</span>
          </div>
        </div>
        <span className="badge" style={{marginTop:0,background:p.status.fundo,color:p.status.cor,border:`1px solid ${p.status.cor}33`,whiteSpace:"nowrap"}}>{p.status.txt}</span>
      </div>
      <div style={{display:"flex",gap:14,alignItems:"center"}}>
        <Anel pct={p.pct} cor={corAnel} centro={limite?<><div style={{fontSize:17,fontWeight:800,color:"#1A1A1A",lineHeight:1}}>{Math.round(p.pct*100)}%</div><div style={{fontSize:8.5,color:"#888888",fontWeight:700,marginTop:2}}>usado</div></>:null}/>
        <div style={{flex:1,minWidth:0}}>
          {obj
            ?<>
              <div style={{fontSize:10,color:"#888888",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>Progresso geral</div>
              <div style={{fontSize:21,fontWeight:800,color:"#1A1A1A",lineHeight:1.15}}>{Math.round(p.pct*100)}%</div>
              <div style={{fontSize:12,fontWeight:700,color:"#888888",marginTop:2}}>{meds.length>1?`média de ${meds.length} medidores`:meds[0]?meds[0].txt:""}</div>
            </>
            :<>
              <div style={{fontSize:10,color:"#888888",fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase"}}>{limite?"Gasto":"Atual"}</div>
              <div style={{fontSize:21,fontWeight:800,color:"#1A1A1A",lineHeight:1.15}}>{fmtMeta(m,p.atual)}</div>
              <div style={{fontSize:12,fontWeight:700,color:"#888888",marginTop:2}}>{limite?"limite":"alvo"} {fmtMeta(m,p.alvo)}{p.patr&&p.patr.np>0?` · ${p.patr.pagas}/${p.patr.np} parcelas`:""}</div>
            </>}
          <div style={{marginTop:8}}><Prazo p={p} m={m}/></div>
        </div>
      </div>
      {p.dica&&<div style={{fontSize:11.5,fontWeight:700,color:p.pct>=1&&!limite?"#00704B":limite&&p.pct>1?"#B4483C":"#444",background:"#F7F7F7",borderRadius:10,padding:"8px 10px",marginTop:12}}>{p.dica}</div>}
      {obj&&<div onClick={e=>e.stopPropagation()} style={{cursor:"default"}}>{meds.map(x=><BlocoMedidor key={x.k} m={m} x={x} onQtd={onQtd} onEtapa={onEtapa} onDia={onDia}/>)}</div>}
      {!limite&&<div style={{marginTop:12}}><Medalhas pct={p.pct}/></div>}
    </div>
  );
}
function CardRealizada({m, p, onClick}) {
  const T = TIPOS_META[p.tipo];
  const quando = m.concluida_em || null;
  const antes = quando && m.prazo ? diasEntre(quando, m.prazo) : null;
  const tipoTxt = p.tipo==="objetiva" ? `🎯 ${(p.meds||[]).map(x=>MEDIDORES[x.k].nome).join(" + ")}` : `${T.icone} ${T.nome} · ${fmtMeta(m,p.alvo)}`;
  return (
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:12,background:"linear-gradient(135deg,#FFFDF5,#FBF3E4)",border:"1.5px solid #EAD9AE",borderRadius:16,padding:"14px 16px",marginBottom:10,cursor:"pointer"}}>
      <span style={{fontSize:30}}>🏆</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:14.5,fontWeight:800,color:"#1A1A1A"}}>{m.nome}</div>
        <div style={{fontSize:11,color:"#8A6A1F",fontWeight:700,marginTop:3}}>{tipoTxt}</div>
        <div style={{fontSize:10.5,color:"#888888",fontWeight:600,marginTop:3}}>
          {quando?`Concluída em ${f2(quando)}`:"Alvo atingido"}{antes!=null&&antes>0?` · ${antes} dia${antes>1?"s":""} antes do prazo 🔥`:""}
        </div>
      </div>
    </div>
  );
}
const SecTitulo = ({aberto, onClick, children, direita}) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:20,marginBottom:10}}>
    <div role="button" onClick={onClick} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:"#888888",letterSpacing:"0.2em",textTransform:"uppercase",fontWeight:700,cursor:"pointer",userSelect:"none"}}>
      <span>{children}</span>
      <span style={{display:"inline-block",transform:aberto?"rotate(90deg)":"none",transition:"transform .15s",fontSize:9}}>▶</span>
    </div>
    {direita}
  </div>
);
function CardPrevisao({c, p, dias, destaque}) {
  const v = VISOES[c];
  const corV = x => x>=0 ? "#00875A" : "#B4483C";
  const L = ({l, val, cor, nota}) => (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",padding:"5px 0",gap:8}}>
      <span style={{fontSize:12,color:"#666666",fontWeight:600}}>{l}{nota&&<span style={{fontSize:9.5,color:"#A6822E",fontWeight:700}}> · {nota}</span>}</span>
      <span style={{fontSize:13,fontWeight:800,color:cor||"#1A1A1A",whiteSpace:"nowrap"}}>{val}</span>
    </div>
  );
  return (
    <div style={{background:"#fff",borderRadius:14,padding:"12px 16px",boxShadow:"0 2px 8px #1A1A1A10",marginBottom:10,border:destaque?"2px solid #1A1A1A":"none"}}>
      <div style={{fontSize:10,fontWeight:800,letterSpacing:"0.12em",textTransform:"uppercase",color:v.cor,marginBottom:4}}>{v.nome}</div>
      <L l="Saldo registrado hoje" val={fmt(p.saldoHoje)} cor={corV(p.saldoHoje)}/>
      <L l={`Contas programadas (${p.nProg})`} val={`− ${fmt(p.saidas)}`} cor="#8A3A30"/>
      {p.entradasProg>0&&<L l={`Receitas a receber (${p.nRecProg})`} val={`+ ${fmt(p.entradasProg)}`} cor="#00704B"/>}
      {p.transf!==0&&<L l="Transferências programadas" val={`${p.transf>0?"+":"−"} ${fmt(Math.abs(p.transf))}`}/>}
      <div style={{borderTop:"1px solid #EEEEEE",margin:"4px 0"}}/>
      <L l={`Em ${dias} dias, só com o já lançado`} val={fmt(p.semEstimativa)} cor={corV(p.semEstimativa)}/>
      <L l="Entradas estimadas" nota="estimativa" val={`+ ${fmt(p.entradasEst)}`} cor="#00704B"/>
      <L l={`Em ${dias} dias, com estimativa`} nota="estimativa" val={fmt(p.comEstimativa)} cor={corV(p.comEstimativa)}/>
      {p.baseDias>0&&<div style={{fontSize:9.5,color:"#888888",marginTop:4,fontWeight:600}}>Estimativa = média diária de receita dos últimos {p.baseDias} dia{p.baseDias>1?"s":""}, descontando o que já está a receber.</div>}
    </div>
  );
}
function PainelAlertas({alertas, onClose, onIgnorar, onExecutei, nIgnorados, onRestaurar}) {
  const NIV = [{t:"Info",c:"#2F65AC",f:"#EEF3FB"},{t:"Atenção",c:"#A6822E",f:"#FBF3E4"},{t:"Crítico",c:"#B4483C",f:"#FBECEA"}];
  const lados = ["empresa","pessoal"].map(c=>({ c, v:VISOES[c], lista:alertas.filter(a=>a.centro===c) }));
  return (
    <Modal onClose={onClose}>
      <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A",marginBottom:2}}>Alertas</div>
      <div style={{fontSize:11,color:"#888888",marginBottom:12}}>Sempre mostra a Pico Barbershop e o Isaque, independente do perfil selecionado.</div>
      <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:8,marginBottom:14}}>
        {lados.map(({c,v,lista})=>{ const crit=lista.some(a=>a.nivel===2); return (
          <div key={c} style={{background:v.fundo,border:`1px solid ${v.cor}33`,borderRadius:12,padding:"10px 12px"}}>
            <div style={{fontSize:11,fontWeight:800,color:v.cor}}>{v.nome}</div>
            <div style={{fontSize:18,fontWeight:800,color:lista.length?(crit?"#B4483C":"#A6822E"):"#00875A",marginTop:2}}>{lista.length?`${lista.length} alerta${lista.length>1?"s":""}`:"tudo ok ✅"}</div>
          </div>
        );})}
      </div>
      {lados.map(({c,v,lista})=>(
        <div key={c} style={{marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{width:22,height:22,borderRadius:"50%",background:v.cor,color:"#fff",fontSize:11,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{v.ini}</span>
            <span style={{fontSize:13,fontWeight:800,color:"#1A1A1A"}}>{v.nome}</span>
            <span style={{fontSize:11,color:"#888888",fontWeight:700}}>· {lista.length||"nenhum"} alerta{lista.length===1?"":"s"}</span>
          </div>
          {lista.length===0
            ?<div style={{fontSize:12,color:"#00704B",fontWeight:700,background:"#E6F4EE",borderRadius:10,padding:"10px 12px"}}>Nada pendente para {c==="empresa"?"a":"o"} {v.nome} agora.</div>
            :lista.map((a,i)=>{ const n=NIV[a.nivel]; return (
              <div key={i} style={{background:n.f,border:`1px solid ${n.c}33`,borderLeft:`4px solid ${v.cor}`,borderRadius:12,padding:"12px 14px",marginBottom:8}}>
                <div style={{display:"flex",gap:6,alignItems:"flex-start",marginBottom:6,flexWrap:"wrap"}}>
                  <span className="badge" style={{marginTop:1,background:n.c,color:"#fff",border:"none"}}>{n.t}</span>
                  <span className="badge" style={{marginTop:1,background:"#fff",color:v.cor,border:`1px solid ${v.cor}55`}}>{v.curto}</span>
                  <span style={{fontSize:13,fontWeight:800,color:"#1A1A1A",lineHeight:1.3,flexBasis:"100%"}}>{a.titulo}</span>
                </div>
                <div style={{fontSize:11.5,color:"#444",lineHeight:1.45}}><b>Motivo:</b> {a.motivo}</div>
                <div style={{fontSize:11.5,color:"#444",lineHeight:1.45}}><b>Impacto:</b> {a.impacto}</div>
                <div style={{fontSize:11.5,color:n.c,lineHeight:1.45,fontWeight:700,marginTop:2}}>→ {a.acao}</div>
                {(onIgnorar||onExecutei)&&<div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                  {a.ids&&onExecutei&&<button onClick={()=>onExecutei(a)} style={{background:"#E6F4EE",border:"1px solid #B5DCCB",color:"#00704B",borderRadius:8,fontSize:11,fontWeight:800,padding:"6px 10px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>✓ Já executei</button>}
                  {onIgnorar&&<button onClick={()=>onIgnorar(a)} style={{background:"#fff",border:"1px solid #E0E0E0",color:"#666666",borderRadius:8,fontSize:11,fontWeight:800,padding:"6px 10px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>Tirar alerta</button>}
                </div>}
              </div>
            );})}
        </div>
      ))}
      {nIgnorados>0&&onRestaurar&&<button className="btn-ghost" onClick={onRestaurar}>Restaurar {nIgnorados} alerta{nIgnorados>1?"s":""} retirado{nIgnorados>1?"s":""}</button>}
      <button className="btn-ghost" onClick={onClose}>Fechar</button>
    </Modal>
  );
}

const INIT_STATE = Object.fromEntries(MESES.map(m=>[m.mes,[]]));
const INIT_RECEITAS = Object.fromEntries(MESES.map(m=>[m.mes,[]]));

export default function App() {
  const idxHoje = MESES.findIndex(m => m.mes === hoje().slice(0,7));
  const [mesIdx,setMesIdx]                 = useState(idxHoje >= 0 ? idxHoje : 0);
  const [allItems,setAllItems]             = useState(INIT_STATE);
  const [allReceitas,setAllReceitas]       = useState(INIT_RECEITAS);
  const [loading,setLoading]               = useState(true);
  const [lastSync,setLastSync]             = useState(null);
  const [,forceCatUpdate]                  = useState(0);
  const [view,setView]                     = useState("caixa");
  const [visao,setVisaoSt]                 = useState(lerVisao);
  const [menuVisao,setMenuVisao]           = useState(false);
  const setVisao = v => { setVisaoSt(v); setMenuVisao(false); try { localStorage.setItem(VISAO_KEY,v); } catch {} };
  const nv = useCallback(x=>naVisao(visao,x),[visao]);
  const centroPadrao = visao==="ambos" ? "empresa" : visao;   // novo lançamento já abre no centro da visão
  const rotVisao = ` · ${VISOES[visao].nome}`;
  const [showPicker,setShowPicker]         = useState(false);
  const [showForm,setShowForm]             = useState(false);
  const [showFormReceita,setShowFormReceita]=useState(false);
  const [editItem,setEditItem]             = useState(null);
  const [delItem,setDelItem]               = useState(null);
  const [delReceita,setDelReceita]         = useState(null);
  const [editReceita,setEditReceita]       = useState(null);
  const [catAberta,setCatAberta]           = useState(null);
  const [busca,setBusca]                   = useState("");
  const [histTab,setHistTab]               = useState("exec");
  const [popProg,setPopProg]               = useState(false);
  const [acaoItem,setAcaoItem]             = useState(null);
  const [acaoReceita,setAcaoReceita]       = useState(null);
  const [ctx,setCtx]                       = useState(null);
  const [progMode,setProgMode]             = useState(false);
  const [recAberto,setRecAberto]           = useState(false);
  const [extAberto,setExtAberto]           = useState(false);
  const lastTouch = useRef(0);
  const abertoEm = useRef(0);
  const pressTimer = useRef(null);
  const [fluxoAberto,setFluxoAberto]       = useState(false);
  const [motivoExc,setMotivoExc]           = useState("");
  const [motivoErr,setMotivoErr]           = useState(false);
  const [form,setForm]                     = useState(emptyForm());
  const [formReceita,setFormReceita]       = useState(emptyFormReceita());
  const [erro,setErro]                     = useState({});
  const [erroReceita,setErroReceita]       = useState({});
  const [toast,setToast]                   = useState(null);
  const [glob,setGlob]                     = useState({ l:[], r:[], t:[] });
  const [transfRaw,setTransfRaw]           = useState([]);
  const [metas,setMetas]                   = useState([]);
  const [formTransf,setFormTransf]         = useState(null);   // {item?, f:{...}}
  const [formMeta,setFormMeta]             = useState(null);
  const [metaTab,setMetaTab]               = useState("andamento");   // andamento | realizadas | nova
  const [formCat,setFormCat]               = useState(null);
  const [delGen,setDelGen]                 = useState(null);   // {kind:"transf"|"meta", item}
  const [acaoGen,setAcaoGen]               = useState(null);
  const [showAlertas,setShowAlertas]       = useState(false);
  const [prevDias,setPrevDias]             = useState(30);
  const [prevAberto,setPrevAberto]         = useState(false);
  const [trAberto,setTrAberto]             = useState(false);
  const [gerCatAberto,setGerCatAberto]     = useState(false);
  const [erroGen,setErroGen]               = useState({});
  const mesAtual  = MESES[mesIdx];
  const mesAnt    = mesIdx>0?MESES[mesIdx-1]:null;
  const isFechado = mesAtual.fechado;
  const items     = useMemo(()=>(allItems[mesAtual.mes]||[]).filter(nv),[allItems,mesAtual.mes,nv]);
  const itemsAnt  = useMemo(()=>mesAnt?(allItems[mesAnt.mes]||[]).filter(nv):[],[allItems,mesAnt,nv]);
  const receitasTodas = useMemo(()=>(allReceitas[mesAtual.mes]||[]).filter(nv),[allReceitas,mesAtual.mes,nv]);
  const receitasAtivas = useMemo(()=>receitasTodas.filter(r=>!r.excluido),[receitasTodas]);
  const receitas  = useMemo(()=>receitasAtivas.filter(r=>!recProg(r)),[receitasAtivas]);       // entram no caixa
  const receitasProg = useMemo(()=>receitasAtivas.filter(recProg),[receitasAtivas]);          // a receber
  const totalReceitaProg = receitasProg.reduce((s,r)=>s+r.valor,0);

  // Dados de todo o período (início até +3 meses): previsão, metas, alertas e transferências
  const loadGlobal = useCallback(async () => {
    const [g, tRaw, mt] = await Promise.all([
      fetchRange(MES_INICIO, mAdd(hoje().slice(0,7), 3)),
      tbGet("transferencias", "order=data.desc"),
      tbGet("metas", "order=criado_em.asc"),
    ]);
    if (!g.falhou) setGlob({ l:g.l, r:g.r, t:(tRaw||[]).filter(x=>!x.excluido) });
    if (tRaw) setTransfRaw(tRaw);
    if (mt) setMetas(mt.filter(x=>!x.excluido));
  }, []);
  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    const [dAtual, dAnt, rAtual] = await Promise.all([
      sbGet(mesAtual.mes),
      mesAnt ? sbGet(mesAnt.mes) : Promise.resolve([]),
      rcGet(mesAtual.mes),
    ]);
    setAllItems(p => ({...p, ...(dAtual ? {[mesAtual.mes]: dAtual} : {}), ...(mesAnt && dAnt ? {[mesAnt.mes]: dAnt} : {})}));
    if (rAtual) setAllReceitas(p => ({...p, [mesAtual.mes]: rAtual}));
    if (dAtual && rAtual) setLastSync(new Date());
    if (!silent) { setLoading(false); loadGlobal(); }
  }, [mesAtual.mes, mesAnt, loadGlobal]);

  const modalNovo = !!formTransf || !!formCat || !!delGen || !!acaoGen || showAlertas;
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (showForm || showFormReceita || editItem || delItem || delReceita || editReceita || acaoItem || acaoReceita || ctx || modalNovo) return;
    const t = setInterval(() => load(true), 5000);
    const tg = setInterval(() => loadGlobal(), 30000);
    return () => { clearInterval(t); clearInterval(tg); };
  }, [load, loadGlobal, showForm, showFormReceita, editItem, delItem, delReceita, editReceita, acaoItem, acaoReceita, ctx, modalNovo]);

  const carregarCats = useCallback(() => fetchCategorias().then(res => {
    if (res && res.length > 0) { aplicarCategorias(res); forceCatUpdate(v => v + 1); }
  }), []);
  useEffect(() => { carregarCats(); }, [carregarCats]);

  const ativos     = useMemo(()=>items.filter(t=>!t.excluido),[items]);
  const contaveis  = useMemo(()=>ativos.filter(t=>!isLiq(t) && t.data<=hoje()),[ativos]);
  const total      = useMemo(()=>contaveis.reduce((s,t)=>s+t.valor,0),[contaveis]);
  const agendados  = useMemo(()=>ativos.filter(t=>!isLiq(t) && t.data>hoje()),[ativos]);   // só o que ainda vai ser executado
  const totalAgendado = useMemo(()=>agendados.reduce((s,t)=>s+t.valor,0),[agendados]);
  const totalProgramado = total + totalAgendado;
  const totalReceita = useMemo(()=>receitas.reduce((s,r)=>s+r.valor,0),[receitas]);
  // Transferências PJ → PF do mês (todas, inclusive excluídas, para a lista)
  const transfMesTodas = useMemo(()=>transfRaw.filter(t=>t.mes===mesAtual.mes).sort((x,y)=>(!!x.excluido-!!y.excluido)||y.data.localeCompare(x.data)),[transfRaw,mesAtual.mes]);
  const transfMes   = useMemo(()=>transfMesTodas.filter(t=>!t.excluido&&t.data<=hoje()),[transfMesTodas]);
  const totalTransf = useMemo(()=>transfMes.reduce((s,t)=>s+t.valor,0),[transfMes]);
  const efTransf    = efeitoTransf(visao, totalTransf);
  const saldo        = totalReceita - total + efTransf;
  // Consolidado: saldo de cada lado, sem misturar o caixa da empresa com o pessoal
  const saldosCentro = useMemo(()=>{
    const r = c => receitas.filter(x=>centroDe(x)===c).reduce((s,x)=>s+x.valor,0);
    const d = c => contaveis.filter(x=>centroDe(x)===c).reduce((s,x)=>s+x.valor,0);
    return { empresa: r("empresa")-d("empresa")-totalTransf, pessoal: r("pessoal")-d("pessoal")+totalTransf };
  },[receitas,contaveis,totalTransf]);
  const [ignorados,setIgnorados] = useState(()=>{ try{ const a=JSON.parse(localStorage.getItem("pico_alertas_ignorados")||"[]"); return Array.isArray(a)?a:[]; }catch{ return []; } });
  const salvaIgn = lista => { const l=lista.slice(-200); setIgnorados(l); try{ localStorage.setItem("pico_alertas_ignorados", JSON.stringify(l)); }catch{} };
  const alertas   = useMemo(()=>gerarAlertas(glob, metas).filter(a=>!ignorados.includes(a.key)),[glob,metas,ignorados]);   // sempre Pico Barbershop + Isaque
  const nivelAlerta = alertas.reduce((m,a)=>Math.max(m,a.nivel),0);
  const prevs     = useMemo(()=>(visao==="ambos"?["empresa","pessoal","ambos"]:[visao]).map(c=>({c, p:previsao(glob,c,prevDias)})),[glob,visao,prevDias]);
  // Corte do comparativo: mês corrente = até hoje; mês passado = mês inteiro; mês futuro = sem comparativo
  const maxDia     = useMemo(()=>{const h=hoje(),mh=h.slice(0,7);if(mesAtual.mes===mh)return parseInt(h.slice(8,10),10);return mesAtual.mes<mh?31:0;},[mesAtual.mes]);
  const totalAnt   = useMemo(()=>soma(itemsAnt.filter(t=>parseInt(t.data.slice(8,10))<=maxDia)),[itemsAnt,maxDia]);
  const sorted     = useMemo(()=>[...items].sort((a,b)=>new Date(b.data)-new Date(a.data)),[items]);
  const sortedReceitas = useMemo(()=>[...receitasTodas].sort((a,b)=>(!!a.excluido-!!b.excluido)||(new Date(b.semana)-new Date(a.semana))),[receitasTodas]);
  const byCat      = useMemo(()=>{
    const m={};
    contaveis.forEach(t=>{m[t.categoria]=(m[t.categoria]||0)+t.valor;});
    return Object.entries(m).map(([cat,val])=>({cat,val})).sort((a,b)=>b.val-a.val);
  },[contaveis]);
  const fluxoSemanal = useMemo(()=>{
    const semanas = semanasDoMes(mesAtual.mes);
    return semanas.map(sem=>{
      const rec = receitas.filter(r=>{
        const d=parseInt(r.semana.slice(8,10));
        return d>=sem.ini && d<=sem.fim;
      }).reduce((s,r)=>s+r.valor,0);
      const desp = contaveis.filter(t=>{
        const d=parseInt(t.data.slice(8,10));
        return d>=sem.ini && d<=sem.fim;
      }).reduce((s,t)=>s+t.valor,0);
      const tr = transfMes.filter(t=>{ const d=parseInt(t.data.slice(8,10)); return d>=sem.ini && d<=sem.fim; }).reduce((s,t)=>s+efeitoTransf(visao,t.valor),0);
      const r2 = rec + Math.max(tr,0), d2 = desp + Math.max(-tr,0);
      return {...sem, receita:r2, despesa:d2, saldo:r2-d2};
    });
  },[receitas,contaveis,mesAtual.mes,transfMes,visao]);

  const showToast=msg=>{setToast(msg);setTimeout(()=>setToast(null),2500);};
  const goMes=dir=>{setMesIdx(i=>i+dir);setShowPicker(false);};

  const validar=f=>{
    const e={};
    if(!f.descricao.trim())                            e.descricao    ="Campo obrigatório";
    if(!f.valorDigits||parseInt(f.valorDigits)===0)    e.valor        ="Campo obrigatório";
    if(!f.categoria)                                   e.categoria    ="Selecione uma categoria";
    if(!f.meio)                                        e.meio         ="Selecione o meio de pagamento";
    if(!f.data)                                        e.data         ="Campo obrigatório";
    if(f.recorrente){
      const n=parseInt(f.repeticoes,10);
      if(!n||n<1||n>60)                                e.repeticoes   ="Informe de 1 a 60 meses";
    }
    return e;
  };
  const validarReceita=f=>{
    const e={};
    if(!f.descricao.trim())                            e.descricao ="Campo obrigatório";
    if(!f.valorDigits||parseInt(f.valorDigits)===0)    e.valor     ="Campo obrigatório";
    if(!f.data)                                        e.data      ="Campo obrigatório";
    if(f.dataAte&&f.data&&f.dataAte<f.data)            e.dataAte   ="Deve ser igual ou depois da data inicial";
    return e;
  };
  const lancar=async ()=>{
    const e=validar(form);
    if(Object.keys(e).length){setErro(e);return;}
    const valor = d2float(form.valorDigits);
    const item = {
      id: uid(), cliente_id: CID, mes: form.data.slice(0,7), centro: form.centro||"empresa",
      categoria: form.categoria, descricao: form.descricao.trim(), valor,
      meio: form.meio, data: form.data, obs: form.obs, excluido: false,
      recorrente: !!form.recorrente, motivo_exclusao: "", programado: form.data>hoje(), meta_id: form.meta_id||null,
    };
    const res = await sbPost(item);
    setShowForm(false);
    if(!res) return;
    let extras = 0;
    if(form.recorrente){
      const n = parseInt(form.repeticoes,10);
      const novas = [];
      for(let i=1;i<=n;i++){
        const dt = addMesesData(form.data, i);
        novas.push({...item, id: uid(), mes: dt.slice(0,7), data: dt, programado: dt>hoje()});
      }
      const resultados = await Promise.all(novas.map(x=>sbPost(x)));
      extras = resultados.filter(Boolean).length;
    }
    load();
    showToast((form.recorrente ? `✓ Registrado + ${extras} recorrência${extras===1?"":"s"}` : "✓ Lançamento registrado")+foraDaVisao(item.centro));
  };
  // Aviso quando o registro vai para o outro centro e some da visão atual
  const foraDaVisao = c => visao!=="ambos" && (c||"empresa")!==visao ? ` · ${VISOES[c||"empresa"].nome}` : "";
  const lancarReceita=async ()=>{
    const e=validarReceita(formReceita);
    if(Object.keys(e).length){setErroReceita(e);return;}
    const payload={
      id: uid(), cliente_id: CID, mes: formReceita.data.slice(0,7), semana: formReceita.data,
      data_de: formReceita.data, data_ate: formReceita.dataAte||formReceita.data,
      valor: d2float(formReceita.valorDigits), descricao: formReceita.descricao.trim(),
      obs: formReceita.obs, data_lancamento: hoje(), centro: formReceita.centro||"empresa",
    };
    const res = await rcPostC(payload);
    setShowFormReceita(false);
    if(res){ load(); showToast("✓ Receita registrada"+foraDaVisao(payload.centro)); }
  };
  const openEdit=item=>{
    setForm({centro:item.centro||"empresa",descricao:item.descricao,valorDigits:float2d(item.valor),categoria:item.categoria,meio:item.meio,data:item.data,obs:item.obs||"",meta_id:item.meta_id||""});
    setErro({});setEditItem(item);
  };
  const salvarEdicao=async ()=>{
    const e=validar(form);
    if(Object.keys(e).length){setErro(e);return;}
    const ok = await sbPatch(editItem.id, {
      descricao: form.descricao.trim(), valor: d2float(form.valorDigits),
      categoria: form.categoria, meio: form.meio, data: form.data, centro: form.centro||"empresa",
      mes: form.data.slice(0,7), obs: form.obs,
      programado: form.data>hoje() || (editItem.programado===true && form.data===editItem.data), meta_id: form.meta_id||null,
    });
    setEditItem(null);
    if(ok){ load(); showToast("✓ Lançamento atualizado"+foraDaVisao(form.centro)); }
  };
  const confirmarExclusao=async ()=>{
    if(!motivoExc.trim()){setMotivoErr(true);return;}
    const ok = await sbPatch(delItem.id, { excluido: true, motivo_exclusao: motivoExc.trim() });
    setDelItem(null);setMotivoExc("");setMotivoErr(false);
    if(ok){ load(); showToast("Lançamento excluído"); }
  };
  useEffect(()=>{
    const h=e=>{
      if(e.key!=="Escape") return;
      setShowForm(false);setShowFormReceita(false);setEditItem(null);setDelItem(null);setMotivoExc("");setMotivoErr(false);
      setDelReceita(null);setEditReceita(null);setAcaoItem(null);setAcaoReceita(null);setPopProg(false);setCtx(null);
      setShowPicker(false);setMenuVisao(false);
      setFormTransf(null);setFormMeta(null);setFormCat(null);setDelGen(null);setAcaoGen(null);setShowAlertas(false);
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[]);
  const programarDespesa=()=>{
    setPopProg(false);setProgMode(true);
    setForm({...emptyForm(),centro:centroPadrao,data:amanha()});setErro({});setShowForm(true);
  };
  const receberHoje=async r=>{
    const h=hoje(), ate=r.data_ate&&r.data_ate>h?r.data_ate:h;
    const ok = await rcPatch(r.id, { data_de:h, semana:h, data_ate:ate, mes:h.slice(0,7) });
    if(ok){ load(); showToast("✓ Marcada como recebida"); }
  };
  const provisionar=async t=>{
    const ok = await sbPatch(t.id, { data: hoje(), mes: hoje().slice(0,7), programado: false });
    if(ok){ load(); showToast("✓ Movido para executado"); }
  };
  const openEditReceita=r=>{
    setFormReceita({centro:centroDe(r),descricao:r.descricao||"",valorDigits:float2d(r.valor),data:r.data_de||r.semana||"",dataAte:(r.data_ate&&r.data_ate!==(r.data_de||r.semana))?r.data_ate:"",obs:r.obs||""});
    setErroReceita({});setEditReceita(r);
  };
  const salvarEdicaoReceita=async ()=>{
    const e=validarReceita(formReceita);
    if(Object.keys(e).length){setErroReceita(e);return;}
    const ok = await rcPatchC(editReceita.id, {
      descricao: formReceita.descricao.trim(), valor: d2float(formReceita.valorDigits),
      semana: formReceita.data, data_de: formReceita.data, data_ate: formReceita.dataAte||formReceita.data,
      mes: formReceita.data.slice(0,7), obs: formReceita.obs, centro: formReceita.centro||"empresa",
    });
    setEditReceita(null);
    if(ok){ load(); showToast("✓ Receita atualizada"+foraDaVisao(formReceita.centro)); }
  };
  const normTxt=x=>String(x||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  // ─── Transferências PJ → PF ───
  const novaTransf = () => { setErroGen({}); setFormTransf({ f:{ tipo:"pro_labore", valorDigits:"", data:hoje(), descricao:"", obs:"" } }); };
  const editarTransf = t => { setErroGen({}); setFormTransf({ item:t, f:{ tipo:t.tipo||"pro_labore", valorDigits:float2d(t.valor), data:t.data, descricao:t.descricao||"", obs:t.obs||"" } }); };
  const salvarTransf = async () => {
    const f=formTransf.f, e={};
    if(!f.valorDigits||parseInt(f.valorDigits)===0) e.valor="Campo obrigatório";
    if(!f.data) e.data="Campo obrigatório";
    if(Object.keys(e).length){ setErroGen(e); return; }
    const body = { valor:d2float(f.valorDigits), data:f.data, mes:f.data.slice(0,7), tipo:f.tipo, descricao:f.descricao.trim()||TIPOS_TRANSF[f.tipo], obs:f.obs };
    const ed = formTransf.item;
    const ok = ed ? await tbPatch("transferencias", ed.id, body)
                  : !!(await tbPost("transferencias", { ...body, id:uid(), cliente_id:CID, excluido:false, motivo_exclusao:"" }));
    setFormTransf(null);
    if(ok){ load(); showToast(ed?"✓ Transferência atualizada":"✓ Transferência registrada"); }
    else showToast("⚠ Não salvou — falta criar a tabela no Supabase");
  };
  const executarTransf = async t => { if(await tbPatch("transferencias", t.id, { data:hoje(), mes:hoje().slice(0,7) })){ load(); showToast("✓ Movido para executado"); } };

  // ─── Metas ───
  const baseMeta = grupo => ({ grupo, tipo: grupo==="financeira"?"faturamento":"objetiva", medidores: grupo==="objetiva"?["quantidade"]:[],
    nome:"", descricao:"", centro:centroPadrao, categoria:"", unidade:"",
    iniDigits:"", alvoDigits:"", atualDigits:"", parcelas:"", parcPagas:"", qtdItens:[], qi:{...qiVazio}, etapas:[], novaEtapa:"", cal_freq:"diario", cal_vezes:"3", data_inicio:hoje(), prazo:"" });
  const novaMeta = grupo => { setErroGen({}); setFormMeta({ f: baseMeta(grupo) }); };
  const editarMeta = m => {
    const t=tipoMeta(m.tipo), g=TIPOS_META[t].grupo, n=x=>Number(x)||0, md=medidoresDe(m);
    setErroGen({}); setMetaTab("nova");
    setFormMeta({ item:m, f:{ ...baseMeta(g), tipo:t, medidores: g==="objetiva"?(md.length?md:["quantidade"]):[], nome:m.nome||"", descricao:m.descricao||"", centro:m.centro||"empresa", categoria:m.categoria||"", unidade:m.unidade||"",
      iniDigits:n(m.valor_inicial)?float2d(n(m.valor_inicial)):"", alvoDigits:g==="financeira"&&n(m.valor_alvo)?float2d(n(m.valor_alvo)):"", atualDigits:t==="valor"&&n(m.valor_atual)?float2d(n(m.valor_atual)):"",
      parcelas:m.parcelas?String(m.parcelas):"", parcPagas:m.parc_pagas!=null?String(m.parc_pagas):"", qtdItens: md.includes("quantidade") ? qtdItens(m).map(it=>({...it,id:it.id==="legacy"?uid():it.id})) : [], etapas:lerEtapas(m),
      cal_freq:m.cal_freq||"diario", cal_vezes:String(m.cal_vezes||3), data_inicio:m.data_inicio||hoje(), prazo:m.prazo||"" } });
  };
  const salvarMeta = async () => {
    const f=formMeta.f, T=TIPOS_META[f.tipo], e={}, obj=f.tipo==="objetiva", md=obj?f.medidores:[];
    if(!f.nome.trim()) e.nome="Dê um nome para a meta";
    if(T.grupo==="financeira" && (!f.alvoDigits||parseInt(f.alvoDigits)===0)) e.alvo="Informe o valor";
    if(obj && md.length===0) e.medidores="Escolha pelo menos um medidor";
    if(md.includes("quantidade") && itensDoForm(f).length===0) e.alvoQtd="Informe o alvo e toque em Adicionar";
    if(md.includes("etapas") && f.etapas.length===0) e.etapas="Adicione pelo menos uma etapa";
    if(md.includes("calendario") && f.cal_freq==="semana" && !(parseInt(f.cal_vezes)>=1&&parseInt(f.cal_vezes)<=7)) e.cal_vezes="De 1 a 7 vezes";
    if(md.includes("calendario") && f.cal_freq==="periodo"){ const nd=(f.data_inicio&&f.prazo&&f.prazo>=f.data_inicio)?diasEntre(f.data_inicio,f.prazo)+1:0;
      if(!(parseInt(f.cal_vezes)>=1)) e.cal_vezes="Informe quantos dias"; else if(nd&&parseInt(f.cal_vezes)>nd) e.cal_vezes=`O período tem só ${nd} dias`; }
    const pat = f.tipo==="patrimonio";
    if(pat && f.parcPagas!=="" && parseInt(f.parcPagas)>parseInt(f.parcelas)) e.parcPagas="Não pode passar do total de parcelas";
    if(pat && !(parseInt(f.parcelas)>=1 && parseInt(f.parcelas)<=480)) e.parcelas="Informe as parcelas (1 a 480)";
    if(pat && d2float(f.iniDigits)>=d2float(f.alvoDigits) && d2float(f.alvoDigits)>0) e.ini="A entrada deve ser menor que o valor do patrimônio";
    if(pat && !f.data_inicio) e.data_inicio="Informe o vencimento da 1ª parcela";
    if(!T.mensal && !pat && !f.prazo) e.prazo="Defina um prazo";
    if((f.tipo==="acumular"||md.includes("calendario")) && !f.data_inicio) e.data_inicio="Informe o início";
    if(!pat && f.prazo && f.data_inicio && f.prazo<f.data_inicio) e.prazo="O prazo deve ser depois do início";
    if(Object.keys(e).length){ setErroGen(e); return; }
    const ed = formMeta.item;
    const body = { nome:f.nome.trim(), descricao:f.descricao.trim(), grupo:T.grupo, tipo:f.tipo, centro:f.centro,
      categoria: f.tipo==="limite"&&f.categoria ? f.categoria : null, unidade: pat ? (BENS[f.unidade]?f.unidade:"veiculo") : null,
      parcelas: pat ? parseInt(f.parcelas,10) : null,
      parc_pagas: pat ? Math.min(parseInt(f.parcelas,10)||0, f.parcPagas!=="" ? (parseInt(f.parcPagas,10)||0) : decorridas(f.data_inicio, parseInt(f.parcelas,10)||0)) : null,
      valor_inicial: (f.tipo==="acumular"||pat) ? d2float(f.iniDigits) : 0,
      valor_alvo: T.grupo==="financeira" ? d2float(f.alvoDigits) : 0,
      valor_atual: f.tipo==="valor" ? d2float(f.atualDigits) : 0,
      medidores: obj ? md : null, qtd_itens: md.includes("quantidade") ? itensDoForm(f).map(it=>({...it,id:it.id==="rasc"?uid():it.id})) : null, qtd_per: null, qtd_log: null,
      etapas: md.includes("etapas") ? f.etapas.map(x=>({t:x.t,ok:!!x.ok})) : null,
      cal_freq: md.includes("calendario") ? f.cal_freq : null, cal_vezes: md.includes("calendario")&&(f.cal_freq==="semana"||f.cal_freq==="periodo") ? parseInt(f.cal_vezes,10) : null,
      data_inicio: T.mensal ? null : (f.data_inicio||null), prazo: T.mensal ? null : pat ? addMesesData(f.data_inicio, parseInt(f.parcelas,10)-1) : (f.prazo||null) };
    if (!ed && md.includes("calendario")) body.checkins = [];
    // Já salva como realizada se tudo estiver em 100%
    const prov = progMeta({ ...(ed||{}), ...body, checkins: ed ? ed.checkins : [], criado_em: ed?.criado_em || new Date().toISOString() }, glob);
    if (!T.auto && prov.pct>=1 && !(ed&&ed.concluida_em)) body.concluida_em = hoje();
    const ok = ed ? await tbPatch("metas", ed.id, body)
                  : !!(await tbPost("metas", { ...body, id:uid(), cliente_id:CID, excluido:false, motivo_exclusao:"", concluida_em: body.concluida_em||null, criado_em:new Date().toISOString() }));
    if(ok){ setFormMeta(null); setMetaTab("andamento"); loadGlobal(); showToast(ed?"✓ Meta atualizada":"🎯 Meta criada — bora!"); }
    else showToast("⚠ Não salvou — rode o SQL das metas (sql-metas-colunas.sql e sql-patrimonio.sql)");
  };
  // Atualização rápida no próprio cartão (otimista: muda na tela e grava em seguida)
  const patchMetaLocal = async (m, body, msgFeita) => {
    const novo = { ...m, ...body };
    setMetas(ms => ms.map(x => x.id===m.id ? novo : x));
    const ok = await tbPatch("metas", m.id, body);
    if(!ok){ setMetas(ms => ms.map(x => x.id===m.id ? m : x)); showToast("⚠ Não salvou"); return; }
    const depois = progMeta(novo, glob);
    if(!m.concluida_em && !depois.mensal && !depois.recorr && depois.pct>=1){
      await tbPatch("metas", m.id, { concluida_em: hoje() });
      setMetas(ms => ms.map(x => x.id===m.id ? { ...novo, concluida_em: hoje() } : x));
      showToast("🏆 Meta realizada! Parabéns!");
    } else if (msgFeita) showToast(msgFeita);
  };
  const ajustarQtd = (m, d, id) => {
    const arr = lerJson(m.qtd_itens, []);
    if (Array.isArray(arr) && arr.length) {
      const hj = hoje(), it = arr.find(x=>x.id===id) || arr[0];
      const it2 = (QTD_PER[it.per]&&it.per!=="total")
        ? { ...it, log:{ ...(it.log||{}), [hj]: Math.max(0,(Number(it.log&&it.log[hj])||0)+d) } }
        : { ...it, atual: Math.max(0,(Number(it.atual)||0)+d) };
      const antes = progItemQtd(it,arr).pct, depois = progItemQtd(it2,arr).pct;
      patchMetaLocal(m, { qtd_itens: arr.map(x=>x===it?it2:x) }, antes<1&&depois>=1 ? "✅ Meta batida!" : null);
      return;
    }
    // metas antigas (uma quantidade só, nos campos antigos)
    if (qtdPer(m)==="total") { const v = Math.max(0, (Number(m.valor_atual)||0) + d); patchMetaLocal(m, { valor_atual: v }); return; }
    const l=lerLog(m), hj=hoje(), v=Math.max(0,(Number(l[hj])||0)+d), antes=progMeta(m,glob).pct;
    const novo={...m, qtd_log:{...l,[hj]:v}}, depois=progMeta(novo,glob).pct;
    patchMetaLocal(m, { qtd_log:{...l,[hj]:v} }, antes<1&&depois>=1 ? "✅ Meta do período batida!" : null);
  };
  const alternarDia = (m, d) => { const l=lerCheckins(m), tem=l.includes(d), nova = tem ? l.filter(x=>x!==d) : [...l, d].sort();
    patchMetaLocal(m, { checkins: nova }, tem ? null : (d===hoje() ? `🔥 Dia marcado! ${sequencia([...nova].filter(x=>x<=hoje()))} seguido(s)` : "✓ Dia marcado")); };
  const alternarEtapa = (m, i) => { const e = lerEtapas(m).map((x,k)=> k===i ? { ...x, ok:!x.ok } : x); patchMetaLocal(m, { etapas: e }, e[i].ok ? "✓ Etapa concluída" : null); };
  const concluirMeta = async m => { if(await tbPatch("metas", m.id, { concluida_em: hoje() })){ loadGlobal(); setMetaTab("realizadas"); showToast("🏆 Meta realizada! Parabéns!"); } };
  const reabrirMeta  = async m => { if(await tbPatch("metas", m.id, { concluida_em: null })){ loadGlobal(); setMetaTab("andamento"); showToast("Meta reaberta"); } };


  // ─── Categorias (inserir nova / editar cor e orçamento) ───
  const novaCat = () => { setErroGen({}); setFormCat({ f:{ nome:"", centro:centroPadrao } }); };
  const salvarCat = async () => {
    const f=formCat.f, e={};
    const nome=f.nome.trim().replace(/\s+/g," ");
    if(!nome) e.nome="Campo obrigatório";
    else if(CAT_ROWS.some(r=>normC(r.nome)===normC(nome)&&(r.centro||"ambos")===f.centro)) e.nome="Já existe essa categoria nesse centro";
    if(Object.keys(e).length){ setErroGen(e); return; }
    const ok = !!(await tbPost("categorias", { cliente_id:CID, nome, cor:corLivre(), centro:f.centro==="ambos"?null:f.centro }));
    setFormCat(null);
    if(ok){ await carregarCats(); showToast(`✓ Categoria "${nome}" criada`); }
    else showToast("⚠ Não salvou — verifique a permissão da tabela categorias");
  };

  // ─── Exclusão com motivo (transferência e meta) ───
  const confirmarDelGen = async () => {
    if(!motivoExc.trim()){ setMotivoErr(true); return; }
    const {kind,item} = delGen;
    const ok = await tbPatch(kind==="transf"?"transferencias":"metas", item.id, { excluido:true, motivo_exclusao:motivoExc.trim() });
    setDelGen(null); setMotivoExc(""); setMotivoErr(false);
    if(ok){ load(); showToast(kind==="transf"?"Transferência excluída":"Meta excluída"); }
  };

  const confirmarExclusaoReceita=async ()=>{
    if(!motivoExc.trim()){setMotivoErr(true);return;}
    const ok = await rcExcluir(delReceita.id, motivoExc.trim());
    setDelReceita(null);setMotivoExc("");setMotivoErr(false);
    if(ok){ load(); showToast("Receita excluída"); }
  };

  const anyModal=showForm||showFormReceita||!!editItem||!!delItem||!!delReceita||!!editReceita||popProg||!!acaoItem||!!acaoReceita||modalNovo;
  const card={background:"#fff",borderRadius:14,padding:"4px 16px",boxShadow:"0 2px 8px #1A1A1A10",marginBottom:12};
  const rowDiv=last=>({padding:"13px 0",borderBottom:last?"none":"1px solid #EEEEEE",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10});

  const abrirAcao=t=>{abertoEm.current=Date.now();setAcaoItem(t);};
  const abrirAcaoR=r=>{abertoEm.current=Date.now();setAcaoReceita(r);};
  const lpProps=(kind,x)=>({
    onContextMenu:e=>{
      e.preventDefault();clearTimeout(pressTimer.current);
      if(Date.now()-lastTouch.current<1500) return;
      setCtx({x:e.clientX,y:e.clientY,kind,item:x});
    },
    onTouchStart:()=>{lastTouch.current=Date.now();clearTimeout(pressTimer.current);pressTimer.current=setTimeout(()=>(kind==="lanc"?abrirAcao:abrirAcaoR)(x),500);},
    onTouchEnd:()=>clearTimeout(pressTimer.current),
    onTouchMove:()=>clearTimeout(pressTimer.current),
    onTouchCancel:()=>clearTimeout(pressTimer.current),
  });
  const LancRow=({t,last,limpo})=>(
    <div className={`row-item${t.excluido?" row-excluido":""}`}
      style={limpo&&!t.excluido&&!isFechado?{...rowDiv(last),userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none"}:rowDiv(last)}
      {...(limpo&&!t.excluido&&!isFechado?lpProps("lanc",t):{})}>
      <div style={{display:"flex",gap:10,alignItems:"center",flex:1,minWidth:0}}>
        <div style={{width:4,height:t.excluido?16:40,background:t.excluido?"#ddd":CAT_CORES[t.categoria]||"#999",borderRadius:3,flexShrink:0}}/>
        <div style={{minWidth:0}}>
          <div style={{fontSize:14,color:t.excluido?"#aaa":"#1A1A1A",fontWeight:700,fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textDecoration:t.excluido?"line-through":"none"}}>{t.descricao}</div>
          <div style={{display:"flex",gap:6,alignItems:"center",marginTop:2,flexWrap:"wrap"}}>
            <span style={{fontSize:11,color:"#888888",fontFamily:"'Inter',sans-serif"}}>{fmtDate(t.data)} · {t.categoria} · {t.meio}</span>
            {isLiq(t)&&!t.excluido&&<span className="badge" style={{background:"#FBF3E4",color:"#8A6A1F",border:"1px solid #EAD9AE"}}>Liquidação · não conta</span>}
            {t.meta_id&&!t.excluido&&(()=>{ const mm=metas.find(x=>x.id===t.meta_id); return mm?<span className="badge" style={{background:"#E6F4EE",color:"#00704B",border:"1px solid #B5DCCB"}}>{(BENS[mm.unidade]||BENS.outro).icone} {mm.nome}</span>:null; })()}
            {t.centro&&!t.excluido&&<span className="badge" style={{background:t.centro==="pessoal"?"#EEF3FB":"#FDECEC",color:t.centro==="pessoal"?"#2F65AC":"#CC0000",border:`1px solid ${t.centro==="pessoal"?"#C9D8EE":"#F2C4C4"}`}}>{t.centro==="pessoal"?VISOES.pessoal.curto:VISOES.empresa.curto}</span>}
          </div>
          {t.obs&&!t.excluido&&<div style={{fontSize:11,color:"#888888",marginTop:1,fontStyle:"italic",fontFamily:"'Inter',sans-serif"}}>{t.obs}</div>}
          {t.excluido&&<span className="badge" style={{background:"#FBECEA",color:"#B4483C",border:"1px solid #EBBDB6"}}>Valor excluído da soma de valores</span>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:15,fontWeight:800,color:t.excluido?"#bbb":"#1A1A1A",fontFamily:"'Inter',sans-serif"}}>{fmt(t.valor)}</div>
          {t.data>hoje()&&!t.excluido&&<div style={{fontSize:9.5,fontWeight:700,color:"#8A3A30",marginTop:2,fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap"}}>Agendado · {fmtDate(t.data)}</div>}
        </div>
        {!limpo&&!t.excluido&&!isFechado&&t.data>hoje()&&(
          <button onClick={()=>provisionar(t)} title="Mover para executado" style={{background:"#E6F4EE",border:"1px solid #B5DCCB",color:"#00704B",borderRadius:8,fontSize:10.5,fontWeight:700,padding:"5px 8px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>Executar</button>
        )}
        {!limpo&&!t.excluido&&!isFechado&&(
          <button className="icon-btn" onClick={()=>openEdit(t)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
  const ReceitaRow=({r,last})=>{
    const exc=!!r.excluido, ativo=!isFechado&&!exc;
    return (
    <div className={`row-item${exc?" row-excluido":""}`} style={ativo?{...rowDiv(last),userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none"}:rowDiv(last)} {...(ativo?lpProps("rec",r):{})}>
      <div style={{display:"flex",gap:10,alignItems:"center",flex:1,minWidth:0}}>
        <div style={{width:4,height:exc?16:40,background:exc?"#ddd":"#00875A",borderRadius:3,flexShrink:0}}/>
        <div style={{minWidth:0}}>
          <div style={{fontSize:14,color:exc?"#aaa":"#1A1A1A",fontWeight:700,fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textDecoration:exc?"line-through":"none"}}>{r.descricao}</div>
          <div style={{fontSize:11,color:"#888888",fontFamily:"'Inter',sans-serif",marginTop:2}}>{perRec(r)}</div>
          {r.obs&&!exc&&<div style={{fontSize:11,color:"#888888",marginTop:1,fontStyle:"italic",fontFamily:"'Inter',sans-serif"}}>{r.obs}</div>}
          {exc&&<span className="badge" style={{background:"#FBECEA",color:"#B4483C",border:"1px solid #EBBDB6"}}>Excluída{r.motivo_exclusao?` · ${r.motivo_exclusao}`:""}</span>}
        </div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:15,fontWeight:800,color:exc?"#bbb":recProg(r)?"#7FB8A0":"#00875A",fontFamily:"'Inter',sans-serif"}}>{fmt(r.valor)}</div>
          {!exc&&recProg(r)&&<div style={{fontSize:9.5,fontWeight:700,color:"#00704B",marginTop:2,whiteSpace:"nowrap"}}>A receber · {fmtDate(dataRec(r))}</div>}
        </div>
      </div>
    </div>
    );
  };

  return (
    <div style={{fontFamily:"'Inter',sans-serif",background:"#F5F5F5",minHeight:"100vh",color:"#1A1A1A",margin:"0 auto"}} className={`app-wrap${view==="relatorio"?" wide":""}`}>
      <style>{CSS}</style>
      <div style={{background:"#fff",borderBottom:"1px solid #E0E0E0",padding:"12px 20px 0",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 12px #1A1A1A10"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
          <Logo size={46}/>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A",lineHeight:1.1,fontFamily:"'Inter',sans-serif"}}>Pico Barber Shop</div>
            <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
              <span style={{fontSize:11,color:"#888888",letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:600}}>Olá, Isaque</span>
              {lastSync && (
                <span style={{display:"inline-flex",alignItems:"center",gap:4,background:"#E6F4EE",border:"1px solid #00875A33",borderRadius:16,padding:"2px 8px",fontSize:9,color:"#00875A",fontWeight:700,letterSpacing:"0.04em"}}>
                  <span style={{width:5,height:5,background:"#00875A",borderRadius:"50%"}}/>
                  {loading ? "Sync" : "Online"}
                </span>
              )}
            </div>
          </div>
          <button onClick={()=>setShowAlertas(true)} title="Alertas"
            style={{position:"relative",width:40,height:40,borderRadius:"50%",border:"2px solid #E0E0E0",background:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,color:"#1A1A1A"}}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
            {alertas.length>0&&<span style={{position:"absolute",top:-4,right:-4,minWidth:18,height:18,borderRadius:9,padding:"0 4px",background:nivelAlerta>=2?"#B4483C":"#A6822E",color:"#fff",fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid #fff"}}>{alertas.length}</span>}
          </button>
          <div style={{position:"relative",flexShrink:0}}>
            <button onClick={()=>setMenuVisao(o=>!o)} title="Trocar visualização"
              style={{display:"flex",alignItems:"center",gap:8,background:VISOES[visao].fundo,border:`2px solid ${VISOES[visao].cor}33`,borderRadius:50,padding:"4px 10px 4px 4px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
              <span style={{width:32,height:32,borderRadius:"50%",background:VISOES[visao].cor,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
              </span>
              <span style={{fontSize:12,fontWeight:800,color:VISOES[visao].cor,letterSpacing:"0.02em",whiteSpace:"nowrap"}}><span className="so-pc">{VISOES[visao].nome}</span><span className="so-cel">{VISOES[visao].curto}</span></span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={VISOES[visao].cor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {menuVisao&&(
              <>
                <div style={{position:"fixed",inset:0,zIndex:299}} onClick={()=>setMenuVisao(false)}/>
                <div style={{position:"absolute",right:0,top:"calc(100% + 8px)",width:250,background:"#fff",borderRadius:14,padding:8,boxShadow:"0 8px 32px #00000022",zIndex:300,animation:"fadeIn .15s ease"}}>
                  <div style={{fontSize:10,color:"#888888",letterSpacing:"0.15em",textTransform:"uppercase",fontWeight:700,padding:"6px 10px 8px"}}>Visualizar dados</div>
                  {["empresa","pessoal","ambos"].map(k=>{
                    const v=VISOES[k], at=visao===k;
                    return (
                      <button key={k} onClick={()=>setVisao(k)}
                        style={{display:"flex",alignItems:"center",gap:10,width:"100%",background:at?v.fundo:"none",border:"none",borderRadius:10,padding:"10px",cursor:"pointer",textAlign:"left",fontFamily:"'Inter',sans-serif"}}>
                        <span style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:v.cor,color:"#fff",fontSize:13,fontWeight:800,flexShrink:0}}>{v.ini}</span>
                        <span style={{flex:1,minWidth:0}}>
                          <span style={{display:"block",fontSize:13,fontWeight:800,color:"#1A1A1A"}}>{v.nome}</span>
                          <span style={{display:"block",fontSize:10.5,color:"#888888",fontWeight:600,marginTop:1}}>{v.desc}</span>
                        </span>
                        {at&&<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={v.cor} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,paddingBottom:6,position:"relative"}}>
          <button className="arrow-btn" disabled={mesIdx===0} onClick={()=>goMes(-1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div style={{position:"relative"}}>
            <button className="mes-btn" onClick={()=>setShowPicker(o=>!o)}>
              {mesAtual.label}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00875A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            {showPicker&&<MonthPicker mesAtual={mesAtual.mes} onSelect={k=>{const i=MESES.findIndex(m=>m.mes===k);if(i>=0)setMesIdx(i);}} onClose={()=>setShowPicker(false)}/>}
          </div>
          <button className="arrow-btn" disabled={mesIdx===MESES.length-1} onClick={()=>goMes(1)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <div className="badge-mes" style={{position:"absolute",right:0,display:"flex",gap:4}}>
            {isFechado&&<span className="badge" style={{background:"#F2F1EC",color:"#666666",border:"1px solid #E0E0E0"}}>Fechado</span>}
            {!isFechado&&items.length>0&&<span className="badge" style={{background:"#FBF3E4",color:"#A6822E",border:"1px solid #EAD9AE"}}>Parcial</span>}
          </div>
        </div>
        <nav className="navtabs" style={{display:"flex",marginTop:2,overflowX:"auto"}}>
          {[["caixa","Caixa"],["inicio","Despesa"],["categorias","Categorias"],["metas","Metas"],["historico","Histórico"],["relatorio","Relatório"]].map(([v,l])=>(
            <button key={v} className="tab" onClick={()=>setView(v)}
              style={{flex:"1 0 auto",whiteSpace:"nowrap",background:"none",border:"none",borderBottom:view===v?"2.5px solid #CC0000":"2.5px solid transparent",color:view===v?"#CC0000":"#888888",padding:"10px 5px",fontSize:10,letterSpacing:"0.02em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:800,transition:"all .2s"}}>
              {l}
            </button>
          ))}
        </nav>
      </div>

      <div style={{padding:"20px 16px 120px"}}>
        {(()=>{ const hs=alertas.filter(x=>x.hoje); if(!hs.length) return null;
          const n=hs.reduce((t,a)=>t+parseInt(a.titulo,10),0), tot=hs.reduce((t,a)=>t+a.total,0);
          return (
          <div role="button" onClick={()=>setShowAlertas(true)} style={{display:"flex",alignItems:"center",gap:10,background:"#FBECEA",border:"1.5px solid #B4483C",borderRadius:12,padding:"11px 14px",marginBottom:14,cursor:"pointer"}}>
            <span style={{fontSize:18}}>⏰</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:800,color:"#8A3A30"}}>{n} conta{n>1?"s":""} para pagar hoje · {fmt(tot)}</div>
              {hs.map(a=>(
                <div key={a.centro} style={{fontSize:11,color:"#8A3A30",fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                  <b style={{color:VISOES[a.centro].cor}}>{VISOES[a.centro].nome}:</b> {a.motivo}
                </div>
              ))}
            </div>
            <span style={{color:"#8A3A30",fontSize:16}}>›</span>
          </div>
        );})()}
        {view==="inicio"&&(
          <>
            <div style={{background:"#fff",borderRadius:16,padding:"24px 20px",marginBottom:14,boxShadow:"0 2px 12px #1A1A1A10"}}>
              <div style={{display:"grid",gridTemplateColumns:"7fr 3fr",gap:14,alignItems:"start"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontSize:11,letterSpacing:"0.15em",color:"#888888",textTransform:"uppercase",marginBottom:4,fontWeight:700}}>Total lançado — {mesAtual.label}{rotVisao}</div>
                  <div style={{display:"flex",alignItems:"flex-end",gap:12,flexWrap:"wrap"}}>
                    <div style={{fontSize:fmt(total).length<=11?40:fmt(total).length<=13?34:28,fontWeight:800,color:"#1A1A1A",lineHeight:1,fontFamily:"'Inter',sans-serif"}}>{fmt(total)}</div>
                    {mesAnt&&totalAnt>0&&<Comparativo atual={total} anterior={totalAnt} isParcial={!isFechado}/>}
                  </div>
                  <div style={{fontSize:12,color:"#888888",marginTop:8,letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:600}}>{contaveis.length} lançamentos ativos</div>
                </div>
                <div role="button" onClick={()=>setPopProg(true)} style={{minWidth:0,borderLeft:"1px solid #EEEEEE",paddingLeft:12,cursor:"pointer"}}>
                  <div style={{fontSize:9,letterSpacing:"0.1em",color:"#888888",textTransform:"uppercase",marginBottom:6,fontWeight:700,lineHeight:1.3}}>Gastos programados ›</div>
                  <div style={{fontSize:fmt(totalAgendado).length<=11?16:13,fontWeight:800,color:"#8A6A1F",lineHeight:1.1,fontFamily:"'Inter',sans-serif"}}>{fmt(totalAgendado)}</div>
                  <div style={{fontSize:9.5,color:"#888888",marginTop:6,fontWeight:600,lineHeight:1.35,fontFamily:"'Inter',sans-serif"}}>
                    {agendados.length>0?`${agendados.length} a executar · já executado fica em Total lançado`:"nada a executar"}
                  </div>
                </div>
              </div>
            </div>
            {visao==="ambos"&&total>0&&<div style={{...card,padding:"14px 16px"}}>
              {["empresa","pessoal"].map(k=>[VISOES[k].nome,k,VISOES[k].cor]).map(([l,k,c],i)=>{
                const v=contaveis.filter(t=>(t.centro||"empresa")===k).reduce((s,t)=>s+t.valor,0);
                return <div key={k} style={{marginTop:i?12:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                    <span style={{fontSize:13,fontWeight:700,color:c,letterSpacing:"0.06em",textTransform:"uppercase"}}>{l}</span>
                    <span style={{fontSize:14,fontWeight:800,color:"#1A1A1A"}}>{fmt(v)} <span style={{fontSize:11,color:"#888888",fontWeight:600}}>· {((v/total)*100).toFixed(0)}%</span></span>
                  </div>
                  <Bar percent={(v/total)*100} color={c}/>
                </div>;})}
            </div>}
            <div style={{fontSize:10,color:"#888888",letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Despesas por Categoria</div>
            <div style={card}>
              {byCat.length===0
                ?<div style={{padding:"24px 0",textAlign:"center"}}><div style={{fontSize:32,marginBottom:8}}>📋</div><div style={{color:"#888888",fontSize:14,fontFamily:"'Inter',sans-serif",fontWeight:700}}>Nenhum lançamento ainda.</div></div>
                :byCat.map(({cat,val},i)=>(
                  <div key={cat} style={{padding:"12px 0",borderBottom:i===byCat.length-1?"none":"1px solid #EEEEEE"}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:CAT_CORES[cat]||"#999",flexShrink:0}}/>
                        <span style={{fontSize:14,color:"#1A1A1A",fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{cat}</span>
                      </div>
                      <span style={{fontSize:14,fontWeight:800,color:"#1A1A1A",fontFamily:"'Inter',sans-serif"}}>{fmt(val)}</span>
                    </div>
                    <Bar percent={total>0?(val/total)*100:0} color={CAT_CORES[cat]||"#999"}/>
                    <div style={{fontSize:10,color:"#888888",marginTop:4,fontFamily:"'Inter',sans-serif",fontWeight:600}}>
                      {total>0?((val/total)*100).toFixed(1):0}% do total · {contaveis.filter(t=>t.categoria===cat).length} lançamentos
                    </div>
                  </div>
                ))
              }
            </div>
          </>
        )}
        {view==="caixa"&&(
          <>
            <div style={{background:"#fff",borderRadius:16,padding:"20px",marginBottom:14,boxShadow:"0 2px 12px #1A1A1A10"}}>
              <div style={{fontSize:11,letterSpacing:"0.15em",color:"#888888",textTransform:"uppercase",marginBottom:12,fontWeight:700}}>Fluxo de Caixa — {mesAtual.label}{rotVisao}</div>
              <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10,marginBottom:14}}>
                <div style={{background:"#E6F4EE",borderRadius:12,padding:"14px",border:"1px solid #B5DCCB"}}>
                  <div style={{fontSize:9,letterSpacing:"0.15em",color:"#00704B",textTransform:"uppercase",fontWeight:800,marginBottom:4}}>Receita</div>
                  <div className="kpi-v" style={{fontWeight:800,color:"#00704B",lineHeight:1,fontFamily:"'Inter',sans-serif"}}>{fmt(totalReceita)}</div>
                  <div style={{fontSize:10,color:"#666666",marginTop:4,fontWeight:600}}>{receitas.length} entrada(s){receitasProg.length>0&&<span style={{color:"#00704B"}}> · + {fmt(totalReceitaProg)} a receber</span>}</div>
                </div>
                <div style={{background:"#FBECEA",borderRadius:12,padding:"14px",border:"1px solid #EBBDB6"}}>
                  <div style={{fontSize:9,letterSpacing:"0.15em",color:"#8A3A30",textTransform:"uppercase",fontWeight:800,marginBottom:4}}>Despesa</div>
                  <div className="kpi-v" style={{fontWeight:800,color:"#8A3A30",lineHeight:1,fontFamily:"'Inter',sans-serif"}}>{fmt(total)}</div>
                  <div style={{fontSize:10,color:"#666666",marginTop:4,fontWeight:600}}>{contaveis.length} saída(s)</div>
                </div>
              </div>
              {totalTransf>0&&(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,background:"#F5F5F5",border:"1px solid #E0E0E0",borderRadius:12,padding:"10px 14px",marginBottom:14}}>
                  <div>
                    <div style={{fontSize:9,letterSpacing:"0.15em",color:"#666666",textTransform:"uppercase",fontWeight:800}}>{visao==="empresa"?"Transferido para o Isaque":visao==="pessoal"?"Recebido da Pico Barbershop":"Transferências Pico → Isaque"}</div>
                    <div style={{fontSize:10,color:"#888888",marginTop:2,fontWeight:600}}>{visao==="ambos"?"não altera Ambos (sai da barbearia e entra no Isaque)":"pró-labore e retiradas"}</div>
                  </div>
                  <div style={{fontSize:17,fontWeight:800,color:visao==="empresa"?"#8A3A30":visao==="pessoal"?"#00704B":"#1A1A1A",whiteSpace:"nowrap"}}>{visao==="empresa"?"− ":visao==="pessoal"?"+ ":""}{fmt(totalTransf)}</div>
                </div>
              )}
              <div style={{background:saldo>=0?"#E6F4EE":"#FBF3E4",borderRadius:12,padding:"16px 18px",border:`2px solid ${saldo>=0?"#00875A":"#A6822E"}`}}>
                <div style={{fontSize:10,letterSpacing:"0.15em",color:saldo>=0?"#00875A":"#8A6A1F",textTransform:"uppercase",fontWeight:800,marginBottom:4}}>Saldo do Mês</div>
                <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                  <div style={{fontSize:28,fontWeight:800,color:saldo>=0?"#00875A":"#8A6A1F",lineHeight:1,fontFamily:"'Inter',sans-serif"}}>{fmt(saldo)}</div>
                  <div style={{fontSize:11,color:"#666666",fontWeight:700}}>{saldo>=0?"positivo":"negativo"}</div>
                </div>
                {visao==="ambos"&&(
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:12}}>
                    {["empresa","pessoal"].map(c=>(
                      <div key={c} style={{background:"#fff",borderRadius:10,padding:"9px 12px",border:`1px solid ${VISOES[c].cor}33`}}>
                        <div style={{fontSize:9,letterSpacing:"0.12em",color:VISOES[c].cor,textTransform:"uppercase",fontWeight:800}}>Saldo {VISOES[c].nome}</div>
                        <div style={{fontSize:16,fontWeight:800,color:saldosCentro[c]>=0?"#1A1A1A":"#B4483C",marginTop:2}}>{fmt(saldosCentro[c])}</div>
                      </div>
                    ))}
                  </div>
                )}
                {visao==="ambos"&&<div style={{fontSize:10,color:"#666666",marginTop:8,fontWeight:600}}>O caixa da empresa não é somado como dinheiro pessoal: cada saldo fica do seu lado.</div>}
              </div>
              {!isFechado&&<button onClick={novaTransf} style={{width:"100%",marginTop:12,background:"#fff",border:"1.5px dashed #888888",color:"#1A1A1A",borderRadius:10,fontSize:12.5,fontWeight:700,padding:"10px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>⇄ Transferência Pico → Isaque (pró-labore / retirada)</button>}
            </div>
            <div role="button" onClick={()=>setFluxoAberto(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:"#888888",letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:10,fontWeight:700,cursor:"pointer",userSelect:"none"}}>
              <span>Fluxo Semanal</span>
              <span style={{display:"inline-block",transform:fluxoAberto?"rotate(90deg)":"none",transition:"transform .15s",fontSize:9}}>▶</span>
            </div>
            {fluxoAberto&&<div style={{...card,padding:"8px 4px"}}>
              <div style={{display:"grid",gridTemplateColumns:"1.1fr 1fr 1fr 1fr",gap:6,padding:"8px 10px",borderBottom:"1px solid #EEEEEE"}}>
                <div style={{fontSize:9,color:"#666666",fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase"}}>Semana</div>
                <div style={{fontSize:9,color:"#00704B",fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",textAlign:"right"}}>Receita</div>
                <div style={{fontSize:9,color:"#8A3A30",fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",textAlign:"right"}}>Despesa</div>
                <div style={{fontSize:9,color:"#1A1A1A",fontWeight:800,letterSpacing:"0.06em",textTransform:"uppercase",textAlign:"right"}}>Saldo</div>
              </div>
              {fluxoSemanal.map((sem,i)=>(
                <div key={i} style={{display:"grid",gridTemplateColumns:"1.1fr 1fr 1fr 1fr",gap:6,padding:"10px 10px",borderBottom:i===fluxoSemanal.length-1?"none":"1px solid #FAFAFA",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:12,color:"#1A1A1A",fontWeight:800}}>{sem.label}</div>
                    <div style={{fontSize:10,color:"#888888",fontWeight:600,marginTop:1}}>dia {sem.ini}–{sem.fim}</div>
                  </div>
                  <div style={{fontSize:12,color:sem.receita>0?"#00704B":"#E0E0E0",fontWeight:800,textAlign:"right"}}>{fmt(sem.receita)}</div>
                  <div style={{fontSize:12,color:sem.despesa>0?"#8A3A30":"#E0E0E0",fontWeight:800,textAlign:"right"}}>{fmt(sem.despesa)}</div>
                  <div style={{fontSize:12,color:sem.saldo===0?"#E0E0E0":(sem.saldo>0?"#1A1A1A":"#A6822E"),fontWeight:900,textAlign:"right"}}>{fmt(sem.saldo)}</div>
                </div>
              ))}
            </div>}
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:20,marginBottom:10}}>
              <div role="button" onClick={()=>setRecAberto(v=>!v)} style={{display:"flex",alignItems:"center",gap:6,fontSize:10,color:"#888888",letterSpacing:"0.2em",textTransform:"uppercase",fontWeight:700,cursor:"pointer",userSelect:"none"}}>
                <span>Recebimentos do Mês</span>
                <span style={{display:"inline-block",transform:recAberto?"rotate(90deg)":"none",transition:"transform .15s",fontSize:9}}>▶</span>
              </div>
              <div style={{fontSize:11,color:"#888888",fontWeight:700}}>{receitas.length} entrada(s){receitasProg.length>0?` · ${receitasProg.length} a receber`:""}</div>
            </div>
            {recAberto&&<div style={card}>
              {sortedReceitas.length===0
                ?<div style={{padding:"24px 0",textAlign:"center"}}>
                  <div style={{fontSize:32,marginBottom:8}}>💰</div>
                  <div style={{color:"#888888",fontSize:14,fontFamily:"'Inter',sans-serif",fontWeight:700}}>Nenhum recebimento neste mês.</div>
                  {!isFechado&&<div style={{color:"#888888",fontSize:12,marginTop:4,fontFamily:"'Inter',sans-serif"}}>Toque em "Nova Receita" abaixo</div>}
                </div>
                :sortedReceitas.map((r,i)=><ReceitaRow key={r.id} r={r} last={i===sortedReceitas.length-1}/>)
              }
            </div>}
            <SecTitulo aberto={trAberto} onClick={()=>setTrAberto(v=>!v)} direita={<div style={{fontSize:11,color:"#888888",fontWeight:700}}>{transfMesTodas.filter(t=>!t.excluido).length} no mês</div>}>Transferências Pico → Isaque</SecTitulo>
            {trAberto&&<div style={card}>
              {transfMesTodas.length===0
                ?<div style={{padding:"20px 0",textAlign:"center",color:"#888888",fontSize:13,fontWeight:700}}>Nenhuma transferência neste mês.</div>
                :transfMesTodas.map((t,i)=>{
                  const exc=!!t.excluido, prog=!exc&&t.data>hoje();
                  return (
                    <div key={t.id} className={`row-item${exc?" row-excluido":""}`} onClick={()=>!exc&&!isFechado&&setAcaoGen({kind:"transf",item:t})}
                      style={{...rowDiv(i===transfMesTodas.length-1),cursor:exc?"default":"pointer"}}>
                      <div style={{display:"flex",gap:10,alignItems:"center",flex:1,minWidth:0}}>
                        <div style={{width:4,height:exc?16:36,background:exc?"#ddd":"linear-gradient(#CC0000,#2F65AC)",borderRadius:3,flexShrink:0}}/>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:14,fontWeight:700,color:exc?"#aaa":"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textDecoration:exc?"line-through":"none"}}>{t.descricao||TIPOS_TRANSF[t.tipo]}</div>
                          <div style={{fontSize:11,color:"#888888",marginTop:2}}>{fmtDate(t.data)} · {TIPOS_TRANSF[t.tipo]||"Transferência"} · Pico → Isaque</div>
                          {exc&&<span className="badge" style={{background:"#FBECEA",color:"#B4483C",border:"1px solid #EBBDB6"}}>Excluída{t.motivo_exclusao?` · ${t.motivo_exclusao}`:""}</span>}
                        </div>
                      </div>
                      <div style={{textAlign:"right",flexShrink:0}}>
                        <div style={{fontSize:15,fontWeight:800,color:exc?"#bbb":"#1A1A1A"}}>{fmt(t.valor)}</div>
                        {prog&&<div style={{fontSize:9.5,fontWeight:700,color:"#8A3A30",marginTop:2}}>Agendada · {fmtDate(t.data)}</div>}
                      </div>
                    </div>
                  );
                })}
            </div>}
            <SecTitulo aberto={prevAberto} onClick={()=>setPrevAberto(v=>!v)}>Previsão de caixa</SecTitulo>
            {prevAberto&&<>
              <div style={{display:"flex",gap:4,background:"#fff",borderRadius:10,padding:4,boxShadow:"0 2px 8px #1A1A1A10",marginBottom:10}}>
                {[7,15,30,60,90].map(d=>(
                  <button key={d} onClick={()=>setPrevDias(d)} style={{flex:1,border:"none",borderRadius:8,padding:"9px 2px",fontSize:12,fontWeight:700,fontFamily:"'Inter',sans-serif",cursor:"pointer",background:prevDias===d?"#1A1A1A":"transparent",color:prevDias===d?"#fff":"#888888"}}>{d} dias</button>
                ))}
              </div>
              <div className="prev-grid">
                {prevs.map(({c,p})=><CardPrevisao key={c} c={c} p={p} dias={prevDias} destaque={visao==="ambos"&&c==="ambos"}/>)}
              </div>
              <div style={{fontSize:10.5,color:"#888888",fontWeight:600,lineHeight:1.5,marginBottom:6}}>
                "Saldo registrado" é a soma de tudo que foi lançado no app desde {MESES[0].label} — não é o saldo do banco. Valores marcados como <b style={{color:"#A6822E"}}>estimativa</b> são projeções, não dinheiro garantido.
              </div>
            </>}
          </>
        )}
        {view==="categorias"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginBottom:18}}>
              <div style={{fontSize:22,fontWeight:800,color:"#1A1A1A",fontFamily:"'Inter',sans-serif"}}>Por Categoria</div>
              <button onClick={novaCat} style={{background:"#1A1A1A",color:"#fff",border:"none",borderRadius:10,padding:"9px 14px",fontSize:12.5,fontWeight:700,cursor:"pointer",fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap"}}>+ Nova categoria</button>
            </div>
            {byCat.length===0
              ?<div style={{...card,padding:24,textAlign:"center"}}><div style={{fontSize:32,marginBottom:8}}>📂</div><div style={{color:"#888888",fontSize:14,fontFamily:"'Inter',sans-serif",fontWeight:700}}>Nenhum lançamento neste mês.</div></div>
              :byCat.map(({cat,val})=>{
                const aberta=catAberta===cat;
                const lancs=aberta?contaveis.filter(t=>t.categoria===cat).sort((a,b)=>new Date(b.data)-new Date(a.data)):[];
                return (
                <div key={cat} style={{...card,marginBottom:10}}>
                  <div style={{padding:"12px 0",cursor:"pointer"}} onClick={()=>setCatAberta(aberta?null:cat)}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:CAT_CORES[cat]||"#999",flexShrink:0}}/>
                        <span style={{fontSize:14,color:"#1A1A1A",fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{cat}</span>
                        <span style={{fontSize:11,color:"#888888",display:"inline-block",transform:aberta?"rotate(90deg)":"none",transition:"transform .15s"}}>▶</span>
                      </div>
                      <span style={{fontSize:14,fontWeight:800,color:"#1A1A1A",fontFamily:"'Inter',sans-serif"}}>{fmt(val)}</span>
                    </div>
                    <Bar percent={total>0?(val/total)*100:0} color={CAT_CORES[cat]||"#999"}/>
                  </div>
                  {aberta&&(
                    <div style={{borderTop:"1px solid #EEEEEE"}}>
                      <div style={{fontSize:11,color:"#888888",padding:"8px 0 0",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{lancs.length} lançamento{lancs.length===1?"":"s"}</div>
                      {lancs.map((t,i)=><LancRow key={t.id} t={t} last={i===lancs.length-1} limpo/>)}
                    </div>
                  )}
                </div>
                );
              })
            }
            {(()=>{
              const linhas = CAT_ROWS.filter(r=>visao==="ambos"||!r.centro||r.centro==="ambos"||r.centro===visao).sort((a,b)=>a.nome.localeCompare(b.nome,"pt-BR"));
              return (<>
                <SecTitulo aberto={gerCatAberto} onClick={()=>setGerCatAberto(v=>!v)} direita={<div style={{fontSize:11,color:"#888888",fontWeight:700}}>{linhas.length} cadastrada{linhas.length===1?"":"s"}</div>}>Todas as categorias</SecTitulo>
                {gerCatAberto&&<div style={card}>
                  {linhas.length===0
                    ?<div style={{padding:"20px 0",textAlign:"center",color:"#888888",fontSize:13,fontWeight:700}}>Nenhuma categoria cadastrada. Toque em "+ Nova categoria".</div>
                    :linhas.map((r,i)=>{
                      const c = r.centro==="empresa"||r.centro==="pessoal" ? VISOES[r.centro] : null;
                      return (
                        <div key={r.id||r.nome+i} className="row-item" style={rowDiv(i===linhas.length-1)}>
                          <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0}}>
                            <span style={{width:12,height:12,borderRadius:"50%",background:r.cor||"#999",flexShrink:0}}/>
                            <span style={{fontSize:14,fontWeight:700,color:"#1A1A1A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.nome}</span>
                            <span className="badge" style={{marginTop:0,background:c?c.fundo:"#F0F0F0",color:c?c.cor:"#666",border:`1px solid ${c?c.cor+"33":"#E0E0E0"}`}}>{c?c.curto:"Ambos"}</span>
                          </div>
                        </div>
                      );
                    })}
                </div>}
              </>);
            })()}
          </>
        )}
        {view==="metas"&&(()=>{
          const todas = metas.filter(m=>naVisao(visao,m)).map(m=>({m,p:progMeta(m,glob)}));
          const andamento = todas.filter(x=>!x.p.realizada).sort((a,b)=>b.p.status.nivel-a.p.status.nivel||b.p.pct-a.p.pct);
          const realizadas = todas.filter(x=>x.p.realizada).sort((a,b)=>String(b.m.concluida_em||"").localeCompare(String(a.m.concluida_em||"")));
          const medalhas = todas.reduce((s,x)=>s+MARCOS.filter(([v])=>x.p.tipo!=="limite"&&x.p.pct>=v).length,0);
          const media = andamento.filter(x=>x.p.tipo!=="limite").length ? andamento.filter(x=>x.p.tipo!=="limite").reduce((s,x)=>s+Math.min(1,x.p.pct),0)/andamento.filter(x=>x.p.tipo!=="limite").length : 0;
          const abas = [["andamento",`Em andamento (${andamento.length})`],["realizadas",`Realizadas (${realizadas.length})`],["nova","+ Nova meta"]];
          return (<>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:12}}>
              <div style={{fontSize:22,fontWeight:800,color:"#1A1A1A"}}>Metas</div>
              <div style={{fontSize:11,color:"#888888",fontWeight:600}}>{VISOES[visao].nome}</div>
            </div>
            <div style={{display:"flex",gap:4,background:"#fff",borderRadius:12,padding:4,boxShadow:"0 2px 8px #1A1A1A10",marginBottom:14}}>
              {abas.map(([k,l])=>(
                <button key={k} onClick={()=>{ if(k==="nova"&&metaTab!=="nova"){ setFormMeta(null); setErroGen({}); } setMetaTab(k); }}
                  style={{flex:1,border:"none",borderRadius:9,padding:"10px 4px",fontSize:12.5,fontWeight:800,fontFamily:"'Inter',sans-serif",cursor:"pointer",whiteSpace:"nowrap",
                    background:metaTab===k?(k==="nova"?"#CC0000":"#1A1A1A"):"transparent",color:metaTab===k?"#fff":k==="nova"?"#CC0000":"#888888"}}>{l}</button>
              ))}
            </div>

            {metaTab==="andamento"&&<>
              {todas.length>0&&(
                <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,marginBottom:14}}>
                  {[["🎯",andamento.length,"em andamento"],["🏆",realizadas.length,"realizadas"],["🏅",medalhas,"medalhas"]].map(([ic,n,l])=>(
                    <div key={l} style={{background:"#fff",borderRadius:14,padding:"10px 8px",textAlign:"center",boxShadow:"0 2px 8px #1A1A1A10"}}>
                      <div style={{fontSize:18}}>{ic}</div>
                      <div style={{fontSize:20,fontWeight:800,color:"#1A1A1A",lineHeight:1.1}}>{n}</div>
                      <div style={{fontSize:9.5,color:"#888888",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em"}}>{l}</div>
                    </div>
                  ))}
                </div>
              )}
              {andamento.length>0&&media>0&&(
                <div style={{background:"#fff",borderRadius:14,padding:"10px 14px",boxShadow:"0 2px 8px #1A1A1A10",marginBottom:14}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:11,fontWeight:800,color:"#1A1A1A",marginBottom:6}}><span>Progresso geral</span><span>{Math.round(media*100)}%</span></div>
                  <Bar percent={media*100} color="#00875A"/>
                </div>
              )}
              {andamento.length===0
                ?<div style={{...card,padding:24,textAlign:"center"}}>
                  <div style={{fontSize:34,marginBottom:8}}>🎯</div>
                  <div style={{color:"#1A1A1A",fontSize:14,fontWeight:800}}>Nenhuma meta em andamento</div>
                  <div style={{color:"#888888",fontSize:12,marginTop:4,marginBottom:14}}>Crie uma meta financeira ou objetiva e acompanhe o avanço aqui.</div>
                  <button onClick={()=>{setFormMeta(null);setMetaTab("nova");}} style={{background:"#00875A",color:"#fff",border:"none",borderRadius:10,padding:"10px 18px",fontSize:13,fontWeight:800,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>+ Nova meta</button>
                </div>
                :<div className="metas-grid">{andamento.map(({m,p})=><CardMeta key={m.id} m={m} p={p} onClick={()=>setAcaoGen({kind:"meta",item:m})} onQtd={ajustarQtd} onEtapa={alternarEtapa} onDia={alternarDia}/>)}</div>}
            </>}

            {metaTab==="realizadas"&&(realizadas.length===0
              ?<div style={{...card,padding:24,textAlign:"center"}}>
                <div style={{fontSize:34,marginBottom:8}}>🏆</div>
                <div style={{color:"#1A1A1A",fontSize:14,fontWeight:800}}>Nenhuma meta realizada ainda</div>
                <div style={{color:"#888888",fontSize:12,marginTop:4}}>Quando uma meta chega a 100%, ela vem para cá com o troféu.</div>
              </div>
              :realizadas.map(({m,p})=><CardRealizada key={m.id} m={m} p={p} onClick={()=>setAcaoGen({kind:"meta",item:m})}/>))}

            {metaTab==="nova"&&(!formMeta
              ? <>
                  <div style={{fontSize:11,color:"#888888",letterSpacing:"0.15em",textTransform:"uppercase",fontWeight:800,marginBottom:10}}>1. Tipo de meta</div>
                  <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10}}>
                    {Object.entries(GRUPOS_META).map(([k,g])=>(
                      <button key={k} onClick={()=>novaMeta(k)} style={{background:"#fff",border:"2px solid #EEEEEE",borderRadius:16,padding:"18px 14px",textAlign:"left",cursor:"pointer",fontFamily:"'Inter',sans-serif",boxShadow:"0 2px 8px #1A1A1A10"}}>
                        <div style={{fontSize:30,marginBottom:8}}>{g.icone}</div>
                        <div style={{fontSize:16,fontWeight:800,color:"#1A1A1A"}}>{g.nome}</div>
                        <div style={{fontSize:11.5,color:"#888888",fontWeight:600,marginTop:4,lineHeight:1.4}}>{g.desc}</div>
                      </button>
                    ))}
                  </div>
                </>
              : (()=>{
                const f=formMeta.f, T=TIPOS_META[f.tipo], ed=formMeta.item;
                const up=(k,v)=>{ setFormMeta(x=>({...x,f:{...x.f,[k]:v}})); setErroGen(e=>({...e,[k.replace("Digits","")]:null,[k]:null})); };
                const addEtapa=()=>{ const t=f.novaEtapa.trim(); if(!t) return; setFormMeta(x=>({...x,f:{...x.f,etapas:[...x.f.etapas,{t,ok:false}],novaEtapa:""}})); setErroGen(e=>({...e,etapas:null})); };
                const tiposDoGrupo = Object.entries(TIPOS_META).filter(([,t])=>t.grupo==="financeira");
                const obj = f.tipo==="objetiva", md = obj ? f.medidores : [], pat = f.tipo==="patrimonio", bem = BENS[f.unidade]?f.unidade:"veiculo";
                const alternarMedidor = k => { setFormMeta(x=>{ const l=x.f.medidores; return {...x,f:{...x.f,medidores: l.includes(k)?l.filter(y=>y!==k):[...l,k]}}; }); setErroGen(e=>({...e,medidores:null})); };
                const previa = (()=>{ const mt={ id:ed?ed.id:"previa", parcelas:parseInt(f.parcelas)||0, parc_pagas: f.parcPagas!=="" ? (parseInt(f.parcPagas)||0) : decorridas(f.data_inicio, parseInt(f.parcelas)||0), nome:f.nome||"Nome da meta", tipo:f.tipo, centro:f.centro, categoria:f.categoria||null, unidade:f.tipo==="patrimonio"?bem:f.unidade, medidores:md,
                  valor_inicial:d2float(f.iniDigits), valor_alvo: T.grupo==="financeira"?d2float(f.alvoDigits):0,
                  valor_atual: f.tipo==="valor"?d2float(f.atualDigits):0, qtd_itens: md.includes("quantidade") ? itensDoForm(f) : null, etapas:f.etapas, checkins: ed ? ed.checkins : [],
                  cal_freq:f.cal_freq, cal_vezes:parseInt(f.cal_vezes)||1, data_inicio:f.data_inicio, prazo:f.tipo==="patrimonio"&&parseInt(f.parcelas)>0&&f.data_inicio?addMesesData(f.data_inicio,parseInt(f.parcelas)-1):f.prazo, criado_em:hoje() };
                  return { mt, p: progMeta(mt, glob) }; })();
                const diasCal = f.prazo&&f.data_inicio&&f.prazo>=f.data_inicio ? alvoCalendario({data_inicio:f.data_inicio,prazo:f.prazo,cal_freq:f.cal_freq,cal_vezes:parseInt(f.cal_vezes)||1}) : 0;
                const Sec=({n,t})=><div style={{fontSize:11,color:"#888888",letterSpacing:"0.15em",textTransform:"uppercase",fontWeight:800,margin:"18px 0 10px"}}>{n}. {t}</div>;
                return (
                  <div className="meta-form">
                    <div>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                        <div style={{fontSize:18,fontWeight:800,color:"#1A1A1A"}}>{ed?"Editar meta":`Nova meta ${GRUPOS_META[f.grupo].nome.toLowerCase()}`} {GRUPOS_META[f.grupo].icone}</div>
                        {!ed&&<button onClick={()=>setFormMeta(null)} style={{background:"none",border:"none",color:"#00875A",fontSize:12,fontWeight:800,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>trocar tipo</button>}
                      </div>
                      <Sec n={1} t={obj?"Como medir · pode escolher mais de um":"O que medir"}/>
                      {obj
                        ?<>
                          <div style={{display:"flex",flexDirection:"column",gap:8}}>
                            {Object.entries(MEDIDORES).map(([k,M])=>{ const on=md.includes(k); return (
                              <button key={k} onClick={()=>alternarMedidor(k)} style={{display:"flex",alignItems:"center",gap:12,textAlign:"left",background:on?"#1A1A1A":"#fff",color:on?"#fff":"#1A1A1A",border:`2px solid ${on?"#1A1A1A":"#EEEEEE"}`,borderRadius:12,padding:"10px 12px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
                                <span style={{width:22,height:22,borderRadius:6,border:`2px solid ${on?"#fff":"#CCCCCC"}`,background:on?"#00875A":"#fff",color:"#fff",fontSize:13,fontWeight:900,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{on?"✓":""}</span>
                                <span style={{flex:1}}>
                                  <span style={{display:"block",fontSize:13.5,fontWeight:800}}>{M.icone} {M.nome}</span>
                                  <span style={{display:"block",fontSize:11,fontWeight:600,opacity:0.75,marginTop:2}}>{M.desc}</span>
                                </span>
                              </button>
                            );})}
                          </div>
                          <ErrTxt msg={erroGen.medidores}/>
                          {md.length>1&&<div style={{fontSize:11.5,color:"#666666",fontWeight:600,marginTop:8}}>O progresso geral é a média dos {md.length} medidores.</div>}
                        </>
                        :<>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:8}}>
                            {tiposDoGrupo.map(([k,t])=>(
                              <button key={k} onClick={()=>up("tipo",k)} style={{textAlign:"left",background:f.tipo===k?"#1A1A1A":"#fff",color:f.tipo===k?"#fff":"#1A1A1A",border:`2px solid ${f.tipo===k?"#1A1A1A":"#EEEEEE"}`,borderRadius:12,padding:"10px 12px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
                                <div style={{fontSize:13,fontWeight:800}}>{t.icone} {t.nome}</div>
                              </button>
                            ))}
                          </div>
                          <div style={{fontSize:11.5,color:"#666666",fontWeight:600,marginTop:8,lineHeight:1.45}}>{T.desc}{T.auto?" Calculada sozinha pelos lançamentos.":""}</div>
                        </>}

                      <Sec n={2} t="Identificação"/>
                      <div style={{marginBottom:14}}>
                        <label style={FL}>Nome da meta *</label>
                        <input style={INP(erroGen.nome)} value={f.nome} onChange={e=>up("nome",e.target.value)}
                          placeholder={{patrimonio:"Ex: Quitar o financiamento do carro",faturamento:"Ex: Faturar R$ 40 mil",acumular:"Ex: Reserva de emergência",limite:"Ex: Produtos até R$ 1.500",valor:"Ex: Juntar para a reforma",objetiva:"Ex: Ler 20 minutos por dia"}[f.tipo]}/>
                        <ErrTxt msg={erroGen.nome}/>
                      </div>
                      <label style={FL}>De quem é a meta</label>
                      <SeletorCentro valor={f.centro} onChange={v=>up("centro",v)}/>

                      <Sec n={3} t={obj?"Detalhes de cada medidor":"Alvo"}/>
                      {obj&&md.length===0&&<div style={{fontSize:12,color:"#888888",fontWeight:600,marginBottom:14}}>Escolha um medidor no passo 1.</div>}
                      {f.tipo==="limite"&&(
                        <div style={{marginBottom:14}}>
                          <label style={FL}>Categoria</label>
                          <select style={INP(false)} value={f.categoria} onChange={e=>up("categoria",e.target.value)}>
                            <option value="">Todas as despesas</option>
                            {catsDoCentro(f.centro).map(c=><option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      )}
                      {pat&&(
                        <div style={{marginBottom:14}}>
                          <label style={FL}>O que vai quitar</label>
                          <Chips opcoes={Object.entries(BENS).map(([k,b])=>[k,`${b.icone} ${b.nome}`])} valor={bem} onChange={v=>up("unidade",v)}/>
                        </div>
                      )}
                      {T.grupo==="financeira"&&<CampoValor label={pat?"Valor do patrimônio *":f.tipo==="faturamento"?"Faturamento desejado no mês *":f.tipo==="limite"?"Limite de gasto no mês *":"Valor-alvo *"} digits={f.alvoDigits} onChange={v=>up("alvoDigits",v)} err={erroGen.alvo}/>}
                      {(f.tipo==="acumular"||pat)&&<CampoValor label={pat?"Entrada / já quitado (opcional)":"Já guardado antes do início"} digits={f.iniDigits} onChange={v=>up("iniDigits",v)} err={erroGen.ini}/>}
                      {pat&&(
                        <div style={{marginBottom:14}}>
                          <label style={FL}>Quantidade de parcelas *</label>
                          <input inputMode="numeric" style={{...INP(erroGen.parcelas),width:"50%"}} placeholder="48" value={f.parcelas} onChange={e=>up("parcelas",e.target.value.replace(/\D/g,"").slice(0,3))}/>
                          <ErrTxt msg={erroGen.parcelas}/>
                          {parseInt(f.parcelas)>0&&d2float(f.alvoDigits)>d2float(f.iniDigits)&&<div style={{fontSize:11.5,color:"#00704B",fontWeight:700,background:"#E6F4EE",borderRadius:10,padding:"9px 12px",marginTop:8}}>
                            Parcela estimada: {fmt((d2float(f.alvoDigits)-d2float(f.iniDigits))/parseInt(f.parcelas))} (sem juros). Ao lançar cada parcela como despesa, vincule à meta.
                          </div>}
                        </div>
                      )}
                      {f.tipo==="valor"&&<CampoValor label="Quanto já tem hoje" digits={f.atualDigits} onChange={v=>up("atualDigits",v)} cor="#00704B"/>}
                      {md.includes("quantidade")&&<div style={{fontSize:12.5,fontWeight:800,color:"#1A1A1A",marginBottom:8}}>🔢 Quantidade · uma ou mais atividades</div>}
                      {md.includes("quantidade")&&(()=>{
                        const q=f.qi, upQi=(k,v)=>{ setFormMeta(x=>({...x,f:{...x.f,qi:{...x.f.qi,[k]:v}}})); setErroGen(e=>({...e,alvoQtd:null,medidores:null})); };
                        const addQi=()=>{ if(!(parseInt(q.alvo)>0)){ setErroGen(e=>({...e,alvoQtd:"Informe o alvo antes de adicionar"})); return; }
                          setFormMeta(x=>({...x,f:{...x.f,qtdItens:[...x.f.qtdItens,{id:uid(),nome:q.nome.trim(),alvo:parseInt(q.alvo),atual:q.per==="total"?(parseInt(q.atual)||0):0,unidade:q.unidade.trim(),per:q.per,fonte:q.per==="total"?q.fonte:"",log:{}}],qi:{...qiVazio,per:q.per}}}));
                          setErroGen(e=>({...e,alvoQtd:null})); };
                        return (
                        <div style={{marginBottom:14}}>
                          {f.qtdItens.map((it,i)=>(
                            <div key={it.id||i} style={{display:"flex",alignItems:"center",gap:8,background:"#E6F4EE",border:"1px solid #B5DCCB",borderRadius:10,padding:"8px 10px",marginBottom:6}}>
                              <span style={{flex:1,fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{it.nome||"Atividade"} · {it.alvo}{it.unidade?" "+it.unidade:""} <span style={{color:"#666666",fontWeight:600}}>({QTD_PER[it.per]||"Acumulado"}{it.fonte?" · 🔗 automático":""})</span></span>
                              <button onClick={()=>setFormMeta(x=>({...x,f:{...x.f,qtdItens:x.f.qtdItens.filter((_,k)=>k!==i)}}))} style={{background:"none",border:"none",color:"#B4483C",fontSize:18,cursor:"pointer",lineHeight:1}} aria-label="Remover atividade">×</button>
                            </div>
                          ))}
                          <div style={{background:"#FAFAFA",border:"1px solid #EEEEEE",borderRadius:12,padding:12}}>
                            <label style={FL}>Atividade</label>
                            <input style={{...INP(false),marginBottom:12}} placeholder="Ex: Flexões, Copos de água" value={q.nome} onChange={e=>upQi("nome",e.target.value.slice(0,40))}/>
                            <label style={FL}>Como contar</label>
                            <Chips opcoes={Object.entries(QTD_PER)} valor={q.per} onChange={v=>upQi("per",v)}/>
                            <div style={{fontSize:11.5,color:"#666666",fontWeight:600,margin:"-8px 0 10px",lineHeight:1.45}}>{{total:"Soma tudo até chegar no alvo (ex.: 100 assinantes).",dia:"Renova todo dia (ex.: 100 flexões por dia).",semana:"Renova toda semana, de segunda a domingo.",mes:"Renova todo mês."}[q.per]}</div>
                            {q.per==="total"&&f.qtdItens.some(x=>x.per!=="total")&&(
                              <div style={{marginBottom:12}}>
                                <label style={FL}>Somar automaticamente de</label>
                                <select style={INP(false)} value={q.fonte} onChange={e=>upQi("fonte",e.target.value)}>
                                  <option value="">Não — contar à mão</option>
                                  {f.qtdItens.filter(x=>x.per!=="total").map(x=><option key={x.id} value={x.id}>{x.nome||"Atividade"} ({QTD_PER[x.per]})</option>)}
                                </select>
                                {q.fonte&&<div style={{fontSize:11.5,color:"#00704B",fontWeight:700,marginTop:6}}>Tudo que você marcar nessa atividade entra neste total sozinho.</div>}
                              </div>
                            )}
                            <div style={{display:"grid",gridTemplateColumns:q.per==="total"?"minmax(0,1fr) minmax(0,1fr) minmax(0,1.2fr)":"minmax(0,1fr) minmax(0,1.2fr)",gap:8}}>
                              <div><label style={FL}>{q.per==="total"?"Alvo *":`Alvo ${{dia:"por dia",semana:"por semana",mes:"por mês"}[q.per]} *`}</label><input inputMode="numeric" style={INP(erroGen.alvoQtd)} placeholder="100" value={q.alvo} onChange={e=>upQi("alvo",e.target.value.replace(/\D/g,"").slice(0,7))}/></div>
                              {q.per==="total"&&<div><label style={FL}>Atual</label><input inputMode="numeric" style={INP(false)} placeholder="0" value={q.atual} onChange={e=>upQi("atual",e.target.value.replace(/\D/g,"").slice(0,7))}/></div>}
                              <div><label style={FL}>Unidade</label><input style={INP(false)} placeholder={q.per==="total"?"assinantes":"repetições"} value={q.unidade} onChange={e=>upQi("unidade",e.target.value.slice(0,20))}/></div>
                            </div>
                            <ErrTxt msg={erroGen.alvoQtd}/>
                            <button onClick={addQi} style={{width:"100%",marginTop:10,border:"2px solid #00875A",background:"#E6F4EE",color:"#00704B",borderRadius:10,padding:"10px",fontSize:14,fontWeight:800,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>+ Adicionar atividade</button>
                          </div>
                        </div>);
                      })()}
                      {md.includes("etapas")&&<div style={{fontSize:12.5,fontWeight:800,color:"#1A1A1A",marginBottom:8}}>✅ Etapas</div>}
                      {md.includes("etapas")&&(
                        <div style={{marginBottom:14}}>
                          {f.etapas.map((e,i)=>(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:8,background:"#FAFAFA",border:"1px solid #EEEEEE",borderRadius:10,padding:"8px 10px",marginBottom:6}}>
                              <span style={{fontSize:11,fontWeight:800,color:"#888888",width:18}}>{i+1}.</span>
                              <span style={{flex:1,fontSize:13,fontWeight:700,color:"#1A1A1A"}}>{e.t}</span>
                              <button onClick={()=>setFormMeta(x=>({...x,f:{...x.f,etapas:x.f.etapas.filter((_,k)=>k!==i)}}))} style={{background:"none",border:"none",color:"#B4483C",fontSize:18,cursor:"pointer",lineHeight:1}} aria-label="Remover etapa">×</button>
                            </div>
                          ))}
                          <div style={{display:"flex",gap:8}}>
                            <input style={{...INP(erroGen.etapas),flex:1}} placeholder={f.etapas.length?"Próxima etapa":"Ex: Fazer 3 orçamentos"} value={f.novaEtapa}
                              onChange={e=>up("novaEtapa",e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();addEtapa();}}}/>
                            <button onClick={addEtapa} style={{background:"#1A1A1A",color:"#fff",border:"none",borderRadius:10,padding:"0 16px",fontSize:20,fontWeight:800,cursor:"pointer"}}>+</button>
                          </div>
                          <ErrTxt msg={erroGen.etapas}/>
                        </div>
                      )}

                      {md.includes("calendario")&&(
                        <div style={{marginBottom:14}}>
                          <div style={{fontSize:12.5,fontWeight:800,color:"#1A1A1A",marginBottom:8}}>📅 Calendário</div>
                          <label style={FL}>Frequência</label>
                          <Chips opcoes={[["diario","Todos os dias"],["semana","Vezes por semana"],["periodo","Dias no período"]]} valor={f.cal_freq} onChange={v=>up("cal_freq",v)}/>
                          {f.cal_freq==="semana"&&(
                            <div style={{display:"flex",alignItems:"center",gap:10,margin:"-6px 0 10px"}}>
                              <input inputMode="numeric" style={{...INP(erroGen.cal_vezes),width:80,textAlign:"center",fontWeight:800}} value={f.cal_vezes} onChange={e=>up("cal_vezes",e.target.value.replace(/\D/g,"").slice(0,1))}/>
                              <span style={{fontSize:13,fontWeight:700,color:"#444"}}>vezes por semana</span>
                            </div>
                          )}
                          {f.cal_freq==="periodo"&&(()=>{
                            const ini=f.data_inicio&&f.data_inicio>hoje()?f.data_inicio:hoje(), restam=f.prazo&&f.prazo>=ini?diasEntre(ini,f.prazo)+1:0, n=parseInt(f.cal_vezes)||0;
                            return (
                            <div style={{margin:"-6px 0 10px"}}>
                              <div style={{display:"flex",alignItems:"center",gap:10}}>
                                <span style={{fontSize:13,fontWeight:700,color:"#444"}}>Cumprir em</span>
                                <input inputMode="numeric" style={{...INP(erroGen.cal_vezes),width:90,textAlign:"center",fontWeight:800}} value={f.cal_vezes} onChange={e=>up("cal_vezes",e.target.value.replace(/\D/g,"").slice(0,3))}/>
                                <span style={{fontSize:13,fontWeight:700,color:"#444"}}>dias, quando quiser</span>
                              </div>
                              {restam>0&&n>0&&<div style={{fontSize:11.5,color:"#666666",fontWeight:700,marginTop:8}}>Restam {restam} dia{restam>1?"s":""} até o prazo · você precisa marcar {Math.min(n,restam)} (≈ {(Math.min(n,restam)/restam*7).toFixed(1).replace(".",",")} por semana).</div>}
                            </div>);
                          })()}
                          <ErrTxt msg={erroGen.cal_vezes}/>
                          <div style={{fontSize:11.5,color:"#00704B",fontWeight:700,background:"#E6F4EE",borderRadius:10,padding:"9px 12px"}}>
                            {diasCal>0 ? `Meta: marcar ${diasCal} dia${diasCal>1?"s":""} entre ${fmtDate(f.data_inicio)} e ${fmtDate(f.prazo)}. Cada dia marcado avança a meta e conta para a sequência 🔥.` : "Defina o início e o prazo abaixo para calcular quantos dias marcar."}
                          </div>
                        </div>
                      )}

                      <Sec n={4} t="Prazo"/>
                      {T.mensal
                        ?<div style={{fontSize:12,color:"#666666",fontWeight:600,background:"#F5F5F5",borderRadius:10,padding:"10px 12px"}}>🔁 Meta mensal: começa no dia 1 e renova todo mês sozinha.</div>
                        :pat
                        ?(()=>{ const np=parseInt(f.parcelas)||0, dec=decorridas(f.data_inicio,np), pagasV=Math.min(np, f.parcPagas!==""?(parseInt(f.parcPagas)||0):dec), fim=np>0&&f.data_inicio?addMesesData(f.data_inicio,np-1):null; return (
                        <div>
                          <label style={FL}>Quando iniciou · vencimento da 1ª parcela *</label>
                          <input type="date" style={INP(erroGen.data_inicio)} value={f.data_inicio} onChange={e=>up("data_inicio",e.target.value)}/><ErrTxt msg={erroGen.data_inicio}/>
                          {np>0&&f.data_inicio&&<>
                            <div style={{marginTop:14}}>
                              <label style={FL}>Parcelas já pagas</label>
                              <input inputMode="numeric" style={{...INP(erroGen.parcPagas),width:"50%"}} placeholder={String(dec)} value={f.parcPagas} onChange={e=>up("parcPagas",e.target.value.replace(/\D/g,"").slice(0,3))}/>
                              <ErrTxt msg={erroGen.parcPagas}/>
                              <div style={{fontSize:11,color:"#888888",fontWeight:600,marginTop:6}}>Em branco: usa as {dec} parcela{dec===1?"":"s"} que já venceram até hoje. As próximas você vincula ao lançar a despesa.</div>
                            </div>
                            <div style={{fontSize:12,color:"#00704B",fontWeight:700,background:"#E6F4EE",borderRadius:10,padding:"10px 12px",marginTop:12,lineHeight:1.55}}>
                              📅 Encerra em <b>{fmtDate(fim)}/{fim.slice(0,4)}</b><br/>
                              ✅ {pagasV} paga{pagasV===1?"":"s"} · ⏳ faltam <b>{Math.max(0,np-pagasV)}</b> parcela{np-pagasV===1?"":"s"}{np-pagasV>0&&d2float(f.alvoDigits)>d2float(f.iniDigits)?` de cerca de ${fmt((d2float(f.alvoDigits)-d2float(f.iniDigits))/np)}`:""}
                            </div>
                          </>}
                        </div>);})()
                        :<div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr)",gap:10}}>
                          <div><label style={FL}>Início{f.tipo==="acumular"||md.includes("calendario")?" *":""}</label><input type="date" style={INP(erroGen.data_inicio)} value={f.data_inicio} onChange={e=>up("data_inicio",e.target.value)}/><ErrTxt msg={erroGen.data_inicio}/></div>
                          <div><label style={FL}>Prazo *</label><input type="date" style={INP(erroGen.prazo)} min={f.data_inicio||undefined} value={f.prazo} onChange={e=>up("prazo",e.target.value)}/><ErrTxt msg={erroGen.prazo}/></div>
                        </div>}

                      <Sec n={5} t="Por que essa meta importa (opcional)"/>
                      <textarea style={{...INP(false),minHeight:60,resize:"none",fontSize:14}} placeholder="Ex: abrir a segunda cadeira até o fim do ano" value={f.descricao} onChange={e=>up("descricao",e.target.value)}/>
                    </div>
                    <div>
                      <div style={{fontSize:11,color:"#888888",letterSpacing:"0.15em",textTransform:"uppercase",fontWeight:800,margin:"4px 0 10px"}}>Prévia</div>
                      <CardMeta m={previa.mt} p={previa.p}/>
                      <button className="btn-primary" onClick={salvarMeta}>{ed?"Salvar alterações":"Criar meta"}</button>
                      <button className="btn-ghost" onClick={()=>{setFormMeta(null);setMetaTab("andamento");}}>Cancelar</button>
                    </div>
                  </div>
                );
              })())}
          </>);
        })()}
        {view==="relatorio"&&<Relatorio mesKey={mesAtual.mes} visao={visao} goPeriodo={n=>setMesIdx(i=>Math.max(0,Math.min(MESES.length-1,i+n)))}/>}
        {view==="historico"&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:22,fontWeight:800,color:"#1A1A1A",fontFamily:"'Inter',sans-serif"}}>Histórico</div>
              <div style={{fontSize:11,color:"#888888",fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{items.length} lançamentos</div>
            </div>
            <div style={{position:"relative",marginBottom:12}}>
              <input type="text" placeholder="Pesquisar descrição (ex: nubank)" value={busca} onChange={e=>setBusca(e.target.value)}
                style={{width:"100%",background:"#fff",border:"2px solid #E0E0E0",borderRadius:10,color:"#1A1A1A",padding:"12px 38px 12px 14px",fontSize:14,fontFamily:"'Inter',sans-serif"}}/>
              {busca&&<button onClick={()=>setBusca("")} style={{position:"absolute",right:8,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",fontSize:18,color:"#888888",cursor:"pointer",padding:4}}>×</button>}
            </div>
            {(()=>{
              const termos=normTxt(busca).split(/\s+/).filter(Boolean);
              const isProg=t=>!t.excluido&&t.data>hoje();
              const base=sorted.filter(t=>histTab==="prog"?isProg(t):!isProg(t));
              const nProg=sorted.filter(isProg).length;
              const lista=termos.length?base.filter(t=>{const h=normTxt(t.descricao);return termos.every(x=>h.includes(x));}):base;
              return (
                <>
                  <div style={{display:"flex",gap:6,marginBottom:12,background:"#fff",borderRadius:10,padding:4,boxShadow:"0 2px 8px #1A1A1A10"}}>
                    {[["exec","Executados",sorted.length-nProg],["prog","Programados",nProg]].map(([k,l,n])=>(
                      <button key={k} onClick={()=>setHistTab(k)} style={{flex:1,border:"none",borderRadius:8,padding:"9px 6px",fontSize:12.5,fontWeight:700,fontFamily:"'Inter',sans-serif",cursor:"pointer",background:histTab===k?"#1A1A1A":"transparent",color:histTab===k?"#fff":"#888888"}}>{l} ({n})</button>
                    ))}
                  </div>
                  {termos.length>0&&<div style={{fontSize:11,color:"#888888",marginBottom:8,fontWeight:600,fontFamily:"'Inter',sans-serif"}}>{lista.length} resultado{lista.length===1?"":"s"} · Total {fmt(lista.filter(t=>!t.excluido).reduce((a,t)=>a+t.valor,0))}</div>}
                  <div style={card}>
                    {lista.length===0
                      ?<div style={{padding:"24px 0",textAlign:"center"}}><div style={{fontSize:32,marginBottom:8}}>🗒️</div><div style={{color:"#888888",fontSize:14,fontFamily:"'Inter',sans-serif",fontWeight:700}}>{termos.length?"Nenhum resultado para a pesquisa.":(histTab==="prog"?"Nenhum lançamento programado.":"Nenhum lançamento neste mês.")}</div></div>
                      :lista.map((t,i)=><LancRow key={t.id} t={t} last={i===lista.length-1} limpo/>)
                    }
                  </div>
                </>
              );
            })()}
          </>
        )}
      </div>

      {!anyModal&&!isFechado&&view!=="caixa"&&view!=="relatorio"&&view!=="metas"&&(
        <button className="fab" onClick={()=>{setProgMode(false);setForm({...emptyForm(),centro:centroPadrao});setErro({});setShowForm(true);}}>
          <span style={{fontSize:20,lineHeight:1}}>+</span> Novo Lançamento
        </button>
      )}
      {!anyModal&&!isFechado&&view==="caixa"&&(
        <button className="fab fab-gold" onClick={()=>{setFormReceita({...emptyFormReceita(),centro:centroPadrao});setErroReceita({});setShowFormReceita(true);}}>
          <span style={{fontSize:20,lineHeight:1}}>+</span> Nova Receita
        </button>
      )}
      {showForm&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setShowForm(false);}}>
          <div className="sheet">
            <div className="handle"/>
            <div style={{fontSize:20,fontWeight:800,color:"#1A1A1A",marginBottom:20,fontFamily:"'Inter',sans-serif"}}>{progMode?"Programar Despesa":"Novo Lançamento"}</div>
            <FormBody form={form} setForm={setForm} erro={erro} setErro={setErro} permiteRecorrencia metasVinc={metas.filter(m=>tipoMeta(m.tipo)==="patrimonio"&&(!m.concluida_em))}/>
            <div style={{height:16}}/>
            <button className="btn-primary" onClick={lancar}>{progMode?"Programar":"Registrar Lançamento"}</button>
            <button className="btn-ghost" onClick={()=>setShowForm(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {showFormReceita&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setShowFormReceita(false);}}>
          <div className="sheet">
            <div className="handle"/>
            <div style={{fontSize:20,fontWeight:800,color:"#00704B",marginBottom:4,fontFamily:"'Inter',sans-serif"}}>Nova Receita</div>
            <div style={{fontSize:11,color:"#888888",marginBottom:18,fontFamily:"'Inter',sans-serif"}}>Registro de recebimento em caixa</div>
            <FormBodyReceita form={formReceita} setForm={setFormReceita} erro={erroReceita} setErro={setErroReceita}/>
            <div style={{height:16}}/>
            <button className="btn-success" onClick={lancarReceita}>Registrar Receita</button>
            <button className="btn-ghost" onClick={()=>setShowFormReceita(false)}>Cancelar</button>
          </div>
        </div>
      )}
      {ctx&&(()=>{
        const it=ctx.item, prog=ctx.kind==="lanc"?it.data>hoje():recProg(it);
        const W=240, Hh=prog?170:130;
        const left=Math.max(8,Math.min(ctx.x,window.innerWidth-W-8)), top=Math.max(8,Math.min(ctx.y,window.innerHeight-Hh-8));
        const ic=(d)=><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>;
        const fecha=()=>setCtx(null);
        return (
          <div style={{position:"fixed",inset:0,zIndex:300}} onClick={fecha} onContextMenu={e=>{e.preventDefault();fecha();}} onWheel={fecha}>
            <div onClick={e=>e.stopPropagation()} onContextMenu={e=>{e.preventDefault();e.stopPropagation();}}
              style={{position:"absolute",left,top,width:W,background:"rgba(40,42,44,0.97)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",border:"1px solid #FFFFFF1F",borderRadius:10,padding:6,boxShadow:"0 10px 30px #00000066"}}>
              <div style={{padding:"6px 12px 8px",borderBottom:"1px solid #FFFFFF1A",marginBottom:4}}>
                <div style={{fontSize:12,color:"#fff",fontWeight:700,fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{it.descricao}</div>
                <div style={{fontSize:11,color:"#A9ADB1",fontFamily:"'Inter',sans-serif"}}>{fmt(it.valor)}</div>
              </div>
              <button className="ctx-item" onClick={()=>{fecha();ctx.kind==="lanc"?openEdit(it):openEditReceita(it);}}>
                {ic(<><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></>)}<span>Editar</span>
              </button>
              {prog&&<button className="ctx-item" onClick={()=>{fecha();ctx.kind==="lanc"?provisionar(it):receberHoje(it);}}>
                {ic(<><polyline points="20 6 9 17 4 12"/></>)}<span>{ctx.kind==="lanc"?"Mover para executado":"Marcar como recebida hoje"}</span>
              </button>}
              <div style={{height:1,background:"#FFFFFF1A",margin:"4px 2px"}}/>
              <button className="ctx-item ctx-red" onClick={()=>{fecha();ctx.kind==="lanc"?setDelItem(it):setDelReceita(it);}}>
                {ic(<><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></>)}<span>Excluir</span>
              </button>
            </div>
          </div>
        );
      })()}
      {acaoReceita&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget&&Date.now()-abertoEm.current>400)setAcaoReceita(null);}}>
          <div className="sheet">
            <div className="handle"/>
            <div style={{fontSize:15,fontWeight:800,color:"#1A1A1A",fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{acaoReceita.descricao}</div>
            <div style={{fontSize:12,color:"#888888",marginBottom:16,fontFamily:"'Inter',sans-serif"}}>{fmt(acaoReceita.valor)} · {perRec(acaoReceita)}</div>
            <button className="btn-primary" onClick={()=>{const r=acaoReceita;setAcaoReceita(null);openEditReceita(r);}}>Editar</button>
            {recProg(acaoReceita)&&<button className="btn-success" style={{marginTop:10}} onClick={()=>{const r=acaoReceita;setAcaoReceita(null);receberHoje(r);}}>Marcar como recebida hoje</button>}
            <button className="btn-danger" onClick={()=>{const r=acaoReceita;setAcaoReceita(null);setDelReceita(r);}}>Excluir</button>
            <button className="btn-ghost" onClick={()=>setAcaoReceita(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {acaoItem&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget&&Date.now()-abertoEm.current>400)setAcaoItem(null);}}>
          <div className="sheet">
            <div className="handle"/>
            <div style={{fontSize:15,fontWeight:800,color:"#1A1A1A",fontFamily:"'Inter',sans-serif",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{acaoItem.descricao}</div>
            <div style={{fontSize:12,color:"#888888",marginBottom:16,fontFamily:"'Inter',sans-serif"}}>{fmt(acaoItem.valor)} · {fmtDate(acaoItem.data)}</div>
            <button className="btn-primary" onClick={()=>{const t=acaoItem;setAcaoItem(null);openEdit(t);}}>Editar</button>
            {acaoItem.data>hoje()&&<button className="btn-success" onClick={()=>{const t=acaoItem;setAcaoItem(null);provisionar(t);}}>Mover para executado</button>}
            <button className="btn-danger" onClick={()=>{const t=acaoItem;setAcaoItem(null);setDelItem(t);}}>Excluir</button>
            <button className="btn-ghost" onClick={()=>setAcaoItem(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {popProg&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setPopProg(false);}}>
          <div className="sheet" style={{maxHeight:"70vh",overflowY:"auto"}}>
            <div className="handle"/>
            <div style={{fontSize:17,fontWeight:800,color:"#1A1A1A",marginBottom:2,fontFamily:"'Inter',sans-serif"}}>Executar</div>
            <div style={{fontSize:11,color:"#888888",marginBottom:10,fontFamily:"'Inter',sans-serif"}}>{agendados.length} conta{agendados.length===1?"":"s"} · {fmt(totalAgendado)}</div>
            {!isFechado&&<button onClick={programarDespesa} style={{width:"100%",background:"#F5F5F5",border:"1px dashed #CC0000",color:"#8A6A1F",borderRadius:10,fontSize:12.5,fontWeight:700,padding:"10px",marginBottom:6,cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>+ Programar despesa</button>}
            {agendados.length===0
              ?<div style={{padding:"16px 0",textAlign:"center",color:"#888888",fontSize:13,fontFamily:"'Inter',sans-serif",fontWeight:700}}>Nada programado neste mês.</div>
              :[...agendados].sort((a,b)=>new Date(a.data)-new Date(b.data)).map((t,i)=>(
                <div key={t.id} style={{...rowDiv(i===agendados.length-1),padding:"10px 0"}}>
                  <div style={{minWidth:0,flex:1}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:"'Inter',sans-serif"}}>{t.descricao}</div>
                    <div style={{fontSize:11,color:"#888888",fontFamily:"'Inter',sans-serif"}}>{fmtDate(t.data)} · {t.categoria}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                    <span style={{fontSize:13,fontWeight:800,color:"#1A1A1A",fontFamily:"'Inter',sans-serif"}}>{fmt(t.valor)}</span>
                    {!isFechado&&<button onClick={()=>provisionar(t)} style={{background:"none",border:"1px solid #B5DCCB",color:"#00875A",borderRadius:8,fontSize:10.5,fontWeight:700,padding:"4px 8px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>executar</button>}
                  </div>
                </div>
              ))
            }
            <button className="btn-ghost" onClick={()=>setPopProg(false)}>Fechar</button>
          </div>
        </div>
      )}
      {editReceita&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setEditReceita(null);}}>
          <div className="sheet">
            <div className="handle"/>
            <div style={{fontSize:20,fontWeight:800,color:"#00704B",marginBottom:4,fontFamily:"'Inter',sans-serif"}}>Editar Receita</div>
            <div style={{fontSize:11,color:"#888888",marginBottom:18,fontFamily:"'Inter',sans-serif"}}>{perRec(editReceita)}</div>
            <FormBodyReceita form={formReceita} setForm={setFormReceita} erro={erroReceita} setErro={setErroReceita}/>
            <div style={{height:16}}/>
            <button className="btn-success" onClick={salvarEdicaoReceita}>Salvar Alterações</button>
            <button className="btn-danger" onClick={()=>{setDelReceita(editReceita);setEditReceita(null);}}>Excluir Receita</button>
            <button className="btn-ghost" onClick={()=>setEditReceita(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {editItem&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setEditItem(null);}}>
          <div className="sheet">
            <div className="handle"/>
            <div style={{fontSize:20,fontWeight:800,color:"#1A1A1A",marginBottom:4,fontFamily:"'Inter',sans-serif"}}>Editar Lançamento</div>
            <div style={{fontSize:11,color:"#888888",marginBottom:18,fontFamily:"'Inter',sans-serif"}}>#{editItem.id} · {fmtDate(editItem.data)}</div>
            <FormBody form={form} setForm={setForm} erro={erro} setErro={setErro} metasVinc={metas.filter(m=>tipoMeta(m.tipo)==="patrimonio"&&(!m.concluida_em))}/>
            <div style={{height:16}}/>
            <button className="btn-primary" onClick={salvarEdicao}>Salvar Alterações</button>
            <button className="btn-danger" onClick={()=>{setDelItem(editItem);setEditItem(null);}}>Excluir Lançamento</button>
            <button className="btn-ghost" onClick={()=>setEditItem(null)}>Cancelar</button>
          </div>
        </div>
      )}
      {delItem&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget){setDelItem(null);setMotivoExc("");setMotivoErr(false);}}}>
          <div className="sheet">
            <div className="handle"/>
            <div style={{fontSize:18,fontWeight:800,color:"#B4483C",marginBottom:6,fontFamily:"'Inter',sans-serif"}}>Excluir Lançamento</div>
            <div style={{fontSize:14,color:"#1A1A1A",marginBottom:2,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{delItem.descricao}</div>
            <div style={{fontSize:13,color:"#888888",marginBottom:20,fontFamily:"'Inter',sans-serif"}}>{fmt(delItem.valor)} · {fmtDate(delItem.data)}</div>
            <div style={{background:"#FBECEA",border:"1px solid #EBBDB633",borderRadius:10,padding:"12px 14px",marginBottom:20,fontSize:13,color:"#B4483C",fontWeight:700,fontFamily:"'Inter',sans-serif"}}>
              Valor excluído da soma de valores.
            </div>
            <label style={FL}>Motivo da Exclusão *</label>
            <textarea placeholder="Descreva o motivo..." value={motivoExc} onChange={e=>{setMotivoExc(e.target.value);setMotivoErr(false);}}
              style={{background:"#FAFAFA",border:`2px solid ${motivoErr?"#B4483C":"#E0E0E0"}`,borderRadius:10,color:"#1A1A1A",padding:"13px 14px",fontSize:14,fontFamily:"'Inter',sans-serif",width:"100%",minHeight:90,resize:"none"}}/>
            {motivoErr&&<div style={{fontSize:11,color:"#B4483C",marginTop:4,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>Informe o motivo da exclusão</div>}
            <div style={{height:16}}/>
            <button className="btn-primary" style={{background:"#B4483C"}} onClick={confirmarExclusao}>Confirmar Exclusão</button>
            <button className="btn-ghost" onClick={()=>{setDelItem(null);setMotivoExc("");setMotivoErr(false);}}>Cancelar</button>
          </div>
        </div>
      )}
      {delReceita&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget){setDelReceita(null);setMotivoExc("");setMotivoErr(false);}}}>
          <div className="sheet">
            <div className="handle"/>
            <div style={{fontSize:18,fontWeight:800,color:"#B4483C",marginBottom:6,fontFamily:"'Inter',sans-serif"}}>Excluir Receita</div>
            <div style={{fontSize:14,color:"#1A1A1A",marginBottom:2,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>{delReceita.descricao}</div>
            <div style={{fontSize:13,color:"#888888",marginBottom:20,fontFamily:"'Inter',sans-serif"}}>{fmt(delReceita.valor)} · {perRec(delReceita)}</div>
            <div style={{background:"#FBECEA",border:"1px solid #EBBDB633",borderRadius:10,padding:"12px 14px",marginBottom:20,fontSize:13,color:"#B4483C",fontWeight:700,fontFamily:"'Inter',sans-serif"}}>
              Este recebimento sai do fluxo de caixa e fica registrado como excluído.
            </div>
            <label style={FL}>Motivo da Exclusão *</label>
            <textarea placeholder="Descreva o motivo..." value={motivoExc} onChange={e=>{setMotivoExc(e.target.value);setMotivoErr(false);}}
              style={{background:"#FAFAFA",border:`2px solid ${motivoErr?"#B4483C":"#E0E0E0"}`,borderRadius:10,color:"#1A1A1A",padding:"13px 14px",fontSize:14,fontFamily:"'Inter',sans-serif",width:"100%",minHeight:90,resize:"none"}}/>
            {motivoErr&&<div style={{fontSize:11,color:"#B4483C",marginTop:4,fontWeight:700,fontFamily:"'Inter',sans-serif"}}>Informe o motivo da exclusão</div>}
            <div style={{height:16}}/>
            <button className="btn-primary" style={{background:"#B4483C"}} onClick={confirmarExclusaoReceita}>Confirmar Exclusão</button>
            <button className="btn-ghost" onClick={()=>{setDelReceita(null);setMotivoExc("");setMotivoErr(false);}}>Cancelar</button>
          </div>
        </div>
      )}
      {formTransf&&(()=>{
        const f=formTransf.f, up=(k,v)=>{setFormTransf(x=>({...x,f:{...x.f,[k]:v}}));setErroGen(e=>({...e,[k==="valorDigits"?"valor":k]:null}));};
        return (
          <Modal onClose={()=>setFormTransf(null)}>
            <div style={{fontSize:20,fontWeight:800,color:"#1A1A1A",marginBottom:4}}>{formTransf.item?"Editar transferência":"Transferência Pico → Isaque"}</div>
            <div style={{fontSize:11,color:"#888888",marginBottom:16,lineHeight:1.45}}>Registra uma vez só: sai do caixa da Pico Barbershop e entra no Isaque. Em Ambos não conta em dobro.</div>
            <label style={FL}>Tipo</label>
            <Chips opcoes={Object.entries(TIPOS_TRANSF)} valor={f.tipo} onChange={v=>up("tipo",v)}/>
            <CampoValor label="Valor *" digits={f.valorDigits} onChange={v=>up("valorDigits",v)} err={erroGen.valor}/>
            <div style={{marginBottom:16}}>
              <label style={FL}>Data *</label>
              <input type="date" style={INP(erroGen.data)} value={f.data} onChange={e=>up("data",e.target.value)}/>
              <ErrTxt msg={erroGen.data}/>
              {f.data>hoje()&&<div style={{background:"#FBECEA",border:"1px solid #EBBDB6",borderRadius:10,padding:"10px 12px",marginTop:8,fontSize:11.5,color:"#8A3A30",fontWeight:600}}>📅 Data futura — fica agendada e só entra nos saldos a partir de {fmtDate(f.data)}.</div>}
            </div>
            <div style={{marginBottom:16}}>
              <label style={FL}>Descrição</label>
              <input style={INP(false)} placeholder={`Ex: ${TIPOS_TRANSF[f.tipo]} ${MESES_NOMES_FULL[new Date().getMonth()].toLowerCase()}`} value={f.descricao} onChange={e=>up("descricao",e.target.value)}/>
            </div>
            <div style={{marginBottom:8}}>
              <label style={FL}>Observação</label>
              <textarea style={{...INP(false),minHeight:60,resize:"none",fontSize:14}} value={f.obs} onChange={e=>up("obs",e.target.value)}/>
            </div>
            <div style={{height:12}}/>
            <button className="btn-primary" style={{background:"#1A1A1A"}} onClick={salvarTransf}>{formTransf.item?"Salvar alterações":"Registrar transferência"}</button>
            <button className="btn-ghost" onClick={()=>setFormTransf(null)}>Cancelar</button>
          </Modal>
        );
      })()}
      {formCat&&(()=>{
        const f=formCat.f, up=(k,v)=>{setFormCat(x=>({...x,f:{...x.f,[k]:v}}));setErroGen(e=>({...e,[k]:null}));};
        return (
          <Modal onClose={()=>setFormCat(null)}>
            <div style={{fontSize:20,fontWeight:800,color:"#1A1A1A",marginBottom:16}}>Nova categoria</div>
            <div style={{marginBottom:16}}>
              <label style={FL}>Nome *</label>
              <input style={INP(erroGen.nome)} placeholder="Ex: Marketing" value={f.nome} onChange={e=>up("nome",e.target.value)} autoFocus
                onKeyDown={e=>{if(e.key==="Enter")salvarCat();}}/>
              <ErrTxt msg={erroGen.nome}/>
            </div>
            <label style={FL}>Aparece em</label>
            <Chips opcoes={[["empresa",VISOES.empresa.nome,VISOES.empresa.cor],["pessoal",VISOES.pessoal.nome,VISOES.pessoal.cor],["ambos","Ambos"]]} valor={f.centro} onChange={v=>up("centro",v)}/>
            <div style={{fontSize:10.5,color:"#888888",margin:"-6px 0 8px",fontWeight:600}}>A cor é escolhida automaticamente, sem repetir as que já estão em uso.</div>
            <div style={{height:12}}/>
            <button className="btn-primary" style={{background:"#1A1A1A"}} onClick={salvarCat}>Criar categoria</button>
            <button className="btn-ghost" onClick={()=>setFormCat(null)}>Cancelar</button>
          </Modal>
        );
      })()}
      {acaoGen&&(()=>{
        const {kind,item}=acaoGen, fecha=()=>setAcaoGen(null);
        const p = kind==="meta" ? progMeta(item, glob) : null;
        return (
          <Modal onClose={fecha}>
            <div style={{fontSize:15,fontWeight:800,color:"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{kind==="meta"?item.nome:(item.descricao||TIPOS_TRANSF[item.tipo])}</div>
            <div style={{fontSize:12,color:"#888888",marginBottom:16}}>
              {kind==="meta" ? `${fmtMeta(item,p.atual)} de ${fmtMeta(item,p.alvo)} · ${(p.pct*100).toFixed(0)}% · ${p.status.txt}` : `${fmt(item.valor)} · ${fmtDate(item.data)} · Pico → Isaque`}
            </div>
            {kind==="meta"&&item.descricao&&<div style={{fontSize:12,color:"#444",background:"#F5F5F5",borderRadius:10,padding:"10px 12px",marginBottom:12,lineHeight:1.45}}>{item.descricao}</div>}
            <button className="btn-primary" style={{background:"#1A1A1A"}} onClick={()=>{fecha(); kind==="meta"?editarMeta(item):editarTransf(item);}}>{kind==="meta"&&["valor","manual"].includes(item.tipo)?"Atualizar progresso / editar":"Editar"}</button>
            {kind==="meta"&&!p.realizada&&!p.mensal&&<button className="btn-success" style={{marginTop:10}} onClick={()=>{fecha();concluirMeta(item);}}>🏆 Marcar como realizada</button>}
            {kind==="meta"&&item.concluida_em&&<button className="btn-ghost" onClick={()=>{fecha();reabrirMeta(item);}}>Reabrir meta</button>}
            {kind==="transf"&&item.data>hoje()&&<button className="btn-success" style={{marginTop:10}} onClick={()=>{fecha();executarTransf(item);}}>Mover para executado</button>}
            <button className="btn-danger" onClick={()=>{fecha();setMotivoExc("");setMotivoErr(false);setDelGen({kind,item});}}>Excluir</button>
            <button className="btn-ghost" onClick={fecha}>Cancelar</button>
          </Modal>
        );
      })()}
      {delGen&&(
        <Modal onClose={()=>{setDelGen(null);setMotivoExc("");setMotivoErr(false);}}>
          <div style={{fontSize:18,fontWeight:800,color:"#B4483C",marginBottom:6}}>{delGen.kind==="meta"?"Excluir meta":"Excluir transferência"}</div>
          <div style={{fontSize:14,color:"#1A1A1A",marginBottom:2,fontWeight:700}}>{delGen.kind==="meta"?delGen.item.nome:(delGen.item.descricao||TIPOS_TRANSF[delGen.item.tipo])}</div>
          <div style={{fontSize:13,color:"#888888",marginBottom:16}}>{delGen.kind==="meta"?`Alvo ${fmtMeta(delGen.item,Number(delGen.item.valor_alvo)||0)}`:`${fmt(delGen.item.valor)} · ${fmtDate(delGen.item.data)}`}</div>
          <label style={FL}>Motivo da Exclusão *</label>
          <textarea placeholder="Descreva o motivo..." value={motivoExc} onChange={e=>{setMotivoExc(e.target.value);setMotivoErr(false);}}
            style={{background:"#FAFAFA",border:`2px solid ${motivoErr?"#B4483C":"#E0E0E0"}`,borderRadius:10,color:"#1A1A1A",padding:"13px 14px",fontSize:14,fontFamily:"'Inter',sans-serif",width:"100%",minHeight:90,resize:"none"}}/>
          <ErrTxt msg={motivoErr?"Informe o motivo da exclusão":null}/>
          <div style={{height:16}}/>
          <button className="btn-primary" style={{background:"#B4483C"}} onClick={confirmarDelGen}>Confirmar Exclusão</button>
          <button className="btn-ghost" onClick={()=>{setDelGen(null);setMotivoExc("");setMotivoErr(false);}}>Cancelar</button>
        </Modal>
      )}
      {showAlertas&&<PainelAlertas alertas={alertas} onClose={()=>setShowAlertas(false)}
        onIgnorar={a=>{ salvaIgn([...ignorados,a.key]); showToast("Alerta retirado"); }}
        onExecutei={async a=>{
          const hj=hoje(), alvo=glob.l.filter(l=>a.ids.includes(l.id));
          const res=await Promise.all(alvo.map(l=>sbPatch(l.id, l.data>hj ? {data:hj,mes:hj.slice(0,7),programado:false} : {programado:false})));
          salvaIgn([...ignorados,a.key]);   // garante que sai do painel mesmo que o banco ainda não tenha a coluna nova
          if(res.every(Boolean)){ load(); showToast("✓ Marcado como executado"); } else showToast("⚠ Não salvou no banco");
        }}
        nIgnorados={ignorados.length} onRestaurar={()=>salvaIgn([])}/>}
      {toast&&<div className="toast">{toast}</div>}
    </div>
  );
}
