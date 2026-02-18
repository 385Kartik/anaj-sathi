import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, PlusCircle, Printer, Trash2, Edit, FileSpreadsheet, Truck, History, Filter } from "lucide-react";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";

// Product Translations
const productTranslations: Record<string, string> = {
  "Tukdi": "टुकड़ी", 
  "Sasiya": "सासिया", 
  "Tukdi D": "टुकड़ी डीलक्स", 
  "Sasiya D": "सासिया डीलक्स", 
  "Other": "अन्य",
  "Null": "अन्य"
};

const Orders = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  
  // --- FILTERS STATE ---
  const [searchName, setSearchName] = useState("");
  const [searchPhone, setSearchPhone] = useState("");
  const [areaFilter, setAreaFilter] = useState("all");
  const [subAreaSearch, setSubAreaSearch] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");

  // --- BULK PRINT STATE ---
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  // --- QUERIES ---
  const { data: areas } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data } = await supabase.from("areas").select("*").order("area_name");
      return data || [];
    },
  });

  const { data: orders } = useQuery({
    queryKey: ["orders"],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, customers(name, phone, address, area_id, areas(area_name)), drivers(name, phone)")
        .order("created_at", { ascending: false });
      const { data } = await query;
      return data || [];
    },
  });

  // --- UPDATE STATUS MUTATION ---
  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string, status: string }) => {
        const { error } = await supabase.from("orders").update({ status }).eq("id", id);
        if(error) throw error;
    },
    onSuccess: () => {
        toast.success("Delivery status updated!");
        queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  // --- FILTER LOGIC ---
  const filtered = orders?.filter((o: any) => {
    const matchesName = !searchName || o.customers?.name?.toLowerCase().includes(searchName.toLowerCase());
    const matchesPhone = !searchPhone || o.customers?.phone?.includes(searchPhone);
    const matchesArea = areaFilter === "all" || o.customers?.area_id === areaFilter;
    
    // Sub Area Filter (ignores 'New Year Entry' text logic)
    const subAreaDisplay = o.sub_area === "New Year Entry" ? "" : o.sub_area;
    const matchesSubArea = !subAreaSearch || subAreaDisplay?.toLowerCase().includes(subAreaSearch.toLowerCase());

    const pendingAmount = o.total_amount - o.amount_paid;
    const matchesPayment = 
        paymentFilter === "all" ? true :
        paymentFilter === "pending" ? pendingAmount > 0 :
        paymentFilter === "paid" ? pendingAmount <= 0 : true;

    const matchesDelivery = 
        deliveryFilter === "all" ? true :
        o.status === deliveryFilter;

    return matchesName && matchesPhone && matchesArea && matchesSubArea && matchesPayment && matchesDelivery;
  });

  // --- SPLIT DATA LOGIC ---
  const currentYear = new Date().getFullYear();
  const currentOrders = filtered?.filter((o: any) => new Date(o.order_date).getFullYear() === currentYear) || [];
  const pastOrders = filtered?.filter((o: any) => new Date(o.order_date).getFullYear() < currentYear) || [];

  // --- DELETE ORDER ---
  const deleteOrder = useMutation({
    mutationFn: async (id: string) => {
        const { error } = await supabase.from("orders").delete().eq("id", id);
        if(error) throw error;
    },
    onSuccess: () => {
        toast.success("Order deleted");
        queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });

  // --- ACTIONS ---
  const toggleSelect = (id: string) => {
    setSelectedOrders(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const toggleAll = () => {
    if (selectedOrders.length === filtered?.length) setSelectedOrders([]);
    else setSelectedOrders(filtered?.map((o:any) => o.id) || []);
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => setSelectedOrders([]) 
  });

  const exportToExcel = () => {
    if (!filtered || filtered.length === 0) return toast.error("No data");
    const dataToExport = filtered.map((order: any) => ({
      "Order No": order.order_number,
      "Date": new Date(order.order_date).toLocaleDateString("en-IN"),
      "Customer": order.customers?.name,
      "Phone": order.customers?.phone,
      "Address": order.customers?.address,
      "Area": order.customers?.areas?.area_name,
      "Sub Area": order.sub_area === "New Year Entry" ? "" : order.sub_area, // Clean Export
      "Product": order.product_type,
      "Qty (KG)": order.quantity_kg,
      "Total Amount": order.total_amount,
      "Pending Payment": order.total_amount - order.amount_paid,
      "Delivery Status": order.status,
      "Driver Name": order.drivers?.name || "Not Assigned",
      "Driver Phone": order.drivers?.phone || "-"
    }));
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    XLSX.writeFile(workbook, `Orders_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Excel downloaded");
  };

  // --- RENDER ROW ---
  const renderRow = (order: any, isOld: boolean = false) => {
      const pending = order.total_amount - order.amount_paid;
      // FIX: Hide 'New Year Entry' text if present in DB
      const displaySubArea = order.sub_area === "New Year Entry" ? "" : order.sub_area;

      return (
        <TableRow key={order.id} className={`hover:bg-muted/30 ${isOld ? "opacity-75 bg-gray-50/50" : ""}`}>
            <TableCell><Checkbox checked={selectedOrders.includes(order.id)} onCheckedChange={() => toggleSelect(order.id)} /></TableCell>
            <TableCell className="font-mono text-xs">{order.order_number}</TableCell>
            <TableCell><div><p className="font-medium text-sm">{order.customers?.name}</p><p className="text-xs text-muted-foreground">{order.customers?.phone}</p></div></TableCell>
            <TableCell><div className="text-sm">{order.customers?.areas?.area_name}</div>{displaySubArea && <div className="text-xs font-medium text-primary">{displaySubArea}</div>}</TableCell>
            <TableCell>{order.product_type}</TableCell>
            <TableCell className="text-right bg-blue-50/30 font-medium">{order.quantity_kg} Guni</TableCell>
            <TableCell className="text-right font-medium">₹{order.total_amount}</TableCell>
            <TableCell className={`text-right font-bold bg-red-50/30 ${pending > 0 ? "text-red-600" : "text-green-600"}`}>{pending > 0 ? `₹${pending}` : "Paid"}</TableCell>
            <TableCell className="text-center">
                <Select defaultValue={order.status} onValueChange={(val) => updateStatus.mutate({id: order.id, status: val})}>
                    <SelectTrigger className={`h-7 text-xs w-[110px] border-0 ${order.status === 'delivered' ? 'bg-green-100 text-green-700 font-bold' : 'bg-yellow-100 text-yellow-700 font-bold'}`}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="delivered">Delivered</SelectItem></SelectContent>
                </Select>
            </TableCell>
            <TableCell>{order.drivers ? (<div className="flex items-center gap-1 text-xs"><Truck className="w-3 h-3 text-muted-foreground" /><span>{order.drivers.name}</span></div>) : <span className="text-xs text-muted-foreground">-</span>}</TableCell>
            <TableCell className="flex justify-center gap-2">
                <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => navigate(`/orders/edit/${order.id}`)}><Edit className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => {if(confirm("Delete?")) deleteOrder.mutate(order.id)}}><Trash2 className="w-3 h-3" /></Button>
            </TableCell>
        </TableRow>
      );
  };

  return (
    <div>
      <PageHeader title="Orders" subtitle="Manage orders & printing">
        <div className="flex gap-2">
            {selectedOrders.length > 0 && <Button onClick={() => handlePrint()} className="bg-purple-600 hover:bg-purple-700 text-white gap-2"><Printer className="w-4 h-4" /> Print Selected ({selectedOrders.length})</Button>}
            <Button variant="outline" onClick={exportToExcel} className="gap-2"><FileSpreadsheet className="w-4 h-4 text-green-600" /> Excel</Button>
            <Link to="/orders/new"><Button className="bg-primary text-primary-foreground gap-2"><PlusCircle className="w-4 h-4" /> New Order</Button></Link>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-4 mb-6">
        <Tabs value={deliveryFilter} onValueChange={setDeliveryFilter} className="w-full">
            <TabsList><TabsTrigger value="all">All Orders</TabsTrigger><TabsTrigger value="pending">Pending Delivery</TabsTrigger><TabsTrigger value="delivered">Delivered</TabsTrigger></TabsList>
        </Tabs>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-card p-4 rounded-xl border shadow-sm">
            <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={searchName} onChange={e => setSearchName(e.target.value)} placeholder="Search Name..." className="pl-8 h-9" /></div>
            <div className="relative"><Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input value={searchPhone} onChange={e => setSearchPhone(e.target.value)} placeholder="Search Phone..." className="pl-8 h-9" /></div>
            <Select value={areaFilter} onValueChange={setAreaFilter}><SelectTrigger className="h-9"><SelectValue placeholder="Filter Area" /></SelectTrigger><SelectContent><SelectItem value="all">All Areas</SelectItem>{areas?.map((a:any) => <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>)}</SelectContent></Select>
            <Input value={subAreaSearch} onChange={e => setSubAreaSearch(e.target.value)} placeholder="Filter Sub Area..." className="h-9" />
            <Select value={paymentFilter} onValueChange={setPaymentFilter}><SelectTrigger className="h-9"><SelectValue placeholder="Payment Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Payments</SelectItem><SelectItem value="pending">Pending Payment</SelectItem><SelectItem value="paid">Paid / Clear</SelectItem></SelectContent></Select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-[30px]"><Checkbox checked={selectedOrders.length === filtered?.length && filtered?.length > 0} onCheckedChange={toggleAll}/></TableHead>
                <TableHead>#</TableHead><TableHead>Customer</TableHead><TableHead>Location (Sub-Area)</TableHead><TableHead>Product</TableHead><TableHead className="text-right bg-blue-50/50">Qty</TableHead><TableHead className="text-right">Total</TableHead><TableHead className="text-right text-red-600 bg-red-50/50">Payment</TableHead><TableHead className="text-center">Delivery Status</TableHead><TableHead>Driver</TableHead><TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currentOrders.map((order: any) => renderRow(order, false))}
              {pastOrders.length > 0 && <TableRow className="bg-amber-100 hover:bg-amber-100 border-y-2 border-amber-300"><TableCell colSpan={11} className="text-center py-2 font-bold text-amber-800 flex justify-center items-center gap-2"><History className="w-4 h-4" /> PREVIOUS YEAR HISTORY ({new Date().getFullYear() - 1} & Older)</TableCell></TableRow>}
              {pastOrders.map((order: any) => renderRow(order, true))}
              {filtered?.length === 0 && <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No orders found</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* --- PRINT SLIP SECTION (FIXED HEADER & FOOTER) --- */}
      <div style={{ display: "none" }}>
        <div ref={printRef}>
            {filtered?.filter((o:any) => selectedOrders.includes(o.id)).map((order:any) => {
                // Fix for Slip: Don't print "New Year Entry"
                const slipSubArea = order.sub_area === "New Year Entry" ? "" : order.sub_area;
                return (
                <div key={order.id} style={{ width: "80mm", padding: "2mm", fontFamily: "'Noto Sans Devanagari', sans-serif", pageBreakAfter: "always", marginBottom: "5mm" }}>
                    <div style={{ border: "1px solid black", padding: "2mm", minHeight: "300px", position: "relative" }}>
                        <div style={{ textAlign: "center", borderBottom: "1px dashed black", paddingBottom: "2mm", marginBottom: "2mm" }}>
                            {/* FIX: Header Text */}
                            <h3 style={{ fontSize: "16px", fontWeight: "bold", margin: "0", color: "black" }}>|| स्वामीनारायण विजयते ||</h3>
                            <h2 style={{ fontSize: "22px", fontWeight: "bold", margin: "2px 0 0 0" }}>WHEATFLOW</h2>
                        </div>
                        <div style={{ fontSize: "12px", marginBottom: "2mm", borderBottom: "1px solid #eee", paddingBottom: "1mm" }}><div style={{ display: "flex", justifyContent: "space-between" }}><span><strong>No:</strong> {order.order_number}</span><span><strong>Date:</strong> {new Date(order.order_date).toLocaleDateString("en-IN")}</span></div></div>
                        <div style={{ fontSize: "12px", marginBottom: "3mm" }}>
                            <p style={{ fontSize: "10px", color: "#666", margin: "0" }}>ग्राहक (Customer):</p>
                            <p style={{ fontSize: "14px", fontWeight: "bold", margin: "2px 0", textTransform: "uppercase" }}>{order.customers?.name}</p>
                            <p style={{ margin: "0" }}>{order.customers?.address}</p>
                            <p style={{ margin: "0", fontWeight: "bold" }}>{order.customers?.areas?.area_name} {slipSubArea && <span>, {slipSubArea}</span>}</p>
                            <p style={{ fontWeight: "bold", margin: "2px 0" }}>Mob: {order.customers?.phone}</p>
                        </div>
                        <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse", marginBottom: "3mm" }}>
                            <thead><tr style={{ borderTop: "1px solid black", borderBottom: "1px solid black" }}><th style={{ textAlign: "left", padding: "1mm 0" }}>विवरण (Item)</th><th style={{ textAlign: "right" }}>Qty</th><th style={{ textAlign: "right" }}>Amt</th></tr></thead>
                            <tbody><tr><td style={{ padding: "1.5mm 0" }}>{productTranslations[order.product_type] || order.product_type}</td><td style={{ textAlign: "right" }}>{order.quantity_kg} Guni</td><td style={{ textAlign: "right" }}>₹{order.total_amount}</td></tr></tbody>
                        </table>
                        <div style={{ fontSize: "16px", borderTop: "1px dashed black", paddingTop: "2mm", textAlign: "right" }}><div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}><span>कुल (Total):</span><span>₹{order.total_amount}</span></div></div>
                        
                        {/* FIX: Footer with Line for Signature */}
                        <div style={{ marginTop: "15mm", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                            <div style={{ fontSize: "10px", maxWidth: "50%" }}>{order.drivers ? (<><div>Delivery By:</div><div style={{ fontWeight: "bold" }}>{order.drivers.name}</div><div>{order.drivers.phone}</div></>) : (<div>Self Pickup</div>)}</div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ borderBottom: "1px solid black", width: "35mm", marginBottom: "2mm" }}></div>
                                <div style={{ fontSize: "10px", fontWeight: "bold" }}>Customer Sign</div>
                            </div>
                        </div>
                    </div>
                </div>
            )})}
        </div>
      </div>
    </div>
  );
};

export default Orders;