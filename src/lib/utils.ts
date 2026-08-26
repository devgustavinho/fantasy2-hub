import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Formata uma data "YYYY-MM-DD" (sem horário) sem passar por conversão de fuso horário,
// já que `new Date("YYYY-MM-DD")` é interpretado como UTC e pode voltar um dia em fusos negativos.
export function formatDateOnly(isoDate: string) {
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}
