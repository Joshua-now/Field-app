import { useTechnicians, useCreateTechnician } from "@/hooks/use-technicians";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Phone, Award, UserX } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTechnicianSchema } from "@shared/schema";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useState } from "react";

export default function Technicians() {
  const { data: technicians, isLoading } = useTechnicians();
  const createTech = useCreateTechnician();
  const [isOpen, setIsOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(insertTechnicianSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      passwordHash: "1234", // Default pin for now
      specialties: [],
    }
  });

  const onSubmit = async (data: any) => {
    try {
      await createTech.mutateAsync(data);
      setIsOpen(false);
      form.reset();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-display">Technicians</h2>
          <p className="text-muted-foreground">Manage your field team.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-technician">
              <Plus className="w-4 h-4 mr-2" />
              Add Technician
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Technician</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="lastName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createTech.isPending} data-testid="button-save-technician">
                  {createTech.isPending ? "Adding..." : "Add Technician"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <Skeleton className="h-12 w-12 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                    <div className="flex gap-2 mt-3">
                      <Skeleton className="h-6 w-16 rounded-md" />
                      <Skeleton className="h-6 w-20 rounded-md" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        ) : technicians?.length === 0 ? (
          <div className="col-span-full text-center py-12 bg-card rounded-xl border border-dashed border-border">
            <UserX className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium">No technicians yet</h3>
            <p className="text-sm text-muted-foreground">Add your first field technician to get started.</p>
          </div>
        ) : (
          technicians?.map((tech) => (
            <Card key={tech.id} className="hover:shadow-md transition-shadow" data-testid={`card-technician-${tech.id}`}>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 font-bold text-lg">
                    {tech.firstName[0]}{tech.lastName[0]}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg" data-testid={`text-technician-name-${tech.id}`}>{tech.firstName} {tech.lastName}</h3>
                    <div className="flex items-center text-sm text-muted-foreground mt-1 gap-2">
                      <Phone className="w-3 h-3" />
                      <span data-testid={`text-technician-phone-${tech.id}`}>{tech.phone}</span>
                    </div>
                    {tech.specialties && tech.specialties.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {tech.specialties.map((s: string, i: number) => (
                          <span key={i} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-md font-medium">
                            {s}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {tech.isActive && (
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white ring-2 ring-emerald-100" title="Active" />
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
