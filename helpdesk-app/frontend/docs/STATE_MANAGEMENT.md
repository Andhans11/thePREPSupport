# State management

The app uses **React built-in state** only: **Context** for shared state and **useState/useReducer** for local state. There is no Redux, Zustand, or other global store.

## Shared state (React Context)

Shared state lives in **context providers** in `src/contexts/`. They are composed in `App.tsx` in this order (outer → inner):

| Provider        | Role |
|-----------------|------|
| **AuthContext** | Current user (from Supabase Auth). Used for login/logout and user id. |
| **TenantContext** | List of tenants and current tenant id (persisted in `localStorage`). Used for multi-tenant switching. |
| **GmailContext** | Gmail connection/sync state. |
| **MasterDataContext** | Master data (statuses, categories, etc.) for the current tenant. |
| **TicketContext** | Tickets list, selected ticket, messages, filters (assignment view), and ticket CRUD + realtime. |

**Usage:** In any component under `App`, use the matching hook:

- `useAuth()` → user, loading, login, logout
- `useTenant()` → tenants, currentTenantId, setCurrentTenantId
- `useGmail()` (if present) → Gmail state
- `useMasterData()` → categories, statuses, etc.
- `useTicketContext()` or equivalent → tickets, selectTicket, fetchTickets, updateTicket, etc.

New shared state that must be used across many screens or above the page level should go into a **new or existing context** in `src/contexts/`.

## Local state (useState / useReducer)

- **Page-level state** (e.g. Planning calendar slots, Dashboard counts, Settings forms) stays in the **page component** with `useState` (and `useCallback`/`useMemo` where needed).
- **UI-only state** (modals, tabs, filters, drag state) also stays local to the component that owns it.
- **Derived data** is computed with `useMemo` from state or context to avoid unnecessary re-renders and dependency loops.

## Guidelines

1. **Avoid putting everything in context**  
   Only lift state to context when multiple unrelated components need it or when it must survive route changes (e.g. selected tenant, ticket list).

2. **Stable dependencies**  
   In `useEffect` and `useCallback`, avoid dependencies that are recreated every render (e.g. inline objects/arrays like `[].map(...)` or `weekDates`). Use primitive or stable references (e.g. `currentWeekStart` instead of a new `weekDates` array) to prevent infinite update loops.

3. **Server state**  
   Data from Supabase is either:
   - Fetched in context (e.g. tickets, master data) and exposed via context, or
   - Fetched in the page (e.g. planning slots, dashboard data) and kept in local `useState`, with refetch after mutations.

4. **Persistence**  
   Only a few things are persisted (e.g. `currentTenantId` in `localStorage`). The rest is in memory and refetched on load.

5. **Adding new shared state**  
   - Add a new file under `src/contexts/`, e.g. `XContext.tsx`.
   - Create context with `createContext`, a provider component that holds state with `useState`/`useReducer`, and a custom hook (e.g. `useX()`) that `useContext`s it.
   - Mount the provider in `App.tsx` at the right level (inside any context it depends on, e.g. `useTenant()`).

No plans to introduce Redux or Zustand unless the app outgrows this structure (e.g. very heavy cross-page state or complex workflows that benefit from a single store).
