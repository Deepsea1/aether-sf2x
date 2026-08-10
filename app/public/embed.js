// Aether embeddable trust badge — drop-in script.
// Usage: <script src="https://aether.sf2x.ai/embed.js" data-id="<warrant_id>" data-style="full"></script>
// Styles: full (default) | compact | pill | score
// Renders an iframe pointing at /embed/badge/:id so the badge is style-isolated
// and always reflects the live trust score. The iframe links back to aether.sf2x.ai.
(function () {
  var s = document.currentScript;
  if (!s) return;
  var id = s.getAttribute('data-id');
  var style = s.getAttribute('data-style') || 'full';
  var origin = s.src.replace(/\/embed\.js.*$/, '');
  if (!id) return;
  var host = document.createElement('div');
  host.className = 'aether-badge';
  host.style.display = 'inline-block';
  s.parentNode.insertBefore(host, s);
  var f = document.createElement('iframe');
  f.src = origin + '/embed/badge/' + encodeURIComponent(id) + '?style=' + encodeURIComponent(style);
  f.title = 'Aether trust badge';
  f.scrolling = 'no';
  f.frameBorder = '0';
  f.style.border = '0';
  f.style.background = 'transparent';
  f.style.overflow = 'hidden';
  if (style === 'pill') { f.style.width = '150px'; f.style.height = '30px'; }
  else if (style === 'score') { f.style.width = '130px'; f.style.height = '90px'; }
  else if (style === 'compact') { f.style.width = '240px'; f.style.height = '160px'; }
  else { f.style.width = '340px'; f.style.height = '230px'; }
  host.appendChild(f);
})();
