import { roundEth } from '../roundEth';

test('roundEth', () => {
  expect(roundEth(1.23456789)).toEqual('1.2346');
  expect(roundEth(1, { minimumIntegerDigits: 2 })).toEqual('1');
  expect(roundEth(1.23456789, { maximumFractionDigits: 3 })).toEqual('1.235');
});
