import React from 'react';
import { LayoutDashboard, Briefcase, Users, Archive, ListTodo, Settings } from 'lucide-react';
import Link from 'next/link';

interface LayoutProps {
  children: React.ReactNode;
  userRole?: 'admin' | 'employee';
}

export default function AppLayout({ children, userRole = 'employee' }: LayoutProps) {
  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: Briefcase },
    { name: 'My Tasks', href: '/my-tasks', icon: ListTodo },
    { name: 'Team', href: '/team', icon: Users },
    { name: 'Archive', href: '/archive', icon: Archive },
  ];

  const adminNavigation = [
    { name: 'Admin', href: '/admin', icon: Settings },
  ];

  const navItems = userRole === 'admin' ? [...navigation, ...adminNavigation] : navigation;

  return (
    <div className="flex h-screen bg-[var(--ui-surface-subtle)]">
      {/* Sidebar */}
      <aside className="w-64 bg-[var(--ui-surface)] border-r border-[var(--ui-border)] flex flex-col">
        <div className="p-6">
          <Link href="/dashboard" className="text-xl font-bold text-[var(--ui-text)]">
            StudioFlow
          </Link>
        </div>
        <nav className="flex-1 px-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 text-sm font-medium text-[var(--ui-text-secondary)] hover:bg-[var(--ui-surface-muted)] hover:text-[var(--ui-text)] rounded-md transition-colors"
            >
              <item.icon className="w-4 h-4" />
              {item.name}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-[var(--ui-border)]">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-[var(--ui-surface-strong)] flex items-center justify-center text-xs font-bold">
              {userRole[0].toUpperCase()}
            </div>
            <div className="text-sm">
              <p className="font-medium text-[var(--ui-text)]">{userRole === 'admin' ? 'Admin User' : 'Employee User'}</p>
              <p className="text-[var(--ui-text-muted)] text-xs">{userRole}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="h-16 border-b border-[var(--ui-border)] bg-[var(--ui-surface)] flex items-center justify-between px-8">
          <h1 className="text-lg font-semibold text-[var(--ui-text)]">
            {/* Page Title will be handled by individual pages */}
          </h1>
          <div className="flex items-center gap-4">
            <button className="p-2 text-[var(--ui-text-muted)] hover:bg-[var(--ui-surface-muted)] rounded-full">
              <span className="sr-only">Notifications</span>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.076 2.076 0 0118 10.5H9.5a2.076 2.076 0 01-1.405-1.405L5 17h5l-1.405-1.405A2.076 2.076 0 013 10.5H1 10.5a2.076 2.076 0 011.405-1.405L5 3h5l-1.405 1.405A2.076 2.076 0 018.5 5H18a2.076 2.076 0 011.405 1.405l1.405 1.405h-5l-1.405 1.405a2.076 2.076 0 01-1.405 1.405l-1.405 1.405h5l-1.405-1.405a2.076 2.076 0 011.405-1.405l1.405-1.405z" /></svg>
            </button>
          </div>
        </header>
        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
