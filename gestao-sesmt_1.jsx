import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, UserCircle2, Building2, ListChecks, Stethoscope, Keyboard,
  FileText, AlertCircle, CheckSquare, CalendarDays, Clock, BarChart3, Users,
  History, Settings, Menu, X, Search, Bell, ChevronDown, ChevronRight, Plus,
  Pencil, Trash2, Eye, ArrowLeft, TriangleAlert, CircleCheck, CircleDot,
  Filter, ChevronLeft, ChevronRight as ChevronRightIcon, LogOut, Lock
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell, Legend
} from "recharts";

/* ============================== THEME TOKENS ============================== */
// Palette: deep clinical navy + teal (health/safety), warm amber/red reserved for alerts.
const T = {
  ink: "#12233B",       // primary text / deep navy
  ink2: "#3A4C63",       // secondary text
  muted: "#7387A0",     // muted text
  line: "#E2E8F0",      // hairline borders
  bg: "#F4F7FA",        // app background
  surface: "#FFFFFF",
  teal: "#0E7C7B",      // primary accent
  tealDark: "#0A5E5D",
  tealSoft: "#E4F3F1",
  amber: "#B8720B",
  amberSoft: "#FBF0DD",
  red: "#B23A32",
  redSoft: "#FBE7E4",
  green: "#2A7A4E",
  greenSoft: "#E4F4EA",
  slateSoft: "#EEF2F6",
};

/* ============================== CONSTANTS ============================== */
const STATUS_OCORRENCIA = ["Não iniciada","Em andamento","Concluída","Com pendência","Com problema","Cancelada"];
const STATUS_EXAME = ["Não iniciado","Agendado","Em andamento","Parcialmente realizado","Concluído","Com pendência","Cancelado"];
const STATUS_DIGITACAO = ["Aguardando início","Em andamento","Aguardando pendência","Em revisão","Finalizado","Com problema"];
const STATUS_DOCUMENTO = ["Aguardando início","Em andamento","Entregue","DR corrigindo","Com problema","Aguardando informações","Em revisão","Cancelado"];
const STATUS_PENDENCIA = ["Aberta","Em andamento","Aguardando empresa","Aguardando usuário","Resolvida","Cancelada"];
const STATUS_VISITA = ["Agendada","Confirmada","Realizada","Cancelada","Reagendada"];
const PRIORIDADES = ["Baixa","Média","Alta","Urgente"];
const GRAUS_RISCO = [1,2,3,4];
const PERFIS = ["Administrador","Gestor","Usuário","Consulta"];
const TIPOS_EXAME_COMPLEMENTAR = ["Acuidade visual","Eletroencefalograma","Espirometria","Eletrocardiograma","Acuidade tonal"];
const TIPOS_OCORRENCIA = ["Exame periódico","Exame complementar","Digitação","PCMSO","LTCAT","Checklist","Cadastro de PCMSO","Outros"];
const TIPOS_DOCUMENTO = ["PCMSO","LTCAT","Checklist","Outros"];
const TIPOS_VISITA = ["Técnica","Comercial","Auditoria","Acompanhamento","Entrega de documento"];

const CONCLUDED = new Set(["Concluída","Concluído","Entregue","Resolvida","Finalizado","Realizada"]);
const CANCELLED = new Set(["Cancelada","Cancelado"]);

/* ============================== BACKEND (Google Sheets via Apps Script) ==============================
 * Preencha API_URL com a URL do seu Web App do Apps Script (termina em /exec) e
 * API_TOKEN com o mesmo token definido na constante TOKEN do arquivo Code.gs.
 * Deixando API_URL em branco, o app roda em modo demonstração (dados locais, sem servidor). */
const API_URL = "https://script.google.com/macros/s/AKfycbz2BH1JpEdHKaOw8QgtxYqsF_NbBjF8Utt1wuCvTQ_AGCqC5bWKZayd0pBsy-owHEZl/exec";
const API_TOKEN = "sesmt-2026-x7k9pQmZ";
const ENTITY_KEYS = ["companies","users","occurrences","periodicExams","complementaryExams","typings","documents","pendencies","visits","audit"];

