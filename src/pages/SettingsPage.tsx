import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Trash2, Pencil, IndianRupee } from "lucide-react";

const SettingsPage = () => {
  const queryClient = useQueryClient();
  
  // --- STATES ---
  const [newArea, setNewArea] = useState("");
  const [areaModalOpen, setAreaModalOpen] = useState(false);
  
  // Edit Area State
  const [editAreaModalOpen, setEditAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState<any>(null);
  const [editAreaName, setEditAreaName] = useState("");

  // Product State
  const [newProductName, setNewProductName] = useState("");
  const [productModalOpen, setProductModalOpen] = useState(false);
  
  // Rate State
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<any>(null);
  const [ratesInput, setRatesInput] = useState<Record<string, string>>({});

  // --- QUERIES ---
  const { data: areas } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data } = await supabase.from("areas").select("*").order("area_name");
      return data || [];
    },
  });

  const { data: globalProducts } = useQuery({
    queryKey: ["global-products"],
    queryFn: async () => {
      const { data } = await supabase.from("stock").select("*").order("product_type");
      return data || [];
    },
  });

  const { data: areaRates } = useQuery({
    queryKey: ["area-rates", selectedArea?.id],
    enabled: !!selectedArea?.id,
    queryFn: async () => {
      const { data } = await supabase.from("area_rates").select("*").eq("area_id", selectedArea.id);
      return data || [];
    },
  });

  // --- EFFECTS ---
  // Jab Area Rates fetch ho jayein, to unhe input boxes me fill kar do
  useEffect(() => {
    if (areaRates && areaRates.length > 0) {
      const newRates: Record<string, string> = {};
      areaRates.forEach((r: any) => {
        newRates[r.product_type] = String(r.rate_per_kg);
      });
      setRatesInput(newRates);
    } else {
      setRatesInput({}); // Agar naya area hai to empty rakho
    }
  }, [areaRates, selectedArea]);

  // --- MUTATIONS ---

  // 1. AREA OPERATIONS
  const addArea = useMutation({
    mutationFn: async () => {
      if(!newArea.trim()) throw new Error("Name required");
      const { error } = await supabase.from("areas").insert({ area_name: newArea.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Area added!");
      queryClient.invalidateQueries({ queryKey: ["areas"] });
      setNewArea("");
      setAreaModalOpen(false);
    },
    onError: (e: any) => toast.error(e.message)
  });

  const updateArea = useMutation({
    mutationFn: async () => {
      if(!editAreaName.trim()) throw new Error("Name required");
      const { error } = await supabase.from("areas").update({ area_name: editAreaName.trim() }).eq("id", editingArea.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Area name updated!");
      queryClient.invalidateQueries({ queryKey: ["areas"] });
      setEditAreaModalOpen(false);
    },
    onError: (e: any) => toast.error(e.message)
  });

  const deleteArea = useMutation({
    mutationFn: async (id: string) => {
      // Check if orders exist (Optional safety)
      const { count } = await supabase.from("customers").select("*", { count: 'exact', head: true }).eq("area_id", id);
      if (count && count > 0) throw new Error("Cannot delete: Customers exist in this area.");
      
      const { error } = await supabase.from("areas").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Area deleted");
      queryClient.invalidateQueries({ queryKey: ["areas"] });
    },
    onError: (e: any) => toast.error(e.message)
  });

  // 2. PRODUCT OPERATIONS
  const addProduct = useMutation({
    mutationFn: async () => {
      const name = newProductName.trim();
      if(!name) throw new Error("Name required");
      await supabase.from("stock").insert({ product_type: name, quantity_kg: 0 });
      await supabase.from("product_rates").insert({ product_type: name, rate_per_kg: 0 });
    },
    onSuccess: () => {
      toast.success("Variety Added!");
      queryClient.invalidateQueries();
      setNewProductName("");
      setProductModalOpen(false);
    },
  });

  const deleteProduct = useMutation({
    mutationFn: async (productType: string) => {
      const { count } = await supabase.from("orders").select("*", { count: 'exact', head: true }).eq("product_type", productType);
      if (count && count > 0) throw new Error("Orders exist for this product. Cannot delete.");
      await supabase.from("stock").delete().eq("product_type", productType);
      await supabase.from("product_rates").delete().eq("product_type", productType);
    },
    onSuccess: () => {
      toast.success("Product deleted");
      queryClient.invalidateQueries();
    },
    onError: (e: any) => toast.error(e.message)
  });

  // 3. RATE OPERATIONS
  const saveAreaRates = useMutation({
    mutationFn: async () => {
       const updates = globalProducts?.map(p => ({
           area_id: selectedArea.id,
           product_type: p.product_type,
           rate_per_kg: Number(ratesInput[p.product_type] || 0)
       })) || [];
       
       // Upsert logic handles both Insert (new rate) and Update (edit rate)
       const { error } = await supabase.from("area_rates").upsert(updates, { onConflict: 'area_id, product_type' });
       if(error) throw error;
    },
    onSuccess: () => {
        toast.success(`Rates updated for ${selectedArea.area_name}`);
        setRateModalOpen(false);
        queryClient.invalidateQueries({ queryKey: ["area-rates"] });
    },
    onError: (e:any) => toast.error(e.message)
  });

  return (
    <div className="space-y-8 pb-10">
      <PageHeader title="Settings" subtitle="Manage Areas & Products" />

      {/* --- AREAS SECTION --- */}
      <div className="bg-card border rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Areas & Pricing</h2>
          <Button onClick={() => setAreaModalOpen(true)}>+ Add Area</Button>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {areas?.map(a => (
            <div key={a.id} className="flex flex-wrap justify-between items-center bg-muted p-3 rounded-lg gap-2">
              <span className="font-medium text-lg pl-2">{a.area_name}</span>
              
              <div className="flex gap-2">
                {/* Set Rates Button */}
                <Button 
                    size="sm" 
                    variant="default"
                    className="gap-2"
                    onClick={() => {
                        setSelectedArea(a); 
                        setRateModalOpen(true);
                        setRatesInput({}); // Reset first, Effect will fill it
                    }}
                >
                    <IndianRupee className="w-3 h-3" /> Edit Prices
                </Button>

                {/* Edit Name Button */}
                <Button 
                    size="icon" 
                    variant="outline"
                    onClick={() => {
                        setEditingArea(a);
                        setEditAreaName(a.area_name);
                        setEditAreaModalOpen(true);
                    }}
                >
                    <Pencil className="w-4 h-4 text-blue-600" />
                </Button>

                {/* Delete Button */}
                <Button 
                    size="icon" 
                    variant="outline"
                    className="hover:bg-destructive/10"
                    onClick={() => {
                        if(confirm(`Delete area "${a.area_name}"?`)) deleteArea.mutate(a.id);
                    }}
                >
                    <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
          {areas?.length === 0 && <p className="text-muted-foreground text-center py-4">No areas added yet.</p>}
        </div>
      </div>

      {/* --- PRODUCTS SECTION --- */}
      <div className="bg-card border rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Product Varieties</h2>
          <Button onClick={() => setProductModalOpen(true)}>+ Add Variety</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {globalProducts?.map(p => (
            <div key={p.id} className="flex justify-between items-center bg-muted p-3 rounded-lg">
              <span className="font-medium">{p.product_type}</span>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => {
                    if(confirm(`Delete product "${p.product_type}"?`)) deleteProduct.mutate(p.product_type);
                }}
              >
                <Trash2 className="w-4 h-4 text-destructive"/>
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* --- MODALS --- */}

      {/* 1. Edit Prices Modal */}
      <Dialog open={rateModalOpen} onOpenChange={setRateModalOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>Edit Prices: {selectedArea?.area_name}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
                {globalProducts?.map(p => (
                    <div key={p.id} className="grid grid-cols-3 items-center gap-4">
                        <Label className="col-span-1">{p.product_type}</Label>
                        <div className="col-span-2 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                            <Input 
                                type="number" 
                                className="pl-7"
                                placeholder="0"
                                value={ratesInput[p.product_type] || ""} 
                                onChange={e => setRatesInput({...ratesInput, [p.product_type]: e.target.value})} 
                            />
                        </div>
                    </div>
                ))}
                <Button onClick={() => saveAreaRates.mutate()} className="w-full mt-4">Save Prices</Button>
            </div>
        </DialogContent>
      </Dialog>

      {/* 2. Add Area Modal */}
      <Dialog open={areaModalOpen} onOpenChange={setAreaModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Area</DialogTitle></DialogHeader>
          <Input value={newArea} onChange={e => setNewArea(e.target.value)} placeholder="Area Name (e.g. Mira Road)" />
          <Button onClick={() => addArea.mutate()}>Create Area</Button>
        </DialogContent>
      </Dialog>

      {/* 3. Edit Area Name Modal */}
      <Dialog open={editAreaModalOpen} onOpenChange={setEditAreaModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Rename Area</DialogTitle></DialogHeader>
          <Input value={editAreaName} onChange={e => setEditAreaName(e.target.value)} placeholder="New Name" />
          <Button onClick={() => updateArea.mutate()}>Update Name</Button>
        </DialogContent>
      </Dialog>

      {/* 4. Add Product Modal */}
      <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Product</DialogTitle></DialogHeader>
          <Input value={newProductName} onChange={e => setNewProductName(e.target.value)} placeholder="Product Name (e.g. Lokwan)" />
          <Button onClick={() => addProduct.mutate()}>Add Product</Button>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default SettingsPage;