function cardValue(num){
  if(num === 1) return 'A';
  if(num >= 2 && num <= 9) return String(num);
  if(num === 10) return 'T';
  if(num === 11) return 'J';
  if(num === 12) return 'Q';
  return 'K';
}

function getCardAsset(num, suit){
  const v = cardValue(num);
  const s = suit.toLowerCase();
  return `./assets/${v}${s}.svg`;
}

if (typeof module !== 'undefined') {
  module.exports = { cardValue, getCardAsset };
}
