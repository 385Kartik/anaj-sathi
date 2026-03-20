import { useState, useRef, useMemo, useEffect } from "react";
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
import { Search, PlusCircle, Printer, Trash2, Edit, FileSpreadsheet, AlertTriangle, Truck } from "lucide-react";
import { toast } from "sonner";
import { useReactToPrint } from "react-to-print";
import * as XLSX from "xlsx";

const PRODUCT_COLS = ["Tukdi", "Sasiya", "Tukdi D", "Sasiya D"];

const productTranslations: Record<string, string> = {
    "Tukdi": "टुकड़ी",
    "Sasiya": "सासिया",
    "Tukdi D": "टुकड़ी दिवेल",
    "Sasiya D": "सासिया दिवेल",
    "Other": "अन्य",
    "Null": "अन्य"
};

const Orders = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    // --- REAL-TIME INPUT STATE ---
    const [searchNameInput, setSearchNameInput] = useState("");
    const [searchPhoneInput, setSearchPhoneInput] = useState("");
    const [subAreaSearchInput, setSubAreaSearchInput] = useState("");

    // --- DEBOUNCED SEARCH STATE (FOR LAG FREE PERFORMANCE) ---
    const [searchName, setSearchName] = useState("");
    const [searchPhone, setSearchPhone] = useState("");
    const [subAreaSearch, setSubAreaSearch] = useState("");

    const [areaFilter, setAreaFilter] = useState("all");
    const [paymentFilter, setPaymentFilter] = useState("all");
    const [deliveryFilter, setDeliveryFilter] = useState("all");
    const [driverFilter, setDriverFilter] = useState("all");

    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const printRef = useRef<HTMLDivElement>(null);

    // DEBOUNCING LOGIC
    useEffect(() => {
        const timer1 = setTimeout(() => setSearchName(searchNameInput), 300);
        const timer2 = setTimeout(() => setSearchPhone(searchPhoneInput), 300);
        const timer3 = setTimeout(() => setSubAreaSearch(subAreaSearchInput), 300);
        return () => { clearTimeout(timer1); clearTimeout(timer2); clearTimeout(timer3); };
    }, [searchNameInput, searchPhoneInput, subAreaSearchInput]);

    const { data: areas } = useQuery({ queryKey: ["areas"], queryFn: async () => { const { data } = await supabase.from("areas").select("*").order("area_name"); return data || []; } });
    const { data: drivers } = useQuery({ queryKey: ["drivers"], queryFn: async () => { const { data } = await supabase.from("drivers").select("*, areas(area_name)").order("name"); return data || []; } });

    const { data: orders } = useQuery({
        queryKey: ["orders"],
        queryFn: async () => {
            let query = supabase
                .from("orders")
                .select("*, customers(name, phone, address, area_id, areas(area_name)), drivers(name, phone)")
                .order("order_number", { ascending: false });
            const { data } = await query;
            return data || [];
        },
    });

    const groupedOrders = useMemo(() => {
        if (!orders) return [];
        const groups: Record<string, any> = {};

        orders.forEach((o: any) => {
            const dateKey = o.delivery_date || o.order_date;
            const key = `${o.customer_id}_${dateKey}_${o.sub_area || 'NOSUB'}`;

            if (!groups[key]) {
                groups[key] = {
                    key: key,
                    primaryId: o.id,
                    ids: [],
                    allItemIds: [],
                    allStatuses: new Set(),
                    date: dateKey,
                    customer: o.customers,
                    sub_area: o.sub_area,
                    driver: o.drivers,
                    driver_id: o.driver_id,
                    searchString: `${o.customers?.name || ""} ${o.customers?.phone || ""} ${o.sub_area || ""} ${o.customers?.areas?.area_name || ""}`.toLowerCase(),
                    products: {
                        "Tukdi": { qty: 0, amount: 0, ids: [], statuses: new Set() },
                        "Sasiya": { qty: 0, amount: 0, ids: [], statuses: new Set() },
                        "Tukdi D": { qty: 0, amount: 0, ids: [], statuses: new Set() },
                        "Sasiya D": { qty: 0, amount: 0, ids: [], statuses: new Set() },
                        "Other": { qty: 0, amount: 0, ids: [], statuses: new Set() }
                    },
                    totalAmount: 0,
                    amountPaid: 0
                };
            }

            const g = groups[key];
            g.ids.push(o.id);
            g.allItemIds.push(o.id);
            g.allStatuses.add(o.status);
            g.totalAmount += Number(o.total_amount || 0);
            g.amountPaid += Number(o.amount_paid || 0);

            let pType = o.product_type;
            if (!PRODUCT_COLS.includes(pType)) pType = "Other";

            g.products[pType].qty += Number(o.quantity_kg || 0);
            g.products[pType].amount += Number(o.total_amount || 0);
            g.products[pType].ids.push(o.id);
            g.products[pType].statuses.add(o.status);
        });

        return Object.values(groups).sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [orders]);

    const updateStatus = useMutation({
        mutationFn: async ({ ids, status }: { ids: string[], status: string }) => {
            const { error } = await supabase.from("orders").update({ status }).in("id", ids);
            if (error) throw error;
        },
        onSuccess: () => { toast.success("Status updated!"); setSelectedItems([]); queryClient.invalidateQueries({ queryKey: ["orders"] }); },
    });

    const updateDriver = useMutation({
        mutationFn: async ({ ids, driver_id }: { ids: string[], driver_id: string | null }) => {
            const { error } = await supabase.from("orders").update({ driver_id }).in("id", ids);
            if (error) throw error;
        },
        onSuccess: () => { toast.success("Driver assigned!"); setSelectedItems([]); queryClient.invalidateQueries({ queryKey: ["orders"] }); },
    });

    const deleteGroup = useMutation({
        mutationFn: async (ids: string[]) => { const { error } = await supabase.from("orders").delete().in("id", ids); if (error) throw error; },
        onSuccess: () => { toast.success("Orders deleted"); queryClient.invalidateQueries({ queryKey: ["orders"] }); }
    });

    const clearOldOrders = useMutation({
        mutationFn: async () => {
            const { error: delErr } = await supabase.from("orders").delete().neq("product_type", "Null").neq("product_type", "Other");
            if (delErr) throw delErr;
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
        onSuccess: () => { toast.success("Cleaned!"); queryClient.invalidateQueries({ queryKey: ["orders"] }); }
    });

    const filteredGroups = useMemo(() => {
        return groupedOrders.filter((g: any) => {
            if (searchName && !g.searchString.includes(searchName.toLowerCase())) return false;
            if (searchPhone && !g.customer?.phone?.includes(searchPhone)) return false;
            if (areaFilter !== "all" && g.customer?.area_id !== areaFilter) return false;

            const subAreaDisplay = g.sub_area === "New Year Entry" ? "" : g.sub_area;
            if (subAreaSearch && !subAreaDisplay?.toLowerCase().includes(subAreaSearch.toLowerCase())) return false;

            const pendingAmount = g.totalAmount - g.amountPaid;
            if (paymentFilter === "pending" && pendingAmount <= 0) return false;
            if (paymentFilter === "paid" && pendingAmount > 0) return false;

            if (deliveryFilter === "pending" && !g.allStatuses.has("pending")) return false;
            if (deliveryFilter === "delivered" && !g.allStatuses.has("delivered")) return false;

            if (driverFilter === "none" && g.driver_id) return false;
            if (driverFilter !== "all" && driverFilter !== "none" && g.driver_id !== driverFilter) return false;

            return true;
        });
    }, [groupedOrders, searchName, searchPhone, areaFilter, subAreaSearch, paymentFilter, deliveryFilter, driverFilter]);

    const toggleGroupSelect = (key: string) => { setSelectedGroupIds(prev => prev.includes(key) ? prev.filter(x => x !== key) : [...prev, key]); };
    const toggleAllGroups = () => { if (selectedGroupIds.length === filteredGroups.length) setSelectedGroupIds([]); else setSelectedGroupIds(filteredGroups.map((g: any) => g.key)); };

    const toggleItemSelect = (itemIds: string[]) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            const allSelected = itemIds.every(id => next.has(id));
            if (allSelected) itemIds.forEach(id => next.delete(id));
            else itemIds.forEach(id => next.add(id));
            return Array.from(next);
        });
    };

    const exportToExcel = () => {
        if (!filteredGroups.length) return toast.error("No data");
        const data = filteredGroups.map((g: any) => {
            const groupHasSpecificSelection = g.allItemIds.some((id: string) => selectedItems.includes(id));

            const getExportData = (pType: string) => {
                const item = g.products[pType];
                if (item.qty === 0) return "-";
                if (deliveryFilter !== "all" && !item.statuses.has(deliveryFilter)) return "-";
                const isSelected = item.ids.some((id: string) => selectedItems.includes(id));
                if (groupHasSpecificSelection && !isSelected) return "-";
                return item.qty;
            };

            return {
                "Date": new Date(g.date).toLocaleDateString("en-IN"),
                "Customer": g.customer?.name,
                "Phone": g.customer?.phone,
                "Area": g.customer?.areas?.area_name,
                "Sub Area": g.sub_area,
                "Tukdi": getExportData("Tukdi"),
                "Sasiya": getExportData("Sasiya"),
                "Tukdi D": getExportData("Tukdi D"),
                "Sasiya D": getExportData("Sasiya D"),
                "Total Amount": g.totalAmount,
                "Pending": g.totalAmount - g.amountPaid,
                "Driver": g.driver?.name || "-"
            };
        });
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Orders");
        XLSX.writeFile(wb, "Orders.xlsx");
        toast.success("Excel downloaded");
    };

    const handlePrint = useReactToPrint({ contentRef: printRef });

    return (
        <div className="flex flex-col h-[calc(100vh)] md:-m-8 md:p-4">

            {/* --- STICKY TOP SECTION (Will not scroll) --- */}
            <div className="shrink-0 space-y-4">
                <PageHeader title="Orders" subtitle="Manage orders & printing">
                    <span className="flex flex-wrap gap-2">
<Tabs value={deliveryFilter} onValueChange={setDeliveryFilter}>
                            <TabsList className="h-9"><TabsTrigger value="all" className="text-xs">All Orders</TabsTrigger><TabsTrigger value="pending" className="text-xs">Pending Delivery</TabsTrigger><TabsTrigger value="delivered" className="text-xs">Delivered</TabsTrigger></TabsList>
                        </Tabs>

                        {selectedGroupIds.length > 0 && <Button size="sm" onClick={() => handlePrint()} className="bg-purple-600 hover:bg-purple-700 text-white gap-2"><Printer className="w-4 h-4" /> Print Selected ({selectedGroupIds.length})</Button>}
                        <Button size="sm" variant="outline" onClick={exportToExcel} className="gap-2"><FileSpreadsheet className="w-4 h-4 text-green-600" /> Excel</Button>
                        {/* <Button size="sm" variant="destructive" onClick={() => { if (confirm("Clean old history?")) clearOldOrders.mutate(); }} className="gap-2"><AlertTriangle className="w-4 h-4" /> Cleanup</Button> */}
                        <Link to="/orders/new"><Button size="sm" className="bg-primary text-primary-foreground gap-2"><PlusCircle className="w-4 h-4" /> New Order</Button></Link>
                    </span>

                </PageHeader>



                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 bg-card p-2 rounded-xl border shadow-sm">
                    <Input value={searchNameInput} onChange={e => setSearchNameInput(e.target.value)} placeholder="Search Name..." className="h-9" />
                    <Input value={searchPhoneInput} onChange={e => setSearchPhoneInput(e.target.value)} placeholder="Phone..." className="h-9" />
                    <Select value={areaFilter} onValueChange={setAreaFilter}><SelectTrigger className="h-9"><SelectValue placeholder="All Areas" /></SelectTrigger><SelectContent><SelectItem value="all">All Areas</SelectItem>{areas?.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>)}</SelectContent></Select>
                    <Input value={subAreaSearchInput} onChange={e => setSubAreaSearchInput(e.target.value)} placeholder="Sub Area..." className="h-9" />
                    <Select value={paymentFilter} onValueChange={setPaymentFilter}><SelectTrigger className="h-9"><SelectValue placeholder="All Payments" /></SelectTrigger><SelectContent><SelectItem value="all">All Payments</SelectItem><SelectItem value="pending">Pending</SelectItem><SelectItem value="paid">Paid</SelectItem></SelectContent></Select>
                    <Select value={driverFilter} onValueChange={setDriverFilter}>
                        <SelectTrigger className="h-9"><SelectValue placeholder="All Drivers" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Drivers</SelectItem>
                            <SelectItem value="none">Unassigned / Self</SelectItem>
                            {drivers?.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* --- SCROLLABLE TABLE SECTION (Only rows will scroll, Header is Fixed) --- */}
            <div className="flex-1 bg-card border border-border rounded-xl mt-4 flex flex-col min-h-0 shadow-sm relative overflow-hidden">
                <div className="overflow-auto flex-1 relative scrollbar-thin scrollbar-thumb-gray-300">
                    <Table className="relative w-full">
                        <TableHeader className="sticky top-0 z-50 shadow-[0_1px_3px_rgba(0,0,0,0.1)] outline outline-1 outline-gray-200">
                            <TableRow className="bg-slate-100 hover:bg-slate-100 border-none">
                                <TableHead className="w-[40px] text-center p-3 bg-slate-100"><Checkbox checked={selectedGroupIds.length === filteredGroups.length && filteredGroups.length > 0} onCheckedChange={toggleAllGroups} /></TableHead>
                                <TableHead className="min-w-[150px] text-xs font-bold text-gray-700 p-3 bg-slate-100">Customer</TableHead>
                                {PRODUCT_COLS.map(col => <TableHead key={col} className="text-center text-xs font-bold text-blue-800 min-w-[120px] p-3 bg-slate-100">{col}</TableHead>)}
                                <TableHead className="text-right text-xs font-bold text-gray-700 p-3 bg-slate-100">Total</TableHead>
                                <TableHead className="text-right text-xs font-bold text-red-600 p-3 bg-slate-100">Payment</TableHead>
                                <TableHead className="text-center text-xs font-bold text-gray-700 min-w-[160px] p-3 bg-slate-100">Status / Driver</TableHead>
                                <TableHead className="text-center text-xs font-bold text-gray-700 p-3 bg-slate-100">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredGroups.map((group: any) => {
                                const pending = group.totalAmount - group.amountPaid;
                                const displaySubArea = group.sub_area === "New Year Entry" ? "" : group.sub_area;

                                let displayStatus = "pending";
                                if (deliveryFilter === "delivered") displayStatus = "delivered";
                                else if (deliveryFilter === "pending") displayStatus = "pending";
                                else displayStatus = group.allStatuses.has("pending") ? "pending" : "delivered";

                                return (
                                    <TableRow key={group.key} className="hover:bg-muted/50 border-b border-gray-100 transition-colors">
                                        <TableCell className="text-center p-2"><Checkbox checked={selectedGroupIds.includes(group.key)} onCheckedChange={() => toggleGroupSelect(group.key)} /></TableCell>
                                        <TableCell className="p-2">
                                            <div>
                                                <p className="font-bold text-[14px] leading-tight text-gray-800">{group.customer?.name}</p>
                                                <p className="text-[12px] text-muted-foreground leading-tight mt-0.5">{group.customer?.phone}</p>
                                                <p className="text-[12px] font-bold text-primary leading-tight mt-0.5">{group.customer?.areas?.area_name} {displaySubArea && `(${displaySubArea})`}</p>
                                            </div>
                                        </TableCell>

                                        {/* COMPACT PRODUCT CARDS */}
                                        {PRODUCT_COLS.map(colKey => {
                                            const pData = group.products[colKey];
                                            const hasData = pData && pData.qty > 0;
                                            const isChecked = pData.ids.every((id: string) => selectedItems.includes(id));
                                            const isVisibleInTab = deliveryFilter === "all" || pData.statuses.has(deliveryFilter);

                                            return (
                                                <TableCell key={colKey} className={`text-center align-middle p-2 ${hasData && isVisibleInTab ? '' : 'text-muted-foreground/30 opacity-40'}`}>
                                                    {hasData && isVisibleInTab ? (
                                                        <div className="flex flex-col items-center justify-center p-2 bg-white rounded-xl border border-gray-200">
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <Checkbox checked={isChecked} onCheckedChange={() => toggleItemSelect(pData.ids)} className="w-3.5 h-3.5 rounded-sm border-gray-400 data-[state=checked]:bg-primary" />
                                                                <span className="font-bold text-[13px] whitespace-nowrap">{pData.qty} Guni</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-[11px] text-muted-foreground font-bold">₹{pData.amount}</span>
                                                                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider ${pData.statuses.has('pending') ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                                                                    {Array.from(pData.statuses).join(' & ')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ) : "-"}
                                                </TableCell>
                                            )
                                        })}

                                        <TableCell className="text-right font-bold align-middle text-[14px] p-2">₹{group.totalAmount.toLocaleString("en-IN")}</TableCell>
                                        <TableCell className={`text-right font-bold text-[13px] align-middle p-2 ${pending > 0 ? "text-red-600" : "text-green-600"}`}>{pending > 0 ? `₹${pending.toLocaleString("en-IN")}` : "Paid"}</TableCell>

                                        <TableCell className="p-2 align-middle">
                                            <div className="flex flex-col gap-1.5 items-center w-full">
                                                <Select value={displayStatus} onValueChange={(val) => {
                                                    const selectedInGroup = group.allItemIds.filter((id: string) => selectedItems.includes(id));
                                                    const idsToUpdate = selectedInGroup.length > 0 ? selectedInGroup : group.allItemIds;
                                                    updateStatus.mutate({ ids: idsToUpdate, status: val });
                                                }}>
                                                    <SelectTrigger className={`h-8 text-[11px] w-full min-w-[140px] max-w-[160px] font-bold border focus:ring-0 ${displayStatus === 'delivered' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="pending" className="text-xs font-bold text-amber-700">Pending</SelectItem>
                                                        <SelectItem value="delivered" className="text-xs font-bold text-green-700">Delivered</SelectItem>
                                                    </SelectContent>
                                                </Select>

                                                {/* FIX FOR DRIVER SQUISHING: Line clamp added to prevent wrapping */}
                                                <Select defaultValue={group.driver_id || "none"} onValueChange={(val) => {
                                                    const selectedInGroup = group.allItemIds.filter((id: string) => selectedItems.includes(id));
                                                    const idsToUpdate = selectedInGroup.length > 0 ? selectedInGroup : group.allItemIds;
                                                    updateDriver.mutate({ ids: idsToUpdate, driver_id: val === "none" ? null : val });
                                                }}>
                                                    <SelectTrigger className="h-8 text-[11px] w-full min-w-[140px] max-w-[160px] border-dashed border-2 border-gray-300 bg-gray-50 focus:ring-0 hover:bg-gray-100 transition-colors [&>span]:truncate [&>span]:block">
                                                        <div className="flex items-center gap-1.5 overflow-hidden w-full">
                                                            <Truck className="w-3 h-3 text-gray-500 shrink-0" />
                                                            <span className="truncate flex-1 text-left font-semibold text-gray-700"><SelectValue placeholder="Driver" /></span>
                                                        </div>
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="none" className="text-[11px] font-medium text-muted-foreground">Unassigned</SelectItem>
                                                        {drivers?.map((d: any) => (
                                                            <SelectItem key={d.id} value={d.id} className="text-[11px] font-semibold">
                                                                {d.name} <span className="text-gray-400 font-normal">({d.areas?.area_name || "All"})</span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </TableCell>

                                        <TableCell className="text-center align-middle p-2">
                                            <div className="flex justify-center gap-1">
                                                <Button size="icon" variant="outline" className="h-8 w-8 bg-white shadow-sm border-gray-300 hover:bg-gray-50" onClick={() => navigate(`/orders/edit/${group.primaryId}`)}><Edit className="w-3.5 h-3.5 text-blue-600" /></Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => { if (confirm("Delete entire order set?")) deleteGroup.mutate(group.ids); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                            {filteredGroups.length === 0 && <TableRow><TableCell colSpan={10} className="text-center py-10 text-muted-foreground">No orders found</TableCell></TableRow>}
                        </TableBody>
                    </Table>
                </div>
            </div>

            {/* --- PRINT SLIP --- */}
            <div style={{ display: "none" }}>
                <div ref={printRef}>
                    {filteredGroups.filter((g: any) => selectedGroupIds.includes(g.key)).map((group: any) => {

                        const groupHasSpecificSelection = group.allItemIds.some((id: string) => selectedItems.includes(id));

                        const itemsToPrint = [...PRODUCT_COLS, "Other"].map(p => {
                            const item = group.products[p];
                            if (item.qty === 0) return null;
                            if (deliveryFilter !== "all" && !item.statuses.has(deliveryFilter)) return null;
                            const isSelected = item.ids.some((id: string) => selectedItems.includes(id));
                            if (groupHasSpecificSelection && !isSelected) return null;
                            return { name: p, ...item };
                        }).filter(Boolean);

                        if (itemsToPrint.length === 0) return null;

                        const slipTotal = itemsToPrint.reduce((sum, item) => sum + item.amount, 0);

                        return (
                            <div key={group.key} style={{ width: "80mm", padding: "1mm", fontFamily: "'Noto Sans Devanagari', sans-serif", pageBreakAfter: "always", marginBottom: "5mm" }}>
                                <div style={{ border: "1px solid black", padding: "2mm", minHeight: "300px", position: "relative" }}>
                                    <div style={{ textAlign: "center", borderBottom: "1px dashed black", paddingBottom: "2mm", marginBottom: "2mm" }}>
                                        <h3 style={{ fontSize: "16px", fontWeight: "bold", margin: "0", color: "black" }}>|| स्वामीनारायण विजयते ||</h3>
                                        <h2 style={{ fontSize: "22px", fontWeight: "bold", margin: "0" }}>WHEATFLOW</h2>
                                    </div>
                                    <div style={{ fontSize: "12px", marginBottom: "2mm", borderBottom: "1px solid #eee", paddingBottom: "1mm" }}><div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "15px" }}><span><strong>Date:</strong> {new Date(group.date).toLocaleDateString("en-IN")}</span></div></div>

                                    <div style={{ fontSize: "12px", marginBottom: "3mm" }}>
                                        <p style={{ fontWeight: "bold", fontSize: "15px", textTransform: "uppercase", margin: "2px 0" }}>{group.customer?.name}</p> <br />
                                        <p style={{ margin: "0", fontWeight: "bold", fontSize: "15px" }}>{group.customer?.address}</p>
                                        <p style={{ margin: "0", fontWeight: "bold", fontSize: "15px" }}>{group.sub_area && `${group.sub_area}, `} {group.customer?.areas?.area_name}</p> <br />
                                        <p style={{ fontWeight: "bold", margin: "2px 0", fontSize: "15px" }}>Mob: {group.customer?.phone}</p>
                                    </div>

                                    <table style={{ width: "100%", fontSize: "15px", borderCollapse: "collapse", marginBottom: "3mm" }}>
                                        <thead>
                                            <tr style={{ borderTop: "1px solid black", borderBottom: "1px solid black" }}>
                                                <th style={{ textAlign: "left", padding: "1mm 0", width: "40%" }}>विवरण (Item)</th>
                                                <th style={{ textAlign: "center", fontWeight: "bold", fontSize: "15px", width: "30%" }}>मात्रा (Qty)</th>
                                                <th style={{ textAlign: "right", fontWeight: "bold", fontSize: "15px", width: "30%" }}>रकम (Amt)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {itemsToPrint.map((item: any) => (
                                                <tr key={item.name}>
                                                    <td style={{ padding: "1.5mm 0", fontWeight: "bold", fontSize: "15px" }}>{productTranslations[item.name] || item.name}</td>
                                                    <td style={{ textAlign: "center", fontWeight: "bold", fontSize: "15px" }}>{item.qty} गुनी</td>
                                                    <td style={{ textAlign: "right", fontWeight: "bold", fontSize: "15px" }}>₹{item.amount}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    <div style={{ fontSize: "16px", borderTop: "1px dashed black", paddingTop: "2mm", textAlign: "right", fontWeight: "bold" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                            <span>कुल (Total):</span>
                                            <span>₹{slipTotal}</span>
                                        </div>
                                    </div>

                                    <div style={{ marginTop: "15mm", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                                        <div style={{ fontSize: "15px", maxWidth: "50%" }}>
                                            {group.driver ? (
                                                <>
                                                    <div style={{ fontWeight: "bold" }}>डिलिवरी (Delivery By):</div>
                                                    <div style={{ fontWeight: "bold" }}>{group.driver.name}</div>
                                                    <div style={{ fontWeight: "bold" }}>{group.driver.phone}</div>
                                                </>
                                            ) : (
                                                <div style={{ fontWeight: "bold", fontSize: "15px" }}>स्वयं पिकअप (Self Pickup)</div>
                                            )}
                                        </div>
                                        <div style={{ textAlign: "center" }}>
                                            <div style={{ borderBottom: "1px solid black", width: "35mm", marginBottom: "2mm" }}></div>
                                            <div style={{ fontSize: "10px", fontWeight: "bold" }}>हस्ताक्षर (Sign)</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
};
export default Orders;
