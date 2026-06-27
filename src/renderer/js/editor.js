/**
 * editor.js — Snippet add/edit modal
 * Supports: title, group (dropdown picker), content
 */

(function () {
  'use strict';

  var editingId = null;
  var allGroupsCache = [];
  var dropdownVisible = false;

  // Dropdown setup — runs once
  var groupInput = document.getElementById('input-group');
  var dropdown = document.getElementById('group-dropdown');

  function buildDropdown() {
    dropdown.innerHTML = '';
    for (var i = 0; i < allGroupsCache.length; i++) {
      var g = allGroupsCache[i];
      var item = document.createElement('div');
      item.className = 'group-dropdown-item';
      item.textContent = g;
      item.addEventListener('mousedown', function (e) {
        e.preventDefault(); // prevent blur before click
        groupInput.value = this.textContent;
        hideDropdown();
      });
      dropdown.appendChild(item);
    }
    dropdown.classList.remove('hidden');
    dropdownVisible = true;
  }

  function showDropdown() {
    window.electronAPI.getGroups().then(function (groups) {
      allGroupsCache = groups || [];
      if (allGroupsCache.length > 0) buildDropdown();
    });
  }

  function hideDropdown() {
    dropdown.classList.add('hidden');
    dropdownVisible = false;
  }

  // ▾ toggle button — always show all groups regardless of input text
  document.getElementById('btn-group-dropdown').addEventListener('mousedown', function (e) {
    e.preventDefault();
    if (dropdownVisible) { hideDropdown(); }
    else { showDropdown(); groupInput.focus(); }
  });

  // Input: show dropdown on focus/click (if empty), hide on typing, re-show on clear
  groupInput.addEventListener('focus', function () {
    if (!groupInput.value.trim() && !dropdownVisible) showDropdown();
  });
  groupInput.addEventListener('click', function () {
    if (!groupInput.value.trim() && !dropdownVisible) showDropdown();
  });
  groupInput.addEventListener('input', function () {
    if (!groupInput.value.trim()) {
      // All text deleted — show list again
      if (!dropdownVisible) showDropdown();
    } else {
      hideDropdown();
    }
  });
  groupInput.addEventListener('blur', function () {
    setTimeout(hideDropdown, 150);
  });

  // Arrow keys / Enter: dropdown first, field navigation second
  groupInput.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (dropdownVisible) { hideDropdown(); e.stopPropagation(); } return; }
    if (!dropdownVisible) return; // let app.js handle field navigation

    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      var cur = dropdown.querySelector('.active');
      var next;
      if (e.key === 'ArrowDown') {
        next = cur ? cur.nextElementSibling : dropdown.firstElementChild;
      } else {
        next = cur ? cur.previousElementSibling : dropdown.lastElementChild;
      }
      if (cur) cur.classList.remove('active');
      if (next) { next.classList.add('active'); next.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      var active = dropdown.querySelector('.group-dropdown-item.active');
      if (active) { groupInput.value = active.textContent; hideDropdown(); }
      return;
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', function (e) {
    if (dropdownVisible && !e.target.closest('.group-input-wrapper')) {
      hideDropdown();
    }
  });

  function openEditor(snippet, prefillGroup) {
    var overlay = document.getElementById('editor-overlay');
    var titleEl = document.getElementById('editor-title');
    var titleIn = document.getElementById('input-title');
    var groupIn = document.getElementById('input-group');
    var contentIn = document.getElementById('input-content');

    if (snippet) {
      editingId = snippet.id;
      titleEl.textContent = 'Edit Snippet';
      titleIn.value = snippet.title || '';
      groupIn.value = snippet.group || '';
      contentIn.value = snippet.content || '';
    } else {
      editingId = null;
      titleEl.textContent = 'New Snippet';
      titleIn.value = '';
      groupIn.value = prefillGroup || '';
      contentIn.value = '';
    }

    window.electronAPI.getGroups().then(function (groups) {
      allGroupsCache = groups || [];
    });

    titleIn.classList.remove('input-error');
    contentIn.classList.remove('input-error');

    overlay.classList.remove('hidden');
    titleIn.focus();
  }

  function closeEditor() {
    var overlay = document.getElementById('editor-overlay');
    overlay.classList.add('hidden');
    editingId = null;

    setTimeout(function () {
      if (editingId === null) {
        document.getElementById('input-title').value = '';
        document.getElementById('input-group').value = '';
        document.getElementById('input-content').value = '';
        document.getElementById('input-title').classList.remove('input-error');
        document.getElementById('input-content').classList.remove('input-error');
      }
    }, 200);
  }

  function saveSnippet() {
    var titleIn = document.getElementById('input-title');
    var groupIn = document.getElementById('input-group');
    var contentIn = document.getElementById('input-content');
    var title = titleIn.value.trim();
    var group = groupIn.value.trim();
    var content = contentIn.value;

    if (!title && !content.trim()) {
      titleIn.classList.add('input-error');
      contentIn.classList.add('input-error');
      return;
    }

    titleIn.classList.remove('input-error');
    contentIn.classList.remove('input-error');

    var promise = editingId
      ? window.electronAPI.updateSnippet(editingId, title, content, group)
      : window.electronAPI.addSnippet(title, content, group);

    promise.then(function () {
      closeEditor();
      if (window.OneClip.refreshSnippets) window.OneClip.refreshSnippets();
    }).catch(function (err) {
      console.error('Save failed:', err);
    });
  }

  window.OneClip = window.OneClip || {};
  window.OneClip.openEditor = openEditor;
  window.OneClip.closeEditor = closeEditor;
  window.OneClip.saveSnippet = saveSnippet;

})();
