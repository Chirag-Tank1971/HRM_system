# Arisotech HRMS — Master Plan

**Requirements · Features · Architecture · Implementation · Delivery · Go-to-market**

_Version 2.0 · 13 Nov 2026 · Status: draft for review_

> **How to read this document**
> - **Part A** explains the product, who it is for and what exists today.
> - **Part B** is the full requirement list, module by module: features, business rules, data model, APIs, screens, notifications, reports and acceptance criteria. Requirement IDs (for example `LV-07`) are used in tickets and tests.
> - **Part C** covers non-functional requirements (security, DPDP, performance, availability).
> - **Part D** is the technical architecture and how each piece is implemented in this codebase.
> - **Part E** is the delivery plan: phases, a sprint-by-sprint schedule, team and release process.
> - **Part F** is pricing, go-to-market, metrics and risks.
>
> **Priority tags:** **P0** = needed to sell, **P1** = strongly expected, **P2** = differentiator / later.
>
> **Statutory caution:** every Indian statutory figure in this document (PF, ESI, PT, LWF, TDS, gratuity, bonus, Labour Code wage rules, DPDP obligations) is a starting point. They change by notification and budget. All of them are stored as effective-dated configuration (section D.6) and **must be verified with a CA / payroll consultant / counsel before go-live**.

---

## Table of contents

- **Part A — Product**
  - A.1 Vision and positioning · A.2 Customers and personas · A.3 Current state · A.4 Product principles
- **Part B — Functional requirements**
  - B.0 Platform core · B.1 Organisation and Employee 360 · B.2 Leave · B.3 Attendance and shifts · B.4 Onboarding · B.5 Offboarding and F&F · B.6 Letters and documents · B.7 Payroll · B.8 Tax declarations · B.9 Expense and travel claims · B.10 Employee and manager self-service · B.11 Announcements and policies · B.12 HR helpdesk · B.13 Performance (existing) · B.14 Recruitment / ATS · B.15 Assets · B.16 Training · B.17 Reports and analytics · B.18 Integrations and public API · B.19 AI features · B.20 Mobile / PWA · B.21 Platform administration and billing
- **Part C — Non-functional requirements**
- **Part D — Architecture and implementation**
- **Part E — Delivery plan**
- **Part F — Business plan**
- **Appendices** — permission catalogue, statutory configuration schema, notification catalogue, glossary

---

# PART A — PRODUCT

## A.1 Vision and positioning

**Vision:** the HR platform Indian growing companies run their people operations on, from hiring to exit, with performance management that is fair and explainable.

**Tagline:** *Every rating comes with its reason.*

| | |
|---|---|
| **Category** | Cloud HRMS + payroll + performance management (SaaS, multi-tenant) |
| **Target segment** | Indian companies with 50–500 employees, often multi-location; IT services, manufacturing service networks, distribution, sales-heavy businesses |
| **Buyer** | Founder / CEO, HR Head, CFO / Finance Controller |
| **Users** | Employees, managers, HODs, HR team, payroll/finance team, management |
| **Main competitors** | Keka, greytHR, Zoho People, HROne, factoHR; Darwinbox at the upper end |
| **Wedge** | Deeper performance and appraisal management than any competitor in the SMB price band, combined with complete Indian core HR and payroll |

## A.2 Customers and personas

| Persona | Goals | Top tasks |
|---|---|---|
| **Employee** | Mark attendance quickly, apply leave, see payslip, know where reviews stand | Check-in from phone, leave apply, download payslip/Form 16, submit tax proofs, self-assessment |
| **Reporting manager** | Approve quickly, see team status, rate fairly | Approvals inbox, team calendar, attendance exceptions, KRA scoring with reasons |
| **HOD** | Department health, calibrate ratings, control budget | Department dashboards, review approval, bell curve, increment budget |
| **HR executive** | Keep records accurate, run processes on time | Onboarding, letters, leave and attendance corrections, helpdesk |
| **HR head** | Policy, compliance, talent decisions | Policies, workflows, reports, appraisal cycles, attrition analysis |
| **Payroll admin / Finance** | Correct, on-time payroll and compliance filings | Payroll run, statutory files, bank transfer, accounting export |
| **Management / CXO** | Headcount, cost, performance overview | Executive dashboards, cost and attrition trends |
| **Company admin** | Configure the system for the company | Settings, roles and permissions, integrations, billing |
| **Platform admin (Arisotech)** | Operate the SaaS | Tenant provisioning, plans, support access, monitoring |

## A.3 Current state (as of Nov 2026)

### Stack
- **Frontend:** React 19, Vite 6, TypeScript, Tailwind CSS 4, deployed on Vercel (`HRMS_frontend`).
- **Backend:** Node.js, Express 4, TypeScript, Zod validation, node-cron scheduler, Resend email, Gemini AI, bundled with esbuild, deployed on Render (`HRMS_backend`).
- **Database:** MongoDB Atlas via the native driver, accessed through `getDbCollection()` in `server/db.ts` (about 420 call sites), with an in-memory fallback for local development.

### Modules already built
| Area | What exists |
|---|---|
| Auth | JWT access + refresh tokens, roles (SUPER_ADMIN, HR, MANAGER, HOD, MANAGEMENT, EMPLOYEE), forced password change, demo persona switcher |
| Org masters | Employees, departments, designations, locations, review cycles, reporting manager and HOD hierarchy |
| Performance | KRA library and templates, per-employee scorecards, quarterly reviews (self → manager → HOD → HR) with reasons, review returns, PIPs with milestones, annual appraisals, bell curve, department budgets, 9-box talent matrix, appraisal and review letters, sales achievement & incentive plans |
| Data | Bulk import/export for employees and KRAs (Excel/CSV), reports, dashboards per role |
| Platform | Audit log, email log, in-app notifications, AI narratives |

### Gaps that block a sale
1. **No multi-tenancy** — one database for one company only.
2. **Security findings open:** HR can grant SUPER_ADMIN; manager authorisation matches by name; access tokens are not revocable; rate limiting trusts a spoofable header; demo password is in the public build.
3. **Salary data** visible to every HR/admin user.
4. **No leave, attendance or payroll** — the three things every buyer evaluates first.
5. **No 2FA, documented backups or DPDP posture.**

## A.4 Product principles

1. **Tenant-safe by default.** Tenant scoping is automatic; forgetting it must be impossible, not merely discouraged.
2. **Rules are data.** Every policy (leave, shift, statutory rate, approval chain) is configuration with effective dates.
3. **Money is reproducible.** Every payroll output can be re-derived from stored inputs and rule versions.
4. **Explainable decisions.** Ratings, LOP days, deductions and tax are shown with how they were calculated.
5. **Mobile-first for employees, keyboard-and-bulk-first for HR.**
6. **One approvals inbox.** All workflows share one engine and one inbox.
7. **Ship thin, then deepen.** Each module gets a sellable MVP, then grows with design-partner feedback.

---

# PART B — FUNCTIONAL REQUIREMENTS

