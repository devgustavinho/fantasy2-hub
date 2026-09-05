import { Resend } from "resend";
import { env } from "../env.js";

const resend = new Resend(env.RESEND_API_KEY);

// Envio "fire and forget", mesmo padrão do push (sendPushToUser): nunca lança — uma falha do
// Resend (chave inválida, domínio remetente não verificado, limite da conta) não pode derrubar
// a rota que disparou o e-mail, só fica registrada no log do servidor.
export async function sendEmail({ to, subject, html }) {
  try {
    const { error } = await resend.emails.send({ from: env.EMAIL_FROM, to, subject, html });
    if (error) console.error("Resend falhou:", subject, "→", to, error);
  } catch (err) {
    console.error("Resend falhou:", subject, "→", to, err);
  }
}
