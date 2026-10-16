import { api } from "@/lib/api";
import type { ClimateSurvey, ClimateSurveyStatus, ClimateSurveySummary, CreateClimateSurvey } from "@/lib/types";

export const listSurveys = () => api.get<{ surveys: ClimateSurveySummary[] }>("/climate");

export const getSurvey = (id: string) => api.get<{ survey: ClimateSurvey }>(`/climate/${id}`);

export const createSurvey = (data: CreateClimateSurvey) =>
  api.post<{ survey: ClimateSurvey }>("/climate", data);

export const respondSurvey = (
  id: string,
  data: { answers: { questionId: string; optionId: string }[]; comment?: string },
) => api.post<{ survey: ClimateSurvey }>(`/climate/${id}/responses`, data);

export const setSurveyStatus = (id: string, status: ClimateSurveyStatus) =>
  api.patch<{ survey: ClimateSurvey }>(`/climate/${id}`, { status });

export const deleteSurvey = (id: string) => api.delete<void>(`/climate/${id}`);
