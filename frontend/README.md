# Rental Sync Frontend

React + TypeScript booking platform for vacation rentals with integrated calendar and payment processing.

## Features

- **Property Calendar** - Interactive calendar showing availability and booking status
- **Booking Form** - Guest information collection with validation
- **Authentication** - User login and signup with JWT tokens
- **Responsive Design** - Mobile-first design with Tailwind CSS
- **Real-time Updates** - React Query for data fetching and caching
- **State Management** - Zustand for auth state

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool with HMR
- **Tailwind CSS** - Styling
- **React Router** - Client-side routing
- **React Query** - Data fetching and caching
- **Zustand** - State management
- **React Hook Form** - Form handling

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

```bash
cd frontend
npm install
```

### Development

```bash
npm run dev
```

Opens at `http://localhost:5173` with hot reload.

### Build

```bash
npm run build
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── PropertyCalendar.tsx    # Interactive calendar
│   │   └── BookingForm.tsx          # Guest booking form
│   ├── store/
│   │   └── auth.ts                  # Zustand auth store
│   ├── api.ts                       # Axios API client
│   ├── App.tsx                      # Main app component
│   ├── main.tsx                     # Entry point
│   └── index.css                    # Global styles
├── index.html                       # HTML template
├── tailwind.config.js               # Tailwind config
├── postcss.config.js                # PostCSS config
├── vite.config.ts                   # Vite config
└── tsconfig.json                    # TypeScript config
```

## API Integration

The frontend communicates with the backend API at `http://localhost:3000`:

### Authentication
- `POST /auth/signup` - Register new user
- `POST /auth/login` - Login user
- `GET /auth/me` - Get current user

### Properties
- `GET /api/properties` - List user properties
- `GET /api/properties/:id` - Get property details
- `GET /api/properties/:id/calendar` - Get calendar availability

### Bookings
- `POST /api/properties/:id/bookings` - Create booking
- `GET /api/properties/:id/bookings` - List bookings

### AI
- `POST /api/ai/inquiries/analyze` - Analyze guest inquiry
- `GET /api/ai/inquiries/:id` - Get inquiry with analysis

## Environment Variables

```
VITE_API_URL=http://localhost:3000
```

## Components

### PropertyCalendar
Interactive calendar showing 180-day availability window.

**Features:**
- Display available/booked/blocked dates
- Date range selection
- Visual feedback for selected dates
- Responsive grid layout

### BookingForm
Guest information collection form.

**Features:**
- Guest name, email, phone
- Number of guests
- Booking summary with pricing
- Form validation with React Hook Form
- Success/error handling

## Authentication Flow

1. User signs up or logs in
2. JWT token stored in localStorage
3. Token automatically added to API requests
4. Unauthorized requests redirect to login
5. User can logout and clear token

## Styling

Uses Tailwind CSS with custom component classes:
- `px-4 py-2` - Padding
- `border border-gray-300` - Borders
- `rounded-lg` - Border radius
- `hover:bg-gray-100` - Hover states
- `disabled:bg-gray-400` - Disabled states

## Performance

- Code splitting via React Router
- Image optimization with Vite
- CSS purging with Tailwind
- Minification in production

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Future Enhancements

- Admin dashboard for property management
- Guest messaging system
- Review and rating system
- Payment integration with Stripe
- Multi-language support
- Dark mode

## License

MIT
