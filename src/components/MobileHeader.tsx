import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Menu, X, Wheat, LayoutDashboard, ShoppingCart, PlusCircle, Users, Package, Truck, BarChart3, Settings } from "lucide-react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/orders/new", icon: PlusCircle, label: "New Order" },
  { to: "/orders", icon: ShoppingCart, label: "Orders" },
  { to: "/customers", icon: Users, label: "Customers" },
  { to: "/stock", icon: Package, label: "Stock" },
  { to: "/drivers", icon: Truck, label: "Drivers" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

const MobileHeader = () => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="md:hidden no-print">
      <header className="fixed top-0 left-0 right-0 h-16 bg-sidebar text-sidebar-foreground flex items-center justify-between px-4 z-50">
        <div className="flex items-center gap-2">
          <Wheat className="w-6 h-6 text-sidebar-primary" />
          <span className="font-display font-bold">WheatFlow</span>
        </div>
        <button onClick={() => setOpen(!open)} className="p-2">
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {open && (
        <div className="fixed inset-0 top-16 bg-sidebar z-40 p-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent"
                }`}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      )}
      <div className="h-16" />
    </div>
  );
};

export default MobileHeader;
