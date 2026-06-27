/**
 * snippet-list.js — Snippet list rendering
 * Two views: accordion (grouped, no search) / flat (search active)
 * Drag: cards within+between groups, group headers for group reordering
 */

(function () {
  'use strict';

  var COPY_DELAY = 1500;
  var ERR_DELAY = 2000;
  var expanded = {};
  var dragInfo = null; // { type:'card'|'group', id, el } during drag

  // ═══ Entry ═══

  function renderList(snippets, keyword, groupFilter, allGroups) {
    var listEl = document.getElementById('snippet-list');
    var empty = document.getElementById('empty-state');
    var noRes = document.getElementById('no-results');

    // Flat mode (search or group filter active)
    if (groupFilter || (keyword && keyword.trim())) {
      if (!snippets || snippets.length === 0) {
        listEl.innerHTML = '';
        listEl.classList.add('hidden');
        if (keyword && keyword.trim()) {
          noRes.classList.remove('hidden'); empty.classList.add('hidden');
        } else {
          // Empty group — show empty state with group-specific message
          showEmptyGroupState(groupFilter);
          noRes.classList.add('hidden'); empty.classList.add('hidden');
        }
        return;
      }
      listEl.classList.remove('hidden');
      empty.classList.add('hidden');
      noRes.classList.add('hidden');
      renderFlat(snippets);
      return;
    }

    // Accordion mode
    if ((!snippets || snippets.length === 0) && (!allGroups || allGroups.length === 0)) {
      listEl.innerHTML = '';
      listEl.classList.add('hidden');
      empty.classList.remove('hidden');
      noRes.classList.add('hidden');
      return;
    }
    listEl.classList.remove('hidden');
    empty.classList.add('hidden');
    noRes.classList.add('hidden');
    renderGrouped(snippets, allGroups || []);
  }

  /** Show empty-group state with inline New Snippet button */
  function showEmptyGroupState(groupName) {
    var listEl = document.getElementById('snippet-list');
    listEl.innerHTML = '';
    listEl.classList.remove('hidden');
    listEl.style.display = 'flex';
    listEl.style.flexDirection = 'column';
    listEl.style.alignItems = 'center';
    listEl.style.justifyContent = 'flex-start';
    listEl.style.paddingTop = '110px';
    listEl.style.gap = '16px';

    var title = document.createElement('div');
    title.style.cssText = 'font-size:22px;font-weight:600;color:var(--text)';
    title.textContent = 'No snippets in "' + esc(groupName) + '"';

    var desc = document.createElement('div');
    desc.style.cssText = 'font-size:15px;color:var(--text-muted);margin-bottom:4px';
    desc.textContent = 'Create the first snippet for this group';

    var btn = document.createElement('button');
    btn.className = 'btn-accent';
    btn.textContent = 'New Snippet';
    btn.addEventListener('click', function () {
      if (window.OneClip.openEditor) window.OneClip.openEditor(null, groupName);
    });

    listEl.appendChild(title);
    listEl.appendChild(desc);
    listEl.appendChild(btn);
  }

  // ═══ Grouped (Accordion) View ═══

  function renderGrouped(snippets, allGroups) {
    var listEl = document.getElementById('snippet-list');
    listEl.innerHTML = '';
    listEl.style.cssText = '';

    // Build groups from snippets
    var groups = {};
    for (var i = 0; i < snippets.length; i++) {
      var g = (snippets[i].group && snippets[i].group.trim()) || 'Uncategorized';
      if (!groups[g]) groups[g] = [];
      groups[g].push(snippets[i]);
    }

    // Seed empty independent groups (they have no snippets yet)
    for (var a = 0; a < allGroups.length; a++) {
      var ag = allGroups[a];
      if (!groups[ag]) groups[ag] = [];
    }

    // Sort groups: use saved order, then alpha, Uncategorized always last
    var groupOrder = window.OneClip.getGroupOrder ? window.OneClip.getGroupOrder() : [];
    var names = Object.keys(groups).sort(function (a, b) {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      var ai = idxOfOrder(groupOrder, a);
      var bi = idxOfOrder(groupOrder, b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.toLowerCase().localeCompare(b.toLowerCase());
    });

    for (var j = 0; j < names.length; j++) {
      var name = names[j];
      var items = groups[name];
      var exp = !!expanded[name];
      listEl.appendChild(buildGroupSection(name, items, exp));
    }
  }

  function buildGroupSection(name, items, isExpanded) {
    var section = document.createElement('div');
    section.className = 'group-section' + (isExpanded ? ' expanded' : '');
    section.setAttribute('data-group', name);

    // ── Header ──
    var header = document.createElement('div');
    header.className = 'group-section-header';
    header.setAttribute('draggable', 'true');
    header.innerHTML =
      '<span class="group-section-toggle">&#9654;</span>' +
      '<span class="group-section-name">' + esc(name) + '</span>' +
      '<span class="group-section-count">' + items.length + '</span>';

    // Right-click → context menu
    header.addEventListener('contextmenu', function (e) {
      if (dragInfo) return;
      e.preventDefault();
      if (window.OneClip.showGroupContextMenu) {
        window.OneClip.showGroupContextMenu(name, e.clientX, e.clientY);
      }
    });

    // Click → expand/collapse
    header.addEventListener('click', function (e) {
      if (dragInfo) return; // don't toggle during drag
      var exp = section.classList.toggle('expanded');
      expanded[name] = exp;
    });

    // ── Group header drag (reorder groups) ──
    header.addEventListener('dragstart', function (e) {
      dragInfo = { type: 'group', name: name, el: header };
      header.classList.add('group-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', name);
    });
    header.addEventListener('dragend', function () {
      header.classList.remove('group-dragging');
      clearAllDragIndicators();
      if (dragInfo && dragInfo.type === 'group') {
        var newOrder = collectGroupOrder();
        window.electronAPI.saveGroupOrder(newOrder);
        if (window.OneClip.setGroupOrder) window.OneClip.setGroupOrder(newOrder);
        // Sync chip bar order with accordion
        if (window.OneClip.rebuildGroupBar) window.OneClip.rebuildGroupBar();
      }
      dragInfo = null;
    });
    header.addEventListener('dragover', function (e) {
      if (!dragInfo || dragInfo.type !== 'group' || dragInfo.name === name) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearAllDragIndicators();
      var rect = header.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        header.classList.add('group-drag-above');
      } else {
        header.classList.add('group-drag-below');
      }
    });
    header.addEventListener('dragleave', function () {
      header.classList.remove('group-drag-above', 'group-drag-below');
    });
    header.addEventListener('drop', function (e) {
      if (!dragInfo || dragInfo.type !== 'group') return;
      e.preventDefault();
      header.classList.remove('group-drag-above', 'group-drag-below');
      if (dragInfo.name === name) return;

      var draggedSection = dragInfo.el.closest('.group-section');
      if (!draggedSection || draggedSection === section) return;

      // DOM before/after handles move + insert in one step, no index math
      var rect = header.getBoundingClientRect();
      if (e.clientY >= rect.top + rect.height / 2) {
        section.after(draggedSection);
      } else {
        section.before(draggedSection);
      }
    });

    // ── Card drop on header (move to this group) ──
    header.addEventListener('dragover', function (e) {
      if (!dragInfo || dragInfo.type !== 'card') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearAllDragIndicators();
      header.classList.add('drag-hover');
    });
    header.addEventListener('dragleave', function (e) {
      // Only remove if truly leaving the header
      if (e.target === header || !header.contains(e.relatedTarget)) {
        header.classList.remove('drag-hover');
      }
    });
    header.addEventListener('drop', function (e) {
      if (!dragInfo || dragInfo.type !== 'card') return;
      e.preventDefault();
      e.stopPropagation();
      header.classList.remove('drag-hover');

      var card = dragInfo.el;
      if (!card) return;

      // Move card into this group's body
      body.appendChild(card);

      // Auto-expand so user sees where the card landed
      section.classList.add('expanded');
      expanded[name] = true;

      // Update this group's count
      var countEl = header.querySelector('.group-section-count');
      if (countEl) {
        countEl.textContent = String(body.querySelectorAll('.snippet-card').length);
      }

      // Update source group's count if different
      var srcGroup = dragInfo.sourceGroup;
      if (srcGroup && srcGroup !== name) {
        var srcSection = document.querySelector('.group-section[data-group="' + CSS.escape(srcGroup) + '"]');
        if (srcSection) {
          var srcBody = srcSection.querySelector('.group-section-body');
          var srcCount = srcSection.querySelector('.group-section-count');
          if (srcBody && srcCount) {
            srcCount.textContent = String(srcBody.querySelectorAll('.snippet-card').length);
          }
          // Collapse source group if it's now empty
          if (srcBody && srcBody.querySelectorAll('.snippet-card').length === 0) {
            srcSection.classList.remove('expanded');
            expanded[srcGroup] = false;
          }
        }
      }

      // dragend handles syncOrder
    });

    // ── Body ──
    var body = document.createElement('div');
    body.className = 'group-section-body';

    for (var i = 0; i < items.length; i++) {
      body.appendChild(createCard(items[i], false));
    }

    // Body as drop target (empty area)
    body.addEventListener('dragover', function (e) {
      if (!dragInfo || dragInfo.type !== 'card') return;
      // Only accept if over the body itself (not a card)
      if (e.target.closest('.snippet-card')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    body.addEventListener('drop', function (e) {
      if (!dragInfo || dragInfo.type !== 'card') return;
      if (e.target.closest('.snippet-card')) return; // handled by card
      e.preventDefault();
      // Append card to this group's body at the end (dragend handles sync)
      var card = dragInfo.el;
      if (card) {
        body.appendChild(card);
      }
    });

    section.appendChild(header);
    section.appendChild(body);
    return section;
  }

  // ═══ Flat (Search) View ═══

  function renderFlat(snippets) {
    var listEl = document.getElementById('snippet-list');
    listEl.innerHTML = '';
    listEl.style.cssText = '';
    for (var i = 0; i < snippets.length; i++) {
      listEl.appendChild(createCard(snippets[i], true));
    }
  }

  // ═══ Card Factory ═══

  function createCard(snippet, showGroupTag) {
    var card = document.createElement('div');
    card.className = 'snippet-card';
    card.setAttribute('data-id', snippet.id);
    card.setAttribute('data-group', snippet.group || '');
    card.setAttribute('draggable', 'true');

    var groupHTML = '';
    if (showGroupTag && snippet.group && snippet.group.trim()) {
      groupHTML = '<span class="snippet-group-tag">' + esc(snippet.group) + '</span>';
    }

    card.innerHTML =
      '<div class="snippet-header">' +
        '<span class="snippet-title">' + esc(snippet.title) + '</span>' +
        groupHTML +
        '<div class="snippet-actions">' +
          '<button class="btn-text" data-action="edit">Edit</button>' +
          '<button class="btn-text danger" data-action="delete">Del</button>' +
        '</div>' +
      '</div>' +
      '<div class="snippet-content">' + esc(snippet.content) + '</div>' +
      '<div class="snippet-footer">' +
        '<button class="btn-copy" data-action="copy">Copy</button>' +
      '</div>';

    // Click → actions / selection
    card.addEventListener('click', function (e) {
      if (dragInfo) return;
      var btn = e.target.closest('[data-action]');
      if (!btn) { selectCard(card); return; }
      switch (btn.getAttribute('data-action')) {
        case 'copy': handleCopy(snippet, card); break;
        case 'edit': if (window.OneClip.openEditor) window.OneClip.openEditor(snippet); break;
        case 'delete': showDeleteConfirm(snippet); break;
      }
    });

    // Double-click → edit
    card.addEventListener('dblclick', function (e) {
      if (dragInfo) return;
      if (e.target.closest('[data-action]')) return;
      if (window.OneClip.openEditor) window.OneClip.openEditor(snippet);
    });

    // ── Card drag (reorder / move between groups) ──
    card.addEventListener('dragstart', function (e) {
      var sourceSection = card.closest('.group-section');
      dragInfo = {
        type: 'card',
        id: snippet.id,
        el: card,
        sourceGroup: sourceSection ? sourceSection.getAttribute('data-group') : (snippet.group || '')
      };
      card.classList.add('card-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', snippet.id);
    });

    card.addEventListener('dragend', function () {
      card.classList.remove('card-dragging');
      clearAllDragIndicators();
      if (dragInfo && dragInfo.type === 'card') {
        syncCardOrder();
      }
      dragInfo = null;
    });

    card.addEventListener('dragover', function (e) {
      if (!dragInfo || dragInfo.type !== 'card') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearAllDragIndicators();
      var rect = card.getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) {
        card.classList.add('card-drag-above');
      } else {
        card.classList.add('card-drag-below');
      }
    });

    card.addEventListener('dragleave', function () {
      card.classList.remove('card-drag-above', 'card-drag-below');
    });

    card.addEventListener('drop', function (e) {
      if (!dragInfo || dragInfo.type !== 'card') return;
      e.preventDefault();
      e.stopPropagation();
      card.classList.remove('card-drag-above', 'card-drag-below');

      var fromCard = dragInfo.el;
      if (!fromCard || fromCard === card) return;

      var targetGroup = card.closest('.group-section');
      var fromGroup = fromCard.closest('.group-section');

      if (targetGroup && fromGroup && targetGroup !== fromGroup) {
        // Cross-group move: put into target group's body
        var body = targetGroup.querySelector('.group-section-body');
        if (body) {
          var rect = card.getBoundingClientRect();
          if (e.clientY < rect.top + rect.height / 2) {
            body.insertBefore(fromCard, card);
          } else {
            body.insertBefore(fromCard, card.nextSibling);
          }
        }
      } else {
        // Same group (or flat mode): reorder
        var rect = card.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          card.before(fromCard);
        } else {
          card.after(fromCard);
        }
      }
      // Don't sync yet; done in dragend
    });

    return card;
  }

  // ═══ Sync order to storage ═══

  function syncCardOrder() {
    var ordered = collectOrderedState();
    if (ordered.length > 0) {
      window.electronAPI.syncOrder(ordered).then(function () {
        if (window.OneClip.refreshSnippets) window.OneClip.refreshSnippets();
      });
    }
  }

  function collectOrderedState() {
    var result = [];
    var cards = document.querySelectorAll('#snippet-list .snippet-card');
    for (var i = 0; i < cards.length; i++) {
      var id = cards[i].getAttribute('data-id');
      var section = cards[i].closest('.group-section');
      var group = section ? section.getAttribute('data-group') : (cards[i].getAttribute('data-group') || '');
      if (id) result.push({ id: id, group: group });
    }
    return result;
  }

  /** Collect current DOM order of group sections */
  function collectGroupOrder() {
    var order = [];
    var sections = document.querySelectorAll('#snippet-list > .group-section');
    for (var i = 0; i < sections.length; i++) {
      var name = sections[i].getAttribute('data-group');
      if (name && name !== 'Uncategorized') order.push(name);
    }
    return order;
  }

  /** Scroll to a group section, expand it, briefly highlight */
  function scrollToGroup(name) {
    var section = document.querySelector('.group-section[data-group="' + CSS.escape(name) + '"]');
    if (!section) return;
    section.classList.add('expanded');
    expanded[name] = true;
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    section.classList.add('highlight');
    setTimeout(function () { section.classList.remove('highlight'); }, 1500);
  }

  /** Case-insensitive indexOf for group name in order array */
  function idxOfOrder(arr, name) {
    var lower = name.toLowerCase();
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].toLowerCase() === lower) return i;
    }
    return -1;
  }

  function clearAllDragIndicators() {
    var all = document.querySelectorAll(
      '.card-drag-above,.card-drag-below,.group-drag-above,.group-drag-below,.drag-hover'
    );
    for (var i = 0; i < all.length; i++) {
      all[i].classList.remove('card-drag-above', 'card-drag-below', 'group-drag-above', 'group-drag-below', 'drag-hover');
    }
  }

  // ═══ Auto-scroll during drag ═══

  var SCROLL_THRESHOLD = 50;   // px from edge to start scrolling
  var SCROLL_SPEED_MAX = 12;   // px per tick at the very edge

  document.addEventListener('dragover', function (e) {
    if (!dragInfo) return;
    var list = document.getElementById('snippet-list');
    if (!list || list.classList.contains('hidden')) return;

    var rect = list.getBoundingClientRect();
    var relY = e.clientY - rect.top;
    var distTop = relY;
    var distBottom = rect.height - relY;

    var speed = 0;
    if (distTop < SCROLL_THRESHOLD) {
      speed = -Math.round(SCROLL_SPEED_MAX * (1 - distTop / SCROLL_THRESHOLD));
    } else if (distBottom < SCROLL_THRESHOLD) {
      speed = Math.round(SCROLL_SPEED_MAX * (1 - distBottom / SCROLL_THRESHOLD));
    }

    if (speed !== 0) {
      list.scrollTop += speed;
    }
  });

  // ═══ Copy ═══

  function handleCopy(snippet, card) {
    var btn = card.querySelector('.btn-copy');
    window.electronAPI.copyToClipboard(snippet.content).then(function (ok) {
      if (ok) {
        btn.textContent = 'Copied'; btn.classList.add('copied');
        setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, COPY_DELAY);
      } else {
        showErr(btn);
      }
    }).catch(function () { showErr(btn); });
  }

  function showErr(btn) {
    btn.textContent = 'Failed'; btn.classList.add('copy-error');
    setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copy-error'); }, ERR_DELAY);
  }

  // ═══ Delete ═══

  /** Show snippet delete confirmation */
  function showDeleteConfirm(snippet) {
    var overlay = document.getElementById('delete-overlay');
    overlay.setAttribute('data-delete-type', 'snippet');
    overlay.setAttribute('data-snippet-id', snippet.id);
    document.getElementById('delete-title').textContent = 'Delete Snippet';
    document.getElementById('delete-snippet-name').textContent = snippet.title;
    document.getElementById('delete-snippet-preview').textContent = snippet.content;
    document.querySelector('#delete-overlay .delete-warning').textContent = 'This action cannot be undone.';
    overlay.classList.remove('hidden');
    document.getElementById('btn-delete-confirm').focus();
  }

  /** Show group delete confirmation */
  function showGroupDeleteConfirm(name, snippetCount) {
    var overlay = document.getElementById('delete-overlay');
    overlay.setAttribute('data-delete-type', 'group');
    overlay.setAttribute('data-group-name', name);
    document.getElementById('delete-title').textContent = 'Delete Group';
    document.getElementById('delete-snippet-name').textContent = name;

    // Show destination select if there are snippets
    var optsDiv = document.getElementById('delete-group-options');
    var select = document.getElementById('delete-target-group');
    if (snippetCount > 0) {
      optsDiv.classList.remove('hidden');
      // Populate other group names (excluding the one being deleted)
      select.innerHTML = '<option value="">Uncategorized</option>';
      window.electronAPI.getGroups().then(function (groups) {
        for (var i = 0; i < groups.length; i++) {
          if (groups[i] !== name) {
            var opt = document.createElement('option');
            opt.value = groups[i];
            opt.textContent = groups[i];
            select.appendChild(opt);
          }
        }
        var delOpt = document.createElement('option');
        delOpt.value = '__delete__';
        delOpt.textContent = 'Delete snippets permanently';
        delOpt.style.color = 'var(--danger)';
        select.appendChild(delOpt);
      });
    } else {
      optsDiv.classList.add('hidden');
    }

    document.getElementById('delete-snippet-preview').textContent =
      snippetCount > 0 ? snippetCount + ' snippet(s) in this group.' : 'This group is empty.';
    document.querySelector('#delete-overlay .delete-warning').textContent = 'This action cannot be undone.';
    overlay.classList.remove('hidden');
    document.getElementById('btn-delete-confirm').focus();
  }

  function closeDeleteConfirm() {
    var overlay = document.getElementById('delete-overlay');
    overlay.classList.add('hidden');
    overlay.removeAttribute('data-snippet-id');
    overlay.removeAttribute('data-delete-type');
    overlay.removeAttribute('data-group-name');
  }

  async function confirmDelete() {
    var overlay = document.getElementById('delete-overlay');
    var type = overlay.getAttribute('data-delete-type') || 'snippet';

    if (type === 'group') {
      var name = overlay.getAttribute('data-group-name');
      if (!name) return;
      var targetGroup = document.getElementById('delete-target-group').value;
      try {
        var result = await window.electronAPI.deleteGroup(name, targetGroup);
        closeDeleteConfirm();
        var msg = 'Group "' + name + '" deleted';
        if (result.deleted > 0) msg += ' — ' + result.deleted + ' snippet(s) removed';
        else if (result.moved > 0) msg += ' — ' + result.moved + ' snippet(s) moved to ' + (targetGroup || 'Uncategorized');
        if (window.OneClip.showToast) window.OneClip.showToast(msg, 'success');
        if (window.OneClip.refreshSnippets) window.OneClip.refreshSnippets();
      } catch (err) {
        console.error('Delete group failed:', err);
        if (window.OneClip.showToast) window.OneClip.showToast('Failed to delete group', 'error');
      }
    } else {
      var id = overlay.getAttribute('data-snippet-id');
      if (!id) return;
      try {
        await window.electronAPI.deleteSnippet(id);
        closeDeleteConfirm();
        if (window.OneClip.refreshSnippets) window.OneClip.refreshSnippets();
      } catch (err) {
        console.error('Delete failed:', err);
      }
    }
  }

  // ═══ Helpers ═══

  function selectCard(card) {
    var all = document.querySelectorAll('.snippet-card.selected');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('selected');
    card.classList.add('selected');
  }

  function esc(str) {
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(str));
    return d.innerHTML;
  }

  // ═══ Exports ═══

  window.OneClip = window.OneClip || {};
  window.OneClip.renderList = renderList;
  window.OneClip.scrollToGroup = scrollToGroup;
  window.OneClip.deselectAll = function () {
    var all = document.querySelectorAll('.snippet-card.selected');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('selected');
  };
  window.OneClip.setGroupExpanded = function (name, value) {
    expanded[name] = value;
    var section = document.querySelector('.group-section[data-group="' + CSS.escape(name) + '"]');
    if (section) {
      if (value) section.classList.add('expanded');
      else section.classList.remove('expanded');
    }
  };
  window.OneClip.showDeleteConfirm = showDeleteConfirm;
  window.OneClip.showGroupDeleteConfirm = showGroupDeleteConfirm;
  window.OneClip.closeDeleteConfirm = closeDeleteConfirm;
  window.OneClip.confirmDelete = confirmDelete;

})();
