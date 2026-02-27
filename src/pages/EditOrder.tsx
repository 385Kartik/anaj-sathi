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
import { Loader2, ArrowLeft, Save } from "lucide-react";

const PRODUCT_TYPES = ["Tukdi", "Sasiya", "Tukdi D", "Sasiya D", "Other"];

const productTranslations: Record<string, string> = {
  "Tukdi": "Tukdi", 
  "Sasiya": "Sasiya", 
  "Tukdi D": "Tukdi Divel", 
  "Sasiya D": "Sasiya Divel", 
  "Other": "Other"
};

interface ProductRow {
  key: string;
  qty: string;
  rate: number;
  orderId: string | null;
  oldQty: number;
}

const EditOrder = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    customerName: "", phone: "", address: "", areaId: "", subArea: "", 
    amountPaid: "0", driverId: "none", status: "pending"
  });

  const [products, setProducts] = useState<ProductRow[]>(
    PRODUCT_TYPES.map(p => ({ key: p, qty: "", rate: 0, orderId: null, oldQty: 0 }))
  );

  const { data: areas } = useQuery({ queryKey: ["areas"], queryFn: async () => { const { data } = await supabase.from("areas").select("*").order("area_name"); return data || []; } });
  const { data: drivers } = useQuery({ queryKey: ["drivers"], queryFn: async () => { const { data } = await supabase.from("drivers").select("*").order("name"); return data || []; } });

  // Fetch Sub Areas
  const { data: subAreaOptions } = useQuery({
    queryKey: ["sub-areas-list"],
    queryFn: async () => {
      const { data: orderSubs } = await supabase.from("orders").select("sub_area").not("sub_area", "is", null);
      const allSubs = new Set(orderSubs?.map(o => o.sub_area).filter(s => s.trim() !== ""));
      return Array.from(allSubs).sort();
    }
  });

  const { data: anchorOrder, isLoading: anchorLoading } = useQuery({
    queryKey: ["anchor-order", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("*, customers(*)").eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: siblingOrders, isLoading: siblingsLoading } = useQuery({
    queryKey: ["sibling-orders", anchorOrder?.customer_id, anchorOrder?.delivery_date],
    enabled: !!anchorOrder,
    queryFn: async () => {
      const dateKey = anchorOrder.delivery_date || anchorOrder.order_date;
      const { data } = await (supabase.from("orders").select("*") as any)
        .eq("customer_id", anchorOrder.customer_id)
        .eq("sub_area", anchorOrder.sub_area || "") 
        .gte("created_at", `${dateKey}T00:00:00`)
        .lte("created_at", `${dateKey}T23:59:59`);
      return data || [];
    },
  });

  useEffect(() => {
    if (anchorOrder && siblingOrders && areas) {
      setForm({
        customerName: anchorOrder.customers?.name || "",
        phone: anchorOrder.customers?.phone || "",
        address: anchorOrder.customers?.address || "", 
        areaId: anchorOrder.customers?.area_id || "",
        subArea: anchorOrder.sub_area || "",
        driverId: anchorOrder.driver_id || "none",
        status: anchorOrder.status || "pending",
        amountPaid: String(siblingOrders.reduce((sum: number, o: any) => sum + (o.amount_paid || 0), 0))
      });

      const loadProducts = async () => {
        const newProducts = await Promise.all(PRODUCT_TYPES.map(async (pType) => {
            const existing = siblingOrders.find((o: any) => o.product_type === pType);
            let rate = 0;
            if (existing) {
                rate = existing.rate_per_kg;
            } else {
                rate = await getRate(pType, anchorOrder.customers?.area_id);
            }
            return {
                key: pType,
                qty: existing ? String(existing.quantity_kg) : "",
                rate: rate,
                orderId: existing ? existing.id : null,
                oldQty: existing ? Number(existing.quantity_kg) : 0
            };
        }));
        setProducts(newProducts);
      };
      loadProducts();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorOrder, siblingOrders, areas]);

  const getRate = async (pType: string, areaId: string) => {
    if (!areaId || pType === "Other") return 0;
    const { data: areaRate } = await supabase.from("area_rates").select("rate_per_kg").eq("area_id", areaId).eq("product_type", pType).maybeSingle();
    if (areaRate && areaRate.rate_per_kg > 0) return areaRate.rate_per_kg;
    const { data: globalRate } = await supabase.from("product_rates").select("rate_per_kg").eq("product_type", pType).maybeSingle();
    return globalRate ? globalRate.rate_per_kg : 0;
  };

  const handleProductChange = (index: number, field: keyof ProductRow, val: any) => {
    const updated = [...products];
    updated[index] = { ...updated[index], [field]: val };
    setProducts(updated);
  };

  const handleAreaChange = async (newAreaId: string) => {
    setForm(prev => ({ ...prev, areaId: newAreaId }));
    const updated = await Promise.all(products.map(async (p) => {
        if (p.key === "Other") return p;
        const newRate = await getRate(p.key, newAreaId);
        return { ...p, rate: newRate };
    }));
    setProducts(updated);
  };

  const grandTotal = products.reduce((sum, p) => sum + (Number(p.qty || 0) * p.rate), 0);
  const pending = grandTotal - Number(form.amountPaid || 0);

  const saveChanges = useMutation({
    mutationFn: async () => {
        await supabase.from("customers").update({
            name: form.customerName, phone: form.phone, address: form.address, area_id: form.areaId
        }).eq("id", anchorOrder.customer_id);

        let remainingPaid = Number(form.amountPaid);

        for (const p of products) {
            const newQty = Number(p.qty || 0);
            
            const diff = p.oldQty - newQty; 
            if (diff !== 0 && p.key !== "Other" && p.key !== "Null") {
                const { data: stock } = await supabase.from("stock").select("*").eq("product_type", p.key).maybeSingle();
                if (stock) {
                    await supabase.from("stock").update({ quantity_kg: Number(stock.quantity_kg) + diff }).eq("id", stock.id);
                }
            }

            if (newQty > 0) {
                const lineTotal = newQty * p.rate;
                const linePaid = Math.min(lineTotal, remainingPaid);
                remainingPaid = Math.max(0, remainingPaid - linePaid);

                const orderData = {
                    customer_id: anchorOrder.customer_id, product_type: p.key, quantity_kg: newQty,
                    rate_per_kg: p.rate, total_amount: lineTotal, amount_paid: linePaid,
                    driver_id: form.driverId === "none" ? null : form.driverId,
                    status: form.status, sub_area: form.subArea,
                    delivery_date: anchorOrder.delivery_date, created_at: anchorOrder.created_at 
                };

                if (p.orderId) {
                    await supabase.from("orders").update(orderData as any).eq("id", p.orderId);
                } else {
                    await supabase.from("orders").insert(orderData as any);
                }
            } else {
                if (p.orderId) {
                    await supabase.from("orders").delete().eq("id", p.orderId);
                }
            }
        }
    },
    onSuccess: () => {
        toast.success("Order & Customer updated successfully!");
        queryClient.invalidateQueries();
        navigate("/orders");
    },
    onError: (e: any) => toast.error(e.message)
  });

  if (anchorLoading || siblingsLoading) return <div className="flex justify-center pt-20"><Loader2 className="animate-spin w-8 h-8" /></div>;

  return (
    <div className="pb-10 max-w-5xl mx-auto px-4">
      <PageHeader title="Edit Order" subtitle={`Managing orders for ${form.customerName}`}>
        <Button variant="outline" onClick={() => navigate("/orders")} className="gap-2"><ArrowLeft className="w-4 h-4"/> Back</Button>
      </PageHeader>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-card border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold border-b pb-2">Customer Details</h3>
                <div><Label>Name</Label><Input value={form.customerName} onChange={e => setForm({...form, customerName: e.target.value})} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} /></div>
                <div><Label>Address</Label><Input value={form.address} onChange={e => setForm({...form, address: e.target.value})} placeholder="Full Address" /></div>
                <div><Label>Area</Label>
                    <Select value={form.areaId} onValueChange={handleAreaChange}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent>{areas?.map((a:any) => <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                
                {/* --- DUAL SUB AREA LOGIC FOR EDIT --- */}
                <div>
                    <Label>Sub Area / Location</Label>
                    <div className="flex gap-2 mt-1">
                        <Select 
                            value={subAreaOptions?.includes(form.subArea) ? form.subArea : ""} 
                            onValueChange={(v) => setForm({...form, subArea: v})}
                        >
                            <SelectTrigger className="w-[120px]"><SelectValue placeholder="List..." /></SelectTrigger>
                            <SelectContent>
                                {subAreaOptions?.map((item: any) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Input 
                            className="flex-1"
                            value={form.subArea} 
                            onChange={(e) => setForm({...form, subArea: e.target.value})} 
                            placeholder="Or type new..." 
                        />
                    </div>
                </div>

            </div>

            <div className="bg-card border rounded-xl p-5 space-y-4">
                <h3 className="font-semibold border-b pb-2">Logistics</h3>
                <div><Label>Driver</Label>
                    <Select value={form.driverId} onValueChange={v => setForm({...form, driverId: v})}>
                        <SelectTrigger><SelectValue placeholder="Select Driver"/></SelectTrigger>
                        <SelectContent><SelectItem value="none">Self Pickup</SelectItem>{drivers?.map((d:any) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                </div>
                <div><Label>Status</Label>
                    <Select value={form.status} onValueChange={v => setForm({...form, status: v})}>
                        <SelectTrigger><SelectValue/></SelectTrigger>
                        <SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="delivered">Delivered</SelectItem><SelectItem value="cancelled">Cancelled</SelectItem></SelectContent>
                    </Select>
                </div>
            </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
            <div className="bg-card border rounded-xl p-5">
                <h3 className="font-semibold border-b pb-4 mb-4 flex justify-between">
                    <span>Order Items</span><span className="text-sm text-muted-foreground">Rate auto-filled from Area</span>
                </h3>
                
                <div className="grid grid-cols-12 gap-3 mb-2 text-xs font-medium text-muted-foreground px-1">
                    <div className="col-span-4">प्रोडक्ट (PRODUCT)</div>
                    <div className="col-span-3">रेट (RATE)</div>
                    <div className="col-span-3">मात्रा (QTY)</div>
                    <div className="col-span-2 text-right">कुल (TOTAL)</div>
                </div>

                <div className="space-y-3">
                    {products.map((p, idx) => (
                        <div key={p.key} className="grid grid-cols-12 gap-3 items-center bg-muted/20 p-2 rounded border">
                            <div className="col-span-4 font-medium text-sm">{productTranslations[p.key] || p.key}</div>
                            <div className="col-span-3">
                                <Input type="number" className="h-8 text-right" value={p.rate} readOnly={p.key !== "Other"} onChange={(e) => handleProductChange(idx, "rate", e.target.value)} />
                            </div>
                            <div className="col-span-3">
                                <Input type="number" className={`h-8 text-center font-bold ${p.qty ? "bg-white border-primary" : "bg-transparent"}`} placeholder="0" value={p.qty} onChange={(e) => handleProductChange(idx, "qty", e.target.value)} />
                            </div>
                            <div className="col-span-2 text-right text-sm font-bold">₹{(Number(p.qty || 0) * p.rate).toLocaleString()}</div>
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

            <div className="bg-card border rounded-xl p-5">
                <h3 className="font-semibold border-b pb-4 mb-4">Payment</h3>
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <Label>Amount Paid (Total for all items)</Label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₹</span>
                            <Input type="number" className="pl-8 text-lg font-bold" value={form.amountPaid} onChange={e => setForm({...form, amountPaid: e.target.value})} />
                        </div>
                    </div>
                    <div className="flex-1 text-right bg-muted/30 p-2 rounded">
                        <div className="text-sm text-muted-foreground">Pending Balance</div>
                        <div className={`text-xl font-bold ${pending > 0 ? "text-destructive" : "text-green-600"}`}>₹{pending.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            <div className="flex justify-end pt-4">
                <Button size="lg" className="w-full md:w-auto min-w-[200px]" onClick={() => saveChanges.mutate()} disabled={saveChanges.isPending}>
                    {saveChanges.isPending ? <Loader2 className="animate-spin mr-2"/> : <Save className="mr-2 w-4 h-4"/>} Update Order
                </Button>
            </div>
        </div>
      </div>
    </div>
  );
};

export default EditOrder;