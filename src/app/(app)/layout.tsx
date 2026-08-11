import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/ui/app-sidebar";
import { getCurrentAccess } from "@/features/auth/server/get-current-access";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access = await getCurrentAccess();

  if (!access) {
    redirect("/login");
  }

  return (
    <div className="app-frame">
      <AppSidebar access={access} />
      <main className="app-content">{children}</main>
    </div>
  );
}
