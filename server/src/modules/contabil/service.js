import { randomUUID } from "node:crypto";
import { sqlite } from "../../db/client.js";

const nowIso = () => new Date().toISOString();

const MONTH_NAMES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function titleForMonth(referenceMonth) {
  const [year, month] = referenceMonth.split("-").map(Number);
  return `Balancete ${MONTH_NAMES[month - 1]}/${year}`;
}

export function computeBalanceteStatus(decisions) {
  if (!decisions.length) return "em_analise";
  if (decisions.some((d) => d === "reprovado")) return "reprovado";
  if (decisions.some((d) => d === "aprovado_ressalvas")) return "aprovado_ressalvas";
  if (decisions.every((d) => d === "aprovado")) return "aprovado";
  return "em_analise";
}

const listCounselors = sqlite.prepare(`
  SELECT id, name FROM users
  WHERE role = 'conselheiro' AND approval_status = 'approved'
  ORDER BY name COLLATE NOCASE
`);

const insertBalancete = sqlite.prepare(`
  INSERT INTO balancetes (id, reference_month, title, pdf_url, status, published_by, published_at, created_at, updated_at)
  VALUES (@id, @reference_month, @title, @pdf_url, 'em_analise', @published_by, @now, @now, @now)
`);

const insertParecer = sqlite.prepare(`
  INSERT INTO balancete_pareceres (id, balancete_id, counselor_id, decision, status, created_at, updated_at)
  VALUES (@id, @balancete_id, @counselor_id, NULL, 'pendente', @now, @now)
`);

const updateBalanceteStatus = sqlite.prepare(`
  UPDATE balancetes SET status = @status, updated_at = @updated_at WHERE id = @id
`);

const deleteObservacoes = sqlite.prepare(`DELETE FROM balancete_observacoes WHERE parecer_id = ?`);

const insertObservacao = sqlite.prepare(`
  INSERT INTO balancete_observacoes (id, parecer_id, tipo, body, sort_order, created_at)
  VALUES (@id, @parecer_id, @tipo, @body, @sort_order, @now)
`);

const updateParecer = sqlite.prepare(`
  UPDATE balancete_pareceres
  SET decision = @decision, status = @status, finalized_at = @finalized_at, updated_at = @updated_at
  WHERE id = @id
`);

const listBalancetesSql = sqlite.prepare(`
  SELECT
    b.id,
    b.reference_month AS referenceMonth,
    b.title,
    b.pdf_url AS pdfUrl,
    b.status,
    b.published_at AS publishedAt,
    b.published_by AS publishedById,
    pub.name AS publishedByName,
    (SELECT COUNT(*) FROM balancete_pareceres p WHERE p.balancete_id = b.id) AS parecerTotal,
    (SELECT COUNT(*) FROM balancete_pareceres p WHERE p.balancete_id = b.id AND p.status = 'finalizado') AS parecerFinalizados
  FROM balancetes b
  JOIN users pub ON pub.id = b.published_by
  ORDER BY b.reference_month DESC
`);

const getBalanceteSql = sqlite.prepare(`
  SELECT
    b.id,
    b.reference_month AS referenceMonth,
    b.title,
    b.pdf_url AS pdfUrl,
    b.status,
    b.published_at AS publishedAt,
    b.published_by AS publishedById,
    pub.name AS publishedByName
  FROM balancetes b
  JOIN users pub ON pub.id = b.published_by
  WHERE b.id = ?
`);

const listPareceresSql = sqlite.prepare(`
  SELECT
    p.id,
    p.balancete_id AS balanceteId,
    p.counselor_id AS counselorId,
    u.name AS counselorName,
    p.decision,
    p.status,
    p.finalized_at AS finalizedAt,
    p.updated_at AS updatedAt
  FROM balancete_pareceres p
  JOIN users u ON u.id = p.counselor_id
  WHERE p.balancete_id = ?
  ORDER BY u.name COLLATE NOCASE
`);

const getParecerSql = sqlite.prepare(`
  SELECT
    p.id,
    p.balancete_id AS balanceteId,
    p.counselor_id AS counselorId,
    u.name AS counselorName,
    p.decision,
    p.status,
    p.finalized_at AS finalizedAt,
    p.updated_at AS updatedAt
  FROM balancete_pareceres p
  JOIN users u ON u.id = p.counselor_id
  WHERE p.id = ?
`);

const getParecerByCounselor = sqlite.prepare(`
  SELECT
    p.id,
    p.balancete_id AS balanceteId,
    p.counselor_id AS counselorId,
    u.name AS counselorName,
    p.decision,
    p.status,
    p.finalized_at AS finalizedAt,
    p.updated_at AS updatedAt
  FROM balancete_pareceres p
  JOIN users u ON u.id = p.counselor_id
  WHERE p.balancete_id = ? AND p.counselor_id = ?
`);

