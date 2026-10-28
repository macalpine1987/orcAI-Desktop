import type { ReactNode } from "react";
import type { MdBlock, MdInline } from "../../lib/helpMarkdown";
import { parseMarkdown } from "../../lib/helpMarkdown";
import { openExternalUrl } from "../../platform/openUrl";

function Inlines({ nodes }: { nodes: MdInline[] }) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.kind === "text") return <span key={i}>{node.text}</span>;
        if (node.kind === "code") return <code key={i}>{node.text}</code>;
        if (node.kind === "strong")
          return (
            <strong key={i}>
              <Inlines nodes={node.children} />
            </strong>
          );
        if (node.kind === "em")
          return (
            <em key={i}>
              <Inlines nodes={node.children} />
            </em>
          );
        return (
          <a
            key={i}
            href={node.href}
            onClick={(e) => {
              e.preventDefault();
              void openExternalUrl(node.href);
            }}
          >
            <Inlines nodes={node.children} />
          </a>
        );
      })}
    </>
  );
}

function Block({ block }: { block: MdBlock }) {
  if (block.type === "h1") return <h1 id={block.id}>{block.text}</h1>;
  if (block.type === "h2") return <h2 id={block.id}>{block.text}</h2>;
  if (block.type === "h3") return <h3 id={block.id}>{block.text}</h3>;
  if (block.type === "p")
    return (
      <p>
        <Inlines nodes={block.inlines} />
      </p>
    );
  if (block.type === "ul")
    return (
      <ul>
        {block.items.map((item, i) => (
          <li key={i}>
            <Inlines nodes={item} />
          </li>
        ))}
      </ul>
    );
  if (block.type === "ol")
    return (
      <ol>
        {block.items.map((item, i) => (
          <li key={i}>
            <Inlines nodes={item} />
          </li>
        ))}
      </ol>
    );
  if (block.type !== "table") return null;
  return (
    <div className="help-md-table-wrap">
      <table className="help-md-table">
        <thead>
          <tr>
            {block.headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell.replace(/^`|`$/g, "")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HelpMarkdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const blocks = parseMarkdown(source);
  return (
    <div className={["help-md", className].filter(Boolean).join(" ")}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  );
}

export function HelpExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (href.startsWith("mailto:")) return;
        e.preventDefault();
        void openExternalUrl(href);
      }}
    >
      {children}
    </a>
  );
}
