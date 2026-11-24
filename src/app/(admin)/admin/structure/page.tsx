import { Suspense } from "react";
import { StructureWorkspace } from "@/components/structure/structure-workspace";
export default function Page(){
  return <Suspense fallback={<p role="status">Loading structure…</p>}><StructureWorkspace/></Suspense>;
}