async function apiList() {
  const url = `${API_URL}?token=${encodeURIComponent(API_TOKEN)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Falha ao carregar dados da planilha");
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

async function apiMutate(entity, action, record) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // evita preflight CORS no Apps Script
    body: JSON.stringify({ token: API_TOKEN, entity, action, record }),
  });
  if (!res.ok) throw new Error("Falha ao salvar na planilha");
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

// Login é conferido inteiramente no servidor (Apps Script): a senha nunca é
// comparada no navegador nem devolvida — só o resultado ok/erro e os dados
// não sensíveis do usuário autenticado.
async function apiLogin(email, senha) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ token: API_TOKEN, action: "login", record: { email, senha } }),
  });
  if (!res.ok) throw new Error("Falha ao efetuar login");
  return res.json(); // { ok: true, user } ou { ok: false, error }
}

/* ============================== UTILITIES ============================== */
const uid = (() => { let n = 1000; return (p="id") => `${p}_${(n++).toString(36)}`; })();

function todayISO() { return new Date().toISOString().slice(0,10); }
function addDays(days, base) {
  const d = base ? new Date(base) : new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}
function fmtDate(iso) {
  if (!iso) return "—";
  const [y,m,d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function diffDaysFromToday(iso) {
  if (!iso) return null;
  const today = new Date(todayISO()+"T00:00:00");
  const d = new Date(iso+"T00:00:00");
  return Math.round((d-today)/86400000);
}
function isLate(prazo, status) {
  if (!prazo) return false;
  if (CONCLUDED.has(status) || CANCELLED.has(status)) return false;
  return diffDaysFromToday(prazo) < 0;
}
function vencimentoBucket(iso) {
  if (!iso) return null;
  const dd = diffDaysFromToday(iso);
  if (dd < 0) return "vencido";
  if (dd <= 7) return "critico";
  if (dd <= 30) return "atencao";
  return "ok";
}
const BUCKET_META = {
  vencido: { label: "Vencido", color: T.red, bg: T.redSoft },
  critico: { label: "Até 7 dias", color: "#C2540E", bg: "#FDECDC" },
  atencao: { label: "Até 30 dias", color: T.amber, bg: T.amberSoft },
  ok: { label: "Em dia", color: T.green, bg: T.greenSoft },
};

function classNames(...a) { return a.filter(Boolean).join(" "); }

/* ============================== SEED DATA ============================== */
function seedData() {
  const companies = [
    { id:"c1", razaoSocial:"Metalúrgica Vale Forte Ltda", nomeFantasia:"Vale Forte", cnpj:"12.345.678/0001-90", telefone:"(75) 3221-4455", email:"contato@valeforte.com.br", endereco:"Av. Industrial, 450", cidade:"Santo Antônio de Jesus - BA", responsavel:"Renata Lima", situacao:"Ativa", observacoes:"Cliente desde 2021." },
    { id:"c2", razaoSocial:"Agro Recôncavo Insumos S.A.", nomeFantasia:"Agro Recôncavo", cnpj:"98.765.432/0001-11", telefone:"(75) 3225-1010", email:"rh@agroreconcavo.com.br", endereco:"Rod. BA-052, km 12", cidade:"Cruz das Almas - BA", responsavel:"Marcos Andrade", situacao:"Ativa", observacoes:"" },
    { id:"c3", razaoSocial:"Construtora Baía Sul Ltda", nomeFantasia:"Baía Sul Construções", cnpj:"22.111.333/0001-55", telefone:"(71) 3344-9090", email:"seguranca@baiasul.com.br", endereco:"Rua das Palmeiras, 88", cidade:"Salvador - BA", responsavel:"Camila Duarte", situacao:"Ativa", observacoes:"Alta rotatividade de obra." },
    { id:"c4", razaoSocial:"Têxtil Bahia Norte Ltda", nomeFantasia:"Bahia Norte Têxtil", cnpj:"33.222.444/0001-20", telefone:"(75) 3231-7788", email:"adm@bahianorte.com.br", endereco:"Distrito Industrial, Galpão 7", cidade:"Feira de Santana - BA", responsavel:"Paulo Santos", situacao:"Ativa", observacoes:"" },
    { id:"c5", razaoSocial:"Transportes Rio Doce Ltda", nomeFantasia:"Rio Doce Transportes", cnpj:"44.555.666/0001-77", telefone:"(75) 3212-3030", email:"contato@riodocetransp.com.br", endereco:"BR-101, km 540", cidade:"Feira de Santana - BA", responsavel:"Juliana Ferreira", situacao:"Inativa", observacoes:"Contrato suspenso em jul/2026." },
    { id:"c6", razaoSocial:"Frigorífico Serra Dourada Ltda", nomeFantasia:"Serra Dourada", cnpj:"55.666.777/0001-33", telefone:"(75) 3227-6060", email:"qualidade@serradourada.com.br", endereco:"Zona Rural, s/n", cidade:"Santo Antônio de Jesus - BA", responsavel:"Eduardo Nascimento", situacao:"Ativa", observacoes:"" },
  ];

  const users = [
    { id:"u1", nome:"João Pereira", email:"joao.pereira@sesmt.com.br", senha:"admin123", perfil:"Administrador", status:"Ativo", dataCadastro:addDays(-620) },
    { id:"u2", nome:"Maria Santos", email:"maria.santos@sesmt.com.br", senha:"maria123", perfil:"Gestor", status:"Ativo", dataCadastro:addDays(-410) },
    { id:"u3", nome:"Ana Oliveira", email:"ana.oliveira@sesmt.com.br", senha:"ana123", perfil:"Usuário", status:"Ativo", dataCadastro:addDays(-280) },
    { id:"u4", nome:"Carlos Souza", email:"carlos.souza@sesmt.com.br", senha:"carlos123", perfil:"Usuário", status:"Ativo", dataCadastro:addDays(-150) },
    { id:"u5", nome:"Beatriz Ramos", email:"beatriz.ramos@sesmt.com.br", senha:"beatriz123", perfil:"Consulta", status:"Ativo", dataCadastro:addDays(-60) },
  ];

  const occurrences = [
    { id:"o1", companyId:"c1", tipo:"Exame periódico", dataCriacao:addDays(-20), usuarioResponsavel:"u3", status:"Em andamento", prioridade:"Alta", prazo:addDays(3), dataConclusao:"", pendencias:"Falta agendar 4 colaboradores", observacoes:"" },
    { id:"o2", companyId:"c2", tipo:"PCMSO", dataCriacao:addDays(-45), usuarioResponsavel:"u2", status:"Com pendência", prioridade:"Urgente", prazo:addDays(-2), dataConclusao:"", pendencias:"Aguardando ASO de 2 setores", observacoes:"" },
    { id:"o3", companyId:"c3", tipo:"Checklist", dataCriacao:addDays(-5), usuarioResponsavel:"u4", status:"Concluída", prioridade:"Média", prazo:addDays(-1), dataConclusao:addDays(-1), pendencias:"", observacoes:"Sem apontamentos." },
    { id:"o4", companyId:"c4", tipo:"LTCAT", dataCriacao:addDays(-60), usuarioResponsavel:"u2", status:"Em andamento", prioridade:"Alta", prazo:addDays(10), dataConclusao:"", pendencias:"", observacoes:"" },
    { id:"o5", companyId:"c1", tipo:"Digitação", dataCriacao:addDays(-8), usuarioResponsavel:"u3", status:"Com problema", prioridade:"Alta", prazo:addDays(-4), dataConclusao:"", pendencias:"Prontuário ilegível", observacoes:"" },
    { id:"o6", companyId:"c6", tipo:"Exame complementar", dataCriacao:addDays(-15), usuarioResponsavel:"u4", status:"Não iniciada", prioridade:"Baixa", prazo:addDays(15), dataConclusao:"", pendencias:"", observacoes:"" },
    { id:"o7", companyId:"c2", tipo:"Cadastro de PCMSO", dataCriacao:addDays(-2), usuarioResponsavel:"u2", status:"Concluída", prioridade:"Média", prazo:addDays(-1), dataConclusao:addDays(-1), pendencias:"", observacoes:"" },
    { id:"o8", companyId:"c3", tipo:"Outros", dataCriacao:addDays(-1), usuarioResponsavel:"u4", status:"Não iniciada", prioridade:"Baixa", prazo:addDays(20), dataConclusao:"", pendencias:"", observacoes:"" },
  ];

  const periodicExams = [
    { id:"pe1", companyId:"c1", dataProgramada:addDays(5), setor:"Produção", medico:"Dr. Renato Alves", qtdPrevista:40, qtdRealizada:28, status:"Em andamento", prioridade:"Alta", observacoes:"" },
    { id:"pe2", companyId:"c2", dataProgramada:addDays(-3), setor:"Administrativo", medico:"Dra. Fernanda Melo", qtdPrevista:15, qtdRealizada:15, status:"Concluído", prioridade:"Média", observacoes:"" },
    { id:"pe3", companyId:"c4", dataProgramada:addDays(12), setor:"Tecelagem", medico:"Dr. Renato Alves", qtdPrevista:60, qtdRealizada:0, status:"Agendado", prioridade:"Alta", observacoes:"" },
    { id:"pe4", companyId:"c6", dataProgramada:addDays(-10), setor:"Abate", medico:"Dra. Fernanda Melo", qtdPrevista:35, qtdRealizada:20, status:"Com pendência", prioridade:"Urgente", observacoes:"Colaboradores em férias" },
    { id:"pe5", companyId:"c3", dataProgramada:addDays(2), setor:"Obra Civil", medico:"Dr. Igor Cunha", qtdPrevista:25, qtdRealizada:10, status:"Parcialmente realizado", prioridade:"Alta", observacoes:"" },
  ];

  const complementaryExams = [
    { id:"ce1", companyId:"c1", setor:"Produção", exame:"Acuidade tonal", realizadoPor:"u3", status:"Em andamento", qtdPrevista:40, qtdRealizada:22, local:"Clínica Central", dataRealizada:"", pendencias:"", observacoes:"" },
    { id:"ce2", companyId:"c4", setor:"Tecelagem", exame:"Espirometria", realizadoPor:"u4", status:"Concluído", qtdPrevista:60, qtdRealizada:60, local:"Unidade Móvel", dataRealizada:addDays(-6), pendencias:"", observacoes:"" },
    { id:"ce3", companyId:"c6", setor:"Abate", exame:"Acuidade visual", realizadoPor:"u3", status:"Com pendência", qtdPrevista:35, qtdRealizada:18, local:"Clínica Central", dataRealizada:"", pendencias:"Falta laudo de 2 colaboradores", observacoes:"" },
    { id:"ce4", companyId:"c2", setor:"Administrativo", exame:"Eletrocardiograma", realizadoPor:"u2", status:"Não iniciado", qtdPrevista:15, qtdRealizada:0, local:"", dataRealizada:"", pendencias:"", observacoes:"" },
    { id:"ce5", companyId:"c3", setor:"Obra Civil", exame:"Eletroencefalograma", realizadoPor:"u4", status:"Em andamento", qtdPrevista:8, qtdRealizada:3, local:"Clínica Central", dataRealizada:"", pendencias:"", observacoes:"" },
  ];

  const typings = [
    { id:"t1", companyId:"c1", usuarioResponsavel:"u3", dataInicio:addDays(-4), pendenciasProcedencia:"", grauRisco:2, prioridade:"Alta", previsaoEntrega:addDays(1), dataFinalizacao:"", status:"Em andamento", observacoes:"" },
    { id:"t2", companyId:"c2", usuarioResponsavel:"u4", dataInicio:addDays(-10), pendenciasProcedencia:"Falta assinatura do médico", grauRisco:3, prioridade:"Urgente", previsaoEntrega:addDays(-3), dataFinalizacao:"", status:"Aguardando pendência", observacoes:"" },
    { id:"t3", companyId:"c6", usuarioResponsavel:"u3", dataInicio:addDays(-2), pendenciasProcedencia:"", grauRisco:1, prioridade:"Baixa", previsaoEntrega:addDays(3), dataFinalizacao:"", status:"Aguardando início", observacoes:"" },
    { id:"t4", companyId:"c4", usuarioResponsavel:"u4", dataInicio:addDays(-15), pendenciasProcedencia:"", grauRisco:2, prioridade:"Média", previsaoEntrega:addDays(-9), dataFinalizacao:addDays(-8), status:"Finalizado", observacoes:"" },
  ];

  const documents = [
    { id:"d1", companyId:"c1", tipo:"PCMSO", usuarioResponsavel:"u2", dataInicio:addDays(-60), dataPrevista:addDays(5), dataFim:"", status:"Em andamento", pendencias:"", observacoes:"", dataVencimento:addDays(20) },
    { id:"d2", companyId:"c2", tipo:"PCMSO", usuarioResponsavel:"u2", dataInicio:addDays(-200), dataPrevista:addDays(-190), dataFim:addDays(-190), status:"Entregue", pendencias:"", observacoes:"", dataVencimento:addDays(-5) },
    { id:"d3", companyId:"c3", tipo:"LTCAT", usuarioResponsavel:"u4", dataInicio:addDays(-30), dataPrevista:addDays(10), dataFim:"", status:"Em andamento", pendencias:"", observacoes:"", dataVencimento:addDays(45) },
    { id:"d4", companyId:"c4", tipo:"LTCAT", usuarioResponsavel:"u4", dataInicio:addDays(-400), dataPrevista:addDays(-390), dataFim:addDays(-390), status:"Entregue", pendencias:"", observacoes:"", dataVencimento:addDays(6) },
    { id:"d5", companyId:"c6", tipo:"Checklist", usuarioResponsavel:"u3", dataInicio:addDays(-3), dataPrevista:addDays(1), dataFim:"", status:"Em andamento", pendencias:"", observacoes:"", dataVencimento:"" },
    { id:"d6", companyId:"c1", tipo:"Checklist", usuarioResponsavel:"u3", dataInicio:addDays(-10), dataPrevista:addDays(-9), dataFim:addDays(-9), status:"Entregue", pendencias:"", observacoes:"", dataVencimento:"" },
    { id:"d7", companyId:"c3", tipo:"Outros", usuarioResponsavel:"u2", dataInicio:addDays(-5), dataPrevista:addDays(2), dataFim:"", status:"Aguardando informações", pendencias:"Aguardando dados da empresa", observacoes:"", dataVencimento:addDays(25) },
    { id:"d8", companyId:"c2", tipo:"PCMSO", usuarioResponsavel:"u2", dataInicio:addDays(-100), dataPrevista:addDays(-90), dataFim:addDays(-90), status:"Entregue", pendencias:"", observacoes:"", dataVencimento:addDays(365) },
  ];

  const pendencies = [
    { id:"p1", companyId:"c1", tipo:"Documentação", descricao:"Enviar cópia da CTPS de 3 colaboradores", responsavel:"u3", dataCriacao:addDays(-6), prazo:addDays(-1), prioridade:"Alta", status:"Aguardando empresa", dataConclusao:"", observacoes:"" },
    { id:"p2", companyId:"c2", tipo:"Exame", descricao:"Agendar audiometria de 2 colaboradores", responsavel:"u2", dataCriacao:addDays(-3), prazo:addDays(4), prioridade:"Média", status:"Em andamento", dataConclusao:"", observacoes:"" },
    { id:"p3", companyId:"c6", tipo:"Assinatura", descricao:"Aguardando assinatura do médico coordenador", responsavel:"u4", dataCriacao:addDays(-12), prazo:addDays(-5), prioridade:"Urgente", status:"Aguardando usuário", dataConclusao:"", observacoes:"" },
    { id:"p4", companyId:"c3", tipo:"Cadastro", descricao:"Atualizar dados cadastrais da obra", responsavel:"u4", dataCriacao:addDays(-1), prazo:addDays(6), prioridade:"Baixa", status:"Aberta", dataConclusao:"", observacoes:"" },
    { id:"p5", companyId:"c1", tipo:"Documentação", descricao:"Confirmar setor de 5 colaboradores novos", responsavel:"u3", dataCriacao:addDays(-20), prazo:addDays(-15), prioridade:"Média", status:"Resolvida", dataConclusao:addDays(-14), observacoes:"" },
  ];

  const visits = [
    { id:"v1", companyId:"c1", data:todayISO(), horario:"09:00", responsavel:"u3", tipo:"Técnica", objetivo:"Acompanhar exames periódicos", status:"Confirmada", observacoes:"" },
    { id:"v2", companyId:"c3", data:addDays(1), horario:"14:00", responsavel:"u4", tipo:"Auditoria", objetivo:"Auditoria de checklist da obra", status:"Agendada", observacoes:"" },
    { id:"v3", companyId:"c2", data:addDays(4), horario:"10:30", responsavel:"u2", tipo:"Entrega de documento", objetivo:"Entregar PCMSO atualizado", status:"Agendada", observacoes:"" },
    { id:"v4", companyId:"c6", data:addDays(9), horario:"08:00", responsavel:"u4", tipo:"Acompanhamento", objetivo:"Acompanhar pendências de exames", status:"Agendada", observacoes:"" },
    { id:"v5", companyId:"c4", data:addDays(-2), horario:"11:00", responsavel:"u2", tipo:"Comercial", objetivo:"Renovação de contrato", status:"Realizada", observacoes:"" },
  ];

  const audit = [
    { id:"a1", usuario:"Maria Santos", data:addDays(-1), horario:"14:30", acao:"Alteração de status", modulo:"Documentos", registro:"PCMSO — Vale Forte", valorAnterior:"Aguardando início", novoValor:"Em andamento" },
    { id:"a2", usuario:"Carlos Souza", data:addDays(-2), horario:"09:12", acao:"Cadastro", modulo:"Pendências", registro:"Agendar audiometria — Agro Recôncavo", valorAnterior:"—", novoValor:"Aberta" },
    { id:"a3", usuario:"Ana Oliveira", data:addDays(-3), horario:"16:45", acao:"Conclusão", modulo:"Ocorrências", registro:"Checklist — Baía Sul", valorAnterior:"Em andamento", novoValor:"Concluída" },
  ];

  const config = {
    prazoDigitacaoDias: 5,
    prazoDigitacaoUrgenteDias: 2,
    diasAlertaVencimentoCritico: 7,
    diasAlertaVencimentoAtencao: 30,
    tiposDocumento: [...TIPOS_DOCUMENTO],
    tiposExameComplementar: [...TIPOS_EXAME_COMPLEMENTAR],
    prioridades: [...PRIORIDADES],
    perfis: [...PERFIS],
  };

  return { companies, users, occurrences, periodicExams, complementaryExams, typings, documents, pendencies, visits, audit, config };
}

/* ============================== SMALL UI PRIMITIVES ============================== */

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: { bg: T.slateSoft, color: T.ink2 },
    info: { bg: T.tealSoft, color: T.tealDark },
    success: { bg: T.greenSoft, color: T.green },
    warning: { bg: T.amberSoft, color: T.amber },
    danger: { bg: T.redSoft, color: T.red },
  };
  const s = tones[tone] || tones.neutral;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {children}
    </span>
  );
}

function statusTone(status) {
  if (CONCLUDED.has(status)) return "success";
  if (CANCELLED.has(status)) return "neutral";
  if (/problema|pendência|pendencia/i.test(status)) return "danger";
  if (/aguardando|revis/i.test(status)) return "warning";
  return "info";
}

function StatusBadge({ status, prazo }) {
  if (isLate(prazo, status)) {
    return <Badge tone="danger"><TriangleAlert size={12}/> Atrasado</Badge>;
  }
  return <Badge tone={statusTone(status)}>{status}</Badge>;
}

function PriorityBadge({ p }) {
  const tone = p === "Urgente" ? "danger" : p === "Alta" ? "warning" : p === "Média" ? "info" : "neutral";
  return <Badge tone={tone}>{p}</Badge>;
}

function Card({ children, className = "", ...rest }) {
  return (
    <div
      className={classNames("rounded-2xl bg-white", className)}
      style={{ border: `1px solid ${T.line}`, boxShadow: "0 1px 2px rgba(18,35,59,0.04)" }}
      {...rest}
    >
      {children}
    </div>
  );
}

function SectionHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: T.ink }}>{title}</h2>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: T.muted }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function KpiCard({ label, value, sub, tone = "neutral", icon: Icon }) {
  const tones = {
    neutral: T.ink, info: T.teal, warning: T.amber, danger: T.red, success: T.green,
  };
  const c = tones[tone];
  return (
    <Card className="p-4 flex-1 min-w-[160px]">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: T.muted, letterSpacing: "0.04em" }}>{label}</span>
        {Icon && <Icon size={16} style={{ color: c }} />}
      </div>
      <div className="mt-2 text-2xl font-semibold" style={{ color: T.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: T.muted }}>{sub}</div>}
    </Card>
  );
}

function Button({ children, variant = "primary", size = "md", className = "", ...rest }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-3.5 py-2 text-sm" };
  const variants = {
    primary: { background: T.teal, color: "#fff" },
    secondary: { background: T.slateSoft, color: T.ink },
    outline: { background: "transparent", color: T.ink2, border: `1px solid ${T.line}` },
    danger: { background: T.redSoft, color: T.red },
    ghost: { background: "transparent", color: T.ink2 },
  };
  return (
    <button className={classNames(base, sizes[size], className)} style={variants[variant]} {...rest}>
      {children}
    </button>
  );
}

function IconButton({ icon: Icon, onClick, title, tone = "ghost" }) {
  const colors = { ghost: T.ink2, danger: T.red };
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center justify-center h-8 w-8 rounded-lg hover:bg-black/5 transition-colors"
      style={{ color: colors[tone] }}
    >
      <Icon size={15} />
    </button>
  );
}

function Select({ value, onChange, options, placeholder, className = "" }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={classNames("rounded-lg text-sm px-3 py-2 bg-white outline-none", className)}
      style={{ border: `1px solid ${T.line}`, color: T.ink }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={typeof o === "object" ? o.value : o} value={typeof o === "object" ? o.value : o}>
          {typeof o === "object" ? o.label : o}
        </option>
      ))}
    </select>
  );
}

function SearchInput({ value, onChange, placeholder = "Buscar..." }) {
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: T.muted }} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="pl-8 pr-3 py-2 rounded-lg text-sm outline-none w-full"
        style={{ border: `1px solid ${T.line}`, color: T.ink }}
      />
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="py-14 text-center">
      <p className="text-sm" style={{ color: T.muted }}>{text}</p>
    </div>
  );
}

/* ---- Modal ---- */
function Modal({ open, onClose, title, children, width = 560 }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto" style={{ background: "rgba(18,35,59,0.45)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full rounded-2xl bg-white my-6" style={{ maxWidth: width, border: `1px solid ${T.line}` }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${T.line}` }}>
          <h3 className="text-base font-semibold" style={{ color: T.ink }}>{title}</h3>
          <button onClick={onClose} className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-black/5">
            <X size={16} style={{ color: T.muted }} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ open, onCancel, onConfirm, text }) {
  if (!open) return null;
  return (
    <Modal open={open} onClose={onCancel} title="Confirmar ação" width={400}>
      <p className="text-sm mb-5" style={{ color: T.ink2 }}>{text}</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button variant="danger" onClick={onConfirm}>Confirmar</Button>
      </div>
    </Modal>
  );
}

