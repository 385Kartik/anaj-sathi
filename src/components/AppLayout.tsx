import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";
import MobileHeader from "./MobileHeader";

const AppLayout = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      <MobileHeader />
      <main className="md:ml-64 min-h-screen">
        <div className="p-4 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;
