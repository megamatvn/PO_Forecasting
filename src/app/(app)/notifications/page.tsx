import { PageHeader } from "@/components/ui/page-header";
import { NotificationCenter } from "@/features/notifications/components/notification-center";
import { loadNotifications } from "@/features/notifications/server/load-notifications";

export default async function NotificationsPage() {
  const { notifications } = await loadNotifications(100);
  return <div className="page-shell notifications-page"><PageHeader breadcrumb={[{ label: "Thông báo" }]} title="Thông báo" description="Cập nhật về đề xuất, phê duyệt và các việc cần xử lý." /><NotificationCenter initialNotifications={notifications} /></div>;
}
