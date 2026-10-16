import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sqlite } from "../../db/client.js";
import { requireAdmin, requireApproved, requireAuth } from "../../auth/guards.js";
import { recordAudit } from "../audit/service.js";

const nowIso = () => new Date().toISOString();

const questionSchema = z.object({
  prompt: z.string().trim().min(2).max(300),
  options: z.array(z.string().trim().min(1).max(120)).min(2).max(12),
});

const createSchema = z.object({
  title: z.string().trim().min(4).max(160),
  description: z.string().trim().max(2000).optional().default(""),
  allowComments: z.boolean(),
  questions: z.array(questionSchema).min(1).max(30),
});

const statusSchema = z.object({
  status: z.enum(["open", "closed"]),
});

const responseSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        optionId: z.string().uuid(),
      }),
    )
    .min(1)
    .max(30),
  comment: z.string().trim().max(2000).optional().default(""),
});

const listSurveys = sqlite.prepare(`
  SELECT
    s.id, s.title, s.description,
    s.allow_comments AS allowComments,
    s.status,
    s.created_at AS createdAt,
    u.name AS createdByName,
    (SELECT COUNT(*) FROM climate_responses r WHERE r.survey_id = s.id) AS responseCount
  FROM climate_surveys s
  JOIN users u ON u.id = s.created_by
  ORDER BY s.created_at DESC
`);

const getSurveyRow = sqlite.prepare(`
  SELECT
    s.id, s.title, s.description,
    s.allow_comments AS allowComments,
    s.status,
    s.created_at AS createdAt,
    u.name AS createdByName,
    (SELECT COUNT(*) FROM climate_responses r WHERE r.survey_id = s.id) AS responseCount
  FROM climate_surveys s
  JOIN users u ON u.id = s.created_by
  WHERE s.id = ?
`);

const listQuestions = sqlite.prepare(`
  SELECT id, prompt, position
  FROM climate_questions
  WHERE survey_id = ?
  ORDER BY position ASC
`);

const listOptions = sqlite.prepare(`
  SELECT o.id, o.question_id AS questionId, o.label, o.position
  FROM climate_options o
  JOIN climate_questions q ON q.id = o.question_id
  WHERE q.survey_id = ?
  ORDER BY o.position ASC
`);

const listAnswerCounts = sqlite.prepare(`
  SELECT a.option_id AS optionId, COUNT(*) AS count
  FROM climate_answers a
  JOIN climate_responses r ON r.id = a.response_id
  WHERE r.survey_id = ?
  GROUP BY a.option_id
`);

const getResponseByApartment = sqlite.prepare(`
  SELECT id, comment FROM climate_responses WHERE survey_id = ? AND apartment_id = ?
`);

const listMyAnswers = sqlite.prepare(`
  SELECT question_id AS questionId, option_id AS optionId
  FROM climate_answers
  WHERE response_id = ?
`);

const listComments = sqlite.prepare(`
  SELECT
    r.id, r.comment AS body, r.created_at AS createdAt,
    u.name AS authorName,
    a.tower AS tower, a.code AS apartmentCode
  FROM climate_responses r
  JOIN users u ON u.id = r.user_id
  JOIN apartments a ON a.id = r.apartment_id
  WHERE r.survey_id = ? AND r.comment IS NOT NULL AND r.comment != ''
  ORDER BY r.created_at ASC
`);

const insertSurvey = sqlite.prepare(`
  INSERT INTO climate_surveys (id, title, description, allow_comments, created_by)
  VALUES (@id, @title, @description, @allow_comments, @created_by)
`);

const insertQuestion = sqlite.prepare(`
  INSERT INTO climate_questions (id, survey_id, prompt, position)
  VALUES (@id, @survey_id, @prompt, @position)
`);

const insertOption = sqlite.prepare(`
  INSERT INTO climate_options (id, question_id, label, position)
  VALUES (@id, @question_id, @label, @position)
`);

const updateStatus = sqlite.prepare(`
  UPDATE climate_surveys SET status = @status, updated_at = @updated_at WHERE id = @id
`);

const insertResponse = sqlite.prepare(`
  INSERT INTO climate_responses (id, survey_id, apartment_id, user_id, comment)
  VALUES (@id, @survey_id, @apartment_id, @user_id, @comment)
`);

const insertAnswer = sqlite.prepare(`
  INSERT INTO climate_answers (id, response_id, question_id, option_id)
  VALUES (@id, @response_id, @question_id, @option_id)
`);

