import { atom } from 'nanostores';
import { useStore } from '@nanostores/react';
import { logger } from '@strudel/core';
import { nanoid } from 'nanoid';
import { settingsMap } from './settings.mjs';
import { confirmDialog, parseJSON, supabase } from './repl/util.mjs';

// #region Supabase / Public Patterns (No changes needed here)
export let $publicPatterns = atom([]);
export let $featuredPatterns = atom([]);

const patternQueryLimit = 20;
export const patternFilterName = {
  public: 'latest',
  featured: 'featured',
  user: 'user',
};

function parsePageNum(page) {
  return isNaN(page) ? 0 : page;
}
export function loadPublicPatterns(page) {
  page = parsePageNum(page);
  const offset = page * patternQueryLimit;
  return supabase
    .from('code_v1')
    .select()
    .eq('public', true)
    .range(offset, offset + patternQueryLimit)
    .order('id', { ascending: false });
}

export function loadFeaturedPatterns(page = 0) {
  page = parsePageNum(page);
  const offset = page * patternQueryLimit;
  return supabase
    .from('code_v1')
    .select()
    .eq('featured', true)
    .range(offset, offset + patternQueryLimit)
    .order('id', { ascending: false });
}

export async function loadAndSetPublicPatterns(page) {
  const p = await loadPublicPatterns(page);
  const data = p?.data;
  const pats = {};
  data?.forEach((data, key) => (pats[data.id ?? key] = data));
  $publicPatterns.set(pats);
}
export async function loadAndSetFeaturedPatterns(page) {
  const p = await loadFeaturedPatterns(page);
  const data = p?.data;
  const pats = {};
  data?.forEach((data, key) => (pats[data.id ?? key] = data));
  $featuredPatterns.set(pats);
}

export async function loadDBPatterns() {
  try {
    await loadAndSetPublicPatterns();
    await loadAndSetFeaturedPatterns();
  } catch (err) {
    console.error('error loading patterns', err);
  }
}
// #endregion

// #region Session/Viewing State (No changes needed here)
const sessionAtom = (name, initial = undefined) => {
  const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : {};
  const store = atom(typeof storage[name] !== 'undefined' ? storage[name] : initial);
  store.listen((newValue) => {
    if (typeof newValue === 'undefined') {
      delete storage[name];
    } else {
      storage[name] = newValue;
    }
  });
  return store;
};

export let $viewingPatternData = sessionAtom('viewingPatternData', {
  id: '',
  code: '',
  collection: patternFilterName.user,
  created_at: Date.now(),
});

export const getViewingPatternData = () => {
  return parseJSON($viewingPatternData.get());
};
export const useViewingPatternData = () => {
  return useStore($viewingPatternData);
};

export const setViewingPatternData = (data) => {
  $viewingPatternData.set(JSON.stringify(data));
};

const $activePattern = sessionAtom('activePattern', '');

export function setActivePattern(key) {
  $activePattern.set(key);
}
export function getActivePattern() {
  return $activePattern.get();
}
export function useActivePattern() {
  return useStore($activePattern);
}

export const setLatestCode = (code) => settingsMap.setKey('latestCode', code);
export const defaultCode = '';
export const createPatternID = () => nanoid(12);
// #endregion

// #region User Patterns Refactor (Tree Structure)

import { getMetadata } from './metadata_parser.js';

/**
 * Safely migrates the old flat pattern structure to the new tree structure.
 * This creates a new tree structure in memory without immediately overwriting the old data.
 * @param {object} flatPatterns - The old flat patterns object.
 * @returns {object} The new tree structure.
 */
function safeMigrateToTree(flatPatterns) {
  const tree = {
    id: 'root',
    type: 'folder',
    name: 'root',
    children: {},
  };
  for (const id in flatPatterns) {
    const metadata = getMetadata(flatPatterns[id].code || '');
    const name = metadata.title || flatPatterns[id].name || id;
    tree.children[id] = {
      ...flatPatterns[id],
      type: 'pattern',
      id,
      name,
    };
  }
  return tree;
}

/**
 * Recursively finds an item (pattern or folder) in the tree.
 * @param {object} treeNode - The node to start searching from.
 * @param {string} id - The ID of the item to find.
 * @returns {object|null} The found item or null.
 */
