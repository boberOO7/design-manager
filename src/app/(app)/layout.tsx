import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { getCurrentUserProfile } from "@/data/queries";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Obtain the real profile once on the server
  let profile = null;
  try {
    profile = await getCurrentUserProfile();
  } catch (error) {
    // If profile fetch fails, redirect to login
    console.error("Failed to fetch user profile:", error);
    redirect("/login");
  }

  // Redirect if no authenticated user exists
  if (!profile) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-stone-50 text-stone-900">
      <AppSidebar profile={profile} />
      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader profile={profile} />
        <main className="flex-1 p-5 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