/* ============================== GENERIC FORM ============================== */
// field: {key,label,type:'text'|'textarea'|'date'|'number'|'select'|'company'|'user', options?, required?, span?}
function RecordForm({ fields, value, onChange, companies, users }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      {fields.map((f) => {
        const spanClass = f.span === 2 || f.type === "textarea" ? "col-span-2" : "col-span-2 sm:col-span-1";
        return (
          <div key={f.key} className={spanClass}>
            <label className="block text-xs font-medium mb-1" style={{ color: T.ink2 }}>
              {f.label}{f.required && <span style={{ color: T.red }}> *</span>}
            </label>
            {f.type === "textarea" ? (
              <textarea
                value={value[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)}
                rows={3}
                className="w-full rounded-lg text-sm px-3 py-2 outline-none resize-none"
                style={{ border: `1px solid ${T.line}` }}
              />
            ) : f.type === "select" ? (
              <Select value={value[f.key] ?? ""} onChange={(v) => set(f.key, f.numeric ? Number(v) : v)} options={f.options} placeholder="Selecione..." className="w-full" />
            ) : f.type === "company" ? (
              <Select value={value[f.key] ?? ""} onChange={(v) => set(f.key, v)} options={companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Selecione a empresa..." className="w-full" />
            ) : f.type === "user" ? (
              <Select value={value[f.key] ?? ""} onChange={(v) => set(f.key, v)} options={users.map((u) => ({ value: u.id, label: u.nome }))} placeholder="Selecione o responsável..." className="w-full" />
            ) : (
              <input
                type={f.type === "date" ? "date" : f.type === "number" ? "number" : f.type === "password" ? "password" : "text"}
                value={value[f.key] ?? ""}
                onChange={(e) => set(f.key, f.type === "number" ? Number(e.target.value) : e.target.value)}
                className="w-full rounded-lg text-sm px-3 py-2 outline-none"
                style={{ border: `1px solid ${T.line}` }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================== GENERIC TABLE + MODULE PAGE ============================== */
function DataTable({ columns, rows, onEdit, onDelete, onView, emptyText = "Nenhum registro encontrado." }) {
  if (rows.length === 0) return <EmptyState text={emptyText} />;
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.line}` }}>
            {columns.map((c) => (
              <th key={c.key} className="text-left font-medium px-3 py-2.5 whitespace-nowrap" style={{ color: T.muted, fontSize: 12, textTransform: "none" }}>{c.label}</th>
            ))}
            <th className="px-3 py-2.5 w-24"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-black/[0.015]" style={{ borderBottom: `1px solid ${T.line}` }}>
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2.5 align-middle" style={{ color: T.ink }}>
                  {c.render ? c.render(r) : r[c.key]}
                </td>
              ))}
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-0.5 justify-end">
                  {onView && <IconButton icon={Eye} title="Visualizar" onClick={() => onView(r)} />}
                  {onEdit && <IconButton icon={Pencil} title="Editar" onClick={() => onEdit(r)} />}
                  {onDelete && <IconButton icon={Trash2} title="Excluir" tone="danger" onClick={() => onDelete(r)} />}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useCrudModal(initial) {
  const [state, setState] = useState({ open: false, mode: "create", value: initial });
  return {
    ...state,
    openCreate: (defaults) => setState({ open: true, mode: "create", value: { ...initial, ...defaults } }),
    openEdit: (value) => setState({ open: true, mode: "edit", value }),
    close: () => setState((s) => ({ ...s, open: false })),
    setValue: (value) => setState((s) => ({ ...s, value })),
  };
}

/* ============================== APP ============================== */

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "meudashboard", label: "Meu Dashboard", icon: UserCircle2 },
  { id: "empresas", label: "Empresas", icon: Building2 },
  { id: "ocorrencias", label: "Ocorrências", icon: ListChecks },
  { id: "exames", label: "Exames", icon: Stethoscope, children: [
    { id: "exames-periodicos", label: "Exames periódicos" },
    { id: "exames-complementares", label: "Exames complementares" },
  ]},
  { id: "digitacao", label: "Digitação", icon: Keyboard },
  { id: "documentos", label: "Documentos", icon: FileText, children: [
    { id: "doc-PCMSO", label: "PCMSO" },
    { id: "doc-LTCAT", label: "LTCAT" },
    { id: "doc-Checklist", label: "Checklist" },
    { id: "doc-Outros", label: "Outros documentos" },
  ]},
  { id: "pendencias", label: "Pendências", icon: AlertCircle },
  { id: "minhasatividades", label: "Minhas atividades", icon: CheckSquare },
  { id: "visitas", label: "Visitas", icon: CalendarDays },
  { id: "vencimentos", label: "Vencimentos", icon: Clock },
  { id: "relatorios", label: "Relatórios", icon: BarChart3 },
  { id: "usuarios", label: "Usuários", icon: Users },
  { id: "auditoria", label: "Auditoria", icon: History },
  { id: "configuracoes", label: "Configurações", icon: Settings },
];

const PAGE_TITLES = {
  dashboard: "Dashboard gerencial", meudashboard: "Meu Dashboard", empresas: "Empresas",
  ocorrencias: "Ocorrências", "exames-periodicos": "Exames periódicos", "exames-complementares": "Exames complementares",
  digitacao: "Digitação de prontuários", "doc-PCMSO": "PCMSO", "doc-LTCAT": "LTCAT", "doc-Checklist": "Checklist",
  "doc-Outros": "Outros documentos", pendencias: "Pendências", minhasatividades: "Minhas atividades",
  visitas: "Visitas", vencimentos: "Vencimentos", relatorios: "Relatórios", usuarios: "Usuários",
  auditoria: "Auditoria", configuracoes: "Configurações",
};

/* ============================== LOGIN ============================== */
function LoginPage({ onLogin, error, connMode, connError }) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");

  const submit = (e) => {
    e.preventDefault();
    onLogin(email, senha);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4" style={{ background: T.ink, fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap'); * { box-sizing: border-box; }`}</style>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-base" style={{ background: T.teal, color: "#fff" }}>CD</div>
          <div className="text-white">
            <div className="text-base font-semibold leading-none">CLIDAP - Serviços</div>
            <div className="text-xs mt-0.5" style={{ color: "#93A6BE" }}>Central operacional</div>
          </div>
        </div>
        <div className="rounded-2xl p-6" style={{ background: "#fff" }}>
          <div className="flex items-center gap-2 mb-1">
            <Lock size={16} style={{ color: T.teal }} />
            <h1 className="text-base font-semibold" style={{ color: T.ink }}>Entrar</h1>
          </div>
          <p className="text-xs mb-5" style={{ color: T.muted }}>Use o e-mail e a senha cadastrados no módulo de Usuários.</p>
          <form onSubmit={submit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: T.ink2 }}>E-mail</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-lg text-sm px-3 py-2 outline-none" style={{ border: `1px solid ${T.line}` }} placeholder="seuemail@empresa.com.br" />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: T.ink2 }}>Senha</label>
              <input type="password" required value={senha} onChange={(e) => setSenha(e.target.value)} className="w-full rounded-lg text-sm px-3 py-2 outline-none" style={{ border: `1px solid ${T.line}` }} placeholder="••••••••" />
            </div>
            {error && <div className="text-xs rounded-lg px-3 py-2" style={{ background: T.redSoft, color: T.red }}>{error}</div>}
            <Button className="w-full justify-center" size="md"><span>Entrar</span></Button>
          </form>
        </div>
        <div className="mt-4 text-center text-[11px]" style={{ color: "#93A6BE" }}>
          {connMode === "online" && "Conectado à planilha"}
          {connMode === "offline" && `Sem conexão com a planilha (${connError || "verifique a API"}) — usando dados locais`}
          {connMode === "demo" && "Modo demonstração — dados armazenados localmente"}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [data, setData] = useState(seedData);
  const [loaded, setLoaded] = useState(false);
  const [connMode, setConnMode] = useState(API_URL ? "connecting" : "demo"); // 'connecting'|'online'|'offline'|'demo'
  const [connError, setConnError] = useState("");
  const [page, setPage] = useState("dashboard");
  const [companyDetailId, setCompanyDetailId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exameOpen, setExameOpen] = useState(true);
  const [docOpen, setDocOpen] = useState(true);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [viewAsUserId, setViewAsUserId] = useState(null); // usado só para Administrador/Gestor "verem como" outro usuário
  const [sessionChecked, setSessionChecked] = useState(false);
  const [loginError, setLoginError] = useState("");

  // load: from the Google Sheet (if API_URL configured) or from local demo storage
  useEffect(() => {
    (async () => {
      if (API_URL) {
        try {
          const remote = await apiList();
          setData((d) => ({ ...d, ...remote })); // config permanece local
          setConnMode("online");
        } catch (e) {
          setConnError(e.message || "Não foi possível conectar à planilha");
          setConnMode("offline");
        }
        setLoaded(true);
        return;
      }
      try {
        const res = await window.storage?.get("gestao-app-data");
        if (res && res.value) setData(JSON.parse(res.value));
      } catch (e) { /* first run, no saved data */ }
      setLoaded(true);
    })();
  }, []);

  // sessão de login: tenta recuperar o usuário logado neste navegador (persiste por dispositivo)
  useEffect(() => {
    if (!loaded) return;
    (async () => {
      try {
        const res = await window.storage?.get("gestao-app-session");
        if (res && res.value) {
          const savedId = JSON.parse(res.value).userId;
          const stillValid = data.users.find((u) => u.id === savedId && u.status === "Ativo");
          if (stillValid) setCurrentUserId(savedId);
        }
      } catch (e) { /* sem sessão salva */ }
      setSessionChecked(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  const handleLogin = async (email, senha) => {
    if (API_URL) {
      try {
        const res = await apiLogin(email, senha);
        if (!res.ok) {
          setLoginError(res.error || "E-mail ou senha inválidos.");
          return;
        }
        setLoginError("");
        setCurrentUserId(res.user.id);
        window.storage?.set("gestao-app-session", JSON.stringify({ userId: res.user.id })).catch(() => {});
      } catch (e) {
        setLoginError("Não foi possível conectar à planilha para autenticar. Tente novamente.");
      }
      return;
    }
    // modo demonstração (sem planilha conectada): checagem local simples
    const user = data.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase() && u.status === "Ativo");
    if (!user || String(user.senha) !== senha) {
      setLoginError("E-mail ou senha inválidos.");
      return;
    }
    setLoginError("");
    setCurrentUserId(user.id);
    window.storage?.set("gestao-app-session", JSON.stringify({ userId: user.id })).catch(() => {});
  };

  const handleLogout = () => {
    setCurrentUserId(null);
    setViewAsUserId(null);
    window.storage?.delete("gestao-app-session").catch(() => {});
  };

  // persistence in demo mode only (when connected to Sheets, each mutation already saves remotely)
  useEffect(() => {
    if (!loaded || API_URL) return;
    window.storage?.set("gestao-app-data", JSON.stringify(data)).catch(() => {});
  }, [data, loaded]);

  const companyMap = useMemo(() => Object.fromEntries(data.companies.map((c) => [c.id, c])), [data.companies]);
  const userMap = useMemo(() => Object.fromEntries(data.users.map((u) => [u.id, u])), [data.users]);
  const companyName = (id) => companyMap[id]?.nomeFantasia || "—";
  const userName = (id) => userMap[id]?.nome || "—";

  const canImpersonate = userMap[currentUserId]?.perfil === "Administrador" || userMap[currentUserId]?.perfil === "Gestor";
  const effectiveViewUserId = (canImpersonate && viewAsUserId) ? viewAsUserId : currentUserId;

  const audit = (acao, modulo, registro, valorAnterior, novoValor) => {
    const rec = { id: uid("a"), usuario: userName(currentUserId), data: todayISO(), horario: new Date().toTimeString().slice(0,5), acao, modulo, registro, valorAnterior: valorAnterior ?? "—", novoValor: novoValor ?? "—" };
    setData((d) => ({ ...d, audit: [rec, ...d.audit] }));
    if (API_URL) apiMutate("audit", "create", rec).catch(() => {});
  };

  // generic collection CRUD helper — grava na planilha quando conectado (API_URL preenchido),
  // ou mantém tudo em memória/local quando estiver em modo demonstração.
  const makeCrud = (key, moduleLabel, labelOf) => ({
    add: (record) => {
      if (API_URL) {
        apiMutate(key, "create", record)
          .then((res) => setData((d) => ({ ...d, [key]: res.entity })))
          .catch((e) => setConnError(e.message));
        audit("Cadastro", moduleLabel, labelOf(record, companyName, userName), "—", record.status || "criado");
        return;
      }
      const rec = { ...record, id: uid(key) };
      setData((d) => ({ ...d, [key]: [rec, ...d[key]] }));
      audit("Cadastro", moduleLabel, labelOf(rec, companyName, userName), "—", rec.status || "criado");
    },
    update: (record) => {
      const prev = data[key].find((r) => r.id === record.id);
      if (API_URL) {
        apiMutate(key, "update", record)
          .then((res) => setData((d) => ({ ...d, [key]: res.entity })))
          .catch((e) => setConnError(e.message));
        audit("Alteração", moduleLabel, labelOf(record, companyName, userName), prev?.status, record.status);
        return;
      }
      setData((d) => ({ ...d, [key]: d[key].map((r) => (r.id === record.id ? record : r)) }));
      audit("Alteração", moduleLabel, labelOf(record, companyName, userName), prev?.status, record.status);
    },
    remove: (record) => {
      if (API_URL) {
        apiMutate(key, "delete", record)
          .then((res) => setData((d) => ({ ...d, [key]: res.entity })))
          .catch((e) => setConnError(e.message));
        audit("Exclusão", moduleLabel, labelOf(record, companyName, userName), record.status, "excluído");
        return;
      }
      setData((d) => ({ ...d, [key]: d[key].filter((r) => r.id !== record.id) }));
      audit("Exclusão", moduleLabel, labelOf(record, companyName, userName), record.status, "excluído");
    },
  });

  const crud = {
    companies: makeCrud("companies", "Empresas", (r) => r.nomeFantasia),
    occurrences: makeCrud("occurrences", "Ocorrências", (r, cn) => `${r.tipo} — ${cn(r.companyId)}`),
    periodicExams: makeCrud("periodicExams", "Exames periódicos", (r, cn) => `Exame periódico — ${cn(r.companyId)}`),
    complementaryExams: makeCrud("complementaryExams", "Exames complementares", (r, cn) => `${r.exame} — ${cn(r.companyId)}`),
    typings: makeCrud("typings", "Digitação", (r, cn) => `Digitação — ${cn(r.companyId)}`),
    documents: makeCrud("documents", "Documentos", (r, cn) => `${r.tipo} — ${cn(r.companyId)}`),
    pendencies: makeCrud("pendencies", "Pendências", (r, cn) => `${r.descricao?.slice(0,30)} — ${cn(r.companyId)}`),
    visits: makeCrud("visits", "Visitas", (r, cn) => `Visita — ${cn(r.companyId)}`),
    users: makeCrud("users", "Usuários", (r) => r.nome),
  };

  const goCompany = (id) => { setCompanyDetailId(id); setPage("empresa-detalhe"); };

  const navigate = (id) => {
    setCompanyDetailId(null);
    setPage(id);
    setSidebarOpen(false);
  };

  /* ---------- unified activities across modules ---------- */
  const allActivities = useMemo(() => {
    const list = [];
    data.occurrences.forEach((r) => list.push({ id: r.id, origin: "ocorrencias", title: `${r.tipo}`, companyId: r.companyId, responsavel: r.usuarioResponsavel, prazo: r.prazo, status: r.status, prioridade: r.prioridade }));
    data.periodicExams.forEach((r) => list.push({ id: r.id, origin: "exames-periodicos", title: "Exame periódico", companyId: r.companyId, responsavel: null, prazo: r.dataProgramada, status: r.status, prioridade: r.prioridade }));
    data.complementaryExams.forEach((r) => list.push({ id: r.id, origin: "exames-complementares", title: r.exame, companyId: r.companyId, responsavel: r.realizadoPor, prazo: r.dataRealizada || null, status: r.status, prioridade: "Média" }));
    data.typings.forEach((r) => list.push({ id: r.id, origin: "digitacao", title: "Digitação de prontuário", companyId: r.companyId, responsavel: r.usuarioResponsavel, prazo: r.previsaoEntrega, status: r.status, prioridade: r.prioridade }));
    data.documents.forEach((r) => list.push({ id: r.id, origin: `doc-${r.tipo}`, title: r.tipo, companyId: r.companyId, responsavel: r.usuarioResponsavel, prazo: r.dataPrevista, status: r.status, prioridade: "Média" }));
    data.pendencies.forEach((r) => list.push({ id: r.id, origin: "pendencias", title: r.descricao, companyId: r.companyId, responsavel: r.responsavel, prazo: r.prazo, status: r.status, prioridade: r.prioridade }));
    data.visits.forEach((r) => list.push({ id: r.id, origin: "visitas", title: `Visita (${r.tipo})`, companyId: r.companyId, responsavel: r.responsavel, prazo: r.data, status: r.status, prioridade: "Média" }));
    return list;
  }, [data]);

  const pageContent = () => {
    if (page === "empresa-detalhe" && companyDetailId) {
      return <CompanyDetailPage id={companyDetailId} data={data} companyName={companyName} userName={userName} onBack={() => navigate("empresas")} crud={crud} navigate={navigate} />;
    }
    switch (page) {
      case "dashboard": return <DashboardPage data={data} companyName={companyName} userName={userName} navigate={navigate} allActivities={allActivities} />;
      case "meudashboard": return <MeuDashboardPage data={data} companyName={companyName} currentUserId={effectiveViewUserId} setCurrentUserId={setViewAsUserId} canImpersonate={canImpersonate} allActivities={allActivities} navigate={navigate} />;
      case "empresas": return <EmpresasPage data={data} crud={crud.companies} goCompany={goCompany} />;
      case "ocorrencias": return <OcorrenciasPage data={data} crud={crud.occurrences} companyName={companyName} userName={userName} />;
      case "exames-periodicos": return <ExamesPeriodicosPage data={data} crud={crud.periodicExams} companyName={companyName} />;
      case "exames-complementares": return <ExamesComplementaresPage data={data} crud={crud.complementaryExams} companyName={companyName} userName={userName} />;
      case "digitacao": return <DigitacaoPage data={data} crud={crud.typings} companyName={companyName} userName={userName} setData={setData} />;
      case "doc-PCMSO": case "doc-LTCAT": case "doc-Checklist": case "doc-Outros":
        return <DocumentosPage tipo={page.replace("doc-", "")} data={data} crud={crud.documents} companyName={companyName} userName={userName} />;
      case "pendencias": return <PendenciasPage data={data} crud={crud.pendencies} companyName={companyName} userName={userName} />;
      case "minhasatividades": return <MinhasAtividadesPage data={data} currentUserId={effectiveViewUserId} setCurrentUserId={setViewAsUserId} canImpersonate={canImpersonate} companyName={companyName} allActivities={allActivities} />;
      case "visitas": return <VisitasPage data={data} crud={crud.visits} companyName={companyName} userName={userName} />;
      case "vencimentos": return <VencimentosPage data={data} companyName={companyName} userName={userName} />;
      case "relatorios": return <RelatoriosPage data={data} companyName={companyName} userName={userName} />;
      case "usuarios": return <UsuariosPage data={data} crud={crud.users} />;
      case "auditoria": return <AuditoriaPage data={data} />;
      case "configuracoes": return <ConfiguracoesPage data={data} setData={setData} />;
      default: return null;
    }
  };

  const notifications = useMemo(() => {
    const items = [];
    allActivities.forEach((a) => {
      if (isLate(a.prazo, a.status)) items.push({ text: `${a.title} atrasado — ${companyName(a.companyId)}`, tone: "danger" });
    });
    data.documents.forEach((d) => {
      const b = vencimentoBucket(d.dataVencimento);
      if (b === "vencido" || b === "critico") items.push({ text: `${d.tipo} vencendo — ${companyName(d.companyId)}`, tone: "warning" });
    });
    return items.slice(0, 8);
  }, [allActivities, data.documents]);

  if (!loaded || !sessionChecked) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center" style={{ background: T.bg, fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');`}</style>
        <div className="text-sm" style={{ color: T.muted }}>Carregando...</div>
      </div>
    );
  }

  if (!currentUserId) {
    return <LoginPage onLogin={handleLogin} error={loginError} connMode={connMode} connError={connError} />;
  }

  return (
    <div className="min-h-screen w-full flex" style={{ background: T.bg, fontFamily: "'IBM Plex Sans', ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #D7DEE6; border-radius: 8px; }
      `}</style>

      {/* Sidebar */}
      <aside
        className={classNames(
          "fixed sm:static z-40 top-0 left-0 h-full sm:h-auto w-64 flex-shrink-0 flex flex-col transition-transform duration-200 sm:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ background: T.ink, color: "#fff" }}
      >
        <div className="flex items-center gap-2 px-5 h-16 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="h-8 w-8 rounded-lg flex items-center justify-center font-bold text-sm" style={{ background: T.teal }}>CD</div>
          <div>
            <div className="text-sm font-semibold leading-none">CLIDAP - Serviços</div>
            <div className="text-[11px] mt-0.5" style={{ color: "#93A6BE" }}>Central operacional</div>
          </div>
          <button className="ml-auto sm:hidden" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2.5">
          {NAV.map((item) => {
            const Icon = item.icon;
            const activeParent = page === item.id || (item.children && item.children.some((c) => c.id === page)) || (page === "empresa-detalhe" && item.id === "empresas");
            if (item.children) {
              const isOpen = item.id === "exames" ? exameOpen : docOpen;
              const setOpen = item.id === "exames" ? setExameOpen : setDocOpen;
              return (
                <div key={item.id} className="mb-0.5">
                  <button
                    onClick={() => setOpen(!isOpen)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium"
                    style={{ color: activeParent ? "#fff" : "#B7C4D6", background: "transparent" }}
                  >
                    <Icon size={16} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {isOpen && (
                    <div className="ml-6 mb-1">
                      {item.children.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => navigate(c.id)}
                          className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5"
                          style={{ color: page === c.id ? "#fff" : "#93A6BE", background: page === c.id ? "rgba(255,255,255,0.08)" : "transparent" }}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium mb-0.5"
                style={{ color: activeParent ? "#fff" : "#B7C4D6", background: activeParent ? "rgba(255,255,255,0.1)" : "transparent" }}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="px-4 py-3 text-[11px] flex items-center gap-1.5" style={{ color: "#6C7F98", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: connMode === "online" ? T.green : connMode === "offline" ? T.red : "#93A6BE" }} />
          {connMode === "online" && "Conectado à planilha"}
          {connMode === "offline" && `Falha na conexão: ${connError || "verifique a URL"}`}
          {connMode === "connecting" && "Conectando à planilha..."}
          {connMode === "demo" && "Modo demonstração (dados locais)"}
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/40 sm:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 flex items-center gap-3 px-4 sm:px-6 flex-shrink-0 bg-white sticky top-0 z-20" style={{ borderBottom: `1px solid ${T.line}` }}>
          <button className="sm:hidden" onClick={() => setSidebarOpen(true)}><Menu size={20} style={{ color: T.ink }} /></button>
          <h1 className="text-base font-semibold hidden sm:block" style={{ color: T.ink }}>
            {page === "empresa-detalhe" ? companyName(companyDetailId) : PAGE_TITLES[page]}
          </h1>
          <div className="flex-1" />
          <div className="hidden md:block w-64">
            <SearchInput value="" onChange={() => {}} placeholder="Buscar empresa, ocorrência..." />
          </div>
          <div className="relative group">
            <button className="h-9 w-9 rounded-lg inline-flex items-center justify-center hover:bg-black/5 relative">
              <Bell size={17} style={{ color: T.ink2 }} />
              {notifications.length > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full" style={{ background: T.red }} />}
            </button>
            <div className="absolute right-0 mt-1 w-72 rounded-xl bg-white shadow-lg p-2 hidden group-hover:block z-30" style={{ border: `1px solid ${T.line}` }}>
              <div className="text-xs font-semibold px-2 py-1.5" style={{ color: T.ink }}>Notificações</div>
              {notifications.length === 0 && <div className="text-xs px-2 py-2" style={{ color: T.muted }}>Nenhum alerta no momento.</div>}
              {notifications.map((n, i) => (
                <div key={i} className="text-xs px-2 py-1.5 rounded-lg flex items-start gap-1.5" style={{ color: T.ink2 }}>
                  <TriangleAlert size={12} className="mt-0.5 flex-shrink-0" style={{ color: n.tone === "danger" ? T.red : T.amber }} />
                  {n.text}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 pl-2" style={{ borderLeft: `1px solid ${T.line}` }}>
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0" style={{ background: T.tealSoft, color: T.tealDark }}>
              {userName(currentUserId).split(" ").map((s) => s[0]).slice(0,2).join("")}
            </div>
            <div className="hidden sm:block leading-tight">
              <div className="text-sm font-medium" style={{ color: T.ink }}>{userName(currentUserId)}</div>
              <div className="text-[11px]" style={{ color: T.muted }}>{userMap[currentUserId]?.perfil}</div>
            </div>
            <button onClick={handleLogout} title="Sair" className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-black/5 flex-shrink-0">
              <LogOut size={15} style={{ color: T.muted }} />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
          {pageContent()}
        </main>
      </div>
    </div>
  );
}

/* ============================== DASHBOARD ============================== */
function DashboardPage({ data, companyName, userName, navigate, allActivities }) {
  const [filterCompany, setFilterCompany] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");

  const occ = data.occurrences.filter((o) =>
    (!filterCompany || o.companyId === filterCompany) &&
    (!filterUser || o.usuarioResponsavel === filterUser) &&
    (!filterStatus || o.status === filterStatus) &&
    (!filterPriority || o.prioridade === filterPriority)
  );

  const kpis = useMemo(() => {
    const totalEmpresas = data.companies.length;
    const ativas = data.companies.filter((c) => c.situacao === "Ativa").length;
    const emAndamento = occ.filter((o) => !CONCLUDED.has(o.status) && !CANCELLED.has(o.status)).length;
    const atrasadas = occ.filter((o) => isLate(o.prazo, o.status)).length;
    const pendAbertas = data.pendencies.filter((p) => p.status !== "Resolvida" && p.status !== "Cancelada").length;
    const ativAtraso = allActivities.filter((a) => isLate(a.prazo, a.status)).length;
    const visitasProx = data.visits.filter((v) => diffDaysFromToday(v.data) >= 0 && diffDaysFromToday(v.data) <= 7 && v.status !== "Cancelada").length;
    const docsVencendo = data.documents.filter((d) => ["vencido","critico"].includes(vencimentoBucket(d.dataVencimento))).length;
    return { totalEmpresas, ativas, emAndamento, atrasadas, pendAbertas, ativAtraso, visitasProx, docsVencendo };
  }, [data, occ, allActivities]);

  const statusChartData = useMemo(() => {
    const buckets = { "Não iniciada": 0, "Em andamento": 0, "Concluída": 0, "Com pendência": 0, "Com problema": 0, "Atrasada": 0 };
    occ.forEach((o) => {
      if (isLate(o.prazo, o.status)) buckets["Atrasada"]++;
      else if (buckets[o.status] !== undefined) buckets[o.status]++;
    });
    return Object.entries(buckets).map(([name, value]) => ({ name, value }));
  }, [occ]);

  const tipoChartData = useMemo(() => {
    return TIPOS_OCORRENCIA.map((t) => ({ name: t, value: occ.filter((o) => o.tipo === t).length })).filter((d) => d.value > 0);
  }, [occ]);

  const PIE_COLORS = [T.teal, T.amber, T.red, T.green, "#5B6B7C", "#8E7CC3", "#4C8DBF", "#C2540E"];

  const periodicTotals = data.periodicExams.reduce((a, e) => ({ prevista: a.prevista + e.qtdPrevista, realizada: a.realizada + e.qtdRealizada }), { prevista: 0, realizada: 0 });
  const complTotals = data.complementaryExams.reduce((a, e) => ({ prevista: a.prevista + e.qtdPrevista, realizada: a.realizada + e.qtdRealizada }), { prevista: 0, realizada: 0 });

  const docBuckets = useMemo(() => {
    const buckets = { emAndamento: 0, entregues: 0, comProblema: 0, proxVencimento: 0, vencidos: 0 };
    data.documents.forEach((d) => {
      if (d.status === "Entregue") buckets.entregues++;
      else if (d.status === "Com problema") buckets.comProblema++;
      else buckets.emAndamento++;
      const b = vencimentoBucket(d.dataVencimento);
      if (b === "vencido") buckets.vencidos++;
      if (b === "critico" || b === "atencao") buckets.proxVencimento++;
    });
    return buckets;
  }, [data.documents]);

  const pendBuckets = useMemo(() => {
    const s = { Aberta: 0, "Aguardando empresa": 0, "Aguardando usuário": 0, "Em andamento": 0, Resolvida: 0, atrasadas: 0 };
    data.pendencies.forEach((p) => {
      if (s[p.status] !== undefined) s[p.status]++;
      if (isLate(p.prazo, p.status)) s.atrasadas++;
    });
    const byCompany = {};
    data.pendencies.filter((p) => p.status !== "Resolvida" && p.status !== "Cancelada").forEach((p) => { byCompany[p.companyId] = (byCompany[p.companyId] || 0) + 1; });
    const top = Object.entries(byCompany).sort((a,b) => b[1]-a[1]).slice(0,4);
    return { s, top };
  }, [data.pendencies]);

  const userPerf = useMemo(() => {
    return data.users.filter((u) => u.perfil !== "Consulta").map((u) => {
      const acts = allActivities.filter((a) => a.responsavel === u.id);
      const emAndamento = acts.filter((a) => !CONCLUDED.has(a.status) && !CANCELLED.has(a.status) && !isLate(a.prazo, a.status)).length;
      const concluidas = acts.filter((a) => CONCLUDED.has(a.status)).length;
      const atrasadas = acts.filter((a) => isLate(a.prazo, a.status)).length;
      const pend = data.pendencies.filter((p) => p.responsavel === u.id && p.status !== "Resolvida" && p.status !== "Cancelada").length;
      const docs = data.documents.filter((d) => d.usuarioResponsavel === u.id && d.status !== "Entregue").length;
      return { u, emAndamento, concluidas, atrasadas, pend, docs, total: acts.length };
    }).sort((a,b) => b.atrasadas - a.atrasadas || b.total - a.total);
  }, [data, allActivities]);

  const visitWindows = useMemo(() => {
    const today = data.visits.filter((v) => diffDaysFromToday(v.data) === 0);
    const tomorrow = data.visits.filter((v) => diffDaysFromToday(v.data) === 1);
    const week = data.visits.filter((v) => diffDaysFromToday(v.data) >= 2 && diffDaysFromToday(v.data) <= 7);
    const month = data.visits.filter((v) => diffDaysFromToday(v.data) > 7 && diffDaysFromToday(v.data) <= 30);
    return { today, tomorrow, week, month };
  }, [data.visits]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter size={14} style={{ color: T.muted }} />
          <span className="text-xs font-medium" style={{ color: T.muted }}>Filtros</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={filterCompany} onChange={setFilterCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <Select value={filterUser} onChange={setFilterUser} options={data.users.map((u) => ({ value: u.id, label: u.nome }))} placeholder="Todos os responsáveis" />
          <Select value={filterStatus} onChange={setFilterStatus} options={STATUS_OCORRENCIA} placeholder="Todos os status" />
          <Select value={filterPriority} onChange={setFilterPriority} options={PRIORIDADES} placeholder="Todas as prioridades" />
          {(filterCompany || filterUser || filterStatus || filterPriority) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterCompany(""); setFilterUser(""); setFilterStatus(""); setFilterPriority(""); }}>Limpar filtros</Button>
          )}
        </div>
      </Card>

      {/* KPIs */}
      <div className="flex flex-wrap gap-3">
        <KpiCard label="Empresas" value={kpis.totalEmpresas} sub={`${kpis.ativas} ativas`} icon={Building2} />
        <KpiCard label="Ocorrências em andamento" value={kpis.emAndamento} icon={ListChecks} tone="info" />
        <KpiCard label="Ocorrências atrasadas" value={kpis.atrasadas} icon={TriangleAlert} tone="danger" />
        <KpiCard label="Pendências abertas" value={kpis.pendAbertas} icon={AlertCircle} tone="warning" />
        <KpiCard label="Atividades em atraso" value={kpis.ativAtraso} icon={Clock} tone="danger" />
        <KpiCard label="Visitas (7 dias)" value={kpis.visitasProx} icon={CalendarDays} tone="info" />
        <KpiCard label="Docs a vencer" value={kpis.docsVencendo} icon={FileText} tone="warning" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionHeader title="Ocorrências por status" />
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={statusChartData} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: T.muted }} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 11, fill: T.muted }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="value" fill={T.teal} radius={[6,6,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4">
          <SectionHeader title="Ocorrências por tipo" />
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={tipoChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => e.name}>
                {tipoChartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Exams progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ExamProgressCard title="Exames periódicos" totals={periodicTotals} />
        <ExamProgressCard title="Exames complementares" totals={complTotals} />
      </div>

      {/* Documents overview */}
      <Card className="p-4">
        <SectionHeader title="Documentos — visão geral" actions={<Button variant="ghost" size="sm" onClick={() => navigate("vencimentos")}>Ver vencimentos <ChevronRightIcon size={14}/></Button>} />
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <MiniStat label="Em andamento" value={docBuckets.emAndamento} tone="info" />
          <MiniStat label="Entregues" value={docBuckets.entregues} tone="success" />
          <MiniStat label="Com problema" value={docBuckets.comProblema} tone="danger" />
          <MiniStat label="A vencer" value={docBuckets.proxVencimento} tone="warning" />
          <MiniStat label="Vencidos" value={docBuckets.vencidos} tone="danger" />
        </div>
      </Card>

      {/* Pendencies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionHeader title="Pendências" />
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Abertas" value={pendBuckets.s.Aberta} tone="warning" />
            <MiniStat label="Aguard. empresa" value={pendBuckets.s["Aguardando empresa"]} tone="neutral" />
            <MiniStat label="Aguard. usuário" value={pendBuckets.s["Aguardando usuário"]} tone="neutral" />
            <MiniStat label="Em andamento" value={pendBuckets.s["Em andamento"]} tone="info" />
            <MiniStat label="Resolvidas" value={pendBuckets.s.Resolvida} tone="success" />
            <MiniStat label="Atrasadas" value={pendBuckets.atrasadas} tone="danger" />
          </div>
        </Card>
        <Card className="p-4">
          <SectionHeader title="Empresas com mais pendências" />
          {pendBuckets.top.length === 0 ? <EmptyState text="Sem pendências em aberto." /> : (
            <div className="space-y-2.5">
              {pendBuckets.top.map(([cid, n]) => (
                <div key={cid} className="flex items-center gap-3">
                  <span className="text-sm flex-1" style={{ color: T.ink }}>{companyName(cid)}</span>
                  <div className="h-1.5 rounded-full flex-1 max-w-[140px]" style={{ background: T.slateSoft }}>
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, n*20)}%`, background: T.amber }} />
                  </div>
                  <span className="text-xs font-semibold w-5 text-right" style={{ color: T.ink2, fontFamily: "'IBM Plex Mono', monospace" }}>{n}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* User performance */}
      <Card className="p-4">
        <SectionHeader title="Desempenho dos usuários" subtitle="Ordenado por atividades em atraso" />
        <DataTable
          columns={[
            { key: "nome", label: "Usuário", render: (r) => <span className="font-medium">{r.u.nome}</span> },
            { key: "emAndamento", label: "Em andamento" },
            { key: "concluidas", label: "Concluídas" },
            { key: "atrasadas", label: "Atrasadas", render: (r) => r.atrasadas > 0 ? <Badge tone="danger">{r.atrasadas}</Badge> : r.atrasadas },
            { key: "pend", label: "Pendências atribuídas" },
            { key: "docs", label: "Documentos atribuídos" },
          ]}
          rows={userPerf}
        />
      </Card>

      {/* Upcoming visits */}
      <Card className="p-4">
        <SectionHeader title="Próximas visitas" actions={<Button variant="ghost" size="sm" onClick={() => navigate("visitas")}>Ver agenda <ChevronRightIcon size={14}/></Button>} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MiniStat label="Hoje" value={visitWindows.today.length} tone="info" />
          <MiniStat label="Amanhã" value={visitWindows.tomorrow.length} tone="info" />
          <MiniStat label="Próximos 7 dias" value={visitWindows.week.length} tone="neutral" />
          <MiniStat label="Próximos 30 dias" value={visitWindows.month.length} tone="neutral" />
        </div>
        <DataTable
          columns={[
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "data", label: "Data", render: (r) => fmtDate(r.data) },
            { key: "horario", label: "Horário" },
            { key: "responsavel", label: "Responsável", render: (r) => userName(r.responsavel) },
            { key: "objetivo", label: "Objetivo" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rows={[...visitWindows.today, ...visitWindows.tomorrow, ...visitWindows.week].slice(0,6)}
          emptyText="Nenhuma visita agendada para o período."
        />
      </Card>
    </div>
  );
}

function MiniStat({ label, value, tone }) {
  const tones = { neutral: T.ink2, info: T.teal, warning: T.amber, danger: T.red, success: T.green };
  return (
    <div className="rounded-xl p-3" style={{ background: T.slateSoft }}>
      <div className="text-[11px]" style={{ color: T.muted }}>{label}</div>
      <div className="text-lg font-semibold mt-0.5" style={{ color: tones[tone] || T.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{value}</div>
    </div>
  );
}

function ExamProgressCard({ title, totals }) {
  const pendente = Math.max(0, totals.prevista - totals.realizada);
  const pct = totals.prevista > 0 ? Math.round((totals.realizada / totals.prevista) * 100) : 0;
  return (
    <Card className="p-4">
      <SectionHeader title={title} />
      <div className="grid grid-cols-3 gap-3 mb-4">
        <MiniStat label="Prevista" value={totals.prevista} />
        <MiniStat label="Realizada" value={totals.realizada} tone="success" />
        <MiniStat label="Pendente" value={pendente} tone="warning" />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-2.5 rounded-full flex-1" style={{ background: T.slateSoft }}>
          <div className="h-2.5 rounded-full" style={{ width: `${pct}%`, background: T.teal }} />
        </div>
        <span className="text-sm font-semibold" style={{ color: T.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{pct}%</span>
      </div>
      <div className="text-xs mt-1.5" style={{ color: T.muted }}>Percentual realizado</div>
    </Card>
  );
}

/* ============================== MEU DASHBOARD ============================== */
function MeuDashboardPage({ data, companyName, currentUserId, setCurrentUserId, canImpersonate, allActivities, navigate }) {
  const mine = allActivities.filter((a) => a.responsavel === currentUserId);
  const today = mine.filter((a) => diffDaysFromToday(a.prazo) === 0 && !CONCLUDED.has(a.status));
  const late = mine.filter((a) => isLate(a.prazo, a.status));
  const done = mine.filter((a) => CONCLUDED.has(a.status));
  const myPend = data.pendencies.filter((p) => p.responsavel === currentUserId && p.status !== "Resolvida" && p.status !== "Cancelada");
  const myDocs = data.documents.filter((d) => d.usuarioResponsavel === currentUserId && d.status !== "Entregue");
  const myPcmso = data.documents.filter((d) => d.tipo === "PCMSO" && d.usuarioResponsavel === currentUserId);
  const myVisits = data.visits.filter((v) => v.responsavel === currentUserId && v.status !== "Cancelada" && v.status !== "Realizada");
  const upcoming = mine.filter((a) => !CONCLUDED.has(a.status) && diffDaysFromToday(a.prazo) > 0 && diffDaysFromToday(a.prazo) <= 30);

  return (
    <div className="space-y-6">
      {canImpersonate && (
        <Card className="p-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm" style={{ color: T.ink2 }}>Visualizando como:</span>
          <Select value={currentUserId} onChange={setCurrentUserId} options={data.users.map((u) => ({ value: u.id, label: u.nome }))} />
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5" style={{ borderLeft: `4px solid ${T.teal}` }}>
          <div className="text-sm font-semibold mb-1" style={{ color: T.ink }}>O que preciso fazer hoje?</div>
          <div className="text-3xl font-semibold" style={{ color: T.teal, fontFamily: "'IBM Plex Mono', monospace" }}>{today.length}</div>
          <div className="text-xs mt-1" style={{ color: T.muted }}>atividades previstas para hoje</div>
        </Card>
        <Card className="p-5" style={{ borderLeft: `4px solid ${T.red}` }}>
          <div className="text-sm font-semibold mb-1" style={{ color: T.ink }}>O que está atrasado?</div>
          <div className="text-3xl font-semibold" style={{ color: T.red, fontFamily: "'IBM Plex Mono', monospace" }}>{late.length}</div>
          <div className="text-xs mt-1" style={{ color: T.muted }}>itens fora do prazo</div>
        </Card>
        <Card className="p-5" style={{ borderLeft: `4px solid ${T.amber}` }}>
          <div className="text-sm font-semibold mb-1" style={{ color: T.ink }}>O que vence nos próximos dias?</div>
          <div className="text-3xl font-semibold" style={{ color: T.amber, fontFamily: "'IBM Plex Mono', monospace" }}>{upcoming.length}</div>
          <div className="text-xs mt-1" style={{ color: T.muted }}>nos próximos 30 dias</div>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <KpiCard label="Minhas atividades" value={mine.length} icon={CheckSquare} />
        <KpiCard label="Minhas pendências" value={myPend.length} icon={AlertCircle} tone="warning" />
        <KpiCard label="Meus documentos" value={myDocs.length} icon={FileText} tone="info" />
        <KpiCard label="Meus PCMSOs" value={myPcmso.length} icon={Stethoscope} tone="info" />
        <KpiCard label="Minhas visitas" value={myVisits.length} icon={CalendarDays} tone="info" />
        <KpiCard label="Concluídas" value={done.length} icon={CircleCheck} tone="success" />
      </div>

      <Card className="p-4">
        <SectionHeader title="Minha lista de trabalho" actions={<Button variant="ghost" size="sm" onClick={() => navigate("minhasatividades")}>Ver tudo <ChevronRightIcon size={14}/></Button>} />
        <DataTable
          columns={[
            { key: "title", label: "Atividade" },
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) },
            { key: "prioridade", label: "Prioridade", render: (r) => <PriorityBadge p={r.prioridade} /> },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.prazo} /> },
          ]}
          rows={mine.filter((a) => !CONCLUDED.has(a.status)).sort((a,b) => (a.prazo||"9999").localeCompare(b.prazo||"9999")).slice(0,10)}
          emptyText="Nenhuma atividade pendente. Bom trabalho!"
        />
      </Card>
    </div>
  );
}

/* ============================== EMPRESAS ============================== */
const companyFields = [
  { key: "razaoSocial", label: "Razão social", required: true, span: 2 },
  { key: "nomeFantasia", label: "Nome fantasia", required: true },
  { key: "cnpj", label: "CNPJ", required: true },
  { key: "telefone", label: "Telefone" },
  { key: "email", label: "E-mail" },
  { key: "endereco", label: "Endereço", span: 2 },
  { key: "cidade", label: "Cidade" },
  { key: "responsavel", label: "Responsável" },
  { key: "situacao", label: "Situação", type: "select", options: ["Ativa","Inativa"] },
  { key: "observacoes", label: "Observações", type: "textarea", span: 2 },
];

function EmpresasPage({ data, crud, goCompany }) {
  const [search, setSearch] = useState("");
  const [situacao, setSituacao] = useState("");
  const modal = useCrudModal({ situacao: "Ativa" });
  const [toDelete, setToDelete] = useState(null);

  const rows = data.companies.filter((c) =>
    (!search || `${c.razaoSocial} ${c.nomeFantasia} ${c.cnpj}`.toLowerCase().includes(search.toLowerCase())) &&
    (!situacao || c.situacao === situacao)
  );

  const save = () => {
    if (modal.mode === "create") crud.add(modal.value); else crud.update(modal.value);
    modal.close();
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Empresas" subtitle={`${data.companies.length} cadastradas`} actions={<Button onClick={() => modal.openCreate({ situacao: "Ativa" })}><Plus size={15}/> Nova empresa</Button>} />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex-1 min-w-[200px]"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por razão social, fantasia ou CNPJ..." /></div>
          <Select value={situacao} onChange={setSituacao} options={["Ativa","Inativa"]} placeholder="Todas as situações" />
        </div>
        <DataTable
          columns={[
            { key: "nomeFantasia", label: "Empresa", render: (r) => (
              <button className="font-medium hover:underline text-left" style={{ color: T.tealDark }} onClick={() => goCompany(r.id)}>{r.nomeFantasia}</button>
            ) },
            { key: "cnpj", label: "CNPJ" },
            { key: "cidade", label: "Cidade" },
            { key: "responsavel", label: "Responsável" },
            { key: "situacao", label: "Situação", render: (r) => <Badge tone={r.situacao === "Ativa" ? "success" : "neutral"}>{r.situacao}</Badge> },
          ]}
          rows={rows}
          onView={(r) => goCompany(r.id)}
          onEdit={(r) => modal.openEdit(r)}
          onDelete={(r) => setToDelete(r)}
        />
      </Card>

      <Modal open={modal.open} onClose={modal.close} title={modal.mode === "create" ? "Nova empresa" : "Editar empresa"} width={640}>
        <RecordForm fields={companyFields} value={modal.value} onChange={modal.setValue} companies={data.companies} users={data.users} />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={modal.close}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { crud.remove(toDelete); setToDelete(null); }} text={`Deseja inativar/excluir "${toDelete?.nomeFantasia}"? O histórico relacionado será preservado nos módulos.`} />
    </div>
  );
}

/* ============================== COMPANY DETAIL ============================== */
function CompanyDetailPage({ id, data, companyName, userName, onBack, crud, navigate }) {
  const company = data.companies.find((c) => c.id === id);
  if (!company) return <EmptyState text="Empresa não encontrada." />;

  const filt = (arr) => arr.filter((r) => r.companyId === id);
  const occ = filt(data.occurrences);
  const docs = filt(data.documents);
  const pend = filt(data.pendencies);
  const visits = filt(data.visits);
  const periodic = filt(data.periodicExams);
  const compl = filt(data.complementaryExams);
  const typings = filt(data.typings);

  const latest = (arr) => arr.length ? arr[0] : null;
  const resumo = [
    { processo: "Digitação", item: latest(typings) },
    { processo: "Exame complementar", item: latest(compl) },
    { processo: "LTCAT", item: latest(docs.filter((d) => d.tipo === "LTCAT")) },
    { processo: "PCMSO", item: latest(docs.filter((d) => d.tipo === "PCMSO")) },
    { processo: "Checklist", item: latest(docs.filter((d) => d.tipo === "Checklist")) },
    { processo: "Exame periódico", item: latest(periodic) },
  ];

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: T.ink2 }}>
        <ArrowLeft size={15} /> Voltar para Empresas
      </button>

      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold" style={{ color: T.ink }}>{company.nomeFantasia}</h2>
              <Badge tone={company.situacao === "Ativa" ? "success" : "neutral"}>{company.situacao}</Badge>
            </div>
            <p className="text-sm mt-1" style={{ color: T.muted }}>{company.razaoSocial} · {company.cnpj}</p>
            <p className="text-sm mt-1" style={{ color: T.ink2 }}>{company.endereco}, {company.cidade}</p>
          </div>
          <div className="text-sm text-right" style={{ color: T.ink2 }}>
            <div>{company.telefone}</div>
            <div>{company.email}</div>
            <div className="mt-1" style={{ color: T.muted }}>Responsável: {company.responsavel}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader title="Resumo" subtitle="Status da última ocorrência de cada processo" />
        <DataTable
          columns={[
            { key: "processo", label: "Processo" },
            { key: "status", label: "Status", render: (r) => r.item ? <StatusBadge status={r.item.status} prazo={r.item.prazo || r.item.dataPrevista || r.item.previsaoEntrega} /> : <Badge tone="neutral">Sem registro</Badge> },
          ]}
          rows={resumo}
        />
      </Card>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Pendências abertas" value={pend.filter((p) => !["Resolvida","Cancelada"].includes(p.status)).length} tone="warning" />
        <MiniStat label="Visitas agendadas" value={visits.filter((v) => v.status === "Agendada" || v.status === "Confirmada").length} tone="info" />
        <MiniStat label="Docs a vencer" value={docs.filter((d) => ["vencido","critico"].includes(vencimentoBucket(d.dataVencimento))).length} tone="danger" />
        <MiniStat label="Ocorrências" value={occ.length} />
      </div>

      <Card className="p-4">
        <SectionHeader title="Ocorrências" />
        <DataTable
          columns={[
            { key: "tipo", label: "Tipo" },
            { key: "usuarioResponsavel", label: "Responsável", render: (r) => userName(r.usuarioResponsavel) },
            { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.prazo} /> },
          ]}
          rows={occ}
          emptyText="Nenhuma ocorrência registrada para esta empresa."
        />
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <SectionHeader title="Documentos" />
          <DataTable
            columns={[
              { key: "tipo", label: "Tipo" },
              { key: "dataVencimento", label: "Vencimento", render: (r) => fmtDate(r.dataVencimento) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.dataPrevista} /> },
            ]}
            rows={docs}
            emptyText="Nenhum documento registrado."
          />
        </Card>
        <Card className="p-4">
          <SectionHeader title="Pendências" />
          <DataTable
            columns={[
              { key: "descricao", label: "Descrição" },
              { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.prazo} /> },
            ]}
            rows={pend}
            emptyText="Nenhuma pendência registrada."
          />
        </Card>
      </div>

      <Card className="p-4">
        <SectionHeader title="Visitas agendadas" />
        <DataTable
          columns={[
            { key: "data", label: "Data", render: (r) => fmtDate(r.data) },
            { key: "horario", label: "Horário" },
            { key: "responsavel", label: "Responsável", render: (r) => userName(r.responsavel) },
            { key: "objetivo", label: "Objetivo" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rows={visits}
          emptyText="Nenhuma visita registrada."
        />
      </Card>
    </div>
  );
}

/* ============================== OCORRÊNCIAS ============================== */
const occurrenceFields = [
  { key: "companyId", label: "Empresa", type: "company", required: true },
  { key: "tipo", label: "Tipo", type: "select", options: TIPOS_OCORRENCIA, required: true },
  { key: "usuarioResponsavel", label: "Responsável", type: "user" },
  { key: "status", label: "Status", type: "select", options: STATUS_OCORRENCIA },
  { key: "prioridade", label: "Prioridade", type: "select", options: PRIORIDADES },
  { key: "prazo", label: "Prazo", type: "date" },
  { key: "dataConclusao", label: "Data de conclusão", type: "date" },
  { key: "pendencias", label: "Pendências", type: "textarea", span: 2 },
  { key: "observacoes", label: "Observações", type: "textarea", span: 2 },
];

function useModuleFilters(data, config) {
  // config: {companyKey, userKey, statusKey, statusOptions}
  const [search, setSearch] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const [user, setUser] = useState("");
  return { search, setSearch, company, setCompany, status, setStatus, user, setUser };
}

function OcorrenciasPage({ data, crud, companyName, userName }) {
  const f = useModuleFilters();
  const modal = useCrudModal({ status: "Não iniciada", prioridade: "Média", dataCriacao: todayISO() });
  const [toDelete, setToDelete] = useState(null);

  const rows = data.occurrences.filter((o) =>
    (!f.company || o.companyId === f.company) &&
    (!f.status || o.status === f.status) &&
    (!f.user || o.usuarioResponsavel === f.user) &&
    (!f.search || o.tipo.toLowerCase().includes(f.search.toLowerCase()) || companyName(o.companyId).toLowerCase().includes(f.search.toLowerCase()))
  ).sort((a,b) => b.dataCriacao.localeCompare(a.dataCriacao));

  const save = () => {
    const v = modal.value;
    if (modal.mode === "create") crud.add({ ...v, dataCriacao: v.dataCriacao || todayISO() }); else crud.update(v);
    modal.close();
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Ocorrências" subtitle="Cada ocorrência gera um novo registro — nada é sobrescrito" actions={<Button onClick={() => modal.openCreate({ status: "Não iniciada", prioridade: "Média", dataCriacao: todayISO() })}><Plus size={15}/> Nova ocorrência</Button>} />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex-1 min-w-[200px]"><SearchInput value={f.search} onChange={f.setSearch} placeholder="Buscar por tipo ou empresa..." /></div>
          <Select value={f.company} onChange={f.setCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <Select value={f.status} onChange={f.setStatus} options={STATUS_OCORRENCIA} placeholder="Todos os status" />
          <Select value={f.user} onChange={f.setUser} options={data.users.map((u) => ({ value: u.id, label: u.nome }))} placeholder="Todos os responsáveis" />
        </div>
        <DataTable
          columns={[
            { key: "tipo", label: "Tipo" },
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "usuarioResponsavel", label: "Responsável", render: (r) => userName(r.usuarioResponsavel) },
            { key: "prioridade", label: "Prioridade", render: (r) => <PriorityBadge p={r.prioridade} /> },
            { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.prazo} /> },
          ]}
          rows={rows}
          onEdit={(r) => modal.openEdit(r)}
          onDelete={(r) => setToDelete(r)}
        />
      </Card>
      <Modal open={modal.open} onClose={modal.close} title={modal.mode === "create" ? "Nova ocorrência" : "Editar ocorrência"} width={640}>
        <RecordForm fields={occurrenceFields} value={modal.value} onChange={modal.setValue} companies={data.companies} users={data.users} />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={modal.close}>Cancelar</Button>
          <Button onClick={save}>Salvar</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { crud.remove(toDelete); setToDelete(null); }} text="Deseja excluir esta ocorrência?" />
    </div>
  );
}

/* ============================== EXAMES PERIÓDICOS ============================== */
const periodicFields = [
  { key: "companyId", label: "Empresa", type: "company", required: true },
  { key: "dataProgramada", label: "Data programada", type: "date" },
  { key: "setor", label: "Setor" },
  { key: "medico", label: "Médico responsável" },
  { key: "qtdPrevista", label: "Quantidade prevista", type: "number" },
  { key: "qtdRealizada", label: "Quantidade realizada", type: "number" },
  { key: "status", label: "Status de andamento", type: "select", options: STATUS_EXAME },
  { key: "prioridade", label: "Prioridade", type: "select", options: PRIORIDADES },
  { key: "observacoes", label: "Observações", type: "textarea", span: 2 },
];

function ExamesPeriodicosPage({ data, crud, companyName }) {
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const modal = useCrudModal({ status: "Não iniciado", prioridade: "Média", qtdPrevista: 0, qtdRealizada: 0 });
  const [toDelete, setToDelete] = useState(null);

  const rows = data.periodicExams.filter((e) => (!company || e.companyId === company) && (!status || e.status === status));

  return (
    <div className="space-y-4">
      <SectionHeader title="Exames periódicos" actions={<Button onClick={() => modal.openCreate({ status: "Não iniciado", prioridade: "Média", qtdPrevista: 0, qtdRealizada: 0 })}><Plus size={15}/> Novo registro</Button>} />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={company} onChange={setCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <Select value={status} onChange={setStatus} options={STATUS_EXAME} placeholder="Todos os status" />
        </div>
        <DataTable
          columns={[
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "setor", label: "Setor" },
            { key: "medico", label: "Médico" },
            { key: "dataProgramada", label: "Data programada", render: (r) => fmtDate(r.dataProgramada) },
            { key: "prevista", label: "Prevista", render: (r) => r.qtdPrevista },
            { key: "realizada", label: "Realizada", render: (r) => r.qtdRealizada },
            { key: "pendente", label: "Pendente", render: (r) => Math.max(0, r.qtdPrevista - r.qtdRealizada) },
            { key: "pct", label: "% realizado", render: (r) => `${r.qtdPrevista ? Math.round((r.qtdRealizada/r.qtdPrevista)*100) : 0}%` },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.dataProgramada} /> },
          ]}
          rows={rows}
          onEdit={(r) => modal.openEdit(r)}
          onDelete={(r) => setToDelete(r)}
        />
      </Card>
      <Modal open={modal.open} onClose={modal.close} title={modal.mode === "create" ? "Novo exame periódico" : "Editar exame periódico"} width={640}>
        <RecordForm fields={periodicFields} value={modal.value} onChange={modal.setValue} companies={data.companies} users={data.users} />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={modal.close}>Cancelar</Button>
          <Button onClick={() => { modal.mode === "create" ? crud.add(modal.value) : crud.update(modal.value); modal.close(); }}>Salvar</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { crud.remove(toDelete); setToDelete(null); }} text="Deseja excluir este registro de exame periódico?" />
    </div>
  );
}

/* ============================== EXAMES COMPLEMENTARES ============================== */
function complementaryFields(config) {
  return [
    { key: "companyId", label: "Empresa", type: "company", required: true },
    { key: "setor", label: "Setor" },
    { key: "exame", label: "Exame complementar", type: "select", options: config.tiposExameComplementar },
    { key: "realizadoPor", label: "Realizado por", type: "user" },
    { key: "status", label: "Status do exame", type: "select", options: STATUS_EXAME },
    { key: "qtdPrevista", label: "Quantidade prevista", type: "number" },
    { key: "qtdRealizada", label: "Quantidade realizada", type: "number" },
    { key: "local", label: "Local" },
    { key: "dataRealizada", label: "Data realizada", type: "date" },
    { key: "pendencias", label: "Pendências", type: "textarea", span: 2 },
    { key: "observacoes", label: "Observações", type: "textarea", span: 2 },
  ];
}

function ExamesComplementaresPage({ data, crud, companyName, userName }) {
  const [company, setCompany] = useState("");
  const [tipo, setTipo] = useState("");
  const modal = useCrudModal({ status: "Não iniciado", qtdPrevista: 0, qtdRealizada: 0 });
  const [toDelete, setToDelete] = useState(null);
  const fields = complementaryFields(data.config);

  const rows = data.complementaryExams.filter((e) => (!company || e.companyId === company) && (!tipo || e.exame === tipo));

  return (
    <div className="space-y-4">
      <SectionHeader title="Exames complementares" actions={<Button onClick={() => modal.openCreate({ status: "Não iniciado", qtdPrevista: 0, qtdRealizada: 0 })}><Plus size={15}/> Novo registro</Button>} />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={company} onChange={setCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <Select value={tipo} onChange={setTipo} options={data.config.tiposExameComplementar} placeholder="Todos os exames" />
        </div>
        <DataTable
          columns={[
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "exame", label: "Exame" },
            { key: "setor", label: "Setor" },
            { key: "realizadoPor", label: "Realizado por", render: (r) => userName(r.realizadoPor) },
            { key: "prevista", label: "Prevista", render: (r) => r.qtdPrevista },
            { key: "realizada", label: "Realizada", render: (r) => r.qtdRealizada },
            { key: "local", label: "Local" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
          ]}
          rows={rows}
          onEdit={(r) => modal.openEdit(r)}
          onDelete={(r) => setToDelete(r)}
        />
      </Card>
      <Modal open={modal.open} onClose={modal.close} title={modal.mode === "create" ? "Novo exame complementar" : "Editar exame complementar"} width={640}>
        <RecordForm fields={fields} value={modal.value} onChange={modal.setValue} companies={data.companies} users={data.users} />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={modal.close}>Cancelar</Button>
          <Button onClick={() => { modal.mode === "create" ? crud.add(modal.value) : crud.update(modal.value); modal.close(); }}>Salvar</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { crud.remove(toDelete); setToDelete(null); }} text="Deseja excluir este registro de exame complementar?" />
    </div>
  );
}

/* ============================== DIGITAÇÃO ============================== */
const typingFields = [
  { key: "companyId", label: "Empresa", type: "company", required: true },
  { key: "usuarioResponsavel", label: "Responsável", type: "user" },
  { key: "dataInicio", label: "Data de início", type: "date" },
  { key: "grauRisco", label: "Grau de risco", type: "select", options: GRAUS_RISCO, numeric: true },
  { key: "prioridade", label: "Prioridade", type: "select", options: PRIORIDADES },
  { key: "previsaoEntrega", label: "Previsão de entrega", type: "date" },
  { key: "dataFinalizacao", label: "Data de finalização", type: "date" },
  { key: "status", label: "Status", type: "select", options: STATUS_DIGITACAO },
  { key: "pendenciasProcedencia", label: "Pendências para dar procedência", type: "textarea", span: 2 },
  { key: "observacoes", label: "Observações", type: "textarea", span: 2 },
];

function DigitacaoPage({ data, crud, companyName, userName }) {
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const modal = useCrudModal({ status: "Aguardando início", prioridade: "Média", grauRisco: 1, dataInicio: todayISO() });
  const [toDelete, setToDelete] = useState(null);

  const rows = data.typings.filter((t) => (!company || t.companyId === company) && (!status || t.status === status));

  const withAutoPrazo = (v) => {
    if (v.dataInicio && !v.previsaoEntrega) {
      const dias = v.prioridade === "Urgente" ? data.config.prazoDigitacaoUrgenteDias : data.config.prazoDigitacaoDias;
      return { ...v, previsaoEntrega: addDays(dias, v.dataInicio) };
    }
    return v;
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Digitação de prontuários" subtitle="Previsão de entrega calculada automaticamente a partir dos prazos configurados" actions={<Button onClick={() => modal.openCreate({ status: "Aguardando início", prioridade: "Média", grauRisco: 1, dataInicio: todayISO() })}><Plus size={15}/> Nova digitação</Button>} />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={company} onChange={setCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <Select value={status} onChange={setStatus} options={STATUS_DIGITACAO} placeholder="Todos os status" />
        </div>
        <DataTable
          columns={[
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "usuarioResponsavel", label: "Responsável", render: (r) => userName(r.usuarioResponsavel) },
            { key: "grauRisco", label: "Grau de risco" },
            { key: "prioridade", label: "Prioridade", render: (r) => <PriorityBadge p={r.prioridade} /> },
            { key: "previsaoEntrega", label: "Previsão de entrega", render: (r) => fmtDate(r.previsaoEntrega) },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.previsaoEntrega} /> },
          ]}
          rows={rows}
          onEdit={(r) => modal.openEdit(r)}
          onDelete={(r) => setToDelete(r)}
        />
      </Card>
      <Modal open={modal.open} onClose={modal.close} title={modal.mode === "create" ? "Nova digitação" : "Editar digitação"} width={640}>
        <RecordForm fields={typingFields} value={modal.value} onChange={(v) => modal.setValue(withAutoPrazo(v))} companies={data.companies} users={data.users} />
        <p className="text-xs mt-2" style={{ color: T.muted }}>Se a previsão de entrega ficar em branco, ela será calculada com base na data de início e na prioridade.</p>
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={modal.close}>Cancelar</Button>
          <Button onClick={() => { const v = withAutoPrazo(modal.value); modal.mode === "create" ? crud.add(v) : crud.update(v); modal.close(); }}>Salvar</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { crud.remove(toDelete); setToDelete(null); }} text="Deseja excluir este registro de digitação?" />
    </div>
  );
}

