import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Sem plugin de tipografia do Tailwind no projeto — estiliza os elementos markdown mais comuns
// na mão em vez de puxar uma dependência só pra isso. `lg` é a página pública (celular no
// elevador); o restante do app continua no tamanho compacto.
function componentsFor(size: "sm" | "lg"): Components {
  const text = size === "lg" ? "text-base" : "text-sm";
  const h1 = size === "lg" ? "text-2xl" : "text-xl";
  const h2 = size === "lg" ? "text-xl" : "text-lg";
  const h3 = size === "lg" ? "text-lg" : "text-base";

  return {
    h1: ({ ...props }) => <h1 className={`mb-3 mt-6 font-semibold first:mt-0 ${h1}`} {...props} />,
    h2: ({ ...props }) => <h2 className={`mb-2 mt-5 font-semibold first:mt-0 ${h2}`} {...props} />,
    h3: ({ ...props }) => <h3 className={`mb-1.5 mt-4 font-semibold first:mt-0 ${h3}`} {...props} />,
    p: ({ ...props }) => <p className={`mb-3 leading-relaxed last:mb-0 ${text}`} {...props} />,
    ul: ({ ...props }) => <ul className={`mb-3 list-disc space-y-1.5 pl-5 last:mb-0 ${text}`} {...props} />,
    ol: ({ ...props }) => <ol className={`mb-3 list-decimal space-y-1.5 pl-5 last:mb-0 ${text}`} {...props} />,
    a: ({ ...props }) => <a className="text-primary underline" target="_blank" rel="noreferrer" {...props} />,
    img: ({ ...props }) => <img className="my-3 max-w-full rounded-md" {...props} />,
    code: ({ ...props }) => <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props} />,
    blockquote: ({ ...props }) => (
      <blockquote className={`my-3 border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground ${text}`} {...props} />
    ),
    table: ({ ...props }) => (
      <div className="my-3 overflow-x-auto">
        <table className={`w-full border-collapse ${text}`} {...props} />
      </div>
    ),
    th: ({ ...props }) => <th className="border-b p-1.5 text-left font-medium" {...props} />,
    td: ({ ...props }) => <td className="border-b p-1.5" {...props} />,
  };
}

export function Markdown({ children, size = "sm" }: { children: string; size?: "sm" | "lg" }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentsFor(size)}>
      {children}
    </ReactMarkdown>
  );
}
