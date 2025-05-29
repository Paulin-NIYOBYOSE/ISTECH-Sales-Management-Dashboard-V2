
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { TrendingUp, DollarSign, Package, ShoppingCart } from "lucide-react";
import { format, subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear } from "date-fns";
const Analysis = () => {
  const [dateRange, setDateRange] = useState("monthly");
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
        return { start: startOfMonth(today), end: endOfMonth(today) };
      default:
        return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  };

  const { data: analyticsData } = useQuery({
    queryKey: ["analytics", dateRange, customStartDate, customEndDate],
    queryFn: async () => {
      const { start, end } = getDateRange();

      // Get sales with items and customers for the selected period
      const { data: salesData } = await supabase
        .from("sales")
        .select(`
          *,
          sale_items(*, products(name, category)),
          customers(name)
        `)
        .gte("sale_date", start.toISOString())
        .lte("sale_date", end.toISOString());

      // Get product performance
      const { data: productPerformance } = await supabase
        .from("sale_items")
        .select(`
          quantity,
          unit_price,
          unit_cost,
          products(name, category),
          sales!inner(sale_date)
        `)
        .gte("sales.sale_date", start.toISOString())
        .lte("sales.sale_date", end.toISOString());

      // Calculate metrics
      
      const totalRevenue = salesData?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
      const totalCost = salesData?.reduce((sum, sale) => sum + Number(sale.total_cost), 0) || 0;
      const totalProfit = totalRevenue - totalCost;

      // Category analysis
      const categoryMap = new Map();
      productPerformance?.forEach(item => {
        const category = item.products?.category || 'Uncategorized';
        const revenue = item.quantity * Number(item.unit_price);
        const cost = item.quantity * Number(item.unit_cost);
        const profit = revenue - cost;
        
        const current = categoryMap.get(category) || { revenue: 0, cost: 0, profit: 0, quantity: 0 };
        categoryMap.set(category, {
          revenue: current.revenue + revenue,
          cost: current.cost + cost,
          profit: current.profit + profit,
          quantity: current.quantity + item.quantity,
        });
      });

      const categoryData = Array.from(categoryMap.entries()).map(([name, data]) => ({
        name,
        revenue: data.revenue,
        cost: data.cost,
        profit: data.profit,
        quantity: data.quantity,
      }));

      // Top products by profit
      const productMap = new Map();
      productPerformance?.forEach(item => {
        const productName = item.products?.name || 'Unknown';
        const revenue = item.quantity * Number(item.unit_price);
        const cost = item.quantity * Number(item.unit_cost);
        const profit = revenue - cost;
        
        const current = productMap.get(productName) || { revenue: 0, cost: 0, profit: 0, quantity: 0 };
        productMap.set(productName, {
          revenue: current.revenue + revenue,
          cost: current.cost + cost,
          profit: current.profit + profit,
          quantity: current.quantity + item.quantity,
        });
      });

      const topProducts = Array.from(productMap.entries())
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);

      // Time-based trend
      const trendDays = dateRange === "yearly" ? 12 : dateRange === "monthly" ? 30 : 7;
      const timeTrend = [];
      
      for (let i = trendDays - 1; i >= 0; i--) {
        const date = dateRange === "yearly" 
          ? subDays(new Date(), i * 30) 
          : subDays(new Date(), i);
        const dateStr = dateRange === "yearly" ? format(date, "MMM") : format(date, "MMM dd");
        
        const dayStart = startOfDay(date);
        const dayEnd = endOfDay(date);
        
        const daySales = salesData?.filter(sale => {
          const saleDate = new Date(sale.sale_date);
          return saleDate >= dayStart && saleDate <= dayEnd;
        }) || [];

        const dayRevenue = daySales.reduce((sum, sale) => sum + Number(sale.total_amount), 0);
        const dayCost = daySales.reduce((sum, sale) => sum + Number(sale.total_cost), 0);

        timeTrend.push({
          date: dateStr,
          revenue: dayRevenue,
          cost: dayCost,
          profit: dayRevenue - dayCost,
        });
      }

      return {
        totalRevenue,
        totalCost,
        totalProfit,
        categoryData,
        topProducts,
        timeTrend,
        salesCount: salesData?.length || 0,
        avgOrderValue: salesData?.length ? totalRevenue / salesData.length : 0,
        totalQuantitySold: productPerformance?.reduce((sum, item) => sum + item.quantity, 0) || 0,
      };
    },
  });

  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];
  const { start, end } = getDateRange();

  return (
    <div className="space-y-6">
      <div className="border-b border-gray-200 pb-4">
        <h1 className="text-3xl font-bold">Sales Analysis</h1>
        <p className="text-gray-600">
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

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">RWF {analyticsData?.totalRevenue?.toLocaleString() || 0}</div>
            <div className="flex items-center text-sm text-green-600">
              <TrendingUp className="h-3 w-3 mr-1" />
              Total sales
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">RWF {analyticsData?.totalProfit?.toLocaleString() || 0}</div>
            <div className="text-sm text-gray-600">
              Revenue - Cost
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData?.salesCount || 0}</div>
            <div className="text-sm text-gray-600">Number of transactions</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Units Sold</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analyticsData?.totalQuantitySold || 0}</div>
            <div className="text-sm text-gray-600">Total products moved</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Profit Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Profit Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData?.timeTrend || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(value: any) => [`RWF ${Number(value).toLocaleString()}`, ""]} />
                <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} name="Revenue" />
                <Line type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={2} name="Profit" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Profit by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData?.categoryData || []}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="profit"
                >
                  {analyticsData?.categoryData?.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => [`RWF ${Number(value).toLocaleString()}`, "Profit"]} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Products by Profit */}
        <Card>
          <CardHeader>
            <CardTitle>Top Products by Profit</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData?.topProducts?.slice(0, 5) || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: any) => [`RWF ${Number(value).toLocaleString()}`, "Profit"]} />
                <Bar dataKey="profit" fill="#16a34a" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category Revenue vs Cost */}
        <Card>
          <CardHeader>
            <CardTitle>Category Revenue vs Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData?.categoryData || []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value: any) => [`RWF ${Number(value).toLocaleString()}`, ""]} />
                <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                <Bar dataKey="cost" fill="#dc2626" name="Cost" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Category Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analyticsData?.categoryData?.map((category, index) => (
                <div key={category.name} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center space-x-3">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: COLORS[index % COLORS.length] }}
                    />
                    <span className="font-medium">{category.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">RWF {category.profit.toLocaleString()}</div>
                    <div className="text-sm text-gray-500">RWF {category.revenue.toLocaleString()} revenue</div>
                    <div className="text-xs text-gray-500">{category.quantity} units</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Profitable Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analyticsData?.topProducts?.slice(0, 8).map((product, index) => (
                <div key={product.name} className="flex items-center justify-between p-3 border rounded">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                      <Package className="h-4 w-4 text-blue-600" />
                    </div>
                    <span className="font-medium">{product.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">RWF {product.profit.toLocaleString()}</div>
                    <div className="text-sm text-gray-500">RWF {product.revenue.toLocaleString()} revenue</div>
                    <div className="text-xs text-gray-500">{product.quantity} sold</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Analysis;
