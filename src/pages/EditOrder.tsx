import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft } from "lucide-react";

const PRODUCT_TYPES = ["Tukdi", "Sasiya", "Tukdi D", "Sasiya D"];

const EditOrder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Original Data (to calculate stock difference)
  const [originalOrder, setOriginalOrder] = useState<any>(null);

  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    productType: "",
    quantityKg: "",
    ratePerKg: "",
    amountPaid: "",
    status: ""
  });

  // Fetch Order Data
  const { data: order, isLoading } = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, customers(name, phone)")
        .eq("id", id)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Populate Form on Load
  useEffect(() => {
    if (order) {
      setOriginalOrder(order);
      setForm({
        customerName: order.customers?.name || "",
        phone: order.customers?.phone || "",
        productType: order.product_type,
        quantityKg: String(order.quantity_kg),
        ratePerKg: String(order.rate_per_kg),
        amountPaid: String(order.amount_paid),
        status: order.status
      });
    }
  }, [order]);

  // Calculate New Total dynamically
  const newTotal = Number(form.quantityKg || 0) * Number(form.ratePerKg || 0);
  const newPending = newTotal - Number(form.amountPaid || 0);

  const updateOrder = useMutation({
    mutationFn: async () => {
      if (!originalOrder) return;

      // 1. Update Customer Details (Name/Phone)
      if (originalOrder.customer_id) {
        await supabase
          .from("customers")
          .update({ name: form.customerName, phone: form.phone })
          .eq("id", originalOrder.customer_id);
      }

      // 2. Manage Stock Reversal (Dangerous Part)
      // Logic: First, put back OLD Quantity to OLD Product Stock
      const { data: oldStockItem } = await supabase
        .from("stock")
        .select("*")
        .eq("product_type", originalOrder.product_type)
        .single();

      if (oldStockItem) {
        await supabase
          .from("stock")
          .update({ quantity_kg: Number(oldStockItem.quantity_kg) + Number(originalOrder.quantity_kg) })
          .eq("id", oldStockItem.id);
      }

      // 3. Deduct NEW Quantity from NEW Product Stock
      const { data: newStockItem } = await supabase
        .from("stock")
        .select("*")
        .eq("product_type", form.productType)
        .single();

      if (newStockItem) {
        // Note: If old and new product are same, we just fetched the updated stock from step 2, so it's safe.
        // We need to fetch it FRESH again to be sure, but since we are awaiting, it should be sequential.
        // Ideally we should re-fetch to be 100% safe, but for this app complexity:
        
        // Let's re-fetch to ensure we have the stock AFTER the addition above
        const { data: freshStock } = await supabase.from("stock").select("*").eq("id", newStockItem.id).single();
        
        if(freshStock) {
             await supabase
            .from("stock")
            .update({ quantity_kg: Number(freshStock.quantity_kg) - Number(form.quantityKg) })
            .eq("id", freshStock.id);
        }
      }

      // 4. Update the Order
      const { error } = await supabase
        .from("orders")
        .update({
          product_type: form.productType,
          quantity_kg: Number(form.quantityKg),
          rate_per_kg: Number(form.ratePerKg),
          total_amount: newTotal,
          amount_paid: Number(form.amountPaid),
          status: form.status,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Order & Stock updated successfully!");
      queryClient.invalidateQueries();
      navigate("/orders");
    },
    onError: (err: any) => toast.error("Failed: " + err.message),
  });

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>;

  return (
    <div>
      <PageHeader title="Edit Order" subtitle={`Modifying Order #${originalOrder?.order_number}`}>
        <Button variant="outline" onClick={() => navigate("/orders")} className="gap-2">
            <ArrowLeft className="w-4 h-4"/> Back
        </Button>
      </PageHeader>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Customer Section */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4 h-fit">
            <h3 className="font-semibold text-lg border-b pb-2">Edit Customer Details</h3>
            
            <div>
               <Label>Customer Name</Label>
               <Input value={form.customerName} onChange={(e) => setForm({...form, customerName: e.target.value})} />
            </div>

            <div>
               <Label>Phone Number</Label>
               <Input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} maxLength={10} />
            </div>
          </div>

          {/* Product & Order Section */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h3 className="font-semibold text-lg border-b pb-2">Edit Product & Quantity</h3>
            
            <div className="p-3 bg-muted/50 rounded-lg text-sm mb-4">
                <p><strong>Original Order:</strong> {originalOrder?.product_type} - {originalOrder?.quantity_kg} KG</p>
                <p className="text-xs text-muted-foreground mt-1">Changing items here will automatically adjust your Stock.</p>
            </div>

            <div>
              <Label>Product Type</Label>
              <Select value={form.productType} onValueChange={(v) => setForm({...form, productType: v})}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
                <div>
                   <Label>Quantity (KG)</Label>
                   <Input type="number" value={form.quantityKg} onChange={(e) => setForm({...form, quantityKg: e.target.value})} />
                </div>
                <div>
                   <Label>Rate (₹/KG)</Label>
                   <Input type="number" value={form.ratePerKg} onChange={(e) => setForm({...form, ratePerKg: e.target.value})} />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-2">
                 <div className="bg-muted p-3 rounded text-center">
                    <p className="text-xs text-muted-foreground">New Total</p>
                    <p className="font-bold text-lg">₹{newTotal.toLocaleString("en-IN")}</p>
                 </div>
                 <div className="bg-muted p-3 rounded text-center">
                    <p className="text-xs text-muted-foreground">New Pending</p>
                    <p className={`font-bold text-lg ${newPending > 0 ? "text-destructive" : "text-success"}`}>
                        ₹{newPending.toLocaleString("en-IN")}
                    </p>
                 </div>
            </div>

            <div>
               <Label>Amount Paid (₹)</Label>
               <Input type="number" value={form.amountPaid} onChange={(e) => setForm({...form, amountPaid: e.target.value})} />
            </div>

            <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({...form, status: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="pt-4">
                <Button onClick={() => updateOrder.mutate()} disabled={updateOrder.isPending} className="w-full text-lg h-12">
                    {updateOrder.isPending ? "Updating..." : "Save Changes"}
                </Button>
            </div>
          </div>
      </div>
    </div>
  );
};

export default EditOrder;