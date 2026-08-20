import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Sparkles,
  X,
  MapPin,
  Calendar,
  Compass,
  Clock,
  Check,
  Plus,
  Trash2,
  AlertCircle,
  Loader2,
  Sliders,
  RefreshCw,
  Info,
} from "lucide-react";
import { Trip, Place } from "../types";
import { useBackButton } from "../lib/backButtonHandler";
import { generateGeminiItineraryOnline } from "../lib/apiUtils";

interface GeneratedItineraryItem {
  date: string;
  time: string;
  title: string;
  description: string;
  address: string;
  lat: number;
  lng: number;
  city?: string;
  category?: string;
}

interface GeminiItineraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTrip: Trip;
  onApplyItinerary: (newPlaces: Place[], mode: "replace" | "append") => void;
}

const INTEREST_OPTIONS = [
  { id: "Sightseeing", label: "🏛️ Sights & Landmarks" },
  { id: "Culture", label: "🎨 Arts & Heritage" },
  { id: "Food", label: "🍜 Food & Dining" },
  { id: "Nature", label: "🌲 Nature & Outdoors" },
  { id: "Shopping", label: "🛍️ Shopping & Markets" },
  { id: "Photography", label: "📸 Photo Spots" },
  { id: "HiddenGems", label: "✨ Hidden Gems" },
];

