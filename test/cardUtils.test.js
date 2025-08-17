const { test } = require('node:test');
const assert = require('assert/strict');
const { cardValue, getCardAsset } = require('../cardUtils.js');

test('cardValue converts numbers to codes', () => {
  assert.equal(cardValue(1), 'A');
  assert.equal(cardValue(2), '2');
  assert.equal(cardValue(9), '9');
  assert.equal(cardValue(10), 'T');
  assert.equal(cardValue(11), 'J');
  assert.equal(cardValue(12), 'Q');
  assert.equal(cardValue(13), 'K');
});

test('getCardAsset builds path using code and suit', () => {
  assert.equal(getCardAsset(1, 'H'), './assets/Ah.svg');
  assert.equal(getCardAsset(10, 'S'), './assets/Ts.svg');
  assert.equal(getCardAsset(13, 'D'), './assets/Kd.svg');
});
