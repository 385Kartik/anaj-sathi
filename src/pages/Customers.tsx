import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, ArrowUpDown, Filter, Trash2, FileSpreadsheet, History, UserCheck } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type SortKey = "name" | "area" | "totalAmount" | "totalKg" | "orderCount";
type SortDir = "asc" | "desc";

const Customers = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [statusView, setStatusView] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  
  const currentYear = new Date().getFullYear();

  // --- QUERIES ---
  const { data: customers, isLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data } = await supabase.from("customers").select("*, areas(area_name)").order("name");
      return data || [];
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["customer-orders-full"],
    queryFn: async () => {
      const { data } = await supabase.from("orders").select("customer_id, total_amount, quantity_kg, product_type, status, order_date");
      return data || [];
    },
  });

  const { data: areas } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data } = await supabase.from("areas").select("*").order("area_name");
      return data || [];
    },
  });

  const deleteCustomer = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Customer deleted");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // --- STATS LOGIC (With Year Checking) ---
  const customerStats = useMemo(() => {
    const stats: Record<string, {
      totalAmount: number; totalKg: number; orderCount: number;
      hasPending: boolean; lastOrderYear: number;
    }> = {};
    
    orders?.forEach((o) => {
      if (!stats[o.customer_id]) {
        stats[o.customer_id] = { totalAmount: 0, totalKg: 0, orderCount: 0, hasPending: false, lastOrderYear: 0 };
      }
      const s = stats[o.customer_id];
      s.totalAmount += Number(o.total_amount);
      s.totalKg += Number(o.quantity_kg);
      s.orderCount++;
      if (o.status === "pending") s.hasPending = true;
      
      const year = new Date(o.order_date).getFullYear();
      if (year > s.lastOrderYear) s.lastOrderYear = year;
    });
    return stats;
  }, [orders]);

  // --- FILTERING & SORTING ---
  const filtered = useMemo(() => {
    let list = customers?.filter((c: any) => {
      if (search && !c.name?.toLowerCase().includes(search.toLowerCase()) && !c.phone?.includes(search)) return false;
      if (areaFilter !== "all" && c.area_id !== areaFilter) return false;
      
      const stats = customerStats?.[c.id];
      if (statusView === "pending" && !stats?.hasPending) return false;
      if (statusView === "completed" && stats?.hasPending) return false; 
      
      return true;
    }) || [];

    list.sort((a: any, b: any) => {
      const statsA = customerStats?.[a.id];
      const statsB = customerStats?.[b.id];
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = (a.name || "").localeCompare(b.name || ""); break;
        case "area": cmp = (a.areas?.area_name || "").localeCompare(b.areas?.area_name || ""); break;
        case "totalAmount": cmp = (statsA?.totalAmount || 0) - (statsB?.totalAmount || 0); break;
        case "totalKg": cmp = (statsA?.totalKg || 0) - (statsB?.totalKg || 0); break;
        case "orderCount": cmp = (statsA?.orderCount || 0) - (statsB?.orderCount || 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [customers, search, areaFilter, sortKey, sortDir, customerStats, statusView]);

  // --- SPLIT INTO ACTIVE (NEW YEAR) vs INACTIVE (OLD YEAR) ---
  const activeCustomers = filtered.filter(c => (customerStats?.[c.id]?.lastOrderYear === currentYear));
  const pastCustomers = filtered.filter(c => (customerStats?.[c.id]?.lastOrderYear || 0) < currentYear);

  const exportToExcel = () => {
    if (filtered.length === 0) return toast.error("No data found");
    const dataToExport = filtered.map((c: any) => {
      const stats = customerStats?.[c.id];
      return {
        "Group": stats?.lastOrderYear === currentYear ? "Current Year" : "History",
        "Name": c.name, "Phone": c.phone, "Area": c.areas?.area_name || "N/A",
        "Orders": stats?.orderCount || 0, "Volume": stats?.totalKg || 0, "Total": stats?.totalAmount || 0,
        "Status": stats?.hasPending ? "PENDING" : "CLEAR"
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `Customer_Report.xlsx`);
    toast.success("List exported!");
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir(key === "name" || key === "area" ? "asc" : "desc"); }
  };

  const SortIcon = ({ col }: { col: SortKey }) => (
    <ArrowUpDown className={`inline w-3.5 h-3.5 ml-1 ${sortKey === col ? "text-primary" : "text-muted-foreground/50"}`} />
  );

  // --- ROW RENDERER ---
  const renderRow = (customer: any, isOld: boolean = false) => {
      const stats = customerStats?.[customer.id];
      return (
        <TableRow key={customer.id} className={`hover:bg-muted/30 ${isOld ? "bg-gray-50 opacity-70" : ""}`}>
          <TableCell className="font-medium">{customer.name}</TableCell>
          <TableCell>{customer.phone}</TableCell>
          <TableCell>{customer.address || "-"}</TableCell>
          <TableCell>{customer.areas?.area_name || "-"}</TableCell>
          <TableCell className="text-right">{stats?.orderCount || 0}</TableCell>
          <TableCell className="text-right">{(stats?.totalKg || 0).toLocaleString()} KG</TableCell>
          <TableCell className="text-right font-medium">₹{(stats?.totalAmount || 0).toLocaleString("en-IN")}</TableCell>
          <TableCell className="text-center">
             {stats?.hasPending ? <Badge className="bg-red-100 text-red-700">Pending</Badge> : <Badge className="bg-green-100 text-green-700">Clear</Badge>}
          </TableCell>
          <TableCell>
            <Button variant="ghost" size="icon" className="text-destructive h-8 w-8" onClick={() => { if(confirm("Delete?")) deleteCustomer.mutate(customer.id); }}>
                <Trash2 className="w-4 h-4" />
            </Button>
          </TableCell>
        </TableRow>
      );
  };

  return (
    <div>
      <PageHeader title="Customers" subtitle="Customer database & history">
        <Button variant="outline" onClick={exportToExcel} className="gap-2">
            <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export List
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-4 mb-6">
        <Tabs value={statusView} onValueChange={setStatusView} className="w-full">
            <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="pending">Pending</TabsTrigger>
                <TabsTrigger value="completed">Clear</TabsTrigger>
            </TabsList>
        </Tabs>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="relative flex-1 min-w-[200px] max-w-xs"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="pl-10" /></div>
          <div className="min-w-[160px]"><Select value={areaFilter} onValueChange={setAreaFilter}><SelectTrigger><Filter className="w-3.5 h-3.5 mr-2 text-muted-foreground" /><SelectValue placeholder="Area" /></SelectTrigger><SelectContent><SelectItem value="all">All Areas</SelectItem>{areas?.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>)}</SelectContent></Select></div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead onClick={() => toggleSort("name")} className="cursor-pointer">Name <SortIcon col="name"/></TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead onClick={() => toggleSort("area")} className="cursor-pointer">Area <SortIcon col="area"/></TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("orderCount")}>Orders <SortIcon col="orderCount"/></TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("totalKg")}>Weight <SortIcon col="totalKg"/></TableHead>
                <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("totalAmount")}>Total <SortIcon col="totalAmount"/></TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8">Loading...</TableCell></TableRow>}
              
              {/* 1. CURRENT YEAR CUSTOMERS */}
              {activeCustomers.length > 0 && (
                <>
                    <TableRow className="bg-blue-100 hover:bg-blue-100 border-b-2 border-blue-200">
                        <TableCell colSpan={9} className="text-center font-bold py-2 text-blue-900 flex justify-center items-center gap-2">
                            <UserCheck className="w-4 h-4"/> CURRENT YEAR CUSTOMERS ({currentYear})
                        </TableCell>
                    </TableRow>
                    {activeCustomers.map(c => renderRow(c, false))}
                </>
              )}

              {/* 2. DIVIDER FOR OLD DATA */}
              {pastCustomers.length > 0 && (
                <>
                    <TableRow className="bg-amber-100 hover:bg-amber-100 border-y-2 border-amber-300 mt-4">
                        <TableCell colSpan={9} className="text-center font-bold py-2 text-amber-900 flex justify-center items-center gap-2">
                            <History className="w-4 h-4"/> PREVIOUS YEAR HISTORY
                        </TableCell>
                    </TableRow>
                    {pastCustomers.map(c => renderRow(c, true))}
                </>
              )}

              {activeCustomers.length === 0 && pastCustomers.length === 0 && !isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No customers found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default Customers;