export const GeminiItineraryModal: React.FC<GeminiItineraryModalProps> = ({
  isOpen,
  onClose,
  activeTrip,
  onApplyItinerary,
}) => {
  const [step, setStep] = useState<"configure" | "generating" | "preview">("configure");
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [customCityInput, setCustomCityInput] = useState("");
  const [travelPace, setTravelPace] = useState<"relaxed" | "moderate" | "packed">("moderate");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([
    "Sightseeing",
    "Culture",
    "Food",
  ]);
  const [customNotes, setCustomNotes] = useState("");
  const [applicationMode, setApplicationMode] = useState<"replace" | "append">("replace");

  // Generation Results
  const [generatedItinerary, setGeneratedItinerary] = useState<GeneratedItineraryItem[]>([]);
  const [tripSummary, setTripSummary] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [loadingStatusText, setLoadingStatusText] = useState("Connecting to AI...");

  // Reset modal state upon opening
  useEffect(() => {
    if (!isOpen || !activeTrip) return;

    setStep("configure");
    setGenerationError(null);
    setGeneratedItinerary([]);
    setTripSummary("");
    setSelectedCities([]);
    setCustomCityInput("");
  }, [isOpen, activeTrip?.id]);

  useBackButton(
    'gemini-itinerary-modal',
    isOpen,
    () => {
      if (step === 'review') {
        setStep('configure');
      } else {
        onClose();
      }
    },
    100
  );

  // Requirement: Do not render modal if there is no country selected for the trip
  if (!isOpen || !activeTrip || !activeTrip.countries || activeTrip.countries.length === 0) {
    return null;
  }

  // Calculate day count
  const start = activeTrip.startDate ? new Date(activeTrip.startDate + "T00:00:00") : null;
  const end = activeTrip.endDate ? new Date(activeTrip.endDate + "T00:00:00") : null;
  const dayCount =
    start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())
      ? Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      : 1;

  const handleAddCustomCity = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customCityInput.trim();
    if (trimmed && !selectedCities.includes(trimmed)) {
      setSelectedCities([...selectedCities, trimmed]);
      setCustomCityInput("");
    }
  };

  const handleRemoveCity = (cityName: string) => {
    setSelectedCities(selectedCities.filter((c) => c !== cityName));
  };

  const handleToggleInterest = (id: string) => {
    if (selectedInterests.includes(id)) {
      setSelectedInterests(selectedInterests.filter((i) => i !== id));
    } else {
      setSelectedInterests([...selectedInterests, id]);
    }
  };

  const handleStartGeneration = async () => {
    setStep("generating");
    setGenerationError(null);

    const statusUpdates = [
      `Analyzing itinerary for ${(activeTrip.countries || []).join(", ")}...`,
      "Curating top-rated highlights & scenic spots...",
      "Sequencing daily stops to optimize travel flow...",
      "Assigning coordinates and practical visitor tips...",
    ];

    let statusIndex = 0;
    const interval = setInterval(() => {
      statusIndex = (statusIndex + 1) % statusUpdates.length;
      setLoadingStatusText(statusUpdates[statusIndex]);
    }, 2500);

    try {
      const data = await generateGeminiItineraryOnline({
        tripTitle: activeTrip.title,
        countries: activeTrip.countries || [],
        startDate: activeTrip.startDate,
        endDate: activeTrip.endDate,
        cities: selectedCities,
        pace: travelPace,
        interests: selectedInterests.map((id) => {
          const found = INTEREST_OPTIONS.find((opt) => opt.id === id);
          return found ? found.label : id;
        }),
        customNotes,
      });

      clearInterval(interval);

      if (!data.itinerary || !Array.isArray(data.itinerary) || data.itinerary.length === 0) {
        throw new Error("No itinerary activities were returned. Please refine your inputs and retry.");
      }

      setGeneratedItinerary(data.itinerary as GeneratedItineraryItem[]);
      setTripSummary(data.tripSummary || "");
      setStep("preview");
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      setGenerationError(err.message || "An unexpected error occurred during AI generation.");
      setStep("configure");
    }
  };

  const handleApplyToTrip = () => {
    const newPlaces: Place[] = generatedItinerary.map((item, idx) => {
      const timeString = item.time ? `${item.date}T${item.time}` : `${item.date}T10:00`;
      return {
        id: `ai_place_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 6)}`,
        title: item.title,
        description: item.description || "",
        time: timeString,
        address: item.address || item.city || "",
        lat: typeof item.lat === "number" ? item.lat : 0,
        lng: typeof item.lng === "number" ? item.lng : 0,
        isTransportation: false,
        isStay: false,
        attachments: [],
      };
    });

    onApplyItinerary(newPlaces, applicationMode);
    onClose();
  };

  // Group preview items by date
  const groupedPreviewByDate: { [date: string]: GeneratedItineraryItem[] } = {};
  generatedItinerary.forEach((item) => {
    if (!groupedPreviewByDate[item.date]) {
      groupedPreviewByDate[item.date] = [];
    }
    groupedPreviewByDate[item.date].push(item);
  });

  return createPortal(
    <div className="fixed inset-0 z-[100] overflow-y-auto flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-3xl shadow-2xl p-5 sm:p-6 w-full max-w-xl max-h-[90vh] overflow-y-auto text-left relative animate-in fade-in zoom-in-95 duration-200 flex flex-col">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer z-10"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Clean Header */}
        <div className="border-b border-slate-100 dark:border-slate-800/80 pb-3.5 mb-4 pr-6">
          <div className="flex items-center space-x-2.5">
            <div className="h-8 w-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-100 dark:border-indigo-900/60">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                AI Itinerary Generator
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {(activeTrip.countries || []).join(", ")} • {dayCount} {dayCount === 1 ? "day" : "days"} ({activeTrip.startDate || "Start"} → {activeTrip.endDate || "End"})
              </p>
            </div>
          </div>
        </div>

        {/* Modal Content */}
        <div className="space-y-4 flex-1 text-slate-800 dark:text-slate-200 text-xs">
          {generationError && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl flex items-start space-x-2.5 text-rose-700 dark:text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div>
                <p className="font-semibold text-xs">Generation Error</p>
                <p className="text-[11px] mt-0.5 opacity-90">{generationError}</p>
              </div>
            </div>
          )}

          {/* STEP 1: CONFIGURE */}
          {step === "configure" && (
            <div className="space-y-4">
              {/* Target Cities Input */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300 text-xs flex items-center justify-between">
                  <span>Destination Cities or Regions</span>
                  <span className="text-[11px] font-normal text-slate-400">Optional</span>
                </label>
                <form onSubmit={handleAddCustomCity} className="flex gap-2">
                  <input
                    type="text"
                    value={customCityInput}
                    onChange={(e) => setCustomCityInput(e.target.value)}
                    placeholder="e.g. Tokyo, Kyoto, Osaka..."
                    className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100 text-xs placeholder:text-slate-400 transition"
                  />
                  <button
                    type="submit"
                    disabled={!customCityInput.trim()}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-xs transition flex items-center space-x-1 disabled:opacity-40 cursor-pointer shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add</span>
                  </button>
                </form>

                {/* Added Cities Badges */}
                {selectedCities.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {selectedCities.map((city) => (
                      <span
                        key={city}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 text-indigo-700 dark:text-indigo-300 text-xs font-medium"
                      >
                        <span>{city}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCity(city)}
                          className="hover:text-rose-600 dark:hover:text-rose-400 cursor-pointer ml-0.5"
                          title="Remove"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Travel Pace Segmented Control */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                  Travel Pace
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  {[
                    { id: "relaxed", label: "Relaxed", sub: "1-2 stops/day" },
                    { id: "moderate", label: "Balanced", sub: "2-3 stops/day" },
                    { id: "packed", label: "Packed", sub: "3-4 stops/day" },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setTravelPace(p.id as any)}
                      className={`py-1.5 px-2 rounded-lg text-center transition cursor-pointer ${
                        travelPace === p.id
                          ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold"
                          : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-medium"
                      }`}
                    >
                      <div className="text-xs">{p.label}</div>
                      <div className="text-[10px] opacity-75 font-normal">{p.sub}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Interests & Travel Style */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                  Interests
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {INTEREST_OPTIONS.map((item) => {
                    const isSelected = selectedInterests.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleToggleInterest(item.id)}
                        className={`px-2.5 py-1.5 rounded-xl border text-xs transition cursor-pointer flex items-center space-x-1.5 ${
                          isSelected
                            ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-400 dark:border-indigo-600 text-indigo-700 dark:text-indigo-300 font-semibold"
                            : "bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        <span>{item.label}</span>
                        {isSelected && <Check className="h-3 w-3 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Requests / Notes */}
              <div className="space-y-1.5">
                <label className="font-semibold text-slate-700 dark:text-slate-300 text-xs">
                  Specific Requests (Optional)
                </label>
                <input
                  type="text"
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="e.g. Include local food markets, sunset views, walkable areas..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100 text-xs placeholder:text-slate-400 transition"
                />
              </div>

              {/* Timeline Mode Segmented Selector */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Application Mode
                </span>
                <div className="flex items-center p-0.5 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setApplicationMode("replace")}
                    className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer ${
                      applicationMode === "replace"
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-bold"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
                    }`}
                  >
                    Fresh Timeline
                  </button>
                  <button
                    type="button"
                    onClick={() => setApplicationMode("append")}
                    className={`px-3 py-1 rounded-lg text-xs transition cursor-pointer ${
                      applicationMode === "append"
                        ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs font-bold"
                        : "text-slate-500 dark:text-slate-400 hover:text-slate-800"
                    }`}
                  >
                    Append Stops
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: GENERATING */}
          {step === "generating" && (
            <div className="py-12 text-center space-y-4">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Planning Your Trip
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {loadingStatusText}
                </p>
              </div>
            </div>
          )}

          {/* STEP 3: PREVIEW */}
          {step === "preview" && (
            <div className="space-y-3.5">
              {tripSummary && (
                <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-2xl text-slate-700 dark:text-slate-300">
                  <p className="text-xs leading-relaxed">{tripSummary}</p>
                </div>
              )}

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-100">
                    Generated Activities ({generatedItinerary.length} stops)
                  </span>
                  <button
                    type="button"
                    onClick={() => setStep("configure")}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    Adjust
                  </button>
                </div>

                <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                  {Object.entries(groupedPreviewByDate).map(([dateStr, items], dIdx) => (
                    <div
                      key={dateStr}
                      className="border border-slate-200/80 dark:border-slate-800 rounded-2xl p-3 bg-slate-50/60 dark:bg-slate-950/40 space-y-2"
                    >
                      <div className="flex items-center justify-between border-b border-slate-200/60 dark:border-slate-800/80 pb-1.5">
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 rounded-md bg-indigo-600 text-white font-bold text-[10px]">
                            Day {dIdx + 1}
                          </span>
                          <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                            {new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
                              weekday: "short",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {items.length} {items.length === 1 ? "activity" : "activities"}
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        {items.map((item, iIdx) => (
                          <div
                            key={iIdx}
                            className="p-2 bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800/70 rounded-xl space-y-0.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center space-x-1.5">
                                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-1.5 py-0.5 rounded">
                                  {item.time}
                                </span>
                                <span className="font-semibold text-xs text-slate-900 dark:text-slate-100">
                                  {item.title}
                                </span>
                              </div>
                              {item.category && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                                  {item.category}
                                </span>
                              )}
                            </div>

                            {item.description && (
                              <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                                {item.description}
                              </p>
                            )}

                            {item.address && (
                              <div className="flex items-center space-x-1 text-[10px] text-slate-400 pt-0.5">
                                <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                                <span className="truncate">{item.address}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3.5 mt-4 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2">
          {step === "configure" && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartGeneration}
                className="px-4 py-2 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm flex items-center space-x-1.5 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Generate Itinerary</span>
              </button>
            </>
          )}

          {step === "generating" && (
            <div className="w-full flex justify-center">
              <button
                type="button"
                onClick={() => setStep("configure")}
                className="px-4 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition cursor-pointer"
              >
                Cancel Generation
              </button>
            </div>
          )}

          {step === "preview" && (
            <>
              <button
                type="button"
                onClick={() => setStep("configure")}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleApplyToTrip}
                className="px-4 py-2 rounded-xl font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm flex items-center space-x-1.5 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>Apply to Timeline</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
