"use client";

import Link from "next/link";
import { useState } from "react";
import type { NotificationDTO } from "../contracts";

function formatDate(value: string) { return new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
export function NotificationCenter({ initialNotifications }: { initialNotifications: NotificationDTO[] }) {
  const [notifications, setNotifications] = useState(initialNotifications);
  async function markRead(id: string) { setNotifications((items) => items.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item)); await fetch(`/api/v2/notifications/${id}/read`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ notificationId: id }) }); }
  return <section className="notification-center" aria-labelledby="notification-center-title"><header><div><p className="section-index">Thông tin xử lý</p><h1 id="notification-center-title">Thông báo</h1><p>Các cập nhật về đề xuất, kế hoạch và việc cần bạn xử lý.</p></div></header>{notifications.length ? <ul>{notifications.map((notification) => <li key={notification.id} className={notification.readAt ? "" : "is-unread"}>{notification.href ? <Link href={notification.href} onClick={() => { void markRead(notification.id); }}><strong>{notification.title}</strong><p>{notification.body}</p><time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time></Link> : <button type="button" onClick={() => void markRead(notification.id)}><strong>{notification.title}</strong><p>{notification.body}</p><time dateTime={notification.createdAt}>{formatDate(notification.createdAt)}</time></button>}</li>)}</ul> : <div className="empty-state"><h2>Chưa có thông báo mới.</h2><p>Thông báo về tuyến duyệt sẽ xuất hiện ở đây.</p></div>}</section>;
}
