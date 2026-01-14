import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FileText, Plus, Trash2, Send, Loader2, ExternalLink } from "lucide-react";

interface LineItem {
  description: string;
  amount: number;
}

interface InvoiceDialogProps {
  jobId: number;
  jobNumber: string;
  customerName: string;
  onSuccess?: () => void;
}

export function InvoiceDialog({ jobId, jobNumber, customerName, onSuccess }: InvoiceDialogProps) {
  const [open, setOpen] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: "Labor", amount: 0 }
  ]);
  const [sendEmail, setSendEmail] = useState(true);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);
  const { toast } = useToast();

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const validItems = lineItems.filter(item => item.description && item.amount > 0);
      if (validItems.length === 0) {
        throw new Error("Add at least one line item with an amount");
      }
      const response = await apiRequest("POST", `/api/jobs/${jobId}/invoice`, {
        lineItems: validItems,
        sendEmail
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Invoice created", description: sendEmail ? "Email sent to customer" : "Invoice ready" });
      setInvoiceUrl(data.invoiceUrl);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  const addLineItem = () => {
    setLineItems([...lineItems, { description: "", amount: 0 }]);
  };

  const removeLineItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const updateLineItem = (index: number, field: keyof LineItem, value: string | number) => {
    const updated = [...lineItems];
    if (field === "amount") {
      updated[index][field] = parseFloat(value as string) || 0;
    } else {
      updated[index][field] = value as string;
    }
    setLineItems(updated);
  };

  const total = lineItems.reduce((sum, item) => sum + item.amount, 0);

  const resetForm = () => {
    setLineItems([{ description: "Labor", amount: 0 }]);
    setSendEmail(true);
    setInvoiceUrl(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" data-testid="button-create-invoice">
          <FileText className="h-4 w-4 mr-2" />
          Invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Invoice</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p><strong>Job:</strong> {jobNumber}</p>
            <p><strong>Customer:</strong> {customerName}</p>
          </div>

          {invoiceUrl ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-950 rounded-md text-center">
                <p className="text-green-700 dark:text-green-300 font-medium">Invoice created successfully!</p>
              </div>
              <Button asChild className="w-full">
                <a href={invoiceUrl} target="_blank" rel="noopener noreferrer" data-testid="link-view-invoice">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Invoice
                </a>
              </Button>
              <Button variant="outline" className="w-full" onClick={() => setOpen(false)} data-testid="button-close-invoice">
                Close
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                <Label>Line Items</Label>
                {lineItems.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      placeholder="Description"
                      value={item.description}
                      onChange={(e) => updateLineItem(index, "description", e.target.value)}
                      className="flex-1"
                      data-testid={`input-line-description-${index}`}
                    />
                    <div className="relative w-24">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                      <Input
                        type="number"
                        placeholder="0.00"
                        value={item.amount || ""}
                        onChange={(e) => updateLineItem(index, "amount", e.target.value)}
                        className="pl-7"
                        data-testid={`input-line-amount-${index}`}
                      />
                    </div>
                    {lineItems.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeLineItem(index)}
                        data-testid={`button-remove-line-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addLineItem} className="w-full" data-testid="button-add-line">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line Item
                </Button>
              </div>

              <div className="flex justify-between items-center py-2 border-t">
                <span className="font-medium">Total</span>
                <span className="text-lg font-bold" data-testid="text-invoice-total">${total.toFixed(2)}</span>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="sendEmail"
                  checked={sendEmail}
                  onCheckedChange={(checked) => setSendEmail(checked as boolean)}
                  data-testid="checkbox-send-email"
                />
                <Label htmlFor="sendEmail" className="text-sm">Email invoice to customer</Label>
              </div>

              <Button
                className="w-full"
                onClick={() => createInvoiceMutation.mutate()}
                disabled={createInvoiceMutation.isPending || total <= 0}
                data-testid="button-send-invoice"
              >
                {createInvoiceMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                {sendEmail ? "Send Invoice" : "Create Invoice"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
