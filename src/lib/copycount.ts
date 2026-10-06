export function formatCopycount(value: string): string {
  const digits = value.replace(/,/g, '').trim();
  if (!/^\d+$/.test(digits)) return value;
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
