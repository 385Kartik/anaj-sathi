import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Package, Plus, TrendingUp, Pencil } from "lucide-react";
import { motion } from "framer-motion";

const Stock = () => {
  const queryClient = useQueryClient();
  
  // --- ADD STOCK STATES ---
  const [addOpen, setAddOpen] = useState(false);
  const [addProduct, setAddProduct] = useState("");
  const [addQty, setAddQty] = useState("");

  // --- EDIT STOCK STATES ---
  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [editQty, setEditQty] = useState("");

  const [editRates, setEditRates] = useState<Record<string, string>>({});

  // --- QUERIES ---
  const { data: stock } = useQuery({
    queryKey: ["stock"],
    queryFn: async () => {
      const { data } = await supabase.from("stock").select("*").order("product_type");
      return data || [];
    },
  });

  const { data: rates } = useQuery({
    queryKey: ["product-rates"],
    queryFn: async () => {
      const { data } = await supabase.from("product_rates").select("*");
      return data || [];
    },
  });

  // --- MUTATION: ADD STOCK (Increment) ---
  const addStock = useMutation({
    mutationFn: async () => {
      const { data: item, error: fetchError } = await supabase
        .from("stock").select("*").eq("product_type", addProduct).single();
      
      if (fetchError || !item) throw new Error("Product not found");

      const newQty = Number(item.quantity_kg) + Number(addQty);

      const { error } = await supabase
        .from("stock")
        .update({ quantity_kg: newQty, last_updated: new Date().toISOString() })
        .eq("id", item.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock added successfully!");
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      setAddOpen(false); setAddQty(""); setAddProduct("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // --- MUTATION: EDIT STOCK (Manual Correction) ---
  const updateStockQty = useMutation({
    mutationFn: async () => {
      if(!editingItem) return;
      const { error } = await supabase
        .from("stock")
        .update({ quantity_kg: Number(editQty), last_updated: new Date().toISOString() })
        .eq("id", editingItem.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stock corrected successfully!");
      queryClient.invalidateQueries({ queryKey: ["stock"] });
      setEditOpen(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  // --- MUTATION: UPDATE RATES ---
  const updateRate = useMutation({
    mutationFn: async ({ productType, rate }: { productType: string; rate: number }) => {
      const { error } = await supabase.from("product_rates").update({ rate_per_kg: rate }).eq("product_type", productType);
      if(error) throw error;
    },
    onSuccess: () => {
      toast.success("Rate updated!");
      queryClient.invalidateQueries({ queryKey: ["product-rates"] });
    },
  });

  return (
    <div>
      <PageHeader title="Stock Management" subtitle="Track inventory levels and rates">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
              <Plus className="w-4 h-4" /> Add Incoming Stock
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Incoming Stock</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>Product Type</Label>
                <Select value={addProduct} onValueChange={setAddProduct}>
                  <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                  <SelectContent>
                    {["Tukdi", "Sasiya", "Tukdi D", "Sasiya D"].map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantity to Add (Guni)</Label>
                <Input type="number" value={addQty} onChange={(e) => setAddQty(e.target.value)} placeholder="e.g. 50" />
              </div>
              <Button onClick={() => addStock.mutate()} disabled={!addProduct || !addQty} className="w-full">
                Add Stock
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </PageHeader>

      {/* STOCK CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stock?.map((item, i) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`bg-card border rounded-xl p-5 relative ${
              Number(item.quantity_kg) <= Number(item.low_stock_threshold) ? "border-destructive/30 bg-destructive/5" : "border-border"
            }`}
          >
            {/* Edit Button */}
            <Button 
                size="icon" 
                variant="ghost" 
                className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-primary"
                onClick={() => {
                    setEditingItem(item);
                    setEditQty(String(item.quantity_kg));
                    setEditOpen(true);
                }}
            >
                <Pencil className="w-4 h-4" />
            </Button>

            <div className="flex items-center gap-2 mb-3">
              <Package className="w-5 h-5 text-primary" />
              <h3 className="font-display font-semibold text-foreground">{item.product_type}</h3>
            </div>
            <p className="text-3xl font-bold font-display text-foreground">{Number(item.quantity_kg).toLocaleString()}</p>
            <p className="text-sm text-muted-foreground">Guni in stock</p>
            {Number(item.quantity_kg) <= Number(item.low_stock_threshold) && (
              <p className="text-xs text-destructive mt-2 font-medium">⚠ Low stock alert</p>
            )}
          </motion.div>
        ))}
      </div>

      {/* EDIT STOCK DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
            <DialogHeader><DialogTitle>Edit Stock Level: {editingItem?.product_type}</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
                <p className="text-sm text-muted-foreground">Manually correct the current stock quantity.</p>
                <div>
                    <Label>Current Quantity (Guni)</Label>
                    <Input type="number" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
                </div>
                <Button onClick={() => updateStockQty.mutate()} className="w-full">Update Quantity</Button>
            </div>
        </DialogContent>
      </Dialog>

      {/* RATES SECTION */}
      <div className="bg-card border border-border rounded-xl p-6">
        <h2 className="font-display font-semibold text-lg mb-4 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" /> Product Rates (₹/Guni)
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {rates?.map((rate) => (
            <div key={rate.id} className="space-y-2">
              <Label>{rate.product_type}</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={editRates[rate.product_type] ?? String(rate.rate_per_kg)}
                  onChange={(e) => setEditRates((prev) => ({ ...prev, [rate.product_type]: e.target.value }))}
                  placeholder="₹0"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateRate.mutate({ productType: rate.product_type, rate: Number(editRates[rate.product_type] ?? rate.rate_per_kg) })}
                >
                  Save
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Stock;