"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function ChatMarkdown({
  content,
  variant,
}: {
  content: string;
  variant: "assistant" | "user";
}) {
  return (
    <div className={`chat-markdown chat-markdown--${variant}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3 className="chat-markdown__h">{children}</h3>,
          h2: ({ children }) => <h3 className="chat-markdown__h">{children}</h3>,
          h3: ({ children }) => <h4 className="chat-markdown__subh">{children}</h4>,
          p: ({ children }) => <p className="chat-markdown__p">{children}</p>,
          ul: ({ children }) => <ul className="chat-markdown__ul">{children}</ul>,
          ol: ({ children }) => <ol className="chat-markdown__ol">{children}</ol>,
          li: ({ children }) => <li className="chat-markdown__li">{children}</li>,
          strong: ({ children }) => <strong className="chat-markdown__strong">{children}</strong>,
          code: ({ className, children }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return <code className="chat-markdown__code chat-markdown__code--block">{children}</code>;
            }
            return <code className="chat-markdown__code">{children}</code>;
          },
          pre: ({ children }) => <pre className="chat-markdown__pre">{children}</pre>,
          table: ({ children }) => <table className="chat-markdown__table">{children}</table>,
          thead: ({ children }) => <thead>{children}</thead>,
          tbody: ({ children }) => <tbody>{children}</tbody>,
          tr: ({ children }) => <tr>{children}</tr>,
          th: ({ children }) => <th>{children}</th>,
          td: ({ children }) => <td>{children}</td>,
          hr: () => <hr className="chat-markdown__hr" />,
          blockquote: ({ children }) => <blockquote className="chat-markdown__bq">{children}</blockquote>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
