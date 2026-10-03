/** Page batched reads within PostgREST's 1,000-row cap. Callers must order by a unique key. */
export async function loadAllRows<T>(queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ data: T[] | null; error: unknown }> {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await queryPage(offset, offset + pageSize - 1);
    if (error || !data) return { data: null, error };
    rows.push(...data);
    if (data.length < pageSize) return { data: rows, error: null };
  }
}
