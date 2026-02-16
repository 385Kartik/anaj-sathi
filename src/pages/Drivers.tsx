import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Truck, Trash2, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx"; // Excel library import kiya

const Drivers = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");

  const { data: drivers } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("*").order("name");
      return data || [];
    },
  });

  const addDriver = useMutation({
    mutationFn: async () => {
      if (!/^\d{10}$/.test(phone)) {
        throw new Error("Phone number must be exactly 10 digits");
      }

      const { error } = await supabase.from("drivers").insert({ name, phone, vehicle_number: vehicle || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Driver added!");
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setOpen(false);
      setName("");
      setPhone("");
      setVehicle("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDriver = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("drivers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Driver deleted successfully");
      queryClient.invalidateQueries({ queryKey: ["drivers"] });
    },
    onError: (e: any) => toast.error("Cannot delete: " + e.message),
  });

  // --- EXCEL EXPORT LOGIC ---
  const exportToExcel = () => {
    if (!drivers || drivers.length === 0) {
      toast.error("Export karne ke liye koi driver nahi hai.");
      return;
    }

    const dataToExport = drivers.map((d) => ({
      "Driver Name": d.name,
      "Phone Number": d.phone,
      "Vehicle Number": d.vehicle_number || "N/A",
      "Joined Date": new Date(d.created_at).toLocaleDateString("en-IN"),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Drivers");

    XLSX.writeFile(workbook, `Drivers_List_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Driver list download ho gayi!");
  };

  return (
    <div>
      <PageHeader title="Tempo Drivers" subtitle="Manage delivery drivers">
        <div className="flex gap-2">
          {/* Export Button */}
          <Button variant="outline" onClick={exportToExcel} className="gap-2">
            <FileSpreadsheet className="w-4 h-4 text-green-600" /> Export Excel
          </Button>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90 gap-2">
                <Plus className="w-4 h-4" /> Add Driver
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-display">Add New Driver</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-4">
                <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full Name" /></div>
                <div><Label>Phone *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={10} placeholder="10 digit number" /></div>
                <div><Label>Vehicle Number</Label><Input value={vehicle} onChange={(e) => setVehicle(e.target.value)} placeholder="e.g. MH 04 AB 1234" /></div>
                <Button onClick={() => addDriver.mutate()} disabled={!name || !phone} className="w-full bg-primary text-primary-foreground">Add Driver</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Vehicle Number</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers?.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No drivers yet</TableCell></TableRow>
              ) : (
                drivers?.map((d) => (
                  <TableRow key={d.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium flex items-center gap-2"><Truck className="w-4 h-4 text-primary" />{d.name}</TableCell>
                    <TableCell>{d.phone}</TableCell>
                    <TableCell>{d.vehicle_number || "-"}</TableCell>
                    <TableCell>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="text-destructive hover:bg-destructive/10 h-8 w-8"
                        onClick={() => {
                          if(confirm("Are you sure you want to delete this driver?")) {
                            deleteDriver.mutate(d.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

export default Drivers;