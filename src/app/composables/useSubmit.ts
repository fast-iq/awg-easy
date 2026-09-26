import { FetchError } from 'ofetch';

type SubmitOpts = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revert: (success: boolean, data?: any) => Promise<void>;
  successMsg?: string;
  noSuccessToast?: boolean;
};

// The old nitropack typed-route generics caused TS2321 "Excessive stack depth"
// on every call site. Use plain types instead — runtime behavior is unchanged.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useSubmit(url: any, options: any, opts: SubmitOpts) {
  const toast = useToast();

  return async (data: unknown) => {
    try {
      const res = await $fetch(url, {
        ...options,
        body: data,
      });

      if (!opts.noSuccessToast) {
        toast.showToast({
          type: 'success',
          message: opts.successMsg,
        });
      }

      await opts.revert(true, res);
    } catch (e) {
      if (e instanceof FetchError) {
        toast.showToast({
          type: 'error',
          message: e.data?.message ?? 'Ошибка при выполнении запроса',
        });
      } else if (e instanceof Error) {
        toast.showToast({
          type: 'error',
          message: e.message,
        });
      } else {
        console.error(e);
      }
      await opts.revert(false, undefined);
    }
  };
}
