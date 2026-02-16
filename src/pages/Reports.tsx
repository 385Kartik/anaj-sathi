import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { IndianRupee, ShoppingCart, TrendingUp, Calendar } from "lucide-react";

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
    const startOfDay = new Date(now.setHours(0,0,0,0));
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
    // Simple profit calculation (assuming 10% margin for demo, since we don't have cost price)
    // You should add a 'cost_price' column to product_rates and capture it at order time for real profit.
    const estProfit = totalSales * 0.10; 
    
    return { totalSales, totalKg, count, estProfit };
  }, [filteredOrders]);

  return (
    <div>
      <PageHeader title="Business Reports" subtitle="Analytics & Performance">
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
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard title="Total Sales" value={`₹${stats.totalSales.toLocaleString("en-IN")}`} icon={IndianRupee} variant="success" />
        <StatCard title="Total KG Sold" value={`${stats.totalKg.toLocaleString()} KG`} icon={TrendingUp} variant="primary" />
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
                        <TableHead className="text-right">Qty (KG)</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-center">Status</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {filteredOrders.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No data found</TableCell></TableRow>
                    ) : (
                        filteredOrders.map((o: any) => (
                            <TableRow key={o.id}>
                                <TableCell>{new Date(o.order_date).toLocaleDateString("en-IN")}</TableCell>
                                <TableCell>{o.customers?.name || "Unknown"}</TableCell>
                                <TableCell>{o.product_type}</TableCell>
                                <TableCell className="text-right">{o.quantity_kg}</TableCell>
                                <TableCell className="text-right">₹{o.total_amount}</TableCell>
                                <TableCell className="text-center">{o.status}</TableCell>
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