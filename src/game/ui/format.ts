/** Short numbers for big amounts: 98,765 stays, 1,234,567 -> "1.23M", 45,600,000 -> "45.6M". */
export function compact(n: number): string {
  const a = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const short = (v: number, unit: string) => {
    const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
    return `${sign}${Number(v.toFixed(digits))}${unit}`;
  };
  if (a >= 1e9) return short(a / 1e9, 'B');
  if (a >= 1e6) return short(a / 1e6, 'M');
  if (a >= 1e5) return short(a / 1e3, 'K');
  return String(Math.round(n));
}
