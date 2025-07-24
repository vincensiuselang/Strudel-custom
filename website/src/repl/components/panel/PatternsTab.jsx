import {
  exportPatterns,
  importPatterns,
  userPattern,
  useActivePattern,
  useViewingPatternData,
  findParent,
  setViewingPatternData,
} from '../../../user_pattern_utils.mjs';
import { useState, useMemo } from 'react';
import { getMetadata } from '../../../metadata_parser.js';
import { parseJSON, isUdels } from '../../util.mjs';
import { useSettings } from '../../../settings.mjs';
import cx from '@src/cx.mjs';
import {
  FolderIcon,
  DocumentIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  FolderPlusIcon,
  DocumentPlusIcon,
  DocumentDuplicateIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  TrashIcon,
} from '@heroicons/react/20/solid';

// Helper function to update the code editor window
const updateCodeWindow = (context, patternData, reset = false) => {
  context.handleUpdate(patternData, reset);
};

const autoResetPatternOnChange = !isUdels();

export function PatternLabel({ pattern }) {
  const title = useMemo(() => {
    if (!pattern) return null;
    const meta = getMetadata(pattern.code || '');
    return meta.title || pattern.name || pattern.id;
  }, [pattern]);

  return <>{title}</>;
}

// Context Menu for pattern/folder actions
function ContextMenu({ onStartRename, onDelete, onClose, isFolder }) {
  return (
    <div className="bg-background border rounded-md shadow-lg p-2 space-y-1" onMouseLeave={onClose}>
      {isFolder && (
        <button onClick={() => { onStartRename(); onClose(); }} className="block w-full text-left px-2 py-1 hover:bg-lineHighlight rounded-md">Rename</button>
      )}
      <button onClick={() => { onDelete(); onClose(); }} className="block w-full text-left px-2 py-1 hover:bg-lineHighlight rounded-md text-red-500">Delete</button>
    </div>
  );
}

// A single node in the tree (either a pattern or a folder)
function TreeNode({ item, level, context }) {
  const [isOpen, setIsOpen] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [newName, setNewName] = useState(item.name);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const activePattern = useActivePattern();
  const viewingPatternStore = useViewingPatternData();
  const viewingPatternData = parseJSON(viewingPatternStore);
  const viewingPatternID = viewingPatternData?.id;

  const isFolder = item.type === 'folder';

  const handleRename = () => {
    userPattern.renameItem(item.id, newName);
    setIsRenaming(false);
  };

  const startRenaming = () => {
    setIsRenaming(true);
    setShowContextMenu(false);
  };

  const handleDelete = () => {
    userPattern.delete(item.id);
    setShowContextMenu(false);
  };

  const handleItemClick = () => {
    if (isFolder) {
      if (viewingPatternID === item.id) {
        setIsOpen(!isOpen);
      }
      setViewingPatternData(item);
    } else {
      updateCodeWindow(context, { ...item, collection: userPattern.collection }, autoResetPatternOnChange);
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(!showContextMenu);
  };

  // Drag and Drop Handlers
  const handleDragStart = (e) => {
    e.stopPropagation();
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    if (isFolder) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e) => {
    if (isFolder) {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== item.id) {
      if (isFolder) {
        // Dropping into a folder
        userPattern.moveItem(draggedId, item.id);
      } else {
        // Dropping onto a pattern
        const tree = userPattern.getAll();
        const targetParent = findParent(tree, item.id);
        if (targetParent) {
          userPattern.moveItem(draggedId, targetParent.id);
        }
      }
    }
  };

  const indent = { paddingLeft: `${level * 1.5}rem` };

  const patternTitle = useMemo(() => {
    if (item.type === 'pattern') {
      const meta = getMetadata(item.code || '');
      const title = meta.title || item.name || item.id;
      const author = Array.isArray(meta.by) ? meta.by.join(',') : 'Anonymous';
      return `${item.id}: ${title} by ${author}`;
    }
    return item.name;
  }, [item]);

  return (
    <div className="w-full" draggable="true" onDragStart={handleDragStart}>
      <div
        className={cx(
          'flex items-center justify-between group w-full hover:bg-lineHighlight rounded-md',
          viewingPatternID === item.id && 'bg-selection',
          activePattern === item.id && context.started && 'outline outline-1',
          isDragOver && 'bg-blue-500/30' // Highlight when dragging over
        )}
        style={indent}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="flex items-center cursor-pointer flex-grow truncate" onClick={handleItemClick}>
          {isFolder && (
            <ChevronRightIcon className={cx('w-5 h-5 mr-1 transition-transform', isOpen && 'rotate-90')} />
          )}
          {isFolder ? <FolderIcon className="w-5 h-5 mr-2" /> : <DocumentIcon className="w-5 h-5 mr-2" />}
          {isRenaming ? (
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={(e) => e.key === 'Enter' && handleRename()}
              autoFocus
              className="bg-transparent border-b"
            />
          ) : (
            <span className="truncate">{patternTitle}</span>
          )}
        </div>
        <div className="relative">
          <button onClick={handleContextMenu} className="p-1 opacity-0 group-hover:opacity-100">
            <EllipsisVerticalIcon className="w-5 h-5" />
          </button>
          {showContextMenu && (
            <div
              className="absolute z-10 bg-background border rounded-md shadow-lg p-2 space-y-1"
              style={{ top: '100%', right: 0, minWidth: '120px' }}
              onMouseLeave={() => setShowContextMenu(false)}
            >
              <ContextMenu 
                onStartRename={startRenaming} 
                onDelete={handleDelete} 
                onClose={() => setShowContextMenu(false)} 
                isFolder={isFolder}
              />
            </div>
          )}
        </div>
      </div>

      {isFolder && isOpen && (
        <PatternTree tree={item} level={level + 1} context={context} />
      )}
    </div>
  );
}

// The recursive tree component
function PatternTree({ tree, level, context }) {
  const children = tree.children ? Object.values(tree.children).sort((a, b) => (a.name || '').localeCompare(b.name || '')) : [];

  return (
    <div
      className="space-y-1 w-full"
      // Removed onDragOver and onDrop from here
    >
      {children.map(item => (
        <TreeNode key={item.id} item={item} level={level} context={context} />
      ))}
    </div>
  );
}

// Reusable Action Button Component
function ActionButton({ onClick, title, className = '', children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cx(
        'flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors shadow-sm',
        'bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600',
        'hover:bg-gray-100 dark:hover:bg-gray-700',
        'text-gray-800 dark:text-gray-200',
        className
      )}
    >
      {children}
    </button>
  );
}

