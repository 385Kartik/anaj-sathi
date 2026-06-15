import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ShoppingCart, IndianRupee, Users, Package, TrendingUp, Clock } from "lucide-react";
import StatCard from "@/components/StatCard";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

const Dashboard = () => {
  const { data: todayOrders } = useQuery({
    queryKey: ["dashboard-today-orders"],
    queryFn: async () => {
      const today = new Date().toISOString().split("T")[0];
      const { count } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("order_date", today)
        .neq("product_type", "Null"); // <-- FIX: Ignore dummy New Year entries
      return count || 0;
    },
  });

  const { data: pendingAmount } = useQuery({
    queryKey: ["dashboard-pending"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("total_amount, amount_paid")
        .neq("product_type", "Null"); // <-- FIX: Ignore dummy entries
        
      // Calculate pending safely
      return data?.reduce((sum, o) => {
          const pending = Number(o.total_amount || 0) - Number(o.amount_paid || 0);
          return pending > 0 ? sum + pending : sum;
      }, 0) || 0;
    },
  });

  const { data: totalCustomers } = useQuery({
    queryKey: ["dashboard-customers"],
    queryFn: async () => {
      const { count } = await supabase
        .from("customers")
        .select("*", { count: "exact", head: true });
      return count || 0;
    },
  });

  const { data: stockData } = useQuery({
    queryKey: ["dashboard-stock"],
    queryFn: async () => {
      const { data } = await supabase.from("stock").select("*");
      return data || [];
    },
  });

  const { data: recentOrders } = useQuery({
    queryKey: ["dashboard-recent-orders"],
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("*, customers(name, phone)")
        .neq("product_type", "Null") // <-- FIX: Don't show 'Null' in recent orders
        .order("created_at", { ascending: false })
        .limit(5);
      return data || [];
    },
  });

  const totalStock = stockData?.reduce((s, item) => s + Number(item.quantity_kg), 0) || 0;

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Overview of your wheat business">
        <Link to="/orders/new">
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-medium">
            + New Order
          </Button>
        </Link>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Today's Orders" value={todayOrders ?? 0} icon={ShoppingCart} variant="primary" />
        <StatCard
          title="Pending Payments"
          value={`₹${(pendingAmount ?? 0).toLocaleString("en-IN")}`}
          icon={IndianRupee}
          variant="warning"
        />
        <StatCard title="Total Customers" value={totalCustomers ?? 0} icon={Users} variant="success" />
        <StatCard title="Total Stock" value={`${totalStock.toLocaleString()} Guni`} icon={Package} variant="default" />
      </div>

      {/* Stock breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" /> Stock Levels
          </h2>
          <div className="space-y-3">
            {stockData?.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <span className="font-medium text-foreground">{item.product_type}</span>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{Number(item.quantity_kg).toLocaleString()} Guni</span>
                  {Number(item.quantity_kg) <= Number(item.low_stock_threshold || 0) && (
                    <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">Low</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }} className="bg-card border border-border rounded-xl p-6">
          <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Recent Orders
          </h2>
          {recentOrders && recentOrders.length > 0 ? (
            <div className="space-y-3">
              {recentOrders.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div>
                    <p className="font-medium text-foreground">{order.customers?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.product_type} · {Number(order.quantity_kg)} Guni
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-foreground">₹{Number(order.total_amount).toLocaleString("en-IN")}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      order.status === "delivered"
                        ? "bg-success/10 text-success"
                        : order.status === "cancelled"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-warning/10 text-warning"
                    }`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No recent orders yet. Start fresh!</p>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default Dashboard;