const deleteAnswersBySurvey = sqlite.prepare(`
  DELETE FROM climate_answers
  WHERE response_id IN (SELECT id FROM climate_responses WHERE survey_id = ?)
`);
const deleteResponsesBySurvey = sqlite.prepare("DELETE FROM climate_responses WHERE survey_id = ?");
const deleteOptionsBySurvey = sqlite.prepare(`
  DELETE FROM climate_options
  WHERE question_id IN (SELECT id FROM climate_questions WHERE survey_id = ?)
`);
const deleteQuestionsBySurvey = sqlite.prepare("DELETE FROM climate_questions WHERE survey_id = ?");
const deleteSurveyById = sqlite.prepare("DELETE FROM climate_surveys WHERE id = ?");

const deleteSurveyCascade = sqlite.transaction((surveyId) => {
  deleteAnswersBySurvey.run(surveyId);
  deleteResponsesBySurvey.run(surveyId);
  deleteOptionsBySurvey.run(surveyId);
  deleteQuestionsBySurvey.run(surveyId);
  deleteSurveyById.run(surveyId);
});

const createSurveyTx = sqlite.transaction(({ survey, questions }) => {
  insertSurvey.run(survey);
  for (const question of questions) {
    insertQuestion.run({
      id: question.id,
      survey_id: survey.id,
      prompt: question.prompt,
      position: question.position,
    });
    for (const option of question.options) {
      insertOption.run({
        id: option.id,
        question_id: question.id,
        label: option.label,
        position: option.position,
      });
    }
  }
});

const submitResponseTx = sqlite.transaction(({ response, answers }) => {
  insertResponse.run(response);
  for (const answer of answers) {
    insertAnswer.run({
      id: randomUUID(),
      response_id: response.id,
      question_id: answer.questionId,
      option_id: answer.optionId,
    });
  }
});

function percentOf(count, total) {
  if (!total) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function mapSummary(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    allowComments: Boolean(row.allowComments),
    status: row.status,
    createdAt: row.createdAt,
    createdByName: row.createdByName,
    responseCount: Number(row.responseCount),
  };
}

function voteState(survey, user, alreadyVoted) {
  if (alreadyVoted) {
    return {
      canVote: false,
      voteMessage: "Seu apartamento já respondeu. Cada apartamento vota uma vez.",
    };
  }
  if (survey.status === "closed") {
    return { canVote: false, voteMessage: "Esta pesquisa está encerrada." };
  }
  if (user.household_role === "family") {
    return {
      canVote: false,
      voteMessage: "Membros da família não votam — a resposta é uma por apartamento.",
    };
  }
  if (!user.apartment_id) {
    return {
      canVote: false,
      voteMessage: "Sua conta não está vinculada a um apartamento, então não há voto a registrar.",
    };
  }
  return { canVote: true, voteMessage: null };
}

function loadSurvey(id, user) {
  const row = getSurveyRow.get(id);
  if (!row) return null;

  const summary = mapSummary(row);
  const responseCount = summary.responseCount;
  const questions = listQuestions.all(id);
  const options = listOptions.all(id);
  const counts = new Map(listAnswerCounts.all(id).map((entry) => [entry.optionId, Number(entry.count)]));

  const myResponse = user.apartment_id ? getResponseByApartment.get(id, user.apartment_id) : null;
  const selectedByQuestion = new Map();
  if (myResponse) {
    for (const answer of listMyAnswers.all(myResponse.id)) {
      selectedByQuestion.set(answer.questionId, answer.optionId);
    }
  }

  const optionsByQuestion = new Map();
  for (const option of options) {
    const count = counts.get(option.id) ?? 0;
    const bucket = optionsByQuestion.get(option.questionId) ?? [];
    bucket.push({
      id: option.id,
      label: option.label,
      count,
      percent: percentOf(count, responseCount),
      selected: selectedByQuestion.get(option.questionId) === option.id,
    });
    optionsByQuestion.set(option.questionId, bucket);
  }

  const voting = voteState(summary, user, Boolean(myResponse));

  return {
    ...summary,
    ...voting,
    voted: Boolean(myResponse),
    myComment: myResponse?.comment ?? null,
    questions: questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      options: optionsByQuestion.get(question.id) ?? [],
    })),
    comments: summary.allowComments ? listComments.all(id) : [],
  };
}

