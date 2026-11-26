"use client";

import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "@pricora/ui";
import { errorMessage } from "./api";

/** useMutation + success/error toast + invalidation of the given query keys. */
export function useApiMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { success?: string | ((data: TData, vars: TVars) => string); invalidate?: QueryKey[]; onSuccess?: (data: TData, vars: TVars) => void },
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(data, vars) : opts.success);
      opts.onSuccess?.(data, vars);
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
    },
    onError: (err) => {
      toast.error(errorMessage(err));
    },
  });
}
