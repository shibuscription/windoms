import { Fragment } from "react";

const URL_PATTERN = /(https?:\/\/[^\s]+)/g;
const isUrl = (value: string): boolean => /^https?:\/\/[^\s]+$/.test(value);

type LinkifiedTextProps = {
  text: string;
  className?: string;
};

export function LinkifiedText({ text, className }: LinkifiedTextProps) {
  const lines = text.split(/\r?\n/);

  return (
    <span className={className}>
      {lines.map((line, lineIndex) => (
        <Fragment key={`${lineIndex}-${line}`}>
          {line.split(URL_PATTERN).map((part, partIndex) =>
            isUrl(part) ? (
              <a
                key={`${lineIndex}-${partIndex}-${part}`}
                href={part}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                {part}
              </a>
            ) : (
              <Fragment key={`${lineIndex}-${partIndex}-${part}`}>{part}</Fragment>
            ),
          )}
          {lineIndex < lines.length - 1 && <br />}
        </Fragment>
      ))}
    </span>
  );
}
