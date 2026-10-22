import { AdminConsole } from "@/components/admin/admin-console";
import { requirePageAdmin } from "@/lib/security/pages";
export default async function AdminPage() {
  await requirePageAdmin();
  return <AdminConsole />;
}
