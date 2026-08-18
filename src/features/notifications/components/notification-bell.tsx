"use client";

import Link from "next/link";
export function NotificationBell({ unreadCount }: { unreadCount: number }) { return <Link className="notification-bell" href="/notifications" aria-label={unreadCount ? `${unreadCount} thông báo chưa đọc` : "Thông báo"}><span aria-hidden="true">♢</span>{unreadCount > 0 ? <b>{unreadCount > 99 ? "99+" : unreadCount}</b> : null}</Link>; }
