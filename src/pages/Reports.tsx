import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { IndianRupee, ShoppingCart, TrendingUp, Calendar, FileSpreadsheet, History, Clock } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

const Reports = () => {
  const currentYear = new Date().getFullYear();

  const { data: orders } = useQuery({
    queryKey: ["all-orders-report"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*, customers(name)").order("order_date", { ascending: false });
      return data || [];
    },
  });

  // --- SEPARATE DATA ---
  const thisYearOrders = useMemo(() => orders?.filter((o: any) => new Date(o.order_date).getFullYear() === currentYear) || [], [orders]);
  const pastOrders = useMemo(() => orders?.filter((o: any) => new Date(o.order_date).getFullYear() < currentYear) || [], [orders]);

  // --- STATS CALCULATOR ---
  const calculateStats = (data: any[]) => {
    const totalSales = data.reduce((s, o) => s + Number(o.total_amount), 0);
    const totalKg = data.reduce((s, o) => s + Number(o.quantity_kg), 0);
    const count = data.length;
    return { totalSales, totalKg, count };
  };

  const currentStats = calculateStats(thisYearOrders);
  const pastStats = calculateStats(pastOrders);

  const exportReport = () => {
    if (!orders || orders.length === 0) return toast.error("No data");
    const dataToExport = orders.map((o: any) => ({
      "Type": new Date(o.order_date).getFullYear() === currentYear ? "Current Year" : "History",
      "Date": new Date(o.order_date).toLocaleDateString("en-IN"),
      "Customer": o.customers?.name || "Unknown",
      "Product": o.product_type,
      "Qty": o.quantity_kg,
      "Amount": o.total_amount,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dataToExport), "Full Report");
    XLSX.writeFile(wb, `Business_Report.xlsx`);
    toast.success("Downloaded!");
  };

  return (
    <div className="space-y-8">
      <PageHeader title="Business Reports" subtitle="Yearly Performance & Analytics">
         <Button variant="outline" onClick={exportReport} className="gap-2">
            <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export Full Report
         </Button>
      </PageHeader>

      {/* --- CURRENT YEAR SECTION --- */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
            <Clock className="w-6 h-6" /> Current Year ({currentYear}) Performance
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard title="Sales (Current)" value={`₹${currentStats.totalSales.toLocaleString("en-IN")}`} icon={IndianRupee} variant="success" />
            <StatCard title="Volume (Current)" value={`${currentStats.totalKg.toLocaleString()} KG`} icon={TrendingUp} variant="primary" />
            <StatCard title="Orders (Current)" value={currentStats.count} icon={ShoppingCart} variant="default" />
        </div>
      </div>

      {/* --- DIVIDER --- */}
      <hr className="border-t-2 border-dashed border-gray-300 my-8" />

      {/* --- PAST YEAR SECTION --- */}
      <div className="space-y-4 opacity-80">
        <h2 className="text-xl font-bold flex items-center gap-2 text-amber-700">
            <History className="w-6 h-6" /> Previous Years History (Old Data)
        </h2>
        
        {pastOrders.length === 0 ? (
            <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-center text-amber-800">
                No history data found for previous years.
            </div>
        ) : (
            <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                    <StatCard title="Total Past Sales" value={`₹${pastStats.totalSales.toLocaleString("en-IN")}`} icon={IndianRupee} variant="warning" />
                    <StatCard title="Total Past Volume" value={`${pastStats.totalKg.toLocaleString()} KG`} icon={TrendingUp} variant="warning" />
                    <StatCard title="Total Past Orders" value={pastStats.count} icon={ShoppingCart} variant="warning" />
                </div>

                <div className="bg-card border border-border rounded-xl p-6">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Product</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {pastOrders.map((o: any) => (
                                    <TableRow key={o.id}>
                                        <TableCell>{new Date(o.order_date).toLocaleDateString("en-IN")}</TableCell>
                                        <TableCell>{o.customers?.name}</TableCell>
                                        <TableCell>{o.product_type}</TableCell>
                                        <TableCell className="text-right">₹{o.total_amount}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </div>
            </>
        )}
      </div>
    </div>
  );
};

export default Reports;