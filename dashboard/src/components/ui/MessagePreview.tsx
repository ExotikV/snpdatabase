"use client";

import { useState } from "react";
import { Button } from "./Button";

type SmsPreviewCellProps = {
  text: string;
  maxLength?: number;
};

export function SmsPreviewCell({ text, maxLength = 120 }: SmsPreviewCellProps) {
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > maxLength;
  const displayText = expanded || !truncated ? text : `${text.slice(0, maxLength).trim()}…`;

  return (
    <div className="max-w-xs sm:max-w-sm">
      <p
        className="rounded-lg bg-muted-bg px-3 py-2 text-xs leading-relaxed text-muted"
        title={truncated && !expanded ? text : undefined}
      >
        {displayText}
      </p>
      {truncated ? (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 px-0 text-xs text-accent hover:bg-transparent"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Show less" : "Show full message"}
        </Button>
      ) : null}
    </div>
  );
}

type VariableChipsProps = {
  variables: { key: string; description?: string }[];
  onInsert: (key: string) => void;
};

export function VariableChips({ variables, onInsert }: VariableChipsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {variables.map((variable) => (
        <button
          key={variable.key}
          type="button"
          title={variable.description}
          onClick={() => onInsert(variable.key)}
          className="rounded-full border border-border-strong bg-surface px-3 py-1 font-mono text-xs text-foreground transition-colors hover:border-accent hover:bg-accent-muted"
        >
          {`{${variable.key}}`}
        </button>
      ))}
    </div>
  );
}

type MessagePreviewProps = {
  label?: string;
  text: string;
};

export function MessagePreview({ label = "Preview", text }: MessagePreviewProps) {
  return (
    <div className="rounded-lg border border-dashed border-border-strong bg-muted-bg/60 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{text}</p>
    </div>
  );
}
