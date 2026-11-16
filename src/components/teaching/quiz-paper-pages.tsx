"use client";
import { useEffect, useRef, useState } from "react";
import { paginatePaperBlocks } from "@/lib/quizzes/paper";
import type { QuizDraftPayloadInput } from "@/lib/validation/quiz-questions";
import { QuizQuestionPaper } from "./quiz-print-dialog";
interface MeasuredBlock {
  html: string;
  height: number;
  newPage: boolean;
}
export function QuizPaperPages({
  payload,
  institution,
  answerKey,
  exportHost = false,
}: {
  payload: QuizDraftPayloadInput;
  institution: string;
  answerKey: boolean;
  exportHost?: boolean;
}) {
  const measurement = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [blocks, setBlocks] = useState<MeasuredBlock[]>([]);
  const [width, setWidth] = useState(794);
  useEffect(() => {
    let active = true;
    const measure = async () => {
      await document.fonts.ready;
      const root = measurement.current;
      if (!root) return;
      await Promise.all(
        Array.from(root.querySelectorAll("img")).map((image) =>
          image.decode().catch(() => undefined),
        ),
      );
      if (active)
        setBlocks(
          Array.from(root.querySelectorAll<HTMLElement>("[data-paper-block]")).map(
            (element) => ({
              html: element.outerHTML,
              height: element.offsetHeight + 24,
              newPage: element.dataset.newPage === "true",
            }),
          ),
        );
    };
    void measure();
    return () => {
      active = false;
    };
  }, [payload, institution, answerKey]);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0]?.contentRect.width ?? 794),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const pages = paginatePaperBlocks(blocks);
  const scale = exportHost ? 1 : Math.min(1, Math.max(0.1, width / 794));
  return (
    <div ref={viewport} className="min-w-0 w-full">
      <div ref={measurement} aria-hidden="true" className="quiz-paper-measure">
        <QuizQuestionPaper
          payload={payload}
          institution={institution}
          answerKey={answerKey}
        />
      </div>
      {pages.length === 0 && (
        <p role="status" className="p-4 text-base text-sub">
          Preparing A4 pages…
        </p>
      )}
      <div className="space-y-4">
        {pages.map((indexes, pageIndex) => (
          <div
            key={pageIndex}
            className="quiz-paper-page-wrap"
            style={{ width: 794 * scale, height: 1122 * scale }}
          >
            <article
              data-a4-page
              className="quiz-a4-page"
              style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}
            >
              {indexes.map((index) => {
                const block = blocks[index];
                const shrink = Math.min(1, 990 / block.height);
                return (
                  <div
                    key={index}
                    className="quiz-paper-block"
                    style={
                      shrink < 1
                        ? { height: block.height * shrink, overflow: "hidden" }
                        : undefined
                    }
                  >
                    <div
                      style={
                        shrink < 1
                          ? {
                              transform: `scale(${shrink})`,
                              transformOrigin: "top left",
                              width: 688,
                            }
                          : undefined
                      }
                      dangerouslySetInnerHTML={{ __html: block.html }}
                    />
                  </div>
                );
              })}
              <footer className="quiz-paper-page-footer">
                <span className="truncate">{payload.details.title}</span>
                <span>
                  Page {pageIndex + 1} of {pages.length}
                </span>
              </footer>
            </article>
          </div>
        ))}
      </div>
    </div>
  );
}
