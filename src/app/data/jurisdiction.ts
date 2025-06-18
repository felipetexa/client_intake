export function determineJurisdiction(amount?: number): 'small_claims' | 'above_small_claims' | 'ambiguous' {
  if (typeof amount !== "number" || isNaN(amount)) return 'ambiguous';
  if (amount < 35000) return 'small_claims';
  return 'above_small_claims'
}

export function extractAmount(input: string): number | undefined {
  const match = input.match(/\$?(\d{1,3}(,\d{3})*|\d+)(\.\d{2})?/);
  if (!match) return undefined;

  return parseFloat(match[0].replace(/[$,]/g, ''));
}