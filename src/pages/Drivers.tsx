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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Truck, Trash2, FileSpreadsheet, Pencil, Search, Filter, X } from "lucide-react";
import * as XLSX from "xlsx";

const Drivers = () => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  // --- MULTIPLE FILTER STATES ---
  const [filterText, setFilterText] = useState(""); // Name, Phone, Vehicle
  const [filterArea, setFilterArea] = useState("all"); // Area Dropdown
  const [filterSubArea, setFilterSubArea] = useState(""); // Sub Area Text

  // Fields (Form)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [address, setAddress] = useState("");
  const [areaId, setAreaId] = useState("");
  const [subArea, setSubArea] = useState("");

  // Edit Fields
  const [editingDriver, setEditingDriver] = useState<any>(null);

  // Queries
  const { data: areas } = useQuery({ queryKey: ["areas"], queryFn: async () => { const { data } = await supabase.from("areas").select("*").order("area_name"); return data || []; } });
  
  const { data: drivers } = useQuery({
    queryKey: ["drivers"],
    queryFn: async () => {
      const { data } = await supabase.from("drivers").select("*, areas(area_name)").order("name");
      return (data as any[]) || [];
    },
  });

  // Fetch Existing Sub Areas for Autosuggest
  const { data: subAreaOptions } = useQuery({
    queryKey: ["sub-areas-list"],
    queryFn: async () => {
      const { data: orderSubs } = await supabase.from("orders").select("sub_area");
      const { data: driverSubs } = await supabase.from("drivers").select("sub_area");
      const allSubs = new Set([
        ...((orderSubs as any[])?.map(o => o.sub_area) || []),
        ...((driverSubs as any[])?.map(d => d.sub_area) || [])
      ]);
      return Array.from(allSubs).filter(Boolean).sort();
    }
  });

  // --- SMART FILTER LOGIC (AND CONDITION) ---
  const filteredDrivers = drivers?.filter((d: any) => {
    // 1. Text Search (Name OR Phone OR Vehicle OR Address)
    const matchesText = !filterText || 
        d.name.toLowerCase().includes(filterText.toLowerCase()) || 
        d.phone.includes(filterText) || 
        (d.vehicle_number && d.vehicle_number.toLowerCase().includes(filterText.toLowerCase())) ||
        (d.address && d.address.toLowerCase().includes(filterText.toLowerCase()));

    // 2. Area Filter (Exact Match)
    const matchesArea = filterArea === "all" || d.area_id === filterArea;

    // 3. Sub Area Filter (Partial Match)
    const matchesSubArea = !filterSubArea || 
        (d.sub_area && d.sub_area.toLowerCase().includes(filterSubArea.toLowerCase()));

    // Return true only if ALL conditions match
    return matchesText && matchesArea && matchesSubArea;
  });

  const resetForm = () => {
      setName(""); setPhone(""); setVehicle(""); setAddress(""); setAreaId(""); setSubArea(""); setEditingDriver(null);
  };

  const clearFilters = () => {
      setFilterText("");
      setFilterArea("all");
      setFilterSubArea("");
  };

  const addDriver = useMutation({
    mutationFn: async () => {
      if (!/^\d{10}$/.test(phone)) throw new Error("Phone number must be exactly 10 digits");
      // @ts-ignore
      const { error } = await supabase.from("drivers").insert({ name, phone, vehicle_number: vehicle || null, address: address || null, area_id: areaId || null, sub_area: subArea || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Driver added!"); queryClient.invalidateQueries({ queryKey: ["drivers"] });
      setOpen(false); resetForm();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateDriver = useMutation({
    mutationFn: async () => {
        if (!/^\d{10}$/.test(phone)) throw new Error("Phone number must be exactly 10 digits");
        // @ts-ignore
        const { error } = await supabase.from("drivers").update({ name, phone, vehicle_number: vehicle || null, address: address || null, area_id: areaId || null, sub_area: subArea || null }).eq("id", editingDriver.id);
        if(error) throw error;
    },
    onSuccess: () => { toast.success("Updated!"); queryClient.invalidateQueries({ queryKey: ["drivers"] }); setEditOpen(false); resetForm(); },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteDriver = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("drivers").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Deleted"); queryClient.invalidateQueries({ queryKey: ["drivers"] }); }
  });

  const exportToExcel = () => {
    if (!filteredDrivers || filteredDrivers.length === 0) return toast.error("No data");
    const dataToExport = filteredDrivers.map((d: any) => ({
      "Name": d.name, "Phone": d.phone, "Vehicle": d.vehicle_number, "Address": d.address,
      "Service Area": d.areas?.area_name, "Sub Area": d.sub_area
    }));
    const ws = XLSX.utils.json_to_sheet(dataToExport); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Drivers");
    XLSX.writeFile(wb, `Drivers_List.xlsx`); toast.success("Downloaded!");
  };

  const openEdit = (d: any) => {
      setEditingDriver(d); setName(d.name); setPhone(d.phone); setVehicle(d.vehicle_number || "");
      setAddress(d.address || ""); setAreaId(d.area_id || ""); setSubArea(d.sub_area || "");
      setEditOpen(true);
  };

  // Reusable Form Content
  const renderFormContent = (action: () => void, isEdit: boolean) => (
    <div className="space-y-4 pt-4">
        <div className="grid grid-cols-2 gap-4">
            <div><Label>Name *</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
            <div><Label>Phone *</Label><Input value={phone} onChange={e => setPhone(e.target.value)} maxLength={10} /></div>
        </div>
        <div><Label>Vehicle Number</Label><Input value={vehicle} onChange={e => setVehicle(e.target.value)} /></div>
        <div><Label>Home Address</Label><Input value={address} onChange={e => setAddress(e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-4">
            <div><Label>Service Area</Label>
                <Select value={areaId} onValueChange={setAreaId}>
                    <SelectTrigger><SelectValue placeholder="Area" /></SelectTrigger>
                    <SelectContent>{areas?.map(a => <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>)}</SelectContent>
                </Select>
            </div>
            <div><Label>Sub Area</Label>
               <Input list="driverSubAreaOptions" value={subArea} onChange={e => setSubArea(e.target.value)} placeholder="Type/Select" />
               <datalist id="driverSubAreaOptions">{subAreaOptions?.map((item: any) => <option key={item} value={item} />)}</datalist>
            </div>
        </div>
        <Button onClick={action} disabled={!name || !phone} className="w-full">{isEdit ? "Update" : "Add"}</Button>
    </div>
  );

  return (
    <div>
      <PageHeader title="Tempo Drivers" subtitle="Manage delivery drivers">
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportToExcel} className="gap-2"><FileSpreadsheet className="w-4 h-4 text-green-600" /> Export Excel</Button>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if(!v) resetForm(); }}>
            <DialogTrigger asChild><Button className="bg-primary text-primary-foreground gap-2"><Plus className="w-4 h-4" /> Add Driver</Button></DialogTrigger>
            <DialogContent>
                <DialogHeader><DialogTitle>Add New Driver</DialogTitle></DialogHeader>
                {renderFormContent(() => addDriver.mutate(), false)}
            </DialogContent>
          </Dialog>
        </div>
      </PageHeader>

      {/* --- MULTI-FILTER SECTION --- */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 bg-card p-4 rounded-xl border shadow-sm">
        
        {/* 1. Text Search */}
        <div className="relative">
             <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
             <Input 
                value={filterText} 
                onChange={(e) => setFilterText(e.target.value)} 
                placeholder="Search Name / Phone..." 
                className="pl-9 h-10"
             />
        </div>

        {/* 2. Area Filter */}
        <div>
            <Select value={filterArea} onValueChange={setFilterArea}>
                <SelectTrigger className="h-10">
                    <SelectValue placeholder="Filter by Area" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Areas</SelectItem>
                    {areas?.map((a) => <SelectItem key={a.id} value={a.id}>{a.area_name}</SelectItem>)}
                </SelectContent>
            </Select>
        </div>

        {/* 3. Sub-Area Filter */}
        <div className="relative">
             <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
             <Input 
                value={filterSubArea} 
                onChange={(e) => setFilterSubArea(e.target.value)} 
                placeholder="Filter Sub-Area..." 
                className="pl-9 h-10"
             />
        </div>

        {/* 4. Clear Button */}
        <Button variant="ghost" onClick={clearFilters} className="h-10 text-muted-foreground hover:text-destructive">
            <X className="w-4 h-4 mr-2" /> Clear Filters
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Vehicle No</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Service Area</TableHead>
                <TableHead>Sub Area</TableHead>
                <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredDrivers?.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No drivers found matching filters</TableCell></TableRow> : filteredDrivers?.map((d: any) => (
              <TableRow key={d.id} className="hover:bg-muted/30">
                <TableCell className="font-medium"><div className="flex items-center gap-2"><Truck className="w-4 h-4 text-primary" />{d.name}</div></TableCell>
                <TableCell>{d.phone}</TableCell>
                <TableCell>{d.vehicle_number || "-"}</TableCell>
                <TableCell className="max-w-[150px] truncate" title={d.address}>{d.address || "-"}</TableCell>
                <TableCell>{d.areas?.area_name || "Any"}</TableCell>
                <TableCell>{d.sub_area || "-"}</TableCell>
                <TableCell className="flex justify-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => openEdit(d)}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive" onClick={() => { if(confirm("Delete driver?")) deleteDriver.mutate(d.id); }}><Trash2 className="w-4 h-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if(!v) resetForm(); }}>
        <DialogContent><DialogHeader><DialogTitle>Edit Driver Details</DialogTitle></DialogHeader>
        {renderFormContent(() => updateDriver.mutate(), true)}
        </DialogContent>
      </Dialog>
    </div>
  );
};
export default Drivers;