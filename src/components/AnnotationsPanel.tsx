import { useEffect, useRef } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/lib/annotations";

// An annotation in edit. `index` is null for a new annotation.
export interface Draft {
  index: number | null;
  quote: string;
  context?: string;
  image?: string;
  checked?: boolean;
  answer?: boolean;
  comment: string;
}

interface Props {
  enabled: boolean;
  annotations: Annotation[];
  active: number | null;
  onActivate: (index: number) => void;
  draft: Draft | null;
  onDraft: (draft: Draft | null) => void;
  onSave: (draft: Draft) => void;
  onDelete: (index: number) => void;
  // The URL of an image path of the document.
  imageUrl: (path: string) => string;
}

function Quote({ text }: { text: string }) {
  return (
    <blockquote className="mb-1.5 line-clamp-4 border-l-2 border-primary/60 pl-2 text-xs whitespace-pre-line text-muted-foreground italic">
      {text}
    </blockquote>
  );
}

function ImageRef({ path, url }: { path: string; url: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 border-l-2 border-primary/60 pl-2">
      <img src={url} alt="" className="h-10 max-w-16 rounded object-contain" />
      <span className="truncate text-xs text-muted-foreground" title={path}>
        {path}
      </span>
    </div>
  );
}

function ChoiceRef({ text, question, checked }: { text: string; question?: string; checked: boolean }) {
  return (
    <div className="mb-1.5 border-l-2 border-primary/60 pl-2 text-xs text-muted-foreground">
      {question && <p className="line-clamp-2 italic">{question}</p>}
      <p className="flex items-start gap-1.5">
        <input type="checkbox" checked={checked} readOnly tabIndex={-1} className="pointer-events-none mt-0.5 accent-primary" />
        <span className="line-clamp-3">{text}</span>
      </p>
    </div>
  );
}

function QuestionRef({ question }: { question: string }) {
  return (
    <div className="mb-1.5 border-l-2 border-primary/60 pl-2 text-xs text-muted-foreground">
      <p className="line-clamp-3 italic">{question}</p>
    </div>
  );
}

function Editor({
  draft,
  onDraft,
  onSave,
  imageUrl,
}: Pick<Props, "onDraft" | "onSave" | "imageUrl"> & { draft: Draft }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);
  // A checkbox annotation can have no comment.
  const canSave = draft.checked !== undefined || !!draft.comment.trim();
  const save = () => canSave && onSave(draft);
  return (
    <div className="rounded-md border border-primary/60 bg-card p-2">
      {draft.answer ? (
        <QuestionRef question={draft.quote} />
      ) : draft.checked !== undefined ? (
        <ChoiceRef text={draft.quote} question={draft.context} checked={draft.checked} />
      ) : draft.image ? (
        <ImageRef path={draft.image} url={imageUrl(draft.image)} />
      ) : draft.quote ? (
        <Quote text={draft.quote} />
      ) : (
        <p className="mb-1.5 text-xs text-muted-foreground">General comment</p>
      )}
      <textarea
        ref={ref}
        className="min-h-20 w-full resize-y rounded border bg-background p-1.5 text-sm outline-none focus:border-ring"
        placeholder={draft.answer ? "Answer" : "Comment"}
        value={draft.comment}
        onChange={(e) => onDraft({ ...draft, comment: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
          if (e.key === "Escape") onDraft(null);
        }}
      />
      <div className="mt-1.5 flex justify-end gap-1">
        <Button size="xs" variant="ghost" onClick={() => onDraft(null)}>
          Cancel
        </Button>
        <Button size="xs" disabled={!canSave} onClick={save} title="Save (Ctrl+Enter)">
          Save
        </Button>
      </div>
    </div>
  );
}

export function AnnotationsPanel({
  enabled,
  annotations,
  active,
  onActivate,
  draft,
  onDraft,
  onSave,
  onDelete,
  imageUrl,
}: Props) {
  const activeRef = useRef<HTMLDivElement>(null);
  useEffect(() => activeRef.current?.scrollIntoView({ block: "nearest" }), [active]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-3">
        <span className="text-xs font-semibold tracking-wide uppercase">Annotations</span>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={!enabled}
          title="Add a general comment (Ctrl Shift M)"
          onClick={() => onDraft({ index: null, quote: "", comment: "" })}
        >
          <Plus />
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
        {enabled && annotations.length === 0 && !draft && (
          <p className="p-1 text-xs text-muted-foreground">Select text in the document to annotate it (Ctrl M). Open an image to comment on it. Click a checkbox or fill a text field to answer a question.</p>
        )}
        {annotations.map((a, i) =>
          draft?.index === i ? (
            <Editor key={i} draft={draft} onDraft={onDraft} onSave={onSave} imageUrl={imageUrl} />
          ) : (
            <div
              key={i}
              ref={i === active ? activeRef : undefined}
              className={cn(
                "group cursor-pointer rounded-md border p-2 hover:bg-muted/50",
                i === active && "border-primary/60 bg-muted/50"
              )}
              onClick={() => onActivate(i)}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-primary">{i + 1}</span>
                <div className="flex opacity-0 group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDraft({ index: i, quote: a.quote, context: a.context, image: a.image, checked: a.checked, answer: a.answer, comment: a.comment });
                    }}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(i);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {a.answer ? (
                <QuestionRef question={a.quote} />
              ) : a.checked !== undefined ? (
                <ChoiceRef text={a.quote} question={a.context} checked={a.checked} />
              ) : a.image ? (
                <ImageRef path={a.image} url={imageUrl(a.image)} />
              ) : (
                a.quote && <Quote text={a.quote} />
              )}
              {a.comment && <p className="text-sm whitespace-pre-wrap">{a.comment}</p>}
            </div>
          )
        )}
        {draft && draft.index === null && (
          <Editor draft={draft} onDraft={onDraft} onSave={onSave} imageUrl={imageUrl} />
        )}
      </div>
    </div>
  );
}
