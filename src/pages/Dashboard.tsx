
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, DollarSign, Package, Users, ShoppingCart } from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
import { fetchDebtorStats } from "@/lib/debtorStats";


const Dashboard = () => {
  const [dateRange, setDateRange] = useState("daily");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");


  const getDateRange = () => {
    const today = new Date();
    switch (dateRange) {
      case "daily":
        return { start: startOfDay(today), end: endOfDay(today) };
      case "monthly":
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case "yearly":
        return { start: startOfYear(today), end: endOfYear(today) };
      case "custom":
        if (customStartDate && customEndDate) {
          return { 
            start: startOfDay(new Date(customStartDate)), 
            end: endOfDay(new Date(customEndDate)) 
          };
        }
        return { start: startOfDay(today), end: endOfDay(today) };
      default:
        return { start: subDays(today, 7), end: today };
    }
  };

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", dateRange, customStartDate, customEndDate],
    queryFn: async () => {
      const { start, end } = getDateRange();

      // Get sales data for the selected period
      const { data: salesData } = await supabase
        .from("sales")
        .select(`
          *,
          sale_items(*),
          customers(name)
        `)
        .gte("sale_date", start.toISOString())
        .lte("sale_date", end.toISOString());

      // Get products count
      const { count: productsCount } = await supabase
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true);

      // Get active debtors
      const { count: debtorsCount } = await supabase
        .from("debtors")
        .select("*", { count: "exact", head: true })
        .eq("is_resolved", false);

      // Get total inventory value (cost * quantity)
      const { data: products } = await supabase
        .from("products")
        .select("cost, stock_quantity")
        .eq("is_active", true);

      const totalInventoryValue = products?.reduce((sum, product) => 
        sum + (Number(product.cost) * product.stock_quantity), 0) || 0;

      // Calculate sales metrics
      const totalRevenue = salesData?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
      const totalCost = salesData?.reduce((sum, sale) => sum + Number(sale.total_cost), 0) || 0;
      const totalProfit = totalRevenue - totalCost;
      const productsSold = salesData?.reduce((sum, sale) => 
        sum + (sale.sale_items?.reduce((itemSum, item) => itemSum + item.quantity, 0) || 0), 0) || 0;

      return {
        totalRevenue,
        totalCost,
        totalProfit,
        productsSold,
        debtorsCount: debtorsCount || 0,
        salesData: salesData || [],
        productsCount: productsCount || 0,
        totalInventoryValue,
        salesCount: salesData?.length || 0,
      };
    },
  });

  const { data: chartData } = useQuery({
    queryKey: ["chart-data", dateRange],
    queryFn: async () => {
      const days = dateRange === "yearly" ? 12 : dateRange === "monthly" ? 30 : 7;
      const timeUnit = dateRange === "yearly" ? "month" : "day";
      
      const chartDays = Array.from({ length: days }, (_, i) => {
        const date = dateRange === "yearly" 
          ? subDays(new Date(), (days - 1 - i) * 30) 
          : subDays(new Date(), days - 1 - i);
        return {
          date: dateRange === "yearly" ? format(date, "MMM yyyy") : format(date, "MMM dd"),
          dateString: format(date, "yyyy-MM-dd"),
        };
      });

      const chartPromises = chartDays.map(async (day) => {
        const dayStart = startOfDay(new Date(day.dateString));
        const dayEnd = endOfDay(new Date(day.dateString));

        const { data: dayStats } = await supabase
          .from("sales")
          .select("total_amount, total_cost")
          .gte("sale_date", dayStart.toISOString())
          .lt("sale_date", dayEnd.toISOString());

        const sales = dayStats?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
        const expenses = dayStats?.reduce((sum, sale) => sum + Number(sale.total_cost), 0) || 0;

        return {
          date: day.date,
          sales,
          expenses,
          profit: sales - expenses,
        };
      });

      return Promise.all(chartPromises);
    },
  });

  const recentSales = stats?.salesData?.slice(0, 5).map(sale => ({
    customer: sale.customers?.name || "Unknown",
    items: sale.sale_items?.map(item => `${item.quantity}x Product`).join(", ") || "",
    amount: `RWF ${Number(sale.total_amount).toLocaleString()}`,
    profit: `RWF ${(Number(sale.total_amount) - Number(sale.total_cost)).toLocaleString()}`,
    date: format(new Date(sale.sale_date), "MMM dd, yyyy"),
  })) || [];

  const { start, end } = getDateRange();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
        <p className="text-gray-600 dark:text-gray-400">
          {format(start, "MMM dd, yyyy")} - {format(end, "MMM dd, yyyy")}
        </p>
        
        {/* Date Range Selector */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <Button
            variant={dateRange === "daily" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("daily")}
          >
            Today
          </Button>
          <Button
            variant={dateRange === "weekly" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("weekly")}
          >
            This Week
          </Button>
          <Button
            variant={dateRange === "monthly" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("monthly")}
          >
            This Month
          </Button>
          <Button
            variant={dateRange === "yearly" ? "default" : "outline"}
            size="sm"
            onClick={() => setDateRange("yearly")}
          >
            This Year
          </Button>
          <div className="flex gap-2 items-center">
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            />
            <span>to</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            />
            <Button
              variant={dateRange === "custom" ? "default" : "outline"}
              size="sm"
              onClick={() => setDateRange("custom")}
              disabled={!customStartDate || !customEndDate}
            >
              Custom Range
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">RWF {stats?.totalRevenue?.toLocaleString() || 0}</div>
            <div className="flex items-center text-sm text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              From {stats?.salesCount  || 0} sales
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">RWF {stats?.totalProfit?.toLocaleString() || 0}</div>
            <div className="flex items-center text-sm text-gray-600">
              Revenue - Cost
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products Sold</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.productsSold || 0}</div>
            <div className="flex items-center text-sm text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              Units moved
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Debtors</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.debtorsCount || 0}</div>
            <div className="flex items-center text-sm text-gray-600">
              Outstanding payments
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">RWF {stats?.totalInventoryValue?.toLocaleString() || 0}</div>
            <div className="flex items-center text-sm text-gray-600">
              Stock cost value
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Sales Overview Chart */}
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Sales & Profit Overview</CardTitle>
            <p className="text-sm text-gray-500">Revenue and profit trends over time</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: any) => [`RWF ${Number(value).toLocaleString()}`, ""]} />
                <Line type="monotone" dataKey="sales" stroke="#2563eb" name="Sales" strokeWidth={2} />
                <Line type="monotone" dataKey="profit" stroke="#16a34a" name="Profit" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Sales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentSales.length > 0 ? recentSales.map((sale, index) => (
              <div key={index} className="flex items-center space-x-4">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <ShoppingCart className="h-4 w-4" />
                </div>
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-medium">{sale.customer}</p>
                  <p className="text-xs text-gray-500">{sale.items}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{sale.amount}</p>
                  <p className="text-xs text-green-600 font-medium">{sale.profit} profit</p>
                  <p className="text-xs text-gray-500">{sale.date}</p>
                </div>
              </div>
            )) : (
              <p className="text-center text-gray-500 py-8">No sales found for this period</p>
            )}
          </CardContent>
        </Card>

        {/* Debtors Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Debtors Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-500">Active debtors</p>
              <p className="text-2xl font-bold mt-2">{stats?.debtorsCount || 0}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
