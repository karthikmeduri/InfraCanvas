import { Fragment, type ReactNode } from "react";
import type { GeneratedFile } from "./types";

/**
 * Tiny HCL tokenizer for the code viewer.
 *
 * A full parser would be overkill: the goal is legible colour, and the input is
 * always output from our own emitter. Order matters — comments and strings are
 * matched first so keywords inside them are left alone.
 */
const RULES: { className: string; pattern: RegExp }[] = [
  { className: "tok-comment", pattern: /^#.*/ },
  { className: "tok-string", pattern: /^"(?:[^"\\]|\\.)*"/ },
  { className: "tok-heredoc", pattern: /^<<-?[A-Z]+/ },
  {
    className: "tok-keyword",
    pattern: /^\b(?:resource|data|variable|output|locals|module|provider|terraform|required_providers|required_version|backend|dynamic|for_each|count|depends_on|lifecycle|validation|sensitive|description|type|default)\b/,
  },
  {
    className: "tok-function",
    pattern: /^\b(?:jsonencode|merge|try|element|toset|tolist|length|contains|filebase64sha256|coalesce|lookup|format|join|replace|cidrsubnet)\b(?=\()/,
  },
  { className: "tok-type", pattern: /^\b(?:string|number|bool|list|map|set|object|any|tuple)\b/ },
  { className: "tok-literal", pattern: /^\b(?:true|false|null)\b/ },
  { className: "tok-number", pattern: /^\b\d+(?:\.\d+)?\b/ },
  { className: "tok-ref", pattern: /^\b(?:var|local|each|data)\.[A-Za-z0-9_.[\]*]+/ },
  { className: "tok-operator", pattern: /^[=<>!+\-*/%?:&|]+/ },
  { className: "tok-punct", pattern: /^[{}[\](),.]/ },
];

const TYPESCRIPT_RULES: { className: string; pattern: RegExp }[] = [
  { className: "tok-comment", pattern: /^\/\/.*/ },
  { className: "tok-comment", pattern: /^\/\*[\s\S]*?\*\// },
  { className: "tok-string", pattern: /^(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/ },
  {
    className: "tok-keyword",
    pattern: /^\b(?:import|from|export|const|let|function|return|if|else|new|async|await|throw|type|interface|extends|process)\b/,
  },
  { className: "tok-type", pattern: /^\b(?:string|number|boolean|unknown|Record|Promise)\b/ },
  { className: "tok-literal", pattern: /^\b(?:true|false|null|undefined)\b/ },
  { className: "tok-number", pattern: /^\b\d+(?:\.\d+)?\b/ },
  { className: "tok-operator", pattern: /^(?:=>|\?\?|===|!==|&&|\|\||[=<>!+\-*/%?:&|]+)/ },
  { className: "tok-punct", pattern: /^[{}[\](),.;]/ },
];

function tokenizeLine(
  line: string,
  keyPrefix: string,
  rules: { className: string; pattern: RegExp }[] = RULES,
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let rest = line;
  let plain = "";
  let index = 0;

  const flushPlain = () => {
    if (!plain) return;
    nodes.push(<Fragment key={`${keyPrefix}-p${index++}`}>{plain}</Fragment>);
    plain = "";
  };

  while (rest.length > 0) {
    const leadingSpace = /^\s+/.exec(rest);
    if (leadingSpace) {
      plain += leadingSpace[0];
      rest = rest.slice(leadingSpace[0].length);
      continue;
    }

    const rule = rules.find((candidate) => candidate.pattern.test(rest));
    if (!rule) {
      const word = /^[A-Za-z0-9_-]+|^./.exec(rest)![0];
      plain += word;
      rest = rest.slice(word.length);
      continue;
    }

    const matched = rule.pattern.exec(rest)![0];
    flushPlain();
    nodes.push(
      <span className={rule.className} key={`${keyPrefix}-t${index++}`}>
        {matched}
      </span>,
    );
    rest = rest.slice(matched.length);
  }

  flushPlain();
  return nodes;
}

export function HighlightedCode({
  contents,
  language,
}: {
  contents: string;
  language: GeneratedFile["language"];
}) {
  const lines = contents.split("\n");

  return (
    <code className={`code-body lang-${language}`}>
      {lines.map((line, lineIndex) => (
        <span className="code-line" key={`${lineIndex}-${line.slice(0, 12)}`}>
          <b aria-hidden="true">{lineIndex + 1}</b>
          <em>
            {language === "hcl"
              ? tokenizeLine(line, `l${lineIndex}`)
              : language === "typescript" || language === "javascript"
                ? tokenizeLine(line, `l${lineIndex}`, TYPESCRIPT_RULES)
                : line || " "}
            {(language === "hcl" || language === "typescript" || language === "javascript") &&
            line.length === 0
              ? " "
              : null}
          </em>
        </span>
      ))}
    </code>
  );
}
