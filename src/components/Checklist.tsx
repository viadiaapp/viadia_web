import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ChecklistItem, Trip, StylingItem, TripStylingData } from '../types';
import { 
  CheckSquare, 
  Square, 
  Plus, 
  Trash2, 
  Layers, 
  CheckCircle2, 
  Shirt, 
  Lock, 
  Edit3, 
  Calendar, 
  MapPin, 
  Plane, 
  Hotel, 
  X, 
  Check, 
  Users, 
  Sparkles,
  Info,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Upload,
  Camera,
  Loader2,
  Search
} from 'lucide-react';
import { initTripGclistStyling, saveTripGclistStyling } from '../lib/db';
import { useBackButton } from '../lib/backButtonHandler';
import { capturePhotoDirectly } from '../lib/cameraUtils';

interface ChecklistProps {
  trips: { [id: string]: Trip };
  globalChecklist: ChecklistItem[];
  onUpdateTrips: (updatedTrips: { [id: string]: Trip }) => void;
  onUpdateGlobalChecklist: (updatedChecklist: ChecklistItem[]) => void;
  activeTripId: string | null;
  onSetActiveTripId: (id: string | null) => void;
  isReadOnly?: boolean;
  user?: any;
}

export default function Checklist({
  trips,
  globalChecklist,
  onUpdateTrips: originalOnUpdateTrips,
  onUpdateGlobalChecklist,
  activeTripId,
  onSetActiveTripId,
  isReadOnly,
  user
}: ChecklistProps) {
  const onUpdateTrips = (updatedTrips: { [id: string]: Trip }) => {
    if (isReadOnly) {
      console.warn("Attempted to update a read-only trip.");
      return;
    }
    originalOnUpdateTrips(updatedTrips);
  };

  const activeTrip = activeTripId ? trips[activeTripId] : null;

  // Active sub-tab state: 'shared' | 'personal' | 'styling'
  const [activeTab, setActiveTab] = useState<'shared' | 'personal' | 'styling'>('shared');

  // Trip-specific Checklist State (Tab 1 - Shared)
  const [newTripTask, setNewTripTask] = useState('');
  const [newTripCat, setNewTripCat] = useState<string>('');
  const [selectedTripCategory, setSelectedTripCategory] = useState<string>('All');

  // Personal Checklist State (Tab 2 - Personal)
  const [tripGclist, setTripGclist] = useState<ChecklistItem[]>([]);
  const [newPersonalTask, setNewPersonalTask] = useState('');
  const [newPersonalCat, setNewPersonalCat] = useState<string>('');
  const [selectedPersonalCategory, setSelectedPersonalCategory] = useState<string>('All');

  // Search states for each tab
  const [searchSharedQuery, setSearchSharedQuery] = useState('');
  const [searchPersonalQuery, setSearchPersonalQuery] = useState('');
  const [searchOutfitQuery, setSearchOutfitQuery] = useState('');

  // Trip Styling State (Tab 3 - Styling)
  const [tripStyling, setTripStyling] = useState<TripStylingData>({ days: {} });
  const [isLoadingGclistStyling, setIsLoadingGclistStyling] = useState(false);

  // Collapsed Days state for Outfits
  const [collapsedDays, setCollapsedDays] = useState<{ [dayKey: string]: boolean }>({});
  const toggleCollapseDay = (dayKey: string) => {
    setCollapsedDays(prev => ({
      ...prev,
      [dayKey]: !prev[dayKey]
    }));
  };

  // Outfit Item Modal state (Add / Modify)
  const [stylingModalOpen, setStylingModalOpen] = useState(false);
  const [targetDayKey, setTargetDayKey] = useState<string>('1');
  const [editingItem, setEditingItem] = useState<StylingItem | null>(null);
  const [outfitTitle, setOutfitTitle] = useState('');
  const [outfitCategory, setOutfitCategory] = useState('Outfit');
  const [outfitNotes, setOutfitNotes] = useState('');
  const [outfitImageUrl, setOutfitImageUrl] = useState('');
  const [isCapturingOutfit, setIsCapturingOutfit] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  const handleOutfitImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setOutfitImageUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleOutfitCameraCapture = async () => {
    try {
      setIsCapturingOutfit(true);
      const result = await capturePhotoDirectly('Outfit');
      if (result && result.data) {
        setOutfitImageUrl(result.data);
      }
    } catch (err) {
      console.error('Error capturing outfit photo:', err);
    } finally {
      setIsCapturingOutfit(false);
    }
  };

  const activeChecklistCategories = useMemo(() => {
    const list = activeTrip?.checklistCategories || ['Packing', 'Documents', 'Bookings', 'Other'];
    return [...list].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [activeTrip?.checklistCategories]);

  // Category management inputs & deletion modal state
  const [newSharedCatInput, setNewSharedCatInput] = useState('');
  const [newPersonalCatInput, setNewPersonalCatInput] = useState('');
  const [personalCustomCategories, setPersonalCustomCategories] = useState<string[]>([]);
  const [deleteCategoryModal, setDeleteCategoryModal] = useState<{ catName: string; type: 'shared' | 'personal'; itemCount: number } | null>(null);

  // Modals & sub-overlays back button handlers
  useBackButton('checklist-preview-image', previewImageUrl !== null, () => setPreviewImageUrl(null), 110);
  useBackButton('checklist-styling-modal', stylingModalOpen, () => setStylingModalOpen(false), 110);
  useBackButton('checklist-delete-category', deleteCategoryModal !== null, () => setDeleteCategoryModal(null), 110);

  // Fetch or initialize trip_gclist_styling whenever activeTrip changes
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      if (!activeTrip) return;
      const tripCode = activeTrip.code || activeTrip.id;
      if (!tripCode) return;

      setIsLoadingGclistStyling(true);
      try {
        const [gclist, styling] = await initTripGclistStyling(tripCode, globalChecklist);
        if (isMounted) {
          setTripGclist(gclist || []);
          setTripStyling(styling || { days: {} });
        }
      } catch (err) {
        console.error('Error loading trip_gclist_styling:', err);
      } finally {
        if (isMounted) setIsLoadingGclistStyling(false);
      }
    }

    loadData();
    return () => {
      isMounted = false;
    };
  }, [activeTrip?.id, activeTrip?.code, (globalChecklist || []).map(g => `${g.id}-${g.checked}`).join(',')]);

  // Helper to persist trip_gclist_styling
  const persistGclistStyling = async (updatedGclist?: ChecklistItem[], updatedStyling?: TripStylingData) => {
    if (!activeTrip) return;
    const tripCode = activeTrip.code || activeTrip.id;
    if (!tripCode) return;

    const gToSave = updatedGclist !== undefined ? updatedGclist : tripGclist;
    const sToSave = updatedStyling !== undefined ? updatedStyling : tripStyling;

    setTripGclist(gToSave);
    setTripStyling(sToSave);

    try {
      await saveTripGclistStyling(tripCode, [gToSave, sToSave]);
    } catch (err) {
      console.error('Error saving trip_gclist_styling:', err);
    }
  };

  // --- TAB 1: SHARED LIST LOGIC ---
  const tripCategories = useMemo(() => {
    const cats = new Set<string>();
    activeChecklistCategories.forEach(c => cats.add(c));
    if (activeTrip?.checklist) {
      activeTrip.checklist.forEach(item => {
        if (item.category) cats.add(item.category);
      });
    }
    const sorted = Array.from(cats).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return ['All', ...sorted];
  }, [activeChecklistCategories, activeTrip?.checklist]);

  const handleAddTripItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip || !newTripTask.trim() || activeChecklistCategories.length === 0) return;
    if (isReadOnly) {
      throw new Error("Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.");
    }

    const finalCat = newTripCat || activeChecklistCategories[0] || 'Packing';
    const newItem: ChecklistItem = {
      id: `check-${Date.now()}`,
      task: newTripTask.trim(),
      checked: false,
      category: finalCat
    };

    const updatedTrips = { ...trips };
    if (updatedTrips[activeTrip.id]) {
      updatedTrips[activeTrip.id] = {
        ...updatedTrips[activeTrip.id],
        checklist: [...(updatedTrips[activeTrip.id].checklist || []), newItem]
      };
    }

    onUpdateTrips(updatedTrips);
    setNewTripTask('');
  };

  const handleToggleTripItem = (itemId: string) => {
    if (!activeTrip) return;
    if (isReadOnly) {
      throw new Error("Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.");
    }

    const updatedTrips = { ...trips };
    if (updatedTrips[activeTrip.id]) {
      updatedTrips[activeTrip.id] = {
        ...updatedTrips[activeTrip.id],
        checklist: updatedTrips[activeTrip.id].checklist.map(item =>
          item.id === itemId ? { ...item, checked: !item.checked } : item
        )
      };
    }

    onUpdateTrips(updatedTrips);
  };

  const handleDeleteTripItem = (itemId: string) => {
    if (!activeTrip) return;
    if (isReadOnly) {
      throw new Error("Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.");
    }

    const updatedTrips = { ...trips };
    if (updatedTrips[activeTrip.id]) {
      updatedTrips[activeTrip.id] = {
        ...updatedTrips[activeTrip.id],
        checklist: updatedTrips[activeTrip.id].checklist.filter(item => item.id !== itemId)
      };
    }

    onUpdateTrips(updatedTrips);
  };

  const handleAddSharedCategory = (catName: string) => {
    if (!activeTrip || !catName.trim()) return;
    if (isReadOnly) {
      throw new Error("Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.");
    }
    const clean = catName.trim();
    const current = activeTrip.checklistCategories || ['Packing', 'Documents', 'Bookings', 'Other'];
    if (current.some(c => c.toLowerCase() === clean.toLowerCase())) return;

    const updatedCategories = [...current, clean].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    const updatedTrips = { ...trips };
    if (updatedTrips[activeTrip.id]) {
      updatedTrips[activeTrip.id] = {
        ...updatedTrips[activeTrip.id],
        checklistCategories: updatedCategories
      };
    }
    onUpdateTrips(updatedTrips);
    setNewTripCat(clean);
  };

  const handleDeleteSharedCategory = (catToDelete: string) => {
    if (!activeTrip) return;
    if (isReadOnly) {
      throw new Error("Action is unauthorized. Please seek permission from the trip owner to allow modification of this trip.");
    }
    const currentCategories = activeTrip.checklistCategories || ['Packing', 'Documents', 'Bookings', 'Other'];
    const updatedCategories = currentCategories.filter(c => c !== catToDelete);
    const updatedChecklist = (activeTrip.checklist || []).filter(item => item.category !== catToDelete);

    const updatedTrips = { ...trips };
    if (updatedTrips[activeTrip.id]) {
      updatedTrips[activeTrip.id] = {
        ...updatedTrips[activeTrip.id],
        checklistCategories: updatedCategories,
        checklist: updatedChecklist
      };
    }
    onUpdateTrips(updatedTrips);

    if (selectedTripCategory === catToDelete) {
      setSelectedTripCategory('All');
    }
    if (newTripCat === catToDelete) {
      setNewTripCat(updatedCategories[0] || 'Packing');
    }
  };

  // --- TAB 2: PERSONAL LIST LOGIC ---
  const personalCategoryOptions = useMemo(() => {
    const cats = new Set<string>();
    (tripGclist || []).forEach(item => {
      if (item.category) cats.add(item.category);
    });
    personalCustomCategories.forEach(c => cats.add(c));
    return Array.from(cats).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [tripGclist, personalCustomCategories]);

  const handleAddPersonalCategory = (catName: string) => {
    if (!catName.trim()) return;
    const clean = catName.trim();
    if (!personalCategoryOptions.some(c => c.toLowerCase() === clean.toLowerCase())) {
      setPersonalCustomCategories(prev => [...prev, clean]);
    }
    setNewPersonalCat(clean);
  };

  const handleDeletePersonalCategory = (catToDelete: string) => {
    const updatedGclist = (tripGclist || []).filter(item => item.category !== catToDelete);
    setPersonalCustomCategories(prev => prev.filter(c => c !== catToDelete));
    persistGclistStyling(updatedGclist, undefined);

    if (selectedPersonalCategory === catToDelete) {
      setSelectedPersonalCategory('All');
    }
    const remainingOptions = personalCategoryOptions.filter(c => c !== catToDelete);
    if (newPersonalCat === catToDelete) {
      setNewPersonalCat(remainingOptions[0] || '');
    }
  };

  const personalCategories = useMemo(() => {
    return ['All', ...personalCategoryOptions];
  }, [personalCategoryOptions]);

  useEffect(() => {
    if (personalCategoryOptions.length > 0) {
      if (!newPersonalCat || !personalCategoryOptions.includes(newPersonalCat)) {
        setNewPersonalCat(personalCategoryOptions[0]);
      }
    } else {
      if (newPersonalCat !== '') {
        setNewPersonalCat('');
      }
    }
  }, [personalCategoryOptions.join(','), newPersonalCat]);

  const handleAddPersonalItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPersonalTask.trim() || personalCategoryOptions.length === 0) return;

    const finalCat = newPersonalCat || personalCategoryOptions[0];
    if (!finalCat) return;

    const newItem: ChecklistItem = {
      id: `pers-${Date.now()}`,
      task: newPersonalTask.trim(),
      checked: false,
      category: finalCat
    };

    const updated = [...tripGclist, newItem];
    persistGclistStyling(updated, undefined);
    setNewPersonalTask('');
  };

  const handleTogglePersonalItem = (itemId: string) => {
    const updated = tripGclist.map(item =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    persistGclistStyling(updated, undefined);
  };

  const handleDeletePersonalItem = (itemId: string) => {
    const updated = tripGclist.filter(item => item.id !== itemId);
    persistGclistStyling(updated, undefined);
  };

  // --- TAB 3: TRIP STYLING LOGIC ---
  // Compute Days for the active trip
  const dayCards = useMemo(() => {
    if (!activeTrip) return [];

    const dates: { dayNumber: number; dateString: string; label: string }[] = [];
    const startStr = activeTrip.startDate;
    const endStr = activeTrip.endDate;

    if (startStr && endStr) {
      try {
        const start = new Date(startStr + 'T00:00:00');
        const end = new Date(endStr + 'T00:00:00');
        if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
          const curr = new Date(start);
          let index = 1;
          while (curr <= end) {
            const y = curr.getFullYear();
            const m = String(curr.getMonth() + 1).padStart(2, '0');
            const d = String(curr.getDate()).padStart(2, '0');
            const dateStr = `${y}-${m}-${d}`;
            const label = curr.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
            dates.push({ dayNumber: index, dateString: dateStr, label });
            curr.setDate(curr.getDate() + 1);
            index++;
          }
        }
      } catch (e) {
        console.warn('Error computing dates:', e);
      }
    }

    if (dates.length === 0) {
      dates.push({
        dayNumber: 1,
        dateString: startStr || new Date().toISOString().split('T')[0],
        label: startStr ? new Date(startStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Day 1'
      });
    }

    return dates.map(d => {
      // Find activities planned for this day (excluding Start/End at Hotel and stay items)
      const places = (activeTrip.timeline || []).filter(place => {
        if (
          place.isAutoDailyHotelStop ||
          place.isStay ||
          place.title?.toLowerCase().startsWith('start at ') ||
          place.title?.toLowerCase().startsWith('end at ') ||
          place.title?.toLowerCase().startsWith('check in at ') ||
          place.title?.toLowerCase().startsWith('check out at ')
        ) {
          return false;
        }
        if (!place.time) return d.dayNumber === 1;
        return place.time.startsWith(d.dateString);
      });

      // Get outfit items for this day
      const dayKeyNum = String(d.dayNumber);
      const dayKeyDate = d.dateString;
      const daysObj = tripStyling?.days || {};
      const outfitItems = daysObj[dayKeyNum] || daysObj[dayKeyDate] || [];

      return {
        ...d,
        places,
        outfitItems
      };
    });
  }, [activeTrip, tripStyling]);

  const expandAllOutfits = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    setCollapsedDays({});
  };

  const collapseAllOutfits = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(15);
    }
    const newCollapsed: Record<string, boolean> = {};
    dayCards.forEach(d => {
      newCollapsed[String(d.dayNumber)] = true;
    });
    setCollapsedDays(newCollapsed);
  };

  // Open Add Outfit Modal
  const handleOpenAddOutfitModal = (dayKey: string) => {
    setTargetDayKey(dayKey);
    setEditingItem(null);
    setOutfitTitle('');
    setOutfitCategory('Outfit');
    setOutfitNotes('');
    setOutfitImageUrl('');
    setStylingModalOpen(true);
  };

  // Open Edit Outfit Modal
  const handleOpenEditOutfitModal = (dayKey: string, item: StylingItem) => {
    setTargetDayKey(dayKey);
    setEditingItem(item);
    setOutfitTitle(item.title);
    setOutfitCategory(item.category || 'Outfit');
    setOutfitNotes(item.notes || '');
    setOutfitImageUrl(item.imageUrl || '');
    setStylingModalOpen(true);
  };

  // Save Outfit Item (Add or Modify)
  const handleSaveOutfitItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!outfitTitle.trim() || !activeTrip) return;

    const currentDays = { ...(tripStyling.days || {}) };
    const dayKey = targetDayKey;
    const dayList = [...(currentDays[dayKey] || [])];

    if (editingItem) {
      // Modify
      const updatedList = dayList.map(item =>
        item.id === editingItem.id
          ? {
              ...item,
              title: outfitTitle.trim(),
              category: outfitCategory,
              notes: outfitNotes.trim(),
              imageUrl: outfitImageUrl || undefined
            }
          : item
      );
      currentDays[dayKey] = updatedList;
    } else {
      // Add
      const newItem: StylingItem = {
        id: `style-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        title: outfitTitle.trim(),
        category: outfitCategory,
        notes: outfitNotes.trim(),
        imageUrl: outfitImageUrl || undefined,
        checked: false
      };
      currentDays[dayKey] = [...dayList, newItem];
    }

    const updatedStyling: TripStylingData = { days: currentDays };
    persistGclistStyling(undefined, updatedStyling);

    setStylingModalOpen(false);
    setEditingItem(null);
    setOutfitTitle('');
    setOutfitNotes('');
    setOutfitImageUrl('');
  };

  // Toggle Outfit Checkbox
  const handleToggleOutfitItem = (dayKey: string, itemId: string) => {
    const currentDays = { ...(tripStyling.days || {}) };
    const dayList = currentDays[dayKey] || [];
    const updatedList = dayList.map(item =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    currentDays[dayKey] = updatedList;

    const updatedStyling: TripStylingData = { days: currentDays };
    persistGclistStyling(undefined, updatedStyling);
  };

  // Delete Outfit Item
  const handleDeleteOutfitItem = (dayKey: string, itemId: string) => {
    const currentDays = { ...(tripStyling.days || {}) };
    const dayList = currentDays[dayKey] || [];
    currentDays[dayKey] = dayList.filter(item => item.id !== itemId);

    const updatedStyling: TripStylingData = { days: currentDays };
    persistGclistStyling(undefined, updatedStyling);
  };

  // Progress calculations
  const getProgress = (items: ChecklistItem[]) => {
    if (!items || items.length === 0) return { completed: 0, total: 0, pct: 0 };
    const completed = items.filter(x => x.checked).length;
    return {
      completed,
      total: items.length,
      pct: Math.round((completed / items.length) * 100)
    };
  };

  const sharedProgress = activeTrip ? getProgress(activeTrip.checklist) : { completed: 0, total: 0, pct: 0 };
  const personalProgress = getProgress(tripGclist);

  const totalOutfitItems = useMemo(() => {
    if (!tripStyling?.days) return 0;
    return Object.values(tripStyling.days).reduce((acc: number, list: StylingItem[]) => acc + (Array.isArray(list) ? list.length : 0), 0);
  }, [tripStyling]);

  useEffect(() => {
    if (searchOutfitQuery.trim()) {
      setCollapsedDays({});
    }
  }, [searchOutfitQuery]);

  const filteredSharedChecklist = (activeTrip?.checklist || []).filter(item => {
    const matchesCategory = selectedTripCategory === 'All' || item.category === selectedTripCategory;
    if (!matchesCategory) return false;
    if (!searchSharedQuery.trim()) return true;
    const q = searchSharedQuery.toLowerCase().trim();
    return (
      item.task.toLowerCase().includes(q) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  const filteredPersonalChecklist = tripGclist.filter(item => {
    const matchesCategory = selectedPersonalCategory === 'All' || item.category === selectedPersonalCategory;
    if (!matchesCategory) return false;
    if (!searchPersonalQuery.trim()) return true;
    const q = searchPersonalQuery.toLowerCase().trim();
    return (
      item.task.toLowerCase().includes(q) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  const totalMatchingOutfitItems = useMemo(() => {
    if (!searchOutfitQuery.trim()) return totalOutfitItems;
    const q = searchOutfitQuery.toLowerCase().trim();
    let count = 0;
    dayCards.forEach(day => {
      const isDayMatchingQuery = `day ${day.dayNumber}`.includes(q) || day.label.toLowerCase().includes(q);
      day.outfitItems.forEach(item => {
        if (
          isDayMatchingQuery ||
          item.title.toLowerCase().includes(q) ||
          (item.category && item.category.toLowerCase().includes(q)) ||
          (item.notes && item.notes.toLowerCase().includes(q))
        ) {
          count++;
        }
      });
    });
    return count;
  }, [searchOutfitQuery, totalOutfitItems, dayCards]);

  return (
    <div className="w-full space-y-6 text-left pb-28">
      {/* 3-Tab Selector Bar */}
      <div className="bg-white dark:bg-slate-900/90 p-1.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex flex-nowrap overflow-x-auto scrollbar-none gap-1.5 shadow-xs w-full">
        {/* Tab 1: Shared */}
        <button
          type="button"
          onClick={() => setActiveTab('shared')}
          className={`shrink-0 flex-1 whitespace-nowrap py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            activeTab === 'shared'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
          }`}
        >
          <Users className="h-4 w-4 shrink-0" />
          <span>Shared</span>
          {activeTrip && (
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
              activeTab === 'shared' ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}>
              {activeTrip.checklist?.length || 0}
            </span>
          )}
        </button>

        {/* Tab 2: Personal */}
        <button
          type="button"
          onClick={() => setActiveTab('personal')}
          className={`shrink-0 flex-1 whitespace-nowrap py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            activeTab === 'personal'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
          }`}
        >
          <Lock className="h-4 w-4 shrink-0" />
          <span>Personal</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
            activeTab === 'personal' ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          }`}>
            {tripGclist.length}
          </span>
        </button>

        {/* Tab 3: Outfits */}
        <button
          type="button"
          onClick={() => setActiveTab('styling')}
          className={`shrink-0 flex-1 whitespace-nowrap py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 cursor-pointer ${
            activeTab === 'styling'
              ? 'bg-indigo-600 text-white shadow-md'
              : 'text-slate-600 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800'
          }`}
        >
          <Shirt className="h-4 w-4 shrink-0" />
          <span>Outfits</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
            activeTab === 'styling' ? 'bg-indigo-700 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
          }`}>
            {totalOutfitItems}
          </span>
        </button>
      </div>

      {/* Sub Heading banner right below slider selection for all 3 tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-1">
        <div>
          <h2 className="font-sans text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
            {activeTab === 'shared' && (
              <>
                <CheckCircle2 className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Shared Trip Checklist</span>
              </>
            )}
            {activeTab === 'personal' && (
              <>
                <Lock className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Personal Checklist for {activeTrip?.title || 'Trip'}</span>
              </>
            )}
            {activeTab === 'styling' && (
              <>
                <Shirt className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Trip Outfits & Styling Timeline</span>
              </>
            )}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {activeTab === 'shared' && 'Checklist specific to this trip • Visible and shared with group members'}
            {activeTab === 'personal' && 'Private to you • Modifying items here affects only this trip and is not shared with group members'}
            {activeTab === 'styling' && 'Plan clothing & outfits for each day of your journey • Private to you'}
          </p>
        </div>

        {activeTab === 'shared' && activeTrip && (
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3.5 py-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs shadow-2xs shrink-0">
            <span className="text-slate-500 dark:text-slate-400 font-medium mr-2">Completed:</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {sharedProgress.pct}% ({sharedProgress.completed} / {sharedProgress.total})
            </span>
          </div>
        )}

        {activeTab === 'personal' && (
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3.5 py-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs shadow-2xs shrink-0">
            <span className="text-slate-500 dark:text-slate-400 font-medium mr-2">Completed:</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {personalProgress.pct}% ({personalProgress.completed} / {personalProgress.total})
            </span>
          </div>
        )}

        {activeTab === 'styling' && activeTrip && (
          <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-3.5 py-2 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs shadow-2xs shrink-0">
            <span className="text-slate-500 dark:text-slate-400 font-medium mr-2">Total Planned:</span>
            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {totalMatchingOutfitItems} {totalMatchingOutfitItems === 1 ? 'item' : 'items'}
            </span>
          </div>
        )}
      </div>

      {/* --- TAB CONTENT 1: SHARED LIST --- */}
      {activeTab === 'shared' && (
        <div className="space-y-6 text-left w-full">
          {!activeTrip ? (
            <div className="p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Select or create a trip from the Planner or Map page to access shared checklist features.
              </p>
            </div>
          ) : (
            <>
              {/* Separate Card 1: Add Task Form */}
              {!isReadOnly && (
                <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-3">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
                    <Plus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Add Shared Task</span>
                  </div>
                  <form onSubmit={handleAddTripItem} className="flex flex-col sm:flex-row gap-2 items-center justify-between w-full">
                    <input
                      type="text"
                      required
                      placeholder={activeChecklistCategories.length === 0 ? "Add a shared category below first..." : "e.g. Bring swimwear or snow jackets"}
                      value={newTripTask}
                      disabled={activeChecklistCategories.length === 0}
                      onChange={e => setNewTripTask(e.target.value)}
                      className="flex-1 min-w-0 w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="flex gap-2 items-center justify-end w-full sm:w-auto shrink-0 ml-auto">
                      <select
                        value={newTripCat || (selectedTripCategory !== 'All' ? selectedTripCategory : activeChecklistCategories[0] || '')}
                        onChange={e => setNewTripCat(e.target.value)}
                        disabled={activeChecklistCategories.length === 0}
                        className="text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 font-bold outline-none hover:bg-slate-100 dark:hover:bg-slate-900 transition shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {activeChecklistCategories.length === 0 ? (
                          <option value="">No categories</option>
                        ) : (
                          activeChecklistCategories.map((cat, idx) => (
                            <option key={`shared-cat-opt-${cat}-${idx}`} value={cat}>{cat}</option>
                          ))
                        )}
                      </select>
                      <button
                        type="submit"
                        disabled={activeChecklistCategories.length === 0}
                        title={activeChecklistCategories.length === 0 ? "Please add a category first" : "Add Task"}
                        className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0 disabled:hover:bg-indigo-600"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Add</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Card 2: Manage Shared Categories */}
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-100">
                  <div className="flex items-center space-x-1.5">
                    <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Manage Shared Categories</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {activeChecklistCategories.length} categories
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {activeChecklistCategories.map((cat, idx) => (
                    <span
                      key={`shared-cat-badge-${cat}-${idx}`}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 font-bold border border-slate-200/80 dark:border-slate-800"
                    >
                      <span>{cat}</span>
                      {!isReadOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            const count = (activeTrip.checklist || []).filter(i => i.category === cat).length;
                            setDeleteCategoryModal({ catName: cat, type: 'shared', itemCount: count });
                          }}
                          className="text-slate-400 dark:text-slate-500 hover:text-rose-600 font-extrabold pl-1 transition text-xs cursor-pointer"
                          title={`Delete category ${cat}`}
                        >
                          ×
                        </button>
                      )}
                    </span>
                  ))}
                </div>

                {!isReadOnly && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddSharedCategory(newSharedCatInput);
                      setNewSharedCatInput('');
                    }}
                    className="flex gap-2 pt-1 items-center w-full"
                  >
                    <input
					  type="text"
					  placeholder="Add category (e.g. Electronics)"
					  value={newSharedCatInput}
					  onChange={(e) => setNewSharedCatInput(e.target.value)}
					  className="flex-1 min-w-0 text-xs px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition shadow-2xs"
					/>

					<button
					  type="submit"
					  className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50 dark:bg-indigo-950/40 px-3.5 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 transition hover:bg-indigo-600 hover:text-white cursor-pointer"
					>
					  <Plus className="h-3.5 w-3.5" />
					  <span>Add Category</span>
					</button>
                  </form>
                )}
              </div>

              {/* Category Filter Bar + Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap pb-1 scrollbar-thin text-xs flex-1">
                  {tripCategories.map((cat, idx) => {
                    const count = cat === 'All' ? activeTrip.checklist.length : activeTrip.checklist.filter(x => x.category === cat).length;
                    const isSelected = selectedTripCategory === cat;
                    return (
                      <button
                        key={`shared-cat-btn-${cat}-${idx}`}
                        type="button"
                        onClick={() => setSelectedTripCategory(cat)}
                        className={`px-3.5 py-2 rounded-2xl font-bold transition-all shrink-0 cursor-pointer flex items-center space-x-2 border ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                            : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <span>{cat}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                          isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative shrink-0 sm:w-64">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search shared tasks..."
                    value={searchSharedQuery}
                    onChange={e => setSearchSharedQuery(e.target.value)}
                    className="w-full text-xs pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition shadow-2xs placeholder:text-slate-400"
                  />
                  {searchSharedQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchSharedQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* In the end: List all cards for shared items */}
              {(!activeTrip.checklist || activeTrip.checklist.length === 0) ? (
                <div className="p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-xs">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    No shared tasks added yet. Create one above to organize pack lists, documents, or bookings for this trip.
                  </p>
                </div>
              ) : filteredSharedChecklist.length === 0 ? (
                <div className="p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-xs">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {searchSharedQuery.trim()
                      ? `No shared items found matching "${searchSharedQuery}".`
                      : `No shared items found in category "${selectedTripCategory}".`}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSharedChecklist.map((item, idx) => (
                    <div
                      key={item.id ? `shared-item-${item.id}-${idx}` : `shared-item-idx-${idx}`}
                      className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all group flex items-center justify-between gap-3"
                    >
                      <div
                        className={`flex items-center space-x-3 flex-1 ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                        onClick={() => !isReadOnly && handleToggleTripItem(item.id)}
                      >
                        {item.checked ? (
                          <CheckSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                        ) : (
                          <Square className="h-5 w-5 text-slate-300 dark:text-slate-700 shrink-0 hover:text-indigo-600 transition" />
                        )}
                        <div className="space-y-0.5">
                          <span className={`text-xs font-bold transition-all block ${
                            item.checked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'
                          }`}>
                            {item.task}
                          </span>
                          <span className="inline-block text-[9px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-mono font-bold uppercase">
                            {item.category}
                          </span>
                        </div>
                      </div>

                      {!isReadOnly && (
                        <button
                          onClick={() => handleDeleteTripItem(item.id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 transition border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer shrink-0"
                          title="Delete item"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* --- TAB CONTENT 2: PERSONAL LIST --- */}
      {activeTab === 'personal' && (
        <div className="space-y-6 text-left w-full">
          {/* Separate Card 1: Add Personal Task Form */}
          <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-3">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-1.5">
              <Plus className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
              <span>Add Personal Task</span>
            </div>
            <form onSubmit={handleAddPersonalItem} className="flex flex-col sm:flex-row gap-2 items-center justify-between w-full">
              <input
                type="text"
                required
                placeholder={personalCategoryOptions.length === 0 ? "Add a personal category below first..." : "e.g. Personal prescriptions or noise-cancelling headphones"}
                value={newPersonalTask}
                disabled={personalCategoryOptions.length === 0}
                onChange={e => setNewPersonalTask(e.target.value)}
                className="flex-1 min-w-0 w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div className="flex gap-2 items-center justify-end w-full sm:w-auto shrink-0 ml-auto">
                <select
                  value={newPersonalCat}
                  onChange={e => setNewPersonalCat(e.target.value)}
                  disabled={personalCategoryOptions.length === 0}
                  className="text-xs px-3 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 font-bold outline-none hover:bg-slate-100 dark:hover:bg-slate-900 transition shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {personalCategoryOptions.length === 0 ? (
                    <option value="">No categories</option>
                  ) : (
                    personalCategoryOptions.map((cat, idx) => (
                      <option key={`personal-cat-opt-${cat}-${idx}`} value={cat}>
                        {cat}
                      </option>
                    ))
                  )}
                </select>
                <button
                  type="submit"
                  disabled={personalCategoryOptions.length === 0}
                  title={personalCategoryOptions.length === 0 ? "Please add a category first" : "Add Task"}
                  className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition shadow-xs cursor-pointer shrink-0 disabled:hover:bg-indigo-600"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add</span>
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Manage Personal Categories */}
          <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-100">
              <div className="flex items-center space-x-1.5">
                <Layers className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>Manage Personal Categories</span>
              </div>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                {personalCategoryOptions.length} categories
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {personalCategoryOptions.map((cat, idx) => (
                <span
                  key={`personal-cat-badge-${cat}-${idx}`}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 font-bold border border-slate-200/80 dark:border-slate-800"
                >
                  <span>{cat}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const count = (tripGclist || []).filter(i => i.category === cat).length;
                      setDeleteCategoryModal({ catName: cat, type: 'personal', itemCount: count });
                    }}
                    className="text-slate-400 dark:text-slate-500 hover:text-rose-600 font-extrabold pl-1 transition text-xs cursor-pointer"
                    title={`Delete category ${cat}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAddPersonalCategory(newPersonalCatInput);
                setNewPersonalCatInput('');
              }}
              className="flex gap-2 pt-1 items-center w-full"
            >
              <input
				  type="text"
				  placeholder="Add personal category (e.g. Medicine)"
				  value={newPersonalCatInput}
				  onChange={(e) => setNewPersonalCatInput(e.target.value)}
				  className="flex-1 min-w-0 text-xs px-3.5 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition shadow-2xs"
				/>

				<button
				  type="submit"
				  className="shrink-0 flex items-center gap-1 whitespace-nowrap px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-600 hover:text-white text-xs font-bold transition cursor-pointer"
				>
				  <Plus className="h-3.5 w-3.5" />
				  <span>Add Category</span>
				</button>
            </form>
          </div>

          {/* Personal Category Filter Bar + Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap pb-1 scrollbar-thin text-xs flex-1">
              {personalCategories.map((cat, idx) => {
                const count = cat === 'All' ? tripGclist.length : tripGclist.filter(x => x.category === cat).length;
                const isSelected = selectedPersonalCategory === cat;
                return (
                  <button
                    key={`personal-cat-btn-${cat}-${idx}`}
                    type="button"
                    onClick={() => setSelectedPersonalCategory(cat)}
                    className={`px-3.5 py-2 rounded-2xl font-bold transition-all shrink-0 cursor-pointer flex items-center space-x-2 border ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span>{cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-md font-mono ${
                      isSelected ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="relative shrink-0 sm:w-64">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search personal tasks..."
                value={searchPersonalQuery}
                onChange={e => setSearchPersonalQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition shadow-2xs placeholder:text-slate-400"
              />
              {searchPersonalQuery && (
                <button
                  type="button"
                  onClick={() => setSearchPersonalQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  title="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* In the end: List all cards for personal items */}
          {tripGclist.length === 0 ? (
            <div className="p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                No personal tasks added for this trip yet. Add items above for your personal travel preparation.
              </p>
            </div>
          ) : filteredPersonalChecklist.length === 0 ? (
            <div className="p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {searchPersonalQuery.trim()
                  ? `No personal items found matching "${searchPersonalQuery}".`
                  : `No personal items found in category "${selectedPersonalCategory}".`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPersonalChecklist.map((item, idx) => (
                <div
                  key={item.id ? `personal-item-${item.id}-${idx}` : `personal-item-idx-${idx}`}
                  className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all group flex items-center justify-between gap-3"
                >
                  <div
                    className="flex items-center space-x-3 cursor-pointer flex-1"
                    onClick={() => handleTogglePersonalItem(item.id)}
                  >
                    {item.checked ? (
                      <CheckSquare className="h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                    ) : (
                      <Square className="h-5 w-5 text-slate-300 dark:text-slate-700 shrink-0 hover:text-indigo-600 transition" />
                    )}
                    <div className="space-y-0.5">
                      <span className={`text-xs font-bold transition-all block ${
                        item.checked ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'
                      }`}>
                        {item.task}
                      </span>
                      <span className="inline-block text-[9px] px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 font-mono font-bold uppercase">
                        {item.category}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeletePersonalItem(item.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 opacity-0 group-hover:opacity-100 transition border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 cursor-pointer shrink-0"
                    title="Delete item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* --- TAB CONTENT 3: TRIP STYLING / OUTFITS --- */}
      {activeTab === 'styling' && (
        <div className="space-y-6 text-left w-full">
          {!activeTrip ? (
            <div className="p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Select or create a trip to start planning your daily wardrobe outfits.
              </p>
            </div>
          ) : dayCards.length === 0 ? (
            <div className="p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-xs">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                No trip days configured yet.
              </p>
            </div>
          ) : (
            <>
              {/* Outfits Search & Actions Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search outfits, clothing, category, notes, or day..."
                    value={searchOutfitQuery}
                    onChange={e => setSearchOutfitQuery(e.target.value)}
                    className="w-full text-xs pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition shadow-2xs placeholder:text-slate-400"
                  />
                  {searchOutfitQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchOutfitQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                      title="Clear search"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center space-x-3 text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0 self-end sm:self-center px-1">
                  <button
                    type="button"
                    onClick={expandAllOutfits}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline transition font-bold cursor-pointer"
                  >
                    Expand All
                  </button>
                  <span className="text-slate-300 dark:text-slate-700">|</span>
                  <button
                    type="button"
                    onClick={collapseAllOutfits}
                    className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:underline transition font-bold cursor-pointer"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {searchOutfitQuery.trim() && totalMatchingOutfitItems === 0 ? (
                <div className="p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 shadow-xs">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    No outfits found matching &quot;{searchOutfitQuery}&quot;.
                  </p>
                </div>
              ) : (
                dayCards.map((day, dayIdx) => {
                  const dayKey = String(day.dayNumber);
                  const isCollapsed = !!collapsedDays[dayKey];
                  const q = searchOutfitQuery.toLowerCase().trim();
                  const isDayMatchingQuery = q && (`day ${day.dayNumber}`.includes(q) || day.label.toLowerCase().includes(q));

                  const matchingOutfitItems = day.outfitItems.filter(item => {
                    if (!q) return true;
                    if (isDayMatchingQuery) return true;
                    return (
                      item.title.toLowerCase().includes(q) ||
                      (item.category && item.category.toLowerCase().includes(q)) ||
                      (item.notes && item.notes.toLowerCase().includes(q))
                    );
                  });

                  if (q && !isDayMatchingQuery && matchingOutfitItems.length === 0) {
                    return null;
                  }

                  return (
                    <div
                      key={`outfit-day-${day.dayNumber}-${dayIdx}`}
                      className="p-4 sm:p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-xs text-left w-full transition-colors"
                    >
                      {/* Day Group Header - Matched exactly with Timeline tab */}
                      <div
                        onClick={() => toggleCollapseDay(dayKey)}
                        className="flex items-center justify-between text-left border-l-4 border-indigo-600 pl-3.5 py-2 bg-white dark:bg-slate-900 rounded-r-2xl pr-3 cursor-pointer hover:bg-slate-100/80 dark:hover:bg-slate-950 transition-colors"
                      >
                        <div className="flex items-center space-x-2.5">
                          {isCollapsed ? (
                            <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
                          ) : (
                            <ChevronUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )}
                          <div>
                            <h4 className="text-sm font-extrabold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                              Day {day.dayNumber}
                            </h4>
                            <p className="text-[10px] font-bold text-slate-400 font-mono">
                              {day.label}
                            </p>
                          </div>
                        </div>

                        <div
                          className="flex items-center space-x-2"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleOpenAddOutfitModal(dayKey)}
                            className="flex items-center justify-center p-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900 transition shadow-xs cursor-pointer"
                            title={`Add outfit item on Day ${day.dayNumber}`}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Card Body - Collapsible */}
                      <AnimatePresence initial={false}>
                        {!isCollapsed && (
                          <motion.div
                            key={`outfit-day-content-${dayKey}`}
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{
                              height: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
                              opacity: { duration: 0.15, ease: "linear" },
                            }}
                            className="overflow-hidden"
                          >
                            <div className="pt-4 space-y-4">
                              {/* Planned Activities Description */}
                              <div className="bg-slate-50/80 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-200/60 dark:border-slate-800 text-xs space-y-1.5">
                                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 font-bold text-[11px] uppercase tracking-wider">
                                  <Calendar className="h-3.5 w-3.5 text-indigo-500" />
                                  <span>Activities Planned:</span>
                                </div>

                                {day.places.length === 0 ? (
                                  <p className="text-slate-400 dark:text-slate-500 italic text-[11px] pl-5">
                                    No scheduled activities for this day (Free Day / Exploration)
                                  </p>
                                ) : (
                                  <ul className="space-y-1 pl-1">
                                    {day.places.map((place, pIdx) => (
                                      <li key={`outfit-place-${place.id || 'noid'}-${pIdx}`} className="flex items-start space-x-2 text-slate-700 dark:text-slate-300">
                                        {place.isTransportation || place.isTransport ? (
                                          <Plane className="h-3.5 w-3.5 text-sky-500 shrink-0 mt-0.5" />
                                        ) : (
                                          <MapPin className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />
                                        )}
                                        <span className="font-semibold text-xs">{place.title}</span>
                                        {place.description && (
                                          <span className="text-slate-400 dark:text-slate-500 text-[11px] truncate max-w-xs">
                                            — {place.description}
                                          </span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              {/* Outfits List for this day */}
                              <div className="space-y-2">
                                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center space-x-1">
                                  <Shirt className="h-3.5 w-3.5 text-indigo-500" />
                                  <span>Planned Outfits / Clothes:</span>
                                </div>

                                {matchingOutfitItems.length === 0 ? (
                                  <div className="text-center py-6 bg-slate-50/50 dark:bg-slate-950/40 rounded-2xl border border-slate-200/60 dark:border-slate-800 border-dashed text-slate-400 dark:text-slate-500 text-xs font-medium">
                                    {searchOutfitQuery.trim()
                                      ? `No outfits matching "${searchOutfitQuery}" for Day ${day.dayNumber}.`
                                      : `No outfits planned for Day ${day.dayNumber} yet. Click "+" button above to list what to wear.`}
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {matchingOutfitItems.map((item, iIdx) => (
                                      <div
                                        key={`outfit-item-${item.id || 'noid'}-${iIdx}`}
                                        className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all group shadow-2xs gap-3"
                                      >
                                        <div className="flex items-center space-x-3 flex-1">
                                          <div
                                            onClick={() => handleToggleOutfitItem(dayKey, item.id)}
                                            className="cursor-pointer shrink-0"
                                          >
                                            {item.checked ? (
                                              <CheckSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                                            ) : (
                                              <Square className="h-4 w-4 text-slate-300 dark:text-slate-700 hover:text-indigo-600 transition" />
                                            )}
                                          </div>

                                          {/* Image Thumbnail Preview if present */}
                                          {item.imageUrl && (
                                            <img
                                              src={item.imageUrl}
                                              alt={item.title}
                                              onClick={() => setPreviewImageUrl(item.imageUrl || null)}
                                              className="w-12 h-12 object-cover rounded-xl border border-slate-200 dark:border-slate-800 shrink-0 cursor-pointer hover:scale-105 transition shadow-2xs"
                                              title="Click to view full photo"
                                            />
                                          )}

                                          <div
                                            className="space-y-0.5 flex-1 cursor-pointer"
                                            onClick={() => handleToggleOutfitItem(dayKey, item.id)}
                                          >
                                            <span className={`text-xs font-bold block ${
                                              item.checked ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-100'
                                            }`}>
                                              {item.title}
                                            </span>
                                            <div className="flex items-center space-x-2">
                                              {item.category && (
                                                <span className="text-[9px] px-2 py-0.2 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold uppercase font-mono">
                                                  {item.category}
                                                </span>
                                              )}
                                              {item.notes && (
                                                <span className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                                                  {item.notes}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        {/* Options: Edit & Delete */}
                                        <div className="flex items-center space-x-1 shrink-0 self-end sm:self-center">
                                          <button
                                            type="button"
                                            onClick={() => handleOpenEditOutfitModal(dayKey, item)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition cursor-pointer"
                                            title="Edit outfit item"
                                          >
                                            <Edit3 className="h-3.5 w-3.5" />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteOutfitItem(dayKey, item.id)}
                                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition cursor-pointer"
                                            title="Delete outfit item"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })
              )}
            </>
          )}
        </div>
      )}

      {/* Outfit Item Modal (Add / Modify with Image Upload) */}
      {stylingModalOpen && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl text-left max-h-[90vh] flex flex-col overflow-hidden min-w-0">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <h3 className="font-sans text-sm sm:text-base font-bold text-slate-800 dark:text-white flex items-center space-x-2">
                <Shirt className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                <span>{editingItem ? 'Modify Outfit Item' : `Add Outfit Item for Day ${targetDayKey}`}</span>
              </h3>
              <button
                type="button"
                onClick={() => setStylingModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Form Body */}
            <form onSubmit={handleSaveOutfitItem} className="flex flex-col flex-1 overflow-hidden min-h-0 pt-4">
              <div className="flex-1 overflow-y-auto scrollbar-thin space-y-4 pr-1">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Outfit / Item Description <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. White linen shirt & khaki shorts"
                    value={outfitTitle}
                    onChange={e => setOutfitTitle(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition shadow-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Category
                  </label>
                  <select
                    value={outfitCategory}
                    onChange={e => setOutfitCategory(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 font-bold outline-none hover:bg-slate-100 transition shadow-xs"
                  >
                    <option value="Outfit">Outfit / Clothing</option>
                    <option value="Footwear">Footwear / Shoes</option>
                    <option value="Outerwear">Outerwear / Jacket</option>
                    <option value="Accessories">Accessories / Sunglasses</option>
                    <option value="Evening Wear">Evening / Formal Wear</option>
                    <option value="Swimwear">Swimwear / Activewear</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Notes / Style Details (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Pair with comfortable walking sneakers"
                    value={outfitNotes}
                    onChange={e => setOutfitNotes(e.target.value)}
                    className="w-full text-xs px-3.5 py-2.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none text-slate-800 dark:text-slate-100 focus:border-indigo-500 transition shadow-xs"
                  />
                </div>

                {/* Upload Outfit Image */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Outfit Photo / Inspiration (Optional)
                  </label>
                  
                  {outfitImageUrl ? (
                    <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 group max-h-40 flex justify-center bg-slate-100 dark:bg-slate-950">
                      <img src={outfitImageUrl} alt="Outfit preview" className="object-cover h-40 w-full" />
                      <button
                        type="button"
                        onClick={() => setOutfitImageUrl('')}
                        className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/70 text-white hover:bg-slate-900 transition cursor-pointer"
                        title="Remove image"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl cursor-pointer hover:border-indigo-500/50 bg-slate-50/50 dark:bg-slate-950/50 transition text-center">
                        <Upload className="h-4 w-4 text-indigo-500 mb-1" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Upload Photo</span>
                        <span className="text-[10px] text-slate-400">JPG, PNG, WEBP</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleOutfitImageUpload}
                          className="hidden"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={handleOutfitCameraCapture}
                        disabled={isCapturingOutfit}
                        className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-indigo-200 dark:border-indigo-800/60 rounded-2xl cursor-pointer hover:border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30 transition text-center disabled:opacity-50"
                      >
                        {isCapturingOutfit ? (
                          <Loader2 className="h-4 w-4 text-indigo-500 mb-1 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4 text-indigo-500 mb-1" />
                        )}
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Take Photo</span>
                        <span className="text-[10px] text-indigo-400/80">Direct Camera</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-3 mt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setStylingModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition shadow-sm cursor-pointer"
                >
                  {editingItem ? 'Save Changes' : 'Add Outfit Item'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* FULL IMAGE PREVIEW MODAL */}
      {previewImageUrl && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-3xl w-full max-h-[90vh] flex items-center justify-center">
            <img
              src={previewImageUrl}
              alt="Outfit photo full view"
              className="max-h-[85vh] max-w-full rounded-2xl object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-10 right-0 p-2 text-white/80 hover:text-white cursor-pointer"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Deletion Warning Modal for Shared and Personal Checklist Categories */}
      {deleteCategoryModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] sm:rounded-3xl p-5 sm:p-6 max-w-sm w-full space-y-4 shadow-xl text-left max-h-[90vh] overflow-y-auto min-w-0">
            <div className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center space-x-2">
              <span className="text-rose-500">⚠️</span>
              <span>Delete Category &quot;{deleteCategoryModal.catName}&quot;?</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Deleting this category will permanently remove all associated tasks ({deleteCategoryModal.itemCount} item{deleteCategoryModal.itemCount === 1 ? '' : 's'}) in this category from your {deleteCategoryModal.type === 'shared' ? 'shared' : 'personal'} checklist for this trip.
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteCategoryModal(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteCategoryModal.type === 'shared') {
                    handleDeleteSharedCategory(deleteCategoryModal.catName);
                  } else {
                    handleDeletePersonalCategory(deleteCategoryModal.catName);
                  }
                  setDeleteCategoryModal(null);
                }}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Delete Category &amp; Items
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