/* ============================== DOCUMENTOS (PCMSO/LTCAT/Checklist/Outros) ============================== */
const documentFields = [
  { key: "companyId", label: "Empresa", type: "company", required: true },
  { key: "usuarioResponsavel", label: "Responsável", type: "user" },
  { key: "dataInicio", label: "Data de início", type: "date" },
  { key: "dataPrevista", label: "Data prevista para conclusão", type: "date" },
  { key: "dataFim", label: "Data de fim", type: "date" },
  { key: "dataVencimento", label: "Data de vencimento", type: "date" },
  { key: "status", label: "Status", type: "select", options: STATUS_DOCUMENTO },
  { key: "pendencias", label: "Pendências", type: "textarea", span: 2 },
  { key: "observacoes", label: "Observações", type: "textarea", span: 2 },
];

function DocumentosPage({ tipo, data, crud, companyName, userName }) {
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const modal = useCrudModal({ status: "Aguardando início", tipo, dataInicio: todayISO() });
  const [toDelete, setToDelete] = useState(null);

  const rows = data.documents.filter((d) => d.tipo === tipo && (!company || d.companyId === company) && (!status || d.status === status));

  return (
    <div className="space-y-4">
      <SectionHeader title={tipo === "Outros" ? "Outros documentos" : tipo} actions={<Button onClick={() => modal.openCreate({ status: "Aguardando início", tipo, dataInicio: todayISO() })}><Plus size={15}/> Novo {tipo}</Button>} />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={company} onChange={setCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <Select value={status} onChange={setStatus} options={STATUS_DOCUMENTO} placeholder="Todos os status" />
        </div>
        <DataTable
          columns={[
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "usuarioResponsavel", label: "Responsável", render: (r) => userName(r.usuarioResponsavel) },
            { key: "dataPrevista", label: "Previsão", render: (r) => fmtDate(r.dataPrevista) },
            { key: "dataVencimento", label: "Vencimento", render: (r) => r.dataVencimento ? (
              <span className="inline-flex items-center gap-1.5">
                {fmtDate(r.dataVencimento)}
                {vencimentoBucket(r.dataVencimento) && <Badge tone={{vencido:"danger",critico:"danger",atencao:"warning",ok:"success"}[vencimentoBucket(r.dataVencimento)]}>{BUCKET_META[vencimentoBucket(r.dataVencimento)].label}</Badge>}
              </span>
            ) : "—" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.dataPrevista} /> },
          ]}
          rows={rows}
          onEdit={(r) => modal.openEdit(r)}
          onDelete={(r) => setToDelete(r)}
          emptyText={`Nenhum registro de ${tipo} encontrado.`}
        />
      </Card>
      <Modal open={modal.open} onClose={modal.close} title={modal.mode === "create" ? `Novo ${tipo}` : `Editar ${tipo}`} width={640}>
        <RecordForm fields={documentFields} value={modal.value} onChange={modal.setValue} companies={data.companies} users={data.users} />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={modal.close}>Cancelar</Button>
          <Button onClick={() => { modal.mode === "create" ? crud.add(modal.value) : crud.update(modal.value); modal.close(); }}>Salvar</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { crud.remove(toDelete); setToDelete(null); }} text={`Deseja excluir este ${tipo}?`} />
    </div>
  );
}

