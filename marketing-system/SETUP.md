# Setup Guide — Complete Installation Steps

Follow this guide to set up the marketing system from scratch.

## Prerequisites

- Google account
- Basic familiarity with Google Sheets and Google Apps Script
- Text editor (for customizing phone numbers/emails)
- Web hosting for landing page (optional: Vercel, Netlify, or any static host)

---

## Part 1: Google Sheets Setup (30 minutes)

### Step 1.1: Create Central Property Sheet

This sheet tracks which properties are occupied and will sync with your leads system.

1. Go to [sheets.google.com](https://sheets.google.com)
2. Click **+ New** → **Spreadsheet**
3. Name it: `Planilha Central — Kitnets UFSC 2026`
4. **Note the URL** — copy the spreadsheet ID from the URL:
   ```
   https://docs.google.com/spreadsheets/d/[SPREADSHEET_ID]/edit
   ```
   Save this ID — you'll need it in Step 2.4.

### Step 1.2: Set up Dashboard Sheet in Central

In your new central sheet:

1. Create a sheet named **Dashboard Geral**
2. Add headers in row 5:
   ```
   A5: Imóvel
   B5: Unidades
   C5: Vagas
   D5: Total Unidades
   E5: Alugadas
   F5: Receita Mensal (R$)
   ```

3. Add property data starting at row 6:
   ```
   Row 6 (Pottker 25):
   A6: Pottker 25        D6: 21   E6: (occupied count)   F6: (monthly revenue)
   
   Row 7 (Milton Sullivan 142):
   A7: Milton Sullivan 142  D7: 6   E7: (occupied count)   F7: (monthly revenue)
   
   Row 8 (Ana Maria Nunes 214):
   A8: Ana Maria Nunes 214  D8: 5   E8: (occupied count)   F8: (monthly revenue)
   ```

4. Format column F as currency (Brazilian Real: R$)

### Step 1.3: Create Property Detail Sheets

For each property in your central sheet, create a separate sheet:

1. Right-click sheet tab → **Insert 1 sheet**
2. Name it exactly: `Pottker 25` (or your property name)
3. Add headers in row 5:
   ```
   A5: Nº        (Unit number)
   B5-H5: [Additional columns like Floor, Size, Price, etc.]
   I5: Status    (Occupancy status)
   J5: Locatário (Tenant name)
   K5: Início Contrato (Contract start date)
   ```

4. List all units starting at row 6:
   ```
   Row 6: 1  [other data]  I6: Vacante   J6: (empty)  K6: (empty)
   Row 7: 2  [other data]  I7: Vacante   J7: (empty)  K7: (empty)
   Row 8: 3  [other data]  I8: Alugada   J8: João Silva  K8: 2026-05-15
   ... (continue for all units)
   ```

5. Repeat for other properties: `Milton Sullivan 142`, `Ana Maria Nunes 214`

### Step 1.4: Import Leads Workbook

1. Download **central-leads-kitnets-ufsc.xlsx** from the marketing-system folder
2. Go to [sheets.google.com](https://sheets.google.com)
3. Click **+ New** → **File upload** → Select the .xlsx file
4. Click "Import spreadsheet"
5. Select **Create new spreadsheet**
6. Click **Import**
7. Rename the sheet to: `Central de Leads — Kitnets UFSC 2026`
8. **Note this spreadsheet's ID** — you'll use it for Apps Script

### Step 1.5: Update IMPORTRANGE in Painel Sheet

In your leads spreadsheet, go to the **Painel** sheet.

1. Find the KPI cells referencing IMPORTRANGE
2. Update the formula to match your central sheet ID:

   **Find this:** `=IMPORTRANGE("1wFoUCZaRPk2V1WbWyI0V4N5EC2yIZb2CNviOCPizaOQ",...)`
   
   **Replace with:** `=IMPORTRANGE("[YOUR_CENTRAL_SHEET_ID]",...)`

3. Examples:
   ```
   =IMPORTRANGE("[YOUR_ID]","Dashboard Geral!D9")    → Total vacancies
   =IMPORTRANGE("[YOUR_ID]","Dashboard Geral!F9")    → Total monthly revenue
   =IMPORTRANGE("[YOUR_ID]","Pottker 25!C6")         → Pottker 25 occupancy
   ```

4. When you see "Permission denied", click the error → **Permitir acesso** → Authorize
5. Formulas will populate with live data

---

## Part 2: Google Apps Script Setup (20 minutes)

### Step 2.1: Open Apps Script Editor

In your **leads spreadsheet** (not the central sheet):

1. Click **Extensions** → **Apps Script**
2. You'll see a blank editor with a default function
3. Delete all existing code
4. Keep the editor open for the next step

### Step 2.2: Paste Automation Code

1. Open **marketing-system/scripts/AppsScript.gs** in a text editor
2. Copy ALL the code (lines 1–174)
3. In Apps Script editor, paste it into the editor window
4. Click **Save**

### Step 2.3: Update Configuration Variables

At the top of AppsScript.gs, update these lines:

```javascript
Line 8:  OPERATOR_EMAIL = "celiotibes@gmail.com";
         // Change to YOUR email (who receives alerts)

Line 9:  PLANILHA_CENTRAL_ID = "1wFoUCZaRPk2V1WbWyI0V4N5EC2yIZb2CNviOCPizaOQ";
         // Change to your CENTRAL sheet ID (from Step 1.2)

Line 10: SLA_MINUTOS = 10;
         // Adjust if needed (minutes before SLA alert)
```

3. After editing, click **Save** again

### Step 2.4: Test the Script

1. Click the **Select function** dropdown (top center)
2. Choose **checkSLA**
3. Click the **▶ Run** button (play icon)
4. A dialog may appear: **"This app isn't verified. Click 'Advanced' and go to the app name to see privacy information."**
5. Click **Advanced** → **Go to Apps Script (unsafe)**
6. Click **Allow**
7. The script will run (should complete in a few seconds)
8. Check **Execution log** (View → Execution log) for any errors

---

## Part 3: Install Triggers (10 minutes)

Triggers run your automation on a schedule. **This must be done in the Apps Script UI.**

### Step 3.1: Open Triggers Menu

1. In Apps Script editor, click the clock icon **Acionadores** (Triggers) on left sidebar
2. Click **+ Adicionar acionador** (Add trigger)

### Step 3.2: Create Trigger 1 — SLA Monitoring

```
Function:           checkSLA
Deployment:         Head
Event source:       Time-driven
Type of time-based: Minute timer
Interval:           Every 5 minutes
Notifications:      At least once per day
```
Click **Save**

### Step 3.3: Create Trigger 2 — Follow-up Reminders

```
Function:           checkFollowUps
Deployment:         Head
Event source:       Time-driven
Type of time-based: Hour timer
Interval:           Every hour
Notifications:      At least once per day
```
Click **Save**

### Step 3.4: Create Trigger 3 — Review Requests

```
Function:           checkReviewRequests
Deployment:         Head
Event source:       Time-driven
Type of time-based: Day timer
Time of day:        Midnight
Notifications:      At least once per day
```
Click **Save**

### Step 3.5: Create Trigger 4 — Reverse Sync on Edit

```
Function:           onEditLeadsSheet
Deployment:         Head
Event source:       From spreadsheet
Event type:         On edit
Notifications:      At least once per day
```
Click **Save**

### Step 3.6: Verify All Triggers

After creating all four, you should see in the Triggers list:
- ✓ checkSLA (5 minutes)
- ✓ checkFollowUps (1 hour)
- ✓ checkReviewRequests (daily)
- ✓ onEditLeadsSheet (on edit)

All should show "Last run: (time) ago" with status green.

---

## Part 4: Landing Page Deployment (15 minutes)

### Option A: Self-Hosted

1. Open **marketing-system/landing/index.html** in a text editor
2. Find line with `https://wa.me/554140425242`
3. Replace **554140425242** with your actual WhatsApp number (country code + number, no spaces/dashes)
   Example: `https://wa.me/5548999887766` (for 48 99988-7766 in Brazil)
4. Save the file
5. Upload to your web server (via FTP, cPanel, etc.)
6. Visit the URL in a browser to test
7. Click "Enviar mensagem via WhatsApp" on each property card

### Option B: Deploy to Vercel (Free)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. From your project directory:
   ```bash
   cd marketing-system/landing
   vercel
   ```

3. Follow prompts (login to Vercel, link project, etc.)
4. Your landing page will be live at a Vercel URL
5. Share that URL as your public property showcase

### Option C: Deploy to Netlify (Free)

1. Go to [netlify.com](https://netlify.com)
2. Sign up / Log in
3. Drag & drop the **marketing-system/landing/** folder
4. Your site is live instantly at a Netlify URL

---

## Part 5: Dashboard Setup (Optional, 10 minutes)

The dashboard (`dashboard/painel.html`) is optional but recommended for visualizing metrics.

### Option A: View Locally

1. Open **marketing-system/dashboard/painel.html** in your browser
2. It will pull data from your Google Sheets in real-time (via IMPORTRANGE)
3. Refresh to see updated metrics

### Option B: Deploy Online

1. Use same steps as Landing Page (Vercel/Netlify)
2. Upload **dashboard/painel.html**
3. Share the URL with your team

---

## Part 6: Testing & Validation (15 minutes)

### Test 1: Manual Lead Entry

1. In your leads sheet (**Leads** tab), add a test lead:
   - Column A: (auto-generated ID)
   - Column B: Today's date
   - Column C: "João Silva" (test name)
   - Column D: +5548999887766 (your WhatsApp)
   - Column E: "Direto" (channel)
   - Column F: "Estudante" (audience)
   - Column G: "Pottker 25 - Kitnet 3"
   - Column H: "Novo" (status)

2. Wait 5 minutes
3. Check your email for SLA alert from celiotibes+apps@gmail.com
4. ✓ If alert received → SLA system working

### Test 2: Reverse Sync

1. In the same test lead row, change status (Column H) from "Novo" → "Fechado"
2. Check your email for sync notification
3. Go to central sheet → "Pottker 25" sheet
4. Find unit 3, verify:
   - Column I (Status) changed to "Alugada"
   - Column J (Tenant) shows "João Silva"
   - Column K (Date) shows today's date
5. ✓ If all updated → Reverse sync working

### Test 3: Dashboard Updates

1. Go to **Painel** sheet in leads spreadsheet
2. Verify numbers update after adding/changing leads
3. Open **dashboard/painel.html**
4. Verify KPIs match the Painel sheet
5. ✓ If numbers match → Dashboard sync working

---

## Troubleshooting

### Email alerts not arriving

**Check:** Triggers are enabled
1. Apps Script → Acionadores → All four should be enabled
2. Check **Execution log** for errors
3. Verify `OPERATOR_EMAIL` is correct (yours, not celiotibes@gmail.com)

**Check:** SLA_MINUTOS is correct
1. If set to 10 minutes, first alert fires 10 min after lead entry
2. Reduce to 1 for immediate testing: `var SLA_MINUTOS = 1;`

### Reverse sync not working

**Check:** Unit identification
1. Format must match: "Property Name - Kitnet #"
2. Example: "Pottker 25 - Kitnet 6" (not "Pottker 25 kitnet 6")
3. Check central sheet has that exact unit number in column A

**Check:** Status permission
1. Unit must be "Vacante" to sync
2. If status is "Alugada" already, can't sync (prevents overwrite)

### IMPORTRANGE showing #REF! error

**Check:** Central sheet ID
1. Verify PLANILHA_CENTRAL_ID is correct
2. Verify the sheet name exists (e.g., "Dashboard Geral")

**Check:** Authorization
1. Click the error cell
2. Click "Permitir acesso" (Allow access)
3. Grant permission

### Dashboard not updating

**Check:** IMPORTRANGE authorization (same as above)
**Check:** Data is being entered correctly in Leads sheet

---

## Next Steps

1. ✓ Invite team members to edit the spreadsheet (Share button → Add people)
2. ✓ Customize email templates in AppsScript.gs (lines 39–41, 68–72, 94–98)
3. ✓ Set up payment integration with Stripe if needed
4. ✓ Add Google Analytics to landing page for traffic tracking
5. ✓ Schedule weekly review meetings using dashboard metrics

---

**Questions?** See README.md for additional reference documentation.
