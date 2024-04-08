import { checkHowManyToSell } from '../checkHowManyToSell.js';

describe('checkHowManyToSell', () => {
  test.each([
    { iOwn: 0, traderSold: 1, traderOwns: 0, expected: 0 }, // I don't own any, so no action
    { iOwn: 1, traderSold: 1, traderOwns: 1, expected: 0 }, // Trader still owns one, I don't want to sell the last key
    { iOwn: 1, traderSold: 1, traderOwns: 0, expected: 1 }, // Trader sold last, I sell everything
    { iOwn: 10, traderSold: 2, traderOwns: 0, expected: 10 }, // Trader sold last, I sell everything
    { iOwn: 1, traderSold: 0, traderOwns: 1, expected: 0 }, // Trader didn't sell anything, so no actions
    { iOwn: 2, traderSold: 2, traderOwns: 2, expected: 1 }, // Trader sold 50%, my 50% is 0.5 so we round up to 1, I still own one key
    { iOwn: 2, traderSold: 1, traderOwns: 2, expected: 1 }, // Trader sold 1/3, my 1/3 is 0.66 so we round up to 1, I still own one key
    { iOwn: 12, traderSold: 4, traderOwns: 1, expected: 10 }, // Trader sold 4/5, my 4/5 is 9.6 so we round up to 10, I still own 2 keys
    { iOwn: 5, traderSold: 11, traderOwns: 1, expected: 4 }, // Percentage-wise we should sell all but trader still owns 1 so we keep 1
    { iOwn: 5, traderSold: 10, traderOwns: 2, expected: 4 }, // Percentage-wise we should sell all but trader still owns 2 so we keep 1
    { iOwn: 5, traderSold: 8, traderOwns: 4, expected: 4 },
  ])(
    'iOwn: $iOwn, traderSold: $traderSold, traderOwns: $traderOwns | selling: $expected',
    ({ iOwn, traderOwns, traderSold, expected }) => {
      expect(checkHowManyToSell(iOwn, traderOwns, traderSold)).toBe(expected);
    },
  );
});
