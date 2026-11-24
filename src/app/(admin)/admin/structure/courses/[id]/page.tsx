import Link from "next/link";
import { CatalogDetails } from "@/components/teaching/catalog-details";
import { Button } from "@/components/ui/button";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="space-y-5"><Button asChild variant="outline" className="min-h-11"><Link href="/admin/structure/courses">Back to courses</Link></Button><CatalogDetails id={Number(id)} kind="course" /></div>;
}
