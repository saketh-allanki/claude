// Progressive enhancements. Every page works without JavaScript.
(function () {
  'use strict';

  // Confirm destructive actions.
  document.addEventListener('submit', function (event) {
    var form = event.target;
    var message = form.getAttribute && form.getAttribute('data-confirm');
    if (message && !window.confirm(message)) event.preventDefault();
  });

  // Floating tooltip for uptime cells (also reachable via the "Show as table" view).
  var tip = null;
  function showTip(text, x, y) {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tip-float';
      document.body.appendChild(tip);
    }
    tip.textContent = text;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    tip.hidden = false;
  }
  function hideTip() {
    if (tip) tip.hidden = true;
  }
  document.addEventListener('pointerover', function (event) {
    var el = event.target.closest && event.target.closest('[data-tip]');
    if (!el) return;
    var rect = el.getBoundingClientRect();
    showTip(el.getAttribute('data-tip'), rect.left + rect.width / 2, rect.top);
  });
  document.addEventListener('pointerout', function (event) {
    if (event.target.closest && event.target.closest('[data-tip]')) hideTip();
  });
  window.addEventListener('scroll', hideTip, { passive: true });

  // Response-time chart: crosshair snaps to the nearest check; arrow keys step through checks.
  var timeFmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
  document.querySelectorAll('[data-chart="response"]').forEach(function (fig) {
    var points;
    try {
      points = JSON.parse(fig.getAttribute('data-points'));
    } catch (e) {
      return;
    }
    if (!points.length) return;
    var start = Number(fig.getAttribute('data-start'));
    var end = Number(fig.getAttribute('data-end'));
    var left = Number(fig.getAttribute('data-left'));
    var right = Number(fig.getAttribute('data-right'));
    var width = Number(fig.getAttribute('data-width'));
    var svg = fig.querySelector('svg');
    var line = fig.querySelector('.crosshair');
    var box = fig.querySelector('.chart-tip');
    var index = points.length - 1;

    function xFor(t) {
      return left + ((t - start) / (end - start)) * (width - left - right);
    }
    function render(i) {
      index = Math.max(0, Math.min(points.length - 1, i));
      var p = points[index];
      var x = xFor(p[0]);
      line.setAttribute('x1', x);
      line.setAttribute('x2', x);
      line.setAttribute('visibility', 'visible');
      var scale = svg.getBoundingClientRect().width / width;
      box.hidden = false;
      box.textContent = '';
      var value = document.createElement('strong');
      value.textContent = p[1] ? p[2] + ' ms' : 'Failed check';
      var when = document.createElement('span');
      when.textContent = timeFmt.format(new Date(p[0]));
      box.appendChild(value);
      box.appendChild(when);
      var px = x * scale;
      var half = box.offsetWidth / 2;
      box.style.left = Math.max(half, Math.min(fig.clientWidth - half, px)) + 'px';
    }
    function clear() {
      line.setAttribute('visibility', 'hidden');
      box.hidden = true;
    }
    function nearest(clientX) {
      var rect = svg.getBoundingClientRect();
      var x = ((clientX - rect.left) / rect.width) * width;
      var t = start + ((x - left) / (width - left - right)) * (end - start);
      var lo = 0;
      var hi = points.length - 1;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (points[mid][0] < t) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0 && Math.abs(points[lo - 1][0] - t) < Math.abs(points[lo][0] - t)) lo--;
      return lo;
    }
    svg.addEventListener('pointermove', function (e) {
      render(nearest(e.clientX));
    });
    svg.addEventListener('pointerleave', clear);
    fig.addEventListener('focus', function () {
      render(index);
    });
    fig.addEventListener('blur', clear);
    fig.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') {
        render(index - 1);
        e.preventDefault();
      } else if (e.key === 'ArrowRight') {
        render(index + 1);
        e.preventDefault();
      }
    });
  });

  // Keep the dashboard fresh while it is open.
  if (location.pathname === '/app') {
    setInterval(function () {
      var active = document.activeElement;
      var typing = active && /INPUT|SELECT|TEXTAREA/.test(active.tagName);
      if (document.visibilityState === 'visible' && !typing) location.reload();
    }, 60000);
  }
})();
