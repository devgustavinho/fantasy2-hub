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

export function formatCentsToBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// Normaliza um número de WhatsApp em qualquer formato livre (ex. "(11) 91234-5678") pro
// formato que o wa.me espera: só dígitos, com código do país. Assume Brasil (55) quando o
// número não já vem com o código do país (10 ou 11 dígitos = DDD + número).
function normalizeWhatsApp(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function buildWhatsAppLink(phone: string, message: string) {
  const number = normalizeWhatsApp(phone);
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

// Sem número — abre o WhatsApp (app ou web) com a mensagem pronta e deixa a pessoa escolher
// pra quem/qual grupo enviar. É o formato certo pra "compartilhar", diferente de
// `buildWhatsAppLink` (que já manda direto pra um contato específico).
export function buildWhatsAppShareLink(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function buildInstagramLink(handle: string) {
  return `https://instagram.com/${handle.replace(/^@/, "")}`;
}
