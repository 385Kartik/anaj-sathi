import { useState, useRef, useMemo } from "react";
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
import { Search, PlusCircle, Printer, Trash2, Edit, FileSpreadsheet, Truck, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";

// Fixed Columns Configuration
const PRODUCT_COLS = ["Tukdi", "Sasiya", "Tukdi D", "Sasiya D"];

// Product Translations for Hindi Print
const productTranslations: Record<string, string> = {
  "Tukdi": "टुकड़ी", 
  "Sasiya": "सासिया", 
  "Tukdi D": "टुकड़ी डिवेल", 
  "Sasiya D": "सासिया डिवेल", 
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
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
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
        // Fetching address as requested
        .select("*, customers(name, phone, address, area_id, areas(area_name)), drivers(name, phone)")
        .order("order_number", { ascending: false }); 
      const { data } = await query;
      return data || [];
    },
  });

  // --- GROUPING LOGIC ---
  const groupedOrders = useMemo(() => {
    if (!orders) return [];

    const groups: Record<string, any> = {};

    orders.forEach((o: any) => {
        // Unique Key
        const dateKey = o.delivery_date || o.order_date; 
        const key = `${o.customer_id}_${dateKey}_${o.sub_area || 'NOSUB'}`;

        if (!groups[key]) {
            groups[key] = {
                key: key,
                primaryId: o.id, 
                ids: [], 
                date: dateKey,
                customer: o.customers,
                sub_area: o.sub_area,
                driver: o.drivers,
                status: o.status,
                products: {
                    "Tukdi": { qty: 0, amount: 0 },
                    "Sasiya": { qty: 0, amount: 0 },
                    "Tukdi D": { qty: 0, amount: 0 },
                    "Sasiya D": { qty: 0, amount: 0 },
                    "Other": { qty: 0, amount: 0 } 
                },
                totalAmount: 0,
                amountPaid: 0
            };
        }

        const g = groups[key];
        g.ids.push(o.id);
        g.totalAmount += Number(o.total_amount || 0);
        g.amountPaid += Number(o.amount_paid || 0);

        let pType = o.product_type;
        if (!PRODUCT_COLS.includes(pType)) {
            pType = "Other";
        }

        g.products[pType].qty += Number(o.quantity_kg || 0);
        g.products[pType].amount += Number(o.total_amount || 0);
    });

    return Object.values(groups).sort((a: any, b: any) => 
        new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [orders]);


  // --- MUTATIONS ---
  const updateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[], status: string }) => {
        const { error } = await supabase.from("orders").update({ status }).in("id", ids);
        if(error) throw error;
    },
    onSuccess: () => {
        toast.success("Status updated!");
        queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  const deleteGroup = useMutation({
    mutationFn: async (ids: string[]) => {
        const { error } = await supabase.from("orders").delete().in("id", ids);
        if(error) throw error;
    },
    onSuccess: () => {
        toast.success("Orders deleted");
        queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });

  const clearOldOrders = useMutation({
    mutationFn: async () => {
      const { error: delErr } = await supabase.from("orders").delete().neq("product_type", "Null").neq("product_type", "Other");
      if(delErr) throw delErr;

      const { data: remaining } = await supabase.from("orders").select("id, customer_id, created_at").order("created_at", { ascending: false });
      if (remaining) {
          const seen = new Set();
          const toDelete: string[] = [];
          for (const o of remaining) {
              if (seen.has(o.customer_id)) toDelete.push(o.id);
              else seen.add(o.customer_id);
          }
          if (toDelete.length > 0) await supabase.from("orders").delete().in("id", toDelete);
      }
    },
    onSuccess: () => {
      toast.success("Cleaned!");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    }
  });

  // --- FILTERS ---
  const filteredGroups = groupedOrders.filter((g: any) => {
    const matchesName = !searchName || g.customer?.name?.toLowerCase().includes(searchName.toLowerCase());
    const matchesPhone = !searchPhone || g.customer?.phone?.includes(searchPhone);
    const matchesArea = areaFilter === "all" || g.customer?.area_id === areaFilter;
    const subAreaDisplay = g.sub_area === "New Year Entry" ? "" : g.sub_area;
    const matchesSubArea = !subAreaSearch || subAreaDisplay?.toLowerCase().includes(subAreaSearch.toLowerCase());
    const pendingAmount = g.totalAmount - g.amountPaid;
    const matchesPayment = 
        paymentFilter === "all" ? true :
        paymentFilter === "pending" ? pendingAmount > 0 :
        paymentFilter === "paid" ? pendingAmount <= 0 : true;
    const matchesDelivery = 
        deliveryFilter === "all" ? true :
        g.status === deliveryFilter;

    return matchesName && matchesPhone && matchesArea && matchesSubArea && matchesPayment && matchesDelivery;
  });

  const toggleSelect = (key: string) => {
    setSelectedGroupIds(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]);
  };
  const toggleAll = () => {
    if (selectedGroupIds.length === filteredGroups.length) setSelectedGroupIds([]);
    else setSelectedGroupIds(filteredGroups.map((g:any) => g.key));
  };

  // --- EXPORT ---
  const exportToExcel = () => {
    if (!filteredGroups.length) return toast.error("No data");
    const data = filteredGroups.map((g: any) => ({
      "Date": new Date(g.date).toLocaleDateString("en-IN"),
      "Customer": g.customer?.name,
      "Phone": g.customer?.phone,
      "Area": g.customer?.areas?.area_name,
      "Sub Area": g.sub_area,
      "Tukdi": g.products["Tukdi"].qty > 0 ? `${g.products["Tukdi"].qty} (${g.products["Tukdi"].amount})` : "-",
      "Sasiya": g.products["Sasiya"].qty > 0 ? `${g.products["Sasiya"].qty} (${g.products["Sasiya"].amount})` : "-",
      "Tukdi D": g.products["Tukdi D"].qty > 0 ? `${g.products["Tukdi D"].qty} (${g.products["Tukdi D"].amount})` : "-",
      "Sasiya D": g.products["Sasiya D"].qty > 0 ? `${g.products["Sasiya D"].qty} (${g.products["Sasiya D"].amount})` : "-",
      "Total Amount": g.totalAmount,
      "Pending": g.totalAmount - g.amountPaid,
      "Status": g.status,
      "Driver": g.driver?.name || "-"
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, "Orders.xlsx");
    toast.success("Excel downloaded");
  };

  const handlePrint = useReactToPrint({ contentRef: printRef });

  return (
    <div>
      <PageHeader title="Orders" subtitle="Manage orders & printing">
        <div className="flex flex-wrap gap-2">
            {selectedGroupIds.length > 0 && <Button onClick={() => handlePrint()} className="bg-purple-600 hover:bg-purple-700 text-white gap-2"><Printer className="w-4 h-4" /> Print Selected ({selectedGroupIds.length})</Button>}
            <Button variant="outline" onClick={exportToExcel} className="gap-2"><FileSpreadsheet className="w-4 h-4 text-green-600" /> Excel</Button>
            <Button variant="destructive" onClick={() => { if(confirm("Clean old history?")) clearOldOrders.mutate(); }} className="gap-2"><AlertTriangle className="w-4 h-4" /> Cleanup</Button>
            <Link to="/orders/new"><Button className="bg-primary text-primary-foreground gap-2"><PlusCircle className="w-4 h-4" /> New Order</Button></Link>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-4 mb-6">
        <Tabs value={deliveryFilter} onValueChange={setDeliveryFilter} className="w-full">
            <TabsList><TabsTrigger value="all">All Orders</TabsTrigger><TabsTrigger value="pending">Pending Delivery</TabsTrigger><TabsTrigger value="delivered">Delivered</TabsTrigger></TabsList>
        </Tabs>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-card p-4 rounded-xl border shadow-sm">
            <Input value={searchName} onChange={e => setSearchName(e.target.value)} placeholder="Search Name..." className="h-9" />
            <Input value={searchPhone} onChange={e => setSearchPhone(e.target.value)} placeholder="Phone..." className="h-9" />
            <Select value={areaFilter} onValueChange={setAreaFilter}><SelectTrigger className="h-9"><SelectValue placeholder="Area" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem>{areas?.map((a:any) => <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>)}</SelectContent></Select>
            <Input value={subAreaSearch} onChange={e => setSubAreaSearch(e.target.value)} placeholder="Sub Area..." className="h-9" />
            <Select value={paymentFilter} onValueChange={setPaymentFilter}><SelectTrigger className="h-9"><SelectValue placeholder="Payment" /></SelectTrigger><SelectContent><SelectItem value="all">All</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 text-xs">
                <TableHead className="w-[30px]"><Checkbox checked={selectedGroupIds.length === filteredGroups.length && filteredGroups.length > 0} onCheckedChange={toggleAll}/></TableHead>
                <TableHead>Customer</TableHead>
                {PRODUCT_COLS.map(col => <TableHead key={col} className="text-center bg-blue-50/30 text-blue-800">{col}</TableHead>)}
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right text-red-600">Payment</TableHead>
                <TableHead className="text-center">Delivery Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.map((group: any) => {
                  const pending = group.totalAmount - group.amountPaid;
                  const displaySubArea = group.sub_area === "New Year Entry" ? "" : group.sub_area;
                  
                  return (
                    <TableRow key={group.key} className="hover:bg-muted/30">
                        <TableCell><Checkbox checked={selectedGroupIds.includes(group.key)} onCheckedChange={() => toggleSelect(group.key)} /></TableCell>
                        <TableCell>
                            <div>
                                <p className="font-medium text-sm">{group.customer?.name}</p>
                                <p className="text-xs text-muted-foreground">{group.customer?.phone}</p>
                                <p className="text-xs font-semibold text-primary">{group.customer?.areas?.area_name} {displaySubArea && `(${displaySubArea})`}</p>
                            </div>
                        </TableCell>
                        
                        {PRODUCT_COLS.map(colKey => {
                            const pData = group.products[colKey];
                            const hasData = pData && pData.qty > 0;
                            return (
                                <TableCell key={colKey} className={`text-center text-xs ${hasData ? 'font-medium' : 'text-muted-foreground/30'}`}>
                                    {hasData ? (
                                        <div className="flex flex-col">
                                            <span>{pData.qty} Guni</span>
                                            <span className="text-[10px] text-muted-foreground">₹{pData.amount}</span>
                                        </div>
                                    ) : "-"}
                                </TableCell>
                            )
                        })}

                        <TableCell className="text-right font-bold">₹{group.totalAmount}</TableCell>
                        <TableCell className={`text-right font-bold text-xs ${pending > 0 ? "text-red-600" : "text-green-600"}`}>{pending > 0 ? `₹${pending}` : "Paid"}</TableCell>
                        <TableCell className="text-center">
                            <Select defaultValue={group.status} onValueChange={(val) => updateStatus.mutate({ ids: group.ids, status: val })}>
                                <SelectTrigger className={`h-6 text-[10px] w-[90px] border-0 mx-auto ${group.status === 'delivered' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}><SelectValue /></SelectTrigger>
                                <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="delivered">Delivered</SelectItem></SelectContent>
                            </Select>
                        </TableCell>
                        <TableCell className="text-center">
                            <div className="flex justify-center gap-1">
                                <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => navigate(`/orders/edit/${group.primaryId}`)}><Edit className="w-3 h-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => { if(confirm("Delete entire order set?")) deleteGroup.mutate(group.ids); }}><Trash2 className="w-3 h-3" /></Button>
                            </div>
                        </TableCell>
                    </TableRow>
                  )
              })}
              {filteredGroups.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-8">No orders found</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* --- PRINT SLIP (Hindi Translation + Full Address) --- */}
      <div style={{ display: "none" }}>
        <div ref={printRef}>
            {filteredGroups.filter((g:any) => selectedGroupIds.includes(g.key)).map((group:any) => (
                <div key={group.key} style={{ width: "80mm", padding: "2mm", fontFamily: "'Noto Sans Devanagari', sans-serif", pageBreakAfter: "always", marginBottom: "5mm" }}>
                    <div style={{ border: "1px solid black", padding: "2mm", minHeight: "300px", position: "relative" }}>
                        <div style={{ textAlign: "center", borderBottom: "1px dashed black", paddingBottom: "2mm", marginBottom: "2mm" }}>
                            <h3 style={{ fontSize: "16px", fontWeight: "bold", margin: "0", color: "black" }}>|| स्वामीनारायण विजयते ||</h3>
                            <h2 style={{ fontSize: "22px", fontWeight: "bold", margin: "0" }}>WHEATFLOW</h2>
                        </div>
                        <div style={{ fontSize: "12px", marginBottom: "2mm", borderBottom: "1px solid #eee", paddingBottom: "1mm" }}><div style={{ display: "flex", justifyContent: "space-between" }}><span><strong>Date:</strong> {new Date(group.date).toLocaleDateString("en-IN")}</span></div></div>
                        
                        {/* CUSTOMER DETAILS WITH FULL ADDRESS IN HINDI */}
                        <div style={{ fontSize: "12px", marginBottom: "3mm" }}>
                            <p style={{ fontSize: "10px", color: "#666", margin: "0" }}>ग्राहक (Customer):</p>
                            <p style={{ fontWeight: "bold", fontSize: "14px", textTransform: "uppercase", margin: "2px 0" }}>{group.customer?.name}</p>
                            {/* Full Address Added Here */}
                            <p style={{ margin: "0" }}>{group.customer?.address}</p>
                            <p style={{ margin: "0", fontWeight: "bold" }}>{group.customer?.areas?.area_name} {group.sub_area && `, ${group.sub_area}`}</p>
                            <p style={{ fontWeight: "bold", margin: "2px 0" }}>Mob: {group.customer?.phone}</p>
                        </div>

                        {/* PRODUCT TABLE IN HINDI */}
                        <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse", marginBottom: "3mm" }}>
                            <thead>
                                <tr style={{ borderTop: "1px solid black", borderBottom: "1px solid black" }}>
                                    <th style={{ textAlign: "left", padding: "1mm 0" }}>विवरण (Item)</th>
                                    <th style={{ textAlign: "right" }}>मात्रा (Qty)</th>
                                    <th style={{ textAlign: "right" }}>रकम (Amt)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...PRODUCT_COLS, "Other"].map(p => {
                                    const item = group.products[p];
                                    if(item.qty > 0) return (
                                        <tr key={p}>
                                            {/* Translate Product Name */}
                                            <td style={{ padding: "1.5mm 0" }}>{productTranslations[p] || p}</td>
                                            <td style={{ textAlign: "right" }}>{item.qty} गुनी</td>
                                            <td style={{ textAlign: "right" }}>₹{item.amount}</td>
                                        </tr>
                                    )
                                    return null;
                                })}
                            </tbody>
                        </table>
                        
                        {/* TOTAL */}
                        <div style={{ fontSize: "16px", borderTop: "1px dashed black", paddingTop: "2mm", textAlign: "right", fontWeight: "bold" }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span>कुल (Total):</span>
                                <span>₹{group.totalAmount}</span>
                            </div>
                        </div>
                        
                        {/* FOOTER */}
                        <div style={{ marginTop: "15mm", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                            <div style={{ fontSize: "10px", maxWidth: "50%" }}>
                                {group.driver ? (
                                    <>
                                        <div>डिलिवरी (Delivery By):</div>
                                        <div style={{ fontWeight: "bold" }}>{group.driver.name}</div>
                                        <div>{group.driver.phone}</div>
                                    </>
                                ) : (
                                    <div>स्वयं पिकअप (Self Pickup)</div>
                                )}
                            </div>
                            <div style={{ textAlign: "center" }}>
                                <div style={{ borderBottom: "1px solid black", width: "35mm", marginBottom: "2mm" }}></div>
                                <div style={{ fontSize: "10px", fontWeight: "bold" }}>हस्ताक्षर (Sign)</div>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default Orders;