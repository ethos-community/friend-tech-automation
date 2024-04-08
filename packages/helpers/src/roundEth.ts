export function roundEth(
  value: number,
  { minimumFractionDigits, maximumFractionDigits }: Intl.NumberFormatOptions = {},
): string {
  return new Intl.NumberFormat('en', {
    style: 'decimal',
    minimumFractionDigits: minimumFractionDigits ?? 0,
    maximumFractionDigits: maximumFractionDigits ?? 4,
  }).format(value);
}
