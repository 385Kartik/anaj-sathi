import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, X, IndianRupee, PackagePlus, Trash2 } from "lucide-react";

const SettingsPage = () => {
  const queryClient = useQueryClient();
  const [newArea, setNewArea] = useState("");
  const [areaOpen, setAreaOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [productModalOpen, setProductModalOpen] = useState(false);
  
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [selectedArea, setSelectedArea] = useState<any>(null);
  const [ratesInput, setRatesInput] = useState<Record<string, string>>({});

  // Fetch Areas
  const { data: areas } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data } = await supabase.from("areas").select("*").order("area_name");
      return data || [];
    },
  });

  // Fetch Products
  const { data: globalProducts } = useQuery({
    queryKey: ["global-products"],
    queryFn: async () => {
      const { data } = await supabase.from("stock").select("*").order("product_type");
      return data || [];
    },
  });

  // Fetch Area Rates
  const { data: areaRates } = useQuery({
    queryKey: ["area-rates", selectedArea?.id],
    enabled: !!selectedArea?.id,
    queryFn: async () => {
      const { data } = await supabase.from("area_rates").select("*").eq("area_id", selectedArea.id);
      return data || [];
    },
  });

  const addArea = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("areas").insert({ area_name: newArea.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Area added!");
      queryClient.invalidateQueries({ queryKey: ["areas"] });
      setNewArea("");
      setAreaOpen(false);
    },
  });

  const addProduct = useMutation({
    mutationFn: async () => {
      const name = newProductName.trim();
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

  const saveAreaRates = useMutation({
    mutationFn: async () => {
       const updates = globalProducts?.map(p => ({
           area_id: selectedArea.id,
           product_type: p.product_type,
           rate_per_kg: Number(ratesInput[p.product_type] || 0)
       })) || [];
       const { error } = await supabase.from("area_rates").upsert(updates);
       if(error) throw error;
    },
    onSuccess: () => {
        toast.success("Rates updated");
        setRateModalOpen(false);
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" subtitle="Manage Everything" />

      {/* Areas */}
      <div className="bg-card border rounded-xl p-6">
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-bold">Areas</h2>
          <Button onClick={() => setAreaOpen(true)}>+ Add Area</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {areas?.map(a => (
            <div key={a.id} className="flex justify-between items-center bg-muted p-3 rounded-lg">
              <span>{a.area_name}</span>
              <Button size="sm" onClick={() => {setSelectedArea(a); setRateModalOpen(true);}}>Set Rates</Button>
            </div>
          ))}
        </div>
      </div>

      {/* Products */}
      <div className="bg-card border rounded-xl p-6">
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-bold">Products</h2>
          <Button onClick={() => setProductModalOpen(true)}>+ Add Variety</Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {globalProducts?.map(p => (
            <div key={p.id} className="flex justify-between items-center bg-muted p-3 rounded-lg">
              <span>{p.product_type}</span>
              <Button variant="ghost" onClick={() => deleteProduct.mutate(p.product_type)}><Trash2 className="w-4 h-4 text-destructive"/></Button>
            </div>
          ))}
        </div>
      </div>

      {/* Area Rate Modal */}
      <Dialog open={rateModalOpen} onOpenChange={setRateModalOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>Rates for {selectedArea?.area_name}</DialogTitle></DialogHeader>
            <div className="space-y-4">
                {globalProducts?.map(p => (
                    <div key={p.id} className="flex items-center gap-4">
                        <Label className="w-24">{p.product_type}</Label>
                        <Input type="number" value={ratesInput[p.product_type] || ""} onChange={e => setRatesInput({...ratesInput, [p.product_type]: e.target.value})} />
                    </div>
                ))}
                <Button onClick={() => saveAreaRates.mutate()} className="w-full">Save</Button>
            </div>
        </DialogContent>
      </Dialog>

      {/* Add Product Modal */}
      <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Product</DialogTitle></DialogHeader>
          <Input value={newProductName} onChange={e => setNewProductName(e.target.value)} placeholder="Name" />
          <Button onClick={() => addProduct.mutate()}>Add</Button>
        </DialogContent>
      </Dialog>

      {/* Add Area Modal */}
      <Dialog open={areaOpen} onOpenChange={setAreaOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Area</DialogTitle></DialogHeader>
          <Input value={newArea} onChange={e => setNewArea(e.target.value)} placeholder="Area Name" />
          <Button onClick={() => addArea.mutate()}>Add</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SettingsPage;