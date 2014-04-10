(function() {

  var tDElement;

  document.addEventListener('homescreen-ready', function(e) {
    tDElement = createTDPage();
  }, false);

  GridManager.goToLandingPage = function() {
    document.body.dataset.transitioning = 'true';
    // The home button should go to page 1, not 0
    GridManager.goToPage(tDElement ? 1 : 0);
  };

  function createTDPage() {
    // Insert the page
    GridManager.pageHelper.addPage([], 0, 0);
    // Then get the page (which will be at index 1)
    var page = GridManager.pageHelper.getPage(1);
    // Dont save this page as its dynamic
    page.ignoreOnSave = true;

    // And grab the element so we can do stuff with it
    var el = GridManager.container.firstChild;
    el.classList.add('td-page');

    var container = document.createElement('div');
    container.classList.add('td-container');

    el.appendChild(container);

    return el;
  };

})();
