import { PageLoader } from "@/components/shell/page-loader";

// Root route transition. Every deeper segment overrides this with its own
// loading.tsx so the shell can stay mounted while only the body swaps.
export default function RootLoading() {
  return <PageLoader fullScreen />;
}
