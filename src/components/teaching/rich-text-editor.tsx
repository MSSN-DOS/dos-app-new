"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import katex from "katex";
import "katex/contrib/mhchem";
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
import { sciencePalettes } from "@/lib/quizzes/science-palettes";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InlineGap, gapEditorHtml, gapStorageHtml } from "./inline-gap";
import { resizeQuizImage } from "@/lib/quizzes/resize-image";
import { scienceTemplates, templateLatex } from "@/lib/quizzes/science-templates";
import { ScienceTemplateNode } from "./science-template-node";
import { RichTextTools, useRichTextToolbar } from "./rich-text-toolbar";

export type QuizImageUploader = (file: File) => Promise<{ url: string; path: string }>;

export interface RichTextEditorProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string, gapAnswers?: string[]) => void;
  gapAnswers?: string[];
  placeholder?: string;
  clickToEdit?: boolean;
  uploadImage?: QuizImageUploader;
  readOnly?: boolean;
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
  gapAnswers,
  readOnly = false,
}: RichTextEditorProps) {
  const toolbar = useRichTextToolbar();
  const [editing, setEditing] = useState(!clickToEdit);
  const [fullscreen, setFullscreen] = useState(false);
  const [mathOpen, setMathOpen] = useState(false);
  const [mathPanel, setMathPanel] = useState(false);
  const [formula, setFormula] = useState("");
  const [formulaMode, setFormulaMode] = useState<"latex" | "chemistry">("latex");
  const formulaSource =
    formulaMode === "chemistry" && !formula.trim().startsWith("\\ce{")
      ? `\\ce{${formula}}`
      : formula;
  const [palette, setPalette] = useState<keyof typeof sciencePalettes>("math");
  const [mathTarget, setMathTarget] = useState<{
    kind: "inline" | "block";
    position: number;
  } | null>(null);
  const [blockMath, setBlockMath] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const extensions = useMemo(
    () => [
      ...richTextExtensions((kind, latex, position) => {
        setFormula(latex);
        setFormulaMode("latex");
        setMathTarget({ kind, position });
        setBlockMath(kind === "block");
        setMathOpen(true);
      }),
      InlineGap,
      ScienceTemplateNode,
    ],
    [],
  );
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editable: !readOnly,
    content: gapAnswers
      ? gapEditorHtml(sanitizeRichText(value), gapAnswers)
      : sanitizeRichText(value),
    editorProps: {
      attributes: {
        id,
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
        class: "dos-rich-text min-h-32 p-3 text-base focus:outline-none",
      },
      handlePaste: (_view, event) => {
        const item = Array.from(event.clipboardData?.items ?? []).find((entry) =>
          entry.type.startsWith("image/"),
        );
        const file = item?.getAsFile();
        if (file && uploadImage) {
          event.preventDefault();
          void insertImage(file);
          return true;
        }
        const text = event.clipboardData?.getData("text/plain");
        if (text) {
          event.preventDefault();
          editor
            ?.chain()
            .insertContent(
              text
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;"),
            )
            .run();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: updated }) => {
      const answers: string[] = [];
      updated.state.doc.descendants((node) => {
        if (node.type.name === "inlineGap") answers.push(String(node.attrs.answer ?? ""));
      });
      onChange(
        gapStorageHtml(sanitizeRichText(updated.getHTML())),
        gapAnswers ? answers : undefined,
      );
    },
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
    editor?.setEditable(!readOnly);
  }, [editor, readOnly]);
  useEffect(() => {
    if (
      editor &&
      gapStorageHtml(sanitizeRichText(editor.getHTML())) !== sanitizeRichText(value)
    )
      editor.commands.setContent(
        gapAnswers
          ? gapEditorHtml(sanitizeRichText(value), gapAnswers)
          : sanitizeRichText(value),
        { emitUpdate: false },
      );
  }, [editor, value, gapAnswers]);

  function insertMath() {
    if (!editor || !formula.trim()) return;
    try {
      katex.renderToString(formulaSource, {
        throwOnError: true,
        trust: false,
        maxSize: 20,
        maxExpand: 1000,
      });
      if (mathTarget?.kind === "inline")
        editor
          .chain()
          .focus()
          .updateInlineMath({ pos: mathTarget.position, latex: formulaSource })
          .run();
      else if (mathTarget?.kind === "block")
        editor
          .chain()
          .focus()
          .updateBlockMath({ pos: mathTarget.position, latex: formulaSource })
          .run();
      else if (blockMath)
        editor.chain().focus().insertBlockMath({ latex: formulaSource }).run();
      else editor.chain().focus().insertInlineMath({ latex: formulaSource }).run();
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
      const image = await uploadImage(await resizeQuizImage(file));
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
      <RichTextTools editorId={id} fullscreen={expanded}>
        {!readOnly && (
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
                onPointerDown={(event) => {
                  if (actionLabel !== "Insert equation") event.preventDefault();
                }}
                onClick={run}
              >
                <Icon className="size-4" aria-hidden="true" />
              </Button>
            ))}
            {gapAnswers && (
              <Button
                type="button"
                variant="ghost"
                className="size-11 p-0 text-base"
                aria-label="Insert gap"
                title="Insert gap"
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => {
                  editor
                    ?.chain()
                    .focus()
                    .insertContent({ type: "inlineGap", attrs: { answer: "" } })
                    .run();
                  requestAnimationFrame(() => {
                    const inputs = document
                      .getElementById(id)
                      ?.querySelectorAll<HTMLInputElement>(
                        'input[aria-label="Accepted gap answer"]',
                      );
                    inputs?.[inputs.length - 1]?.focus();
                  });
                }}
              >
                [ ]
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 px-3 text-base"
              aria-label="Science templates"
              aria-expanded={mathPanel}
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => setMathPanel(!mathPanel)}
            >
              Math / science
            </Button>
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
              {expanded ? (
                <Minimize className="size-4" />
              ) : (
                <Maximize className="size-4" />
              )}
            </Button>
          </div>
        )}
        {mathPanel && !readOnly && (
          <div className="min-w-0 space-y-3 border-b bg-canvas p-2">
            <Tabs
              value={palette}
              onValueChange={(value) => {
                if (
                  value === "math" ||
                  value === "physics" ||
                  value === "chemistry" ||
                  value === "symbols"
                )
                  setPalette(value);
              }}
            >
              <TabsList
                aria-label="Template subject"
                className="grid h-auto w-full grid-cols-2 sm:grid-cols-4"
              >
                {(["math", "physics", "chemistry", "symbols"] as const).map((key) => (
                  <TabsTrigger
                    value={key}
                    key={key}
                    className="min-h-11 text-base capitalize"
                  >
                    {key}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {scienceTemplates
                .filter((template) => template.group === palette)
                .map((template) => (
                  <Button
                    key={template.id}
                    type="button"
                    variant="outline"
                    aria-label={`Insert ${template.label} template`}
                    title={template.label}
                    className="h-auto min-h-11 min-w-0 overflow-hidden p-2"
                    onMouseDown={(event) => event.preventDefault()}
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                      const before = editor?.state.selection.from ?? 0;
                      editor
                        ?.chain()
                        .focus()
                        .insertContent({
                          type: "scienceTemplate",
                          attrs: {
                            templateId: template.id,
                            values: template.slots.map(() => ""),
                          },
                        })
                        .run();
                      requestAnimationFrame(() => {
                        const node = editor?.view.nodeDOM(before);
                        if (node instanceof HTMLElement)
                          node
                            .querySelector<HTMLInputElement>("[data-science-slot]")
                            ?.focus();
                      });
                    }}
                  >
                    <span
                      className="max-w-full overflow-x-auto"
                      aria-hidden="true"
                      dangerouslySetInnerHTML={{
                        __html: katex.renderToString(
                          templateLatex(
                            template.id,
                            template.slots.map(() => "x"),
                          ),
                          {
                            trust: false,
                            throwOnError: false,
                            maxExpand: 1000,
                            maxSize: 20,
                          },
                        ),
                      }}
                    />
                  </Button>
                ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {sciencePalettes[palette].map((item) => (
                <Button
                  key={item.label}
                  variant="outline"
                  type="button"
                  className="min-h-11 text-base"
                  onMouseDown={(event) => event.preventDefault()}
                  onPointerDown={(event) => event.preventDefault()}
                  onClick={() =>
                    editor?.chain().focus().insertInlineMath({ latex: item.latex }).run()
                  }
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
        )}
      </RichTextTools>
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
    <div
      className="min-w-0 space-y-2"
      onFocusCapture={() => {
        // Activating a preview on pointer-down moves the toolbar before its click lands.
        if (editing || fullscreen) toolbar?.activate(id);
      }}
    >
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
            onClick={() => {
              if (!readOnly) setEditing(true);
              if (!readOnly) toolbar?.activate(id);
            }}
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
        <DialogContent className="max-h-[95dvh] w-[calc(100%-1rem)] overflow-y-auto border-line bg-panel text-ink sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mathTarget ? "Edit equation" : "Insert equation"}</DialogTitle>
            <DialogDescription>
              Enter LaTeX, for example \frac&#123;1&#125;&#123;2&#125; or E = mc^2.
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={formulaMode}
            onValueChange={(mode) => {
              if (mode === "latex" || mode === "chemistry") setFormulaMode(mode);
            }}
          >
            <TabsList
              className="grid h-auto w-full grid-cols-2"
              aria-label="Formula input mode"
            >
              <TabsTrigger value="latex" className="min-h-11 text-base">
                LaTeX
              </TabsTrigger>
              <TabsTrigger value="chemistry" className="min-h-11 text-base">
                Chemistry shorthand
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Label htmlFor={`${id}-latex`}>
            {formulaMode === "chemistry"
              ? "Chemical formula or reaction"
              : "LaTeX equation"}
          </Label>
          <Tabs
            value={palette}
            onValueChange={(value) => {
              if (
                value === "math" ||
                value === "physics" ||
                value === "chemistry" ||
                value === "symbols"
              )
                setPalette(value);
            }}
          >
            <TabsList
              aria-label="Science formula palettes"
              className="grid h-auto w-full grid-cols-2 sm:grid-cols-4 sm:gap-1"
            >
              {(["math", "physics", "chemistry", "symbols"] as const).map((key) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="min-h-11 text-base capitalize"
                >
                  {key}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {sciencePalettes[palette].map((example) => (
              <Button
                key={example.label}
                type="button"
                variant="outline"
                className="h-auto min-h-11 whitespace-normal text-base"
                onClick={() => {
                  setFormula(example.latex);
                  setFormulaMode(
                    example.latex.startsWith("\\ce{") ? "chemistry" : "latex",
                  );
                  setError(null);
                }}
              >
                {example.label}
              </Button>
            ))}
          </div>
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
          <div className="space-y-2">
            <p className="text-base font-semibold">Formula preview</p>
            <div
              className="dos-rich-text min-w-0 overflow-x-auto rounded-xl border border-line bg-canvas p-3 text-base"
              aria-live="polite"
              dangerouslySetInnerHTML={{
                __html: (() => {
                  try {
                    return formula
                      ? katex.renderToString(formulaSource, {
                          throwOnError: false,
                          trust: false,
                          maxExpand: 1000,
                          maxSize: 20,
                        })
                      : "Enter an equation or choose an example.";
                  } catch {
                    return "Check the formula syntax.";
                  }
                })(),
              }}
            />
            <p className="text-base text-sub">
              {formulaMode === "chemistry"
                ? "Example: N2 + 3H2 <=>[Fe][450°C] 2NH3"
                : "Use LaTeX for mathematics or select Chemistry shorthand for reactions."}
            </p>
          </div>
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
