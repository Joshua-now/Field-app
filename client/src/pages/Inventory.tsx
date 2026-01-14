import { useParts, useCreatePart } from "@/hooks/use-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Package } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPartSchema } from "@shared/schema";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function Inventory() {
  const { data: parts, isLoading } = useParts();
  const createPart = useCreatePart();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(insertPartSchema),
    defaultValues: {
      partName: "",
      partNumber: "",
      description: "",
      category: "General",
      quantityOnHand: 0,
      costPerUnit: "0",
    }
  });

  const onSubmit = async (data: any) => {
    await createPart.mutateAsync(data);
    setIsOpen(false);
    form.reset();
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-display">Inventory</h2>
          <p className="text-muted-foreground">Manage parts and supplies.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Part
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Part</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="partName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Part Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="partNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Part Number (SKU)</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="quantityOnHand"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Quantity</FormLabel>
                        <FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="costPerUnit"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cost ($)</FormLabel>
                        <FormControl><Input type="number" step="0.01" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={createPart.isPending}>
                  Save Part
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div>Loading...</div>
        ) : (
          <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b border-border/50 text-muted-foreground">
                <tr>
                  <th className="px-6 py-4 font-medium">Part Name</th>
                  <th className="px-6 py-4 font-medium">Part #</th>
                  <th className="px-6 py-4 font-medium">Category</th>
                  <th className="px-6 py-4 font-medium">Stock</th>
                  <th className="px-6 py-4 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {parts?.map((part) => (
                  <tr key={part.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium text-foreground">{part.partName}</td>
                    <td className="px-6 py-4 text-muted-foreground">{part.partNumber}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 rounded text-xs text-slate-700 font-medium">
                        {part.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className={part.quantityOnHand && part.quantityOnHand < 10 ? "text-amber-600 font-bold" : ""}>
                          {part.quantityOnHand}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">${part.costPerUnit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
