/**
 * search.js — Client-side search (matches title, content, and group name)
 */

(function () {
  'use strict';

  function filterSnippets(keyword, snippets) {
    if (!keyword || !keyword.trim()) return snippets;
    var kw = keyword.toLowerCase().trim();

    // Collect group names that match the keyword
    var matchedGroups = {};
    for (var i = 0; i < snippets.length; i++) {
      var g = (snippets[i].group || '').trim();
      if (g && g.toLowerCase().indexOf(kw) !== -1) {
        matchedGroups[g] = true;
      }
    }

    return snippets.filter(function (s) {
      // Match title/content
      if (s.title.toLowerCase().indexOf(kw) !== -1) return true;
      if (s.content.toLowerCase().indexOf(kw) !== -1) return true;
      // Match group name → include entire group
      var g = (s.group || '').trim();
      if (g && matchedGroups[g]) return true;
      return false;
    });
  }

  window.OneClip = window.OneClip || {};
  window.OneClip.filterSnippets = filterSnippets;

})();
