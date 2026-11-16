import { PageLoader } from "@/components/shell/page-loader";

// Rendered inside the admin shell, so only the content pane is replaced — the
// sidebar and header stay put instead of flashing away on every navigation.
export default function AdminLoading() {
  return <PageLoader role="admin" />;
}
