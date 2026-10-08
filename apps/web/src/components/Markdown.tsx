import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  escapeRawHtml,
  isInternalPath,
  sanitizeUrl,
  urlTransform,
} from "../lib/markdown";
import "./Markdown.css";

type Props = {
  source: string;
  /** When set, task checkboxes are interactive. */
  onToggleTask?: ((offset: number) => void) | undefined;
  readOnly?: boolean | undefined;
  className?: string | undefined;
};

export function Markdown({
  source,
  onToggleTask,
  readOnly = false,
  className,
}: Props) {
  // Escape raw HTML so it appears as literal text (skipHtml would otherwise drop it).
  const safeSource = escapeRawHtml(source);
  const components: Components = {
    h1: ({ children }) => <h3 className="md-h1">{children}</h3>,
    h2: ({ children }) => <h4 className="md-h2">{children}</h4>,
    h3: ({ children }) => <h5 className="md-h3">{children}</h5>,
    h4: ({ children }) => <h5 className="md-h3">{children}</h5>,
    h5: ({ children }) => <h5 className="md-h3">{children}</h5>,
    h6: ({ children }) => <h5 className="md-h3">{children}</h5>,
    p: ({ children }) => <p className="md-p">{children}</p>,
    blockquote: ({ children }) => (
      <blockquote className="md-quote">{children}</blockquote>
    ),
    hr: () => <hr className="md-hr" />,
    code: ({ className: codeClass, children, ...rest }) => {
      const text = String(children);
      const isBlock = Boolean(codeClass) || text.includes("\n");
      if (!isBlock) {
        return (
          <code className="md-inline-code" {...rest}>
            {children}
          </code>
        );
      }
      return (
        <code className={codeClass} {...rest}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => {
      let lang: string | undefined;
      const child = Array.isArray(children) ? children[0] : children;
      if (
        child &&
        typeof child === "object" &&
        "props" in child &&
        child.props &&
        typeof child.props === "object" &&
        "className" in child.props
      ) {
        const cn = String(
          (child.props as { className?: string }).className ?? "",
        );
        lang = /language-([\w-]+)/.exec(cn)?.[1];
      }
      return (
        <pre className="md-pre" tabIndex={0}>
          {lang ? <span className="md-lang">{lang}</span> : null}
          {children}
        </pre>
      );
    },
    a: ({ href, children }) => {
      const safe = href ? urlTransform(href) : "";
      if (!safe) {
        return <span>{children}</span>;
      }
      if (isInternalPath(safe)) {
        return (
          <a className="md-a" href={safe}>
            {children}
          </a>
        );
      }
      return (
        <a
          className="md-a md-a-ext"
          href={safe}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
          <span className="md-ext" aria-hidden>
            ↗
          </span>
          <span className="sr-only">(se abre en otra pestaña)</span>
        </a>
      );
    },
    img: ({ alt, src }) => {
      const label = alt?.trim()
        ? `Imagen: ${alt.trim()}`
        : "Imagen sin descripción";
      const safe = src ? sanitizeUrl(src) : "";
      if (safe && !isInternalPath(safe)) {
        return (
          <a
            className="md-img-fallback"
            href={safe}
            target="_blank"
            rel="noopener noreferrer"
          >
            {label}
            <span className="md-ext" aria-hidden>
              ↗
            </span>
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        );
      }
      if (safe) {
        return (
          <a className="md-img-fallback" href={safe}>
            {label}
          </a>
        );
      }
      return <span className="md-img-fallback">{label}</span>;
    },
    table: ({ children }) => (
      <div className="md-table-wrap">
        <table className="md-table">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th scope="col" className="md-th">
        {children}
      </th>
    ),
    td: ({ children }) => <td className="md-td">{children}</td>,
    ul: ({ children }) => <ul className="md-ul">{children}</ul>,
    ol: ({ children }) => <ol className="md-ol">{children}</ol>,
    li: ({ children, node, ...rest }) => {
      const checked = (rest as { checked?: boolean | null }).checked;
      if (typeof checked === "boolean") {
        const offset = node?.position?.start?.offset ?? 0;
        const disabled = readOnly || !onToggleTask;
        const { checked: _c, ...liRest } = rest as {
          checked?: boolean | null;
        } & typeof rest;
        void _c;
        return (
          <li className={`md-task${checked ? " is-done" : ""}`} {...liRest}>
            <label className="md-task-label">
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => {
                  if (!disabled) onToggleTask?.(offset);
                }}
              />
              <span>{children}</span>
            </label>
          </li>
        );
      }
      return (
        <li className="md-li" {...rest}>
          {children}
        </li>
      );
    },
    // Suppress default GFM checkbox; we render native inputs in `li`.
    input: ({ type, ...props }) => {
      if (type === "checkbox") return null;
      return <input type={type} {...props} />;
    },
  };

  return (
    <div className={`markdown${className ? ` ${className}` : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={urlTransform}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
