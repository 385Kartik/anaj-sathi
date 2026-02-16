import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, PlusCircle, Printer, Trash2, Edit, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";

// --- HINDI TRANSLATION MAP (Product Names) ---
const productTranslations: Record<string, string> = {
  "Tukdi": "टुकड़ी",
  "Sasiya": "सासिया",
  "Tukdi D": "टुकड़ी डीलक्स",
  "Sasiya D": "सासिया डीलक्स"
};

const Orders = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  const [printOrder, setPrintOrder] = useState<any>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["orders", statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*, customers(name, phone, address, areas(area_name))")
        .order("created_at", { ascending: false });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      const { data } = await query;
      return data || [];
    },
  });

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

  const markPrinted = useMutation({
    mutationFn: async (id: string) => {
        await supabase.from("orders").update({ is_printed: true }).eq("id", id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orders"] })
  });

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    onAfterPrint: () => {
        if(printOrder) markPrinted.mutate(printOrder.id);
        setPrintOrder(null);
    }
  });

  if (printOrder && printRef.current) {
     setTimeout(() => handlePrint(), 100);
  }

  const filtered = orders?.filter((o: any) =>
    !search ||
    o.customers?.name?.toLowerCase().includes(search.toLowerCase()) ||
    o.customers?.phone?.includes(search)
  );

  // --- EXCEL EXPORT FUNCTION ---
  const exportToExcel = () => {
    if (!filtered || filtered.length === 0) {
      toast.error("Koi data nahi hai export karne ke liye.");
      return;
    }

    const dataToExport = filtered.map((order: any) => ({
      "Order No": order.order_number,
      "Date": new Date(order.order_date).toLocaleDateString("en-IN"),
      "Customer Name": order.customers?.name,
      "Phone": order.customers?.phone,
      "Area": order.customers?.areas?.area_name || "N/A",
      "Address": order.customers?.address,
      "Product": order.product_type,
      "Quantity (Guni)": order.quantity_kg,
      "Rate (₹)": order.rate_per_kg,
      "Total Amount (₹)": order.total_amount,
      "Paid Amount (₹)": order.amount_paid,
      "Pending Amount (₹)": order.total_amount - order.amount_paid,
      "Status": order.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
    XLSX.writeFile(workbook, `Orders_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Excel file download ho gayi!");
  };

  return (
    <div>
      <PageHeader title="Orders" subtitle="Manage all orders">
        <div className="flex gap-2">
            <Button variant="outline" onClick={exportToExcel} className="gap-2">
                <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export Excel
            </Button>
            <Link to="/orders/new">
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                <PlusCircle className="w-4 h-4" /> New Order
            </Button>
            </Link>
        </div>
      </PageHeader>

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer..." className="pl-10" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>#</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered?.map((order: any) => (
                  <TableRow key={order.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-sm">{order.order_number}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium text-foreground">{order.customers?.name}</p>
                        <p className="text-xs text-muted-foreground">{order.customers?.phone}</p>
                      </div>
                    </TableCell>
                    <TableCell>{order.product_type} <span className="text-xs text-muted-foreground">({order.quantity_kg}Guni)</span></TableCell>
                    <TableCell className="text-right font-medium">₹{Number(order.total_amount).toLocaleString("en-IN")}</TableCell>
                    <TableCell className="text-center">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        order.status === "delivered" ? "bg-success/10 text-success" :
                        order.status === "cancelled" ? "bg-destructive/10 text-destructive" :
                        "bg-warning/10 text-warning"
                      }`}>{order.status}</span>
                    </TableCell>
                    <TableCell className="flex justify-center gap-2">
                        <Button size="icon" variant="outline" onClick={() => setPrintOrder(order)} title="Print Slip">
                            <Printer className="w-4 h-4" />
                        </Button>
                        
                        {/* EDIT BUTTON - Disabled check removed */}
                        <Button 
                            size="icon" 
                            variant="outline" 
                            onClick={() => navigate(`/orders/edit/${order.id}`)} 
                            title="Edit Order"
                        >
                            <Edit className="w-4 h-4" />
                        </Button>

                        <Button size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => {if(confirm("Delete this order? Reports will be affected.")) deleteOrder.mutate(order.id);}}>
                            <Trash2 className="w-4 h-4" />
                        </Button>
                    </TableCell>
                  </TableRow>
                ))
              }
            </TableBody>
          </Table>
        </div>
      </div>

      {/* ===========================================
        THERMAL PRINT SLIP (3 INCH / 80mm)
        ===========================================
      */}
      <div style={{ display: "none" }}>
        <div ref={printRef} className="text-black bg-white" style={{ width: "80mm", padding: "4mm", fontFamily: "'Noto Sans Devanagari', sans-serif" }}>
            {printOrder && (
                <div style={{ border: "1px solid black", padding: "2mm" }}>
                    {/* Header */}
                    <div style={{ textAlign: "center", borderBottom: "1px dashed black", paddingBottom: "2mm", marginBottom: "2mm" }}>
                        <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: "0" }}>WHEATFLOW</h2>
                        <p style={{ fontSize: "12px", fontWeight: "bold", margin: "0" }}>थोक गेहूं वितरक</p>
                        <p style={{ fontSize: "10px", margin: "0" }}>मीरा भायंदर, महाराष्ट्र</p>
                    </div>

                    {/* Order Meta */}
                    <div style={{ fontSize: "10px", marginBottom: "2mm", borderBottom: "1px solid #eee", paddingBottom: "1mm" }}>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span><strong>No:</strong> {printOrder.order_number}</span>
                            <span><strong>Date:</strong> {new Date(printOrder.order_date).toLocaleDateString("en-IN")}</span>
                        </div>
                    </div>

                    {/* Customer Info */}
                    <div style={{ fontSize: "11px", marginBottom: "3mm" }}>
                        <p style={{ fontSize: "9px", color: "#666", margin: "0" }}>ग्राहक (Customer):</p>
                        <p style={{ fontSize: "13px", fontWeight: "bold", margin: "2px 0" }}>{printOrder.customers?.name}</p>
                        <p style={{ margin: "0" }}>{printOrder.customers?.address}</p>
                        <p style={{ margin: "0" }}>Area: {printOrder.customers?.areas?.area_name}</p>
                        <p style={{ fontWeight: "bold", margin: "2px 0" }}>Mob: {printOrder.customers?.phone}</p>
                    </div>

                    {/* Items Table */}
                    <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse", marginBottom: "3mm" }}>
                        <thead>
                            <tr style={{ borderTop: "1px solid black", borderBottom: "1px solid black" }}>
                                <th style={{ textAlign: "left", padding: "1mm 0" }}>विवरण (Item)</th>
                                <th style={{ textAlign: "right" }}>Qty</th>
                                <th style={{ textAlign: "right" }}>Amt</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ padding: "1.5mm 0" }}>
                                    {productTranslations[printOrder.product_type] || printOrder.product_type}
                                </td>
                                <td style={{ textAlign: "right" }}>{printOrder.quantity_kg}Guni</td>
                                <td style={{ textAlign: "right" }}>₹{printOrder.total_amount}</td>
                            </tr>
                        </tbody>
                    </table>

                    {/* Payment Summary */}
                    <div style={{ fontSize: "11px", borderTop: "1px dashed black", paddingTop: "2mm" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1mm" }}>
                            <span>कुल (Total):</span>
                            <span>₹{printOrder.total_amount}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "1mm" }}>
                            <span>जमा (Paid):</span>
                            <span>₹{printOrder.amount_paid}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "bold", marginTop: "1mm", borderTop: "1px solid black", paddingTop: "1mm" }}>
                            <span>बकाया (Pending):</span>
                            <span>₹{printOrder.pending_amount}</span>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ marginTop: "8mm", display: "flex", justifyContent: "space-between", fontSize: "10px" }}>
                        <div style={{ textAlign: "center" }}>
                            <div style={{ borderTop: "1px solid black", width: "25mm" }}></div>
                            <p style={{ margin: "1mm 0" }}>Customer</p>
                        </div>
                        <div style={{ textAlign: "center" }}>
                            <div style={{ borderTop: "1px solid black", width: "25mm" }}></div>
                            <p style={{ margin: "1mm 0" }}>Seller</p>
                        </div>
                    </div>
                    
                    <p style={{ textAlign: "center", fontSize: "9px", marginTop: "4mm", fontStyle: "italic" }}>Thank you for visiting!</p>
                </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default Orders;