import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button"; // Button add kiya
import { IndianRupee, ShoppingCart, TrendingUp, Calendar, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx"; // Excel library import

const Reports = () => {
  const [timeFilter, setTimeFilter] = useState("this_year");

  const { data: orders } = useQuery({
    queryKey: ["all-orders-report"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("*, customers(name)");
      return data || [];
    },
  });

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    const now = new Date();
    
    // Correct logic for time boundaries
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfYear = new Date(now.getFullYear(), 0, 1);
    
    return orders.filter(o => {
        const d = new Date(o.order_date);
        switch(timeFilter) {
            case "today": return d >= startOfDay;
            case "this_month": return d >= startOfMonth;
            case "this_year": return d >= startOfYear;
            case "all": return true;
            default: return true;
        }
    });
  }, [orders, timeFilter]);

  const stats = useMemo(() => {
    const totalSales = filteredOrders.reduce((s, o) => s + Number(o.total_amount), 0);
    const totalKg = filteredOrders.reduce((s, o) => s + Number(o.quantity_kg), 0);
    const count = filteredOrders.length;
    const estProfit = totalSales * 0.10; 
    
    return { totalSales, totalKg, count, estProfit };
  }, [filteredOrders]);

  // --- EXCEL EXPORT LOGIC ---
  const exportToExcel = () => {
    if (filteredOrders.length === 0) {
      toast.error("Is filter me koi data nahi hai.");
      return;
    }

    const dataToExport = filteredOrders.map((o: any) => ({
      "Order Date": new Date(o.order_date).toLocaleDateString("en-IN"),
      "Customer": o.customers?.name || "Unknown",
      "Product": o.product_type,
      "Quantity (Guni)": o.quantity_kg,
      "Rate (₹)": o.rate_per_kg,
      "Total Amount (₹)": o.total_amount,
      "Status": o.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reports");

    const fileName = `Business_Report_${timeFilter}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
    toast.success(`${timeFilter.replace('_', ' ')} report exported!`);
  };

  return (
    <div>
      <PageHeader title="Business Reports" subtitle="Analytics & Performance">
         <div className="flex gap-3">
            <Button variant="outline" onClick={exportToExcel} className="gap-2">
                <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export Report
            </Button>
            <div className="w-[200px]">
                <Select value={timeFilter} onValueChange={setTimeFilter}>
                    <SelectTrigger><Calendar className="w-4 h-4 mr-2"/> <SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="this_month">This Month</SelectItem>
                        <SelectItem value="this_year">This Year</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                    </SelectContent>
                </Select>
            </div>
         </div>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Sales" value={`₹${stats.totalSales.toLocaleString("en-IN")}`} icon={IndianRupee} variant="success" />
        <StatCard title="Total Guni Sold" value={`${stats.totalKg.toLocaleString()} Guni`} icon={TrendingUp} variant="primary" />
        <StatCard title="Orders Count" value={stats.count} icon={ShoppingCart} variant="default" />
        <StatCard title="Est. Profit (10%)" value={`₹${stats.estProfit.toLocaleString("en-IN")}`} icon={IndianRupee} variant="warning" />
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-display font-semibold text-lg mb-4">Detailed Breakdown ({timeFilter.replace('_', ' ')})</h2>
        
        <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty (Guni)</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No data found for this period</TableCell></TableRow>
                    ) : (
                        filteredOrders.map((o: any) => (
                            <TableRow key={o.id}>
                                <TableCell>{new Date(o.order_date).toLocaleDateString("en-IN")}</TableCell>
                                <TableCell>{o.customers?.name || "Unknown"}</TableCell>
                                <TableCell>{o.product_type}</TableCell>
                                <TableCell className="text-right">{o.quantity_kg}</TableCell>
                                <TableCell className="text-right">₹{o.total_amount}</TableCell>
                                <TableCell className="text-center">
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                        o.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                    }`}>
                                        {o.status}
                                    </span>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
      </div>
    </div>
  );
};

export default Reports;