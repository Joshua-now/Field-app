import { useParts, useCreatePart } from "@/hooks/use-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Package, PackageX } from "lucide-react";
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
            <Button data-testid="button-add-part">
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
                <Button type="submit" className="w-full" disabled={createPart.isPending} data-testid="button-save-part">
                  {createPart.isPending ? "Saving..." : "Save Part"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
            <div className="p-6 space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-6">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-6 w-16 rounded" />
                  <Skeleton className="h-5 w-12" />
                  <Skeleton className="h-5 w-16" />
                </div>
              ))}
            </div>
          </div>
        ) : parts?.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border border-dashed border-border">
            <PackageX className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No parts in inventory</h3>
            <p className="text-sm text-muted-foreground">Add your first part to start tracking inventory.</p>
          </div>
        ) : (
          <div className="border rounded-xl bg-card overflow-hidden shadow-sm">
            <table className="w-full text-sm text-left" data-testid="table-inventory">
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
                  <tr key={part.id} className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors" data-testid={`row-part-${part.id}`}>
                    <td className="px-6 py-4 font-medium text-foreground" data-testid={`text-part-name-${part.id}`}>{part.partName}</td>
                    <td className="px-6 py-4 text-muted-foreground">{part.partNumber}</td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs text-slate-700 dark:text-slate-300 font-medium">
                        {part.category}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4 text-muted-foreground" />
                        <span className={part.quantityOnHand && part.quantityOnHand < 10 ? "text-amber-600 font-bold" : ""} data-testid={`text-part-qty-${part.id}`}>
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
