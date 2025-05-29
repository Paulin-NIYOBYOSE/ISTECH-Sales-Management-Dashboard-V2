import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

const Sales = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);
  const [paymentStatus, setPaymentStatus] = useState("pending");
  const [dueDate, setDueDate] = useState("");
  // const [notes, setNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sales, isLoading } = useQuery({
    queryKey: ["sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select(`
          *,
          customers(name, email),
          sale_items(*, products(name))
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const createSaleMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // First, create or find customer
      let customerId;
      const { data: existingCustomer } = await supabase
        .from("customers")
        .select("id")
        .eq("name", customerName)
        .single();

      if (existingCustomer) {
        customerId = existingCustomer.id;
      } else {
        const { data: newCustomer, error: customerError } = await supabase
          .from("customers")
          .insert({
            name: customerName,
            email: customerEmail || null,
            phone: customerPhone || null,
          })
          .select("id")
          .single();

        if (customerError) throw customerError;
        customerId = newCustomer.id;
      }

      const totalAmount = selectedProducts.reduce((sum, item) => sum + (item.sellingPrice * item.quantity), 0);
      const totalCost = selectedProducts.reduce((sum, item) => sum + (item.cost * item.quantity), 0);

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          customer_id: customerId,
          user_id: user.id,
          total_amount: totalAmount,
          total_cost: totalCost,
          payment_status: paymentStatus as any,
          due_date: dueDate || null,
          // notes,
        })
        .select()
        .single();

      if (saleError) throw saleError;

      const saleItems = selectedProducts.map(item => ({
        sale_id: sale.id,
        product_id: item.id,
        quantity: item.quantity,
        unit_price: item.sellingPrice,
        unit_cost: item.cost,
      }));

      const { error: itemsError } = await supabase
        .from("sale_items")
        .insert(saleItems);

      if (itemsError) throw itemsError;

      // Update product stock quantities
      for (const product of selectedProducts) {
        const { error: stockError } = await supabase
          .from("products")
          .update({ 
            stock_quantity: product.stock_quantity - product.quantity,
            updated_at: new Date().toISOString()
          })
          .eq("id", product.id);

        if (stockError) throw stockError;
      }

      return sale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      setIsOpen(false);
      resetForm();
      toast({
        title: "✅ Success",
        description: "Sale created successfully and stock updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteSaleMutation = useMutation({
    mutationFn: async (saleId: string) => {
      // Get sale items to restore stock
      const { data: saleItems } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .eq("sale_id", saleId);

      // Restore stock quantities
      if (saleItems) {
        for (const item of saleItems) {
          const { data: product } = await supabase
            .from("products")
            .select("stock_quantity")
            .eq("id", item.product_id)
            .single();

          if (product) {
            await supabase
              .from("products")
              .update({ 
                stock_quantity: product.stock_quantity + item.quantity,
                updated_at: new Date().toISOString()
              })
              .eq("id", item.product_id);
          }
        }
      }

      const { error } = await supabase
        .from("sales")
        .delete()
        .eq("id", saleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "✅ Success",
        description: "Sale deleted and stock restored",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setSelectedProducts([]);
    setPaymentStatus("pending");
    setDueDate("");
    // setNotes("");
  };

  const addProductToSale = (product: any) => {
    const existingIndex = selectedProducts.findIndex(p => p.id === product.id);
    if (existingIndex >= 0) {
      const updated = [...selectedProducts];
      updated[existingIndex].quantity += 1;
      setSelectedProducts(updated);
    } else {
      setSelectedProducts([...selectedProducts, { 
        ...product, 
        quantity: 1, 
        sellingPrice: product.cost * 1.5 // Default selling price (50% markup)
      }]);
    }
  };

  const removeProductFromSale = (productId: string) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== productId));
  };

  const updateProductQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeProductFromSale(productId);
      return;
    }
    setSelectedProducts(selectedProducts.map(p => 
      p.id === productId ? { ...p, quantity } : p
    ));
  };

  const updateSellingPrice = (productId: string, sellingPrice: number) => {
    setSelectedProducts(selectedProducts.map(p => 
      p.id === productId ? { ...p, sellingPrice } : p
    ));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerName || selectedProducts.length === 0) {
      toast({
        title: "Error",
        description: "Please enter customer name and add at least one product",
        variant: "destructive",
      });
      return;
    }

    // Check if we have enough stock for all products
    const stockIssues = selectedProducts.filter(p => p.quantity > p.stock_quantity);
    if (stockIssues.length > 0) {
      toast({
        title: "Insufficient Stock",
        description: `Not enough stock for: ${stockIssues.map(p => p.name).join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    createSaleMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Sales</h1>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              New Sale
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Sale</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="customerName">Customer Name</Label>
                  <Input
                    id="customerName"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter customer name"
                    required
                  />
                </div>
      
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="paymentStatus">Payment Status</Label>
                  <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="dueDate">Due Date (Optional)</Label>
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>

              {/* <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Sale notes..."
                />
              </div> */}

              <div>
                <Label>Add Products</Label>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {products?.map((product) => (
                    <Button
                      key={product.id}
                      type="button" 
                      variant="outline"
                      onClick={() => addProductToSale(product)}
                      className="text-left justify-start"
                      disabled={product.stock_quantity === 0}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      {product.name}
                    </Button>
                  ))}
                </div>
              </div>

              {selectedProducts.length > 0 && (
                <div>
                  <Label>Selected Products</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Product</TableHead>
                        <TableHead>Cost</TableHead>
                        <TableHead>Selling Price</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Profit</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProducts.map((product) => (
                        <TableRow key={product.id}>
                          <TableCell>{product.name}</TableCell>
                          <TableCell>RWF {product.cost}</TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={product.sellingPrice}
                              onChange={(e) => updateSellingPrice(product.id, parseFloat(e.target.value) || 0)}
                              className="w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              min="1"
                              max={product.stock_quantity}
                              value={product.quantity}
                              onChange={(e) => updateProductQuantity(product.id, parseInt(e.target.value) || 0)}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>RWF {(product.sellingPrice * product.quantity).toLocaleString()}</TableCell>
                          <TableCell className="text-green-600 font-medium">
                            RWF {((product.sellingPrice - product.cost) * product.quantity).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeProductFromSale(product.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell colSpan={4} className="font-bold">Total</TableCell>
                        <TableCell className="font-bold">
                          RWF {selectedProducts.reduce((sum, p) => sum + (p.sellingPrice * p.quantity), 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-bold text-green-600">
                          RWF {selectedProducts.reduce((sum, p) => sum + ((p.sellingPrice - p.cost) * p.quantity), 0).toLocaleString()}
                        </TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createSaleMutation.isPending}>
                  {createSaleMutation.isPending ? "Creating..." : "Create Sale"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Sales</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Profit</TableHead>
                  <TableHead>Payment Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sales?.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell>{sale.customers?.name}</TableCell>
                    <TableCell>
                      {sale.sale_items?.map((item: any) => (
                        <div key={item.id}>
                          {item.products?.name} ({item.quantity})
                        </div>
                      ))}
                    </TableCell>
                    <TableCell>RWF {Number(sale.total_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-green-600 font-medium">
                      RWF {(Number(sale.total_amount) - Number(sale.total_cost)).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${
                        sale.payment_status === 'paid' ? 'bg-green-100 text-green-800' :
                        sale.payment_status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {sale.payment_status}
                      </span>
                    </TableCell>
                    <TableCell>{format(new Date(sale.sale_date), "MMM dd, yyyy")}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteSaleMutation.mutate(sale.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Sales;