// Main component for the user patterns tab
function UserPatterns({ context }) {
  const { userPatterns } = useSettings(); // This will re-render when patterns change
  const viewingPatternData = parseJSON(useViewingPatternData());
  const [isRootDragOver, setIsRootDragOver] = useState(false);

  const handleCreatePattern = () => {
    const { data } = userPattern.createAndAddToDB('root');
    updateCodeWindow(context, data);
  };

  const handleCreateFolder = () => {
    const folderName = prompt('Enter folder name:');
    if (folderName) {
      userPattern.createFolder(folderName, 'root');
    }
  };

  const handleImportClick = () => {
    document.getElementById('import-input').click();
  };

  const handleRootDrop = (e) => {
    e.preventDefault();
    setIsRootDragOver(false);
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId) {
      userPattern.moveItem(draggedId, 'root');
    }
  };

  const handleRootDragOver = (e) => {
    e.preventDefault();
    setIsRootDragOver(true);
  };

  const handleRootDragLeave = () => {
    setIsRootDragOver(false);
  };

  return (
    <div className="flex flex-col gap-2 flex-grow overflow-hidden h-full pb-2">
      <div className="p-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 flex-wrap pb-2">
          <ActionButton onClick={handleCreatePattern} title="New Pattern">
            <DocumentPlusIcon className="w-4 h-4" />
            <span>Pattern</span>
          </ActionButton>
          <ActionButton onClick={handleCreateFolder} title="New Folder">
            <FolderPlusIcon className="w-4 h-4" />
            <span className="whitespace-nowrap">Folder</span>
          </ActionButton>
          <ActionButton onClick={() => userPattern.duplicate(viewingPatternData, 'root')} title="Duplicate Selected Pattern">
            <DocumentDuplicateIcon className="w-4 h-4" />
            <span className="whitespace-nowrap">Duplicate</span>
          </ActionButton>

          

          <ActionButton onClick={handleImportClick} title="Import Patterns">
            <ArrowUpTrayIcon className="w-4 h-4" />
            <span className="whitespace-nowrap">Import</span>
          </ActionButton>
          <input
            id="import-input"
            style={{ display: 'none' }}
            type="file"
            multiple
            accept="text/plain,application/json"
            onChange={(e) => importPatterns(e.target.files)}
          />
          <ActionButton onClick={exportPatterns} title="Export All Patterns">
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span className="whitespace-nowrap">Export</span>
          </ActionButton>
          <ActionButton
            onClick={() => userPattern.clearAll()}
            title="Delete All Patterns and Folders"
            className="bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-700 dark:text-red-400"
          >
            <TrashIcon className="w-4 h-4" />
          </ActionButton>
        </div>
      </div>

      <div
        className={cx(
          "overflow-auto h-full bg-background p-2 rounded-md",
          isRootDragOver && "outline outline-2 outline-blue-500"
        )}
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
      >
        <PatternTree tree={userPatterns} level={0} context={context} />
      </div>
    </div>
  );
}

// The main export for the tab
export function PatternsTab({ context }) {
  return (
    <div className="px-4 w-full text-foreground space-y-2 flex flex-col overflow-hidden max-h-full h-full">
      <UserPatterns context={context} />
    </div>
  );
}
