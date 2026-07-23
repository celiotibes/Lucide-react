# Marketing & Lead Management System — Kitnets UFSC

A complete marketing automation and lead management system for student housing rentals near UFSC (Universidade Federal de Santa Catarina) in Florianópolis, Brazil.

## 🎯 Overview

This system automates:
- **Lead capture & tracking** through a complete sales funnel (Novo → Visitou → Fechado)
- **SLA monitoring** with automated alerts when leads go 10+ minutes without response
- **Marketing analytics** by channel (social, referral, direct, paid ads) with CPL and CAC calculation
- **Property occupancy dashboard** with live sync to central property data
- **Reverse synchronization** from closed leads back to property inventory status
- **Follow-up workflows** with scheduled email reminders for visits and review requests

## 📁 Structure

```
marketing-system/
├── central-leads-kitnets-ufsc.xlsx    # Google Sheets workbook (export as .xlsx)
├── dashboard/painel.html               # Live KPI dashboard (glassmorphism UI)
├── landing/index.html                  # Property landing page with WhatsApp CTAs
├── scripts/AppsScript.gs              # Google Apps Script automation code
└── README.md                          # This file
```

## 🚀 Quick Start

### 1. Google Sheets Setup

1. Download **central-leads-kitnets-ufsc.xlsx** and import it into Google Sheets:
   - Go to [sheets.google.com](https://sheets.google.com)
   - New → Upload file → Select the .xlsx file → Convert to Google Sheets

2. Note the new sheet's ID from the URL (format: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/...`)
   - You'll need this ID later

3. Authorize IMPORTRANGE formulas:
   - Open the "Painel" (Dashboard) sheet
   - You'll see a prompt: "Permission denied — click to authorize"
   - Click and grant access
   - The formulas will populate with live occupancy data from your central property sheet

### 2. Google Apps Script Installation

1. In your Google Sheets workbook:
   - Click **Extensions** → **Apps Script**
   - Delete any existing code
   - Copy the entire contents of `scripts/AppsScript.gs`
   - Paste it into the editor
   - Click **Save**

2. Grant authorization:
   - Click **Run** → Select `checkSLA` from the dropdown
   - Click the play button icon
   - Authorize when prompted (uses your Google account to send emails)

3. Install triggers (one-time setup):
   - In Apps Script, click the clock icon **Acionadores** (Triggers) on the left sidebar
   - Click **+ Adicionar acionador** (Add Trigger) four times:
     1. Function: `checkSLA` → Type: Time-driven → Minute timer → Every 5 minutes
     2. Function: `checkFollowUps` → Type: Time-driven → Hour timer → Every hour
     3. Function: `checkReviewRequests` → Type: Time-driven → Day timer → Every day at midnight
     4. Function: `onEditLeadsSheet` → Type: Sheet → On edit

4. Verify configuration in AppsScript.gs:
   - Line 8: `OPERATOR_EMAIL` — should be your email address
   - Line 9: `PLANILHA_CENTRAL_ID` — update to your central property sheet ID
   - Line 10: `SLA_MINUTOS` — set to desired response time (default: 10 minutes)

### 3. Dashboard & Landing Page

#### Dashboard (`dashboard/painel.html`)
- Open in a web browser (or deploy to Vercel/Netlify)
- Shows real-time KPIs: total leads, conversion rate, cost per lead (CPL), channel performance
- Six sections: Overview, Channels, Sales Funnel, Weekly Targets, Trend Analysis, Lead Quality
- Bottom navigation for quick section jumps
- Syncs with your Google Sheets via IMPORTRANGE formulas (read-only)

#### Landing Page (`landing/index.html`)
- Three property cards (Pottker 25, Milton Sullivan 142, Ana Maria Nunes 214)
- WhatsApp contact CTAs pre-filled with property details
- Modern glassmorphism design with property images and features
- Deploy to Vercel, Netlify, or any static hosting

## 📊 How It Works

### Lead Flow

```
1. NOVO (New)
   → Enters system via landing page form or manual entry
   → SLA timer starts
   → If no response in 10 min → alert email sent to operator

2. VISITOU (Visited)
   → Status changed after property tour
   → Follow-up timer starts
   → At 24-48 hours → "closing" email reminder

3. FECHADO (Closed)
   → Lead converted to tenant
   → Triggers reverse sync to update central property sheet
   → Property status → "Alugada" (Rented)
   → Occupancy numbers update automatically
```

### Automated Emails

- **SLA Alerts** (every 5 minutes): Lead waiting 10+ min without response
  - Includes pre-filled WhatsApp link with tailored message
  
- **Follow-up Reminders** (hourly): Leads visited 24-48 hours ago ready for closing pitch
  
- **Review Requests** (daily): Tenants 15 days into contract — request Google/Airbnb reviews

### Sync & Reverse Sync

- **Dashboard → Google Sheets**: IMPORTRANGE formulas pull live occupancy from central property sheet
- **Lead Close → Central Sheet**: When status changes to "Fechado", automatically updates:
  - Property unit status → "Alugada" (Rented)
  - Tenant name in central sheet
  - Contract start date

## 🔧 Configuration

### Central Property Sheet Structure

Your central sheet (referenced by `PLANILHA_CENTRAL_ID`) should have:

**Dashboard Geral sheet** (rows 6–8 for properties):
- Column D: Units per property
- Column E: Vacant units
- Column F: Monthly rental revenue

**Property sheets** (one per property: "Pottker 25", "Milton Sullivan 142", "Ana Maria Nunes 214"):
- Column A: Unit number
- Column I: Status (Vacante / Alugada)
- Column J: Tenant name
- Column K: Contract start date

### Lead Sheet Columns

| Column | Name | Type | Notes |
|--------|------|------|-------|
| A | ID_Lead | Auto | Auto-incremented |
| B | Data_Entrada | DateTime | Lead capture time |
| C | Nome | Text | Prospect name |
| D | WhatsApp | Phone | Mobile with country code |
| E | Canal_Origem | Dropdown | social, referral, direct, paid |
| F | Público | Dropdown | Profissional / Estudante |
| G | Unidade_Interesse | Text | "Pottker 25 - Kitnet 6" format |
| H | Status_Funil | Dropdown | Novo / Visitou / Fechado |
| I | Data_Ultimo_Contato | DateTime | Last touch |
| J | Minutos_p/_1a_Resposta | Formula | Calc: (NOW() - Data_Entrada) × 1440 |
| K | Alerta_SLA | Formula | 🔴 Red / 🟢 Green status |
| L | CPL | Formula | Investment ÷ Leads per channel |
| M | Próximo_Follow_Up | Formula | Auto-calculated date |
| N | Ação_Sugerida | Formula | Conditional action text |
| Q | Alerta_Enviado | Flag | "1" if SLA alert already sent |

## 📈 Metrics & Reporting

### Campaign Sheet

Track weekly spend by channel:
- **Leads**: Count from Leads sheet (COUNTIFS)
- **Closed**: Deals closed (COUNTIFS with Fechado filter)
- **CPL**: Cost Per Lead = Investment ÷ Leads
- **Conversion Rate**: Closed ÷ Leads

### Dashboard KPIs

- **Total Leads**: Sum of all entries
- **Conversion Rate**: % Closed ÷ Total
- **Cost Per Lead (CPL)**: Investment ÷ Leads by channel
- **Customer Acquisition Cost (CAC)**: Total marketing spend ÷ Closed deals
- **Channel Performance**: Lead source breakdown (pie chart)
- **Sales Funnel**: Stages (Novo → Visitou → Fechado)

## 🔐 Security & Privacy

- **Operator Email**: Only you receive SLA/follow-up alerts (change in AppsScript.gs line 8)
- **WhatsApp Link**: Uses wa.me API with pre-filled messages (no credentials exposed)
- **Spreadsheet Access**: IMPORTRANGE requires one-time authorization; no API keys stored
- **Lead Data**: Stored only in your Google Sheets (HTTPS encrypted in transit)

## ⚙️ Troubleshooting

### "Permission denied" on IMPORTRANGE formulas
→ Click the error in Painel sheet, authorize when prompted

### Apps Script not sending emails
→ Check triggers: **Acionadores** (Triggers) left sidebar → verify all four are enabled

### WhatsApp links not working
→ Update phone number in landing page (line: `https://wa.me/554140425242`)

### Dashboard shows #REF! errors
→ Verify `PLANILHA_CENTRAL_ID` in AppsScript.gs matches your central sheet URL

### Lead not reverse-synced when closed
→ Check "Unidade_Interesse" format matches property sheets (e.g., "Pottker 25 - Kitnet 6")
→ Verify unit is marked "Vacante" before closing lead

## 📝 Customization

### Change SLA response time
File: `scripts/AppsScript.gs` → Line 10
```javascript
var SLA_MINUTOS = 10;  // Change to desired minutes
```

### Customize message templates
File: `scripts/AppsScript.gs` → Lines 39–41 (checkSLA function)
```javascript
var sugestao = publico === "Profissional"
  ? "Your custom professional message"
  : "Your custom student message";
```

### Add new properties
1. Create new sheet in central property sheet with property name
2. Add property name to abas array in AppsScript.gs line 78
3. Ensure columns match: A=Unit#, I=Status, J=Tenant, K=StartDate

### Modify dashboard layout
File: `dashboard/painel.html`
- CSS variables at top (colors, fonts, spacing)
- Grid layout sections around line 150 (`display: grid`)
- Add/remove KPI cards as needed

## 🚀 Deployment

### Dashboard & Landing Page
```bash
# Deploy to Vercel
npm install -g vercel
vercel

# Deploy to Netlify
npm install -g netlify-cli
netlify deploy --prod --dir=.
```

### Or self-host
- Place HTML files on any web server (Apache, Nginx, etc.)
- No backend required — pure HTML + CSS + JS
- IMPORTRANGE pulls data from Google Sheets in real-time

## 📞 Support

For issues or questions:
1. Check "Instruções" (Instructions) sheet in Google Sheets workbook
2. Review Apps Script execution logs: **Execution log** in Apps Script editor
3. Verify all configuration values match your setup

---

**Version**: 2.0 (Audited & Production-Ready)  
**Last Updated**: July 2026