function findItem(treeNode, id) {
  if (!treeNode) return null;
  if (treeNode.id === id) {
    return treeNode;
  }
  if (treeNode.type === 'folder' && treeNode.children) {
    for (const childId in treeNode.children) {
      const found = findItem(treeNode.children[childId], id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Recursively finds the parent of an item in the tree.
 * @param {object} treeNode - The node to start searching from.
 * @param {string} id - The ID of the item whose parent to find.
 * @returns {object|null} The parent node or null.
 */
export function findParent(treeNode, id) {
  if (!treeNode || !treeNode.children) return null;
  if (treeNode.type === 'folder' && treeNode.children[id]) {
    return treeNode;
  }
  if (treeNode.type === 'folder') {
    for (const childId in treeNode.children) {
      const found = findParent(treeNode.children[childId], id);
      if (found) {
        return found;
      }
    }
  }
  return null;
}

/**
 * Recursively removes an item from the tree.
 * @param {object} treeNode - The node to start searching from.
 * @param {string} id - The ID of the item to remove.
 * @returns {boolean} True if the item was removed, false otherwise.
 */
function removeItem(treeNode, id) {
  if (treeNode.type === 'folder' && treeNode.children && treeNode.children[id]) {
    delete treeNode.children[id];
    return true;
  }
  if (treeNode.type === 'folder' && treeNode.children) {
    for (const childId in treeNode.children) {
      if (removeItem(treeNode.children[childId], id)) {
        return true;
      }
    }
  }
  return false;
}

function setUserPatterns(obj) {
  return settingsMap.setKey('userPatterns', JSON.stringify(obj));
}

export const userPattern = {
  collection: patternFilterName.user,
  _tree: null, // In-memory cache for the tree structure

  getAll() {
    if (this._tree) {
      return this._tree;
    }
    const patterns = parseJSON(settingsMap.get().userPatterns);
    if (!patterns || !patterns.id || patterns.id !== 'root') {
      // Old flat structure detected, perform safe in-memory migration
      this._tree = safeMigrateToTree(patterns ?? {});
    } else {
      // It's already the new tree structure
      this._tree = patterns;
    }
    return this._tree;
  },

  // Call this whenever a mutation happens to persist the changes
  _commit(tree) {
    this._tree = tree;
    setUserPatterns(this._tree);
  },

  getPatternData(id) {
    const userPatternsTree = this.getAll();
    return findItem(userPatternsTree, id);
  },

  exists(id) {
    return this.getPatternData(id) != null;
  },

  isValidID(id) {
    return id != null && id.length > 0;
  },

  create(parentId = 'root') {
    const newID = createPatternID();
    const data = {
      type: 'pattern',
      code: defaultCode,
      created_at: Date.now(),
      id: newID,
      collection: this.collection,
      name: 'new pattern',
    };
    
    const tree = this.getAll();
    const parent = findItem(tree, parentId) || tree; // Fallback to root
    if (parent && parent.type === 'folder') {
      parent.children[newID] = data;
      this._commit(tree);
    } else {
      tree.children[newID] = data;
      this._commit(tree);
    }
    return { id: newID, data };
  },

  createAndAddToDB(parentId = 'root') {
    return this.create(parentId);
  },

  update(id, data) {
    const tree = this.getAll();
    const item = findItem(tree, id);
    if (item) {
      Object.assign(item, data);
      this._commit(tree);
      return { id, data: item };
    }
    return { id, data };
  },

  _deepDuplicateItem(item) {
    const newID = createPatternID();
    let duplicatedItem;

    if (item.type === 'pattern') {
      duplicatedItem = {
        ...item,
        id: newID,
        name: `${item.name} (copy)`,
        created_at: Date.now(),
      };
    } else if (item.type === 'folder') {
      duplicatedItem = {
        ...item,
        id: newID,
        name: `${item.name} (copy)`,
        children: {}, // Initialize children for the new folder
        created_at: Date.now(),
      };

      // Recursively duplicate children
      if (item.children) {
        for (const childId in item.children) {
          const child = item.children[childId];
          const duplicatedChild = this._deepDuplicateItem(child); // Recursive call
          duplicatedItem.children[duplicatedChild.id] = duplicatedChild;
        }
      }
    }
    return duplicatedItem;
  },

  duplicate(data, parentId = 'root') {
    const tree = this.getAll();
    const itemToDuplicate = findItem(tree, data.id); // Get the actual item from the tree

    if (!itemToDuplicate) {
      console.warn('Item to duplicate not found:', data.id);
      return null;
    }

    const duplicatedItem = this._deepDuplicateItem(itemToDuplicate);

    const parent = findItem(tree, parentId) || tree; // Fallback to root

    if (parent && parent.type === 'folder') {
      parent.children[duplicatedItem.id] = duplicatedItem;
      this._commit(tree);
      return { id: duplicatedItem.id, data: duplicatedItem };
    } else {
      // This case should ideally not be reached if parentId is always a folder or 'root'
      // If it is reached, it means the parentId is invalid or not a folder.
      // For now, I'll just add it to the root if parent is not a folder.
      tree.children[duplicatedItem.id] = duplicatedItem;
      this._commit(tree);
      return { id: duplicatedItem.id, data: duplicatedItem };
    }
  },

  delete(id) {
    const tree = this.getAll();
    const item = findItem(tree, id);

    if (!item) return;

    if (item.type === 'folder' && Object.keys(item.children).length > 0) {
      alert('Cannot delete a folder that is not empty.');
      return;
    }

    if (removeItem(tree, id)) {
      this._commit(tree);
    }

    if (getActivePattern() === id) {
      setActivePattern(null);
    }
    
    const viewingPatternData = getViewingPatternData();
    const viewingID = viewingPatternData?.id;
    if (viewingID === id) {
      return { id: null, data: { code: defaultCode } };
    }
    return { id: viewingID, data: this.getPatternData(viewingID) };
  },

  createFolder(name, parentId = 'root') {
    const newID = createPatternID();
    const folderData = {
      id: newID,
      type: 'folder',
      name: name || 'new folder',
      children: {},
      created_at: Date.now(),
    };

    const tree = this.getAll();
    const parent = findItem(tree, parentId) || tree; // Fallback to root

    if (parent && parent.type === 'folder') {
      parent.children[newID] = folderData;
      this._commit(tree);
    } else {
      tree.children[newID] = folderData;
      this._commit(tree);
    }
    return { id: newID, data: folderData };
  },

  renameItem(id, newName) {
    const tree = this.getAll();
    const item = findItem(tree, id);
    if (item) {
      item.name = newName;
      this._commit(tree);
    }
  },

  moveItem(id, newParentId) {
    const tree = this.getAll();
    const item = findItem(tree, id);
    const oldParent = findParent(tree, id);
    const newParent = findItem(tree, newParentId);

    if (!item || !oldParent) {
      return; // Item or old parent not found
    }

    if (newParentId === 'root') {
      // Move to root
      delete oldParent.children[id];
      tree.children[id] = item;
      this._commit(tree);
    } else if (newParent && newParent.type === 'folder') {
      // Move into a folder
      if (findItem(item, newParentId)) {
        alert('Cannot move a folder into itself.');
        return;
      }
      delete oldParent.children[id];
      newParent.children[id] = item;
      this._commit(tree);
    }
  },

  clearAll() {
    confirmDialog(`This will delete all your patterns and folders. Are you really sure?`).then((r) => {
      if (r == false) return;
      
      const viewingPatternData = getViewingPatternData();
      const newTree = { id: 'root', type: 'folder', name: 'root', children: {} };
      this._commit(newTree);

      if (viewingPatternData.collection !== this.collection) {
        return { id: viewingPatternData.id, data: viewingPatternData };
      }
      setActivePattern(null);
      return this.create();
    });
  },
};

export async function importPatterns(fileList) {
  const files = Array.from(fileList);
  await Promise.all(
    files.map(async (file) => {
      const content = await file.text();
      const tree = userPattern.getAll();
      if (file.type === 'application/json') {
        const importedPatterns = parseJSON(content);
        if (importedPatterns.children) { // new format
          Object.assign(tree.children, importedPatterns.children);
        } else { // old format
           for (const id in importedPatterns) {
              tree.children[id] = { ...importedPatterns[id], type: 'pattern', id, name: importedPatterns[id].name || id };
           }
        }
        userPattern._commit(tree);
      } else if (file.type === 'text/plain') {
        const id = file.name.replace(/\.[^/.]+$/, '');
        const metadata = getMetadata(content || '');
        const name = metadata.title || id;
        const { data } = userPattern.create('root');
        userPattern.update(data.id, { ...data, code: content, name: name });
      }
    }),
  );
  logger(`import done!`);
}

export async function exportPatterns() {
  const userPatternsTree = userPattern.getAll();
  const flatPatterns = [];

  function collectPatterns(node) {
    if (node.type === 'pattern') {
      flatPatterns.push(node);
    } else if (node.type === 'folder' && node.children) {
      for (const childId in node.children) {
        collectPatterns(node.children[childId]);
      }
    }
  }

  collectPatterns(userPatternsTree);

  const blob = new Blob([JSON.stringify(flatPatterns, null, 2)], { type: 'application/json' });
  const downloadLink = document.createElement('a');
  downloadLink.href = window.URL.createObjectURL(blob);
  const date = new Date().toISOString().split('T')[0];
  downloadLink.download = `strudel_patterns_${date}.json`;
  document.body.appendChild(downloadLink);
  downloadLink.click();
  document.body.removeChild(downloadLink);
}
