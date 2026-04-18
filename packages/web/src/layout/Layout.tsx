import { Outlet } from "react-router-dom";
import { Sidebar } from "@/layout/Sidebar";
import { CommandPalette } from "@/layout/CommandPalette";

export function Layout() {
  return (
    <div className="min-h-screen flex bg-white text-zinc-900">
      <Sidebar />
      <main className="flex-1">
        <Outlet />
      </main>
      <CommandPalette />
    </div>
  );
}
