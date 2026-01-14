import { useTechnicians, useCreateTechnician } from "@/hooks/use-technicians";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Phone, Award } from "lucide-react";
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

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold font-display">Technicians</h2>
          <p className="text-muted-foreground">Manage your field team.</p>
        </div>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button>
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
                <Button type="submit" className="w-full" disabled={createTech.isPending}>
                  {createTech.isPending ? "Adding..." : "Add Technician"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {technicians?.map((tech) => (
          <Card key={tech.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold text-lg">
                  {tech.firstName[0]}{tech.lastName[0]}
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg">{tech.firstName} {tech.lastName}</h3>
                  <div className="flex items-center text-sm text-muted-foreground mt-1 gap-2">
                    <Phone className="w-3 h-3" />
                    {tech.phone}
                  </div>
                  {tech.specialties && tech.specialties.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-3">
                      {tech.specialties.map((s: string, i: number) => (
                        <span key={i} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md font-medium">
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {tech.isActive && (
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white ring-2 ring-emerald-100" />
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