Each module lists: **features** (with ID and priority), **business rules**, **data model**, **API**, **screens**, **notifications**, **reports** and **acceptance criteria**. All collections carry `tenantId`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`; these are omitted below for brevity.

---

## B.0 Platform core

### B.0.1 Multi-tenancy

| ID | Requirement | Priority |
|---|---|---|
| PL-01 | Each customer company is a **tenant** with fully isolated data | P0 |
| PL-02 | Tenant identified at login by **subdomain** (`acme.arisotech.in`) or **company code** field; both supported, subdomain preferred | P0 |
| PL-03 | Tenant settings: legal name, logo, fiscal year start (default April), timezone (default Asia/Kolkata), currency (INR), week start, date format, modules enabled | P0 |
| PL-04 | Multiple **legal entities** under one tenant (group companies), each with its own PAN, TAN, PF/ESI codes, PT registrations and payroll | P1 |
| PL-05 | Branding: logo, primary colour, email sender name | P1 |
| PL-06 | Tenant data export (full JSON/Excel) and tenant deletion with a retention window | P0 (DPDP) |

**Data model**
- `tenants`: `id, slug, name, status (TRIAL|ACTIVE|SUSPENDED|CANCELLED), plan, seats, trialEndsAt, settings{fiscalYearStartMonth, timezone, currency, weekStart, dateFormat, modules[]}, branding{logoUrl, primaryColor}`
- `legal_entities`: `id, tenantId, name, pan, tan, cin, gstin, pfEstablishmentCode, esiCode, ptRegistrations[{state, number}], lwfRegistrations[], address, signatory{name, designation, signatureFileId}`

**Acceptance:** two tenants with the same employee codes and emails can be created; no API call made by tenant A can read, change or count tenant B's data (automated test suite, section D.3).

### B.0.2 Authentication and account security

| ID | Requirement | Priority |
|---|---|---|
| AU-01 | Login with email or employee code + password, per tenant | P0 (exists, add tenant) |
| AU-02 | Password policy (length ≥ 10, breached-password check, history of 5), forced change on first login | P0 |
| AU-03 | Self-service password reset by email link, 30-minute expiry, single use | P0 |
| AU-04 | **2FA (TOTP)** mandatory for admin, HR and payroll roles; optional for others; recovery codes | P0 |
| AU-05 | Account lockout per account (10 failures → 15-minute lock) in addition to per-IP limits | P0 |
| AU-06 | Access token carries `tokenVersion`, `type`, `tid` (tenant); logout-all and password change revoke all sessions | P0 |
| AU-07 | Active sessions list with device, IP, last seen; revoke one session | P1 |
| AU-08 | **SSO**: Google Workspace and Microsoft Entra ID (OIDC) | P1 |
| AU-09 | SAML 2.0 SSO, IP allow-list per tenant | P2 |
| AU-10 | OTP login over mobile/WhatsApp for blue-collar staff without email | P1 |

### B.0.3 Roles, permissions and data scopes

| ID | Requirement | Priority |
|---|---|---|
| RB-01 | Permission-based access: roles are bundles of permissions (catalogue in Appendix 1) | P0 |
| RB-02 | System role templates: Company Admin, HR Manager, HR Executive, Payroll Admin, Finance, Manager, HOD, Management, Employee | P0 |
| RB-03 | Tenants can clone and edit roles; system templates are read-only | P1 |
| RB-04 | **Data scopes** per permission: `SELF`, `DIRECT_REPORTS`, `ALL_REPORTS` (recursive), `DEPARTMENT`, `LOCATION`, `LEGAL_ENTITY`, `ALL` | P0 |
| RB-05 | **Field-level protection**: salary, bank, PAN, Aadhaar, medical fields removed from responses without the matching permission | P0 |
| RB-06 | A user can hold several roles; effective permissions are the union | P0 |
| RB-07 | Privilege rules: only Company Admin grants Company Admin/HR/Payroll roles; nobody edits their own roles | P0 |
| RB-08 | Delegation: a manager on leave delegates approvals for a date range | P1 |

### B.0.4 Workflow and approvals engine

Used by leave, regularisation, claims, profile changes, onboarding tasks, resignations, requisitions, helpdesk escalations and payroll approval.

| ID | Requirement | Priority |
|---|---|---|
| WF-01 | Configurable approval chains per request type: steps of `REPORTING_MANAGER`, `HOD`, `HR`, `SPECIFIC_USER`, `ROLE`, `SKIP_LEVEL_MANAGER` | P0 |
| WF-02 | Conditions on steps (for example amount > ₹10,000 adds Finance; leave > 5 days adds HOD) | P0 |
| WF-03 | Actions: approve, reject (reason required), send back, cancel by requester, withdraw approved request (needs re-approval) | P0 |
| WF-04 | Auto-escalation after N hours; auto-approve on SLA expiry where the policy allows | P1 |
| WF-05 | **Unified approvals inbox** with bulk approve and filters | P0 |
| WF-06 | Full history per request (who, when, action, comment) | P0 |
| WF-07 | Approve/reject from email and WhatsApp with signed one-time links | P1 |

**Data model**
- `workflow_definitions`: `id, requestType, name, conditions[], steps[{order, approverType, approverRef, condition, slaHours, escalateTo}], active, version`
- `workflow_instances`: `id, requestType, requestId, requesterId, definitionId, definitionVersion, status (PENDING|APPROVED|REJECTED|CANCELLED|SENT_BACK), currentStep, steps[{order, approverIds[], status, actedBy, actedAt, comment}]`

### B.0.5 Notifications engine

| ID | Requirement | Priority |
|---|---|---|
| NT-01 | Channels: in-app, email, WhatsApp, web push (PWA) | P0 (in-app, email), P1 (WhatsApp, push) |
| NT-02 | Template per event and channel, editable per tenant, with merge fields | P1 |
| NT-03 | User preferences per event category (cannot opt out of mandatory ones) | P1 |
| NT-04 | Digest emails (daily pending approvals for managers) | P1 |
| NT-05 | Delivery log with status, retry with backoff | P0 (email log exists) |
| NT-06 | Birthday and work-anniversary posts and alerts | P1 |

Event catalogue: Appendix 3.

### B.0.6 Files and documents storage

| ID | Requirement | Priority |
|---|---|---|
| FS-01 | Files stored in S3-compatible object storage (Cloudflare R2 or AWS S3, Mumbai region preferred) | P0 |
| FS-02 | Access only through short-lived signed URLs checked against permissions | P0 |
| FS-03 | Limits: 10 MB per file; allowed types PDF, JPG, PNG, DOCX, XLSX | P0 |
| FS-04 | Virus scan on upload (ClamAV or provider scanning) | P1 |
| FS-05 | Generated PDFs (letters, payslips) stored and versioned | P0 |

`files`: `id, ownerType, ownerId, category, fileName, mimeType, size, storageKey, checksum, uploadedBy, scanStatus`

### B.0.7 Audit trail
| ID | Requirement | Priority |
|---|---|---|
| AT-01 | Every create/update/delete stores actor, time, IP, entity, before/after diff | P0 (extend existing) |
| AT-02 | Sensitive-field reads (salary, bank, Aadhaar) logged | P1 |
| AT-03 | Audit explorer with filters and export; retention 7 years for payroll, configurable for others | P0 |

### B.0.8 Settings and masters
Company settings, legal entities, locations (with address, state for PT, geo-coordinates and radius), departments, designations, grades/bands, cost centres, employment types, holiday calendars, document types, custom fields on employee profile (text, number, date, dropdown).

---

## B.1 Organisation and Employee 360

### Features
| ID | Requirement | Priority |
|---|---|---|
| EM-01 | Employee profile tabs: Personal, Job, Compensation, Statutory, Bank, Family and emergency, Documents, Assets, Timeline | P0 |
| EM-02 | Personal: legal name, preferred name, DOB, gender, marital status, blood group, nationality, personal email/phone, current and permanent address, photo | P0 |
| EM-03 | Job: employee code (auto-numbering per tenant/entity), legal entity, department, designation, grade, location, employment type, reporting manager(s), HOD, joining date, probation end, confirmation date, notice period, work shift, cost centre | P0 |
| EM-04 | Statutory: PAN, Aadhaar (stored encrypted, shown masked), UAN, PF number, ESIC IP number, previous employment PF details | P0 |
| EM-05 | Bank: account number (encrypted), IFSC with lookup, bank name, branch, account holder; changes need HR approval and verification | P0 |
| EM-06 | Family and nominees (PF/gratuity nominees with share %), emergency contacts | P0 |
| EM-07 | Education and previous employment history | P1 |
| EM-08 | Documents with type, number, issue/expiry date, verification status; **expiry reminders** 30/15/7 days before to employee and HR | P0 |
| EM-09 | Employee-initiated profile change requests through the workflow engine | P0 |
| EM-10 | Effective-dated job history: transfers, promotions, re-designations, manager changes, each with effective date and reason | P0 |
| EM-11 | Interactive **org chart** (zoom, search, expand), department view, export as image/PDF | P0 |
| EM-12 | Employee directory with search and filters; privacy controls on phone/email visibility | P0 (exists, extend) |
| EM-13 | Custom fields defined by the tenant | P1 |
| EM-14 | Bulk import/update for every profile section (extend existing bulk module) | P0 |
| EM-15 | Probation tracking: reminder to manager before probation end; confirm, extend or terminate workflow | P1 |

### Business rules
- Employee code unique within tenant. Email unique within tenant.
- Changing manager, department, designation, location, grade or salary always creates a `job_history` record; the employee record holds the current snapshot.
- Aadhaar never shown in full after save; only last 4 digits unless the user has `employee.statutory.reveal` (logged).
- Rehire creates a new employment record linked to the same person.

### Data model
- `employees` (extend existing): add `legalEntityId, gradeId, costCentreId, shiftPolicyId, attendancePolicyId, leavePolicyId, payGroupId, probationEndDate, noticePeriodDays, personal{...}, statutory{panEnc, aadhaarEnc, aadhaarLast4, uan, pfNumber, esicNumber}, bank{accountEnc, accountLast4, ifsc, bankName, branch, holderName, verified}, customFields{}`
- `employee_family`: `employeeId, name, relation, dob, isNominee, nomineeFor[], sharePercent, phone, isEmergencyContact`
- `job_history`: `employeeId, effectiveFrom, changeType (JOIN|TRANSFER|PROMOTION|REDESIGNATION|MANAGER_CHANGE|SALARY_REVISION|CONFIRMATION|EXIT), before{}, after{}, reason, approvedBy`
- `employee_documents`: `employeeId, documentTypeId, number, issueDate, expiryDate, fileId, verificationStatus, verifiedBy`
- `profile_change_requests`: `employeeId, section, changes{}, status, workflowInstanceId`

### API (all under `/api/v1`)
`GET/POST /employees`, `GET/PATCH /employees/:id`, `GET /employees/:id/history`, `POST /employees/:id/job-changes`, `GET/POST /employees/:id/documents`, `GET/POST /employees/:id/family`, `POST /employees/:id/profile-change-requests`, `GET /org-chart?root=&depth=`, `GET /directory`

### Screens
Employee list · Employee profile (tabbed) · Add employee wizard · Job change dialog · Org chart · Directory · Document expiry dashboard · Profile change approvals.

### Reports
Headcount by department/location/entity/grade · Joiners and leavers · Document expiry · Missing statutory details (PAN/UAN/bank) · Probation due.

### Acceptance criteria
- A transfer with a future effective date updates the employee's department only on that date (scheduler) and appears immediately in history.
- A user without `salary.read` receives no compensation fields in any employee API response (tested on every endpoint returning employees).

---

## B.2 Leave management

### Features
| ID | Requirement | Priority |
|---|---|---|
| LV-01 | Leave types per tenant: CL, SL, PL/EL, LOP, Comp-off, Maternity, Paternity, Bereavement, Marriage, Optional holiday, custom | P0 |
| LV-02 | Per type: paid/unpaid, unit (day/half-day/hour), min/max per request, max consecutive, advance notice days, backdated allowed (days), document required after N days, gender/marital/probation/employment-type eligibility | P0 |
| LV-03 | **Leave policies** combine leave types with entitlements and are assigned by legal entity / location / grade / employment type / individual | P0 |
| LV-04 | **Accrual engine**: yearly upfront, monthly, quarterly; pro-rata for joiners and leavers; accrual based on days worked (for example 1 PL per 20 days worked) | P0 |
| LV-05 | **Year end**: carry forward with cap, encashment with cap, lapse; runs by fiscal or calendar year as configured | P0 |
| LV-06 | **Sandwich rule** (weekends/holidays between leave days counted or not), per leave type | P0 |
| LV-07 | Apply, cancel, withdraw; half-day first/second half; attach documents | P0 |
| LV-08 | Approval through the workflow engine (default: reporting manager) | P0 |
| LV-09 | **Holiday calendars** per location/entity, optional holidays with selection limit | P0 |
| LV-10 | Comp-off credited from approved work on a holiday/weekly-off, with expiry | P0 |
| LV-11 | Team leave calendar, overlap warning when more than N% of the team is off | P1 |
| LV-12 | HR adjustments (credit/debit with reason), bulk opening balance import | P0 |
| LV-13 | Leave balance ledger for full traceability | P0 |
| LV-14 | LOP days and encashment feed into payroll | P0 |
| LV-15 | Short leave / permission hours (for example 2 hours, twice a month) | P1 |
| LV-16 | Maternity per Maternity Benefit Act defaults (26 weeks for first two children; verify) | P1 |

### Business rules
- Balance check at apply time includes pending requests (`available = balance − pending`).
- Negative balance allowed only if the type permits it, up to a limit; excess becomes LOP.
- Cancelling approved leave in a locked payroll month creates an adjustment for next month instead of changing the locked month.
- Leave on a holiday or weekly-off is not deducted unless the sandwich rule applies.

### Data model
- `leave_types`: `id, code, name, paid, unit, color, rules{minDays, maxDays, maxConsecutive, noticeDays, backdatedDays, docAfterDays, allowNegative, negativeLimit, sandwich, eligibility{}}`
- `leave_policies`: `id, name, assignment{entityIds, locationIds, gradeIds, employmentTypes}, entitlements[{leaveTypeId, annualQuota, accrual{frequency, basis, proRata}, carryForward{enabled, max}, encashment{enabled, max}, lapse}]`
- `leave_requests`: `id, employeeId, leaveTypeId, from, to, fromHalf, toHalf, days, reason, attachments[], status, workflowInstanceId`
- `leave_ledger`: `id, employeeId, leaveTypeId, date, type (OPENING|ACCRUAL|AVAILED|CANCELLED|ADJUSTMENT|CARRY_FORWARD|LAPSE|ENCASHED|COMP_OFF_CREDIT|COMP_OFF_EXPIRY), quantity (+/−), refType, refId, note`
- `holiday_calendars`: `id, name, year, locationIds[], holidays[{date, name, optional}]`

### API
`GET /leave/types`, `GET /leave/balances?employeeId=`, `POST /leave/requests`, `GET /leave/requests?scope=`, `POST /leave/requests/:id/cancel`, `GET /leave/calendar?team=`, `POST /leave/adjustments`, `POST /leave/year-end/run`, `GET/POST /holiday-calendars`

### Screens
Apply leave (with live balance and day calculation) · My leaves · Team calendar · Approvals inbox · Leave policies editor · Holiday calendar editor · Year-end processing wizard · Balance adjustments.

### Reports
Leave balances · Leave availed by type/department · LOP summary · Encashment liability · Absenteeism trend.

### Acceptance criteria
- A joiner on 15 Aug with 12 CL/year accrued monthly gets the correct pro-rata balance each month; the ledger explains every number.
- Year-end run on a test tenant produces carry-forward, encashment and lapse rows that reconcile to closing balances.

---

## B.3 Attendance and shifts

### Features
| ID | Requirement | Priority |
|---|---|---|
| AT-01 | **Shifts**: start/end, break, flexible window, night shift across midnight, minimum hours for full/half day | P0 |
| AT-02 | **Weekly-off patterns** (Sunday; alternate Saturdays; 2nd/4th Saturday; rotational) | P0 |
| AT-03 | **Shift roster**: assign shifts per employee per day; rotation templates; bulk upload | P1 |
| AT-04 | **Web check-in/out** with IP restriction option | P0 |
| AT-05 | **Mobile (PWA) check-in/out** with GPS **geo-fencing** per location (radius) and optional **selfie** | P0 |
| AT-06 | Remote/field work: check-in allowed outside geo-fence with reason; field visit log with locations | P1 |
| AT-07 | **Biometric/device integration**: CSV import first; then API push from devices (eSSL, ZKTeco, Matrix) through a small connector | P0 (CSV), P1 (connector) |
| AT-08 | **Attendance rules**: grace minutes, late-mark, early-going, N lates = half-day/LOP, minimum hours, overtime start after X hours, OT on holidays/weekly-offs | P0 |
| AT-09 | **Daily status engine** computes per employee per day: Present, Absent, Half-day, Leave, Holiday, Weekly-off, WFH, On-duty, plus late/early/OT minutes | P0 |
| AT-10 | **Regularisation** requests (missed punch, wrong time) through workflow, with monthly limit | P0 |
| AT-11 | **On-duty / WFH** requests | P0 |
| AT-12 | **Overtime** requests and approval; payable OT hours feed payroll | P1 |
| AT-13 | **Monthly attendance lock** per pay group; after lock changes go as arrears/adjustments | P0 |
| AT-14 | Manager team view: who is in, late, absent today | P0 |
| AT-15 | Comp-off eligibility from work on holiday/weekly-off | P0 |

### Business rules
- Night shift attendance belongs to the shift's start date.
- First-in and last-out are used by default; configurable to sum all in/out pairs.
- Absent with no leave applied by the lock date becomes LOP (configurable auto-LOP).
- Geo-fence check uses the location's coordinates and radius; GPS accuracy worse than the radius is flagged, not blocked (configurable).
- Selfies are stored as files with retention of 90 days (DPDP minimisation), configurable.

### Data model
- `shifts`: `id, name, start, end, breakMinutes, flexibleMinutes, crossesMidnight, fullDayMinutes, halfDayMinutes`
- `attendance_policies`: `id, name, graceMinutes, lateMarkRule{countForHalfDay, action}, earlyGoingRule{}, overtime{enabled, afterMinutes, holidayMultiplier}, regularisation{monthlyLimit, backdatedDays}, punchSources[] (WEB|MOBILE|DEVICE), geoFenceRequired, selfieRequired, ipAllowList[]`
- `shift_assignments`: `employeeId, date, shiftId` (or rotation reference)
- `punches`: `id, employeeId, timestamp, source, deviceId, lat, lng, accuracy, insideFence, selfieFileId, ip`
- `attendance_days`: `employeeId, date, shiftId, firstIn, lastOut, workedMinutes, status, lateMinutes, earlyMinutes, otMinutes, leaveRequestId, regularised, locked`
- `attendance_requests`: `id, employeeId, type (REGULARISATION|ON_DUTY|WFH|OVERTIME), date(s), details, status, workflowInstanceId`
- `attendance_periods`: `payGroupId, month, status (OPEN|LOCKED), lockedAt, lockedBy`

### API
`POST /attendance/punch`, `GET /attendance/today`, `GET /attendance/days?employeeId=&month=`, `POST /attendance/requests`, `GET /attendance/team?date=`, `POST /attendance/import` (device CSV), `POST /attendance/periods/:id/lock`, `GET/POST /shifts`, `GET/POST /attendance-policies`, `POST /shift-assignments/bulk`

### Screens
Check-in widget (home and PWA) · My attendance calendar · Regularisation/OD/WFH request · Team attendance board · Muster roll (HR) · Shift and roster planner · Policy editors · Device import · Monthly lock.

### Reports
Muster roll · Daily attendance · Late-coming · Overtime · Absenteeism · Punch exceptions (missing out-punch) · Geo-fence violations.

### Acceptance criteria
- An employee punching at 09:47 for a 09:30 shift with 15-minute grace gets 2 late minutes and a late mark; the third late mark in the month converts to half-day when the policy says so.
- A night shift 22:00–06:00 is computed on the start date with correct worked minutes.
- After lock, a regularisation for that month produces an adjustment entry for the next payroll, not a change to the locked month.

---

## B.4 Onboarding

| ID | Requirement | Priority |
|---|---|---|
| ON-01 | Candidate → pre-joiner record created from offer (manual or ATS) | P0 |
| ON-02 | **Pre-joining portal** (magic link): personal details, documents (ID, address, education, experience, relieving letter, photo), bank, nominee forms | P0 |
| ON-03 | **Onboarding checklist templates** by department/role/location with tasks for HR, IT, admin, manager and joiner; due dates relative to joining date | P0 |
| ON-04 | Task tracking with owners, reminders and completion status | P0 |
| ON-05 | Offer letter and appointment letter generation (B.6) with e-acceptance | P0 |
| ON-06 | Day-one conversion: pre-joiner → employee, login created, leave/attendance/payroll policies attached | P0 |
| ON-07 | Asset allocation tasks linked to the asset register (B.15) | P1 |
| ON-08 | Welcome email, buddy assignment, first-week plan | P1 |
| ON-09 | Background verification status tracking (third-party BGV integration later) | P2 |

Data: `prejoiners`, `onboarding_templates{tasks[{title, ownerType, dueOffsetDays, mandatory}]}`, `onboarding_instances{employeeId, tasks[{status, assigneeId, completedAt}]}`.

Acceptance: a joiner's checklist is created automatically on offer acceptance; overdue tasks notify owners daily.

---

## B.5 Offboarding and full & final (F&F)

| ID | Requirement | Priority |
|---|---|---|
| OF-01 | Resignation submission by employee with reason and proposed last day; workflow to manager and HR | P0 |
| OF-02 | Notice period calculation from policy; early release / buyout; HR-initiated termination and absconding cases | P0 |
| OF-03 | **Exit clearance** checklist by department (IT assets, admin, finance dues, manager handover) | P0 |
| OF-04 | Exit interview form; responses feed attrition analytics | P1 |
| OF-05 | **F&F settlement** (computed in payroll, B.7.8): salary till last day, leave encashment, notice pay recovery/payout, gratuity, bonus, reimbursements, loan recovery, deductions | P0 |
| OF-06 | Relieving letter and experience letter generation | P0 |
| OF-07 | Access deactivation on last working day (scheduler), data retained per retention policy | P0 |
| OF-08 | Retention of exited employee self-service access for payslips/Form 16 for 12 months (configurable) | P1 |

Data: `separations{employeeId, type (RESIGNATION|TERMINATION|RETIREMENT|ABSCONDING|DEATH), requestedOn, lastWorkingDay, noticeDays, shortfallDays, reason, status, workflowInstanceId}`, `clearance_items`, `exit_interviews`.

Acceptance: approving a resignation sets the last working day, creates clearance tasks, and on that date deactivates login and queues F&F.

---

## B.6 Letters and document generation

| ID | Requirement | Priority |
|---|---|---|
| LT-01 | Letter templates with rich-text editor and merge fields (`{{employee.name}}`, `{{salary.ctcAnnual}}`, …) | P0 |
| LT-02 | Built-in templates: offer, appointment, confirmation, probation extension, increment, promotion, transfer, warning, relieving, experience, address proof, salary certificate, NOC | P0 |
| LT-03 | Company letterhead, digital signature image of authorised signatory, QR code for verification | P0 |
| LT-04 | Generate single or bulk (for example increment letters for the whole appraisal cohort, extending the existing appraisal letters) | P0 |
| LT-05 | Release to employee with e-acknowledgement and timestamp | P0 |
| LT-06 | Employee self-service requests for certificates (salary/address proof) with HR approval and auto-generation | P1 |
| LT-07 | Aadhaar e-sign / DSC integration | P2 |

Implementation: server-side HTML templates rendered to PDF (headless Chromium via Playwright, or a PDF service); stored in `files`; letter record in `letters{employeeId, templateId, version, fileId, status, acknowledgedAt}`.

---

## B.7 Payroll (India)

### B.7.1 Pay groups and calendar
| ID | Requirement | Priority |
|---|---|---|
| PY-01 | Pay groups per legal entity (for example monthly staff, workers), each with a pay cycle (monthly; attendance cut-off date) | P0 |
| PY-02 | Payroll calendar: attendance cut-off, input lock, processing, approval, pay date | P0 |

### B.7.2 Salary components and structures
| ID | Requirement | Priority |
|---|---|---|
| PY-03 | Component master: Basic, DA, HRA, Special allowance, Conveyance, LTA, Medical, Children education, Bonus, Overtime, Incentive, Arrears; deductions: PF, VPF, ESI, PT, LWF, TDS, loan EMI, advances, other | P0 |
| PY-04 | Per component: type (earning/deduction/employer contribution/reimbursement), fixed/variable, calculation (fixed amount, % of CTC, % of another component, formula, slab), taxable/exempt rule, PF/ESI/PT/LWF/gratuity/bonus wage inclusion flags, pro-rated by paid days or not, payslip display order | P0 |
| PY-05 | **Salary structure templates** per grade (for example Basic 50% of CTC, HRA 50% of Basic for metro / 40% non-metro, rest Special) | P0 |
| PY-06 | **CTC → monthly breakup calculator** with employer PF/ESI/gratuity inside or outside CTC | P0 |
| PY-07 | **Labour Code wage check**: warn when excluded allowances exceed 50% of total remuneration (verify current rule) | P0 |
| PY-08 | Effective-dated salary assignment per employee; revision creates history and triggers arrears | P0 |
| PY-09 | Appraisal integration: approved increments from the existing appraisal module create salary revisions with effective dates | P0 |

### B.7.3 Statutory engine (configuration, effective-dated)
| ID | Requirement | Priority |
|---|---|---|
| ST-01 | **PF**: employee 12% and employer 12% of PF wages; wage ceiling (₹15,000 at time of writing) with option to contribute on actual; EPS 8.33% within ceiling, EPF balance; EDLI and admin charges; VPF; international worker flag; ECR file generation | P0 |
| ST-02 | **ESI**: eligibility by gross wage threshold (₹21,000 at time of writing; ₹25,000 for persons with disability); employee 0.75%, employer 3.25%; contribution periods Apr–Sep and Oct–Mar (eligibility continues for the period); monthly return file | P0 |
| ST-03 | **Professional Tax**: state-wise slabs by gross salary, gender and month (for example Maharashtra February special amount), registration per state; annual cap | P0 |
| ST-04 | **Labour Welfare Fund**: state-wise employee/employer amounts and frequency | P1 |
| ST-05 | **TDS on salary**: new regime (default) and old regime; slabs, standard deduction, rebate, surcharge, cess; projection of annual income; HRA exemption calculation; Chapter VI-A deductions under old regime; previous employer income; perquisites; monthly TDS = remaining tax ÷ remaining months | P0 |
| ST-06 | **Gratuity**: provision monthly; payout = 15/26 × last drawn wages × completed years (eligibility rules, including fixed-term changes under the Labour Codes), statutory cap | P0 |
| ST-07 | **Statutory bonus**: eligibility and 8.33%–20% computation, calculation ceilings | P1 |
| ST-08 | **Minimum wages** check per state/skill category (warning) | P1 |

All rates live in `statutory_rules` (Appendix 2) with `effectiveFrom`, so a budget change is a configuration update plus regression tests.

### B.7.4 Payroll inputs
| ID | Requirement | Priority |
|---|---|---|
| PY-10 | Attendance and LOP days from the locked attendance period; leave encashment from leave | P0 |
| PY-11 | One-time earnings/deductions (incentives, bonus, recoveries) by upload or entry | P0 |
| PY-12 | Overtime hours × rate from approved OT | P1 |
| PY-13 | Reimbursements from approved claims (B.9) | P0 |
| PY-14 | **Loans and advances**: sanction, EMI schedule, interest (perquisite valuation for interest-free loans above limits), pre-closure, skip EMI | P0 |
| PY-15 | Salary hold / release; stop payment for exits | P0 |
| PY-16 | New joiners and leavers mid-month pro-rated | P0 |
| PY-17 | **Arrears** for back-dated revisions or attendance corrections, computed per month affected | P0 |

### B.7.5 Payroll run
| ID | Requirement | Priority |
|---|---|---|
| PY-18 | Run per pay group per month: **Draft → Calculated → Reviewed → Approved → Finalised → Paid** | P0 |
| PY-19 | Pre-run validations: missing bank details, missing PAN (higher TDS), negative net pay, ESI/PF eligibility changes, unlocked attendance | P0 |
| PY-20 | **Variance report** vs previous month per employee and component, with threshold highlighting | P0 |
| PY-21 | Maker-checker approval (person who runs cannot approve) | P0 |
| PY-22 | Re-run with versioning; finalised runs immutable; corrections via off-cycle run or next-month arrears | P0 |
| PY-23 | **Off-cycle runs** for F&F, bonus, corrections | P1 |
| PY-24 | Per-employee calculation explanation (component formula, inputs, rule version) | P0 |
| PY-25 | Calculation performance: 500 employees under 2 minutes, run as background job with progress | P0 |

### B.7.6 Outputs
| ID | Requirement | Priority |
|---|---|---|
| PY-26 | **Payslips** (PDF, branded, YTD totals, leave balance, optionally password-protected with PAN/DOB), emailed and in ESS | P0 |
| PY-27 | **Bank transfer files**: generic NEFT/RTGS CSV and bank formats (HDFC, ICICI, SBI, Axis, Kotak) | P0 |
| PY-28 | **Accounting journal** export (Tally XML, Zoho Books, generic CSV) with cost-centre split | P1 |
| PY-29 | Salary register, bank advice, pay summary by department/cost centre, CTC report | P0 |
| PY-30 | Statutory files: PF ECR, ESI return, PT returns per state, LWF | P0 |
| PY-31 | **Form 16** Part B generation (Part A imported from TRACES), **Form 24Q** quarterly data, Form 12BA | P0 |
| PY-32 | Payroll lock prevents changes to inputs and employee salary data for that month | P0 |

### B.7.7 Payroll data model
- `pay_groups`: `id, legalEntityId, name, frequency, cutoffDay, payDay`
- `salary_components`: `id, code, name, type, calc{method, value, baseComponent, formula, slabs}, flags{taxable, exemptRule, pfWage, esiWage, ptWage, lwfWage, gratuityWage, bonusWage, proRata}, order, payslipVisible`
- `salary_structures`: `id, name, gradeIds[], components[{componentId, calc}]`
- `employee_salaries`: `id, employeeId, effectiveFrom, ctcAnnual, structureId, components[{componentId, monthlyAmount}], reason, source (JOIN|REVISION|APPRAISAL|CORRECTION), approvedBy`
- `statutory_rules`: Appendix 2
- `payroll_inputs`: `payGroupId, month, employeeId, type, componentId, amount/quantity, source, refId`
- `loans`: `id, employeeId, type, principal, interestRate, emi, startMonth, schedule[{month, principal, interest, status}], status`
- `payroll_runs`: `id, payGroupId, month, version, type (REGULAR|OFF_CYCLE|FNF), status, createdBy, approvedBy, finalisedAt, totals{gross, deductions, net, employerCost}, ruleVersions{}`
- `payroll_results`: `runId, employeeId, paidDays, lopDays, earnings[{componentId, amount, explanation}], deductions[], employerContributions[], gross, net, ytd{}, tax{regime, projectedIncome, taxableIncome, annualTax, monthlyTds}, statutory{pfWage, epf, eps, esiWage, esiEe, esiEr, pt, lwf}`
- `payslips`: `runId, employeeId, fileId, releasedAt`
- `fnf_settlements`: `employeeId, separationId, items[], netPayable, status, runId`

### B.7.8 F&F computation
Salary till last working day · leave encashment (as per policy and balance) · notice pay recovery or payout · gratuity (if eligible) · statutory bonus · pending reimbursements · loan/advance recovery · asset recovery deductions · TDS recomputation · F&F statement PDF. Must be paid within the time the Labour Codes require (verify; currently understood as 2 working days from separation) — the system tracks the due date and alerts.

### B.7.9 Payroll acceptance criteria
- For a test set of 50 employees covering PF ceiling, ESI eligibility, PT across 3 states, both tax regimes, LOP, mid-month joiner/leaver, arrears and a loan, results match a CA-verified spreadsheet to the rupee.
- A design-partner parallel run matches their existing payroll for 2 consecutive months.
- Changing a statutory rate with a future effective date does not change any finalised run.

---

## B.8 Tax declarations and proofs

| ID | Requirement | Priority |
|---|---|---|
| TX-01 | Regime choice window (new/old) at year start; default new regime | P0 |
| TX-02 | Investment declaration (80C, 80D, 80CCD(1B), HRA rent details with landlord PAN above threshold, home loan interest, LTA, others) — sections configurable per year | P0 |
| TX-03 | Proof submission window with uploads; HR verification (accept/partial/reject with reason) | P0 |
| TX-04 | Previous employer income and TDS (Form 12B) | P0 |
| TX-05 | Tax projection screen for employees comparing both regimes | P1 |
| TX-06 | Locks: declarations locked after cut-off; post-verification amounts used for Jan–Mar TDS | P0 |

Data: `tax_declarations{employeeId, fy, regime, items[{section, subType, declared, proofFiles[], approved, status}], previousEmployer{}, status}`.

---

## B.9 Expense and travel claims

| ID | Requirement | Priority |
|---|---|---|
| EX-01 | Expense categories (travel, food, local conveyance, mobile, internet, fuel, hotel) with limits per grade/city tier | P0 |
| EX-02 | Claim with multiple line items, receipt photo upload, GST details | P0 |
| EX-03 | Mileage claims (km × rate per vehicle type) | P1 |
| EX-04 | Travel requests with advance; settlement of advance against claims | P1 |
| EX-05 | Approval via workflow (manager → finance above threshold) | P0 |
| EX-06 | Payout through payroll (taxable/non-taxable treatment) or separate bank file | P0 |
| EX-07 | Policy violations flagged (over limit, duplicate receipt, weekend claim) | P1 |
| EX-08 | Receipt OCR to pre-fill amount/date/vendor | P2 |

Data: `expense_categories`, `expense_policies`, `expense_claims{employeeId, items[{categoryId, date, amount, gst, receiptFileId, notes}], total, status, workflowInstanceId, payout{mode, runId}}`.

---

## B.10 Employee and manager self-service (ESS / MSS)

| ID | Requirement | Priority |
|---|---|---|
| SS-01 | Employee home: check-in, leave balance, upcoming holidays, pending tasks, announcements, birthdays | P0 |
| SS-02 | My profile with change requests; my documents; my letters | P0 |
| SS-03 | Payslips, Form 16, tax declarations, reimbursements, loans | P0 |
| SS-04 | My reviews, KRAs, appraisal letters (existing) | P0 |
| SS-05 | Manager home: team today (in/late/absent/leave), approvals inbox, team calendar, reviews pending | P0 |
| SS-06 | Team profiles with permitted fields only | P0 |
| SS-07 | Requests catalogue (letters, certificates, asset, ID card) | P1 |

---

## B.11 Announcements, policies and engagement

| ID | Requirement | Priority |
|---|---|---|
| AN-01 | Announcements targeted by entity/location/department/grade, with schedule and expiry, pinned posts | P1 |
| AN-02 | Policy library with versions; **mandatory read-and-acknowledge** with tracking and reminders | P0 |
| AN-03 | Birthday and work-anniversary feed and wishes | P1 |
| AN-04 | Polls and pulse surveys (eNPS) | P2 |
| AN-05 | Kudos / recognition linked to company values (can feed performance reviews) | P2 |

---

## B.12 HR helpdesk

| ID | Requirement | Priority |
|---|---|---|
| HD-01 | Ticket categories (payroll, leave, attendance, IT, admin, policy) with owner teams | P1 |
| HD-02 | SLA per category and priority; escalation | P1 |
| HD-03 | Ticket conversation, internal notes, attachments, status, satisfaction rating | P1 |
| HD-04 | Canned responses and knowledge base articles | P2 |
| HD-05 | AI assistant suggests answers from policies before a ticket is raised (B.19) | P2 |

---

## B.13 Performance management (existing, enhance)

Keep the current KRA, review, PIP, appraisal, bell curve, 9-box and Sales achievement (formerly Sales Champs) features. Required changes:

| ID | Requirement | Priority |
|---|---|---|
| PF-01 | Make all performance collections tenant-scoped (Phase 0) | P0 |
| PF-02 | Switch authorisation to the permission model and managerId only (security fix) | P0 |
| PF-03 | Appraisal increments create salary revisions in payroll (B.7.2 PY-09) | P0 |
| PF-04 | Configurable review cycles per tenant (quarterly, half-yearly, annual) instead of fixed June/September cohorts | P1 |
| PF-05 | Goals/OKRs with check-ins in addition to KRAs | P1 |
| PF-06 | 360° feedback (peers, reportees) | P2 |
| PF-07 | Continuous feedback and 1:1 notes | P2 |
| PF-08 | Competency frameworks per grade | P2 |

---

## B.14 Recruitment / ATS

| ID | Requirement | Priority |
|---|---|---|
| RC-01 | Job requisition with approval (headcount and budget) | P2 |
| RC-02 | Job posts; careers page per tenant; share to LinkedIn/Naukri (manual links first) | P2 |
| RC-03 | Candidate database, resume upload and parsing | P2 |
| RC-04 | Pipeline stages per job (Kanban), interview scheduling with calendar invites, interviewer scorecards | P2 |
| RC-05 | Offer approval and offer letter → pre-joiner handoff to onboarding | P2 |
| RC-06 | Referral programme | P2 |
| RC-07 | Recruitment reports: time to hire, source effectiveness, funnel | P2 |

---

## B.15 Asset management

| ID | Requirement | Priority |
|---|---|---|
| AS-01 | Asset register (type, serial, purchase date, cost, warranty, status) | P2 |
| AS-02 | Allocation to employees with acknowledgement; return on exit linked to clearance | P2 |
| AS-03 | Asset requests through workflow | P2 |

## B.16 Training and certification

| ID | Requirement | Priority |
|---|---|---|
| TR-01 | Training calendar, nominations, attendance, feedback | P2 |
| TR-02 | Certification records with expiry reminders | P2 |
| TR-03 | Link training needs from performance reviews | P2 |

---

## B.17 Reports and analytics

| ID | Requirement | Priority |
|---|---|---|
| RP-01 | Standard report library per module (listed in each module) with filters and Excel/PDF/CSV export | P0 |
| RP-02 | Scheduled reports emailed to selected users | P1 |
| RP-03 | **Custom report builder**: pick entity, columns, filters, group by | P1 |
| RP-04 | Dashboards: headcount, attrition (voluntary/involuntary, regretted), absenteeism, overtime, payroll cost trend, performance distribution vs pay | P1 |
| RP-05 | Exports respect permissions and field-level protection; export actions are audited | P0 |

---

## B.18 Integrations and public API

| ID | Requirement | Priority |
|---|---|---|
| IN-01 | Public REST API (`/api/v1`) with API keys per tenant, scopes and rate limits; OpenAPI documentation | P1 |
| IN-02 | Webhooks for events (employee.created, leave.approved, payroll.finalised…) with signing secret and retries | P1 |
| IN-03 | Accounting: Tally (XML journal), Zoho Books | P1 |
| IN-04 | Slack and Microsoft Teams: notifications and approve/reject actions | P2 |
| IN-05 | Google Workspace / Microsoft 365: SSO, calendar for leaves and interviews, user provisioning | P1 |
| IN-06 | Biometric device connector (B.3 AT-07) | P1 |
| IN-07 | WhatsApp Business API provider (Gupshup/Interakt/Meta Cloud API) | P1 |

---

## B.19 AI features

| ID | Requirement | Priority |
|---|---|---|
| AI-01 | Performance narratives (exists) | P0 |
| AI-02 | **Policy assistant**: answers employee questions from the tenant's own policy documents with citations (retrieval over uploaded policies) | P2 |
| AI-03 | Review quality check: flags vague or biased manager comments before submission | P2 |
| AI-04 | Resume screening and job-description generator | P2 |
| AI-05 | Attrition risk signals (attendance changes, rating drops, tenure, pay position) for HR only | P2 |
| AI-06 | Natural-language report queries ("headcount by location last quarter") | P2 |

Rules: tenant data never used to train shared models; provider and data residency disclosed to customers; AI suggestions are always editable and logged.

---

## B.20 Mobile / PWA

| ID | Requirement | Priority |
|---|---|---|
| MB-01 | Installable PWA with app icon, splash, offline shell | P0 |
| MB-02 | Mobile-optimised: check-in, leave, approvals, payslips, announcements, claims with camera | P0 |
| MB-03 | Web push notifications | P1 |
| MB-04 | Native wrapper (Capacitor) for Play Store / App Store if customers require it; adds reliable background location for field staff | P2 |

---

## B.21 Platform administration and billing

| ID | Requirement | Priority |
|---|---|---|
| PA-01 | Platform admin console (separate login and role) to create, suspend and delete tenants, manage plans and modules | P0 |
| PA-02 | Self-serve trial signup with demo data option | P1 |
| PA-03 | Usage metering: active employees per month | P0 |
| PA-04 | Subscription billing with Razorpay (cards, UPI, NetBanking), GST invoices, plan upgrades/downgrades | P1 |
| PA-05 | Support access: time-limited, customer-approved impersonation with full audit | P1 |
| PA-06 | Feature flags per tenant | P0 |

---

# PART C — NON-FUNCTIONAL REQUIREMENTS

## C.1 Security

| ID | Requirement |
|---|---|
| SE-01 | TLS everywhere; HSTS; secure, HttpOnly, SameSite cookies for refresh tokens |
| SE-02 | Encryption at rest (Atlas default) plus **application-level field encryption** (AES-256-GCM, per-tenant data keys wrapped by a master key in a KMS/secret manager) for PAN, Aadhaar, bank account, salary history exports |
| SE-03 | OWASP ASVS Level 2 as the baseline; dependency scanning (npm audit / Dependabot) and secret scanning in CI |
| SE-04 | Rate limits per IP, per account and per tenant; `trust proxy` configured correctly |
| SE-05 | Input validation with Zod on every route (already the pattern); output encoding in the frontend |
| SE-06 | Least-privilege database users; separate credentials per environment |
| SE-07 | No secrets or credentials in the frontend bundle or repository; demo personas only in a demo tenant |
| SE-08 | Third-party penetration test before the first enterprise customer, then yearly |
| SE-09 | Security incident response runbook; customer notification process |
| SE-10 | Roadmap to ISO 27001 and SOC 2 Type II once revenue supports it |

## C.2 Privacy and the DPDP Act

Arisotech is a **Data Processor** for each customer (the Data Fiduciary) for employee data, and a Data Fiduciary for its own customer-contact data. Obligations and timelines under the DPDP Act 2023 and DPDP Rules must be confirmed with counsel.

| ID | Requirement |
|---|---|
| DP-01 | Data Processing Agreement template for customers |
| DP-02 | Privacy notice shown to employees on first login; record of notice and consent where consent is the basis |
| DP-03 | Purpose and minimisation: collect only fields configured as needed; selfie and GPS retention limits |
| DP-04 | Employee rights: access (download my data), correction (profile change requests), grievance contact |
| DP-05 | Retention schedules per data category; automatic deletion/anonymisation after retention (payroll records kept as law requires) |
| DP-06 | Breach detection, logging and notification workflow |
| DP-07 | Data residency: primary data in India (Atlas Mumbai region) |
| DP-08 | Sub-processor list published (hosting, email, WhatsApp, AI provider) |

## C.3 Performance and scale

| Metric | Target |
|---|---|
| API p95 latency (reads) | < 300 ms |
| API p95 latency (writes) | < 500 ms |
| Page load (LCP) on 4G mobile | < 2.5 s |
| Payroll for 500 employees | < 2 minutes (background job) |
| Supported size per tenant | 5,000 employees without redesign |
| Platform size (year 1) | 200 tenants, 50,000 employees |

All list APIs paginated (cursor or page/limit, max 200); every query index-backed with `tenantId` as the first key.

## C.4 Availability, backup and recovery

| Item | Target |
|---|---|
| Availability | 99.5% monthly (year 1), 99.9% later |
| Backups | Atlas continuous backup with point-in-time restore; daily logical export to separate object storage |
| RPO / RTO | 1 hour / 4 hours |
| Restore drill | Quarterly, documented |
| Status page | Public status page with incident history |

## C.5 Usability and accessibility
- WCAG 2.1 AA for core flows; keyboard navigation; colour contrast in light and dark themes (dark mode exists).
- Indian formats: ₹ with lakh/crore grouping (`en-IN`), DD-MM-YYYY by default, IST.
- English first; i18n framework from the start so Hindi and regional languages can be added.
- Empty states, inline validation, and calculation explanations ("why is my LOP 2 days?").

## C.6 Observability
Structured JSON logs with `tenantId`, `userId`, `requestId`; error tracking (Sentry); metrics (request rate, error rate, job durations, queue depth); uptime checks; alerting to on-call.

---

# PART D — ARCHITECTURE AND IMPLEMENTATION

## D.1 Target architecture

```
                ┌──────────────────────────┐
  Browser/PWA → │  React SPA (Vercel CDN)  │
                └────────────┬─────────────┘
                             │ HTTPS  /api/v1  (JWT: sub, tid, tv, type)
                ┌────────────▼─────────────┐
                │  Express API (Render)    │  auth → tenant context → permissions → route → service
                │  modular routers         │
                └──┬──────────┬─────────┬──┘
                   │          │         │
        ┌──────────▼──┐  ┌────▼─────┐  ┌▼───────────────────┐
        │ MongoDB     │  │ Object   │  │ Job worker          │  payroll runs, accruals, attendance
        │ Atlas (BOM) │  │ storage  │  │ (same codebase,     │  engine, reminders, emails, PDFs
        │             │  │ (R2/S3)  │  │  separate process)  │
        └─────────────┘  └──────────┘  └──┬──────────────────┘
                                          │
               Email (Resend) · WhatsApp provider · Gemini · Razorpay · bank/statutory file exports
