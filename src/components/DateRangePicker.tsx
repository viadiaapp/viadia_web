import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, X } from 'lucide-react';

interface DateRangePickerProps {
  initialStartDate?: string;
  initialEndDate?: string;
  onApply: (startDate: string, endDate: string) => void;
  onClose: () => void;
}

export default function DateRangePicker({
  initialStartDate = '',
  initialEndDate = '',
  onApply,
  onClose,
}: DateRangePickerProps) {
  const [startDate, setStartDate] = useState<string>(initialStartDate);
  const [endDate, setEndDate] = useState<string>(initialEndDate);
  
  // Display month state (defaults to start date month, or current month)
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (initialStartDate) {
      const parsed = new Date(initialStartDate + 'T00:00:00');
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  });

  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const displayYear = currentDate.getFullYear();
  const displayMonth = currentDate.getMonth(); // 0-indexed

  // Format date to YYYY-MM-DD
  const formatDateString = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Format date for display (e.g. "Wed, 19 Jan")
  const formatDisplayDate = (dateStr: string, placeholder: string) => {
    if (!dateStr) return placeholder;
    const date = new Date(dateStr + 'T00:00:00');
    if (isNaN(date.getTime())) return placeholder;
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  // Generate 42 days for the calendar grid starting on Monday
  const getCalendarDays = () => {
    const firstDayOfMonth = new Date(displayYear, displayMonth, 1);
    // getDay(): 0 is Sunday, 1 is Monday...
    // We want Monday as index 0, Tuesday 1 ... Sunday 6
    const firstDayIndex = (firstDayOfMonth.getDay() + 6) % 7;
    
    const days: Date[] = [];
    const gridStartDate = new Date(displayYear, displayMonth, 1 - firstDayIndex);
    
    for (let i = 0; i < 42; i++) {
      const day = new Date(gridStartDate);
      day.setDate(gridStartDate.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const handleDayClick = (dateStr: string) => {
    if (!startDate || (startDate && endDate)) {
      setStartDate(dateStr);
      setEndDate('');
    } else {
      if (dateStr < startDate) {
        setStartDate(dateStr);
      } else {
        setEndDate(dateStr);
      }
    }
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(displayYear, displayMonth - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(displayYear, displayMonth + 1, 1));
  };

  const isBetween = (dateStr: string) => {
    if (!startDate) return false;
    
    // If end date is defined
    if (endDate) {
      return dateStr > startDate && dateStr < endDate;
    }
    
    // Dynamic highlighting on hover if selecting the second date
    if (hoveredDate && hoveredDate > startDate) {
      return dateStr > startDate && dateStr < hoveredDate;
    }
    
    return false;
  };

  const isEndRange = (dateStr: string) => {
    if (endDate) return dateStr === endDate;
    if (hoveredDate && hoveredDate > startDate && !endDate) return dateStr === hoveredDate;
    return false;
  };

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const calendarDays = getCalendarDays();
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-xl w-full max-w-[280px] sm:max-w-[300px] overflow-hidden animate-in zoom-in-95 duration-150 text-left space-y-3">
      {/* Top Header display */}
      <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 pb-2">
        <h3 className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center space-x-1.5">
          <CalendarIcon className="h-3.5 w-3.5 text-indigo-500" />
          <span>Select Dates</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Range Information Display Tabs */}
      <div className="grid grid-cols-2 gap-1.5 bg-slate-50 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="text-center border-r border-slate-200 dark:border-slate-800 pr-1">
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">From</span>
          <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
            {formatDisplayDate(startDate, 'Start Date')}
          </p>
        </div>
        <div className="text-center pl-1">
          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">To</span>
          <p className="text-[10px] font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
            {formatDisplayDate(endDate, 'End Date')}
          </p>
        </div>
      </div>

      {/* Month Navigation Row */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={handlePrevMonth}
          className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-[11px] font-extrabold text-slate-800 dark:text-slate-200 tracking-tight">
          {monthName}
        </span>
        <button
          type="button"
          onClick={handleNextMonth}
          className="p-1 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Weekdays Row */}
      <div className="grid grid-cols-7 text-center text-[8px] font-bold text-slate-400 uppercase tracking-wider">
        {weekdays.map((day, dIdx) => (
          <div key={`weekday-${day}-${dIdx}`} className="py-0.5">{day}</div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-y-1 text-center">
        {calendarDays.map((day, idx) => {
          const dateStr = formatDateString(day);
          const isCurrentMonth = day.getMonth() === displayMonth;
          const isSelectedStart = dateStr === startDate;
          const isSelectedEnd = dateStr === endDate;
          const isHoverEnd = hoveredDate === dateStr && startDate && !endDate;
          const isBetweenRange = isBetween(dateStr);
          const isEnd = isEndRange(dateStr);
          
          return (
            <div
              key={`cal-day-${dateStr}-${idx}`}
              className={`relative py-0.5 flex items-center justify-center cursor-pointer select-none ${
                isBetweenRange
                  ? 'bg-indigo-50 dark:bg-indigo-950/20'
                  : ''
              } ${
                isSelectedStart
                  ? 'rounded-l-full bg-indigo-50/50 dark:bg-indigo-950/20'
                  : ''
              } ${
                isEnd
                  ? 'rounded-r-full bg-indigo-50/50 dark:bg-indigo-950/20'
                  : ''
              }`}
              onClick={() => handleDayClick(dateStr)}
              onMouseEnter={() => startDate && !endDate && setHoveredDate(dateStr)}
              onMouseLeave={() => setHoveredDate(null)}
            >
              <button
                type="button"
                className={`h-6 w-6 rounded-full text-[10px] font-semibold flex items-center justify-center transition-all ${
                  !isCurrentMonth
                    ? 'text-slate-350 dark:text-slate-650 font-normal hover:bg-slate-50 dark:hover:bg-slate-850'
                    : 'text-slate-700 dark:text-slate-300'
                } ${
                  isSelectedStart
                    ? '!bg-indigo-600 !text-white font-extrabold shadow-sm scale-105'
                    : ''
                } ${
                  isEnd
                    ? '!bg-indigo-600 !text-white font-extrabold shadow-sm scale-105'
                    : ''
                } ${
                  isCurrentMonth && !isSelectedStart && !isEnd && !isBetweenRange
                    ? 'hover:bg-slate-100 dark:hover:bg-slate-800'
                    : ''
                }`}
              >
                {day.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex justify-end space-x-1.5 pt-2 border-t border-slate-100 dark:border-slate-800/60">
        <button
          type="button"
          onClick={onClose}
          className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-300 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!startDate || !endDate}
          onClick={() => {
            if (startDate && endDate) {
              onApply(startDate, endDate);
            }
          }}
          className={`font-bold px-3.5 py-1.5 rounded-lg text-[10px] transition shadow-xs ${
            startDate && endDate
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
          }`}
        >
          Apply Dates
        </button>
      </div>
    </div>
  );
}
