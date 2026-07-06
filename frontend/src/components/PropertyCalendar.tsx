import React, { useState } from "react";
import { Calendar, AlertCircle, Loader } from "lucide-react";
import { format, addDays, isAfter, isBefore, startOfToday } from "date-fns";
import { calendarApi } from "../api";

interface CalendarSlot {
  date: string;
  status: "available" | "blocked" | "booked";
}

interface PropertyCalendarProps {
  propertyId: string;
  onSelectDates?: (checkIn: Date, checkOut: Date) => void;
}

export const PropertyCalendar: React.FC<PropertyCalendarProps> = ({
  propertyId,
  onSelectDates,
}) => {
  const [availability, setAvailability] = useState<CalendarSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCheckIn, setSelectedCheckIn] = useState<Date | null>(null);
  const [selectedCheckOut, setSelectedCheckOut] = useState<Date | null>(null);

  const today = startOfToday();
  const endDate = addDays(today, 180);

  const fetchAvailability = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await calendarApi.getAvailability(
        propertyId,
        format(today, "yyyy-MM-dd"),
        format(endDate, "yyyy-MM-dd")
      );
      setAvailability(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to load availability");
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchAvailability();
  }, [propertyId]);

  const handleDateClick = (date: Date) => {
    if (!selectedCheckIn) {
      setSelectedCheckIn(date);
    } else if (!selectedCheckOut && isAfter(date, selectedCheckIn)) {
      setSelectedCheckOut(date);
      if (onSelectDates) {
        onSelectDates(selectedCheckIn, date);
      }
    } else {
      setSelectedCheckIn(date);
      setSelectedCheckOut(null);
    }
  };

  const getSlotStatus = (date: Date): CalendarSlot | undefined => {
    const dateStr = format(date, "yyyy-MM-dd");
    return availability.find((slot) => slot.date === dateStr);
  };

  const renderCalendar = () => {
    const weeks = [];
    let currentDate = today;

    while (isBefore(currentDate, endDate)) {
      const week = [];
      for (let i = 0; i < 7; i++) {
        const slot = getSlotStatus(currentDate);
        const isSelected =
          (selectedCheckIn && format(currentDate, "yyyy-MM-dd") === format(selectedCheckIn, "yyyy-MM-dd")) ||
          (selectedCheckOut && format(currentDate, "yyyy-MM-dd") === format(selectedCheckOut, "yyyy-MM-dd"));

        week.push(
          <button
            key={format(currentDate, "yyyy-MM-dd")}
            onClick={() => handleDateClick(new Date(currentDate))}
            disabled={slot?.status !== "available"}
            className={`p-2 rounded text-sm font-medium transition-colors ${
              slot?.status === "available"
                ? "bg-green-100 text-green-900 hover:bg-green-200 cursor-pointer"
                : slot?.status === "booked"
                  ? "bg-red-100 text-red-900 cursor-not-allowed"
                  : "bg-gray-100 text-gray-900 cursor-not-allowed"
            } ${isSelected ? "ring-2 ring-blue-500" : ""}`}
          >
            {format(currentDate, "d")}
          </button>
        );
        currentDate = addDays(currentDate, 1);
      }
      weeks.push(week);
    }

    return weeks;
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-96">
        <Loader className="animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
        <div>
          <h3 className="font-semibold text-red-900">Error Loading Calendar</h3>
          <p className="text-red-700 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-gray-600" />
          <h2 className="text-xl font-semibold">Check Availability</h2>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-4">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="text-center font-semibold text-gray-600 text-sm py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {renderCalendar().flat().slice(0, 180)}
        </div>

        {selectedCheckIn && selectedCheckOut && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm font-medium text-gray-900">
              Selected: {format(selectedCheckIn, "MMM d, yyyy")} -{" "}
              {format(selectedCheckOut, "MMM d, yyyy")}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              {Math.ceil(
                (selectedCheckOut.getTime() - selectedCheckIn.getTime()) /
                  (1000 * 60 * 60 * 24)
              )}{" "}
              nights
            </p>
          </div>
        )}
      </div>

      <div className="p-4 bg-gray-50 text-sm text-gray-600">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 border border-green-200 rounded"></div>
            <span>Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 border border-red-200 rounded"></div>
            <span>Booked</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded"></div>
            <span>Blocked</span>
          </div>
        </div>
      </div>
    </div>
  );
};
