import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Mail, Phone, Users, AlertCircle } from "lucide-react";
import { bookingsApi } from "../api";

interface BookingData {
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  numberOfGuests: number;
}

interface BookingFormProps {
  propertyId: string;
  checkInDate: Date;
  checkOutDate: Date;
  pricePerNight: number;
  onSuccess?: () => void;
}

export const BookingForm: React.FC<BookingFormProps> = ({
  propertyId,
  checkInDate,
  checkOutDate,
  pricePerNight,
  onSuccess,
}) => {
  const { register, handleSubmit, formState: { errors }, reset } = useForm<BookingData>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const numberOfNights = Math.ceil(
    (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const totalPrice = numberOfNights * pricePerNight;

  const onSubmit = async (data: BookingData) => {
    setIsLoading(true);
    setError(null);

    try {
      const bookingData = {
        ...data,
        checkIn: checkInDate.toISOString().split("T")[0],
        checkOut: checkOutDate.toISOString().split("T")[0],
        totalPrice,
        numberOfGuests: parseInt(String(data.numberOfGuests)),
      };

      await bookingsApi.create(propertyId, bookingData);

      setSuccess(true);
      reset();

      if (onSuccess) {
        onSuccess();
      }

      setTimeout(() => {
        setSuccess(false);
      }, 5000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Booking failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-6">Complete Your Booking</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 text-sm font-medium">
            Booking created successfully! Check your email for confirmation.
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Guest Name
          </label>
          <input
            type="text"
            {...register("guestName", { required: "Name is required" })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="John Doe"
          />
          {errors.guestName && (
            <p className="text-red-500 text-sm mt-1">{errors.guestName.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Email
          </label>
          <input
            type="email"
            {...register("guestEmail", {
              required: "Email is required",
              pattern: {
                value: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,
                message: "Invalid email address",
              },
            })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="john@example.com"
          />
          {errors.guestEmail && (
            <p className="text-red-500 text-sm mt-1">{errors.guestEmail.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Phone
          </label>
          <input
            type="tel"
            {...register("guestPhone", { required: "Phone is required" })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="+1 (555) 000-0000"
          />
          {errors.guestPhone && (
            <p className="text-red-500 text-sm mt-1">{errors.guestPhone.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Number of Guests
          </label>
          <input
            type="number"
            {...register("numberOfGuests", {
              required: "Number of guests is required",
              min: { value: 1, message: "At least 1 guest required" },
            })}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="2"
            min="1"
          />
          {errors.numberOfGuests && (
            <p className="text-red-500 text-sm mt-1">{errors.numberOfGuests.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          {isLoading ? "Processing..." : "Continue to Payment"}
        </button>
      </form>

      <div className="border-t pt-6">
        <h3 className="font-semibold text-gray-900 mb-4">Booking Summary</h3>

        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between text-gray-600">
            <span>${pricePerNight} × {numberOfNights} nights</span>
            <span>${(pricePerNight * numberOfNights).toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-600">
            <span>Service Fee (10%)</span>
            <span>${(totalPrice * 0.1).toFixed(2)}</span>
          </div>
        </div>

        <div className="flex justify-between font-bold text-lg border-t pt-4">
          <span>Total</span>
          <span>${(totalPrice * 1.1).toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
};
