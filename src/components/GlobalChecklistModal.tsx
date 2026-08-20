import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChecklistItem, Trip, AppData } from '../types';
import { X, Plus, Trash2, Edit3, Check, CheckSquare, Layers, Sparkles, Filter, Lock, Tag, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getTripTimingState } from '../lib/tripUtils';
import { saveTripGclistStyling, getTripGclistStyling } from '../lib/db';
import { useBackButton } from '../lib/backButtonHandler';

interface GlobalChecklistModalProps {
  isOpen: boolean;
  onClose: () => void;
  globalChecklist: ChecklistItem[];
  trips: { [id: string]: Trip };
  onUpdateGlobalChecklist: (updatedChecklist: ChecklistItem[]) => void;
  onUpdateTrips?: (updatedTrips: { [id: string]: Trip }) => void;
}

export default function GlobalChecklistModal({
  isOpen,
  onClose,
  globalChecklist,
  trips,
  onUpdateGlobalChecklist,
  onUpdateTrips
}: GlobalChecklistModalProps) {
  useBackButton('global-checklist-modal', isOpen, onClose, 100);

  // Local categories state
  const [customCategories, setCustomCategories] = useState<string[]>([
  'Documents',
  'Money',
  'Essentials',
  'Personal Comfort',
  'Electronics',
  'Toiletries',
  'Health & Beauty',
  'Clothing',
  'Shoes',
  'Accessories'
]);
  const [newCatInput, setNewCatInput] = useState('');
  const [showAddCatForm, setShowAddCatForm] = useState(false);
  const [isCategoriesExpanded, setIsCategoriesExpanded] = useState(true);

  // Filter & Search
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // New Item State
  const [newTaskTask, setNewTaskTask] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState('Essentials');

  // Editing Item State
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editTaskTask, setEditTaskTask] = useState('');
  const [editTaskCategory, setEditTaskCategory] = useState('Essentials');

  // Success Message
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // Category Deletion Warning Modal State
  const [categoryToDeleteModal, setCategoryToDeleteModal] = useState<{ catName: string; count: number } | null>(null);

  // Combine default & extracted categories, sorted alphabetically
  const allCategories = useMemo(() => {
    const cats = new Set<string>(customCategories);
    (globalChecklist || []).forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [customCategories, globalChecklist]);

  // Handle changing category filter (and sync default category for new tasks)
  const handleSelectCategory = (cat: string) => {
    setSelectedCategory(cat);
    if (cat !== 'All') {
      setNewTaskCategory(cat);
    }
  };

  // Keep newTaskCategory valid if categories change
  React.useEffect(() => {
    if (allCategories.length > 0 && !allCategories.includes(newTaskCategory)) {
      setNewTaskCategory(allCategories[0]);
    }
  }, [allCategories, newTaskCategory]);

  // Count of upcoming trips
  const upcomingTripCount = useMemo(() => {
    return Object.values(trips || {}).filter(trip => {
      if (trip.status === 'completed') return false;
      const timing = getTripTimingState(trip.startDate, trip.endDate);
      return timing !== 'past';
    }).length;
  }, [trips]);

  // Handle Add Category
  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const cat = newCatInput.trim();
    if (!cat) return;
    if (!allCategories.includes(cat)) {
      setCustomCategories(prev => [...prev, cat]);
    }
    setNewTaskCategory(cat);
    setSelectedCategory(cat);
    setNewCatInput('');
    setShowAddCatForm(false);
  };

  // Handle Delete Category
  const [deletingCategory, setDeletingCategory] = useState<string | null>(null);
  const handleDeleteCategory = (catToDelete: string) => {
    // Guard against double-tap / double-submit on mobile firing this twice
    if (deletingCategory === catToDelete) return;
    setDeletingCategory(catToDelete);

    try {
      // 1. Filter custom categories
      setCustomCategories(prev => prev.filter(c => c !== catToDelete));

      // 2. Delete all items in globalChecklist that belong to catToDelete
      const updatedChecklist = (globalChecklist || []).filter(item => item.category !== catToDelete);
      syncGlobalChecklistChanges(updatedChecklist);

      // 3. Fallback selection state if catToDelete was currently selected
      const remainingAll = allCategories.filter(c => c !== catToDelete);
      const fallbackCategory = remainingAll[0] || '';

      if (selectedCategory === catToDelete) {
        setSelectedCategory('All');
      }
      if (newTaskCategory === catToDelete) {
        setNewTaskCategory(fallbackCategory);
      }
      if (editTaskCategory === catToDelete) {
        setEditTaskCategory(fallbackCategory);
      }
    } catch (err) {
      console.error('Failed to delete category:', err);
      setErrorBanner('Something went wrong deleting that category. Please try again.');
      setTimeout(() => setErrorBanner(null), 4000);
    } finally {
      setDeletingCategory(null);
    }
  };

  // Helper to commit changes to global checklist
  const syncGlobalChecklistChanges = (newGlobalChecklist: ChecklistItem[]) => {
    try {
      onUpdateGlobalChecklist(newGlobalChecklist);
      setSuccessBanner(`Updated master global checklist.`);
      setTimeout(() => setSuccessBanner(null), 3000);
    } catch (err) {
      console.error('Failed to sync global checklist:', err);
      setErrorBanner('Could not save your changes. Please try again.');
      setTimeout(() => setErrorBanner(null), 4000);
    }
  };

  // Add Item
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTask.trim()) return;
    if (allCategories.length === 0) return;

    const finalCategory = newTaskCategory || (selectedCategory !== 'All' ? selectedCategory : (allCategories[0] || 'Essentials'));

    const newItem: ChecklistItem = {
      id: `glob-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      task: newTaskTask.trim(),
      category: finalCategory,
      checked: false
    };

    const updated = [...globalChecklist, newItem];
    syncGlobalChecklistChanges(updated);
    setNewTaskTask('');
  };

  // Start Edit Item
  const handleStartEdit = (item: ChecklistItem) => {
    setEditingItemId(item.id);
    setEditTaskTask(item.task);
    setEditTaskCategory(item.category || 'Essentials');
  };

  // Save Edit Item
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItemId || !editTaskTask.trim()) return;

    const updated = globalChecklist.map(item =>
      item.id === editingItemId
        ? { ...item, task: editTaskTask.trim(), category: editTaskCategory }
        : item
    );

    syncGlobalChecklistChanges(updated);
    setEditingItemId(null);
  };

  // Delete Item
  const handleDeleteItem = (itemId: string) => {
    const updated = globalChecklist.filter(item => item.id !== itemId);
    syncGlobalChecklistChanges(updated);
  };

  // Filtered items
  const filteredItems = useMemo(() => {
    return (globalChecklist || []).filter(item => {
      const matchesCat = selectedCategory === 'All' || item.category === selectedCategory;
      const matchesSearch = !searchQuery.trim() || item.task.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesCat && matchesSearch;
    });
  }, [globalChecklist, selectedCategory, searchQuery]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[220] flex items-center justify-center p-3 sm:p-5">
          <motion.div
            key="gchecklist-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
          />
          <motion.div
            key="gchecklist-modal"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28, mass: 0.8 }}
            className="relative z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl max-w-4xl sm:max-w-5xl w-full p-5 sm:p-6 shadow-2xl space-y-3.5 text-left max-h-[85vh] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h2 className="font-sans text-base sm:text-lg font-bold text-slate-800 dark:text-white flex items-center space-x-2 shrink-0">
                <CheckSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <span>Global Checklist Manager</span>
              </h2>

              <button
                type="button"
                onClick={onClose}
                className="p-2 rounded-2xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer shrink-0"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Success Banner */}
            {successBanner && (
              <div className="px-4 py-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center space-x-2 animate-in fade-in shrink-0">
                <Check className="h-4 w-4 shrink-0 text-emerald-600" />
                <span>{successBanner}</span>
              </div>
            )}

            {/* Error Banner */}
            {errorBanner && (
              <div className="px-4 py-3 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800/60 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center space-x-2 animate-in fade-in shrink-0">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{errorBanner}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pr-1">
              {/* 1. Global Categories Management (Add & Delete Categories) */}
              <div className="p-3.5 bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsCategoriesExpanded(prev => !prev)}
                    className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center space-x-1.5 cursor-pointer group"
                    aria-expanded={isCategoriesExpanded}
                  >
                    <Tag className="h-3.5 w-3.5 text-indigo-500" />
                    <span>Global Categories</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded-md font-mono bg-slate-100 dark:bg-slate-800 text-slate-500">
                      {allCategories.length}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCategoriesExpanded(prev => !prev)}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition cursor-pointer"
                    aria-expanded={isCategoriesExpanded}
                    title={isCategoriesExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isCategoriesExpanded ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {isCategoriesExpanded && !showAddCatForm && (
                  <button
                    type="button"
                    onClick={() => setShowAddCatForm(true)}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-300 transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New Category</span>
                  </button>
                )}

                {isCategoriesExpanded && showAddCatForm && (
                  <form onSubmit={handleAddCategory} className="flex items-center space-x-2 animate-in fade-in duration-150">
                    <input
                      type="text"
                      required
                      placeholder="Category name (e.g. Toiletries, Electronics)"
                      value={newCatInput}
                      onChange={e => setNewCatInput(e.target.value)}
                      className="flex-1 text-xs px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500"
                    />
                    <button
                      type="submit"
                      className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddCatForm(false)}
                      className="p-2 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </form>
                )}

                {isCategoriesExpanded && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {allCategories.map((cat, idx) => (
                      <span
                        key={`gcat-badge-${cat}-${idx}`}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-800"
                      >
                        <span>{cat}</span>
                        <button
                          type="button"
                          onClick={() => {
                            const count = (globalChecklist || []).filter(item => item.category === cat).length;
                            setCategoryToDeleteModal({ catName: cat, count });
                          }}
                          className="text-slate-400 dark:text-slate-500 hover:text-rose-600 font-extrabold pl-1 transition text-xs cursor-pointer"
                          title={`Delete category ${cat}`}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* 2. Form to Add Global Item */}
              <form onSubmit={handleAddItem} className="p-3.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xs">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    required
                    placeholder="Add a new global item — e.g. Passport, Power Adapter, First Aid Kit"
                    value={newTaskTask}
                    onChange={e => setNewTaskTask(e.target.value)}
                    className="flex-1 text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition"
                  />
                  <div className="flex gap-2">
                    <select
                      value={newTaskCategory}
                      onChange={e => setNewTaskCategory(e.target.value)}
                      disabled={allCategories.length === 0}
                      className="text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 font-bold outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {allCategories.map((cat, idx) => (
                        <option key={`gcat-opt-${cat}-${idx}`} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      disabled={allCategories.length === 0}
                      title={allCategories.length === 0 ? 'Add a category before adding an item' : undefined}
                      className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition shadow-xs flex items-center space-x-1 cursor-pointer shrink-0 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:hover:bg-slate-300 dark:disabled:hover:bg-slate-700 disabled:cursor-not-allowed disabled:shadow-none"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Add Item</span>
                    </button>
                  </div>
                </div>
                {allCategories.length === 0 && (
                  <p className="text-[10px] text-rose-500 font-bold mt-2">
                    No categories available — add a category first before adding items.
                  </p>
                )}
              </form>

              {/* 3. Search Box */}
              <div className="relative">
                <Filter className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search master items..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* 4. Filter (single row scrollable) */}
              <div className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap pb-1 scrollbar-none text-xs">
                <button
                  type="button"
                  onClick={() => handleSelectCategory('All')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer border ${
                    selectedCategory === 'All'
                      ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  All ({globalChecklist.length})
                </button>
                {allCategories.map((cat, idx) => {
                  const count = globalChecklist.filter(x => x.category === cat).length;
                  const isSel = selectedCategory === cat;
                  return (
                    <button
                      key={`gcat-filter-${cat}-${idx}`}
                      type="button"
                      onClick={() => handleSelectCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl font-bold transition shrink-0 cursor-pointer border flex items-center space-x-1.5 ${
                        isSel
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{cat}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                        isSel ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* 5. Master List Items */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 px-1 font-bold">
                  <span>Master List Items ({filteredItems.length})</span>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-indigo-600 hover:underline"
                    >
                      Clear search
                    </button>
                  )}
                </div>

                {filteredItems.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs font-medium bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800 border-dashed">
                    No items found matching category &quot;{selectedCategory}&quot;.
                  </div>
                ) : (
                  filteredItems.map((item, idx) => (
                    <div
                      key={item.id ? `gitem-${item.id}-${idx}` : `gitem-idx-${idx}`}
                      className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all group"
                    >
                      {editingItemId === item.id ? (
                        <form onSubmit={handleSaveEdit} className="flex-1 flex items-center gap-2 mr-2">
                          <input
                            type="text"
                            required
                            value={editTaskTask}
                            onChange={e => setEditTaskTask(e.target.value)}
                            className="flex-1 text-xs px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100"
                          />
                          <select
                            value={editTaskCategory}
                            onChange={e => setEditTaskCategory(e.target.value)}
                            className="text-xs px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 font-bold"
                          >
                            {allCategories.map((cat, cIdx) => (
                              <option key={`gedit-cat-opt-${cat}-${cIdx}`} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="p-1.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                            title="Save edit"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingItemId(null)}
                            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 cursor-pointer"
                            title="Cancel edit"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center space-x-3">
                            <span className="w-2 h-2 rounded-full bg-indigo-500 shrink-0" />
                            <div className="space-y-0.5">
                              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                                {item.task}
                              </span>
                              <span className="block text-[9px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 w-max uppercase font-mono font-bold">
                                {item.category || 'Essentials'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => handleStartEdit(item)}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition cursor-pointer"
                              title="Edit global item"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                              title="Delete global item"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

          </motion.div>
        </div>
      )}

      {/* Warning Confirmation Modal for Category Deletion */}
      {categoryToDeleteModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[230] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full space-y-4 shadow-xl text-left">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
              <span className="text-rose-500">⚠️</span>
              <span>Delete Category &quot;{categoryToDeleteModal.catName}&quot;?</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Deleting this category will permanently remove all associated items ({categoryToDeleteModal.count} item{categoryToDeleteModal.count === 1 ? '' : 's'}) in this category from the global checklist.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setCategoryToDeleteModal(null)}
                disabled={deletingCategory === categoryToDeleteModal.catName}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDeleteCategory(categoryToDeleteModal.catName);
                  setCategoryToDeleteModal(null);
                }}
                disabled={deletingCategory === categoryToDeleteModal.catName}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Category &amp; Items
              </button>
            </div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}
