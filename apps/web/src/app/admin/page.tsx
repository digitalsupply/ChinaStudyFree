import type { Metadata } from "next";
import { AdminClient } from "./AdminClient";

export const metadata: Metadata = {
  title: "反馈管理台 · 聪聪学堂",
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminClient />;
}
