import { redirect } from "next/navigation";

import { requirePageUser } from "@/lib/security/pages";

export default async function StudioPage() {
  await requirePageUser();
  redirect("/");
}
