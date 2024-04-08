export function checkHowManyToSell(iOwn: number, traderOwns: number, traderSold: number): number {
  // Trader didn't sold anything or I don't own anything, so nothing to sell
  if (traderSold === 0 || iOwn === 0) {
    return 0;
  }

  // If trader don't own anything anymore, it means that they sold all keys, we
  // should sell all of their keys as well
  if (traderOwns === 0) return iOwn;

  const traderOwnedBefore = traderOwns + traderSold;

  const iNeedToSell = Math.ceil((traderSold / traderOwnedBefore) * iOwn);

  // If percentage-wise I need to sell all the keys, including the last one,
  // then I need to keep onw
  if (iOwn - iNeedToSell === 0) {
    return iNeedToSell - 1;
  }

  return iNeedToSell;
}
