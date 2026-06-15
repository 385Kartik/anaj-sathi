import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { IndianRupee, ShoppingCart, TrendingUp, FileSpreadsheet, Wallet, Activity } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const PRODUCT_COLS = ["Tukdi", "Sasiya", "Tukdi D", "Sasiya D"];

const Reports = () => {
  // --- 1. FETCH ORDERS ---
  const { data: orders, isLoading: loadingOrders } = useQuery({
    queryKey: ["all-orders-report"],
    queryFn: async () => {
      const { data } = await (supabase.from("orders") as any)
        .select("*, customers(name, areas(area_name))")
        .order("order_date", { ascending: false });
      return data || [];
    },
  });

  // --- 2. FETCH EXPENSES ---
  const { data: expenses, isLoading: loadingExpenses } = useQuery({
    queryKey: ["all-expenses-report"],
    queryFn: async () => {
      const { data } = await (supabase.from("expenses") as any).select("*");
      return data || [];
    },
  });

  // --- 3. GROUP ORDERS (Multi-Product Logic) ---
  const groupedOrders = useMemo(() => {
    if (!orders) return [];
    const groups: Record<string, any> = {};

    orders.forEach((o: any) => {
      const dateKey = o.delivery_date || o.order_date || o.created_at?.split('T')[0];
      const key = `${o.customer_id}_${dateKey}`;

      if (!groups[key]) {
        groups[key] = {
          key,
          date: dateKey,
          customerName: o.customers?.name || "Unknown",
          areaName: o.customers?.areas?.area_name || "-",
          totalAmount: 0,
          totalKg: 0,
          products: {
            "Tukdi": 0, "Sasiya": 0, "Tukdi D": 0, "Sasiya D": 0, "Other": 0
          }
        };
      }

      groups[key].totalAmount += Number(o.total_amount || 0);
      groups[key].totalKg += Number(o.quantity_kg || 0);

      let pType = o.product_type;
      if (!PRODUCT_COLS.includes(pType)) pType = "Other";
      groups[key].products[pType] += Number(o.quantity_kg || 0);
    });

    return Object.values(groups).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [orders]);

  // --- 4. CALCULATE OVERALL STATS ---
  const calcStats = () => {
    const income = groupedOrders.reduce((sum, g) => sum + g.totalAmount, 0);
    const volume = groupedOrders.reduce((sum, g) => sum + g.totalKg, 0);
    const orderCount = groupedOrders.filter(g => g.totalKg > 0).length; // Ignore pure 'Null' groups
    const expense = (expenses || []).reduce((sum, e) => sum + Number(e.amount), 0);
    const profit = income - expense;
    return { income, volume, orderCount, expense, profit };
  };

  const stats = calcStats();

  // --- EXPORT TO EXCEL ---
  const exportReport = () => {
    if (!groupedOrders || groupedOrders.length === 0) return toast.error("No data available");
    
    const dataToExport = groupedOrders.map((g: any) => ({
      "Date": new Date(g.date).toLocaleDateString("en-IN"),
      "Customer": g.customerName,
      "Area": g.areaName,
      "Tukdi (Guni)": g.products["Tukdi"] || "-",
      "Sasiya (Guni)": g.products["Sasiya"] || "-",
      "Tukdi D (Guni)": g.products["Tukdi D"] || "-",
      "Sasiya D (Guni)": g.products["Sasiya D"] || "-",
      "Other (Guni)": g.products["Other"] || "-",
      "Total Weight (Guni)": g.totalKg,
      "Total Amount (₹)": g.totalAmount,
    }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataToExport), "Orders Report");
    XLSX.writeFile(wb, `Business_Report.xlsx`);
    toast.success("Report Downloaded!");
  };

  if (loadingOrders || loadingExpenses) {
    return <div className="p-10 text-center text-muted-foreground">Loading reports data...</div>;
  }

  return (
    <div className="space-y-10 pb-10">
      <PageHeader title="Business Reports" subtitle="Overall Performance, Profits & Analytics">
         <Button variant="outline" onClick={exportReport} className="gap-2">
            <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export Report
         </Button>
      </PageHeader>

      {/* --- DASHBOARD --- */}
      <div className="space-y-6">
        {/* Top Financials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard title="Total Income" value={`₹${stats.income.toLocaleString("en-IN")}`} icon={IndianRupee} variant="success" />
            <StatCard title="Total Expenses" value={`₹${stats.expense.toLocaleString("en-IN")}`} icon={Wallet} variant="warning" />
            
            <div className={`border rounded-xl p-6 shadow-sm flex items-center justify-between ${stats.profit >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
                <div>
                    <p className={`font-medium mb-1 ${stats.profit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>Net Profit</p>
                    <h2 className={`text-3xl font-bold ${stats.profit >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
                        ₹{stats.profit.toLocaleString("en-IN")}
                    </h2>
                </div>
                <div className={`h-12 w-12 rounded-full flex items-center justify-center ${stats.profit >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
                    <Activity className="w-6 h-6" />
                </div>
            </div>
        </div>

        {/* Operational Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <StatCard title="Volume Sold" value={`${stats.volume.toLocaleString()} Guni`} icon={TrendingUp} variant="primary" />
            <StatCard title="Total Orders" value={stats.orderCount} icon={ShoppingCart} variant="default" />
        </div>
      </div>
      
    </div>
  );
};

export default Reports;