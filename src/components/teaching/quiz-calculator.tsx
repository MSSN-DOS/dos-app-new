"use client";
import { useState } from "react";
import { Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateQuizExpression } from "@/lib/quizzes/calculator";
export function QuizCalculator() {
  const [expression, setExpression] = useState(""); const [result, setResult] = useState<string>(""); const [error, setError] = useState("");
  const calculate = () => { try { setResult(String(calculateQuizExpression(expression))); setError(""); } catch (err) { setError(err instanceof Error ? err.message : "Check the expression"); } };
  return <Dialog><DialogTrigger asChild><Button type="button" variant="outline" className="min-h-11 border-line text-base text-ink"><Calculator className="size-5" />Calculator</Button></DialogTrigger><DialogContent className="border-line bg-panel text-ink sm:max-w-sm"><DialogHeader><DialogTitle>Calculator</DialogTitle><DialogDescription className="text-sub">Use numbers, decimals, parentheses and arithmetic operators.</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="quiz-calculation" className="text-base">Expression</Label><Input id="quiz-calculation" value={expression} className="min-h-11 text-base" onChange={(e) => setExpression(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); calculate(); } }} /><output className="block min-h-11 break-all rounded-xl bg-canvas p-3 text-base font-semibold" aria-live="polite">{result || "0"}</output></div><div className="grid grid-cols-4 gap-2">{["7","8","9","÷","4","5","6","×","1","2","3","-","0",".","(",")"].map((key) => <Button key={key} type="button" variant="outline" className="min-h-11 text-base" onClick={() => setExpression((previous) => previous + key)}>{key}</Button>)}<Button type="button" variant="outline" className="min-h-11" onClick={() => { setExpression(""); setResult(""); setError(""); }}>Clear</Button><Button type="button" variant="outline" className="min-h-11" onClick={() => setExpression((value) => value + "+")}>+</Button><Button type="button" className="col-span-2 min-h-11" onClick={calculate}>=</Button></div>{error && <p role="alert" className="text-base text-ruby">{error}</p>}</DialogContent></Dialog>;
}