```

Keep the **modular monolith**: one repository, one API service, one worker service built from the same code. Split services only when a module's scale clearly requires it.

## D.2 Backend code organisation

Move from flat `server/routes` + `server/services` to modules, gradually (new modules use the new layout; existing ones move when touched):

```
HRMS_backend/server/
  core/            db.ts, tenantContext.ts, permissions.ts, audit.ts, files.ts, workflow/, notifications/, rules/
  modules/
    employees/     routes.ts, service.ts, schemas.ts, types.ts, tests/
    leave/         routes.ts, service.ts, accrual.ts, schemas.ts, tests/
    attendance/    routes.ts, service.ts, dayEngine.ts, schemas.ts, tests/
    payroll/       routes.ts, run.ts, components.ts, statutory/{pf,esi,pt,lwf,tds,gratuity}.ts, outputs/, tests/
    performance/   (existing review/appraisal/kra/pip code)
    ...
  jobs/            worker.ts, scheduler definitions per module
```

Conventions: routes are thin (validate → call service → shape response); services hold business logic and are unit-tested; all money in **integer paise**; all dates stored as ISO strings in UTC with business dates (`YYYY-MM-DD`) for attendance/leave/payroll.

## D.3 Multi-tenancy implementation (Phase 0 core task)

**1. Tenant context with AsyncLocalStorage**
```ts
// server/core/tenantContext.ts
import { AsyncLocalStorage } from 'node:async_hooks';
type Ctx = { tenantId: string; userId?: string; requestId: string };
export const als = new AsyncLocalStorage<Ctx>();
export const currentTenantId = () => {
  const id = als.getStore()?.tenantId;
  if (!id) throw new Error('No tenant in context'); // fail closed
  return id;
};
```
`authenticateToken` reads `tid` from the verified JWT and runs the rest of the request inside `als.run({ tenantId, userId, requestId }, next)`.

**2. Scoped collections** — change `getDbCollection()` so existing call sites become tenant-safe without editing all ~420 of them:
```ts
export function getDbCollection(name) {
  const raw = rawCollection(name);
  const scope = (f = {}) => ({ ...f, tenantId: currentTenantId() });
  return {
    find: (f, o) => raw.find(scope(f), o),
    findOne: (f, o) => raw.findOne(scope(f), o),
    countDocuments: (f, o) => raw.countDocuments(scope(f), o),
    updateOne: (f, u, o) => raw.updateOne(scope(f), u, o),
    updateMany: (f, u, o) => raw.updateMany(scope(f), u, o),
    deleteOne: (f, o) => raw.deleteOne(scope(f), o),
    deleteMany: (f, o) => raw.deleteMany(scope(f), o),
    insertOne: (d, o) => raw.insertOne({ ...d, tenantId: currentTenantId() }, o),
    insertMany: (ds, o) => raw.insertMany(ds.map(d => ({ ...d, tenantId: currentTenantId() })), o),
    aggregate: (p, o) => raw.aggregate([{ $match: { tenantId: currentTenantId() } }, ...p], o),
    // upserts also set tenantId via $setOnInsert
  };
}
export const getGlobalCollection = rawCollection; // platform-admin only, lint-restricted
```
**3. Indexes:** every unique index becomes compound with `tenantId` first (`{tenantId:1, employeeCode:1}`, `{tenantId:1, email:1}`, `{tenantId:1, employeeId:1, reviewPeriodId:1}`).

**4. Jobs:** scheduler loops over active tenants and runs each job inside `als.run({ tenantId })`.

**5. Migration:** script creates tenant #1 (the current data), backfills `tenantId` on all documents, drops and recreates indexes; run on a copy first.

**6. Tests:** an isolation suite creates tenants A and B with identical data and calls every API route as A, asserting no B data is returned or modified. Runs in CI on every push; a new route without coverage fails a route-coverage check.

**7. Lint rule:** forbid importing `getGlobalCollection` outside `server/platform/`.

## D.4 Authentication and permissions implementation
- JWT access token (15 min): `{ sub, tid, tv (tokenVersion), type: 'access', roles }`; refresh token (7–30 days) rotated on use, stored hashed, in an HttpOnly cookie.
- `requirePermission('leave.approve', { scope: 'DIRECT_REPORTS' })` middleware resolves the user's effective permissions (cached per user, invalidated on role change) and attaches a **scope filter** that services add to queries.
- Response serializers strip protected fields based on permissions (`serializeEmployee(emp, perms)`), so field protection is in one place.
- 2FA with `otplib`; secrets encrypted; recovery codes hashed.

## D.5 Workflow engine implementation
- `workflow/engine.ts`: `start(requestType, requestId, requester, context)` picks the active definition, evaluates step conditions against `context` (amount, days, department), resolves approvers (manager from hierarchy, role holders, specific users), creates the instance and notifies.
- `act(instanceId, actor, action, comment)` validates the actor, advances or closes, and emits domain events (`leave.request.approved`) that modules subscribe to.
- SLA job escalates overdue steps hourly.

## D.6 Rules and statutory configuration
- `statutory_rules` collection keyed by `type` (`PF`, `ESI`, `PT`, `LWF`, `TDS_REGIME_NEW`, `TDS_REGIME_OLD`, `GRATUITY`, `BONUS`, `MIN_WAGE`) + optional `state` + `effectiveFrom`.
- Lookup: `getRule(type, { state, onDate })` returns the latest version with `effectiveFrom ≤ onDate`.
- Arisotech maintains **global defaults**; tenants can override where law allows (for example PF on actual wages).
- Every change goes through a reviewed data migration plus golden-file regression tests (expected payroll outputs for a fixed dataset).

## D.7 Engines (core algorithms)

**Leave accrual** (daily job per tenant): for each employee and entitlement, compute accrual due for the period based on frequency and pro-rata from joining/exit dates; write `ACCRUAL` ledger rows idempotently (unique key: employee + leave type + period).

**Attendance day engine** (runs on punch, on request approval, and nightly): for each employee-day, resolve shift and weekly-off/holiday, collect punches in the shift window, compute worked/late/early/OT minutes, apply leave and approved requests, then apply policy rules to set the status. Idempotent; recomputation allowed until the period is locked.

**Payroll calculation** (per employee, pure function):
1. Load effective salary for the month (split if revised mid-month).
2. Paid days = calendar days (or fixed 30/26 per policy) − LOP.
3. Compute each component in dependency order (topological sort of formulas), pro-rate where flagged.
4. Add variable inputs, arrears, reimbursements; subtract loan EMIs and recoveries.
5. Compute statutory wages and contributions (PF, ESI, PT, LWF) from rules.
6. Project annual taxable income, apply regime, compute monthly TDS.
7. Net pay = earnings − deductions; employer cost = gross + employer contributions.
8. Return result with per-line explanations and rule versions.

The run job loads data in bulk, calls the pure function per employee, writes `payroll_results`, and reports progress. Pure functions make golden-file testing easy.

## D.8 Background jobs
Replace in-process `node-cron` with a **persistent job queue** so jobs survive restarts and can run in a separate worker process. Use a Mongo-backed queue (for example Agenda) to avoid new infrastructure; move to BullMQ + Redis if volume requires. Jobs: accruals, attendance recompute, reminders, document expiry, escalations, payroll runs, PDF generation, bulk imports, report generation, email/WhatsApp sending.

## D.9 Files and PDFs
- Upload: client requests a signed upload URL → uploads directly to R2/S3 → server confirms and records in `files`.
- PDFs: HTML templates (Handlebars) → Playwright/Chromium in the worker → stored in object storage. Payslips generated in bulk after finalisation.

## D.10 Frontend
- Keep React + Vite + Tailwind. Introduce **TanStack Query** for server state and **React Router** route modules per feature (`/leave`, `/attendance`, `/payroll`…), lazily loaded.
- Feature folders: `src/features/<module>/{pages, components, api.ts, hooks.ts}`; shared UI kit in `src/components/ui` (exists).
- Forms with React Hook Form + Zod (share schemas with backend through a `shared/` package later).
- PWA: `vite-plugin-pwa`, offline shell, push subscription, camera and geolocation for check-in.
- Permission-aware UI: navigation and actions driven by the permission list from `/auth/me`.

## D.11 API conventions
- Versioned base path `/api/v1`; JSON; consistent error shape `{ error: { code, message, details } }`.
- Pagination `?page=&limit=` (max 200) or cursor; filtering and sorting parameters documented in OpenAPI.
- Idempotency keys for payroll finalise, bank file generation and payments.
- All write endpoints audited.

## D.12 Environments, CI/CD and hosting

| Environment | Purpose | Hosting |
|---|---|---|
| Local | Development | Docker Compose with MongoDB |
| Staging | QA, demos of new features | Render + Vercel preview, separate Atlas cluster |
| Demo | Sales demo tenant with Indian sample data (`demo-data/`) | Production platform, isolated tenant |
| Production | Customers | Render paid instances (API + worker), Vercel, Atlas M10+ in Mumbai |

CI on every push (GitHub Actions): typecheck, lint, unit tests, tenant-isolation tests, build. Deploy to staging on merge to `main`; production deploys tagged and manual, with database migrations run as a release step. Move API hosting to an India region (for example AWS Mumbai) when customers require data residency for compute as well.

## D.13 Testing strategy

| Layer | Tool | Focus |
|---|---|---|
| Unit | Vitest | Engines: leave accrual, attendance rules, payroll components, statutory, TDS |
| Golden files | Vitest | Payroll outputs for fixed datasets vs CA-verified expected results |
| Integration | Vitest + MongoDB memory server | Routes, permissions, tenant isolation |
| End-to-end | Playwright | Critical flows: login+2FA, leave apply/approve, check-in, payroll run, payslip download |
| Load | k6 | Check-in peak (9–10 am), payroll run, reports |

Definition of Done: code reviewed, tests added, isolation tests pass, permissions applied, audit logged, API documented, UI works on mobile width, release notes written.

---

# PART E — DELIVERY PLAN

## E.1 Team

| Role | Phase 0–1 | Phase 2+ |
|---|---|---|
| Full-stack developers | 2 | 3 |
| Product/QA (part-time) | 1 | 1 |
| UI/UX designer (part-time) | 0.5 | 0.5 |
| Payroll & compliance consultant (CA) | as needed | 0.5 |
| Implementation/customer success | — | 1 (from first customers) |

Estimates below assume the Phase 0–1 team. A solo developer should roughly double the durations.

## E.2 Phases

| Phase | Theme | Sprints | Dates (2-week sprints) | Exit criteria |
|---|---|---|---|---|
| **0** | Foundations | S1–S3 | 30 Nov 2026 – 8 Jan 2027 | Multi-tenant in production, security findings closed, permissions and salary protection, 2FA, backups, CI |
| **1** | Core HR → **first sale** | S4–S9 | 11 Jan – 2 Apr 2027 | Employee 360, leave, attendance, letters, onboarding/offboarding, org chart, PWA, payroll export; 3 design partners live |
| **2** | Payroll | S10–S16 | 5 Apr – 9 Jul 2027 | Payroll with statutory outputs; 2 matched parallel runs |
| **3** | Self-service and engagement | S17–S20 | 12 Jul – 3 Sep 2027 | Tax declarations, claims, ESS/MSS, WhatsApp, policies, helpdesk, multi-entity |
| **4** | Differentiators | S21 onward | from 6 Sep 2027 | ATS, analytics builder, integrations, AI, SSO, billing self-serve |

## E.3 Sprint-by-sprint schedule

| Sprint | Starts | Goals |
|---|---|---|
| **S1** | 30 Nov 2026 | Tenant model and context; scoped `getDbCollection`; migration script for existing data; tenant isolation test harness; security fixes (role escalation, manager match, token version, trust proxy) |
| **S2** | 14 Dec 2026 | Login by subdomain/company code; platform admin console (create/suspend tenant); permission model, role templates, data scopes; field-level salary protection |
| **S3** | 28 Dec 2026 | 2FA, password reset, account lockout; audit diff; object storage for files; persistent job queue + worker; CI pipeline; staging environment; backups and restore drill |
| **S4** | 11 Jan 2027 | Employee 360: extended profile, statutory and bank (encrypted), family/nominees, job history with effective dates |
| **S5** | 25 Jan 2027 | Documents with expiry reminders; profile change requests; workflow engine v1 + unified approvals inbox; org chart |
| **S6** | 8 Feb 2027 | Leave: types, policies, holiday calendars, apply/approve, ledger, balances |
| **S7** | 22 Feb 2027 | Leave: accrual engine, comp-off, sandwich rule, year-end processing, reports; Attendance: shifts, weekly-offs, policies |
| **S8** | 8 Mar 2027 | Attendance: web/PWA check-in with geo-fence and selfie, day engine, regularisation/OD/WFH, team board, device CSV import |
| **S9** | 22 Mar 2027 | Attendance lock and reports; letters engine and templates; onboarding checklists and pre-joining portal; offboarding and clearance; payroll input export (Tally/Zoho/greytHR formats); **Phase 1 release** |
| **S10** | 5 Apr 2027 | Payroll foundations: pay groups, components, structures, CTC calculator, employee salary assignment, appraisal → revision link |
| **S11** | 19 Apr 2027 | Statutory rules store; PF and ESI calculations; PT and LWF slabs; golden-file test harness |
| **S12** | 3 May 2027 | TDS engine (both regimes), projections, HRA exemption, previous employer income |
| **S13** | 17 May 2027 | Payroll run pipeline (draft → finalise), validations, variance report, maker-checker, explanations |
| **S14** | 31 May 2027 | Payslips (PDF, email, ESS), bank files, salary register, loans and advances, arrears |
| **S15** | 14 Jun 2027 | Statutory files (ECR, ESI, PT), journal export, off-cycle runs, F&F settlement |
| **S16** | 28 Jun 2027 | Form 16 Part B / 24Q data; parallel runs with design partners; fixes; **Phase 2 release** |
| **S17** | 12 Jul 2027 | Tax declarations and proofs; ESS/MSS home pages |
| **S18** | 26 Jul 2027 | Expense and travel claims with payout via payroll; WhatsApp notifications |
| **S19** | 9 Aug 2027 | Policies with acknowledgement, announcements, birthdays/anniversaries; helpdesk v1 |
| **S20** | 23 Aug 2027 | Multi-entity support across payroll and reports; scheduled reports; **Phase 3 release** |
| **S21+** | 6 Sep 2027 | ATS, custom report builder and analytics, Tally/Zoho integrations, public API and webhooks, SSO, Razorpay billing, AI policy assistant |

Each sprint ends with a demo to design partners and a staging release. Production releases at phase ends and for urgent fixes.

## E.4 Release process
1. Feature flags per tenant for new modules (enable for design partners first).
2. Release checklist: migrations tested on a production copy, isolation tests green, rollback plan, release notes, support briefed.
3. Payroll releases are frozen during the last 5 days of each month and the first 3 days of the next.

## E.5 Customer implementation playbook (2–3 weeks per customer)
1. Kick-off; collect company settings, entities, locations, policies.
2. Import employees, salary structures, leave opening balances (templates in the bulk module).
3. Configure leave, attendance, workflows, roles; train HR admins.
4. Pilot one department for a week; then company-wide launch with employee onboarding emails.
5. Payroll: two parallel runs against the current system before switching.

---

# PART F — BUSINESS PLAN

## F.1 Packaging and pricing (indicative, validate against competitors)

| Plan | Includes | Price per employee per month |
|---|---|---|
| **Core HR** | Employee 360, leave, attendance, documents, letters, org chart, ESS, onboarding/offboarding | ₹40–60 |
| **Core + Performance** | Core HR + KRAs, reviews, appraisals, PIP, 9-box, bell curve | ₹80–110 |
| **Complete** | Core + Performance + Payroll + tax declarations + claims + helpdesk | ₹130–180 |
| **Add-ons** | ATS, advanced analytics, WhatsApp, SSO, biometric connector | ₹10–30 each, or flat |

Minimum billing of 25–50 employees; annual prepay discount 10–15%; one-time implementation fee ₹25,000–₹1,00,000 depending on size and payroll migration. Prices exclude GST.

## F.2 Go-to-market
1. **Design partners (from Phase 1):** 3–5 companies, free or 50% off for 6–12 months in return for weekly feedback, a parallel payroll run and a case study.
2. **Demo:** seeded demo tenant with Indian sample data; a 20-minute demo script leading with performance reviews, then leave/attendance on a phone, then payroll.
3. **Channels:** CA firms and HR consultants as resellers (20% recurring commission); LinkedIn content on fair performance reviews; comparison pages versus Keka, greytHR and Zoho People; Google Ads on "HRMS software India", "payroll software India".
4. **Sales motion:** inbound demo → 14-day trial with demo data → pilot → annual contract.
5. **Retention:** quarterly business reviews, in-product release notes, compliance update communications at each Union Budget.

## F.3 Success metrics

| Stage | Metric | Target |
|---|---|---|
| Phase 0 | Cross-tenant data leaks in tests | 0 |
| Phase 1 | Design partners live | 3–5 |
| Phase 1 | Monthly ESS adoption at partners | ≥ 70% of employees |
| Phase 1 | Average approval time (leave/regularisation) | < 24 hours |
| Phase 2 | Parallel payroll runs matched | 2 consecutive |
| Phase 2 | Payroll run time (500 employees) | < 2 minutes |
| Business | First paying customer | end of Phase 1 (Apr 2027) |
| Business | Paying customers | 10 within 6 months of payroll launch |
| Business | Monthly logo churn | < 2% |

## F.4 Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Payroll or tax calculation errors | Legal penalties, lost customers | Config-driven rules, CA review, golden-file tests, parallel runs, maker-checker |
| Cross-tenant data leak | Fatal for trust | Central enforcement, isolation tests in CI, pen test |
| Statutory changes (Labour Codes, budgets, state PT/LWF) | Wrong outputs | Effective-dated rules, yearly compliance calendar, consultant on retainer |
| Scope creep across many modules | Delays first sale | Phase gates, MVP per module, design-partner prioritisation |
| Small team bandwidth | Slow delivery | Sell after Phase 1; hire payroll domain expert for Phase 2 |
| Hosting limits (free tiers sleep, 512 MB) | Poor experience | Paid Render instances, Atlas M10 Mumbai before first paying customer |
| Competitors' feature depth | Hard to win | Lead with performance management and implementation support; target segments competitors under-serve |
| DPDP compliance gaps | Blocks deals, penalties | DPA, privacy notice, retention and rights features in Phase 0–1, legal review |

## F.5 Immediate next steps (next 2 weeks)
1. Decide tenant identification at login: **subdomain** (recommended) or company code.
2. Implement tenant context, scoped `getDbCollection()` and the backfill migration on a database copy.
3. Close the four security findings; remove the demo password from production builds.
4. Build the tenant-isolation test suite and CI pipeline.
5. Shortlist 5–10 companies for the design-partner programme and book conversations.
6. Engage a payroll CA for a scoping call on Phase 2 statutory rules.

---

# APPENDICES

## Appendix 1 — Permission catalogue (initial)

| Area | Permissions |
|---|---|
| Employees | `employee.read`, `employee.create`, `employee.update`, `employee.delete`, `employee.statutory.read`, `employee.statutory.reveal`, `employee.bank.read`, `employee.bank.update`, `employee.documents.manage`, `employee.import`, `employee.export` |
| Salary | `salary.read`, `salary.update`, `salary.revise.approve` |
| Leave | `leave.apply`, `leave.approve`, `leave.adjust`, `leave.policy.manage`, `leave.yearend.run` |
| Attendance | `attendance.punch`, `attendance.view`, `attendance.regularise.approve`, `attendance.policy.manage`, `attendance.import`, `attendance.lock` |
| Payroll | `payroll.configure`, `payroll.inputs.manage`, `payroll.run`, `payroll.approve`, `payroll.finalise`, `payroll.reports`, `payroll.bankfile` |
| Tax | `tax.declare`, `tax.verify` |
| Claims | `claims.submit`, `claims.approve`, `claims.pay` |
| Performance | `kra.manage`, `review.score`, `review.approve`, `appraisal.manage`, `appraisal.approve`, `pip.manage` |
| Letters | `letters.template.manage`, `letters.generate`, `letters.release` |
| Onboarding/Exit | `onboarding.manage`, `separation.approve`, `fnf.process` |
| Org | `org.settings.manage`, `org.masters.manage`, `roles.manage`, `workflow.manage` |
| Reports | `reports.view`, `reports.export`, `reports.builder` |
| Platform | `audit.view`, `integrations.manage`, `billing.manage` |

Each permission is granted with a data scope (`SELF`, `DIRECT_REPORTS`, `ALL_REPORTS`, `DEPARTMENT`, `LOCATION`, `LEGAL_ENTITY`, `ALL`).

## Appendix 2 — Statutory configuration schema (examples; verify values)

```json
{ "type": "PF", "effectiveFrom": "2026-04-01",
  "employeeRate": 12, "employerRate": 12, "epsRate": 8.33,
  "wageCeiling": 15000, "edliRate": 0.5, "adminChargeRate": 0.5,
  "allowContributionOnActual": true }

