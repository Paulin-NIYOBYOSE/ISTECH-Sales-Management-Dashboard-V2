// src/lib/debtorStats.ts
import { supabase } from "@/integrations/supabase/client";
import { isAfter } from "date-fns";

export const fetchDebtorStats = async () => {
  const { data: allDebtors, error } = await supabase
    .from("debtors")
    .select("amount_owed, is_resolved, due_date");

  if (error) throw error;

  const totalOutstanding =
    allDebtors?.filter((d) => !d.is_resolved).reduce((sum, d) => sum + Number(d.amount_owed), 0) || 0;

  const overdueDebtors =
    allDebtors?.filter((d) => !d.is_resolved && isAfter(new Date(), new Date(d.due_date))).length || 0;

  const totalResolved =
    allDebtors?.filter((d) => d.is_resolved).reduce((sum, d) => sum + Number(d.amount_owed), 0) || 0;

  const activeDebtors = allDebtors?.filter((d) => !d.is_resolved).length || 0;

  return {
    totalOutstanding,
    overdueDebtors,
    totalResolved,
    activeDebtors,
  };
};
