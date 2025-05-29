
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, Clock, AlertTriangle, DollarSign } from "lucide-react";
import { format, isAfter } from "date-fns";

const Debtors = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: debtors, isLoading } = useQuery({
    queryKey: ["debtors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("debtors")
        .select(`
          *,
          customers(name, email, phone),
          sales(sale_date, notes, total_amount, total_cost)
        `)
        .eq("is_resolved", false)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const { data: debtorStats } = useQuery({
    queryKey: ["debtor-stats"],
    queryFn: async () => {
      const { data: allDebtors } = await supabase
        .from("debtors")
        .select("amount_owed, is_resolved, due_date");

      const totalOutstanding = allDebtors
        ?.filter(d => !d.is_resolved)
        ?.reduce((sum, debtor) => sum + Number(debtor.amount_owed), 0) || 0;

      const overdueDebtors = allDebtors
        ?.filter(d => !d.is_resolved && isAfter(new Date(), new Date(d.due_date)))
        ?.length || 0;

      const totalResolved = allDebtors
        ?.filter(d => d.is_resolved)
        ?.reduce((sum, debtor) => sum + Number(debtor.amount_owed), 0) || 0;

      return {
        totalOutstanding,
        overdueDebtors,
        totalResolved,
        activeDebtors: allDebtors?.filter(d => !d.is_resolved)?.length || 0,
      };
    },
  });

  const markAsPaidMutation = useMutation({
    mutationFn: async (debtorId: string) => {
      // Mark debtor as resolved
      const { error: debtorError } = await supabase
        .from("debtors")
        .update({ is_resolved: true, updated_at: new Date().toISOString() })
        .eq("id", debtorId);
      if (debtorError) throw debtorError;

      // Update the corresponding sale to paid status
      const { data: debtor } = await supabase
        .from("debtors")
        .select("sale_id")
        .eq("id", debtorId)
        .single();

      if (debtor) {
        const { error: saleError } = await supabase
          .from("sales")
          .update({ payment_status: "paid" })
          .eq("id", debtor.sale_id);
        if (saleError) throw saleError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debtors"] });
      queryClient.invalidateQueries({ queryKey: ["debtor-stats"] });
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Success",
        description: "Payment marked as received. Profit has been recorded.",
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

  const getStatusColor = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 3600 * 24));

    if (daysUntilDue < 0) return "text-red-600"; // Overdue
    if (daysUntilDue <= 7) return "text-yellow-600"; // Due soon
    return "text-green-600"; // Not due yet
  };

  const getStatusIcon = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 3600 * 24));

    if (daysUntilDue < 0) return <AlertTriangle className="h-4 w-4 text-red-600" />;
    if (daysUntilDue <= 7) return <Clock className="h-4 w-4 text-yellow-600" />;
    return <CheckCircle className="h-4 w-4 text-green-600" />;
  };

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold">Debtors Management</h1>
        <p className="text-gray-600 mt-2">
          Track and manage customers with pending payments. Profit is calculated only when payments are received.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              RWF {debtorStats?.totalOutstanding?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">Amount owed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Debtors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{debtorStats?.activeDebtors || 0}</div>
            <p className="text-xs text-muted-foreground">Outstanding accounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue Accounts</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{debtorStats?.overdueDebtors || 0}</div>
            <p className="text-xs text-muted-foreground">Past due date</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Recovered</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              RWF {debtorStats?.totalResolved?.toLocaleString() || 0}
            </div>
            <p className="text-xs text-muted-foreground">Paid debts</p>
          </CardContent>
        </Card>
      </div>

      {/* Debtors Table */}
      <Card>
        <CardHeader>
          <CardTitle>Outstanding Debts (Pending Sales)</CardTitle>
          <p className="text-sm text-gray-500">
            These are customers with pending payments. Mark as paid to record the profit.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div>Loading...</div>
          ) : debtors && debtors.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Amount Owed</TableHead>
                  <TableHead>Potential Profit</TableHead>
                  <TableHead>Sale Date</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {debtors.map((debtor) => {
                  const daysUntilDue = Math.ceil(
                    (new Date(debtor.due_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24)
                  );
                  
                  const potentialProfit = Number(debtor.sales?.total_amount || 0) - Number(debtor.sales?.total_cost || 0);
                  
                  return (
                    <TableRow key={debtor.id}>
                      <TableCell className="font-medium">
                        {debtor.customers?.name || "Unknown Customer"}
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="text-sm">{debtor.customers?.email}</div>
                          <div className="text-xs text-gray-500">{debtor.customers?.phone}</div>
                        </div>
                      </TableCell>
                      <TableCell className="font-bold">
                        RWF {Number(debtor.amount_owed).toLocaleString()}
                      </TableCell>
                      <TableCell className="font-bold text-green-600">
                        RWF {potentialProfit.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {format(new Date(debtor.sales?.sale_date || debtor.created_at), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell className={getStatusColor(debtor.due_date)}>
                        {format(new Date(debtor.due_date), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center space-x-2">
                          {getStatusIcon(debtor.due_date)}
                          <span className={`text-sm ${getStatusColor(debtor.due_date)}`}>
                            {daysUntilDue < 0 
                              ? `${Math.abs(daysUntilDue)} days overdue`
                              : daysUntilDue === 0 
                              ? "Due today"
                              : `${daysUntilDue} days left`
                            }
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          onClick={() => markAsPaidMutation.mutate(debtor.id)}
                          disabled={markAsPaidMutation.isPending}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Mark Paid
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No outstanding debts!</h3>
              <p className="text-gray-500">All your customers are up to date with their payments.</p>
              <p className="text-sm text-gray-400 mt-2">
                Debtors are automatically created when sales are marked as "pending"
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Debtors;
