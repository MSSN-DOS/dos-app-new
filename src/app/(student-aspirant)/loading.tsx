import { PageLoader } from "@/components/shell/page-loader";

// Shared by students and aspirants, so no role pill: the session is known by
// the time this streams in, but this segment cannot tell the two apart.
export default function StudentAspirantLoading() {
  return <PageLoader />;
}
