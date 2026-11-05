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
    return r.ok ? r.json() : [];
  } catch { return []; }
}
async function sbPost(body) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lancamentos`, { method: "POST", headers: H, body: JSON.stringify(body) });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
async function sbPatch(id, body) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lancamentos?id=eq.${id}`, { method: "PATCH", headers: { ...H, "Prefer": "return=minimal" }, body: JSON.stringify(body) });
    return r.ok;
  } catch { return false; }
}
async function rcGet(mes) {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/receitas?cliente_id=eq.${CID}&mes=eq.${mes}&order=semana.desc`, { headers: H });
    return r.ok ? r.json() : [];
  } catch { return []; }
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
    return r.ok ? r.json() : [];
  } catch { return []; }
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
// Orçamento mensal de uma categoria na visão atual (soma PJ+PF no consolidado)
const orcDe = (nome, visao) => CAT_ROWS
  .filter(r => r.nome===nome && (visao==="ambos" || !r.centro || r.centro==="ambos" || r.centro===visao))
  .reduce((s,r) => s + (Number(r.orcamento)||0), 0);
const statusOrc = pct => pct>=1 ? {cor:"#B4483C",fundo:"#FBECEA",txt:"estourou"} : pct>=0.8 ? {cor:"#A6822E",fundo:"#FBF3E4",txt:"atenção"} : {cor:"#00875A",fundo:"#E6F4EE",txt:"dentro"};
const CORES_CAT = ["#CC0000","#B4483C","#E07A1F","#A6822E","#00875A","#0F8C8C","#2F65AC","#6B4FBB","#B0457E","#5F6B7A","#1A1A1A","#8792A8"];

const MEIOS = ["Crédito","Débito","Dinheiro","Pix"];
// ─── VISÕES (PJ = centro empresa · PF = centro pessoal · Ambos = consolidado) ──
const VISOES = {
  empresa: { sig:"PJ",      nome:"Empresa",     desc:"Só os dados da barbearia",       cor:"#CC0000", fundo:"#FDECEC" },
  pessoal: { sig:"PF",      nome:"Pessoal",     desc:"Só os gastos pessoais do Isaque", cor:"#2F65AC", fundo:"#EEF3FB" },
  ambos:   { sig:"PJ + PF", nome:"Consolidado", desc:"Tudo junto, empresa e pessoal",   cor:"#1A1A1A", fundo:"#F0F0F0" },
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
  const recs = g.r.filter(r=>naVisao(visao,r)&&dataRec(r));
  const ini90 = addDias(hj,-89);
  const primeira = recs.map(dataRec).sort()[0];
  const base = primeira ? Math.min(90, Math.max(1, diasEntre(primeira>ini90?primeira:ini90, hj)+1)) : 0;
  const rec90 = recs.filter(r=>dataRec(r)>=ini90&&dataRec(r)<=hj).reduce((s,r)=>s+r.valor,0);
  const entradasEst = base ? (rec90/base)*dias : 0;
  const semEstimativa = saldoHoje - saidas + transf;
  return { saldoHoje, saidas, nProg:progs.length, transf, entradasEst, semEstimativa, comEstimativa: semEstimativa + entradasEst, baseDias: base };
}
const TIPOS_META = {
  faturamento: { nome:"Faturamento mensal", desc:"Receita do mês até chegar no alvo", auto:true },
  acumular:    { nome:"Juntar valor (reserva)", desc:"Saldo acumulado desde a data de início", auto:true },
  limite:      { nome:"Limite de gasto", desc:"Despesa do mês (total ou de uma categoria) abaixo do alvo", auto:true },
  manual:      { nome:"Manual", desc:"Você atualiza o valor atual (reforma, contratação, etc.)", auto:false },
};
const fracMes = () => { const h=hoje(), [y,m,d]=h.split("-").map(Number); return d/new Date(y,m,0).getDate(); };
// Progresso de uma meta: { atual, alvo, pct, status:{cor,txt,nivel}, detalhe }
function progMeta(mt, g) {
  const hj=hoje(), mh=hj.slice(0,7), alvo=Number(mt.valor_alvo)||0, c=mt.centro||"empresa";
  let atual=0, detalhe="";
  if (mt.tipo==="faturamento") {
    atual = g.r.filter(r=>naVisao(c,r)&&(dataRec(r)||"").slice(0,7)===mh).reduce((s,r)=>s+r.valor,0);
    detalhe = "receita deste mês";
  } else if (mt.tipo==="acumular") {
    atual = (Number(mt.valor_inicial)||0) + saldoPeriodo(g, c, mt.data_inicio||null, hj);
    detalhe = `saldo desde ${mt.data_inicio?fmtDate(mt.data_inicio):"o início"}`;
  } else if (mt.tipo==="limite") {
    atual = g.l.filter(l=>despesaConta(l)&&naVisao(c,l)&&l.mes===mh&&l.data<=hj&&(!mt.categoria||l.categoria===mt.categoria)).reduce((s,l)=>s+l.valor,0);
    detalhe = mt.categoria ? `gasto em ${mt.categoria} neste mês` : "despesa total deste mês";
  } else {
    atual = Number(mt.valor_atual)||0; detalhe = "atualizado manualmente";
  }
  const pct = alvo>0 ? atual/alvo : 0;
  const OK={cor:"#00875A",fundo:"#E6F4EE",nivel:0}, AT={cor:"#A6822E",fundo:"#FBF3E4",nivel:1}, CR={cor:"#B4483C",fundo:"#FBECEA",nivel:2};
  let status;
  if (mt.tipo==="limite") {
    status = pct>1 ? {...CR,txt:"estourou"} : pct>fracMes()+0.1 ? {...AT,txt:"gastando rápido"} : {...OK,txt:"dentro do limite"};
  } else if (pct>=1) status = {...OK,txt:"concluída"};
  else if (mt.prazo && mt.prazo<hj) status = {...CR,txt:"atrasada"};
  else {
    let esperado = null;
    if (mt.tipo==="faturamento") esperado = fracMes();
    else if (mt.prazo && mt.data_inicio && mt.prazo>mt.data_inicio) esperado = Math.min(1, Math.max(0, diasEntre(mt.data_inicio,hj)/diasEntre(mt.data_inicio,mt.prazo)));
    status = esperado!=null && pct < esperado-0.15 ? {...AT,txt:"abaixo do ritmo"} : {...OK,txt:"no ritmo"};
  }
  return { atual, alvo, pct, status, detalhe };
}
// Central de alertas: regras simples, cada uma com motivo, impacto e ação recomendada
function gerarAlertas(g, metas, visao) {
  const hj=hoje(), mh=hj.slice(0,7), out=[];
  const centros = visao==="ambos" ? ["empresa","pessoal"] : [visao];
  // 1) Contas programadas vencendo em até 3 dias
  const vence = g.l.filter(l=>despesaConta(l)&&naVisao(visao,l)&&l.data>hj&&l.data<=addDias(hj,3)).sort((a,b)=>a.data.localeCompare(b.data));
  if (vence.length) out.push({ nivel:1, titulo:`${vence.length} conta${vence.length>1?"s":""} vencendo em até 3 dias`,
    motivo: vence.slice(0,3).map(l=>`${l.descricao} (${fmtDate(l.data)})`).join(", ")+(vence.length>3?"…":""),
    impacto:`${fmt(vence.reduce((s,l)=>s+l.valor,0))} saindo do caixa`, acao:"Confira se há saldo e execute no dia certo." });
  // 2) Caixa previsto negativo em 30 dias (real, sem contar estimativa de entradas)
  centros.forEach(c=>{
    const p = previsao(g, c, 30);
    if (p.semEstimativa<0) out.push({ nivel: p.comEstimativa<0?2:1, titulo:`Caixa ${VISOES[c].sig} pode ficar negativo em 30 dias`,
      motivo:`Saldo hoje ${fmt(p.saldoHoje)}, contas programadas ${fmt(p.saidas)}.`,
      impacto: p.comEstimativa<0 ? `Mesmo com as entradas estimadas, fecha em ${fmt(p.comEstimativa)}.` : `Fecha em ${fmt(p.semEstimativa)} se não entrar dinheiro; com a média de entradas, ${fmt(p.comEstimativa)}.`,
      acao:"Reveja contas programadas ou antecipe recebimentos." });
  });
  // 3) Orçamento por categoria no mês
  const gastoCat = {};
  g.l.filter(l=>despesaConta(l)&&naVisao(visao,l)&&l.mes===mh&&l.data<=hj).forEach(l=>{ gastoCat[l.categoria]=(gastoCat[l.categoria]||0)+l.valor; });
  Object.entries(gastoCat).forEach(([cat,val])=>{
    const lim = orcDe(cat, visao); if (!lim) return;
    const pct = val/lim;
    if (pct>=0.8) out.push({ nivel: pct>=1?2:1, titulo: pct>=1?`Orçamento de ${cat} estourou`:`Orçamento de ${cat} em ${(pct*100).toFixed(0)}%`,
      motivo:`Gasto ${fmt(val)} de ${fmt(lim)} no mês.`, impacto: pct>=1?`${fmt(val-lim)} acima do limite.`:`Restam ${fmt(lim-val)} para o mês.`,
      acao: pct>=1?"Segure novos gastos nessa categoria até o fim do mês.":"Acompanhe os próximos gastos dessa categoria." });
  });
  // 4) Metas atrasadas ou fora do ritmo
  metas.filter(m=>!m.excluido&&naVisao(visao,m)).forEach(m=>{
    const p = progMeta(m, g);
    if (p.status.nivel>0) out.push({ nivel:p.status.nivel, titulo:`Meta "${m.nome}": ${p.status.txt}`,
      motivo:`${fmt(p.atual)} de ${fmt(p.alvo)} (${(p.pct*100).toFixed(0)}%) — ${p.detalhe}.`,
      impacto: m.tipo==="limite"?"Despesa acima do planejado.":"Objetivo pode não ser atingido no prazo.",
      acao: m.tipo==="limite"?"Reduza os gastos ligados a essa meta.":"Reveja o plano ou ajuste o prazo da meta." });
  });
  // 5) Queda de faturamento vs mesmo período do mês anterior (a partir do dia 7)
  const dia = parseInt(hj.slice(8,10),10);
  if (dia>=7) centros.forEach(c=>{
    const [y,m]=mh.split("-").map(Number), ma=`${m===1?y-1:y}-${String(m===1?12:m-1).padStart(2,"0")}`;
    const ate = (r,mk)=>{ const d=dataRec(r)||""; return d.slice(0,7)===mk && parseInt(d.slice(8,10),10)<=dia; };
    const atual = g.r.filter(r=>naVisao(c,r)&&ate(r,mh)).reduce((s,r)=>s+r.valor,0);
    const ant   = g.r.filter(r=>naVisao(c,r)&&ate(r,ma)).reduce((s,r)=>s+r.valor,0);
    if (ant>0 && atual<ant*0.8) out.push({ nivel: atual<ant*0.6?2:1, titulo:`Receita ${VISOES[c].sig} ${(((ant-atual)/ant)*100).toFixed(0)}% abaixo do mês passado`,
      motivo:`Até o dia ${dia}: ${fmt(atual)} agora contra ${fmt(ant)} no mês anterior.`, impacto:`Diferença de ${fmt(ant-atual)}.`,
      acao:"Verifique se todas as receitas foram lançadas e o movimento da agenda." });
  });
  return out.sort((a,b)=>b.nivel-a.nivel);
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
const emptyForm=()=>({centro:"empresa",descricao:"",valorDigits:"",categoria:"",meio:"",data:hoje(),obs:"",recorrente:false,repeticoes:""});
const emptyFormReceita=()=>({centro:"empresa",descricao:"",valorDigits:"",data:hoje(),dataAte:"",obs:""});
function SeletorCentro({valor,onChange}) {
  return (
    <div style={{display:"flex",gap:4,background:"#F0F0F0",borderRadius:10,padding:4,marginBottom:16}}>
      {[["empresa","PJ · Empresa"],["pessoal","PF · Pessoal"]].map(([k,l])=>(
        <button key={k} type="button" onClick={()=>onChange(k)}
          style={{flex:1,border:"none",borderRadius:8,padding:"10px 4px",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontSize:14,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",background:valor===k?VISOES[k].cor:"transparent",color:valor===k?"#fff":"#666"}}>{l}</button>
      ))}
    </div>
  );
}
const INP=err=>({background:"#FAFAFA",border:`2px solid ${err?"#B4483C":"#E0E0E0"}`,borderRadius:10,color:"#1A1A1A",padding:"13px 14px",fontSize:15,fontFamily:"'Inter',sans-serif",width:"100%",transition:"border .2s"});
const FL={fontSize:11,color:"#666666",letterSpacing:"0.08em",textTransform:"uppercase",marginBottom:7,display:"block",fontWeight:700,fontFamily:"'Inter',sans-serif"};
function FormBody({form,setForm,erro,setErro,permiteRecorrencia}) {
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
  const transf=trEf(dados.cur.t), receita=somaV(dados.cur.r), saldo=receita-total+transf;
  const emp=somaV(lc.filter(l=>l.centro!=="pessoal")), pes=somaV(lc.filter(l=>l.centro==="pessoal"));
  const meses = Array.from({length:len},(_,i)=>mAdd(ini,i));
  const decorridos = Math.max(1, meses.filter(k=>k<=mesHoje).length);
  const linhas = meses.map(k=>{
    const d=somaV(lc.filter(l=>l.mes===k)), r=somaV(dados.cur.r.filter(x=>x.mes===k));
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
    {l:"Saldo (receita − despesa)",v:fmt(saldo),sub:(saldo>=0?"positivo":"negativo")+(transf?` · ${transf>0?"+":"−"} ${fmt(Math.abs(transf))} transf. PJ→PF`:""),cor:saldo>=0?"#1A1A1A":"#B4483C"},
    {l:`vs ${rotAnt}`,v:diff!=null?`${diff>0?"+":""}${diff.toFixed(1)}%`:"—",sub:diff!=null?(diff<0?"↓ reduziu":"↑ aumentou"):"sem comparativo",cor:diff!=null?(diff<0?"#00875A":"#B4483C"):"#888888"},
    {l:"Receita",v:fmt(receita),sub:`${dados.cur.r.length} entrada(s)`,cor:"#00875A"},
    {l:"Despesa",v:fmt(total),sub:`${lc.length} lançamentos${len>1?` · média ${fmt(total/decorridos)}/mês`:""}`,cor:"#1A1A1A"},
    visao==="ambos"
      ? {l:"Despesa Empresa (PJ)",v:fmt(emp),sub:`Pessoal (PF) ${fmt(pes)}`,cor:"#CC0000"}
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
  const rotVisao = visao==="ambos" ? " · PJ + PF" : ` · ${VISOES[visao].sig}`;
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
  const receitas  = useMemo(()=>receitasTodas.filter(r=>!r.excluido),[receitasTodas]);

  // Dados de todo o período (início até +3 meses): previsão, metas, alertas e transferências
  const loadGlobal = useCallback(async () => {
    const [g, tRaw, mt] = await Promise.all([
      fetchRange(MES_INICIO, mAdd(hoje().slice(0,7), 3)),
      tbGet("transferencias", "order=data.desc"),
      tbGet("metas", "order=criado_em.asc"),
    ]);
    setTransfRaw(tRaw||[]);
    setGlob({ l:g.l, r:g.r, t:(tRaw||[]).filter(x=>!x.excluido) });
    setMetas((mt||[]).filter(x=>!x.excluido));
  }, []);
  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true);
    const [dAtual, dAnt, rAtual] = await Promise.all([
      sbGet(mesAtual.mes),
      mesAnt ? sbGet(mesAnt.mes) : Promise.resolve([]),
      rcGet(mesAtual.mes),
    ]);
    setAllItems(p => ({...p, [mesAtual.mes]: (dAtual||[]), ...(mesAnt ? {[mesAnt.mes]: (dAnt||[])} : {})}));
    setAllReceitas(p => ({...p, [mesAtual.mes]: rAtual||[]}));
    setLastSync(new Date());
    if (!silent) { setLoading(false); loadGlobal(); }
  }, [mesAtual.mes, mesAnt, loadGlobal]);

  const modalNovo = !!formTransf || !!formMeta || !!formCat || !!delGen || !!acaoGen || showAlertas;
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
  const agendados  = useMemo(()=>ativos.filter(t=>!isLiq(t) && t.data>hoje()),[ativos]);
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
  const alertas   = useMemo(()=>gerarAlertas(glob, metas, visao),[glob,metas,visao]);
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
      recorrente: !!form.recorrente, motivo_exclusao: "",
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
        novas.push({...item, id: uid(), mes: dt.slice(0,7), data: dt});
      }
      const resultados = await Promise.all(novas.map(x=>sbPost(x)));
      extras = resultados.filter(Boolean).length;
    }
    load();
    showToast((form.recorrente ? `✓ Registrado + ${extras} recorrência${extras===1?"":"s"}` : "✓ Lançamento registrado")+foraDaVisao(item.centro));
  };
  // Aviso quando o registro vai para o outro centro e some da visão atual
  const foraDaVisao = c => visao!=="ambos" && (c||"empresa")!==visao ? ` na ${VISOES[c||"empresa"].sig}` : "";
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
    setForm({centro:item.centro||"empresa",descricao:item.descricao,valorDigits:float2d(item.valor),categoria:item.categoria,meio:item.meio,data:item.data,obs:item.obs||""});
    setErro({});setEditItem(item);
  };
  const salvarEdicao=async ()=>{
    const e=validar(form);
    if(Object.keys(e).length){setErro(e);return;}
    const ok = await sbPatch(editItem.id, {
      descricao: form.descricao.trim(), valor: d2float(form.valorDigits),
      categoria: form.categoria, meio: form.meio, data: form.data, centro: form.centro||"empresa",
      mes: form.data.slice(0,7), obs: form.obs,
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
    };
    window.addEventListener("keydown",h);
    return ()=>window.removeEventListener("keydown",h);
  },[]);
  const programarDespesa=()=>{
    setPopProg(false);setProgMode(true);
    setForm({...emptyForm(),centro:centroPadrao,data:amanha()});setErro({});setShowForm(true);
  };
  const provisionar=async t=>{
    const ok = await sbPatch(t.id, { data: hoje(), mes: hoje().slice(0,7) });
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
    if(ok){ load(); showToast(ed?"✓ Transferência atualizada":"✓ Transferência PJ → PF registrada"); }
    else showToast("⚠ Não salvou — falta criar a tabela no Supabase");
  };
  const executarTransf = async t => { if(await tbPatch("transferencias", t.id, { data:hoje(), mes:hoje().slice(0,7) })){ load(); showToast("✓ Movido para executado"); } };

  // ─── Metas ───
  const novaMeta = () => { setErroGen({}); setFormMeta({ f:{ nome:"", descricao:"", tipo:"faturamento", centro:centroPadrao, categoria:"", iniDigits:"", alvoDigits:"", atualDigits:"", data_inicio:hoje(), prazo:"" } }); };
  const editarMeta = m => { setErroGen({}); setFormMeta({ item:m, f:{ nome:m.nome||"", descricao:m.descricao||"", tipo:m.tipo||"manual", centro:m.centro||"empresa", categoria:m.categoria||"",
    iniDigits:m.valor_inicial?float2d(Number(m.valor_inicial)):"", alvoDigits:m.valor_alvo?float2d(Number(m.valor_alvo)):"", atualDigits:m.valor_atual?float2d(Number(m.valor_atual)):"", data_inicio:m.data_inicio||hoje(), prazo:m.prazo||"" } }); };
  const salvarMeta = async () => {
    const f=formMeta.f, e={};
    if(!f.nome.trim()) e.nome="Campo obrigatório";
    if(!f.alvoDigits||parseInt(f.alvoDigits)===0) e.alvo="Informe o valor-alvo";
    if(f.tipo==="acumular"&&!f.data_inicio) e.data_inicio="Informe a data de início";
    if(f.prazo&&f.data_inicio&&f.prazo<f.data_inicio) e.prazo="O prazo deve ser depois do início";
    if(Object.keys(e).length){ setErroGen(e); return; }
    const body = { nome:f.nome.trim(), descricao:f.descricao.trim(), tipo:f.tipo, centro:f.centro, categoria:f.tipo==="limite"&&f.categoria?f.categoria:null,
      valor_inicial:d2float(f.iniDigits), valor_alvo:d2float(f.alvoDigits), valor_atual:d2float(f.atualDigits), data_inicio:f.data_inicio||null, prazo:f.prazo||null };
    const ed = formMeta.item;
    const ok = ed ? await tbPatch("metas", ed.id, body)
                  : !!(await tbPost("metas", { ...body, id:uid(), cliente_id:CID, excluido:false, motivo_exclusao:"", criado_em:new Date().toISOString() }));
    setFormMeta(null);
    if(ok){ loadGlobal(); showToast(ed?"✓ Meta atualizada":"✓ Meta criada"); }
    else showToast("⚠ Não salvou — falta criar a tabela no Supabase");
  };

  // ─── Categorias (inserir nova / editar cor e orçamento) ───
  const novaCat = () => { setErroGen({}); setFormCat({ f:{ nome:"", centro:centroPadrao, cor:CORES_CAT[0], orcDigits:"" } }); };
  const editarCat = row => { setErroGen({}); setFormCat({ item:row, f:{ nome:row.nome, centro:row.centro||"ambos", cor:row.cor||CORES_CAT[0], orcDigits:row.orcamento?float2d(Number(row.orcamento)):"" } }); };
  const salvarCat = async () => {
    const f=formCat.f, ed=formCat.item, e={};
    const nome=f.nome.trim().replace(/\s+/g," ");
    if(!ed){
      if(!nome) e.nome="Campo obrigatório";
      else if(CAT_ROWS.some(r=>normC(r.nome)===normC(nome)&&(r.centro||"ambos")===f.centro)) e.nome="Já existe essa categoria nesse centro";
    }
    if(Object.keys(e).length){ setErroGen(e); return; }
    const orc = f.orcDigits ? d2float(f.orcDigits) : null;
    let ok;
    if(ed){
      ok = await tbPatch("categorias", ed.id, { cor:f.cor, orcamento:orc }) || await tbPatch("categorias", ed.id, { cor:f.cor });
    } else {
      const body = { cliente_id:CID, nome, cor:f.cor, centro:f.centro==="ambos"?null:f.centro };
      ok = !!(await tbPost("categorias", { ...body, orcamento:orc })) || !!(await tbPost("categorias", body));
    }
    setFormCat(null);
    if(ok){ await carregarCats(); showToast(ed?"✓ Categoria atualizada":`✓ Categoria "${nome}" criada`); }
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

  const anyModal=showForm||showFormReceita||!!editItem||!!delItem||!!delReceita||!!editReceita||popProg||!!acaoItem||!!acaoReceita;
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
            {t.centro&&!t.excluido&&<span className="badge" style={{background:t.centro==="pessoal"?"#EEF3FB":"#FDECEC",color:t.centro==="pessoal"?"#2F65AC":"#CC0000",border:`1px solid ${t.centro==="pessoal"?"#C9D8EE":"#F2C4C4"}`}}>{t.centro==="pessoal"?"Pessoal":"Empresa"}</span>}
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
        <div style={{fontSize:15,fontWeight:800,color:exc?"#bbb":"#00875A",fontFamily:"'Inter',sans-serif"}}>{fmt(r.valor)}</div>
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
          <div style={{position:"relative",flexShrink:0}}>
            <button onClick={()=>setMenuVisao(o=>!o)} title="Trocar visualização"
              style={{display:"flex",alignItems:"center",gap:8,background:VISOES[visao].fundo,border:`2px solid ${VISOES[visao].cor}33`,borderRadius:50,padding:"4px 10px 4px 4px",cursor:"pointer",fontFamily:"'Inter',sans-serif"}}>
              <span style={{width:32,height:32,borderRadius:"50%",background:VISOES[visao].cor,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>
              </span>
              <span style={{fontSize:12,fontWeight:800,color:VISOES[visao].cor,letterSpacing:"0.04em",whiteSpace:"nowrap"}}>{VISOES[visao].sig}</span>
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
                        <span style={{minWidth:46,textAlign:"center",background:v.cor,color:"#fff",borderRadius:8,padding:"5px 6px",fontSize:11,fontWeight:800}}>{v.sig}</span>
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
          <div style={{position:"absolute",right:0,display:"flex",gap:4}}>
            {isFechado&&<span className="badge" style={{background:"#F2F1EC",color:"#666666",border:"1px solid #E0E0E0"}}>Fechado</span>}
            {!isFechado&&items.length>0&&<span className="badge" style={{background:"#FBF3E4",color:"#A6822E",border:"1px solid #EAD9AE"}}>Parcial</span>}
          </div>
        </div>
        <nav className="navtabs" style={{display:"flex",marginTop:2,overflowX:"auto"}}>
          {[["caixa","Caixa"],["inicio","Despesa"],["categorias","Categorias"],["historico","Histórico"],["relatorio","Relatório"]].map(([v,l])=>(
            <button key={v} className="tab" onClick={()=>setView(v)}
              style={{flex:"1 0 auto",whiteSpace:"nowrap",background:"none",border:"none",borderBottom:view===v?"2.5px solid #CC0000":"2.5px solid transparent",color:view===v?"#CC0000":"#888888",padding:"10px 5px",fontSize:10,letterSpacing:"0.02em",textTransform:"uppercase",cursor:"pointer",fontFamily:"'Inter',sans-serif",fontWeight:800,transition:"all .2s"}}>
              {l}
            </button>
          ))}
        </nav>
      </div>

      <div style={{padding:"20px 16px 120px"}}>
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
                  <div style={{fontSize:fmt(totalProgramado).length<=11?16:13,fontWeight:800,color:"#8A6A1F",lineHeight:1.1,fontFamily:"'Inter',sans-serif"}}>{fmt(totalProgramado)}</div>
                  <div style={{fontSize:9.5,color:"#888888",marginTop:6,fontWeight:600,lineHeight:1.35,fontFamily:"'Inter',sans-serif"}}>
                    {agendados.length>0?`inclui ${fmt(totalAgendado)} a entrar (${agendados.length})`:"nada agendado"}
                  </div>
                </div>
              </div>
            </div>
            {visao==="ambos"&&total>0&&<div style={{...card,padding:"14px 16px"}}>
              {[["Empresa (PJ)","empresa","#CC0000"],["Pessoal (PF)","pessoal","#2F65AC"]].map(([l,k,c],i)=>{
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
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
                <div style={{background:"#E6F4EE",borderRadius:12,padding:"14px",border:"1px solid #B5DCCB"}}>
                  <div style={{fontSize:9,letterSpacing:"0.15em",color:"#00704B",textTransform:"uppercase",fontWeight:800,marginBottom:4}}>Receita</div>
                  <div style={{fontSize:22,fontWeight:800,color:"#00704B",lineHeight:1,fontFamily:"'Inter',sans-serif"}}>{fmt(totalReceita)}</div>
                  <div style={{fontSize:10,color:"#666666",marginTop:4,fontWeight:600}}>{receitas.length} entrada(s)</div>
                </div>
                <div style={{background:"#FBECEA",borderRadius:12,padding:"14px",border:"1px solid #EBBDB6"}}>
                  <div style={{fontSize:9,letterSpacing:"0.15em",color:"#8A3A30",textTransform:"uppercase",fontWeight:800,marginBottom:4}}>Despesa</div>
                  <div style={{fontSize:22,fontWeight:800,color:"#8A3A30",lineHeight:1,fontFamily:"'Inter',sans-serif"}}>{fmt(total)}</div>
                  <div style={{fontSize:10,color:"#666666",marginTop:4,fontWeight:600}}>{contaveis.length} saída(s)</div>
                </div>
              </div>
              <div style={{background:saldo>=0?"#E6F4EE":"#FBF3E4",borderRadius:12,padding:"16px 18px",border:`2px solid ${saldo>=0?"#00875A":"#A6822E"}`}}>
                <div style={{fontSize:10,letterSpacing:"0.15em",color:saldo>=0?"#00875A":"#8A6A1F",textTransform:"uppercase",fontWeight:800,marginBottom:4}}>Saldo do Mês</div>
                <div style={{display:"flex",alignItems:"baseline",gap:10}}>
                  <div style={{fontSize:28,fontWeight:800,color:saldo>=0?"#00875A":"#8A6A1F",lineHeight:1,fontFamily:"'Inter',sans-serif"}}>{fmt(saldo)}</div>
                  <div style={{fontSize:11,color:"#666666",fontWeight:700}}>{saldo>=0?"positivo":"negativo"}</div>
                </div>
              </div>
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
              <div style={{fontSize:11,color:"#888888",fontWeight:700}}>{receitas.length} entrada(s)</div>
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
          </>
        )}
        {view==="categorias"&&(
          <>
            <div style={{fontSize:22,fontWeight:800,color:"#1A1A1A",marginBottom:18,fontFamily:"'Inter',sans-serif"}}>Por Categoria</div>
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
          </>
        )}
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

      {!anyModal&&!isFechado&&view!=="caixa"&&view!=="relatorio"&&(
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
            <FormBody form={form} setForm={setForm} erro={erro} setErro={setErro} permiteRecorrencia/>
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
        const it=ctx.item, prog=ctx.kind==="lanc"&&it.data>hoje();
        const W=230, Hh=ctx.kind==="lanc"?(prog?170:130):130;
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
              {prog&&<button className="ctx-item" onClick={()=>{fecha();provisionar(it);}}>
                {ic(<><polyline points="20 6 9 17 4 12"/></>)}<span>Mover para executado</span>
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
            <FormBody form={form} setForm={setForm} erro={erro} setErro={setErro}/>
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
      {toast&&<div className="toast">{toast}</div>}
    </div>
  );
}
