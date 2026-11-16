"use client";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Input } from "@/components/ui/input";
import { renderRichText } from "@/lib/rich-text";
import type { SubmittedAnswerInput } from "@/lib/validation/attempts";
interface GapProps {
  body: string;
  blankIndexes: number[];
  answer: SubmittedAnswerInput;
  onChange: (answer: SubmittedAnswerInput) => void;
}
export function QuizInlineGaps(props: GapProps) {
  return <GapInputs key={`${props.answer.questionId}:${props.body}`} {...props} />;
}
function GapInputs({ body, blankIndexes, answer, onChange }: GapProps) {
  const [targets, setTargets] = useState<Element[]>([]);
  let index = 0;
  const html = renderRichText(body).replace(
    /\[gap\]/g,
    () => `<span data-student-gap="${index++}"></span>`,
  );
  // Keep React from replacing the HTML that owns the portal inputs on each keystroke.
  const markup = useMemo(() => ({ __html: html }), [html]);
  const attach = useCallback((element: HTMLDivElement | null) => {
    if (element) setTargets(Array.from(element.querySelectorAll("[data-student-gap]")));
  }, []);
  return (
    <>
      <div
        ref={attach}
        className="dos-rich-text min-w-0 break-words text-base text-ink [&_p]:leading-[3.5]"
        dangerouslySetInnerHTML={markup}
      />
      {targets.map((target, position) => {
        const blank = blankIndexes[position] ?? position + 1;
        return createPortal(
          <Input
            aria-label={`Gap ${blank}`}
            className="mx-1 inline-block h-11 min-h-11 w-28 max-w-full border-b-2 border-brand align-baseline text-base"
            autoComplete="off"
            maxLength={255}
            placeholder={`Gap ${blank}`}
            value={answer.blankAnswers?.[String(blank)] ?? ""}
            onChange={(event) =>
              onChange({
                questionId: answer.questionId,
                blankAnswers: {
                  ...answer.blankAnswers,
                  [String(blank)]: event.target.value,
                },
              })
            }
          />,
          target,
          String(position),
        );
      })}
    </>
  );
}
