import { useState, useEffect, useMemo } from "react";

// ─── SUPABASE ─────────────────────────────────────────────────────────────────────
const SUPA_URL = "https://oltwaosdzgvbbvermilk.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHdhb3Nkemd2YmJ2ZXJtaWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NDU3MjksImV4cCI6MjA5NDEyMTcyOX0.WbDR65w6eywTgLc4Lwii_63RrJwKPN9oj1DsgjxeFBo";
const CID = "pico";
const H = {
  "Content-Type": "application/json",
  "apikey": SUPA_KEY,
  "Authorization": `Bearer ${SUPA_KEY}`,
  "Prefer": "return=representation",
};

const sbGet = async (mes) => {
  try {
    const r = await fetch(
      `${SUPA_URL}/rest/v1/lancamentos?cliente_id=eq.${CID}&mes=eq.${mes}&order=data.desc`,
      { headers: H }
    );
    return r.ok ? r.json() : [];
  } catch { return []; }
};

const sbPost = async (body) => {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lancamentos`, {
      method: "POST", headers: H, body: JSON.stringify(body),
    });
    return r.ok ? r.json() : null;
  } catch { return null; }
};

const sbPatch = async (id, body) => {
  try {
    const r = await fetch(`${SUPA_URL}/rest/v1/lancamentos?id=eq.${id}`, {
      method: "PATCH",
      headers: { ...H, "Prefer": "return=minimal" },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch { return false; }
};

// ─── CONSTANTES ───────────────────────────────────────────────────────────────────
// Categorias completas conforme planilha real
const CATS_EMP = [
  "Administrativo", "Funcionário", "Infraestrutura",
  "Insumos", "Investimento", "Marketing", "Outros"
];
const CATS_PES = [
  "Alimentação", "Compromissos Financeiros", "Lazer",
  "Moradia", "Reserva", "Transporte", "Outros"
];
const MEIOS = ["Crédito", "Débito", "Dinheiro", "Pix"];

// Gera meses dinamicamente: 3 meses antes até 3 depois do mês atual
const NOMES_MES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
function gerarMeses() {
  const arr = [];
  const labels = {};
  const hj = new Date();
  for (let i = -3; i <= 3; i++) {
    const d = new Date(hj.getFullYear(), hj.getMonth() + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    arr.push(key);
    labels[key] = `${NOMES_MES[d.getMonth()]} ${d.getFullYear()}`;
  }
  return { arr, labels, idxAtual: 3 }; // índice 3 = mês atual
}
const { arr: MESES, labels: ML, idxAtual: IDX_ATUAL } = gerarMeses();

const CAT_COR = {
  "Funcionário":               "#CC0000",
  "Infraestrutura":            "#555555",
  "Administrativo":            "#333333",
  "Insumos":                   "#AA2222",
  "Investimento":              "#777777",
  "Marketing":                 "#BB3333",
  "Outros":                    "#999999",
  "Alimentação":               "#444444",
  "Compromissos Financeiros":  "#CC0000",
  "Lazer":                     "#888888",
  "Moradia":                   "#555555",
  "Reserva":                   "#AAAAAA",
  "Transporte":                "#333333",
};

const fmt  = v => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const hoje = () => new Date().toISOString().slice(0, 10);
const uid  = () => crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now();
const fd   = d => { const [, m, day] = d.split("-"); return `${day}/${m}`; };

// ─── CSS ──────────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;500;600;700&display=swap');
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #F5F5F5; font-family: 'Barlow Condensed', sans-serif; color: #1A1A1A; min-height: 100vh; }

.inp { width: 100%; border: 2px solid #E0E0E0; border-radius: 8px; padding: 12px 14px; font-size: 15px; font-family: 'Barlow Condensed', sans-serif; letter-spacing: .04em; background: #FFFFFF; color: #1A1A1A; outline: none; transition: border .18s; -webkit-appearance: none; appearance: none; }
.inp:focus { border-color: #CC0000; box-shadow: 0 0 0 3px rgba(204,0,0,0.08); }
.inp::placeholder { color: #BBBBBB; }
.inp-err { border-color: #CC0000 !important; }

.btn { width: 100%; border: none; border-radius: 10px; padding: 15px; font-size: 14px; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; cursor: pointer; transition: all .2s; }
.btn-main { background: #CC0000; color: #FFFFFF; }
.btn-main:hover { background: #AA0000; }
.btn-main:disabled { background: #DDDDDD; color: #999999; cursor: not-allowed; }
.btn-ghost { background: #FFFFFF; border: 2px solid #DDDDDD; color: #666666; margin-top: 10px; }
.btn-ghost:hover { border-color: #999999; color: #333333; }
.btn-del { background: #FFFFFF; border: 2px solid #CC0000; color: #CC0000; margin-top: 10px; }
.btn-del:hover { background: #CC0000; color: #FFFFFF; }

.fab { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #CC0000; color: #FFFFFF; border: none; border-radius: 50px; padding: 14px 28px; font-size: 14px; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; cursor: pointer; box-shadow: 0 6px 20px rgba(204,0,0,0.35); z-index: 90; white-space: nowrap; display: flex; align-items: center; gap: 8px; transition: all .2s; }
.fab:hover { background: #AA0000; transform: translateX(-50%) translateY(-2px); }
.fab:active { transform: translateX(-50%) scale(.97); }

.overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 200; display: flex; align-items: flex-end; backdrop-filter: blur(2px); }
.sheet { background: #FFFFFF; border-radius: 20px 20px 0 0; padding: 8px 20px 48px; width: 100%; max-width: 480px; margin: 0 auto; max-height: 92vh; overflow-y: auto; animation: sheetUp .26s cubic-bezier(.32,.72,0,1); }
@keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
.handle { width: 36px; height: 4px; background: #EEEEEE; border-radius: 2px; margin: 12px auto 20px; }

.row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 13px 0; border-bottom: 1px solid #F0F0F0; }
.row:last-child { border-bottom: none; }

.seg { cursor: pointer; border-radius: 8px; border: 2px solid #E0E0E0; padding: 11px; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; font-size: 13px; letter-spacing: .06em; text-align: center; transition: all .18s; flex: 1; background: #FFFFFF; color: #888888; user-select: none; }
.seg.on { background: #CC0000; border-color: #CC0000; color: #FFFFFF; }

.tab-b { flex: 1; background: none; border: none; border-bottom: 2.5px solid transparent; color: #AAAAAA; padding: 10px 4px; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; cursor: pointer; font-family: 'Barlow Condensed', sans-serif; font-weight: 700; transition: all .2s; }
.tab-b.on { color: #CC0000; border-bottom-color: #CC0000; }
.tab-b:hover { color: #333333; }

.coll { background: #FFFFFF; border-radius: 12px; margin-bottom: 10px; overflow: hidden; border: 1px solid #EEEEEE; box-shadow: 0 1px 4px rgba(0,0,0,0.05); }
.coll-h { padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background .15s; }
.coll-h:hover { background: #FAFAFA; }
.coll-b { border-top: 1px solid #F5F5F5; padding: 0 16px; }

.badge-rec { display: inline-block; background: #FFF0F0; color: #CC0000; border: 1px solid #FFCCCC; border-radius: 4px; padding: 1px 6px; font-size: 9px; font-weight: 700; margin-left: 6px; letter-spacing: .06em; }

.toast { position: fixed; bottom: 100px; left: 50%; transform: translateX(-50%); background: #1A1A1A; color: #FFFFFF; padding: 11px 22px; border-radius: 50px; font-family: 'Barlow Condensed', sans-serif; font-size: 12px; letter-spacing: .1em; text-transform: uppercase; z-index: 500; white-space: nowrap; pointer-events: none; animation: toastIn .22s ease; }
@keyframes toastIn { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }

.spin { display: inline-block; width: 14px; height: 14px; border: 2px solid #EEEEEE; border-top-color: #CC0000; border-radius: 50%; animation: spin .7s linear infinite; vertical-align: middle; }
@keyframes spin { to { transform: rotate(360deg); } }

::-webkit-scrollbar { width: 3px; }
::-webkit-scrollbar-thumb { background: #DDDDDD; border-radius: 2px; }
`;

// ─── BAR ──────────────────────────────────────────────────────────────────────────
function Bar({ p, color }) {
  return (
    <div style={{ background: "#F0F0F0", borderRadius: 3, height: 4, overflow: "hidden", marginTop: 4 }}>
      <div style={{ width: `${Math.min(Math.max(p, 0), 100)}%`, background: color, height: "100%", borderRadius: 3, transition: "width .5s ease" }} />
    </div>
  );
}

// ─── FORM NOVO LANÇAMENTO ─────────────────────────────────────────────────────────
function FormSheet({ mes, onSaved, onClose }) {
  const [cls,  setCls]  = useState("empresa");
  const [cat,  setCat]  = useState("");
  const [desc, setDesc] = useState("");
  const [val,  setVal]  = useState("");
  const [meio, setMeio] = useState("Pix");
  const [data, setData] = useState(mes + "-" + new Date().toISOString().slice(8, 10));
  const [obs,  setObs]  = useState("");
  const [rec,  setRec]  = useState(false);
  const [reps, setReps] = useState(3);
  const [err,  setErr]  = useState({});
  const [busy, setBusy] = useState(false);

  const cats = cls === "empresa" ? CATS_EMP : CATS_PES;

  const set = (k, v) => {
    if (k === "cls") { setCls(v); setCat(""); }
    else if (k === "cat")  setCat(v);
    else if (k === "desc") setDesc(v);
    else if (k === "val")  setVal(v);
    else if (k === "meio") setMeio(v);
    else if (k === "data") setData(v);
    else setObs(v);
    setErr(e => ({ ...e, [k]: false }));
  };

  const salvar = async () => {
    const e = {};
    if (!cat)          e.cat  = true;
    if (!desc.trim())  e.desc = true;
    const v = parseFloat(val.replace(",", "."));
    if (!v || v <= 0)  e.val  = true;
    if (!data)         e.data = true;
    if (Object.keys(e).length) { setErr(e); return; }
    setBusy(true);
    const baseMes = data.slice(0, 7);
    const item = {
      id:              uid(),
      cliente_id:      CID,
      mes:             baseMes,
      centro:          cls,
      categoria:       cat,
      descricao:       desc.trim(),
      valor:           v,
      meio,
      data,
      obs,
      excluido:        false,
      recorrente:      rec,
      motivo_exclusao: "",
    };
    const res = await sbPost(item);
    // Se recorrente, gera lançamentos nos próximos meses
    if (res && rec && reps > 1) {
      const [ano, mesN, dia] = data.split("-").map(Number);
      for (let i = 1; i < reps; i++) {
        const d = new Date(ano, mesN - 1 + i, dia);
        const novaData = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        await sbPost({
          id: uid(), cliente_id: CID, mes: novaData.slice(0, 7),
          centro: cls, categoria: cat, descricao: desc.trim(), valor: v,
          meio, data: novaData, obs, excluido: false, recorrente: true, motivo_exclusao: "",
        });
      }
    }
    setBusy(false);
    if (res) { onSaved(); onClose(); }
    else setErr({ geral: "Erro ao salvar. Verifique a conexão." });
  };

  const LBL = { fontSize: 10, color: "#777777", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 7 };
  const E = ({ k }) => err[k] ? <div style={{ fontSize: 11, color: "#CC0000", marginTop: 4, fontWeight: 600 }}>Obrigatório</div> : null;

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="handle" />
        <div style={{ fontSize: 24, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: ".08em", color: "#1A1A1A", marginBottom: 20 }}>
          Nova Despesa
        </div>

        {err.geral && (
          <div style={{ background: "#FFF0F0", border: "1px solid #FFCCCC", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#CC0000", marginBottom: 14, fontWeight: 600 }}>
            {err.geral}
          </div>
        )}

        {/* Tipo */}
        <div style={{ marginBottom: 16 }}>
          <span style={LBL}>Tipo *</span>
          <div style={{ display: "flex", gap: 10 }}>
            {[["empresa", "🏢 Empresa"], ["pessoal", "👤 Pessoal"]].map(([v, l]) => (
              <div key={v} className={`seg${cls === v ? " on" : ""}`} onClick={() => set("cls", v)}>{l}</div>
            ))}
          </div>
        </div>

        {/* Categoria */}
        <div style={{ marginBottom: 16 }}>
          <label style={LBL}>Categoria *</label>
          <select className={`inp${err.cat ? " inp-err" : ""}`} value={cat} onChange={e => set("cat", e.target.value)}>
            <option value="">Selecione…</option>
            {cats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <E k="cat" />
        </div>

        {/* Descrição */}
        <div style={{ marginBottom: 16 }}>
          <label style={LBL}>Descrição *</label>
          <input className={`inp${err.desc ? " inp-err" : ""}`}
            placeholder="Ex: Pagamento Lucas, Fornecedor…"
            value={desc} onChange={e => set("desc", e.target.value)} />
          <E k="desc" />
        </div>

        {/* Valor */}
        <div style={{ marginBottom: 16 }}>
          <label style={LBL}>Valor (R$) *</label>
          <input className={`inp${err.val ? " inp-err" : ""}`}
            type="number" inputMode="decimal" placeholder="0,00"
            value={val} onChange={e => set("val", e.target.value)} />
          <E k="val" />
        </div>

        {/* Meio + Data */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <div>
            <label style={LBL}>Meio de Pag.</label>
            <select className="inp" value={meio} onChange={e => set("meio", e.target.value)}>
              {MEIOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Data *</label>
            <input className={`inp${err.data ? " inp-err" : ""}`} type="date" value={data} onChange={e => set("data", e.target.value)} />
            <E k="data" />
          </div>
        </div>

        {/* Obs */}
        <div style={{ marginBottom: 14 }}>
          <label style={LBL}>Observação</label>
          <textarea className="inp" style={{ minHeight: 56, resize: "none", fontSize: 13 }}
            placeholder="Opcional…" value={obs} onChange={e => set("obs", e.target.value)} />
        </div>

        {/* Recorrente */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid #F5F5F5", marginBottom: rec ? 12 : 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>Despesa Recorrente</div>
            <div style={{ fontSize: 11, color: "#AAAAAA", marginTop: 1 }}>Repete nos próximos meses</div>
          </div>
          <div
            style={{ width: 44, height: 24, borderRadius: 12, cursor: "pointer", background: rec ? "#CC0000" : "#E0E0E0", display: "flex", alignItems: "center", padding: 2, transition: "background .2s", flexShrink: 0 }}
            onClick={() => setRec(r => !r)}>
            <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.15)", transition: "transform .2s", transform: rec ? "translateX(20px)" : "none" }} />
          </div>
        </div>

        {/* Quantidade de repetições */}
        {rec && (
          <div style={{ background: "#FFF5F5", border: "1px solid #FFD5D5", borderRadius: 10, padding: "14px", marginBottom: 20 }}>
            <label style={LBL}>Quantas vezes repetir? (1 a 24)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div
                onClick={() => setReps(r => Math.max(1, r - 1))}
                style={{
                  width: 44, height: 44, borderRadius: 10, cursor: "pointer",
                  border: "2px solid #E0E0E0", background: "#FFFFFF", color: "#CC0000",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 700, userSelect: "none", flexShrink: 0,
                }}>−</div>
              <input
                type="number" inputMode="numeric" min="1" max="24"
                value={reps}
                onChange={e => {
                  let n = parseInt(e.target.value) || 1;
                  if (n < 1) n = 1;
                  if (n > 24) n = 24;
                  setReps(n);
                }}
                style={{
                  flex: 1, textAlign: "center", border: "2px solid #E0E0E0",
                  borderRadius: 10, padding: "11px", fontSize: 22, fontWeight: 700,
                  color: "#1A1A1A", fontFamily: "'Bebas Neue',sans-serif",
                  letterSpacing: ".05em", outline: "none", background: "#FFFFFF",
                  MozAppearance: "textfield", appearance: "textfield",
                }} />
              <div
                onClick={() => setReps(r => Math.min(24, r + 1))}
                style={{
                  width: 44, height: 44, borderRadius: 10, cursor: "pointer",
                  border: "2px solid #E0E0E0", background: "#FFFFFF", color: "#CC0000",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 22, fontWeight: 700, userSelect: "none", flexShrink: 0,
                }}>+</div>
            </div>
            <div style={{ fontSize: 11, color: "#CC0000", marginTop: 10, fontWeight: 600 }}>
              {reps === 1
                ? "Será lançado apenas este mês"
                : `Será lançado este mês + ${reps - 1} mês(es) seguinte(s)`}
            </div>
          </div>
        )}

        <button className="btn btn-main" onClick={salvar} disabled={busy}>
          {busy ? <><span className="spin" /> Salvando…</> : "✓ Registrar Lançamento"}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── EXCLUIR ──────────────────────────────────────────────────────────────────────
function DelSheet({ item, onDone, onClose }) {
  const [motivo, setMotivo] = useState("");
  const [err,    setErr]    = useState(false);
  const [busy,   setBusy]   = useState(false);

  const confirmar = async () => {
    if (!motivo.trim()) { setErr(true); return; }
    setBusy(true);
    const ok = await sbPatch(item.id, { excluido: true, motivo_exclusao: motivo.trim() });
    setBusy(false);
    if (ok) { onDone(); onClose(); }
  };

  return (
    <div className="overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet">
        <div className="handle" />
        <div style={{ fontSize: 22, fontFamily: "'Bebas Neue',sans-serif", color: "#CC0000", marginBottom: 6 }}>Excluir Lançamento</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A", marginBottom: 2 }}>{item.descricao}</div>
        <div style={{ fontSize: 13, color: "#888888", marginBottom: 18 }}>{fmt(item.valor)} · {fd(item.data)}</div>
        <div style={{ background: "#FFF8F8", border: "1px solid #FFCCCC", borderRadius: 10, padding: "12px 14px", marginBottom: 18, fontSize: 13, color: "#CC0000", fontWeight: 600 }}>
          O valor será excluído da soma total.
        </div>
        <label style={{ fontSize: 10, color: "#777777", letterSpacing: ".12em", textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 7 }}>Motivo *</label>
        <textarea
          className={`inp${err ? " inp-err" : ""}`}
          style={{ minHeight: 76, resize: "none" }}
          placeholder="Descreva o motivo da exclusão…"
          value={motivo}
          onChange={e => { setMotivo(e.target.value); setErr(false); }} />
        {err && <div style={{ fontSize: 11, color: "#CC0000", marginTop: 4, fontWeight: 600 }}>Informe o motivo</div>}
        <div style={{ height: 16 }} />
        <button className="btn btn-del" onClick={confirmar} disabled={busy}>
          {busy ? <><span className="spin" /> Excluindo…</> : "Confirmar Exclusão"}
        </button>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

// ─── APP ─────────────────────────────────────────────────────────────────────────
export default function AppIsaque() {
  const [mesIdx,   setMesIdx]   = useState(IDX_ATUAL);
  const [items,    setItems]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState("inicio");
  const [showForm, setShowForm] = useState(false);
  const [del,      setDel]      = useState(null);
  const [toast,    setToast]    = useState(null);
  const [collE,    setCollE]    = useState(true);
  const [collP,    setCollP]    = useState(true);

  const mes = MESES[mesIdx];

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const d = await sbGet(mes);
    setItems(d || []);
    if (!silent) setLoading(false);
  };

  useEffect(() => { setItems([]); load(); }, [mes]);
  useEffect(() => {
    // Não recarrega enquanto algum modal estiver aberto (evita fechar a tela de exclusão)
    if (showForm || del) return;
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, [mes, showForm, del]);

  const showToast = m => { setToast(m); setTimeout(() => setToast(null), 2500); };

  const ativos = useMemo(() => items.filter(t => !t.excluido), [items]);
  const empI   = useMemo(() => ativos.filter(t => t.centro === "empresa").sort((a, b) => b.data.localeCompare(a.data)), [ativos]);
  const pesI   = useMemo(() => ativos.filter(t => t.centro === "pessoal").sort((a, b) => b.data.localeCompare(a.data)), [ativos]);
  const totE   = useMemo(() => empI.reduce((s, t) => s + t.valor, 0), [empI]);
  const totP   = useMemo(() => pesI.reduce((s, t) => s + t.valor, 0), [pesI]);
  const total  = totE + totP;

  const byCat = list => {
    const m = {};
    list.forEach(t => { m[t.categoria] = (m[t.categoria] || 0) + t.valor; });
    return Object.entries(m).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
  };

  const Row = ({ t }) => (
    <div className="row" style={{ opacity: t.excluido ? 0.4 : 1 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flex: 1, minWidth: 0 }}>
        <div style={{ width: 3, height: 36, background: t.excluido ? "#DDDDDD" : (CAT_COR[t.categoria] || "#888"), borderRadius: 2, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.excluido ? "#AAAAAA" : "#1A1A1A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: t.excluido ? "line-through" : "none" }}>
            {t.descricao}
            {t.recorrente && !t.excluido && <span className="badge-rec">↻ REC</span>}
          </div>
          <div style={{ fontSize: 11, color: "#999999", marginTop: 2 }}>
            {fd(t.data)} · {t.categoria} · {t.meio}
          </div>
          {t.excluido && t.motivo_exclusao && (
            <div style={{ fontSize: 10, color: "#CC0000", marginTop: 1, fontWeight: 600 }}>
              Excluído: {t.motivo_exclusao}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontFamily: "'Bebas Neue',sans-serif", color: t.excluido ? "#CCCCCC" : "#1A1A1A", letterSpacing: ".02em" }}>
          {fmt(t.valor)}
        </div>
        {!t.excluido && (
          <button
            onClick={() => setDel(t)}
            style={{ background: "none", border: "1px solid #EEEEEE", borderRadius: 6, width: 26, height: 26, cursor: "pointer", color: "#CCCCCC", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", transition: "all .15s", flexShrink: 0 }}
            onMouseEnter={e => e.currentTarget.style.color = "#CC0000"}
            onMouseLeave={e => e.currentTarget.style.color = "#CCCCCC"}>
            ✕
          </button>
        )}
      </div>
    </div>
  );

  const Coll = ({ label, list, tot, cor, open, toggle }) => (
    <div className="coll">
      <div className="coll-h" onClick={toggle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 4, height: 18, background: cor, borderRadius: 2 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A1A" }}>{label}</div>
            <div style={{ fontSize: 11, color: "#AAAAAA", marginTop: 1 }}>{list.length} lançamentos</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 20, fontFamily: "'Bebas Neue',sans-serif", color: "#1A1A1A", letterSpacing: ".02em" }}>{fmt(tot)}</div>
          <div style={{ color: "#CCCCCC", transition: "transform .2s", transform: open ? "rotate(180deg)" : "none" }}>▾</div>
        </div>
      </div>
      {open && (
        <div className="coll-b">
          {byCat(list).map(({ cat, val }) => (
            <div key={cat} style={{ padding: "9px 0", borderBottom: "1px solid #F5F5F5" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: CAT_COR[cat] || "#888" }} />
                  <span style={{ fontSize: 13, color: "#333333", fontWeight: 600 }}>{cat}</span>
                </div>
                <span style={{ fontSize: 13, fontFamily: "'Bebas Neue',sans-serif", color: "#1A1A1A", letterSpacing: ".02em" }}>{fmt(val)}</span>
              </div>
              <Bar p={tot > 0 ? (val / tot) * 100 : 0} color={CAT_COR[cat] || "#888888"} />
              <div style={{ fontSize: 10, color: "#AAAAAA", marginTop: 3 }}>{tot > 0 ? ((val / tot) * 100).toFixed(1) : 0}%</div>
            </div>
          ))}
          <div style={{ paddingBottom: 4 }}>
            {list.map(t => <Row key={t.id} t={t} />)}
          </div>
        </div>
      )}
    </div>
  );

  const anyModal = showForm || !!del;

  return (
    <div style={{ background: "#F5F5F5", minHeight: "100vh", maxWidth: 480, margin: "0 auto" }}>
      <style>{CSS}</style>

      {/* HEADER */}
      <div style={{ background: "#FFFFFF", borderBottom: "2px solid #CC0000", padding: "14px 20px 0", position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 8px rgba(0,0,0,0.07)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <svg width="44" height="44" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="50" fill="#FFFFFF" />
            <circle cx="50" cy="50" r="49" fill="none" stroke="#F0F0F0" strokeWidth="1" />
            <g transform="translate(18,10)">
              <circle cx="8" cy="8" r="3" fill="none" stroke="#1A1A1A" strokeWidth="2" />
              <circle cx="32" cy="4" r="3" fill="none" stroke="#1A1A1A" strokeWidth="2" />
              <circle cx="56" cy="8" r="3" fill="none" stroke="#1A1A1A" strokeWidth="2" />
              <polyline points="8,8 18,26 32,16 46,26 56,8 52,32 12,32" fill="none" stroke="#1A1A1A" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
              <line x1="12" y1="32" x2="52" y2="32" stroke="#1A1A1A" strokeWidth="2.2" />
            </g>
            <g transform="translate(12,42)">
              <rect x="0" y="0" width="76" height="28" rx="3" fill="none" stroke="#1A1A1A" strokeWidth="2.5" />
              <text x="4" y="22" fontFamily="Arial Black,sans-serif" fontSize="22" fontWeight="900" fill="#1A1A1A" letterSpacing="2">PICO</text>
            </g>
            <text x="38" y="88" fontFamily="Georgia,serif" fontSize="11" fill="#CC0000" fontStyle="italic" textAnchor="middle">barbershop</text>
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: ".08em", color: "#1A1A1A", lineHeight: 1 }}>Pico Barber Shop</div>
            <div style={{ fontSize: 11, color: "#AAAAAA", letterSpacing: ".15em", textTransform: "uppercase", marginTop: 1 }}>Olá, Isaque</div>
          </div>
          {loading && <span className="spin" />}
        </div>

        {/* Seletor mês */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, background: "#F8F8F8", borderRadius: 8, padding: "6px 10px", border: "1px solid #EEEEEE" }}>
          <button onClick={() => setMesIdx(i => Math.max(0, i - 1))} disabled={mesIdx === 0}
            style={{ background: "none", border: "none", color: mesIdx === 0 ? "#DDDDDD" : "#888888", cursor: mesIdx === 0 ? "not-allowed" : "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 15, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: ".1em", color: "#1A1A1A" }}>{ML[mes]}</div>
          <button onClick={() => setMesIdx(i => Math.min(MESES.length - 1, i + 1))} disabled={mesIdx === MESES.length - 1}
            style={{ background: "none", border: "none", color: mesIdx === MESES.length - 1 ? "#DDDDDD" : "#888888", cursor: mesIdx === MESES.length - 1 ? "not-allowed" : "pointer", fontSize: 20, lineHeight: 1, padding: "0 4px" }}>›</button>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid #F0F0F0" }}>
          {[["inicio", "Início"], ["historico", "Histórico"], ["categorias", "Categorias"]].map(([v, l]) => (
            <button key={v} className={`tab-b${view === v ? " on" : ""}`} onClick={() => setView(v)}>{l}</button>
          ))}
        </div>
      </div>

      {/* CONTEÚDO */}
      <div style={{ padding: "20px 16px 100px" }}>

        {/* INÍCIO */}
        {view === "inicio" && (
          <>
            <div style={{ background: "#FFFFFF", borderRadius: 14, padding: "22px 20px", marginBottom: 16, boxShadow: "0 1px 6px rgba(0,0,0,0.06)", borderLeft: "4px solid #CC0000" }}>
              <div style={{ fontSize: 10, color: "#AAAAAA", letterSpacing: ".2em", textTransform: "uppercase", marginBottom: 4, fontWeight: 600 }}>Total — {ML[mes]}</div>
              <div style={{ fontSize: 40, fontFamily: "'Bebas Neue',sans-serif", color: "#1A1A1A", lineHeight: 1, marginBottom: 6, letterSpacing: ".02em" }}>
                {loading && !items.length ? "…" : fmt(total)}
              </div>
              <div style={{ fontSize: 12, color: "#AAAAAA", letterSpacing: ".08em", textTransform: "uppercase" }}>
                {ativos.length} lançamentos ativos
              </div>
              {total > 0 && (
                <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["🏢 Empresa", totE, "#CC0000"], ["👤 Pessoal", totP, "#666666"]].filter(([, v]) => v > 0).map(([l, v, c]) => (
                    <div key={l}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 13, color: "#666666", fontWeight: 700 }}>{l}</span>
                        <span style={{ fontSize: 13, color: c, fontWeight: 700 }}>{fmt(v)}</span>
                      </div>
                      <div style={{ background: "#F0F0F0", borderRadius: 3, height: 5, overflow: "hidden" }}>
                        <div style={{ width: `${total > 0 ? (v / total) * 100 : 0}%`, background: c, height: "100%", borderRadius: 3, transition: "width .6s ease" }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#AAAAAA", marginTop: 3, textAlign: "right" }}>
                        {total > 0 ? ((v / total) * 100).toFixed(1) : 0}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: 10, color: "#AAAAAA", letterSpacing: ".2em", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>
              {items.length > 0 ? "Últimos lançamentos" : "Nenhum lançamento neste mês"}
            </div>

            {loading && !items.length ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#CCCCCC" }}><span className="spin" /></div>
            ) : items.length > 0 ? (
              <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "0 16px", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
                {[...items].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 10).map(t => <Row key={t.id} t={t} />)}
              </div>
            ) : (
              <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "32px 20px", textAlign: "center", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>✂️</div>
                <div style={{ fontSize: 15, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: ".06em", color: "#1A1A1A", marginBottom: 6 }}>Sem lançamentos</div>
                <div style={{ fontSize: 13, color: "#AAAAAA", lineHeight: 1.5 }}>Toque em "+ Lançar Despesa"<br />para registrar uma nova despesa.</div>
              </div>
            )}
          </>
        )}

        {/* HISTÓRICO */}
        {view === "historico" && (
          <>
            <div style={{ fontSize: 10, color: "#AAAAAA", letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 14, fontWeight: 600 }}>
              {items.length} lançamentos — {ML[mes]}
            </div>
            {totE > 0 && <Coll label="Empresa" list={empI} tot={totE} cor="#CC0000" open={collE} toggle={() => setCollE(o => !o)} />}
            {totP > 0 && <Coll label="Pessoal" list={pesI} tot={totP} cor="#666666" open={collP} toggle={() => setCollP(o => !o)} />}
            {total === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#CCCCCC", fontSize: 14 }}>Nenhum lançamento neste mês.</div>
            )}
          </>
        )}

        {/* CATEGORIAS */}
        {view === "categorias" && (
          <>
            <div style={{ fontSize: 10, color: "#AAAAAA", letterSpacing: ".18em", textTransform: "uppercase", marginBottom: 14, fontWeight: 600 }}>
              Categorias — {ML[mes]}
            </div>
            {[["Empresa", empI, totE, "#CC0000"], ["Pessoal", pesI, totP, "#666666"]].filter(([, , t]) => t > 0).map(([titulo, list, tot, cor]) => (
              <div key={titulo} style={{ background: "#FFFFFF", borderRadius: 12, padding: "16px", marginBottom: 12, boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, paddingBottom: 10, borderBottom: "1px solid #F5F5F5" }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A1A" }}>{titulo}</div>
                  <div style={{ fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: cor, letterSpacing: ".02em" }}>{fmt(tot)}</div>
                </div>
                {byCat(list).map(({ cat, val }) => (
                  <div key={cat} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: CAT_COR[cat] || "#888" }} />
                        <span style={{ fontSize: 13, color: "#333333", fontWeight: 700 }}>{cat}</span>
                      </div>
                      <span style={{ fontSize: 13, fontFamily: "'Bebas Neue',sans-serif", color: "#1A1A1A", letterSpacing: ".02em" }}>{fmt(val)}</span>
                    </div>
                    <div style={{ background: "#F0F0F0", borderRadius: 3, height: 5, overflow: "hidden" }}>
                      <div style={{ width: `${tot > 0 ? (val / tot) * 100 : 0}%`, background: CAT_COR[cat] || "#888888", height: "100%", borderRadius: 3, transition: "width .6s ease" }} />
                    </div>
                    <div style={{ fontSize: 10, color: "#AAAAAA", marginTop: 3 }}>
                      {tot > 0 ? ((val / tot) * 100).toFixed(1) : 0}% · {ativos.filter(t => t.categoria === cat).length} itens
                    </div>
                  </div>
                ))}
              </div>
            ))}
            {total === 0 && (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#CCCCCC", fontSize: 14 }}>Nenhum lançamento neste mês.</div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      {!anyModal && (
        <button className="fab" onClick={() => setShowForm(true)}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Lançar Despesa
        </button>
      )}

      {showForm && <FormSheet mes={mes} onSaved={() => { load(); showToast("✓ Lançamento registrado"); }} onClose={() => setShowForm(false)} />}
      {del && <DelSheet item={del} onDone={() => { load(); showToast("Lançamento excluído"); }} onClose={() => setDel(null)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
