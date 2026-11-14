"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import katex from "katex";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Highlighter,
  Subscript,
  Superscript,
  ListOrdered,
  List,
  Code,
  Quote,
  Minus,
  Sigma,
  ImagePlus,
  Maximize,
  Minimize,
  Pencil,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { renderRichText } from "@/lib/rich-text";
import { hasRichTextContent, sanitizeRichText } from "@/lib/sanitize";
import { cn } from "@/lib/utils";
import { richTextExtensions } from "./rich-text-extensions";

export type QuizImageUploader = (file: File) => Promise<{ url: string; path: string }>;

export interface RichTextEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clickToEdit?: boolean;
  uploadImage?: QuizImageUploader;
}

/** One editor for quiz details, questions, options, explanations and passages. */
export function RichTextEditor({
  id,
  label,
  value,
  onChange,
  placeholder = "Click to edit",
  clickToEdit = true,
  uploadImage,
}: RichTextEditorProps) {
  const [editing, setEditing] = useState(!clickToEdit);
  const [fullscreen, setFullscreen] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);
  const [formula, setFormula] = useState("");
  const [mathTarget, setMathTarget] = useState<{
    kind: "inline" | "block";
    position: number;
  } | null>(null);
  const [blockMath, setBlockMath] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const extensions = useMemo(
    () =>
      richTextExtensions((kind, latex, position) => {
        setFormula(latex);
        setMathTarget({ kind, position });
        setBlockMath(kind === "block");
        setMathOpen(true);
      }),
    [],
  );
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    content: sanitizeRichText(value),
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class: "dos-rich-text min-h-32 p-3 text-base focus:outline-none",
      },
      transformPastedHTML: sanitizeRichText,
    },
    onUpdate: ({ editor: updated }) => onChange(sanitizeRichText(updated.getHTML())),
  });
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      Object.fromEntries<boolean>(
        [
          "bold",
          "italic",
          "underline",
          "strike",
          "highlight",
          "subscript",
          "superscript",
          "orderedList",
          "bulletList",
          "code",
          "blockquote",
        ].map((mark) => [mark, current?.isActive(mark) ?? false] as const),
      ),
  });
  // External resets/load/save updates are document changes, not server-state fetches.
  useEffect(() => {
    if (editor && sanitizeRichText(editor.getHTML()) !== sanitizeRichText(value))
      editor.commands.setContent(sanitizeRichText(value), { emitUpdate: false });
  }, [editor, value]);

  function insertMath() {
    if (!editor || !formula.trim()) return;
    try {
      katex.renderToString(formula, {
        throwOnError: true,
        trust: false,
        maxSize: 20,
        maxExpand: 1000,
      });
      if (mathTarget?.kind === "inline")
        editor
          .chain()
          .focus()
          .updateInlineMath({ pos: mathTarget.position, latex: formula })
          .run();
      else if (mathTarget?.kind === "block")
        editor
          .chain()
          .focus()
          .updateBlockMath({ pos: mathTarget.position, latex: formula })
          .run();
      else if (blockMath)
        editor.chain().focus().insertBlockMath({ latex: formula }).run();
      else editor.chain().focus().insertInlineMath({ latex: formula }).run();
      setError(null);
      setMathOpen(false);
    } catch {
      setError("Check the LaTeX syntax before inserting this equation.");
    }
  }

  async function insertImage(file: File) {
    if (!editor || !uploadImage) return;
    setUploading(true);
    setError(null);
    try {
      const image = await uploadImage(file);
      editor
        .chain()
        .focus()
        .insertContent({
          type: "image",
          attrs: { src: image.url, storagePath: image.path, alt: file.name },
        })
        .run();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not upload the image. Try again.",
      );
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  const actions: { label: string; icon: LucideIcon; mark?: string; run: () => void }[] = [
    {
      label: "Bold",
      icon: Bold,
      mark: "bold",
      run: () => {
        editor?.chain().focus().toggleBold().run();
      },
    },
    {
      label: "Italic",
      icon: Italic,
      mark: "italic",
      run: () => {
        editor?.chain().focus().toggleItalic().run();
      },
    },
    {
      label: "Underline",
      icon: Underline,
      mark: "underline",
      run: () => {
        editor?.chain().focus().toggleUnderline().run();
      },
    },
    {
      label: "Strikethrough",
      icon: Strikethrough,
      mark: "strike",
      run: () => {
        editor?.chain().focus().toggleStrike().run();
      },
    },
    {
      label: "Highlight",
      icon: Highlighter,
      mark: "highlight",
      run: () => {
        editor?.chain().focus().toggleHighlight().run();
      },
    },
    {
      label: "Subscript",
      icon: Subscript,
      mark: "subscript",
      run: () => {
        editor?.chain().focus().toggleSubscript().run();
      },
    },
    {
      label: "Superscript",
      icon: Superscript,
      mark: "superscript",
      run: () => {
        editor?.chain().focus().toggleSuperscript().run();
      },
    },
    {
      label: "Numbered list",
      icon: ListOrdered,
      mark: "orderedList",
      run: () => {
        editor?.chain().focus().toggleOrderedList().run();
      },
    },
    {
      label: "Bullet list",
      icon: List,
      mark: "bulletList",
      run: () => {
        editor?.chain().focus().toggleBulletList().run();
      },
    },
    {
      label: "Code",
      icon: Code,
      mark: "code",
      run: () => {
        editor?.chain().focus().toggleCode().run();
      },
    },
    {
      label: "Blockquote",
      icon: Quote,
      mark: "blockquote",
      run: () => {
        editor?.chain().focus().toggleBlockquote().run();
      },
    },
    {
      label: "Horizontal rule",
      icon: Minus,
      run: () => {
        editor?.chain().focus().setHorizontalRule().run();
      },
    },
    {
      label: "Insert equation",
      icon: Sigma,
      run: () => {
        setFormula("");
        setMathTarget(null);
        setBlockMath(false);
        setError(null);
        setMathOpen(true);
      },
    },
  ];
  const content = (expanded: boolean) => (
    <div
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border bg-background text-foreground focus-within:ring-2 focus-within:ring-ring/50",
        expanded && "flex min-h-0 flex-1 flex-col",
      )}
    >
      <div
        role="group"
        aria-label={`${label} formatting`}
        className="flex flex-wrap gap-1 border-b bg-muted p-1"
      >
        {actions.map(({ label: actionLabel, icon: Icon, mark, run }) => (
          <Button
            key={actionLabel}
            type="button"
            variant="ghost"
            className="size-11 shrink-0 p-0"
            aria-label={actionLabel}
            title={actionLabel}
            aria-pressed={mark ? active?.[mark] : undefined}
            disabled={!editor}
            onMouseDown={(event) => event.preventDefault()}
            onClick={run}
          >
            <Icon className="size-4" aria-hidden="true" />
          </Button>
        ))}
        <Button
          type="button"
          variant="ghost"
          className="size-11 p-0"
          aria-label="Insert image"
          title="Insert image"
          disabled={!uploadImage || uploading || !editor}
          onClick={() => imageInput.current?.click()}
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <ImagePlus className="size-4" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="size-11 p-0"
          aria-label={expanded ? "Exit fullscreen" : "Edit in fullscreen"}
          onClick={() => setFullscreen(!expanded)}
        >
          {expanded ? <Minimize className="size-4" /> : <Maximize className="size-4" />}
        </Button>
      </div>
      <input
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        aria-label="Choose an image"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void insertImage(file);
        }}
      />
      <EditorContent
        editor={editor}
        className={cn("min-w-0", expanded && "min-h-0 flex-1 overflow-y-auto")}
      />
      {error && !mathOpen && (
        <p role="alert" className="px-3 pb-3 text-base text-destructive">
          {error}
        </p>
      )}
      {clickToEdit && !expanded && (
        <div className="border-t p-1">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11"
            onClick={() => setEditing(false)}
          >
            Done editing
          </Button>
        </div>
      )}
    </div>
  );
  const hasContent = hasRichTextContent(value);
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={editing ? id : `${id}-edit`}>{label}</Label>
      {!fullscreen &&
        (editing ? (
          content(false)
        ) : (
          <Button
            id={`${id}-edit`}
            type="button"
            variant="outline"
            className="h-auto min-h-24 w-full justify-start whitespace-normal p-3 text-left text-base"
            aria-label={`Edit ${label}`}
            onClick={() => setEditing(true)}
          >
            {hasContent ? (
              <span
                className="dos-rich-text block min-w-0"
                dangerouslySetInnerHTML={{ __html: renderRichText(value) }}
              />
            ) : (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <Pencil className="size-4" />
                {placeholder}
              </span>
            )}
          </Button>
        ))}
      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="flex h-[90dvh] w-[calc(100%-2rem)] max-w-5xl flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              Edit your content with room for equations and images.
            </DialogDescription>
          </DialogHeader>
          {fullscreen && content(true)}
        </DialogContent>
      </Dialog>
      <Dialog open={mathOpen} onOpenChange={setMathOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{mathTarget ? "Edit equation" : "Insert equation"}</DialogTitle>
            <DialogDescription>
              Enter LaTeX, for example \frac&#123;1&#125;&#123;2&#125; or E = mc^2.
            </DialogDescription>
          </DialogHeader>
          <Label htmlFor={`${id}-latex`}>LaTeX equation</Label>
          <Textarea
            id={`${id}-latex`}
            value={formula}
            maxLength={2048}
            className="min-h-24 text-base font-mono"
            onChange={(event) => {
              setFormula(event.target.value);
              setError(null);
            }}
          />
          {!mathTarget && (
            <div className="flex gap-2">
              <Button
                type="button"
                variant={blockMath ? "outline" : "default"}
                className="min-h-11"
                aria-pressed={!blockMath}
                onClick={() => setBlockMath(false)}
              >
                Inline
              </Button>
              <Button
                type="button"
                variant={blockMath ? "default" : "outline"}
                className="min-h-11"
                aria-pressed={blockMath}
                onClick={() => setBlockMath(true)}
              >
                Separate line
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-base text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              className="min-h-11"
              disabled={!formula.trim()}
              onClick={insertMath}
            >
              {mathTarget ? "Update equation" : "Insert equation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
