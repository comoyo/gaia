function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

document.getElementById('testkb').addEventListener('click', function(e) {
  var pos = getRandomInt(0, this.value.length);
  navigator.mozKeyboard.setSelectionRange(pos, pos);
  var sel = navigator.mozKeyboard.selectionEnd;
  document.getElementById('result').innerHTML =
    'Move cursor to position: ' + pos + '<br/>mozKeyboard.selectionEnd: ' + sel;
});
