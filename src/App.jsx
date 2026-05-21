import { useState, useEffect, useMemo, useCallback } from "react";

const SUPA_URL = "https://oltwaosdzgvbbvermilk.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9sdHdhb3Nkemd2YmJ2ZXJtaWxrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1NDU3MjksImV4cCI6MjA5NDEyMTcyOX0.WbDR65w6eywTgLc4Lwii_63RrJwKPN9oj1DsgjxeFBo";
const CID = "pico";
const H = { "Content-Type":"application/json","apikey":SUPA_KEY,"Authorization":`Bearer ${SUPA_KEY}`,"Prefer":"return=representation" };

async function sbGet(mes){try{const r=await fetch(`${SUPA_URL}/rest/v1/lancamentos?cliente_id=eq.${CID}&mes=eq.${mes}&order=data.desc`,{headers:H});return r.ok?r.json():[];}catch{return[];}}
async function sbPost(body){try{const r=await fetch(`${SUPA_URL}/rest/v1/lancamentos`,{method:"POST",headers:H,body:JSON.stringify(body)});return r.ok?r.json():null;}catch{return null;}}
async function sbPatch(id,body){try{const r=await fetch(`${SUPA_URL}/rest/v1/lancamentos?id=eq.${id}`,{method:"PATCH",headers:{...H,"Prefer":"return=minimal"},body:JSON.stringify(body)});return r.ok;}catch{return false;}}
async function sbGetCaixa(mes){try{const r=await fetch(`${SUPA_URL}/rest/v1/caixa?cliente_id=eq.${CID}&mes=eq.${mes}&order=data.desc`,{headers:H});return r.ok?r.json():[];}catch{return[];}}
async function sbPostCaixa(body){try{const r=await fetch(`${SUPA_URL}/rest/v1/caixa`,{method:"POST",headers:H,body:JSON.stringify(body)});return r.ok?r.json():null;}catch{return null;}}
async function sbPatchCaixa(id,body){try{const r=await fetch(`${SUPA_URL}/rest/v1/caixa?id=eq.${id}`,{method:"PATCH",headers:{...H,"Prefer":"return=minimal"},body:JSON.stringify(body)});return r.ok;}catch{return false;}}

const fmt  = v => v.toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const uid  = () => (crypto?.randomUUID?.()??Math.random().toString(36).slice(2)+Date.now());
const fd   = d => { const[,m,day]=d.split("-"); return `${day}/${m}`; };
const hoje = () => new Date().toISOString().slice(0,10);

function periodoSemana(dataStr){
  const dow=new Date(dataStr+"T12:00:00").getDay();
  return (dow>=1&&dow<=3)?"baixa":"alta";
}

function servicosParaData(dataStr){
  const alta=periodoSemana(dataStr)==="alta";
  return [
    {nome:"Corte",grupo:"Corte",valor:alta?55:50},
    {nome:"Barba",grupo:"Barba",valor:alta?50:45},
    {nome:"Corte + Barba",grupo:"Combo",valor:alta?105:95},
    {nome:"Cavanhaque",grupo:"Rapidos",valor:30},
    {nome:"Bigode",grupo:"Rapidos",valor:15},
    {nome:"Sobrancelha",grupo:"Rapidos",valor:15},
    {nome:"Raspar o Cabelo",grupo:"Acabamentos",valor:35},
    {nome:"Acabamento",grupo:"Acabamentos",valor:25},
    {nome:"Black Mask",grupo:"Acabamentos",valor:15},
    {nome:"Hidratacao",grupo:"Tratamentos",valor:30},
    {nome:"Botox",grupo:"Tratamentos",valor:60},
    {nome:"Selagem",grupo:"Tratamentos",valor:90},
    {nome:"Progressiva",grupo:"Tratamentos",valor:120},
    {nome:"Depilacao Nariz",grupo:"Estetica",valor:20},
    {nome:"Depilacao Orelha",grupo:"Estetica",valor:20},
    {nome:"Combo Nariz+Orelha",grupo:"Estetica",valor:35},
    {nome:"Luzes",grupo:"Coloracao",valor:90},
    {nome:"Platinado",grupo:"Coloracao",valor:200},
    {nome:"Relaxamento",grupo:"Coloracao",valor:35},
    {nome:"Pigmentacao",grupo:"Coloracao",valor:35},
    {nome:"Tintura Camuflagem",grupo:"Coloracao",valor:45},
    {nome:"Produto",grupo:"Outros",valor:0},
    {nome:"Outro",grupo:"Outros",valor:0},
  ];
}

const GRUPO_LABEL={Corte:"Corte",Barba:"Barba",Combo:"Corte + Barba",Rapidos:"Servicos Rapidos",Acabamentos:"Acabamentos",Tratamentos:"Tratamentos",Estetica:"Estetica",Coloracao:"Coloracao e Estilo",Outros:"Outros"};
const ORDEM_GRUPOS=["Corte","Barba","Combo","Rapidos","Acabamentos","Tratamentos","Estetica","Coloracao","Outros"];

function segDaSemana(dataStr){
  const d=new Date(dataStr+"T12:00:00");
  const dow=d.getDay();
  const seg=new Date(d);
  seg.setDate(d.getDate()-(dow===0?6:dow-1));
  return seg.toISOString().slice(0,10);
}

