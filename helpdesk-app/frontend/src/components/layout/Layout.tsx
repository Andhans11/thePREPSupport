import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { Toasts } from '../ui/Toasts';

export function Layout() {
  return (
    <div className="flex h-screen bg-[var(--hiver-bg)]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <Toasts />
    </div>
  );
}
