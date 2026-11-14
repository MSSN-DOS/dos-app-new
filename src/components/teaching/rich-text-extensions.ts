import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import { Mathematics } from "@tiptap/extension-mathematics";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import StarterKit from "@tiptap/starter-kit";

export function richTextExtensions(
  onMathClick?: (kind: "inline" | "block", latex: string, position: number) => void,
) {
  return [
    StarterKit.configure({ heading: false, link: false }),
    Highlight,
    Subscript,
    Superscript,
    Image.extend({
      addAttributes() {
        return {
          ...this.parent?.(),
          storagePath: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-storage-path"),
            renderHTML: (attributes) =>
              typeof attributes.storagePath === "string"
                ? { "data-storage-path": attributes.storagePath }
                : {},
          },
        };
      },
    }).configure({ allowBase64: false }),
    Mathematics.configure({
      katexOptions: { trust: false, throwOnError: false, maxSize: 20, maxExpand: 1000 },
      inlineOptions: {
        onClick: (node, position) =>
          onMathClick?.("inline", String(node.attrs.latex), position),
      },
      blockOptions: {
        onClick: (node, position) =>
          onMathClick?.("block", String(node.attrs.latex), position),
      },
    }),
  ];
}
