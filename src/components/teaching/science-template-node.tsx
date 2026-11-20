"use client";
import katex from "katex";
import "katex/contrib/mhchem";
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import {
  scienceTemplates,
  scienceTemplateValues,
  templateLatex,
} from "@/lib/quizzes/science-templates";
function TemplateView({ node, updateAttributes }: NodeViewProps) {
  const id = String(node.attrs.templateId ?? "");
  const template = scienceTemplates.find((item) => item.id === id);
  const values = Array.isArray(node.attrs.values)
    ? node.attrs.values.map((value: unknown) => String(value))
    : [];
  if (!template) return null;
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className="my-2 inline-flex max-w-full flex-col gap-2 rounded-md border border-brand/40 bg-canvas p-2 align-middle"
    >
      <span
        className="max-w-full overflow-x-auto"
        dangerouslySetInnerHTML={{
          __html: katex.renderToString(templateLatex(id, values), {
            trust: false,
            throwOnError: false,
            maxExpand: 1000,
            maxSize: 20,
          }),
        }}
      />
      <span className="flex max-w-full flex-wrap gap-2">
        {template.slots.map((label, index) => (
          <input
            key={label}
            data-science-slot
            aria-label={`${template.label}: ${label}`}
            placeholder={label}
            className="min-h-11 w-24 max-w-full rounded border border-dashed border-brand bg-background px-2 text-base text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={values[index] ?? ""}
            maxLength={128}
            onChange={(e) =>
              updateAttributes({
                values: template.slots.map((_, i) =>
                  i === index ? e.target.value : (values[i] ?? ""),
                ),
              })
            }
          />
        ))}
      </span>
    </NodeViewWrapper>
  );
}
export const ScienceTemplateNode = Node.create({
  name: "scienceTemplate",
  priority: 1000,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      templateId: {
        default: "fraction",
        parseHTML: (element) => element.getAttribute("data-science-template"),
      },
      values: {
        default: [],
        parseHTML: (element) =>
          scienceTemplateValues(element.getAttribute("data-science-values") ?? "") ?? [],
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-science-template]" }];
  },
  renderHTML({ node }) {
    const values = Array.isArray(node.attrs.values)
      ? node.attrs.values.map((value: unknown) => String(value))
      : [];
    return [
      "span",
      {
        "data-type": "inline-math",
        "data-latex": templateLatex(String(node.attrs.templateId), values),
        "data-science-template": String(node.attrs.templateId),
        "data-science-values": JSON.stringify(values),
      },
    ];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TemplateView);
  },
});
