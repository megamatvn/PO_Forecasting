import { redirect } from "next/navigation";

export default async function ImportsPage() {
  redirect("/annual-plans/new?step=scope");
}