/* ============================== PENDÊNCIAS ============================== */
const pendencyFields = [
  { key: "companyId", label: "Empresa", type: "company", required: true },
  { key: "tipo", label: "Tipo" },
  { key: "descricao", label: "Descrição", type: "textarea", span: 2, required: true },
  { key: "responsavel", label: "Responsável", type: "user" },
  { key: "prazo", label: "Prazo", type: "date" },
  { key: "prioridade", label: "Prioridade", type: "select", options: PRIORIDADES },
  { key: "status", label: "Status", type: "select", options: STATUS_PENDENCIA },
  { key: "dataConclusao", label: "Data de conclusão", type: "date" },
  { key: "observacoes", label: "Observações", type: "textarea", span: 2 },
];

function PendenciasPage({ data, crud, companyName, userName }) {
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState("");
  const modal = useCrudModal({ status: "Aberta", prioridade: "Média", dataCriacao: todayISO() });
  const [toDelete, setToDelete] = useState(null);

  const rows = data.pendencies.filter((p) => (!company || p.companyId === company) && (!status || p.status === status));

  return (
    <div className="space-y-4">
      <SectionHeader title="Pendências" actions={<Button onClick={() => modal.openCreate({ status: "Aberta", prioridade: "Média", dataCriacao: todayISO() })}><Plus size={15}/> Nova pendência</Button>} />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={company} onChange={setCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <Select value={status} onChange={setStatus} options={STATUS_PENDENCIA} placeholder="Todos os status" />
        </div>
        <DataTable
          columns={[
            { key: "descricao", label: "Descrição" },
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "responsavel", label: "Responsável", render: (r) => userName(r.responsavel) },
            { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) },
            { key: "prioridade", label: "Prioridade", render: (r) => <PriorityBadge p={r.prioridade} /> },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.prazo} /> },
          ]}
          rows={rows}
          onEdit={(r) => modal.openEdit(r)}
          onDelete={(r) => setToDelete(r)}
        />
      </Card>
      <Modal open={modal.open} onClose={modal.close} title={modal.mode === "create" ? "Nova pendência" : "Editar pendência"} width={640}>
        <RecordForm fields={pendencyFields} value={modal.value} onChange={modal.setValue} companies={data.companies} users={data.users} />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={modal.close}>Cancelar</Button>
          <Button onClick={() => { modal.mode === "create" ? crud.add(modal.value) : crud.update(modal.value); modal.close(); }}>Salvar</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { crud.remove(toDelete); setToDelete(null); }} text="Deseja excluir esta pendência?" />
    </div>
  );
}

