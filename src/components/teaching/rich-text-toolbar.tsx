"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const ToolbarContext = createContext<{
  activeId: string;
  activate: (id: string) => void;
  host: HTMLDivElement | null;
  setHost: (host: HTMLDivElement | null) => void;
} | null>(null);

/** One toolbar follows the last focused rich field without replacing its editor. */
export function RichTextToolbarProvider({
  initialEditorId,
  children,
}: {
  initialEditorId: string;
  children: ReactNode;
}) {
  const [activeId, activate] = useState(initialEditorId);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  return (
    <ToolbarContext.Provider value={{ activeId, activate, host, setHost }}>
      {children}
    </ToolbarContext.Provider>
  );
}

export const useRichTextToolbar = () => useContext(ToolbarContext);

export function RichTextToolbarHost() {
  const toolbar = useRichTextToolbar();
  return <div ref={toolbar?.setHost} className="min-w-0" />;
}

export function RichTextTools({
  editorId,
  fullscreen,
  children,
}: {
  editorId: string;
  fullscreen: boolean;
  children: ReactNode;
}) {
  const toolbar = useRichTextToolbar();
  if (!toolbar || fullscreen) return children;
  return toolbar.activeId === editorId && toolbar.host
    ? createPortal(children, toolbar.host)
    : null;
}
