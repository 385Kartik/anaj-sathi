import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, User, ShoppingBag, CreditCard, Truck } from "lucide-react";

const PRODUCT_TYPES = ["Tukdi", "Sasiya", "Tukdi D", "Sasiya D", "Other"];

interface ProductRow {
  key: string;
  qty: string;
  rate: number;
}

const NewOrder = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // Basic Form State
  const [form, setForm] = useState({
    customerName: "", phone: "", address: "", areaId: "", subArea: "", 
    amountPaid: "", driverId: "", deliveryDate: "", notes: "",
  });

  // Fixed 5 Product Rows State
  const [products, setProducts] = useState<ProductRow[]>(
    PRODUCT_TYPES.map(p => ({ key: p, qty: "", rate: 0 }))
  );

  // --- QUERIES ---
  const { data: areas } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data } = await supabase.from("areas").select("*").order("area_name");
      return data || [];
    },
  });

  const { data: drivers } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("*").order("name");
      return data || [];
    },
  });

  const { data: subAreaOptions } = useQuery({
    queryKey: ["sub-areas-list"],
    queryFn: async () => {
      // Cast to any to avoid complex TS types for this simple fetch
      const { data: orderSubs } = await supabase.from("orders").select("sub_area");
      const { data: driverSubs } = await supabase.from("drivers").select("sub_area");
      
      const allSubs = new Set([
        ...((orderSubs as any[])?.map(o => o.sub_area) || []),
        ...((driverSubs as any[])?.map(d => d.sub_area) || [])
      ]);
      return Array.from(allSubs).filter(Boolean).sort();
    }
  });

  // --- RATE LOGIC ---
  const getRate = async (pType: string, areaId: string) => {
    if (!pType || pType === "Other" || !areaId) return 0;
    
    // 1. Try Area Rate
    const { data: areaRate } = await supabase.from("area_rates")
      .select("rate_per_kg")
      .eq("area_id", areaId)
      .eq("product_type", pType)
      .maybeSingle();
      
    if (areaRate && areaRate.rate_per_kg > 0) return areaRate.rate_per_kg;

    // 2. Global Rate
    const { data: globalRate } = await supabase.from("product_rates")
      .select("rate_per_kg")
      .eq("product_type", pType)
      .maybeSingle();

    return globalRate ? globalRate.rate_per_kg : 0;
  };

  // --- EFFECTS ---
  
  // Update Rates when Area Changes
  useEffect(() => {
    const updateRates = async () => {
        if(!form.areaId) return;
        const updatedItems = await Promise.all(products.map(async (item) => {
            // Preserve manual rate for "Other" if entered, else 0
            if (item.key === "Other") return item;
            
            const newRate = await getRate(item.key, form.areaId);
            return { ...item, rate: newRate };
        }));
        setProducts(updatedItems);
    };
    updateRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.areaId]);

  // --- HANDLERS ---

  const handleProductChange = (index: number, field: keyof ProductRow, val: any) => {
    const newProducts = [...products];
    newProducts[index] = { ...newProducts[index], [field]: val };
    setProducts(newProducts);
  };

  const handlePhoneChange = async (val: string) => {
    setForm(prev => ({ ...prev, phone: val }));
    if (val.length === 10) {
      const { data: cust } = await supabase.from("customers").select("*").eq("phone", val).maybeSingle();
      if (cust) {
        setForm(prev => ({ ...prev, customerName: cust.name, address: cust.address || "", areaId: cust.area_id || "" }));
        toast.success("Existing customer found!");
      }
    }
  };

  // --- CALCULATIONS ---
  const grandTotal = products.reduce((sum, item) => sum + (Number(item.qty || 0) * item.rate), 0);
  const pendingCalc = grandTotal - Number(form.amountPaid || 0);

  // --- SUBMISSION ---
  const createOrder = useMutation({
    mutationFn: async () => {
      // 1. Customer Logic
      let customerId: string;
      const { data: existing } = await supabase.from("customers").select("id").eq("phone", form.phone).maybeSingle();

      if (existing) {
        customerId = existing.id;
        await supabase.from("customers").update({ address: form.address, area_id: form.areaId }).eq("id", customerId);
      } else {
        const { data: newCustomer, error } = await supabase.from("customers").insert({
          name: form.customerName, phone: form.phone, address: form.address, area_id: form.areaId,
        }).select("id").single();
        if (error) throw error;
        customerId = newCustomer.id;
      }

      // 2. Distribute Payment & Create Orders
      let remainingPayment = Number(form.amountPaid || 0);

      // Loop through the 5 rows
      for (const item of products) {
          const qty = Number(item.qty || 0);
          
          // Only create order if Quantity > 0
          if (qty > 0) {
              const itemTotal = qty * item.rate;
              const paidForThisItem = Math.min(itemTotal, remainingPayment);
              remainingPayment = Math.max(0, remainingPayment - paidForThisItem);

              // Insert
              // @ts-ignore
              const { error: orderError } = await supabase.from("orders").insert({
                customer_id: customerId, 
                product_type: item.key, 
                quantity_kg: qty,
                rate_per_kg: item.rate, 
                total_amount: itemTotal, 
                amount_paid: paidForThisItem, 
                driver_id: form.driverId || null, 
                delivery_date: form.deliveryDate || new Date().toISOString().split('T')[0],
                sub_area: form.subArea,
                status: "pending"
              });
              
              if (orderError) throw orderError;

              // Stock Deduction
              if(item.key !== "Other" && item.key !== "Null") {
                 const { data: stockItem } = await supabase.from("stock").select("*").eq("product_type", item.key).maybeSingle();
                 if (stockItem) {
                   await supabase.from("stock").update({ quantity_kg: Number(stockItem.quantity_kg) - qty }).eq("id", stockItem.id);
                 }
              }
          }
      }
    },
    onSuccess: () => { toast.success("Orders created successfully!"); queryClient.invalidateQueries(); navigate("/orders"); },
    onError: (err: any) => toast.error("Error: " + err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName || !form.phone || !form.areaId) { toast.error("Customer details missing."); return; }
    
    // Check if at least one item has quantity
    const hasItems = products.some(p => Number(p.qty) > 0);
    if (!hasItems) { toast.error("Please enter quantity for at least one product."); return; }
    
    if (!/^\d{10}$/.test(form.phone)) { toast.error("Invalid phone number."); return; }
    
    createOrder.mutate();
  };

  return (
    <div className="max-w-5xl mx-auto pb-20 px-4">
      <PageHeader title="New Order" subtitle="Create entry" />
      <form onSubmit={handleSubmit} className="space-y-8 mt-6">
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* LEFT: Customer & Logistics */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b pb-2"><User className="w-5 h-5 text-primary" /> <h2 className="font-semibold">Customer</h2></div>
                    <div className="space-y-3">
                        <div><Label>Phone *</Label><Input value={form.phone} onChange={(e) => handlePhoneChange(e.target.value)} maxLength={10} placeholder="Search..." /></div>
                        <div><Label>Name *</Label><Input value={form.customerName} onChange={(e) => setForm({...form, customerName: e.target.value})} /></div>
                        <div><Label>Area *</Label>
                            <Select value={form.areaId} onValueChange={(v) => setForm({...form, areaId: v})}>
                                <SelectTrigger><SelectValue placeholder="Select Area" /></SelectTrigger>
                                <SelectContent>{areas?.map((a) => <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div><Label>Sub Area</Label>
                           <Input list="subAreaOptions" value={form.subArea} onChange={(e) => setForm({...form, subArea: e.target.value})} placeholder="e.g. Phase 1" />
                           <datalist id="subAreaOptions">{subAreaOptions?.map((item: any) => <option key={item} value={item} />)}</datalist>
                        </div>
                        <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({...form, address: e.target.value})} /></div>
                    </div>
                </div>

                <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
                    <div className="flex items-center gap-2 border-b pb-2"><Truck className="w-5 h-5 text-primary" /> <h2 className="font-semibold">Logistics</h2></div>
                    <div className="space-y-3">
                        <div><Label>Driver</Label>
                            <Select value={form.driverId} onValueChange={(v) => setForm({...form, driverId: v})}>
                                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                                <SelectContent>{drivers?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div><Label>Date</Label><Input type="date" value={form.deliveryDate} onChange={(e) => setForm({...form, deliveryDate: e.target.value})} /></div>
                    </div>
                </div>
            </div>

            {/* RIGHT: Product Matrix & Payment */}
            <div className="lg:col-span-2 space-y-6">
                <div className="bg-card border rounded-xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4 border-b pb-2"><ShoppingBag className="w-5 h-5 text-primary" /> <h2 className="font-semibold">Order Items</h2></div>
                    
                    {/* Headers */}
                    <div className="grid grid-cols-12 gap-3 mb-2 text-xs font-medium text-muted-foreground px-1">
                        <div className="col-span-4">PRODUCT</div>
                        <div className="col-span-3">RATE (₹)</div>
                        <div className="col-span-3">QTY (KG)</div>
                        <div className="col-span-2 text-right">TOTAL</div>
                    </div>

                    {/* Fixed Rows */}
                    <div className="space-y-3">
                        {products.map((p, idx) => (
                            <div key={p.key} className="grid grid-cols-12 gap-3 items-center bg-muted/20 p-2 rounded border">
                                <div className="col-span-4 font-medium text-sm">{p.key}</div>
                                <div className="col-span-3">
                                    <Input 
                                        type="number" 
                                        className="h-8"
                                        value={p.rate} 
                                        readOnly={p.key !== "Other"}
                                        onChange={(e) => handleProductChange(idx, "rate", Number(e.target.value))}
                                        placeholder="Rate"
                                    />
                                </div>
                                <div className="col-span-3">
                                    <Input 
                                        type="number" 
                                        className={`h-8 text-center font-bold ${p.qty ? "bg-white border-primary" : "bg-transparent"}`}
                                        placeholder="0"
                                        value={p.qty} 
                                        onChange={(e) => handleProductChange(idx, "qty", e.target.value)}
                                    />
                                </div>
                                <div className="col-span-2 text-right text-sm font-bold">
                                    ₹{(Number(p.qty || 0) * p.rate).toLocaleString()}
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex justify-end mt-6 pt-4 border-t gap-8">
                        <div className="text-right">
                            <div className="text-sm text-muted-foreground">Grand Total</div>
                            <div className="text-3xl font-bold text-primary">₹{grandTotal.toLocaleString()}</div>
                        </div>
                    </div>
                </div>

                <div className="bg-card border rounded-xl p-5 shadow-sm">
                    <div className="flex items-center gap-2 mb-4 border-b pb-2"><CreditCard className="w-5 h-5 text-primary" /><h2 className="font-semibold">Payment</h2></div>
                    <div className="flex gap-4 items-end">
                        <div className="flex-1">
                            <Label>Amount Paid</Label>
                            <div className="relative mt-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                                <Input 
                                    type="number" 
                                    className="pl-8 text-lg font-bold"
                                    value={form.amountPaid} 
                                    onChange={e => setForm({...form, amountPaid: e.target.value})} 
                                    placeholder="0"
                                />
                            </div>
                        </div>
                        <div className="flex-1 text-right bg-muted/30 p-2 rounded">
                            <div className="text-sm text-muted-foreground">Pending Balance</div>
                            <div className={`text-xl font-bold ${pendingCalc > 0 ? "text-destructive" : "text-green-600"}`}>
                                ₹{pendingCalc.toLocaleString()}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-4">
                    <Button type="button" variant="outline" onClick={() => navigate("/orders")}>Cancel</Button>
                    <Button type="submit" size="lg" disabled={createOrder.isPending} className="min-w-[150px]">
                        {createOrder.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Creating...</> : "Confirm Order"}
                    </Button>
                </div>
            </div>
        </div>
      </form>
    </div>
  );
};
export default NewOrder;