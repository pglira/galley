import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useMemo, useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  // Called on Ctrl Enter (Cmd Enter on macOS).
  onSubmit?: () => void;
}

// Colors of the Markdown syntax. They use the color tokens of the app, so
// the editor follows the dark chrome.
const highlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--primary)", fontWeight: "600" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--primary)", textDecoration: "underline" },
  { tag: t.monospace, color: "oklch(0.8 0.1 75)" },
  { tag: t.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.processingInstruction, t.contentSeparator, t.meta], color: "var(--primary)" },
  { tag: t.comment, color: "var(--muted-foreground)", fontStyle: "italic" },
]);

const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "var(--background)",
      color: "var(--foreground)",
      fontSize: "0.75rem",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "1.625" },
    ".cm-content": { padding: "0.5rem", caretColor: "var(--foreground)" },
    ".cm-line": { padding: "0" },
    ".cm-cursor": { borderLeftColor: "var(--foreground)" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in oklch, var(--primary) 35%, transparent)",
    },
  },
  { dark: true },
);

// A plain text editor for Markdown with syntax colors (CodeMirror).
export function MarkdownEditor({ value, onChange, disabled, onSubmit }: Props) {
  // The keymap reads the latest callback through a ref, so the extensions
  // stay the same across renders.
  const submit = useRef(onSubmit);
  submit.current = onSubmit;

  const extensions = useMemo(
    () => [
      markdown(),
      syntaxHighlighting(highlight),
      theme,
      EditorView.lineWrapping,
      Prec.highest(
        keymap.of([
          {
            key: "Mod-Enter",
            run: () => {
              submit.current?.();
              return true;
            },
          },
        ]),
      ),
    ],
    [],
  );

  return (
    <CodeMirror
      className="min-h-0 flex-1 overflow-hidden border focus-within:border-ring"
      height="100%"
      theme="none"
      value={value}
      onChange={onChange}
      editable={!disabled}
      extensions={extensions}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
        autocompletion: false,
        bracketMatching: false,
        closeBrackets: false,
        searchKeymap: true,
      }}
    />
  );
}
