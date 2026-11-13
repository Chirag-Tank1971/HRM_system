# 💻 Arisotech HRMS — Frontend Client

Modern, responsive React 19 + TypeScript Single Page Application (SPA) for Enterprise Performance Reviews, Employee Self-Service (ESS), Calibration Matrix, Sales Champions Leaderboard, and Appraisal Management.

---

## 🛠️ Tech Stack

- **Framework:** React 19 with TypeScript 5.8
- **Build Tool:** Vite 6.x
- **Styling:** Tailwind CSS v4 (utility-first, responsive layouts, full light/dark themes)
- **Routing:** Modern HTML5 Path-based Routing (`/dashboard`, `/reviews`, `/appraisals`, `/sales_champs`, `/employees`, `/hierarchy`, `/pip`) via Browser History API
- **Motion & Animations:** Framer Motion (`framer-motion`)
- **Icons:** Lucide React (`lucide-react`)
- **State & Context:** React Context API (`AuthContext`, `ToastContext`, `ThemeContext`, `NotificationsContext`)
- **Data Visualization & Charts:** Recharts for bell curves, talent 9-box grids, score distributions, and executive KPIs
- **Data Exporting:** SheetJS (`xlsx`) & `papaparse` for Excel/CSV generation; `jspdf` & `html2canvas` for appraisal letters and Sales Champions PDF reports

---

## 📂 Frontend Directory Structure

```text
HRMS_frontend/
├── public/                         # Static assets (favicons, logos, badges)
├── src/
│   ├── main.tsx                    # React DOM root entry point
│   ├── App.tsx                     # Main application layout, view orchestrator & RBAC guards
│   ├── types.ts                    # TypeScript domain models, interfaces, and enums
│   ├── index.css                   # Global Tailwind CSS v4 stylesheet
│   ├── hooks/
│   │   ├── useUrlHashView.ts       # HTML5 clean pathname router hook (popstate sync)
│   │   └── useMasterData.ts        # Centralized master records caching hook
│   ├── context/
│   │   ├── AuthContext.tsx         # Authentication state, JWT handling, role switching
│   │   ├── ToastContext.tsx        # Toast notifications provider
│   │   ├── ThemeContext.tsx        # Light/Dark mode state
│   │   └── NotificationsContext.tsx# Real-time activity alerts and unread badges
│   ├── services/
│   │   └── api.ts                  # Centralized typed HTTP client with auto-JWT headers
│   ├── utils/
│   │   ├── salesChampsExport.ts    # PDF certificate & Excel export engine for sales champions
│   │   └── cn.ts                   # Tailwind class merge utility
│   └── components/
│       ├── LoginPage.tsx           # Modern enterprise login page with one-click personas
│       ├── Header.tsx              # Top navigation header with notifications bell and profile
│       ├── MobileNavDrawer.tsx     # Responsive mobile navigation drawer
│       ├── QuarterlyReviewView.tsx # 4-quarter review management & scoring modal
│       ├── AppraisalManagementView.tsx # Annual appraisal cohort calibration, letters & payouts
│       ├── SalesChampsView.tsx     # Sales champions leaderboard, metrics & target attainment
│       ├── SalesChampsReportModal.tsx # Incentive scheme scorecard editor & multi-format export
│       ├── NotificationsCenterView.tsx # Centralized activity feed with Show More/Hide toggles
│       ├── PerformanceImprovementPlansView.tsx # PIP tracking, milestones & check-ins
│       ├── ManagementDashboardView.tsx # Executive compensation & normalization analytics
│       ├── KraManagementView.tsx   # KRA template builder with 100% weightage validation
│       ├── EmployeeDirectory.tsx   # Employee profiles, search, filtering & hierarchy link
│       ├── DepartmentHierarchyView.tsx # Visual organizational tree and span-of-control
│       ├── AiPerformanceHub.tsx    # AI Narrative Synthesizer, 9-Box Matrix, Kudos, and PIPs
│       ├── BulkImportExportManager.tsx # Bulk CSV/Excel data import & template exporter
│       ├── AuditComplianceExplorer.tsx # Regulatory compliance & audit trail explorer
│       └── ReviewScoringModal.tsx  # Adaptive 2-step fast-flow and 4-step governance evaluation
├── index.html                      # HTML entry point with metadata tags
├── vite.config.ts                  # Vite build and proxy configuration
├── package.json
├── tsconfig.json
└── README.md
```

---

## ⚙️ Environment Variables Setup

Create a `.env` file in the root of the `HRMS_frontend/` directory:

```env
# Backend API Base URL
# For local development with backend on port 3000:
VITE_API_BASE_URL=http://localhost:3000

# For production on Vercel (pointing to live Render backend):
# VITE_API_BASE_URL=https://your-backend.onrender.com
```

---

## 🚀 Getting Started (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Vite Development Server
```bash
npm run dev
```

Open your browser at:
👉 **`http://localhost:5173`**

### 3. Build for Production
```bash
npm run build
```
The production-ready static assets will be output to the `dist/` directory.

### 4. Preview Production Build
```bash
npm run preview
```

---

## 🔐 Built-in Test Personas & Roles

You can sign in using any of the enterprise test personas directly from the login page:

| Role | User Name | Email | Default Password | Access Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Super Admin** | System Admin | `admin@company.com` | `password123` | Full org-wide access across all 8 cohorts |
| **HR Manager** | Frank HR Manager | `frank.mgr@company.com` | `password123` | Cohort calibrations, letters, imports & audit |
| **Reporting Manager** | Dave Eng Manager | `dave.mgr@company.com` | `password123` | Team 4-quarter reviews and recommendations |
| **Head of Department (HOD)** | Alice Engineering HOD | `alice.hod@company.com` | `password123` | Department budget pools, bell curve normalization |
| **Executive Management** | Executive Management | `executive@company.com` | `password123` | High-level analytics and organization insights |
| **Employee (ESS)** | Grace Engineer | `grace@company.com` | `password123` | Employee self-appraisals, letter acceptance & KRA milestones |

---

## ☁️ Deployment Guide (Vercel / Netlify / Cloudflare Pages)

1. **Framework Preset:** `Vite`
2. **Root Directory:** `HRMS_frontend` (or `./` if deployed from frontend repo)
3. **Build Command:** `npm run build`
4. **Output Directory:** `dist`
5. **Environment Variable:**
   - Add `VITE_API_BASE_URL` with your live Render backend API URL (e.g., `https://your-backend.onrender.com`).
6. **SPA Routing Configuration (`vercel.json`):**
   ```json
   {
     "rewrites": [
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```