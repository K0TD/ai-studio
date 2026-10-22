import { K0tdShell } from "@/components/k0td-ai/shell/k0td-shell";
import { requirePageUser } from "@/lib/security/pages";

export default async function HomePage() {
  await requirePageUser();
  return <K0tdShell />;
}