const CATS_EMP=["Administrativo","Funcionario","Infraestrutura","Insumos","Investimento","Marketing","Outros"];
const CATS_PES=["Alimentacao","Compromissos Financeiros","Lazer","Moradia","Reserva","Transporte","Outros"];
const MEIOS=["Credito","Debito","Dinheiro","Pix"];
const META_MIN=20000, META_MAX=35000;
const NOMES_MES=["Janeiro","Fevereiro","Marco","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS_SEMANA=["Dom","Seg","Ter","Qua","Qui","Sex","Sab"];

function gerarMeses(){
  const arr=[],labels={},hj=new Date();
  for(let i=-3;i<=3;i++){
    const d=new Date(hj.getFullYear(),hj.getMonth()+i,1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    arr.push(key);
    labels[key]=`${NOMES_MES[d.getMonth()]} ${d.getFullYear()}`;
  }
  return {arr,labels,idxAtual:3};
}
const {arr:MESES,labels:ML,idxAtual:IDX_ATUAL}=gerarMeses();

const CAT_COR={"Funcionario":"#CC0000","Infraestrutura":"#555555","Administrativo":"#333333","Insumos":"#AA2222","Investimento":"#777777","Marketing":"#BB3333","Outros":"#999999","Alimentacao":"#444444","Compromissos Financeiros":"#CC0000","Lazer":"#888888","Moradia":"#555555","Reserva":"#AAAAAA","Transporte":"#333333"};

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Barlow+Condensed:wght@400;500;600;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{background:#F5F5F5;font-family:'Barlow Condensed',sans-serif;color:#1A1A1A;min-height:100vh}
.inp{width:100%;border:2px solid #E0E0E0;border-radius:8px;padding:12px 14px;font-size:15px;font-family:'Barlow Condensed',sans-serif;letter-spacing:.04em;background:#FFF;color:#1A1A1A;outline:none;transition:border .18s;-webkit-appearance:none;appearance:none}
.inp:focus{border-color:#CC0000;box-shadow:0 0 0 3px rgba(204,0,0,.08)}
.inp::placeholder{color:#BBB}
.inp-err{border-color:#CC0000!important}
.inp-sm{padding:9px 11px;font-size:14px;border-radius:7px}
.btn{width:100%;border:none;border-radius:10px;padding:15px;font-size:14px;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;transition:all .2s}
.btn-main{background:#CC0000;color:#FFF}.btn-main:hover{background:#AA0000}.btn-main:disabled{background:#DDD;color:#999;cursor:not-allowed}
.btn-ghost{background:#FFF;border:2px solid #DDD;color:#666;margin-top:10px}.btn-ghost:hover{border-color:#999;color:#333}
.btn-del{background:#FFF;border:2px solid #CC0000;color:#CC0000;margin-top:10px}.btn-del:hover{background:#CC0000;color:#FFF}
.fab{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#CC0000;color:#FFF;border:none;border-radius:50px;padding:14px 28px;font-size:14px;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.15em;text-transform:uppercase;cursor:pointer;box-shadow:0 6px 20px rgba(204,0,0,.35);z-index:90;white-space:nowrap;display:flex;align-items:center;gap:8px;transition:all .2s}
.fab:hover{background:#AA0000;transform:translateX(-50%) translateY(-2px)}.fab:active{transform:translateX(-50%) scale(.97)}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200;display:flex;align-items:flex-end;backdrop-filter:blur(2px)}
.sheet{background:#FFF;border-radius:20px 20px 0 0;padding:8px 20px 48px;width:100%;max-width:480px;margin:0 auto;max-height:92vh;overflow-y:auto;animation:sheetUp .26s cubic-bezier(.32,.72,0,1)}
@keyframes sheetUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
.handle{width:36px;height:4px;background:#EEE;border-radius:2px;margin:12px auto 20px}
.row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:13px 0;border-bottom:1px solid #F0F0F0}
.row:last-child{border-bottom:none}
.seg{cursor:pointer;border-radius:8px;border:2px solid #E0E0E0;padding:11px;font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:13px;letter-spacing:.06em;text-align:center;transition:all .18s;flex:1;background:#FFF;color:#888;user-select:none}
.seg.on{background:#CC0000;border-color:#CC0000;color:#FFF}
.tab-b{flex:1;background:none;border:none;border-bottom:2.5px solid transparent;color:#AAA;padding:10px 2px;font-size:10px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-weight:700;transition:all .2s}
.tab-b.on{color:#CC0000;border-bottom-color:#CC0000}.tab-b:hover{color:#333}
.coll{background:#FFF;border-radius:12px;margin-bottom:10px;overflow:hidden;border:1px solid #EEE;box-shadow:0 1px 4px rgba(0,0,0,.05)}
.coll-h{padding:14px 16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;transition:background .15s}
.coll-h:hover{background:#FAFAFA}
.coll-b{border-top:1px solid #F5F5F5;padding:0 16px}
.badge-rec{display:inline-block;background:#FFF0F0;color:#CC0000;border:1px solid #FFCCCC;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:700;margin-left:6px;letter-spacing:.06em}
.toast{position:fixed;bottom:100px;left:50%;transform:translateX(-50%);background:#1A1A1A;color:#FFF;padding:11px 22px;border-radius:50px;font-family:'Barlow Condensed',sans-serif;font-size:12px;letter-spacing:.1em;text-transform:uppercase;z-index:500;white-space:nowrap;pointer-events:none;animation:toastIn .22s ease}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
.spin{display:inline-block;width:14px;height:14px;border:2px solid #EEE;border-top-color:#CC0000;border-radius:50%;animation:spin .7s linear infinite;vertical-align:middle}
@keyframes spin{to{transform:rotate(360deg)}}
.card{background:#FFF;border-radius:14px;padding:18px 16px;box-shadow:0 1px 6px rgba(0,0,0,.06)}
.num-btn{width:32px;height:32px;border-radius:7px;border:1.5px solid #E0E0E0;background:#FFF;color:#CC0000;font-size:18px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0;line-height:1}
.num-btn:hover{border-color:#CC0000;background:#FFF5F5}
.serv-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid #F5F5F5}
.serv-row:last-child{border-bottom:none}
.dia-card{background:#FFF;border-radius:12px;border:2px solid #EEE;padding:14px 16px;margin-bottom:10px;transition:border .2s;cursor:pointer}
.dia-card:hover{border-color:#CC0000}.dia-card.hoje-card{border-color:#CC0000;background:#FFFAFA}
.sem-card{border-radius:14px;margin-bottom:12px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,.07)}
.sem-header{padding:14px 16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer}
.sem-body{padding:0 16px 14px;background:#FFF}
::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:#DDD;border-radius:2px}
`;

function Bar({p,color,h}){
  return (
    <div style={{background:"#F0F0F0",borderRadius:3,height:h||4,overflow:"hidden",marginTop:4}}>
      <div style={{width:`${Math.min(Math.max(p,0),100)}%`,background:color||"#CC0000",height:"100%",borderRadius:3,transition:"width .5s ease"}}/>
    </div>
  );
}

function FormSheet({mes,onSaved,onClose}){
  const [cls,setCls]=useState("empresa");
  const [cat,setCat]=useState("");
  const [desc,setDesc]=useState("");
  const [val,setVal]=useState("");
  const [meio,setMeio]=useState("Pix");
  const [data,setData]=useState(mes+"-"+new Date().toISOString().slice(8,10));
  const [obs,setObs]=useState("");
  const [rec,setRec]=useState(false);
  const [reps,setReps]=useState(3);
  const [err,setErr]=useState({});
  const [busy,setBusy]=useState(false);
  const cats=cls==="empresa"?CATS_EMP:CATS_PES;
  function sf(k,v){
    if(k==="cls"){setCls(v);setCat("");}
    else if(k==="cat")setCat(v);
    else if(k==="desc")setDesc(v);
    else if(k==="val")setVal(v);
    else if(k==="meio")setMeio(v);
    else if(k==="data")setData(v);
    else setObs(v);
    setErr(e=>({...e,[k]:false}));
  }
  async function salvar(){
    const e={};
    if(!cat)e.cat=true;
    if(!desc.trim())e.desc=true;
    const v=parseFloat(val.replace(",","."));
    if(!v||v<=0)e.val=true;
    if(!data)e.data=true;
    if(Object.keys(e).length){setErr(e);return;}
    setBusy(true);
    const item={id:uid(),cliente_id:CID,mes:data.slice(0,7),centro:cls,categoria:cat,descricao:desc.trim(),valor:v,meio,data,obs,excluido:false,recorrente:rec,motivo_exclusao:""};
    const res=await sbPost(item);
    if(res&&rec&&reps>1){
      const [ano,mesN,dia]=data.split("-").map(Number);
      for(let i=1;i<reps;i++){
        const d=new Date(ano,mesN-1+i,dia);
        const nd=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
        await sbPost({id:uid(),cliente_id:CID,mes:nd.slice(0,7),centro:cls,categoria:cat,descricao:desc.trim(),valor:v,meio,data:nd,obs,excluido:false,recorrente:true,motivo_exclusao:""});
      }
    }
    setBusy(false);
    if(res){onSaved();onClose();}
    else setErr({geral:"Erro ao salvar."});
  }
  const LBL={fontSize:10,color:"#777",letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,display:"block",marginBottom:7};
  function Err({k}){return err[k]?<div style={{fontSize:11,color:"#CC0000",marginTop:4,fontWeight:600}}>Obrigatorio</div>:null;}
  return (
    <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="sheet">
        <div className="handle"/>
        <div style={{fontSize:24,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:".08em",marginBottom:20}}>Nova Despesa</div>
        {err.geral&&<div style={{background:"#FFF0F0",border:"1px solid #FFCCCC",borderRadius:8,padding:"10px 14px",fontSize:12,color:"#CC0000",marginBottom:14,fontWeight:600}}>{err.geral}</div>}
        <div style={{marginBottom:16}}>
          <span style={LBL}>Tipo *</span>
          <div style={{display:"flex",gap:10}}>
            {[["empresa","Empresa"],["pessoal","Pessoal"]].map(([v,l])=>(
              <div key={v} className={`seg${cls===v?" on":""}`} onClick={()=>sf("cls",v)}>{l}</div>
            ))}
          </div>
        </div>
        <div style={{marginBottom:16}}>
          <label style={LBL}>Categoria *</label>
          <select className={`inp${err.cat?" inp-err":""}`} value={cat} onChange={e=>sf("cat",e.target.value)}>
            <option value="">Selecione</option>
            {cats.map(c=><option key={c} value={c}>{c}</option>)}
          </select><Err k="cat"/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={LBL}>Descricao *</label>
          <input className={`inp${err.desc?" inp-err":""}`} placeholder="Ex: Pagamento Lucas" value={desc} onChange={e=>sf("desc",e.target.value)}/><Err k="desc"/>
        </div>
        <div style={{marginBottom:16}}>
          <label style={LBL}>Valor (R$) *</label>
          <input className={`inp${err.val?" inp-err":""}`} type="number" inputMode="decimal" placeholder="0,00" value={val} onChange={e=>sf("val",e.target.value)}/><Err k="val"/>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
          <div>
            <label style={LBL}>Meio</label>
            <select className="inp" value={meio} onChange={e=>sf("meio",e.target.value)}>
              {MEIOS.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Data *</label>
            <input className={`inp${err.data?" inp-err":""}`} type="date" value={data} onChange={e=>sf("data",e.target.value)}/><Err k="data"/>
          </div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={LBL}>Observacao</label>
          <textarea className="inp" style={{minHeight:56,resize:"none",fontSize:13}} placeholder="Opcional" value={obs} onChange={e=>sf("obs",e.target.value)}/>
        </div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 0",borderTop:"1px solid #F5F5F5",marginBottom:rec?12:20}}>
          <div>
            <div style={{fontSize:14,fontWeight:700}}>Despesa Recorrente</div>
            <div style={{fontSize:11,color:"#AAA",marginTop:1}}>Repete nos proximos meses</div>
          </div>
          <div style={{width:44,height:24,borderRadius:12,cursor:"pointer",background:rec?"#CC0000":"#E0E0E0",display:"flex",alignItems:"center",padding:2,transition:"background .2s",flexShrink:0}} onClick={()=>setRec(r=>!r)}>
            <div style={{width:20,height:20,borderRadius:"50%",background:"#FFF",boxShadow:"0 1px 4px rgba(0,0,0,.15)",transition:"transform .2s",transform:rec?"translateX(20px)":"none"}}/>
          </div>
        </div>
        {rec&&(
          <div style={{background:"#FFF5F5",border:"1px solid #FFD5D5",borderRadius:10,padding:14,marginBottom:20}}>
            <label style={LBL}>Quantas vezes repetir?</label>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div onClick={()=>setReps(r=>Math.max(1,r-1))} style={{width:44,height:44,borderRadius:10,cursor:"pointer",border:"2px solid #E0E0E0",background:"#FFF",color:"#CC0000",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,userSelect:"none",flexShrink:0}}>-</div>
              <input type="number" inputMode="numeric" min="1" max="24" value={reps} onChange={e=>{let n=parseInt(e.target.value)||1;if(n<1)n=1;if(n>24)n=24;setReps(n);}} style={{flex:1,textAlign:"center",border:"2px solid #E0E0E0",borderRadius:10,padding:11,fontSize:22,fontWeight:700,fontFamily:"'Bebas Neue',sans-serif",outline:"none",background:"#FFF",MozAppearance:"textfield",appearance:"textfield"}}/>
              <div onClick={()=>setReps(r=>Math.min(24,r+1))} style={{width:44,height:44,borderRadius:10,cursor:"pointer",border:"2px solid #E0E0E0",background:"#FFF",color:"#CC0000",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,fontWeight:700,userSelect:"none",flexShrink:0}}>+</div>
            </div>
            <div style={{fontSize:11,color:"#CC0000",marginTop:10,fontWeight:600}}>{reps===1?"Apenas este mes":`Este mes + ${reps-1} mes(es)`}</div>
          </div>
        )}
        <button className="btn btn-main" onClick={salvar} disabled={busy}>{busy?<><span className="spin"/> Salvando</>:"Registrar Lancamento"}</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

function DelSheet({item,onDone,onClose}){
  const [motivo,setMotivo]=useState("");
  const [err,setErr]=useState(false);
  const [busy,setBusy]=useState(false);
  async function confirmar(){
    if(!motivo.trim()){setErr(true);return;}
    setBusy(true);
    const ok=await sbPatch(item.id,{excluido:true,motivo_exclusao:motivo.trim()});
    setBusy(false);
    if(ok){onDone();onClose();}
  }
  return (
    <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="sheet">
        <div className="handle"/>
        <div style={{fontSize:22,fontFamily:"'Bebas Neue',sans-serif",color:"#CC0000",marginBottom:6}}>Excluir Lancamento</div>
        <div style={{fontSize:15,fontWeight:700,marginBottom:2}}>{item.descricao}</div>
        <div style={{fontSize:13,color:"#888",marginBottom:18}}>{fmt(item.valor)} - {fd(item.data)}</div>
        <div style={{background:"#FFF8F8",border:"1px solid #FFCCCC",borderRadius:10,padding:"12px 14px",marginBottom:18,fontSize:13,color:"#CC0000",fontWeight:600}}>O valor sera excluido da soma total.</div>
        <label style={{fontSize:10,color:"#777",letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,display:"block",marginBottom:7}}>Motivo *</label>
        <textarea className={`inp${err?" inp-err":""}`} style={{minHeight:76,resize:"none"}} placeholder="Descreva o motivo" value={motivo} onChange={e=>{setMotivo(e.target.value);setErr(false);}}/>
        {err&&<div style={{fontSize:11,color:"#CC0000",marginTop:4,fontWeight:600}}>Informe o motivo</div>}
        <div style={{height:16}}/>
        <button className="btn btn-del" onClick={confirmar} disabled={busy}>{busy?<><span className="spin"/> Excluindo</>:"Confirmar Exclusao"}</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

function CaixaSheet({mes,diaExistente,onSaved,onClose}){
  const dataInicial=diaExistente?diaExistente.data:hoje();
  function buildItens(dataStr,existentes){
    const base=servicosParaData(dataStr);
    if(!existentes||existentes.length===0)return base.map(s=>({...s,qtd:0}));
    return base.map(s=>{
      const found=existentes.find(p=>p.nome===s.nome);
      return {...s,qtd:found?found.qtd:0,valor:found?found.valor:s.valor};
    });
  }
  const itensExistentes=useMemo(()=>{
    if(!diaExistente||!diaExistente.itens)return[];
    try{return typeof diaExistente.itens==="string"?JSON.parse(diaExistente.itens):diaExistente.itens;}
    catch{return[];}
  },[diaExistente]);
  const [data,setData]=useState(dataInicial);
  const [itens,setItens]=useState(()=>buildItens(dataInicial,itensExistentes));
  const [obs,setObs]=useState(diaExistente?diaExistente.obs||"":"");
  const [busy,setBusy]=useState(false);
  const [errMsg,setErrMsg]=useState("");
  function handleDataChange(nd){
    setData(nd);
    setItens(prev=>{
      const base=servicosParaData(nd);
      return base.map(s=>{const ant=prev.find(p=>p.nome===s.nome);return{...s,qtd:ant?ant.qtd:0,valor:ant&&ant.qtd>0?ant.valor:s.valor};});
    });
  }
  const total=itens.reduce((s,i)=>s+(i.qtd*(parseFloat(i.valor)||0)),0);
  function upd(idx,field,val){setItens(prev=>prev.map((it,i)=>i===idx?{...it,[field]:val}:it));}
  async function salvar(){
    if(total<=0){setErrMsg("Adicione pelo menos um item.");return;}
    setBusy(true);
    const itensAtivos=itens.filter(i=>i.qtd>0).map(i=>({nome:i.nome,valor:parseFloat(i.valor)||0,qtd:i.qtd}));
    const payload={id:diaExistente?diaExistente.id:uid(),cliente_id:CID,mes:data.slice(0,7),data,itens:JSON.stringify(itensAtivos),total,obs,fechado:true};
    const ok=diaExistente?await sbPatchCaixa(diaExistente.id,payload):await sbPostCaixa(payload);
    setBusy(false);
    if(ok!==null&&ok!==false){onSaved();onClose();}
    else setErrMsg("Erro ao salvar.");
  }
  const dow=new Date(data+"T12:00:00").getDay();
  const alta=periodoSemana(data)==="alta";
  const diaNom=DIAS_SEMANA[dow];
  const LBL={fontSize:10,color:"#777",letterSpacing:".12em",textTransform:"uppercase",fontWeight:700,display:"block",marginBottom:6};
  const grupos={};
  itens.forEach((it,idx)=>{if(!grupos[it.grupo])grupos[it.grupo]=[];grupos[it.grupo].push({...it,_idx:idx});});
  return (
    <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="sheet">
        <div className="handle"/>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:24,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:".08em"}}>{diaExistente?"Editar Caixa":"Fechar Caixa"}</div>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:22,color:"#CC0000"}}>{fmt(total)}</div>
        </div>
        <div style={{marginBottom:16,marginTop:12}}>
          <label style={LBL}>Data</label>
          <input className="inp" type="date" value={data} onChange={e=>handleDataChange(e.target.value)}/>
          <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
            <span style={{display:"inline-flex",alignItems:"center",gap:5,background:alta?"#FFF5E0":"#F0FFF8",border:`1px solid ${alta?"#E65100":"#00875A"}44`,color:alta?"#E65100":"#00875A",borderRadius:6,padding:"4px 10px",fontSize:11,fontWeight:700}}>
              {alta?"QUI-DOM":"SEG-QUA"} - {diaNom}
            </span>
            <span style={{fontSize:11,color:"#AAA"}}>{alta?"Tabela alta":"Tabela baixa"}</span>
          </div>
        </div>
        {ORDEM_GRUPOS.map(grp=>{
          const servicos=grupos[grp];
          if(!servicos)return null;
          const temVariacao=grp==="Corte"||grp==="Barba"||grp==="Combo";
          return (
            <div key={grp} style={{marginBottom:12}}>
              <div style={{fontSize:10,color:"#777",letterSpacing:".14em",textTransform:"uppercase",fontWeight:700,marginBottom:6,display:"flex",alignItems:"center",gap:6}}>
                {GRUPO_LABEL[grp]||grp}
                {temVariacao&&<span style={{fontSize:9,background:alta?"#FFF0E0":"#E8F5EE",color:alta?"#E65100":"#00875A",border:`1px solid ${alta?"#E65100":"#00875A"}33`,borderRadius:4,padding:"1px 6px",fontWeight:700}}>{alta?"QUI-DOM":"SEG-QUA"}</span>}
              </div>
              <div style={{background:"#FAFAFA",borderRadius:10,border:"1px solid #EEE",padding:"2px 12px"}}>
                {servicos.map(it=>(
                  <div key={it._idx} className="serv-row">
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:14,fontWeight:700,color:"#1A1A1A",marginBottom:4}}>{it.nome}</div>
                      <div style={{position:"relative",width:100}}>
                        <span style={{position:"absolute",left:9,top:"50%",transform:"translateY(-50%)",fontSize:11,color:"#888",fontWeight:600,pointerEvents:"none"}}>R$</span>
                        <input className="inp inp-sm" type="number" inputMode="decimal" style={{paddingLeft:28,fontSize:14,width:"100%"}} value={it.valor||""} placeholder="0" onChange={e=>upd(it._idx,"valor",e.target.value===""?0:parseFloat(e.target.value)||0)}/>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                      <button className="num-btn" onClick={()=>upd(it._idx,"qtd",Math.max(0,it.qtd-1))}>-</button>
                      <div style={{width:34,textAlign:"center",fontSize:20,fontFamily:"'Bebas Neue',sans-serif",color:it.qtd>0?"#CC0000":"#CCC"}}>{it.qtd}</div>
                      <button className="num-btn" onClick={()=>upd(it._idx,"qtd",it.qtd+1)}>+</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {total>0&&(
          <div style={{background:"#F8F8F8",borderRadius:10,padding:"10px 14px",marginBottom:16}}>
            {itens.filter(i=>i.qtd>0).map((it,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:13,padding:"3px 0",color:"#555"}}>
                <span>{it.qtd}x {it.nome}</span>
                <span style={{fontFamily:"'Bebas Neue',sans-serif",color:"#1A1A1A"}}>{fmt(it.qtd*(parseFloat(it.valor)||0))}</span>
              </div>
            ))}
            <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:700,marginTop:8,paddingTop:8,borderTop:"1px solid #E0E0E0"}}>
              <span>Total do dia</span>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",color:"#CC0000",fontSize:18}}>{fmt(total)}</span>
            </div>
          </div>
        )}
        <div style={{marginBottom:16}}>
          <label style={LBL}>Observacao</label>
          <textarea className="inp" style={{minHeight:52,resize:"none",fontSize:13}} placeholder="Ex: Dia movimentado" value={obs} onChange={e=>setObs(e.target.value)}/>
        </div>
        {errMsg&&<div style={{fontSize:12,color:"#CC0000",fontWeight:600,marginBottom:10}}>{errMsg}</div>}
        <button className="btn btn-main" onClick={salvar} disabled={busy||total<=0}>{busy?<><span className="spin"/> Salvando</>:`Fechar Caixa - ${fmt(total)}`}</button>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
      </div>
    </div>
  );
}

function Balancete({registrosCaixa,despesasAtivas}){
  const [aberto,setAberto]=useState(null);
  const semanas=useMemo(()=>{
    const map={};
    registrosCaixa.forEach(r=>{
      const seg=segDaSemana(r.data);
      if(!map[seg])map[seg]={seg,receita:0,despEmp:0,despPes:0,diasRec:[],despItens:[]};
      map[seg].receita+=r.total;map[seg].diasRec.push(r);
    });
    despesasAtivas.forEach(d=>{
      const seg=segDaSemana(d.data);
      if(!map[seg])map[seg]={seg,receita:0,despEmp:0,despPes:0,diasRec:[],despItens:[]};
      if(d.centro==="empresa")map[seg].despEmp+=d.valor;else map[seg].despPes+=d.valor;
      map[seg].despItens.push(d);
    });
    return Object.values(map).sort((a,b)=>b.seg.localeCompare(a.seg));
  },[registrosCaixa,despesasAtivas]);
  if(semanas.length===0)return <div style={{textAlign:"center",padding:"40px 0",color:"#CCC",fontSize:14}}>Registre fechamentos e despesas para ver o balancete.</div>;
  return (
    <div>
      {semanas.map((sem,idx)=>{
        const iniD=new Date(sem.seg+"T12:00:00");
        const fimD=new Date(sem.seg+"T12:00:00");fimD.setDate(iniD.getDate()+6);
        const segStr=`${iniD.getDate()}/${iniD.getMonth()+1}`;
        const fimStr=`${fimD.getDate()}/${fimD.getMonth()+1}`;
        const despTotal=sem.despEmp+sem.despPes;
        const lucro=sem.receita-despTotal;
        const pos=lucro>=0;
        const lc=pos?"#00875A":"#CC0000";
        const isOpen=aberto===idx;
        return (
          <div key={idx} className="sem-card" style={{border:`2px solid ${pos?"#00875A22":"#CC000022"}`}}>
            <div className="sem-header" style={{background:pos?"#F0FFF8":"#FFF5F5"}} onClick={()=>setAberto(isOpen?null:idx)}>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#1A1A1A",marginBottom:2}}>{segStr} - {fimStr}</div>
                <div style={{fontSize:11,color:"#888"}}>{sem.diasRec.length} dia(s) - {sem.despItens.length} despesa(s)</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:11,color:"#888",marginBottom:2}}>Resultado</div>
                <div style={{fontSize:20,fontFamily:"'Bebas Neue',sans-serif",color:lc}}>{pos?"+ ":"- "}{fmt(Math.abs(lucro))}</div>
              </div>
            </div>
            {isOpen&&(
              <div className="sem-body">
                <div style={{padding:"12px 0 4px"}}>
                  <div style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:"#00875A",fontWeight:700}}>Receita Bruta</span>
                      <span style={{fontSize:14,fontFamily:"'Bebas Neue',sans-serif",color:"#00875A"}}>{fmt(sem.receita)}</span>
                    </div>
                    <div style={{height:8,borderRadius:4,background:"#F0F0F0",overflow:"hidden"}}><div style={{width:"100%",height:"100%",background:"#00875A",borderRadius:4}}/></div>
                  </div>
                  <div style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontSize:12,color:"#CC0000",fontWeight:700}}>Despesas Totais</span>
                      <span style={{fontSize:14,fontFamily:"'Bebas Neue',sans-serif",color:"#CC0000"}}>{fmt(despTotal)}</span>
                    </div>
                    <div style={{height:8,borderRadius:4,background:"#F0F0F0",overflow:"hidden"}}><div style={{width:`${sem.receita>0?Math.min((despTotal/sem.receita)*100,100):100}%`,height:"100%",background:"#CC0000",borderRadius:4}}/></div>
                  </div>
                </div>
                <div style={{borderTop:"1px solid #F0F0F0",paddingTop:10}}>
                  {sem.diasRec.length>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,color:"#AAA",letterSpacing:".14em",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Receita por dia</div>
                      {[...sem.diasRec].sort((a,b)=>a.data.localeCompare(b.data)).map((r,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #F8F8F8",fontSize:13}}>
                          <span style={{color:"#555"}}>{fd(r.data)} - {DIAS_SEMANA[new Date(r.data+"T12:00:00").getDay()]}</span>
                          <span style={{fontFamily:"'Bebas Neue',sans-serif",color:"#00875A"}}>{fmt(r.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {sem.despEmp>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,color:"#AAA",letterSpacing:".14em",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Despesas Empresa</div>
                      {sem.despItens.filter(d=>d.centro==="empresa").map((d,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #F8F8F8",fontSize:13}}>
                          <span style={{color:"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"62%"}}>{d.descricao}</span>
                          <span style={{fontFamily:"'Bebas Neue',sans-serif",color:"#CC0000",flexShrink:0}}>- {fmt(d.valor)}</span>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:12,fontWeight:700,color:"#CC0000",borderTop:"1px solid #F0F0F0",marginTop:2}}>
                        <span>Subtotal Empresa</span><span style={{fontFamily:"'Bebas Neue',sans-serif"}}>- {fmt(sem.despEmp)}</span>
                      </div>
                    </div>
                  )}
                  {sem.despPes>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,color:"#AAA",letterSpacing:".14em",textTransform:"uppercase",fontWeight:700,marginBottom:6}}>Despesas Pessoais</div>
                      {sem.despItens.filter(d=>d.centro==="pessoal").map((d,i)=>(
                        <div key={i} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #F8F8F8",fontSize:13}}>
                          <span style={{color:"#555",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"62%"}}>{d.descricao}</span>
                          <span style={{fontFamily:"'Bebas Neue',sans-serif",color:"#888",flexShrink:0}}>- {fmt(d.valor)}</span>
                        </div>
                      ))}
                      <div style={{display:"flex",justifyContent:"space-between",padding:"6px 0",fontSize:12,fontWeight:700,color:"#888",borderTop:"1px solid #F0F0F0",marginTop:2}}>
                        <span>Subtotal Pessoal</span><span style={{fontFamily:"'Bebas Neue',sans-serif"}}>- {fmt(sem.despPes)}</span>
                      </div>
                    </div>
                  )}
                  <div style={{background:pos?"#F0FFF8":"#FFF5F5",borderRadius:10,padding:"12px 14px",marginTop:4,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <div style={{fontSize:11,color:"#888",letterSpacing:".1em",textTransform:"uppercase",fontWeight:700}}>Resultado da Semana</div>
                      <div style={{fontSize:11,color:"#AAA",marginTop:2}}>{fmt(sem.receita)} - {fmt(despTotal)}</div>
                    </div>
                    <div style={{fontSize:26,fontFamily:"'Bebas Neue',sans-serif",color:lc}}>{pos?"+ ":"- "}{fmt(Math.abs(lucro))}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ViewCaixa({mes,despesasAtivas}){
  const [registros,setRegistros]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [editReg,setEditReg]=useState(null);
  const [subView,setSubView]=useState("mensal");
  const load=useCallback(async()=>{
    setLoading(true);
    const d=await sbGetCaixa(mes);
    setRegistros(d||[]);
    setLoading(false);
  },[mes]);
  useEffect(()=>{setRegistros([]);load();},[load]);
  useEffect(()=>{
    if(showForm||editReg)return;
    const t=setInterval(()=>{sbGetCaixa(mes).then(d=>setRegistros(d||[]));},5000);
    return()=>clearInterval(t);
  },[mes,showForm,editReg]);
  const totalReceita=registros.reduce((s,r)=>s+(r.total||0),0);
  const totalDespesas=despesasAtivas.reduce((s,d)=>s+d.valor,0);
  const lucroMes=totalReceita-totalDespesas;
  const ticketMedio=registros.length>0?totalReceita/registros.length:0;
  const pctMeta=Math.min((totalReceita/META_MAX)*100,100);
  const metaCor=totalReceita>=META_MIN?"#00875A":totalReceita>=META_MIN*0.7?"#E65100":"#CC0000";
  const hoje2=hoje();
  const ultimos7=useMemo(()=>{
    const hj=new Date();hj.setHours(12);
    return Array.from({length:7},(_,i)=>{
      const d=new Date(hj);d.setDate(hj.getDate()-6+i);
      const key=d.toISOString().slice(0,10);
      const reg=registros.find(r=>r.data===key);
      return{key,label:DIAS_SEMANA[d.getDay()],dia:d.getDate(),total:reg?reg.total:0};
    });
  },[registros]);
  const maxDia7=Math.max(...ultimos7.map(d=>d.total),1);
  function DiaCard({reg}){
    let itens=[];
    if(reg.itens){
      try{itens=typeof reg.itens==="string"?JSON.parse(reg.itens):reg.itens;}
      catch{itens=[];}
    }
    const isHoje=reg.data===hoje2;
    return (
      <div className={`dia-card${isHoje?" hoje-card":""}`} onClick={()=>setEditReg(reg)}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{fontSize:15,fontFamily:"'Bebas Neue',sans-serif",color:isHoje?"#CC0000":"#1A1A1A"}}>{fd(reg.data)} - {DIAS_SEMANA[new Date(reg.data+"T12:00:00").getDay()]}</div>
            {isHoje&&<span style={{fontSize:9,background:"#CC0000",color:"#FFF",borderRadius:4,padding:"1px 6px",fontWeight:700}}>HOJE</span>}
          </div>
          <div style={{fontSize:20,fontFamily:"'Bebas Neue',sans-serif"}}>{fmt(reg.total)}</div>
        </div>
        {itens.length>0&&<div style={{fontSize:11,color:"#AAA",marginTop:2}}>{itens.map(it=>`${it.qtd}x ${it.nome}`).join(" - ")}</div>}
        {reg.obs&&<div style={{fontSize:11,color:"#888",marginTop:4,fontStyle:"italic"}}>{reg.obs}</div>}
      </div>
    );
  }
  return (
    <div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {[["mensal","Mensal"],["semanal","Semanal"],["balancete","Balancete"],["dias","Dias"]].map(([v,l])=>(
          <button key={v} onClick={()=>setSubView(v)} style={{flex:1,border:"none",borderRadius:8,padding:"9px 4px",fontSize:11,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:".06em",cursor:"pointer",transition:"all .18s",background:subView===v?"#CC0000":"#FFF",color:subView===v?"#FFF":"#888",boxShadow:subView===v?"0 2px 8px rgba(204,0,0,.3)":"0 1px 3px rgba(0,0,0,.06)"}}>{l}</button>
        ))}
      </div>
      {loading?<div style={{textAlign:"center",padding:"40px 0"}}><span className="spin"/></div>:(
        <>
          {subView==="mensal"&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div className="card" style={{borderLeft:"4px solid #00875A"}}>
                  <div style={{fontSize:10,color:"#AAA",letterSpacing:".18em",textTransform:"uppercase",fontWeight:600,marginBottom:4}}>Receita Bruta</div>
                  <div style={{fontSize:28,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>{fmt(totalReceita)}</div>
                  <div style={{fontSize:11,color:"#AAA",marginTop:4}}>{registros.length} dias fechados</div>
                </div>
                <div className="card" style={{borderLeft:`4px solid ${lucroMes>=0?"#00875A":"#CC0000"}`}}>
                  <div style={{fontSize:10,color:"#AAA",letterSpacing:".18em",textTransform:"uppercase",fontWeight:600,marginBottom:4}}>Lucro Liquido</div>
                  <div style={{fontSize:28,fontFamily:"'Bebas Neue',sans-serif",color:lucroMes>=0?"#00875A":"#CC0000",lineHeight:1}}>{fmt(lucroMes)}</div>
                  <div style={{fontSize:11,color:"#AAA",marginTop:4}}>Receita - Despesas</div>
                </div>
              </div>
              <div className="card" style={{marginBottom:12}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:13,fontWeight:700}}>Meta de Faturamento</div>
                  <div style={{fontSize:11,color:"#888"}}>{fmt(META_MIN)} - {fmt(META_MAX)}</div>
                </div>
                <div style={{height:8,borderRadius:4,background:"#F0F0F0",overflow:"hidden"}}><div style={{width:`${pctMeta}%`,height:"100%",background:metaCor,borderRadius:4,transition:"width .6s ease"}}/></div>
                <div style={{display:"flex",justifyContent:"space-between",marginTop:6}}>
                  <div style={{fontSize:12,color:metaCor,fontWeight:700}}>{((totalReceita/META_MIN)*100).toFixed(0)}% da meta minima</div>
                  <div style={{fontSize:11,color:"#AAA"}}>{fmt(Math.max(0,META_MIN-totalReceita))} p/ minima</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                <div className="card" style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#AAA",letterSpacing:".12em",textTransform:"uppercase",fontWeight:600,marginBottom:6}}>Ticket/dia</div>
                  <div style={{fontSize:24,fontFamily:"'Bebas Neue',sans-serif"}}>{fmt(ticketMedio)}</div>
                </div>
                <div className="card" style={{textAlign:"center"}}>
                  <div style={{fontSize:10,color:"#AAA",letterSpacing:".12em",textTransform:"uppercase",fontWeight:600,marginBottom:6}}>Total Despesas</div>
                  <div style={{fontSize:24,fontFamily:"'Bebas Neue',sans-serif",color:"#CC0000"}}>{fmt(totalDespesas)}</div>
                </div>
              </div>
              {registros.length===0&&<div style={{textAlign:"center",padding:"24px 0",color:"#CCC",fontSize:14}}>Nenhum fechamento registrado ainda.</div>}
            </>
          )}
          {subView==="semanal"&&(
            <>
              <div className="card" style={{marginBottom:12}}>
                <div style={{fontSize:13,fontWeight:700,marginBottom:14}}>Ultimos 7 dias</div>
                <div style={{display:"flex",gap:4,alignItems:"flex-end",height:100}}>
                  {ultimos7.map(({key,label,dia,total:t})=>(
                    <div key={key} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
                      <div style={{fontSize:10,color:t>0?"#00875A":"#CCC",fontWeight:700,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1}}>{t>0?`${(t/1000).toFixed(1)}k`:""}</div>
                      <div style={{width:"100%",background:key===hoje2?"#CC0000":t>0?"#00875A":"#F0F0F0",borderRadius:"4px 4px 0 0",height:`${Math.max((t/maxDia7)*80,t>0?6:4)}px`,transition:"height .4s ease"}}/>
                      <div style={{fontSize:10,color:key===hoje2?"#CC0000":"#888",fontWeight:key===hoje2?700:400,lineHeight:1}}>{label}</div>
                      <div style={{fontSize:9,color:"#CCC",lineHeight:1}}>{dia}</div>
                    </div>
                  ))}
                </div>
              </div>
              {(()=>{
                const semMap={};
                registros.forEach(r=>{const seg=segDaSemana(r.data);if(!semMap[seg])semMap[seg]={seg,rec:0,dias:0};semMap[seg].rec+=r.total;semMap[seg].dias+=1;});
                const sems=Object.values(semMap).sort((a,b)=>b.seg.localeCompare(a.seg));
                if(sems.length===0)return <div style={{textAlign:"center",padding:"24px 0",color:"#CCC",fontSize:14}}>Nenhum dado ainda.</div>;
                return sems.map((s,i)=>{
                  const iniD=new Date(s.seg+"T12:00:00");
                  const fimD=new Date(s.seg+"T12:00:00");fimD.setDate(iniD.getDate()+6);
                  const despSem=despesasAtivas.filter(d=>segDaSemana(d.data)===s.seg).reduce((acc,d)=>acc+d.valor,0);
                  const lucro=s.rec-despSem;
                  return (
                    <div key={i} className="card" style={{marginBottom:10}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                        <div style={{fontSize:13,fontWeight:700}}>{`${iniD.getDate()}/${iniD.getMonth()+1} - ${fimD.getDate()}/${fimD.getMonth()+1}`}</div>
                        <div style={{fontSize:18,fontFamily:"'Bebas Neue',sans-serif"}}>{fmt(s.rec)}</div>
                      </div>
                      <div style={{display:"flex",gap:16}}>
                        <div style={{fontSize:12,color:"#CC0000",fontWeight:700}}>Desp. {fmt(despSem)}</div>
                        <div style={{fontSize:12,color:lucro>=0?"#00875A":"#CC0000",fontWeight:700}}>{lucro>=0?"+":"-"} {fmt(Math.abs(lucro))}</div>
                      </div>
                      <div style={{fontSize:11,color:"#AAA",marginTop:4}}>{s.dias} dia(s) - ticket {fmt(s.rec/s.dias)}</div>
                    </div>
                  );
                });
              })()}
            </>
          )}
          {subView==="balancete"&&<Balancete registrosCaixa={registros} despesasAtivas={despesasAtivas}/>}
          {subView==="dias"&&(registros.length>0?registros.map(r=><DiaCard key={r.id} reg={r}/>):<div style={{textAlign:"center",padding:"32px 0",color:"#CCC",fontSize:14}}>Nenhum dia registrado.</div>)}
        </>
      )}
      <button className="fab" onClick={()=>setShowForm(true)}><span style={{fontSize:20,lineHeight:1}}>+</span> Fechar Caixa do Dia</button>
      {showForm&&<CaixaSheet mes={mes} diaExistente={null} onSaved={()=>load()} onClose={()=>setShowForm(false)}/>}
      {editReg&&<CaixaSheet mes={mes} diaExistente={editReg} onSaved={()=>{load();setEditReg(null);}} onClose={()=>setEditReg(null)}/>}
    </div>
  );
}

export default function AppIsaque(){
  const [mesIdx,setMesIdx]=useState(IDX_ATUAL);
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [view,setView]=useState("inicio");
  const [showForm,setShowForm]=useState(false);
  const [del,setDel]=useState(null);
  const [toast,setToast]=useState(null);
  const [collE,setCollE]=useState(true);
  const [collP,setCollP]=useState(true);
  const mes=MESES[mesIdx];
  const load=useCallback(async(silent=false)=>{
    if(!silent)setLoading(true);
    const d=await sbGet(mes);
    setItems(d||[]);
    if(!silent)setLoading(false);
  },[mes]);
  useEffect(()=>{setItems([]);load();},[load]);
  useEffect(()=>{
    if(showForm||del)return;
    const t=setInterval(()=>load(true),5000);
    return()=>clearInterval(t);
  },[load,showForm,del]);
  function showToast(m){setToast(m);setTimeout(()=>setToast(null),2500);}
  const ativos=useMemo(()=>items.filter(t=>!t.excluido),[items]);
  const empI=useMemo(()=>ativos.filter(t=>t.centro==="empresa").sort((a,b)=>b.data.localeCompare(a.data)),[ativos]);
  const pesI=useMemo(()=>ativos.filter(t=>t.centro==="pessoal").sort((a,b)=>b.data.localeCompare(a.data)),[ativos]);
  const totE=useMemo(()=>empI.reduce((s,t)=>s+t.valor,0),[empI]);
  const totP=useMemo(()=>pesI.reduce((s,t)=>s+t.valor,0),[pesI]);
  const total=totE+totP;
  function byCat(list){
    const m={};
    list.forEach(t=>{m[t.categoria]=(m[t.categoria]||0)+t.valor;});
    return Object.entries(m).map(([cat,val])=>({cat,val})).sort((a,b)=>b.val-a.val);
  }
  function Row({t}){
    return (
      <div className="row" style={{opacity:t.excluido?0.4:1}}>
        <div style={{display:"flex",gap:10,alignItems:"center",flex:1,minWidth:0}}>
          <div style={{width:3,height:36,background:t.excluido?"#DDD":(CAT_COR[t.categoria]||"#888"),borderRadius:2,flexShrink:0}}/>
          <div style={{minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,color:t.excluido?"#AAA":"#1A1A1A",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",textDecoration:t.excluido?"line-through":"none"}}>
              {t.descricao}{t.recorrente&&!t.excluido&&<span className="badge-rec">REC</span>}
            </div>
            <div style={{fontSize:11,color:"#999",marginTop:2}}>{fd(t.data)} - {t.categoria} - {t.meio}</div>
            {t.excluido&&t.motivo_exclusao&&<div style={{fontSize:10,color:"#CC0000",marginTop:1,fontWeight:600}}>Excluido: {t.motivo_exclusao}</div>}
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          <div style={{fontSize:15,fontFamily:"'Bebas Neue',sans-serif",color:t.excluido?"#CCC":"#1A1A1A"}}>{fmt(t.valor)}</div>
          {!t.excluido&&(
            <button onClick={()=>setDel(t)} style={{background:"none",border:"1px solid #EEE",borderRadius:6,width:26,height:26,cursor:"pointer",color:"#CCC",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",flexShrink:0}} onMouseEnter={e=>e.currentTarget.style.color="#CC0000"} onMouseLeave={e=>e.currentTarget.style.color="#CCC"}>x</button>
          )}
        </div>
      </div>
    );
  }
  function Coll({label,list,tot,cor,open,toggle}){
    return (
      <div className="coll">
        <div className="coll-h" onClick={toggle}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:4,height:18,background:cor,borderRadius:2}}/>
            <div>
              <div style={{fontSize:15,fontWeight:700}}>{label}</div>
              <div style={{fontSize:11,color:"#AAA",marginTop:1}}>{list.length} lancamentos</div>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:20,fontFamily:"'Bebas Neue',sans-serif"}}>{fmt(tot)}</div>
            <div style={{color:"#CCC",transition:"transform .2s",transform:open?"rotate(180deg)":"none"}}>v</div>
          </div>
        </div>
        {open&&(
          <div className="coll-b">
            {byCat(list).map(({cat,val})=>(
              <div key={cat} style={{padding:"9px 0",borderBottom:"1px solid #F5F5F5"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:CAT_COR[cat]||"#888"}}/>
                    <span style={{fontSize:13,color:"#333",fontWeight:600}}>{cat}</span>
                  </div>
                  <span style={{fontSize:13,fontFamily:"'Bebas Neue',sans-serif"}}>{fmt(val)}</span>
                </div>
                <Bar p={tot>0?(val/tot)*100:0} color={CAT_COR[cat]||"#888"}/>
                <div style={{fontSize:10,color:"#AAA",marginTop:3}}>{tot>0?((val/tot)*100).toFixed(1):0}%</div>
              </div>
            ))}
            <div style={{paddingBottom:4}}>{list.map(t=><Row key={t.id} t={t}/>)}</div>
          </div>
        )}
      </div>
    );
  }
  const anyModal=showForm||!!del;
  return (
    <div style={{background:"#F5F5F5",minHeight:"100vh",maxWidth:480,margin:"0 auto"}}>
      <style>{CSS}</style>
      <div style={{background:"#FFF",borderBottom:"2px solid #CC0000",padding:"14px 20px 0",position:"sticky",top:0,zIndex:50,boxShadow:"0 2px 8px rgba(0,0,0,.07)"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:10}}>
          <svg width="44" height="44" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="50" fill="#FFF"/>
            <circle cx="50" cy="50" r="49" fill="none" stroke="#F0F0F0" strokeWidth="1"/>
            <g transform="translate(18,10)">
              <circle cx="8" cy="8" r="3" fill="none" stroke="#1A1A1A" strokeWidth="2"/>
              <circle cx="32" cy="4" r="3" fill="none" stroke="#1A1A1A" strokeWidth="2"/>
              <circle cx="56" cy="8" r="3" fill="none" stroke="#1A1A1A" strokeWidth="2"/>
              <polyline points="8,8 18,26 32,16 46,26 56,8 52,32 12,32" fill="none" stroke="#1A1A1A" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round"/>
              <line x1="12" y1="32" x2="52" y2="32" stroke="#1A1A1A" strokeWidth="2.2"/>
            </g>
            <g transform="translate(12,42)">
              <rect x="0" y="0" width="76" height="28" rx="3" fill="none" stroke="#1A1A1A" strokeWidth="2.5"/>
              <text x="4" y="22" fontFamily="Arial Black,sans-serif" fontSize="22" fontWeight="900" fill="#1A1A1A" letterSpacing="2">PICO</text>
            </g>
            <text x="38" y="88" fontFamily="Georgia,serif" fontSize="11" fill="#CC0000" fontStyle="italic" textAnchor="middle">barbershop</text>
          </svg>
          <div style={{flex:1}}>
            <div style={{fontSize:20,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:".08em",lineHeight:1}}>Pico Barber Shop</div>
            <div style={{fontSize:11,color:"#AAA",letterSpacing:".15em",textTransform:"uppercase",marginTop:1}}>Ola, Isaque</div>
          </div>
          {loading&&view!=="caixa"&&<span className="spin"/>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,background:"#F8F8F8",borderRadius:8,padding:"6px 10px",border:"1px solid #EEE"}}>
          <button onClick={()=>setMesIdx(i=>Math.max(0,i-1))} disabled={mesIdx===0} style={{background:"none",border:"none",color:mesIdx===0?"#DDD":"#888",cursor:mesIdx===0?"not-allowed":"pointer",fontSize:20,lineHeight:1,padding:"0 4px"}}>&#8249;</button>
          <div style={{flex:1,textAlign:"center",fontSize:15,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:".1em"}}>{ML[mes]}</div>
          <button onClick={()=>setMesIdx(i=>Math.min(MESES.length-1,i+1))} disabled={mesIdx===MESES.length-1} style={{background:"none",border:"none",color:mesIdx===MESES.length-1?"#DDD":"#888",cursor:mesIdx===MESES.length-1?"not-allowed":"pointer",fontSize:20,lineHeight:1,padding:"0 4px"}}>&#8250;</button>
        </div>
        <div style={{display:"flex",borderBottom:"1px solid #F0F0F0"}}>
          {[["inicio","Inicio"],["caixa","Caixa"],["historico","Historico"],["categorias","Categorias"]].map(([v,l])=>(
            <button key={v} className={`tab-b${view===v?" on":""}`} onClick={()=>setView(v)}>{l}</button>
          ))}
        </div>
      </div>
      <div style={{padding:"20px 16px 100px"}}>
        {view==="inicio"&&(
          <>
            <div style={{background:"#FFF",borderRadius:14,padding:"22px 20px",marginBottom:16,boxShadow:"0 1px 6px rgba(0,0,0,.06)",borderLeft:"4px solid #CC0000"}}>
              <div style={{fontSize:10,color:"#AAA",letterSpacing:".2em",textTransform:"uppercase",marginBottom:4,fontWeight:600}}>Total Despesas - {ML[mes]}</div>
              <div style={{fontSize:40,fontFamily:"'Bebas Neue',sans-serif",lineHeight:1,marginBottom:6}}>{loading&&!items.length?"...":fmt(total)}</div>
              <div style={{fontSize:12,color:"#AAA",letterSpacing:".08em",textTransform:"uppercase"}}>{ativos.length} lancamentos ativos</div>
              {total>0&&(
                <div style={{marginTop:16,display:"flex",flexDirection:"column",gap:10}}>
                  {[["Empresa",totE,"#CC0000"],["Pessoal",totP,"#666666"]].filter(([,v])=>v>0).map(([l,v,c])=>(
                    <div key={l}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                        <span style={{fontSize:13,color:"#666",fontWeight:700}}>{l}</span>
                        <span style={{fontSize:13,color:c,fontWeight:700}}>{fmt(v)}</span>
                      </div>
                      <div style={{background:"#F0F0F0",borderRadius:3,height:5,overflow:"hidden"}}>
                        <div style={{width:`${total>0?(v/total)*100:0}%`,background:c,height:"100%",borderRadius:3,transition:"width .6s"}}/>
                      </div>
                      <div style={{fontSize:10,color:"#AAA",marginTop:3,textAlign:"right"}}>{total>0?((v/total)*100).toFixed(1):0}%</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{fontSize:10,color:"#AAA",letterSpacing:".2em",textTransform:"uppercase",marginBottom:10,fontWeight:600}}>{items.length>0?"Ultimos lancamentos":"Nenhum lancamento neste mes"}</div>
            {loading&&!items.length?<div style={{textAlign:"center",padding:"40px 0"}}><span className="spin"/></div>:items.length>0?(
              <div style={{background:"#FFF",borderRadius:12,padding:"0 16px",boxShadow:"0 1px 6px rgba(0,0,0,.06)"}}>
                {[...items].sort((a,b)=>b.data.localeCompare(a.data)).slice(0,10).map(t=><Row key={t.id} t={t}/>)}
              </div>
            ):(
              <div style={{background:"#FFF",borderRadius:12,padding:"32px 20px",textAlign:"center",boxShadow:"0 1px 6px rgba(0,0,0,.06)"}}>
                <div style={{fontSize:32,marginBottom:10}}>&#9986;</div>
                <div style={{fontSize:15,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:".06em",marginBottom:6}}>Sem lancamentos</div>
                <div style={{fontSize:13,color:"#AAA",lineHeight:1.5}}>Toque em Lancar Despesa para registrar.</div>
              </div>
            )}
          </>
        )}
        {view==="caixa"&&<ViewCaixa mes={mes} despesasAtivas={ativos}/>}
        {view==="historico"&&(
          <>
            <div style={{fontSize:10,color:"#AAA",letterSpacing:".18em",textTransform:"uppercase",marginBottom:14,fontWeight:600}}>{items.length} lancamentos - {ML[mes]}</div>
            {totE>0&&<Coll label="Empresa" list={empI} tot={totE} cor="#CC0000" open={collE} toggle={()=>setCollE(o=>!o)}/>}
            {totP>0&&<Coll label="Pessoal" list={pesI} tot={totP} cor="#666666" open={collP} toggle={()=>setCollP(o=>!o)}/>}
            {total===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#CCC",fontSize:14}}>Nenhum lancamento neste mes.</div>}
          </>
        )}
        {view==="categorias"&&(
          <>
            <div style={{fontSize:10,color:"#AAA",letterSpacing:".18em",textTransform:"uppercase",marginBottom:14,fontWeight:600}}>Categorias - {ML[mes]}</div>
            {[["Empresa",empI,totE,"#CC0000"],["Pessoal",pesI,totP,"#666666"]].filter(([,,t])=>t>0).map(([titulo,list,tot,cor])=>(
              <div key={titulo} style={{background:"#FFF",borderRadius:12,padding:16,marginBottom:12,boxShadow:"0 1px 6px rgba(0,0,0,.06)"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,paddingBottom:10,borderBottom:"1px solid #F5F5F5"}}>
                  <div style={{fontSize:14,fontWeight:700}}>{titulo}</div>
                  <div style={{fontSize:18,fontFamily:"'Bebas Neue',sans-serif",color:cor}}>{fmt(tot)}</div>
                </div>
                {byCat(list).map(({cat,val})=>(
                  <div key={cat} style={{marginBottom:12}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,alignItems:"center"}}>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:CAT_COR[cat]||"#888"}}/>
                        <span style={{fontSize:13,color:"#333",fontWeight:700}}>{cat}</span>
                      </div>
                      <span style={{fontSize:13,fontFamily:"'Bebas Neue',sans-serif"}}>{fmt(val)}</span>
                    </div>
                    <div style={{background:"#F0F0F0",borderRadius:3,height:5,overflow:"hidden"}}>
                      <div style={{width:`${tot>0?(val/tot)*100:0}%`,background:CAT_COR[cat]||"#888",height:"100%",borderRadius:3,transition:"width .6s"}}/>
                    </div>
                    <div style={{fontSize:10,color:"#AAA",marginTop:3}}>{tot>0?((val/tot)*100).toFixed(1):0}% - {ativos.filter(t=>t.categoria===cat).length} itens</div>
                  </div>
                ))}
              </div>
            ))}
            {total===0&&<div style={{textAlign:"center",padding:"40px 0",color:"#CCC",fontSize:14}}>Nenhum lancamento neste mes.</div>}
          </>
        )}
      </div>
      {!anyModal&&view!=="caixa"&&(
        <button className="fab" onClick={()=>setShowForm(true)}><span style={{fontSize:20,lineHeight:1}}>+</span> Lancar Despesa</button>
      )}
      {showForm&&<FormSheet mes={mes} onSaved={()=>{load();showToast("Lancamento registrado");}} onClose={()=>setShowForm(false)}/>}
      {del&&<DelSheet item={del} onDone={()=>{load();showToast("Lancamento excluido");}} onClose={()=>setDel(null)}/>}
      {toast&&<div className="toast">{toast}</div>}
    </div>
  );
}
