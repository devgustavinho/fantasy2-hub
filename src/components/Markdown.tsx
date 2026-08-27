import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

// Sem plugin de tipografia do Tailwind no projeto — estiliza os elementos markdown mais comuns
// na mão em vez de puxar uma dependência só pra isso.
const components: Components = {
  h1: ({ ...props }) => <h1 className="mb-2 mt-4 text-xl font-semibold first:mt-0" {...props} />,
  h2: ({ ...props }) => <h2 className="mb-2 mt-4 text-lg font-semibold first:mt-0" {...props} />,
  h3: ({ ...props }) => <h3 className="mb-1.5 mt-3 text-base font-semibold first:mt-0" {...props} />,
  p: ({ ...props }) => <p className="mb-2 text-sm leading-relaxed last:mb-0" {...props} />,
  ul: ({ ...props }) => <ul className="mb-2 list-disc space-y-1 pl-5 text-sm last:mb-0" {...props} />,
  ol: ({ ...props }) => <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm last:mb-0" {...props} />,
  a: ({ ...props }) => <a className="text-primary underline" target="_blank" rel="noreferrer" {...props} />,
  img: ({ ...props }) => <img className="my-2 max-w-full rounded-md" {...props} />,
  code: ({ ...props }) => <code className="rounded bg-muted px-1 py-0.5 text-xs" {...props} />,
  blockquote: ({ ...props }) => (
    <blockquote className="my-2 border-l-2 border-muted-foreground/30 pl-3 text-sm italic text-muted-foreground" {...props} />
  ),
  table: ({ ...props }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: ({ ...props }) => <th className="border-b p-1.5 text-left font-medium" {...props} />,
  td: ({ ...props }) => <td className="border-b p-1.5" {...props} />,
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