/* ============================== MINHAS ATIVIDADES ============================== */
function MinhasAtividadesPage({ data, currentUserId, setCurrentUserId, canImpersonate, companyName, allActivities }) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [company, setCompany] = useState("");
  const [tab, setTab] = useState("hoje");

  const mine = allActivities.filter((a) => a.responsavel === currentUserId)
    .filter((a) => (!status || a.status === status) && (!priority || a.prioridade === priority) && (!company || a.companyId === company));

  const groups = {
    hoje: mine.filter((a) => diffDaysFromToday(a.prazo) === 0 && !CONCLUDED.has(a.status)),
    proximas: mine.filter((a) => diffDaysFromToday(a.prazo) > 0 && !CONCLUDED.has(a.status)),
    atrasadas: mine.filter((a) => isLate(a.prazo, a.status)),
    concluidas: mine.filter((a) => CONCLUDED.has(a.status)),
  };

  const tabs = [
    { id: "hoje", label: "Para hoje", count: groups.hoje.length },
    { id: "proximas", label: "Próximas", count: groups.proximas.length },
    { id: "atrasadas", label: "Atrasadas", count: groups.atrasadas.length },
    { id: "concluidas", label: "Concluídas", count: groups.concluidas.length },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader title="Minhas atividades" subtitle="Lista de trabalho consolidada de todos os módulos" />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {canImpersonate && <Select value={currentUserId} onChange={setCurrentUserId} options={data.users.map((u) => ({ value: u.id, label: u.nome }))} />}
          <Select value={company} onChange={setCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <Select value={priority} onChange={setPriority} options={PRIORIDADES} placeholder="Todas as prioridades" />
        </div>
        <div className="flex gap-1.5 mb-4 flex-wrap">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3.5 py-1.5 rounded-full text-sm font-medium flex items-center gap-1.5"
              style={{ background: tab === t.id ? T.ink : T.slateSoft, color: tab === t.id ? "#fff" : T.ink2 }}
            >
              {t.label} <span className="text-xs opacity-80">({t.count})</span>
            </button>
          ))}
        </div>
        <DataTable
          columns={[
            { key: "title", label: "Atividade" },
            { key: "origin", label: "Módulo", render: (r) => <Badge>{r.origin}</Badge> },
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "prazo", label: "Prazo", render: (r) => fmtDate(r.prazo) },
            { key: "prioridade", label: "Prioridade", render: (r) => <PriorityBadge p={r.prioridade} /> },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} prazo={r.prazo} /> },
          ]}
          rows={groups[tab].sort((a,b) => (a.prazo||"9999").localeCompare(b.prazo||"9999"))}
          emptyText="Nada por aqui."
        />
      </Card>
    </div>
  );
}

