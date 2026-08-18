import { redirect } from "next/navigation";
import { MobileNavigation } from "@/components/navigation/mobile-navigation";
import { resolveNavigationGroups } from "@/components/navigation/navigation-model";
import { AppSidebar } from "@/components/ui/app-sidebar";
import type { CurrentAccessV2 } from "@/features/auth/access-types";
import { getOrganizationContext } from "@/features/organization/server/get-organization-context";
import { NotificationBell } from "@/features/notifications/components/notification-bell";
import { loadNotifications } from "@/features/notifications/server/load-notifications";

export default async function AuthenticatedLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const access: CurrentAccessV2 | null = await getOrganizationContext();

  if (!access) {
    redirect("/login");
  }

  const navigationGroups = resolveNavigationGroups(access);
  const { unreadCount } = await loadNotifications(30);

  return (
    <div className="app-frame">
      <AppSidebar access={access} navigationGroups={navigationGroups} />
      <MobileNavigation access={access} navigationGroups={navigationGroups} />
      <main className="app-content"><div className="app-content__utility"><NotificationBell unreadCount={unreadCount} /></div>{children}</main>
    </div>
  );
}
