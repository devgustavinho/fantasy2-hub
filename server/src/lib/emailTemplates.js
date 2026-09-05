import { env } from "../env.js";

// Layout único e simples (inline CSS — e-mail não pode depender de stylesheet externo). Cores
// tiradas do tema real do app (`src/index.css` no front: --primary é o rosa da logo, --brand-navy
// o cabeçalho escuro) em vez de uma cor genérica, pra parecer que veio do Fantasy 2 Hub mesmo.
function layout({ heading, bodyHtml, ctaText, ctaUrl }) {
  const cta = ctaText && ctaUrl
    ? `<tr><td style="padding:24px 0 0">
        <a href="${ctaUrl}" style="background:#ec1349;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;display:inline-block">${ctaText}</a>
      </td></tr>`
    : "";

  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
            <tr>
              <td style="background:#01323c;padding:16px 32px;border-top:3px solid #ec1349">
                <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                  <td style="padding-right:10px"><img src="${frontUrl("/logo.png")}" width="32" height="32" alt="" style="border-radius:999px;display:block"/></td>
                  <td style="color:#ffad33;font-size:18px;font-weight:700">Fantasy 2 Hub</td>
                </tr></table>
              </td>
            </tr>
            <tr>
              <td style="padding:32px">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr><td style="font-size:18px;font-weight:700;color:#18181b;padding-bottom:12px">${heading}</td></tr>
                  <tr><td style="font-size:15px;line-height:1.6;color:#3f3f46">${bodyHtml}</td></tr>
                  ${cta}
                </table>
              </td>
            </tr>
          </table>
          <p style="font-size:12px;color:#a1a1aa;margin-top:16px">Hub do condomínio Fantasy 2</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

const frontUrl = (path = "") => `${env.CORS_ORIGIN}${path}`;

export function passwordResetEmail({ name, newPassword }) {
  return {
    subject: "Sua senha foi redefinida",
    html: layout({
      heading: `Olá, ${name}`,
      bodyHtml:
        "A administração redefiniu sua senha de acesso ao Fantasy 2 Hub. Sua senha temporária é:<br/><br/>" +
        `<span style="font-family:monospace;font-size:18px;font-weight:700;background:#f4f4f5;padding:8px 12px;border-radius:6px;display:inline-block">${newPassword}</span>` +
        "<br/><br/>Use-a para entrar no app. Se não foi você quem pediu essa redefinição, procure a administração do condomínio.",
      ctaText: "Acessar o Fantasy 2 Hub",
      ctaUrl: frontUrl("/"),
    }),
  };
}