export function climateRoutes() {
  const router = Router();
  router.use(requireAuth, requireApproved);

  router.get("/", (_req, res) => {
    res.json({ surveys: listSurveys.all().map(mapSummary) });
  });

  router.post("/", requireAdmin, (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Informe um título, ao menos uma pergunta e duas opções em cada pergunta.",
      });
    }

    const id = randomUUID();
    const questions = parsed.data.questions.map((question, questionIndex) => ({
      id: randomUUID(),
      prompt: question.prompt,
      position: questionIndex,
      options: question.options.map((label, optionIndex) => ({
        id: randomUUID(),
        label,
        position: optionIndex,
      })),
    }));

    createSurveyTx({
      survey: {
        id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        allow_comments: parsed.data.allowComments ? 1 : 0,
        created_by: req.user.id,
      },
      questions,
    });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "climate.create",
      entityType: "climate_survey",
      entityId: id,
      details: { title: parsed.data.title, questions: questions.length },
    });

    res.status(201).json({ survey: loadSurvey(id, req.user) });
  });

  router.get("/:id", (req, res) => {
    const survey = loadSurvey(req.params.id, req.user);
    if (!survey) return res.status(404).json({ message: "Pesquisa não encontrada." });
    res.json({ survey });
  });

  router.patch("/:id", requireAdmin, (req, res) => {
    const current = getSurveyRow.get(req.params.id);
    if (!current) return res.status(404).json({ message: "Pesquisa não encontrada." });

    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Informe se a pesquisa fica aberta ou encerrada." });
    }

    updateStatus.run({ id: current.id, status: parsed.data.status, updated_at: nowIso() });

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: parsed.data.status === "closed" ? "climate.close" : "climate.reopen",
      entityType: "climate_survey",
      entityId: current.id,
      details: { title: current.title },
    });

    res.json({ survey: loadSurvey(current.id, req.user) });
  });

  router.delete("/:id", requireAdmin, (req, res) => {
    const current = getSurveyRow.get(req.params.id);
    if (!current) return res.status(404).json({ message: "Pesquisa não encontrada." });

    deleteSurveyCascade(current.id);

    recordAudit({
      actorUserId: req.user.id,
      actorName: req.user.name,
      action: "climate.delete",
      entityType: "climate_survey",
      entityId: current.id,
      details: { title: current.title },
    });

    res.status(204).end();
  });

  router.post("/:id/responses", (req, res) => {
    const current = getSurveyRow.get(req.params.id);
    if (!current) return res.status(404).json({ message: "Pesquisa não encontrada." });

    if (current.status === "closed") {
      return res.status(403).json({ message: "Esta pesquisa está encerrada." });
    }
    if (req.user.household_role === "family") {
      return res.status(403).json({
        message: "Membros da família não votam — a resposta é uma por apartamento.",
      });
    }
    if (!req.user.apartment_id) {
      return res.status(403).json({
        message: "Sua conta não está vinculada a um apartamento, então não há voto a registrar.",
      });
    }

    const existing = getResponseByApartment.get(current.id, req.user.apartment_id);
    if (existing) {
      return res.status(409).json({ message: "Este apartamento já respondeu esta pesquisa." });
    }

    const parsed = responseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Responda todas as perguntas da pesquisa." });
    }

    const allowComments = Boolean(current.allowComments);
    if (!allowComments && parsed.data.comment) {
      return res.status(400).json({ message: "Esta pesquisa não aceita comentários." });
    }

    const questions = listQuestions.all(current.id);
    const options = listOptions.all(current.id);
    const optionsByQuestion = new Map();
    for (const option of options) {
      const bucket = optionsByQuestion.get(option.questionId) ?? new Set();
      bucket.add(option.id);
      optionsByQuestion.set(option.questionId, bucket);
    }

    if (parsed.data.answers.length !== questions.length) {
      return res.status(400).json({ message: "Responda todas as perguntas da pesquisa." });
    }

    const seen = new Set();
    for (const answer of parsed.data.answers) {
      if (seen.has(answer.questionId)) {
        return res.status(400).json({ message: "Cada pergunta aceita uma única opção." });
      }
      seen.add(answer.questionId);
      const allowed = optionsByQuestion.get(answer.questionId);
      if (!allowed || !allowed.has(answer.optionId)) {
        return res.status(400).json({ message: "Uma das respostas não pertence à pergunta." });
      }
    }
    for (const question of questions) {
      if (!seen.has(question.id)) {
        return res.status(400).json({ message: "Responda todas as perguntas da pesquisa." });
      }
    }

    try {
      submitResponseTx({
        response: {
          id: randomUUID(),
          survey_id: current.id,
          apartment_id: req.user.apartment_id,
          user_id: req.user.id,
          comment: allowComments && parsed.data.comment ? parsed.data.comment : null,
        },
        answers: parsed.data.answers,
      });
    } catch (err) {
      if (err && err.code === "SQLITE_CONSTRAINT_UNIQUE") {
        return res.status(409).json({ message: "Este apartamento já respondeu esta pesquisa." });
      }
      throw err;
    }

    res.status(201).json({ survey: loadSurvey(current.id, req.user) });
  });

  return router;
}
