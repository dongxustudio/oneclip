/**
 * app.js — App initialization, group bar, search, keyboard, import/export
 */

(function () {
  'use strict';

  var snippets = [];
  var allGroups = [];
  var searchInput = null;
  var searchTimer = null;
  var DEBOUNCE = 120;
  var toastTimer = null;
  var groupOrder = [];
  var groupFilter = '';
  var contextMenuGroup = null; // current group name for context menu

  function init() {
    searchInput = document.getElementById('search-input');

    // Titlebar
    document.getElementById('btn-minimize').addEventListener('click', function () {
      window.electronAPI.minimizeWindow();
    });
    document.getElementById('btn-close').addEventListener('click', function () {
      window.electronAPI.hideWindow();
    });

    // Pin
    var pinBtn = document.getElementById('btn-pin');
    window.electronAPI.getAlwaysOnTop().then(function (on) { if (on) pinBtn.classList.add('pinned'); });
    pinBtn.addEventListener('click', function () {
      window.electronAPI.toggleAlwaysOnTop().then(function (s) {
        if (s) pinBtn.classList.add('pinned'); else pinBtn.classList.remove('pinned');
      });
    });

    // Toolbar
    document.getElementById('btn-add').addEventListener('click', function () { window.OneClip.openEditor(); });
    document.getElementById('btn-empty-add').addEventListener('click', function () { window.OneClip.openEditor(); });

    // Add group — modal
    document.getElementById('btn-add-group').addEventListener('click', openGroupEditor);
    document.getElementById('btn-group-editor-close').addEventListener('click', closeGroupEditor);
    document.getElementById('btn-group-editor-cancel').addEventListener('click', closeGroupEditor);
    document.getElementById('btn-group-editor-create').addEventListener('click', createGroup);
    backdropGuard('group-editor-overlay', closeGroupEditor);

    // Search
    searchInput.addEventListener('input', onSearch);
    document.getElementById('btn-search-clear').addEventListener('click', clearSearch);

    // Main-process events
    window.electronAPI.onOpenEditor(function () { window.OneClip.openEditor(); });
    window.electronAPI.onSnippetsChanged(function () { refresh(); });
    window.electronAPI.onDataDirChanged(function () { refresh(); });
    window.electronAPI.onToast(function (payload) { showToast(payload.message, payload.type); });
    window.electronAPI.registerGlobalShortcut().then(function (ok) {
      if (!ok) console.warn('Global hotkey Ctrl+Shift+V could not be registered');
    });

    // Editor modal
    document.getElementById('btn-editor-close').addEventListener('click', window.OneClip.closeEditor);
    document.getElementById('btn-editor-cancel').addEventListener('click', window.OneClip.closeEditor);
    document.getElementById('btn-editor-save').addEventListener('click', window.OneClip.saveSnippet);

    // Delete modal
    document.getElementById('btn-delete-cancel').addEventListener('click', window.OneClip.closeDeleteConfirm);
    document.getElementById('btn-delete-confirm').addEventListener('click', window.OneClip.confirmDelete);

    // Overlay backdrop — only close when mousedown AND mouseup both on backdrop
    // (prevents accidental close when clicking back from another window)
    function backdropGuard(overlayId, closeFn) {
      var overlay = document.getElementById(overlayId);
      var downTarget = null;
      overlay.addEventListener('mousedown', function (e) { downTarget = e.target; });
      overlay.addEventListener('mouseup', function (e) {
        if (e.target === overlay && downTarget === overlay) closeFn();
        downTarget = null;
      });
    }
    backdropGuard('editor-overlay', window.OneClip.closeEditor);
    backdropGuard('delete-overlay', window.OneClip.closeDeleteConfirm);

    // Click-outside deselect
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.snippet-card') && window.OneClip.deselectAll) {
        window.OneClip.deselectAll();
      }
    });

    // Keyboard
    document.addEventListener('keydown', onKeyDown);

    // Chip bar drag-to-scroll
    enableChipBarDragScroll();

    // Context menu — dismiss helper
    function dismissContextMenu() {
      var menu = document.getElementById('group-context-menu');
      if (!menu.classList.contains('hidden')) {
        menu.classList.add('hidden');
        contextMenuGroup = null;
      }
    }

    // Context menu — close on outside click, outside right-click, scroll, resize
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#group-context-menu')) dismissContextMenu();
    });
    document.addEventListener('contextmenu', function (e) {
      // Don't dismiss when right-clicking group trigger (its handler shows the menu)
      var onTrigger = e.target.closest('.group-section-header') ||
        (e.target.closest('.group-chip') && e.target.closest('.group-chip').getAttribute('data-group'));
      if (!onTrigger) dismissContextMenu();
    });
    document.getElementById('snippet-list').addEventListener('scroll', dismissContextMenu);
    document.getElementById('group-bar-scroll').addEventListener('scroll', dismissContextMenu);
    window.addEventListener('resize', dismissContextMenu);

    // Context menu — handle actions
    document.getElementById('group-context-menu').addEventListener('click', function (e) {
      var action = e.target.getAttribute('data-action');
      if (!action || !contextMenuGroup) return;
      document.getElementById('group-context-menu').classList.add('hidden');
      var group = contextMenuGroup;
      contextMenuGroup = null;
      if (action === 'new-snippet') {
        window.OneClip.openEditor(null, group);
      } else if (action === 'rename') {
        startRename(group);
      } else if (action === 'delete') {
        var count = snippets.filter(function (s) { return (s.group || '').trim() === group; }).length;
        window.OneClip.showGroupDeleteConfirm(group, count);
      }
    });

    // Load
    refresh();
  }

  // ═══ Chip Bar Drag-to-Scroll ═══

  function enableChipBarDragScroll() {
    var el = document.getElementById('group-bar-scroll');
    if (!el) return;

    var dragging = false;
    var moved = false;
    var startX = 0;
    var startScroll = 0;
    var THRESHOLD = 3;

    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      startX = e.clientX;
      startScroll = el.scrollLeft;
      el.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      if (Math.abs(dx) > THRESHOLD) moved = true;
      el.scrollLeft = startScroll - dx;
    });

    document.addEventListener('mouseup', function () {
      if (dragging) {
        dragging = false;
        el.style.cursor = 'grab';
      }
    });

    // Suppress chip clicks after drag
    el.addEventListener('click', function (e) {
      if (moved) {
        e.stopPropagation();
        e.preventDefault();
        moved = false;
      }
    }, true);
  }

  // ═══ Group Filter & Render ═══

  function applyGroupFilter(g) {
    groupFilter = g || '';
    rebuildGroupBar();  // update active chip
    renderFiltered();   // apply filter + render
  }

  function renderFiltered() {
    var filtered = snippets.slice();
    // Apply group filter first (flat view for single group)
    if (groupFilter) {
      filtered = filtered.filter(function (s) {
        if (groupFilter === 'Uncategorized') return !(s.group && s.group.trim());
        return (s.group || '').trim() === groupFilter;
      });
    }
    // Then apply search filter
    var kw = searchInput ? searchInput.value : '';
    filtered = window.OneClip.filterSnippets(kw, filtered);
    window.OneClip.renderList(filtered, kw, groupFilter, allGroups);
  }

  // ═══ Search ═══

  function onSearch() {
    var kw = searchInput.value;
    var clearBtn = document.getElementById('btn-search-clear');
    var groupBar = document.getElementById('group-bar');

    if (kw.length > 0) {
      clearBtn.classList.remove('hidden');
      groupBar.classList.add('hidden');
    } else {
      clearBtn.classList.add('hidden');
      groupBar.classList.remove('hidden');
    }

    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderFiltered, DEBOUNCE);
  }

  function clearSearch() {
    searchInput.value = '';
    document.getElementById('btn-search-clear').classList.add('hidden');
    document.getElementById('group-bar').classList.remove('hidden');
    renderFiltered();
    searchInput.focus();
  }

  // ═══ Group Bar ═══

  function rebuildGroupBar() {
    var bar = document.getElementById('group-bar');
    var scroll = document.getElementById('group-bar-scroll');
    window.electronAPI.getGroups().then(function (groups) {
      if (!groups || groups.length === 0) {
        bar.classList.add('hidden');
        return;
      }
      bar.classList.remove('hidden');

      // Sort groups using same logic as accordion (groupOrder from settings)
      var groupOrder = window.OneClip.getGroupOrder ? window.OneClip.getGroupOrder() : [];
      groups.sort(function (a, b) {
        if (a === 'Uncategorized') return 1;
        if (b === 'Uncategorized') return -1;
        var ai = idxOf(groupOrder, a);
        var bi = idxOf(groupOrder, b);
        if (ai !== -1 && bi !== -1) return ai - bi;
        if (ai !== -1) return -1;
        if (bi !== -1) return 1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });

      // Keep "All" chip
      var activeGroup = groupFilter || '';
      var allHtml = '<button class="group-chip' + (activeGroup === '' ? ' active' : '') + '" data-group="">All</button>';
      scroll.innerHTML = allHtml;

      for (var i = 0; i < groups.length; i++) {
        (function (g) {
          var chip = document.createElement('button');
          chip.className = 'group-chip' + (activeGroup === g ? ' active' : '');
          chip.setAttribute('data-group', g);
          chip.textContent = g;
          chip.addEventListener('click', function () {
            applyGroupFilter(g);
          });
          chip.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            showGroupContextMenu(g, e.clientX, e.clientY);
          });
          scroll.appendChild(chip);
        })(groups[i]);
      }

      // "All" chip click → clear filter → accordion
      scroll.querySelector('.group-chip[data-group=""]').addEventListener('click', function () {
        applyGroupFilter('');
      });
    });
  }

  // ═══ Group Order ═══

  function setGroupOrder(order) { groupOrder = order; }
  function getGroupOrder() { return groupOrder; }

  /** Case-insensitive indexOf for group names */
  function idxOf(arr, name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].toLowerCase() === lower) return i;
    }
    return -1;
  }

  // ═══ Group Management (add / cancel inline) ═══

  function openGroupEditor() {
    document.getElementById('group-editor-overlay').classList.remove('hidden');
    var input = document.getElementById('input-group-name');
    input.value = '';
    input.focus();
  }

  function closeGroupEditor() {
    document.getElementById('group-editor-overlay').classList.add('hidden');
  }

  async function createGroup() {
    var input = document.getElementById('input-group-name');
    var trimmed = (input.value || '').trim();
    if (!trimmed) return;
    var ok = await window.electronAPI.addGroup(trimmed);
    if (ok) {
      closeGroupEditor();
      showToast('Group "' + trimmed + '" created', 'success');
      refresh();
    }
  }

  // ═══ Group Context Menu ═══

  function showGroupContextMenu(name, x, y) {
    contextMenuGroup = name;
    var menu = document.getElementById('group-context-menu');
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.remove('hidden');
    // Prevent menu from going off-screen
    var rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) { menu.style.left = (x - rect.width) + 'px'; }
    if (rect.bottom > window.innerHeight) { menu.style.top = (y - rect.height) + 'px'; }
  }

  // ═══ Rename Group ═══

  function startRename(oldName) {
    // Replace accordion header name with input
    var accordionSection = document.querySelector('.group-section[data-group="' + CSS.escape(oldName) + '"]');
    var accordionInput = null;
    if (accordionSection) {
      var nameSpan = accordionSection.querySelector('.group-section-name');
      if (nameSpan) {
        var input = document.createElement('input');
        input.className = 'rename-input';
        input.value = oldName;
        input.setAttribute('data-old-name', oldName);
        nameSpan.replaceWith(input);
        accordionInput = input;
      }
    }

    // Replace chip text with input
    var chip = document.querySelector('#group-bar-scroll .group-chip[data-group="' + CSS.escape(oldName) + '"]');
    var chipInput = null;
    if (chip) {
      chip.classList.add('chip-renaming');
      var chipText = chip.textContent;
      chip.textContent = '';
      var cInput = document.createElement('input');
      cInput.className = 'rename-input';
      cInput.style.cssText = 'font-size:12px;font-weight:500;width:80px;height:22px;padding:0 6px;background:var(--accent);color:#fff;border:none;';
      cInput.value = oldName;
      cInput.setAttribute('data-old-name', oldName);
      chip.appendChild(cInput);
      chipInput = cInput;
    }

    // Focus the accordion input first, fallback to chip
    var focusInput = accordionInput || chipInput;
    if (focusInput) { focusInput.focus(); focusInput.select(); }

    function handleKeydown(e) {
      if (e.key === 'Enter') { e.preventDefault(); commitRename(oldName, e.target.value); }
      if (e.key === 'Escape') { e.preventDefault(); cancelRename(oldName); }
    }
    function handleBlur(e) {
      setTimeout(function () {
        // If still renaming (not cancelled/committed), commit
        var currentInput = document.querySelector('.rename-input[data-old-name="' + CSS.escape(oldName) + '"]');
        if (currentInput) commitRename(oldName, currentInput.value);
      }, 120);
    }

    if (accordionInput) { accordionInput.addEventListener('keydown', handleKeydown); accordionInput.addEventListener('blur', handleBlur); }
    if (chipInput) { chipInput.addEventListener('keydown', handleKeydown); chipInput.addEventListener('blur', handleBlur); }
  }

  async function commitRename(oldName, newName) {
    var trimmed = (newName || '').trim();
    if (!trimmed || trimmed === oldName) { cancelRename(oldName); return; }
    var ok = await window.electronAPI.renameGroup(oldName, trimmed);
    if (ok) {
      showToast('Group renamed to "' + trimmed + '"', 'success');
      refresh();
    } else {
      showToast('Rename failed — name may already exist', 'error');
      refresh(); // restore original DOM via refresh
    }
  }

  function cancelRename(oldName) {
    // Restore original group name in accordion and chip by refreshing
    refresh();
  }

  // ═══ Keyboard Navigation ═══

  function isInputFocused() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  }

  /** GetAllCardsInDOMOrder: returns array of {card, section, groupName} for card navigation */
  function getAllCardsInDOMOrder() {
    var list = document.getElementById('snippet-list');
    if (list.classList.contains('hidden')) return [];

    var sections = list.querySelectorAll('.group-section');
    if (sections.length > 0) {
      // Accordion mode: cards grouped by section
      var cards = [];
      for (var i = 0; i < sections.length; i++) {
        var bodyCards = sections[i].querySelectorAll('.group-section-body > .snippet-card');
        for (var j = 0; j < bodyCards.length; j++) {
          cards.push({
            card: bodyCards[j],
            section: sections[i],
            groupName: sections[i].getAttribute('data-group'),
          });
        }
      }
      return cards;
    }

    // Flat mode (search / specific group filter)
    var flatCards = list.querySelectorAll('.snippet-card');
    var result = [];
    for (var k = 0; k < flatCards.length; k++) {
      result.push({ card: flatCards[k], section: null, groupName: null });
    }
    return result;
  }

  function navigateCards(direction) {
    var selected = document.querySelector('.snippet-card.selected');
    if (!selected) return;

    var allCards = getAllCardsInDOMOrder();
    if (allCards.length === 0) return;

    var currentIdx = -1;
    for (var i = 0; i < allCards.length; i++) {
      if (allCards[i].card === selected) { currentIdx = i; break; }
    }
    if (currentIdx === -1) return;

    var newIdx = currentIdx + direction;
    if (newIdx < 0 || newIdx >= allCards.length) return; // no wrap

    var target = allCards[newIdx];

    // Expand collapsed group when entering it (accordion mode)
    if (target.section && !target.section.classList.contains('expanded')) {
      if (window.OneClip.setGroupExpanded) {
        window.OneClip.setGroupExpanded(target.groupName, true);
      }
    }

    // Deselect old, select new
    if (window.OneClip.deselectAll) window.OneClip.deselectAll();
    target.card.classList.add('selected');
    target.card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function navigateChips(direction) {
    var bar = document.getElementById('group-bar');
    if (bar.classList.contains('hidden')) return;

    var chips = document.querySelectorAll('#group-bar-scroll .group-chip');
    if (chips.length === 0) return;

    // Find currently active chip
    var currentIdx = 0;
    for (var i = 0; i < chips.length; i++) {
      if (chips[i].classList.contains('active')) { currentIdx = i; break; }
    }

    var newIdx = currentIdx + direction;
    if (newIdx < 0) newIdx = chips.length - 1;
    if (newIdx >= chips.length) newIdx = 0;

    var chip = chips[newIdx];
    var group = chip.getAttribute('data-group');
    applyGroupFilter(group);
    // Scroll chip into view
    chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }

  // ═══ Keyboard ═══

  function onKeyDown(e) {
    var edOpen = !document.getElementById('editor-overlay').classList.contains('hidden');
    var delOpen = !document.getElementById('delete-overlay').classList.contains('hidden');
    var grpOpen = !document.getElementById('group-editor-overlay').classList.contains('hidden');

    if (grpOpen) {
      if (e.key === 'Escape') { e.preventDefault(); closeGroupEditor(); return; }
      if (e.key === 'Enter') { e.preventDefault(); createGroup(); return; }
      return;
    }
    if (edOpen) {
      if (e.key === 'Escape') { e.preventDefault(); window.OneClip.closeEditor(); return; }

      var titleEl = document.getElementById('input-title');
      var groupEl = document.getElementById('input-group');
      var contentEl = document.getElementById('input-content');

      // Ctrl+Enter or Enter on content field → save
      if (e.key === 'Enter' && !e.shiftKey) {
        if (e.ctrlKey || document.activeElement === contentEl) {
          e.preventDefault(); window.OneClip.saveSnippet(); return;
        }
        // Single-line fields: Enter navigates to next field
        if (document.activeElement === titleEl) {
          e.preventDefault(); groupEl.focus(); return;
        }
        if (document.activeElement === groupEl) {
          e.preventDefault(); contentEl.focus(); return;
        }
        return;
      }

      // Arrow key navigation between editor fields
      if (e.key === 'ArrowDown' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (document.activeElement === titleEl) {
          e.preventDefault(); groupEl.focus(); return;
        }
        if (document.activeElement === groupEl) {
          e.preventDefault(); contentEl.focus(); return;
        }
        return;
      }
      if (e.key === 'ArrowUp' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (document.activeElement === groupEl) {
          e.preventDefault(); titleEl.focus(); return;
        }
        if (document.activeElement === contentEl && contentEl.selectionStart === 0) {
          e.preventDefault(); groupEl.focus(); return;
        }
        return;
      }
      return;
    }
    if (delOpen) {
      if (e.key === 'Escape') { e.preventDefault(); window.OneClip.closeDeleteConfirm(); return; }
      if (e.key === 'Enter') { e.preventDefault(); window.OneClip.confirmDelete(); return; }
      return;
    }

    if (e.ctrlKey && e.key === 'f') { e.preventDefault(); searchInput.focus(); searchInput.select(); return; }
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); window.OneClip.openEditor(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === 'E') { e.preventDefault(); doExport(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === 'I') { e.preventDefault(); doImport(); return; }
    if (e.ctrlKey && e.shiftKey && e.key === 'D') { e.preventDefault(); doChangeDataDir(); return; }
    if (e.key === 'Escape') {
      if (document.activeElement === searchInput && searchInput.value) { clearSearch(); }
      else if (window.OneClip.deselectAll) window.OneClip.deselectAll();
      return;
    }

    // ── Arrow keys / Enter navigation ──
    if (!isInputFocused()) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigateChips(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); navigateChips(1); return; }
      if (e.key === 'ArrowUp') {
        if (document.querySelector('.snippet-card.selected')) {
          e.preventDefault(); navigateCards(-1); return;
        }
      }
      if (e.key === 'ArrowDown') {
        if (document.querySelector('.snippet-card.selected')) {
          e.preventDefault(); navigateCards(1); return;
        }
      }
    }

    // Enter on selected card → copy (works even when input is focused)
    if (e.key === 'Enter') {
      var selCard = document.querySelector('.snippet-card.selected');
      if (selCard) {
        e.preventDefault();
        var copyBtn = selCard.querySelector('.btn-copy');
        if (copyBtn) copyBtn.click();
        return;
      }
    }
  }

  // ═══ Import / Export ═══

  async function doExport() {
    var r = await window.electronAPI.exportSnippets();
    if (!r.canceled) showToast('Exported ' + r.count + ' snippet(s)', 'success');
  }

  async function doImport() {
    var r = await window.electronAPI.importSnippets();
    if (r.canceled) return;
    if (r.error) { showToast('Import failed: ' + r.error, 'error'); }
    else if (r.added > 0) { showToast('Imported ' + r.added + ' snippet(s)', 'success'); refresh(); }
    else { showToast('No new snippets to import', 'info'); }
  }

  window.OneClip.doExport = doExport;
  window.OneClip.doImport = doImport;

  async function doChangeDataDir() {
    var r = await window.electronAPI.changeDataDir();
    if (r.canceled) return;
    if (r.error) { showToast('Failed: ' + r.error, 'error'); }
    else { showToast('Data folder updated — ' + r.path, 'success'); refresh(); }
  }

  window.OneClip.doChangeDataDir = doChangeDataDir;

  // ═══ Toast ═══

  function showToast(msg, type) {
    var t = document.getElementById('toast');
    clearTimeout(toastTimer);
    t.textContent = msg; t.className = type || 'success';
    t.classList.remove('hidden');
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 2500);
  }

  // ═══ Data ═══

  function refresh() {
    window.electronAPI.getSnippets().then(function (data) {
      snippets = data;
      return Promise.all([window.electronAPI.getSettings(), window.electronAPI.getGroups()]);
    }).then(function (results) {
      var s = results[0];
      allGroups = results[1];
      groupOrder = s.group_order || [];
      rebuildGroupBar();
      renderFiltered();
    }).catch(function (err) {
      console.error('Load failed:', err);
      window.OneClip.renderList([], '', '');
    });
  }

  window.OneClip = window.OneClip || {};
  window.OneClip.refreshSnippets = refresh;
  window.OneClip.getSnippets = function () { return snippets; };
  window.OneClip.setGroupOrder = setGroupOrder;
  window.OneClip.getGroupOrder = getGroupOrder;
  window.OneClip.rebuildGroupBar = rebuildGroupBar;
  window.OneClip.showToast = showToast;
  window.OneClip.showGroupContextMenu = showGroupContextMenu;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
