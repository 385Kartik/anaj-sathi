import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Pencil, IndianRupee, AlertTriangle, RefreshCw, Download } from "lucide-react";
import * as XLSX from "xlsx";

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const [newArea, setNewArea] = useState("");
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  const [editAreaModalOpen, setEditAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<any>(null);
  const [editAreaName, setEditAreaName] = useState("");
  const [newProductName, setNewProductName] = useState("");
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<any>(null);
  const [ratesInput, setRatesInput] = useState<Record<string, string>>({});

  const { data: areas } = useQuery({ queryKey: ["areas"], queryFn: async () => { const { data } = await supabase.from("areas").select("*").order("area_name"); return data || []; }, });
  const { data: globalProducts } = useQuery({ queryKey: ["global-products"], queryFn: async () => { const { data } = await supabase.from("stock").select("*").order("product_type"); return data || []; }, });
  const { data: areaRates } = useQuery({ queryKey: ["area-rates", selectedArea?.id], enabled: !!selectedArea?.id, queryFn: async () => { const { data } = await supabase.from("area_rates").select("*").eq("area_id", selectedArea.id); return data || []; }, });

  useEffect(() => { if (areaRates && areaRates.length > 0) { const newRates: Record<string, string> = {}; areaRates.forEach((r: any) => { newRates[r.product_type] = String(r.rate_per_kg); }); setRatesInput(newRates); } else { setRatesInput({}); } }, [areaRates, selectedArea]);
  
  const addArea = useMutation({ mutationFn: async () => { if(!newArea.trim()) throw new Error("Name required"); const { error } = await supabase.from("areas").insert({ area_name: newArea.trim() }); if (error) throw error; }, onSuccess: () => { toast.success("Area added!"); queryClient.invalidateQueries({ queryKey: ["areas"] }); setNewArea(""); setAreaModalOpen(false); }, onError: (e: any) => toast.error(e.message) });
  const updateArea = useMutation({ mutationFn: async () => { if(!editAreaName.trim()) throw new Error("Name required"); const { error } = await supabase.from("areas").update({ area_name: editAreaName.trim() }).eq("id", editingArea.id); if (error) throw error; }, onSuccess: () => { toast.success("Area name updated!"); queryClient.invalidateQueries({ queryKey: ["areas"] }); setEditAreaModalOpen(false); }, onError: (e: any) => toast.error(e.message) });
  const deleteArea = useMutation({ mutationFn: async (id: string) => { const { count } = await supabase.from("customers").select("*", { count: 'exact', head: true }).eq("area_id", id); if (count && count > 0) throw new Error("Cannot delete: Customers exist in this area."); const { error } = await supabase.from("areas").delete().eq("id", id); if (error) throw error; }, onSuccess: () => { toast.success("Area deleted"); queryClient.invalidateQueries({ queryKey: ["areas"] }); }, onError: (e: any) => toast.error(e.message) });
  const addProduct = useMutation({ mutationFn: async () => { const name = newProductName.trim(); if(!name) throw new Error("Name required"); await supabase.from("stock").insert({ product_type: name, quantity_kg: 0 }); await supabase.from("product_rates").insert({ product_type: name, rate_per_kg: 0 }); }, onSuccess: () => { toast.success("Variety Added!"); queryClient.invalidateQueries(); setNewProductName(""); setProductModalOpen(false); }, });
  const deleteProduct = useMutation({ mutationFn: async (productType: string) => { const { count } = await supabase.from("orders").select("*", { count: 'exact', head: true }).eq("product_type", productType); if (count && count > 0) throw new Error("Orders exist for this product. Cannot delete."); await supabase.from("stock").delete().eq("product_type", productType); await supabase.from("product_rates").delete().eq("product_type", productType); }, onSuccess: () => { toast.success("Product deleted"); queryClient.invalidateQueries(); }, onError: (e: any) => toast.error(e.message) });
  const saveAreaRates = useMutation({ mutationFn: async () => { const updates = globalProducts?.map(p => ({ area_id: selectedArea.id, product_type: p.product_type, rate_per_kg: Number(ratesInput[p.product_type] || 0) })) || []; const { error } = await supabase.from("area_rates").upsert(updates, { onConflict: 'area_id, product_type' }); if(error) throw error; }, onSuccess: () => { toast.success(`Rates updated for ${selectedArea.area_name}`); setRateModalOpen(false); queryClient.invalidateQueries({ queryKey: ["area-rates"] }); }, onError: (e:any) => toast.error(e.message) });

  // --- NEW YEAR LOGIC (ALL COLUMNS INCLUDED EXPORT) ---
  const startNewYear = useMutation({
    mutationFn: async () => {
        const dateStr = new Date().toISOString().split('T')[0];
        
        // 1. BACKUP DATA (Excel) - Fetch everything
        const { data: allCust } = await supabase.from("customers").select("*, areas(area_name)");
        const { data: allOrd } = await supabase.from("orders").select("*, customers(name, phone, areas(area_name)), drivers(name)");
        const { data: allDrv } = await supabase.from("drivers").select("*, areas(area_name)");

        // FORMAT CUSTOMERS - Keeps all fields (...c) and adds area_name
        const formattedCustomers = (allCust || []).map((c: any) => {
            const row = { ...c, area_name: c.areas?.area_name || "" };
            delete row.areas; // remove nested object for clean excel
            return row;
        });

        // FORMAT ORDERS - Keeps all fields (...o) and adds customer/driver names
        const formattedOrders = (allOrd || []).map((o: any) => {
            const row = { 
                ...o, 
                customer_name: o.customers?.name || "",
                customer_phone: o.customers?.phone || "",
                customer_area_name: o.customers?.areas?.area_name || "",
                driver_name: o.drivers?.name || ""
            };
            delete row.customers; // remove nested objects
            delete row.drivers;
            delete row.areas;
            return row;
        });

        // FORMAT DRIVERS - Keeps all fields (...d) and adds area_name
        const formattedDrivers = (allDrv || []).map((d: any) => {
            const row = { ...d, area_name: d.areas?.area_name || "" };
            delete row.areas; // remove nested object
            return row;
        });

        const custSheet = XLSX.utils.json_to_sheet(formattedCustomers);
        const ordSheet = XLSX.utils.json_to_sheet(formattedOrders);
        const drvSheet = XLSX.utils.json_to_sheet(formattedDrivers);
        
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, custSheet, "Customers");
        XLSX.utils.book_append_sheet(wb, ordSheet, "Orders");
        XLSX.utils.book_append_sheet(wb, drvSheet, "Drivers");
        
        XLSX.writeFile(wb, `Year_End_Backup_${dateStr}.xlsx`);
        toast.info("Backup downloaded successfully.");

        // 2. FETCH CUSTOMERS & HISTORY FOR SUB-AREA CLONING
        const { data: customers } = await supabase.from("customers").select("id, area_id");
        
        const { data: orderHistory } = await supabase.from("orders").select("customer_id, sub_area, created_at").order("created_at", { ascending: false });
        
        const subAreaMap: Record<string, string> = {};
        if (orderHistory) {
            orderHistory.forEach((o: any) => {
                if (!subAreaMap[o.customer_id] && o.sub_area && o.sub_area !== "New Year Entry") {
                    subAreaMap[o.customer_id] = o.sub_area;
                }
            });
        }

        if(!customers || customers.length === 0) throw new Error("No customers found.");

        // 3. CREATE NULL ENTRIES (CLONE)
        const newYearOrders = customers.map(c => ({
            customer_id: c.id,
            product_type: "Null",
            quantity_kg: 0,
            rate_per_kg: 0,
            total_amount: 0,
            amount_paid: 0,
            status: "pending",
            sub_area: subAreaMap[c.id] || null, 
            notes: "Year Start"
        }));

        const { error: insertError } = await supabase.from("orders").insert(newYearOrders);
        if(insertError) throw insertError;
    },
    onSuccess: () => {
        toast.success("New Year Started! Data cloned & Backup saved.");
        queryClient.invalidateQueries();
    },
    onError: (e: any) => toast.error("Failed: " + e.message)
  });

  const handleNewYearClick = () => {
      if(confirm("WARNING: Start New Year?\n1. Backup will auto-download.\n2. A new 'Null' order entry will be created for every customer.")) {
          if(confirm("FINAL CHECK: Are you sure? This creates a fresh start without deleting customers.")) {
              startNewYear.mutate();
          }
      }
  }

  return (
    <div className="space-y-8 pb-10">
      <PageHeader title="Settings" subtitle="Manage Areas, Products & Data" />

      <div className="bg-card border rounded-xl p-6">
        <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-bold">Areas & Pricing</h2><Button onClick={() => setAreaModalOpen(true)}>+ Add Area</Button></div>
        <div className="grid grid-cols-1 gap-3">{areas?.map(a => (<div key={a.id} className="flex flex-wrap justify-between items-center bg-muted p-3 rounded-lg gap-2"><span className="font-medium text-lg pl-2">{a.area_name}</span><div className="flex gap-2"><Button size="sm" variant="default" className="gap-2" onClick={() => { setSelectedArea(a); setRateModalOpen(true); setRatesInput({}); }}><IndianRupee className="w-3 h-3" /> Edit Prices</Button><Button size="icon" variant="outline" onClick={() => { setEditingArea(a); setEditAreaName(a.area_name); setEditAreaModalOpen(true); }}><Pencil className="w-4 h-4 text-blue-600" /></Button><Button size="icon" variant="outline" className="hover:bg-destructive/10" onClick={() => { if(confirm(`Delete area "${a.area_name}"?`)) deleteArea.mutate(a.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button></div></div>))}</div>
      </div>

      <div className="bg-card border rounded-xl p-6">
        <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-bold">Product Varieties</h2><Button onClick={() => setProductModalOpen(true)}>+ Add Variety</Button></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{globalProducts?.map(p => (<div key={p.id} className="flex justify-between items-center bg-muted p-3 rounded-lg"><span className="font-medium">{p.product_type}</span><Button variant="ghost" size="icon" onClick={() => { if(confirm(`Delete product "${p.product_type}"?`)) deleteProduct.mutate(p.product_type); }}><Trash2 className="w-4 h-4 text-destructive"/></Button></div>))}</div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 mt-8">
        <div className="flex items-center gap-2 mb-4 text-blue-700"><AlertTriangle className="w-6 h-6" /><h2 className="text-lg font-bold">New Year Data Management</h2></div>
        <p className="text-sm text-gray-600 mb-4">Clicking this will download a full Excel backup and create a <strong>"Null" order entry</strong> for every customer so you can start fresh.</p>
        <Button variant="default" className="w-full sm:w-auto gap-2 bg-blue-600 hover:bg-blue-700" onClick={handleNewYearClick} disabled={startNewYear.isPending}>
            {startNewYear.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {startNewYear.isPending ? "Processing..." : "Start New Year (Clone Data)"}
        </Button>
      </div>

      <Dialog open={rateModalOpen} onOpenChange={setRateModalOpen}><DialogContent><DialogHeader><DialogTitle>Edit Prices</DialogTitle></DialogHeader><div className="space-y-4 py-2">{globalProducts?.map(p => (<div key={p.id} className="grid grid-cols-3 items-center gap-4"><Label className="col-span-1">{p.product_type}</Label><div className="col-span-2 relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span><Input type="number" className="pl-7" placeholder="0" value={ratesInput[p.product_type] || ""} onChange={e => setRatesInput({...ratesInput, [p.product_type]: e.target.value})} /></div></div>))}<Button onClick={() => saveAreaRates.mutate()} className="w-full mt-4">Save Prices</Button></div></DialogContent></Dialog>
      <Dialog open={areaModalOpen} onOpenChange={setAreaModalOpen}><DialogContent><DialogHeader><DialogTitle>Add Area</DialogTitle></DialogHeader><Input value={newArea} onChange={e => setNewArea(e.target.value)} placeholder="Name" /><Button onClick={() => addArea.mutate()}>Add</Button></DialogContent></Dialog>
      <Dialog open={editAreaModalOpen} onOpenChange={setEditAreaModalOpen}><DialogContent><DialogHeader><DialogTitle>Rename</DialogTitle></DialogHeader><Input value={editAreaName} onChange={e => setEditAreaName(e.target.value)} /><Button onClick={() => updateArea.mutate()}>Update</Button></DialogContent></Dialog>
      <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}><DialogContent><DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader><Input value={newProductName} onChange={e => setNewProductName(e.target.value)} /><Button onClick={() => addProduct.mutate()}>Add</Button></DialogContent></Dialog>
    </div>
  );
};
export default SettingsPage;