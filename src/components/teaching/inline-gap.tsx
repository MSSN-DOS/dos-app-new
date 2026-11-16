"use client";
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
function GapView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper
      as="span"
      className="inline-flex align-baseline"
      contentEditable={false}
    >
      <input
        aria-label="Accepted gap answer"
        className="mx-1 inline-block min-h-11 w-28 max-w-full rounded-md border border-brand bg-canvas px-2 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        placeholder="answer"
        maxLength={255}
        value={String(node.attrs.answer ?? "")}
        onChange={(event) => updateAttributes({ answer: event.target.value })}
      />
    </NodeViewWrapper>
  );
}
export const InlineGap = Node.create({
  name: "inlineGap",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      answer: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-gap-answer") ?? "",
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-inline-gap]" }];
  },
  // Storage stays [gap]; accepted answers remain in the existing blanks model.
  renderHTML() {
    return ["span", {}, "[gap]"];
  },
  addNodeView() {
    return ReactNodeViewRenderer(GapView);
  },
});
export function gapEditorHtml(html: string, answers: readonly string[]): string {
  let index = 0;
  return html.replace(/\[gap\]/g, () => {
    const answer = answers[index++] ?? "";
    return `<span data-inline-gap="true" data-gap-answer="${answer.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}"></span>`;
  });
}
export function gapStorageHtml(html: string): string {
  return html.replace(/<span>\[gap\]<\/span>/g, "[gap]");
}