const listObservacoesSql = sqlite.prepare(`
  SELECT id, parecer_id AS parecerId, tipo, body, sort_order AS sortOrder, created_at AS createdAt
  FROM balancete_observacoes
  WHERE parecer_id = ?
  ORDER BY sort_order ASC, created_at ASC
`);

const deleteBalanceteSql = sqlite.prepare(`DELETE FROM balancetes WHERE id = ?`);

export function listBalancetes() {
  return listBalancetesSql.all().map((row) => ({
    ...row,
    parecerTotal: Number(row.parecerTotal),
    parecerFinalizados: Number(row.parecerFinalizados),
  }));
}

export function getBalancete(id) {
  return getBalanceteSql.get(id) ?? null;
}

function observacoesFor(parecerId) {
  return listObservacoesSql.all(parecerId);
}

export function buildDetail(balanceteId, viewer) {
  const balancete = getBalancete(balanceteId);
  if (!balancete) return null;

  const isStaff = viewer.role === "admin" || viewer.role === "sindico";
  const isCounselor = viewer.role === "conselheiro";
  const pareceres = listPareceresSql.all(balanceteId);

  const analysis = pareceres.map((p) => ({
    id: p.id,
    counselorId: p.counselorId,
    counselorName: p.counselorName,
    status: p.status,
    decision: p.status === "finalizado" || isStaff || (isCounselor && p.counselorId === viewer.id) ? p.decision : null,
    finalizedAt: p.finalizedAt,
  }));

  const finalized = pareceres
    .filter((p) => p.status === "finalizado")
    .map((p) => ({
      id: p.id,
      counselorId: p.counselorId,
      counselorName: p.counselorName,
      decision: p.decision,
      finalizedAt: p.finalizedAt,
      observacoes: observacoesFor(p.id),
    }));

  let myParecer = null;
  if (isCounselor) {
    const mine = pareceres.find((p) => p.counselorId === viewer.id) ?? null;
    if (mine) {
      myParecer = {
        ...mine,
        observacoes: observacoesFor(mine.id),
      };
    }
  }

  return {
    balancete: {
      ...balancete,
      parecerTotal: pareceres.length,
      parecerFinalizados: pareceres.filter((p) => p.status === "finalizado").length,
    },
    analysis,
    finalizedPareceres: finalized,
    myParecer,
  };
}

export function publishBalancete({ referenceMonth, pdfUrl, publishedBy }) {
  const counselors = listCounselors.all();
  const id = randomUUID();
  const now = nowIso();
  const title = titleForMonth(referenceMonth);

  const tx = sqlite.transaction(() => {
    insertBalancete.run({
      id,
      reference_month: referenceMonth,
      title,
      pdf_url: pdfUrl,
      published_by: publishedBy,
      now,
    });
    for (const c of counselors) {
      insertParecer.run({
        id: randomUUID(),
        balancete_id: id,
        counselor_id: c.id,
        now,
      });
    }
  });
  tx();

  return getBalancete(id);
}

export function saveParecer({ parecerId, decision, observacoes, finalize }) {
  const parecer = getParecerSql.get(parecerId);
  if (!parecer) return { error: "not_found" };
  if (parecer.status === "finalizado") return { error: "already_finalized" };

  const now = nowIso();
  const status = finalize ? "finalizado" : "rascunho";
  const finalizedAt = finalize ? now : null;

  const tx = sqlite.transaction(() => {
    deleteObservacoes.run(parecerId);
    observacoes.forEach((obs, index) => {
      insertObservacao.run({
        id: randomUUID(),
        parecer_id: parecerId,
        tipo: obs.tipo,
        body: obs.body,
        sort_order: index,
        now,
      });
    });
    updateParecer.run({
      id: parecerId,
      decision,
      status,
      finalized_at: finalizedAt,
      updated_at: now,
    });

    if (finalize) {
      refreshBalanceteStatus(parecer.balanceteId);
    }
  });
  tx();

  return { ok: true, parecer: getParecerSql.get(parecerId) };
}

function refreshBalanceteStatus(balanceteId) {
  const pareceres = listPareceresSql.all(balanceteId);
  if (!pareceres.length) return;
  const allDone = pareceres.every((p) => p.status === "finalizado");
  const status = allDone
    ? computeBalanceteStatus(pareceres.map((p) => p.decision))
    : "em_analise";
  updateBalanceteStatus.run({ id: balanceteId, status, updated_at: nowIso() });
}

export function findParecerForCounselor(balanceteId, counselorId) {
  return getParecerByCounselor.get(balanceteId, counselorId) ?? null;
}

export function deleteBalancete(id) {
  const row = getBalancete(id);
  if (!row) return null;
  deleteBalanceteSql.run(id);
  return row;
}