{ "type": "ESI", "effectiveFrom": "2026-04-01",
  "employeeRate": 0.75, "employerRate": 3.25,
  "wageThreshold": 21000, "wageThresholdDisabled": 25000,
  "contributionPeriods": [["04","09"],["10","03"]] }

{ "type": "PT", "state": "MH", "effectiveFrom": "2026-04-01",
  "slabs": [ {"from":0,"to":7500,"amount":0,"gender":"M"},
             {"from":7501,"to":10000,"amount":175},
             {"from":10001,"to":null,"amount":200,"februaryAmount":300} ],
  "annualCap": 2500 }

{ "type": "TDS_REGIME_NEW", "effectiveFrom": "2026-04-01",
  "standardDeduction": 75000,
  "slabs": [ {"from":0,"to":400000,"rate":0}, {"from":400001,"to":800000,"rate":5}, "…" ],
  "rebate": {"incomeUpTo": 1200000}, "cessRate": 4, "surcharge": [ "…" ] }
```

## Appendix 3 — Notification catalogue (initial)

| Event | Recipients | Channels |
|---|---|---|
| Leave applied / approved / rejected | Approver / employee | In-app, email, WhatsApp |
| Regularisation request / decision | Approver / employee | In-app, email |
| Missed punch | Employee | In-app, push |
| Approval pending > SLA | Approver, escalation | Email, WhatsApp |
| Document expiring | Employee, HR | Email, in-app |
| Probation ending | Manager, HR | Email |
| Payslip released | Employee | Email, WhatsApp, in-app |
| Tax declaration / proof window open/closing | Employees | Email, in-app |
| Policy published (acknowledgement required) | Target audience | Email, in-app |
| Review stage due / returned (existing) | Reviewer / employee | Email, in-app |
| Onboarding task assigned / overdue | Task owner | Email, in-app |
| Birthday / work anniversary | Team / company | In-app |
| Payroll run awaiting approval | Payroll approver | Email |

## Appendix 4 — Glossary

| Term | Meaning |
|---|---|
| CTC | Cost to company: total annual cost including employer contributions |
| LOP | Loss of pay: unpaid absence days deducted from salary |
| CL / SL / PL / EL | Casual / sick / privilege / earned leave |
| Comp-off | Compensatory off for working on a holiday or weekly-off |
| PF / EPF / EPS / EDLI / VPF | Provident fund components; VPF is voluntary extra contribution |
| UAN | Universal Account Number for PF |
| ESI / ESIC | Employees' State Insurance (Corporation) |
| PT | Professional Tax (state-level) |
| LWF | Labour Welfare Fund (state-level) |
| TDS | Tax deducted at source on salary |
| ECR | Electronic Challan cum Return for PF filing |
| Form 16 / 24Q / 12BA / 12B | Salary TDS certificate / quarterly TDS return / perquisites statement / previous employer income |
| F&F | Full and final settlement on exit |
| DPDP | Digital Personal Data Protection Act, 2023 (India) |
| KRA | Key result area |
| PIP | Performance improvement plan |
| ESS / MSS | Employee / manager self-service |
| Maker-checker | One person prepares, a different person approves |
