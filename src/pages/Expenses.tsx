import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, TrendingUp, TrendingDown, Wallet, IndianRupee } from "lucide-react";

const Expenses = () => {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");

  // --- 1. FETCH TOTAL REVENUE FROM ORDERS ---
  const { data: totalRevenue = 0, isLoading: loadingRevenue } = useQuery({
    queryKey: ["total-revenue"],
    queryFn: async () => {
      // Fetch only the total_amount column to calculate sum
      const { data } = await supabase.from("orders").select("total_amount");
      // Calculate Sum
      const total = data?.reduce((sum, order: any) => sum + (Number(order.total_amount) || 0), 0) || 0;
      return total;
    },
  });

  // --- 2. FETCH EXPENSES ---
  const { data: expenses = [], isLoading: loadingExpenses } = useQuery({
    queryKey: ["expenses"],
    queryFn: async () => {
      // FIX: Used 'as any' to bypass TypeScript checking for the new table
      const { data } = await supabase.from("expenses" as any).select("*").order("created_at", { ascending: false });
      return data || [];
    },
  });

  // Calculate Total Expense
  const totalExpense = expenses.reduce((sum: number, item: any) => sum + (Number(item.amount) || 0), 0);

  // Calculate Net Profit
  const netProfit = totalRevenue - totalExpense;

  // --- 3. ADD EXPENSE MUTATION ---
  const addExpense = useMutation({
    mutationFn: async () => {
      if (!reason || !amount) throw new Error("Please fill all fields");
      
      // FIX: Used 'as any' here too
      const { error } = await supabase.from("expenses" as any).insert({
        reason: reason,
        amount: Number(amount)
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense added!");
      setReason("");
      setAmount("");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  // --- 4. DELETE EXPENSE MUTATION ---
  const deleteExpense = useMutation({
    mutationFn: async (id: string) => {
      // FIX: Used 'as any' here too
      const { error } = await supabase.from("expenses" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense removed");
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  return (
    <div className="max-w-6xl mx-auto pb-10 px-4">
      <PageHeader title="Expense Calculator" subtitle="Track profits and manage daily expenses" />

      {/* --- DASHBOARD CARDS --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        
        {/* Total Revenue Card */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-green-700 font-medium mb-1 flex items-center gap-2"><TrendingUp className="w-4 h-4"/> Total Income (Orders)</p>
            <h2 className="text-3xl font-bold text-green-900">
              {loadingRevenue ? <Loader2 className="animate-spin w-6 h-6"/> : `₹${totalRevenue.toLocaleString('en-IN')}`}
            </h2>
          </div>
          <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center text-green-600">
            <IndianRupee className="w-6 h-6" />
          </div>
        </div>

        {/* Total Expense Card */}
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-red-700 font-medium mb-1 flex items-center gap-2"><TrendingDown className="w-4 h-4"/> Total Expenses</p>
            <h2 className="text-3xl font-bold text-red-900">
              {loadingExpenses ? <Loader2 className="animate-spin w-6 h-6"/> : `₹${totalExpense.toLocaleString('en-IN')}`}
            </h2>
          </div>
          <div className="h-12 w-12 bg-red-100 rounded-full flex items-center justify-center text-red-600">
            <Wallet className="w-6 h-6" />
          </div>
        </div>

        {/* Net Profit Card */}
        <div className={`border rounded-xl p-6 shadow-sm flex items-center justify-between ${netProfit >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
          <div>
            <p className={`${netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'} font-medium mb-1`}>Net Profit (Real-time)</p>
            <h2 className={`text-3xl font-bold ${netProfit >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
              ₹{netProfit.toLocaleString('en-IN')}
            </h2>
          </div>
          <div className={`h-12 w-12 rounded-full flex items-center justify-center ${netProfit >= 0 ? 'bg-blue-100 text-blue-600' : 'bg-orange-100 text-orange-600'}`}>
            <IndianRupee className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        
        {/* --- ADD EXPENSE FORM --- */}
        <div className="lg:col-span-1 bg-card border rounded-xl p-6 h-fit shadow-sm">
          <h3 className="font-semibold text-lg border-b pb-3 mb-4">Add New Expense</h3>
          <div className="space-y-4">
            <div>
              <Label>Expense Reason</Label>
              <Input 
                value={reason} 
                onChange={(e) => setReason(e.target.value)} 
                placeholder="e.g. Driver Salary, Diesel, Maintenance" 
              />
            </div>
            <div>
              <Label>Amount (₹)</Label>
              <Input 
                type="number" 
                value={amount} 
                onChange={(e) => setAmount(e.target.value)} 
                placeholder="0" 
              />
            </div>
            <Button 
              className="w-full mt-2" 
              onClick={() => addExpense.mutate()} 
              disabled={addExpense.isPending || !amount || !reason}
            >
              {addExpense.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Add Expense
            </Button>
          </div>
        </div>

        {/* --- EXPENSE HISTORY TABLE --- */}
        <div className="lg:col-span-2 bg-card border rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b bg-muted/30">
            <h3 className="font-semibold">Expense History</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleDateString("en-IN")}
                    </TableCell>
                    <TableCell className="font-medium">{item.reason}</TableCell>
                    <TableCell className="text-right font-bold text-red-600">
                      - ₹{item.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => { if(confirm("Delete this expense?")) deleteExpense.mutate(item.id) }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {expenses.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No expenses added yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Expenses;