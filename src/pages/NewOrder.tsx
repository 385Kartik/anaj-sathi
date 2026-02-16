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

const PRODUCT_TYPES = ["Tukdi", "Sasiya", "Tukdi D", "Sasiya D"] as const;

const NewOrder = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Rate state
  const [activeRate, setActiveRate] = useState<number>(0);
  const [rateLoading, setRateLoading] = useState(false);

  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    address: "",
    areaId: "",
    productType: "" as string,
    quantityKg: "",
    amountPaid: "",
    driverId: "",
    deliveryDate: "",
    notes: "",
  });

  // Queries
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

  // Calculations
  const totalAmount = Number(form.quantityKg || 0) * activeRate;
  const pendingCalc = totalAmount - Number(form.amountPaid || 0);

  // Rate Logic
  useEffect(() => {
    const fetchRate = async () => {
      if (!form.productType) return;
      setRateLoading(true);
      try {
        let foundRate = 0;
        if (form.areaId) {
          const { data: areaRate } = await supabase
            .from("area_rates")
            .select("rate_per_kg")
            .eq("area_id", form.areaId)
            .eq("product_type", form.productType)
            .maybeSingle();

          if (areaRate && areaRate.rate_per_kg > 0) {
            foundRate = areaRate.rate_per_kg;
          }
        }
        if (foundRate === 0) {
          const { data: globalRate } = await supabase
            .from("product_rates")
            .select("rate_per_kg")
            .eq("product_type", form.productType)
            .maybeSingle();
          if (globalRate) foundRate = globalRate.rate_per_kg;
        }
        setActiveRate(foundRate);
      } catch (error) {
        console.error(error);
      } finally {
        setRateLoading(false);
      }
    };
    fetchRate();
  }, [form.areaId, form.productType]);

  const handlePhoneChange = async (val: string) => {
    updateField("phone", val);
    if (val.length === 10) {
      const { data: cust } = await supabase.from("customers").select("*").eq("phone", val).maybeSingle();
      if (cust) {
        setForm(prev => ({
          ...prev,
          customerName: cust.name,
          address: cust.address || "",
          areaId: cust.area_id || ""
        }));
        toast.success("Existing customer found!");
      }
    }
  };

  const createOrder = useMutation({
    mutationFn: async () => {
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

      const { error: orderError } = await supabase.from("orders").insert({
        customer_id: customerId, product_type: form.productType, quantity_kg: Number(form.quantityKg),
        rate_per_kg: activeRate, total_amount: totalAmount, amount_paid: Number(form.amountPaid || 0),
        driver_id: form.driverId || null, delivery_date: form.deliveryDate || new Date().toISOString().split('T')[0],
      });
      if (orderError) throw orderError;

      const { data: stockItem } = await supabase.from("stock").select("*").eq("product_type", form.productType).single();
      if (stockItem) {
        await supabase.from("stock").update({
          quantity_kg: Number(stockItem.quantity_kg) - Number(form.quantityKg),
          last_updated: new Date().toISOString()
        }).eq("id", stockItem.id);
      }
    },
    onSuccess: () => {
      toast.success("Order created successfully!");
      queryClient.invalidateQueries();
      navigate("/orders");
    },
    onError: (err: any) => toast.error("Error: " + err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerName || !form.phone || !form.address || !form.areaId || !form.productType || !form.quantityKg) {
      toast.error("Please fill all mandatory fields.");
      return;
    }
    if (!/^\d{10}$/.test(form.phone)) {
      toast.error("Invalid phone number.");
      return;
    }
    createOrder.mutate();
  };

  const updateField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-4xl mx-auto pb-10 px-4">
      <PageHeader title="New Order" subtitle="Create a new entry for wheat distribution" />

      <form onSubmit={handleSubmit} className="space-y-8 mt-6">
        
        {/* Section 1: Customer Information */}
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 border-b pb-2">
            <User className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Customer Details</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Phone Number *</Label>
              <Input value={form.phone} onChange={(e) => handlePhoneChange(e.target.value)} placeholder="10 digit number" maxLength={10} />
            </div>
            <div className="space-y-2">
              <Label>Customer Name *</Label>
              <Input value={form.customerName} onChange={(e) => updateField("customerName", e.target.value)} placeholder="Enter full name" />
            </div>
            <div className="md:col-span-2 space-y-2">
              <Label>Full Address *</Label>
              <Input value={form.address} onChange={(e) => updateField("address", e.target.value)} placeholder="House/Shop no, Landmark, Road" />
            </div>
            <div className="space-y-2">
              <Label>Area *</Label>
              <Select value={form.areaId} onValueChange={(v) => updateField("areaId", v)}>
                <SelectTrigger><SelectValue placeholder="Select delivery area" /></SelectTrigger>
                <SelectContent>
                  {areas?.map((a) => <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Section 2: Order Details */}
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 border-b pb-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Order Information</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Product Type *</Label>
              <Select value={form.productType} onValueChange={(v) => updateField("productType", v)}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {PRODUCT_TYPES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Rate (per Guni)</Label>
              <div className="relative">
                <Input value={`₹ ${activeRate}`} readOnly className="bg-muted font-bold text-primary" />
                {rateLoading && <Loader2 className="w-4 h-4 animate-spin absolute right-3 top-3 text-muted-foreground" />}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Quantity (Guni) *</Label>
              <Input type="number" value={form.quantityKg} onChange={(e) => updateField("quantityKg", e.target.value)} placeholder="Enter weight" />
            </div>
          </div>
        </div>

        {/* Section 3: Payment Summary */}
        <div className="bg-card border rounded-xl p-6 shadow-sm border-primary/20">
          <div className="flex items-center gap-2 mb-6 border-b border-primary/10 pb-2">
            <CreditCard className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Payment Summary</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <Label>Total Bill</Label>
              <div className="text-2xl font-bold text-foreground">₹ {totalAmount.toLocaleString("en-IN")}</div>
            </div>
            <div className="space-y-2">
              <Label>Amount Paid *</Label>
              <Input type="number" value={form.amountPaid} onChange={(e) => updateField("amountPaid", e.target.value)} placeholder="₹ 0.00" className="text-lg border-primary/30" />
            </div>
            <div className="space-y-2">
              <Label>Balance Pending</Label>
              <div className={`text-2xl font-bold ${pendingCalc > 0 ? "text-destructive" : "text-success"}`}>
                ₹ {pendingCalc.toLocaleString("en-IN")}
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: Delivery */}
        <div className="bg-card border rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 border-b pb-2">
            <Truck className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Logistics</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Tempo Driver</Label>
              <Select value={form.driverId} onValueChange={(v) => updateField("driverId", v)}>
                <SelectTrigger><SelectValue placeholder="Assign driver (Optional)" /></SelectTrigger>
                <SelectContent>
                  {drivers?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Delivery Date</Label>
              <Input type="date" value={form.deliveryDate} onChange={(e) => updateField("deliveryDate", e.target.value)} />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4 pt-4">
          <Button type="button" variant="ghost" onClick={() => navigate("/orders")} className="px-8">
            Cancel
          </Button>
          <Button type="submit" disabled={createOrder.isPending} className="px-12 h-12 text-lg shadow-lg">
            {createOrder.isPending ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Saving...</> : "Confirm & Create Order"}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default NewOrder;