/* ============================== VISITAS ============================== */
const visitFields = [
  { key: "companyId", label: "Empresa", type: "company", required: true },
  { key: "data", label: "Data", type: "date", required: true },
  { key: "horario", label: "Horário" },
  { key: "responsavel", label: "Responsável", type: "user" },
  { key: "tipo", label: "Tipo de visita", type: "select", options: TIPOS_VISITA },
  { key: "objetivo", label: "Objetivo", span: 2 },
  { key: "status", label: "Status", type: "select", options: STATUS_VISITA },
  { key: "observacoes", label: "Observações", type: "textarea", span: 2 },
];

function VisitasPage({ data, crud, companyName, userName }) {
  const [view, setView] = useState("lista");
  const [company, setCompany] = useState("");
  const modal = useCrudModal({ status: "Agendada", data: todayISO() });
  const [toDelete, setToDelete] = useState(null);

  const rows = data.visits.filter((v) => !company || v.companyId === company).sort((a,b) => a.data.localeCompare(b.data));

  const byDate = useMemo(() => {
    const m = {};
    rows.forEach((v) => { m[v.data] = m[v.data] || []; m[v.data].push(v); });
    return Object.entries(m).sort((a,b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <div className="space-y-4">
      <SectionHeader title="Visitas" actions={<Button onClick={() => modal.openCreate({ status: "Agendada", data: todayISO() })}><Plus size={15}/> Nova visita</Button>} />
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Select value={company} onChange={setCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <div className="ml-auto flex gap-1 rounded-lg p-1" style={{ background: T.slateSoft }}>
            <button onClick={() => setView("lista")} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: view === "lista" ? "#fff" : "transparent", color: T.ink }}>Lista</button>
            <button onClick={() => setView("calendario")} className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ background: view === "calendario" ? "#fff" : "transparent", color: T.ink }}>Calendário</button>
          </div>
        </div>
        {view === "lista" ? (
          <DataTable
            columns={[
              { key: "data", label: "Data", render: (r) => fmtDate(r.data) },
              { key: "horario", label: "Horário" },
              { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
              { key: "responsavel", label: "Responsável", render: (r) => userName(r.responsavel) },
              { key: "tipo", label: "Tipo" },
              { key: "objetivo", label: "Objetivo" },
              { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            ]}
            rows={rows}
            onEdit={(r) => modal.openEdit(r)}
            onDelete={(r) => setToDelete(r)}
          />
        ) : (
          <div className="space-y-4">
            {byDate.length === 0 && <EmptyState text="Nenhuma visita agendada." />}
            {byDate.map(([date, items]) => (
              <div key={date}>
                <div className="text-xs font-semibold mb-2 flex items-center gap-2" style={{ color: T.muted }}>
                  {fmtDate(date)}
                  {diffDaysFromToday(date) === 0 && <Badge tone="info">Hoje</Badge>}
                </div>
                <div className="space-y-2">
                  {items.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: T.slateSoft }}>
                      <div className="text-sm font-semibold w-14" style={{ color: T.ink, fontFamily: "'IBM Plex Mono', monospace" }}>{v.horario}</div>
                      <div className="flex-1">
                        <div className="text-sm font-medium" style={{ color: T.ink }}>{companyName(v.companyId)} — {v.tipo}</div>
                        <div className="text-xs" style={{ color: T.muted }}>{v.objetivo} · {userName(v.responsavel)}</div>
                      </div>
                      <StatusBadge status={v.status} />
                      <IconButton icon={Pencil} onClick={() => modal.openEdit(v)} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
      <Modal open={modal.open} onClose={modal.close} title={modal.mode === "create" ? "Nova visita" : "Editar visita"} width={640}>
        <RecordForm fields={visitFields} value={modal.value} onChange={modal.setValue} companies={data.companies} users={data.users} />
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={modal.close}>Cancelar</Button>
          <Button onClick={() => { modal.mode === "create" ? crud.add(modal.value) : crud.update(modal.value); modal.close(); }}>Salvar</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { crud.remove(toDelete); setToDelete(null); }} text="Deseja excluir esta visita?" />
    </div>
  );
}

/* ============================== VENCIMENTOS ============================== */
function VencimentosPage({ data, companyName, userName }) {
  const [tipo, setTipo] = useState("");
  const items = useMemo(() => {
    const list = [];
    data.documents.forEach((d) => { if (d.dataVencimento) list.push({ id: d.id, tipo: d.tipo, companyId: d.companyId, responsavel: d.usuarioResponsavel, vencimento: d.dataVencimento }); });
    return list.filter((i) => !tipo || i.tipo === tipo).sort((a,b) => a.vencimento.localeCompare(b.vencimento));
  }, [data.documents, tipo]);

  const buckets = { vencido: items.filter((i) => vencimentoBucket(i.vencimento) === "vencido"), critico: items.filter((i) => vencimentoBucket(i.vencimento) === "critico"), atencao: items.filter((i) => vencimentoBucket(i.vencimento) === "atencao"), ok: items.filter((i) => vencimentoBucket(i.vencimento) === "ok") };

  return (
    <div className="space-y-4">
      <SectionHeader title="Vencimentos" subtitle="PCMSO, LTCAT e demais documentos com data de vencimento" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(buckets).map(([key, arr]) => (
          <Card key={key} className="p-4" style={{ borderLeft: `4px solid ${BUCKET_META[key].color}` }}>
            <div className="text-xs font-medium" style={{ color: T.muted }}>{BUCKET_META[key].label}</div>
            <div className="text-2xl font-semibold mt-1" style={{ color: BUCKET_META[key].color, fontFamily: "'IBM Plex Mono', monospace" }}>{arr.length}</div>
          </Card>
        ))}
      </div>
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={tipo} onChange={setTipo} options={TIPOS_DOCUMENTO} placeholder="Todos os tipos" />
        </div>
        <DataTable
          columns={[
            { key: "tipo", label: "Tipo" },
            { key: "companyId", label: "Empresa", render: (r) => companyName(r.companyId) },
            { key: "responsavel", label: "Responsável", render: (r) => userName(r.responsavel) },
            { key: "vencimento", label: "Vencimento", render: (r) => fmtDate(r.vencimento) },
            { key: "situacao", label: "Situação", render: (r) => { const b = vencimentoBucket(r.vencimento); return <Badge tone={{vencido:"danger",critico:"danger",atencao:"warning",ok:"success"}[b]}>{BUCKET_META[b].label}</Badge>; } },
          ]}
          rows={items}
          emptyText="Nenhum documento com data de vencimento cadastrada."
        />
      </Card>
    </div>
  );
}

/* ============================== RELATÓRIOS ============================== */
const REPORT_DEFS = {
  empresas: { label: "Empresas", cols: [{k:"nomeFantasia",l:"Empresa"},{k:"cnpj",l:"CNPJ"},{k:"cidade",l:"Cidade"},{k:"situacao",l:"Situação"}] },
  ocorrencias: { label: "Ocorrências", cols: [{k:"tipo",l:"Tipo"},{k:"companyId",l:"Empresa"},{k:"status",l:"Status"},{k:"prazo",l:"Prazo"}] },
  periodicExams: { label: "Exames periódicos", cols: [{k:"companyId",l:"Empresa"},{k:"setor",l:"Setor"},{k:"status",l:"Status"}] },
  complementaryExams: { label: "Exames complementares", cols: [{k:"companyId",l:"Empresa"},{k:"exame",l:"Exame"},{k:"status",l:"Status"}] },
  typings: { label: "Digitações", cols: [{k:"companyId",l:"Empresa"},{k:"status",l:"Status"},{k:"previsaoEntrega",l:"Previsão"}] },
  documents: { label: "Documentos", cols: [{k:"tipo",l:"Tipo"},{k:"companyId",l:"Empresa"},{k:"status",l:"Status"},{k:"dataVencimento",l:"Vencimento"}] },
  pendencies: { label: "Pendências", cols: [{k:"descricao",l:"Descrição"},{k:"companyId",l:"Empresa"},{k:"status",l:"Status"},{k:"prazo",l:"Prazo"}] },
  visits: { label: "Visitas", cols: [{k:"companyId",l:"Empresa"},{k:"data",l:"Data"},{k:"status",l:"Status"}] },
};

function RelatoriosPage({ data, companyName, userName }) {
  const [report, setReport] = useState("empresas");
  const [company, setCompany] = useState("");

  const def = REPORT_DEFS[report];
  let rows = data[report] || [];
  if (company) rows = rows.filter((r) => r.companyId === company || r.id === undefined);

  return (
    <div className="space-y-4">
      <SectionHeader title="Relatórios" subtitle="Filtre e visualize; exportação para Excel/PDF poderá ser adicionada futuramente" />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={report} onChange={setReport} options={Object.entries(REPORT_DEFS).map(([k,v]) => ({ value: k, label: v.label }))} />
          <Select value={company} onChange={setCompany} options={data.companies.map((c) => ({ value: c.id, label: c.nomeFantasia }))} placeholder="Todas as empresas" />
          <Button variant="outline" size="sm" disabled title="Em breve">Exportar Excel</Button>
          <Button variant="outline" size="sm" disabled title="Em breve">Exportar PDF</Button>
        </div>
        <DataTable
          columns={def.cols.map((c) => ({ key: c.k, label: c.l, render: (r) => {
            const v = r[c.k];
            if (c.k === "companyId") return companyName(v);
            if (c.k === "responsavel" || c.k === "usuarioResponsavel" || c.k === "realizadoPor") return userName(v);
            if (/data|prazo|vencimento|previsao|Previsao|Entrega/i.test(c.k) && typeof v === "string" && v.includes("-")) return fmtDate(v);
            return v ?? "—";
          }}))}
          rows={rows}
        />
      </Card>
    </div>
  );
}

/* ============================== USUÁRIOS ============================== */
const userFields = [
  { key: "nome", label: "Nome", required: true },
  { key: "email", label: "E-mail", required: true },
  { key: "senha", label: "Senha (usada para o login no sistema)", type: "password", required: true },
  { key: "perfil", label: "Perfil", type: "select", options: PERFIS },
  { key: "status", label: "Status", type: "select", options: ["Ativo","Inativo"] },
];

function UsuariosPage({ data, crud }) {
  const modal = useCrudModal({ perfil: "Usuário", status: "Ativo", senha: "", dataCadastro: todayISO() });
  const [toDelete, setToDelete] = useState(null);

  return (
    <div className="space-y-4">
      <SectionHeader title="Usuários" subtitle="Perfis: Administrador, Gestor, Usuário e Consulta" actions={<Button onClick={() => modal.openCreate({ perfil: "Usuário", status: "Ativo", senha: "", dataCadastro: todayISO() })}><Plus size={15}/> Novo usuário</Button>} />
      <Card className="p-4">
        <DataTable
          columns={[
            { key: "nome", label: "Nome" },
            { key: "email", label: "E-mail" },
            { key: "perfil", label: "Perfil", render: (r) => <Badge tone="info">{r.perfil}</Badge> },
            { key: "status", label: "Status", render: (r) => <Badge tone={r.status === "Ativo" ? "success" : "neutral"}>{r.status}</Badge> },
            { key: "dataCadastro", label: "Cadastrado em", render: (r) => fmtDate(r.dataCadastro) },
          ]}
          rows={data.users}
          onEdit={(r) => modal.openEdit({ ...r, senha: "" })}
          onDelete={(r) => setToDelete(r)}
        />
      </Card>
      <Modal open={modal.open} onClose={modal.close} title={modal.mode === "create" ? "Novo usuário" : "Editar usuário"} width={560}>
        <RecordForm fields={userFields} value={modal.value} onChange={modal.setValue} companies={data.companies} users={data.users} />
        {modal.mode === "edit" && <p className="text-xs mt-2" style={{ color: T.muted }}>Deixe a senha em branco para manter a senha atual sem alterações.</p>}
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={modal.close}>Cancelar</Button>
          <Button onClick={() => {
            const v = modal.value;
            if (modal.mode === "create") {
              crud.add(v);
            } else {
              const prev = data.users.find((u) => u.id === v.id);
              crud.update({ ...v, senha: v.senha || prev?.senha });
            }
            modal.close();
          }}>Salvar</Button>
        </div>
      </Modal>
      <ConfirmDialog open={!!toDelete} onCancel={() => setToDelete(null)} onConfirm={() => { crud.remove(toDelete); setToDelete(null); }} text="Deseja inativar este usuário?" />
    </div>
  );
}

/* ============================== AUDITORIA ============================== */
function AuditoriaPage({ data }) {
  const [modulo, setModulo] = useState("");
  const modules = [...new Set(data.audit.map((a) => a.modulo))];
  const rows = data.audit.filter((a) => !modulo || a.modulo === modulo);

  return (
    <div className="space-y-4">
      <SectionHeader title="Auditoria" subtitle="Toda alteração relevante fica registrada — sem exclusão física de histórico" />
      <Card className="p-4">
        <div className="flex flex-wrap gap-2 mb-4">
          <Select value={modulo} onChange={setModulo} options={modules} placeholder="Todos os módulos" />
        </div>
        <div className="space-y-2.5">
          {rows.length === 0 && <EmptyState text="Nenhum registro de auditoria." />}
          {rows.map((a) => (
            <div key={a.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: T.slateSoft }}>
              <CircleDot size={14} className="mt-1 flex-shrink-0" style={{ color: T.teal }} />
              <div className="flex-1 text-sm">
                <div style={{ color: T.ink }}>
                  <span className="font-semibold">{a.usuario}</span> · {a.acao} em <span className="font-medium">{a.modulo}</span>
                </div>
                <div style={{ color: T.ink2 }}>{a.registro}</div>
                <div className="text-xs mt-0.5" style={{ color: T.muted }}>{fmtDate(a.data)} às {a.horario} — de "{a.valorAnterior}" para "{a.novoValor}"</div>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ============================== CONFIGURAÇÕES ============================== */
function ConfiguracoesPage({ data, setData }) {
  const [cfg, setCfg] = useState(data.config);
  const save = () => setData((d) => ({ ...d, config: cfg }));

  return (
    <div className="space-y-4">
      <SectionHeader title="Configurações" subtitle="Parâmetros usados nos cálculos e listas do sistema" />
      <Card className="p-5">
        <h3 className="text-sm font-semibold mb-3" style={{ color: T.ink }}>Prazos</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.ink2 }}>Prazo padrão de digitação (dias)</label>
            <input type="number" value={cfg.prazoDigitacaoDias} onChange={(e) => setCfg({ ...cfg, prazoDigitacaoDias: Number(e.target.value) })} className="w-full rounded-lg text-sm px-3 py-2 outline-none" style={{ border: `1px solid ${T.line}` }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.ink2 }}>Prazo de digitação urgente (dias)</label>
            <input type="number" value={cfg.prazoDigitacaoUrgenteDias} onChange={(e) => setCfg({ ...cfg, prazoDigitacaoUrgenteDias: Number(e.target.value) })} className="w-full rounded-lg text-sm px-3 py-2 outline-none" style={{ border: `1px solid ${T.line}` }} />
          </div>
        </div>
        <h3 className="text-sm font-semibold mb-3" style={{ color: T.ink }}>Alertas de vencimento</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.ink2 }}>Faixa crítica (dias)</label>
            <input type="number" value={cfg.diasAlertaVencimentoCritico} onChange={(e) => setCfg({ ...cfg, diasAlertaVencimentoCritico: Number(e.target.value) })} className="w-full rounded-lg text-sm px-3 py-2 outline-none" style={{ border: `1px solid ${T.line}` }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: T.ink2 }}>Faixa de atenção (dias)</label>
            <input type="number" value={cfg.diasAlertaVencimentoAtencao} onChange={(e) => setCfg({ ...cfg, diasAlertaVencimentoAtencao: Number(e.target.value) })} className="w-full rounded-lg text-sm px-3 py-2 outline-none" style={{ border: `1px solid ${T.line}` }} />
          </div>
        </div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: T.ink }}>Tipos de exame complementar</h3>
        <div className="flex flex-wrap gap-1.5 mb-6">
          {cfg.tiposExameComplementar.map((t) => <Badge key={t}>{t}</Badge>)}
        </div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: T.ink }}>Perfis de usuário</h3>
        <div className="flex flex-wrap gap-1.5 mb-6">
          {cfg.perfis.map((t) => <Badge key={t} tone="info">{t}</Badge>)}
        </div>
        <Button onClick={save}>Salvar configurações</Button>
      </Card>
    </div>
  );
}
